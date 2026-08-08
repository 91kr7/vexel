// Per-layer changeset computation (REQ-49, REQ-51): exports the image as a
// tarball to temporary disk, then reads each layer's content one at a time,
// honouring OCI whiteout markers (`.wh.<name>`, `.wh..wh..opq`) to report
// deletions and opaque directories rather than missing files. Results are
// cached through AnalysisCacheStore, keyed by the image's own content digest
// (its id already is one); progress is reported per phase/layer, and the
// whole computation is cancellable at any await point.
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { openImageSaveStream } from "../images/image-transfer-service.js";
import { lookup as lookupCache, insert as insertCache } from "../persistence/analysis-cache-store.js";
import { cacheDir } from "../persistence/local-store.js";
import { getImageLayerStack } from "./layer-metadata-service.js";
import { forEachTarEntry, indexTarFile, openEntryContentStream, readTarEntryAt, type TarEntryLocation } from "./tar-reader.js";

export interface LayerChangesetPath {
  path: string;
  status: "added" | "modified" | "deleted";
  sizeBytes?: number;
  sizeUnavailableReason?: string;
}

export interface LayerChangeset {
  layerIndex: number;
  diffId?: string;
  paths: LayerChangesetPath[];
}

export interface ImageChangesets {
  imageId: string;
  layers: LayerChangeset[];
}

export type ChangesetProgress = { phase: "exporting" } | { phase: "analyzing"; completedLayers: number; totalLayers: number };

export interface ChangesetHandlers {
  onProgress: (progress: ChangesetProgress) => void;
  onError: (message: string) => void;
  onEnd: (result: ImageChangesets) => void;
}

interface ManifestEntry {
  Config: string;
  Layers: string[];
}

export async function computeImageChangesets(imageId: string, handlers: ChangesetHandlers): Promise<() => void> {
  let cancelled = false;
  let destroyExportStream: (() => void) | undefined;

  const cached = lookupCache(imageId);
  if (cached) {
    readCachedResult(cached.fileName)
      .then((result) => {
        if (!cancelled) handlers.onEnd(result);
      })
      .catch((error: Error) => {
        if (!cancelled) handlers.onError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }

  void run();

  async function run(): Promise<void> {
    const workDir = join(tmpdir(), `vexel-layer-analysis-${randomUUID()}`);
    const exportPath = join(workDir, "export.tar");
    try {
      const stack = await getImageLayerStack(imageId);
      await mkdir(workDir, { recursive: true });

      const { response } = await openImageSaveStream([imageId]);
      destroyExportStream = () => response.destroy();
      if (cancelled) {
        response.destroy();
        return;
      }
      handlers.onProgress({ phase: "exporting" });
      await pipeline(response, createWriteStream(exportPath));
      if (cancelled) return;

      const index = await indexTarFile(exportPath);
      const manifestLocation = index.get("manifest.json");
      if (!manifestLocation) throw new Error("The exported tarball has no manifest.json entry");
      const manifest = await readManifest(exportPath, manifestLocation);

      const nonEmptyLayers = stack.layers.filter((layer) => !layer.emptyLayer);
      const knownPaths = new Set<string>();
      const layers: LayerChangeset[] = [];

      for (let i = 0; i < manifest.Layers.length; i += 1) {
        if (cancelled) return;
        const location = index.get(manifest.Layers[i]);
        const meta = nonEmptyLayers[i];
        const paths = location ? computeLayerChangesetPaths(await readLayerEntries(exportPath, location), knownPaths) : [];
        layers.push({ layerIndex: meta?.index ?? i, diffId: meta?.diffId, paths });
        handlers.onProgress({ phase: "analyzing", completedLayers: i + 1, totalLayers: manifest.Layers.length });
      }

      const result: ImageChangesets = { imageId, layers };
      const resultPath = join(workDir, "result.json");
      await writeFile(resultPath, JSON.stringify(result));
      await insertCache(imageId, resultPath);
      if (!cancelled) handlers.onEnd(result);
    } catch (error) {
      if (!cancelled) handlers.onError((error as Error).message);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  return () => {
    cancelled = true;
    destroyExportStream?.();
  };
}

async function readCachedResult(fileName: string): Promise<ImageChangesets> {
  const raw = await readFile(join(cacheDir(), fileName), "utf8");
  return JSON.parse(raw) as ImageChangesets;
}

async function readManifest(filePath: string, location: TarEntryLocation): Promise<ManifestEntry> {
  const buffer = await readTarEntryAt(filePath, location);
  const parsed = JSON.parse(buffer.toString("utf8")) as ManifestEntry[];
  const entry = parsed[0];
  if (!entry) throw new Error("The exported tarball's manifest.json is empty");
  return entry;
}

export interface LayerRawEntry {
  name: string;
  size: number;
  typeFlag: string;
}

/**
 * Reads one layer's own tar (nested inside the outer export tar, at a known
 * offset — decompressed on the fly if that content is itself gzipped) and
 * lists its raw entries in archive order. The nested reader fails loudly
 * (via `forEachTarEntry`'s header checksum check) if the bytes are neither a
 * valid tar nor gzip-compressed one, rather than emitting garbage entries.
 */
async function readLayerEntries(filePath: string, location: TarEntryLocation): Promise<LayerRawEntry[]> {
  const entries: LayerRawEntry[] = [];
  const nestedSource = await openEntryContentStream(filePath, location);

  await forEachTarEntry(nestedSource, async (entry, _readAll, skip) => {
    await skip();
    entries.push({ name: entry.name, size: entry.size, typeFlag: entry.typeFlag });
  });

  return entries;
}

/**
 * Pure computation (REQ-49): given one layer's raw tar entries in archive
 * order, derives the paths it alone added, modified or deleted, honouring
 * OCI whiteout markers. `knownPaths` carries the paths already present from
 * lower layers in, and is updated in place to reflect this layer's effect,
 * ready for the next layer's call.
 */
export function computeLayerChangesetPaths(entries: LayerRawEntry[], knownPaths: Set<string>): LayerChangesetPath[] {
  const results: LayerChangesetPath[] = [];

  for (const entry of entries) {
    if (entry.typeFlag === "x" || entry.typeFlag === "g" || entry.typeFlag === "K") continue;

    const normalized = entry.name.replace(/^\.\//, "").replace(/\/+$/, "");
    if (!normalized) continue;
    const segments = normalized.split("/");
    const base = segments[segments.length - 1];
    const dir = segments.slice(0, -1).join("/");

    if (base === ".wh..wh..opq") {
      const opaqueDir = dir || "/";
      results.push({ path: opaqueDir, status: "deleted", sizeUnavailableReason: "opaque directory whiteout: this layer replaces the directory's prior contents" });
      removePathAndChildren(knownPaths, opaqueDir);
      continue;
    }
    if (base.startsWith(".wh.")) {
      const deletedName = base.slice(".wh.".length);
      const deletedPath = dir ? `${dir}/${deletedName}` : deletedName;
      results.push({ path: deletedPath, status: "deleted", sizeUnavailableReason: "the layer deletes this path; its size is no longer recorded" });
      removePathAndChildren(knownPaths, deletedPath);
      continue;
    }

    const status: LayerChangesetPath["status"] = knownPaths.has(normalized) ? "modified" : "added";
    knownPaths.add(normalized);
    results.push({ path: normalized, status, sizeBytes: entry.typeFlag === "5" ? 0 : entry.size });
  }

  return results;
}

function removePathAndChildren(paths: Set<string>, target: string): void {
  const prefix = `${target}/`;
  for (const path of paths) {
    if (path === target || path.startsWith(prefix)) paths.delete(path);
  }
}
