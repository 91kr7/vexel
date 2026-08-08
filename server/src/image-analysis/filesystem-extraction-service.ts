// Runtime-independent filesystem extraction (REQ-52, REQ-53, REQ-54, REQ-55,
// REQ-56, REQ-113): a container is created from the image and never started —
// no process from the image is ever executed — its merged, post-union
// filesystem is exported and indexed into a flat entry list, and the
// container is removed whatever happens (success, error or cancellation).
// Identical for a shell-bearing image and a distroless/scratch one, since the
// export reads the daemon's own union mount rather than running anything.
//
// Results are cached through the analysis cache (REQ-113), under a key
// distinct from the changeset cache's plain image id so the two artifact
// kinds — computed by two different services for the same image — never
// overwrite one another in that single-artifact-per-key store.
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { getEngineClient } from "../connectivity/connection-status-service.js";
import { insert as insertCache, invalidate as invalidateCache, lookup as lookupCache } from "../persistence/analysis-cache-store.js";
import { cacheDir } from "../persistence/local-store.js";
import { forEachTarEntry } from "./tar-reader.js";

/** Tags the intermediate container so no other surface of the application ever lists it or counts it (REQ-54). */
export const INTERNAL_CONTAINER_LABEL = "vexel.internal-container";

export type FilesystemEntryKind = "file" | "directory" | "symlink";

export interface FilesystemEntry {
  path: string;
  name: string;
  kind: FilesystemEntryKind;
  sizeBytes?: number;
}

export interface ImageFilesystem {
  imageId: string;
  entries: FilesystemEntry[];
}

export type FilesystemExtractionProgress = { phase: "creating" } | { phase: "copying" } | { phase: "indexing" };

export interface FilesystemExtractionResult {
  imageId: string;
  entryCount: number;
  fromCache: boolean;
}

export interface FilesystemExtractionHandlers {
  onProgress: (progress: FilesystemExtractionProgress) => void;
  onError: (message: string) => void;
  onEnd: (result: FilesystemExtractionResult) => void;
}

function cacheKey(imageId: string): string {
  return `filesystem:${imageId}`;
}

/**
 * Extracts `imageId`'s merged filesystem (REQ-52, REQ-53), or serves it from
 * the analysis cache when already computed for this image content (REQ-113).
 * `force` invalidates any cached entry first, always recomputing — the
 * re-extract action. Returns a cancel function; cancelling stops the run at
 * its next await point, no further handler fires, and the intermediate
 * container is still removed (REQ-54).
 */
export async function extractImageFilesystem(
  imageId: string,
  options: { force?: boolean },
  handlers: FilesystemExtractionHandlers,
): Promise<() => void> {
  let cancelled = false;
  let destroyExportStream: (() => void) | undefined;
  const key = cacheKey(imageId);

  if (options.force) await invalidateCache(key);

  const cached = lookupCache(key);
  if (cached) {
    readCachedResult(cached.fileName)
      .then((filesystem) => {
        if (!cancelled) handlers.onEnd({ imageId, entryCount: filesystem.entries.length, fromCache: true });
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
    const workDir = join(tmpdir(), `vexel-fs-extraction-${randomUUID()}`);
    let containerId: string | undefined;
    try {
      await mkdir(workDir, { recursive: true });

      handlers.onProgress({ phase: "creating" });
      containerId = await createIntermediateContainer(imageId);
      if (cancelled) return;

      handlers.onProgress({ phase: "copying" });
      const exportPath = join(workDir, "export.tar");
      const response = await getEngineClient().requestStream(`/containers/${containerId}/export`);
      destroyExportStream = () => response.destroy();
      if (cancelled) {
        response.destroy();
        return;
      }
      await pipeline(response, createWriteStream(exportPath));
      if (cancelled) return;

      handlers.onProgress({ phase: "indexing" });
      const entries = await readFilesystemEntries(exportPath);
      if (cancelled) return;

      const filesystem: ImageFilesystem = { imageId, entries };
      const resultPath = join(workDir, "result.json");
      await writeFile(resultPath, JSON.stringify(filesystem));
      await insertCache(key, resultPath);
      if (!cancelled) handlers.onEnd({ imageId, entryCount: entries.length, fromCache: false });
    } catch (error) {
      if (!cancelled) handlers.onError((error as Error).message);
    } finally {
      await rm(workDir, { recursive: true, force: true });
      if (containerId) await removeIntermediateContainer(containerId);
    }
  }

  return () => {
    cancelled = true;
    destroyExportStream?.();
  };
}

/**
 * Direct children of `parentPath` (default the root) from a previously
 * extracted, still-cached filesystem (REQ-52) — designed for lazy expansion:
 * only one directory level is read per call. `undefined` when this image has
 * no cached extraction yet (the caller must extract first).
 */
export async function listImageFilesystemChildren(imageId: string, parentPath?: string): Promise<FilesystemEntry[] | undefined> {
  const cached = lookupCache(cacheKey(imageId));
  if (!cached) return undefined;
  const filesystem = await readCachedResult(cached.fileName);
  const normalizedParent = normalizePath(parentPath);
  return filesystem.entries.filter((entry) => parentOf(entry.path) === normalizedParent);
}

/** Removes every intermediate extraction container left behind by an interrupted run (REQ-54, REQ-57); called once at server startup. */
export async function sweepAbandonedExtractionContainers(): Promise<void> {
  const filters = encodeURIComponent(JSON.stringify({ label: [`${INTERNAL_CONTAINER_LABEL}=true`] }));
  const response = await getEngineClient().request(`/containers/json?all=true&filters=${filters}`);
  const containers = JSON.parse(response.body) as { Id: string }[];
  await Promise.all(containers.map((container) => removeIntermediateContainer(container.Id)));
}

/**
 * A syntactically valid entrypoint that satisfies the Engine API's own
 * "no command specified" creation check for an image that declares neither
 * `Cmd` nor `Entrypoint` (the literal `scratch`/distroless case, REQ-52) —
 * never a real path, and never executed, since the container this becomes
 * `Path` for is never started (REQ-53). It changes nothing about what is
 * extracted: the filesystem export reads the image's own content, not the
 * container's runtime config.
 */
const NEVER_EXECUTED_PLACEHOLDER_ENTRYPOINT = ["/.vexel-filesystem-extraction-placeholder"];

/** Creates a container from `imageId` without ever starting it (REQ-53): the daemon only registers its config, no process runs. */
async function createIntermediateContainer(imageId: string): Promise<string> {
  const response = await getEngineClient().request("/containers/create", {
    method: "POST",
    body: JSON.stringify({
      Image: imageId,
      Entrypoint: NEVER_EXECUTED_PLACEHOLDER_ENTRYPOINT,
      Labels: { [INTERNAL_CONTAINER_LABEL]: "true" },
    }),
  });
  const created = JSON.parse(response.body) as { Id: string };
  return created.Id;
}

async function removeIntermediateContainer(id: string): Promise<void> {
  await getEngineClient()
    .request(`/containers/${id}?force=true`, { method: "DELETE" })
    .catch(() => undefined);
}

async function readCachedResult(fileName: string): Promise<ImageFilesystem> {
  const raw = await readFile(join(cacheDir(), fileName), "utf8");
  return JSON.parse(raw) as ImageFilesystem;
}

function toEntryKind(typeFlag: string): FilesystemEntryKind {
  if (typeFlag === "5") return "directory";
  if (typeFlag === "2") return "symlink";
  return "file";
}

/** Reads the exported tarball once, entry by entry (never buffered whole), into a flat list (REQ-52). */
async function readFilesystemEntries(filePath: string): Promise<FilesystemEntry[]> {
  const entries: FilesystemEntry[] = [];
  await forEachTarEntry(createReadStream(filePath), async (entry, _readAll, skip) => {
    await skip();
    if (entry.typeFlag === "x" || entry.typeFlag === "g" || entry.typeFlag === "K" || entry.typeFlag === "L") return;
    const normalized = normalizePath(entry.name);
    if (!normalized) return;
    const kind = toEntryKind(entry.typeFlag);
    entries.push({ path: normalized, name: normalized.split("/").pop() ?? normalized, kind, sizeBytes: kind === "file" ? entry.size : undefined });
  });
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function normalizePath(path: string | undefined): string {
  return (path ?? "").replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}
