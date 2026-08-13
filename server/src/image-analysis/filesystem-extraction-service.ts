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
import { insert as insertCache, invalidate as invalidateCache, lookup as lookupCache, type AnalysisCacheEntry } from "../persistence/analysis-cache-store.js";
import { cacheDir } from "../persistence/local-store.js";
import { type ContainmentRefusal, resolveEntryPath, resolveSymlinkTarget } from "./filesystem-containment.js";
import { forEachTarEntry } from "./tar-reader.js";

/** Tags the intermediate container so no other surface of the application ever lists it or counts it (REQ-54). */
export const INTERNAL_CONTAINER_LABEL = "vexel.internal-container";

export type FilesystemEntryKind = "file" | "directory" | "symlink";

export interface FilesystemEntry {
  path: string;
  name: string;
  kind: FilesystemEntryKind;
  sizeBytes?: number;
  /** POSIX permission bits, e.g. `0o755` (REQ-58). */
  mode?: number;
  uid?: number;
  gid?: number;
  /** Modification time, milliseconds since epoch (REQ-58). */
  mtimeMs?: number;
  /** Target text of a symlink entry, resolved and validated against the tree, never a raw unchecked value (REQ-58, REQ-62). */
  linkTarget?: string;
}

export interface ImageFilesystem {
  imageId: string;
  entries: FilesystemEntry[];
  /** Tar entries excluded because their own name, or a symlink's target, attempted to leave the extracted tree (REQ-62). */
  refusals: ContainmentRefusal[];
}

export type FilesystemExtractionProgress = { phase: "creating" } | { phase: "copying" } | { phase: "indexing" };

export interface FilesystemExtractionResult {
  imageId: string;
  entryCount: number;
  fromCache: boolean;
  refusedCount: number;
}

export interface FilesystemExtractionHandlers {
  onProgress: (progress: FilesystemExtractionProgress) => void;
  onError: (message: string) => void;
  onEnd: (result: FilesystemExtractionResult) => void;
}

function cacheKey(imageId: string): string {
  return `filesystem:${imageId}`;
}

/** Distinct key for the raw exported tarball itself, kept so entry content can be read back later (REQ-59, REQ-61) without re-extracting. */
function archiveCacheKey(imageId: string): string {
  return `filesystem-archive:${imageId}`;
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

  if (options.force) {
    await invalidateCache(key);
    await invalidateCache(archiveCacheKey(imageId));
  }

  const cached = lookupCache(key);
  if (cached) {
    readCachedResult(cached.fileName)
      .then((filesystem) => {
        if (!cancelled) handlers.onEnd({ imageId, entryCount: filesystem.entries.length, fromCache: true, refusedCount: filesystem.refusals.length });
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
      const { entries, refusals } = await readFilesystemEntries(exportPath);
      if (cancelled) return;

      const filesystem: ImageFilesystem = { imageId, entries, refusals };
      const resultPath = join(workDir, "result.json");
      await writeFile(resultPath, JSON.stringify(filesystem));
      await insertCache(key, resultPath);
      // The raw tarball is kept too (REQ-59, REQ-61): entry content and
      // subtree archives are read from it later, without re-extracting.
      await insertCache(archiveCacheKey(imageId), exportPath);
      if (!cancelled) handlers.onEnd({ imageId, entryCount: entries.length, fromCache: false, refusedCount: refusals.length });
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
 * The summary of the result kept for `imageId`'s content, or `undefined` when
 * nothing usable is kept — a plain read, for the caller deciding whether an
 * extraction has to be offered at all.
 *
 * It looks the analysis cache up and nothing else: no daemon call, no
 * container, no extraction started, nothing written. Absence is an answer
 * rather than an error, including for an indexed artifact that can no longer
 * be read — that is "nothing kept" as surely as no entry at all, and the
 * caller offers the extraction with its cost instead of a dead end.
 */
export async function getKeptFilesystemExtraction(imageId: string): Promise<FilesystemExtractionResult | undefined> {
  const filesystem = await getExtractedFilesystem(imageId).catch(() => undefined);
  if (!filesystem) return undefined;
  // `fromCache` by construction: what is being reported is a result that already exists.
  return { imageId, entryCount: filesystem.entries.length, fromCache: true, refusedCount: filesystem.refusals.length };
}

/**
 * Direct children of `parentPath` (default the root) from a previously
 * extracted, still-cached filesystem (REQ-52) — designed for lazy expansion:
 * only one directory level is read per call. `undefined` when this image has
 * no cached extraction yet (the caller must extract first).
 */
export async function listImageFilesystemChildren(imageId: string, parentPath?: string): Promise<FilesystemEntry[] | undefined> {
  const filesystem = await getExtractedFilesystem(imageId);
  if (!filesystem) return undefined;
  const normalizedParent = normalizePath(parentPath);
  return filesystem.entries.filter((entry) => parentOf(entry.path) === normalizedParent);
}

/**
 * The full previously extracted, still-cached filesystem for `imageId`
 * (REQ-58, REQ-59, REQ-60, REQ-61) — the shared read path for entry
 * metadata, content, search and export. `undefined` when this image has no
 * cached extraction yet.
 */
export async function getExtractedFilesystem(imageId: string): Promise<ImageFilesystem | undefined> {
  const cached = lookupCache(cacheKey(imageId));
  if (!cached) return undefined;
  return readCachedResult(cached.fileName);
}

/**
 * Path to this image's cached raw export tarball (REQ-59, REQ-61), used to
 * read an entry's bytes back or build a subtree archive without
 * re-extracting. `undefined` when not cached (e.g. an extraction performed
 * before this cache was introduced) — the caller asks the operator to
 * re-extract.
 */
export function getExtractedArchivePath(imageId: string): string | undefined {
  const cached: AnalysisCacheEntry | undefined = lookupCache(archiveCacheKey(imageId));
  return cached ? join(cacheDir(), cached.fileName) : undefined;
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

// `v=true` is what makes the removal complete: the daemon attaches an anonymous
// volume to every `VOLUME` the image declares, and without it that volume
// outlives this container — one orphan per extraction of such an image (REQ-54).
async function removeIntermediateContainer(id: string): Promise<void> {
  await getEngineClient()
    .request(`/containers/${id}?force=true&v=true`, { method: "DELETE" })
    .catch(() => undefined);
}

async function readCachedResult(fileName: string): Promise<ImageFilesystem> {
  const raw = await readFile(join(cacheDir(), fileName), "utf8");
  const parsed = JSON.parse(raw) as ImageFilesystem;
  return { ...parsed, refusals: parsed.refusals ?? [] };
}

function toEntryKind(typeFlag: string): FilesystemEntryKind {
  if (typeFlag === "5") return "directory";
  if (typeFlag === "2") return "symlink";
  return "file";
}

/**
 * Reads the exported tarball once, entry by entry (never buffered whole),
 * into a flat list (REQ-52) carrying full POSIX metadata (REQ-58). Every
 * entry's own name, and a symlink's own target, is validated against the
 * tree before being kept; one that attempts to leave it is excluded and
 * reported instead of being indexed (REQ-62).
 */
async function readFilesystemEntries(filePath: string): Promise<{ entries: FilesystemEntry[]; refusals: ContainmentRefusal[] }> {
  const entries: FilesystemEntry[] = [];
  const refusals: ContainmentRefusal[] = [];
  await forEachTarEntry(createReadStream(filePath), async (entry, _readAll, skip) => {
    await skip();
    if (entry.typeFlag === "x" || entry.typeFlag === "g" || entry.typeFlag === "K" || entry.typeFlag === "L") return;

    const resolvedPath = resolveEntryPath(entry.name);
    if ("refusal" in resolvedPath) {
      refusals.push(resolvedPath.refusal);
      return;
    }
    const normalized = resolvedPath.path;
    if (!normalized) return;

    const kind = toEntryKind(entry.typeFlag);
    let linkTarget: string | undefined;
    if (kind === "symlink" && entry.linkName) {
      const resolvedTarget = resolveSymlinkTarget(normalized, entry.linkName);
      if ("refusal" in resolvedTarget) {
        refusals.push(resolvedTarget.refusal);
        return;
      }
      // The contained, tree-root-relative value — never the tar header's own
      // raw text, which may be absolute or carry a `..` chain and would
      // otherwise leak straight through every reader of this entry (REQ-58,
      // REQ-62), including the metadata endpoint showing it to the operator.
      linkTarget = resolvedTarget.path;
    }

    entries.push({
      path: normalized,
      name: normalized.split("/").pop() ?? normalized,
      kind,
      sizeBytes: kind === "file" ? entry.size : undefined,
      mode: entry.mode,
      uid: entry.uid,
      gid: entry.gid,
      mtimeMs: entry.mtimeMs,
      linkTarget,
    });
  });
  return { entries: entries.sort((a, b) => a.path.localeCompare(b.path)), refusals };
}

export function normalizePath(path: string | undefined): string {
  return (path ?? "").replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

export function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}
