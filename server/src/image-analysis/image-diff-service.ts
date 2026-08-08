// Cross-image filesystem comparison (REQ-63, REQ-64): the merged filesystems
// of two images, added/removed/changed paths with the nature of a change,
// built from each image's own already-extracted (or freshly extracted,
// reusing FilesystemExtractionService) entry list — never by running either
// image. Reports progress and is cancellable; the result stays cached
// in-memory for the tree's lazy per-directory reads until a new comparison
// of the same pair replaces it.
import { createHash } from "node:crypto";
import { buildContainedArchiveIndex } from "./filesystem-archive-index.js";
import {
  extractImageFilesystem,
  getExtractedArchivePath,
  getExtractedFilesystem,
  normalizePath,
  parentOf,
  type FilesystemEntry,
  type FilesystemEntryKind,
  type FilesystemExtractionProgress,
} from "./filesystem-extraction-service.js";
import { readTarEntryAt, type TarEntryLocation } from "./tar-reader.js";

export type ImageDiffStatus = "added" | "removed" | "changed";
export type ImageDiffNature = "content" | "size" | "mode" | "ownership" | "symlink-target";

export interface ImageDiffSideMetadata {
  sizeBytes?: number;
  mode?: number;
  uid?: number;
  gid?: number;
  linkTarget?: string;
}

export interface ImageDiffEntry {
  path: string;
  name: string;
  kind: FilesystemEntryKind;
  /** Present only for a real added/removed/changed path; absent for a synthesized ancestor directory shown only to carry its descendants' roll-up. */
  status?: ImageDiffStatus;
  natures?: ImageDiffNature[];
  a?: ImageDiffSideMetadata;
  b?: ImageDiffSideMetadata;
  /** Counts of added/removed/changed paths anywhere in this directory's subtree; present on every directory node, real or synthesized. */
  rollup?: { added: number; removed: number; changed: number };
}

export interface ImageFilesystemDiff {
  imageIdA: string;
  imageIdB: string;
  /** Every real (non-synthesized) added/removed/changed path, flat, sorted by path. */
  entries: ImageDiffEntry[];
  addedCount: number;
  removedCount: number;
  changedCount: number;
}

export type ImageDiffProgress =
  | { phase: "extracting"; side: "a" | "b"; extraction: FilesystemExtractionProgress }
  | { phase: "comparing"; comparedPaths: number; totalPaths: number };

export interface ImageDiffHandlers {
  onProgress: (progress: ImageDiffProgress) => void;
  onError: (message: string) => void;
  onEnd: (result: ImageFilesystemDiff) => void;
}

interface DiffCacheEntry {
  diff: ImageFilesystemDiff;
  childrenByParent: Map<string, ImageDiffEntry[]>;
}

const diffCache = new Map<string, DiffCacheEntry>();

function pairKey(imageIdA: string, imageIdB: string): string {
  return `${imageIdA}::${imageIdB}`;
}

/** Bounds a `comparing` progress event to every 200 paths, small enough to keep the operator informed without flooding the stream. */
const PROGRESS_STRIDE = 200;

/**
 * Compares `imageIdA`'s and `imageIdB`'s merged filesystems (REQ-63, REQ-64).
 * Extracts each side first — reusing its cached extraction when one already
 * exists (REQ-113) — then compares the two entry lists. Returns a cancel
 * function; cancelling stops the run at its next await point (during either
 * side's extraction, or between compared paths), and no further handler
 * fires.
 */
export async function compareImageFilesystems(imageIdA: string, imageIdB: string, handlers: ImageDiffHandlers): Promise<() => void> {
  let cancelled = false;
  let activeExtractionCancel: (() => void) | undefined;

  void run();

  async function run(): Promise<void> {
    try {
      await extractSide("a", imageIdA);
      if (cancelled) return;
      await extractSide("b", imageIdB);
      if (cancelled) return;

      const [filesystemA, filesystemB] = await Promise.all([getExtractedFilesystem(imageIdA), getExtractedFilesystem(imageIdB)]);
      if (!filesystemA || !filesystemB) throw new Error("Both images must be extracted before they can be compared.");
      if (cancelled) return;

      const diff = await computeDiff(imageIdA, imageIdB, filesystemA.entries, filesystemB.entries, (comparedPaths, totalPaths) => {
        if (!cancelled) handlers.onProgress({ phase: "comparing", comparedPaths, totalPaths });
      });
      if (cancelled) return;

      diffCache.set(pairKey(imageIdA, imageIdB), { diff, childrenByParent: buildChildrenByParent(diff.entries) });
      handlers.onEnd(diff);
    } catch (error) {
      if (!cancelled) handlers.onError((error as Error).message);
    }
  }

  async function extractSide(side: "a" | "b", imageId: string): Promise<void> {
    const alreadyExtracted = await getExtractedFilesystem(imageId);
    if (alreadyExtracted) return;
    await new Promise<void>((resolve, reject) => {
      extractImageFilesystem(
        imageId,
        {},
        {
          onProgress: (extraction) => {
            if (!cancelled) handlers.onProgress({ phase: "extracting", side, extraction });
          },
          onError: (message) => reject(new Error(message)),
          onEnd: () => resolve(),
        },
      ).then((cancel) => {
        activeExtractionCancel = cancel;
        if (cancelled) cancel();
      });
    });
  }

  return () => {
    cancelled = true;
    activeExtractionCancel?.();
  };
}

/** The last comparison's result for this exact ordered pair, or `undefined` when the pair has never been compared (or a new comparison is in flight). */
export function getCachedDiff(imageIdA: string, imageIdB: string): ImageFilesystemDiff | undefined {
  return diffCache.get(pairKey(imageIdA, imageIdB))?.diff;
}

/**
 * Direct children of `parentPath` (default the root) from the last cached
 * comparison of this pair (REQ-63) — a mix of real added/removed/changed
 * entries and synthesized directory nodes carrying only a roll-up, so an
 * unchanged directory on the way to a deeply nested change still shows a
 * path into it. `undefined` when this pair has not been compared yet.
 */
export function listDiffChildren(imageIdA: string, imageIdB: string, parentPath?: string): ImageDiffEntry[] | undefined {
  const cached = diffCache.get(pairKey(imageIdA, imageIdB));
  if (!cached) return undefined;
  return cached.childrenByParent.get(normalizePath(parentPath)) ?? [];
}

function buildChildrenByParent(entries: ImageDiffEntry[]): Map<string, ImageDiffEntry[]> {
  const nodes = new Map<string, ImageDiffEntry>();
  for (const entry of entries) nodes.set(entry.path, entry);

  // Every real entry's ancestor chain must exist as a node too, synthesized
  // as a bare directory the first time it is reached, so the tree can be
  // walked one level at a time down to any change (REQ-63).
  for (const entry of entries) {
    let current = parentOf(entry.path);
    while (current !== "" && !nodes.has(current)) {
      nodes.set(current, { path: current, name: current.split("/").pop() ?? current, kind: "directory", rollup: { added: 0, removed: 0, changed: 0 } });
      current = parentOf(current);
    }
  }
  if (!nodes.has("")) nodes.set("", { path: "", name: "", kind: "directory", rollup: { added: 0, removed: 0, changed: 0 } });

  for (const node of nodes.values()) {
    if (node.kind === "directory" && !node.rollup) node.rollup = { added: 0, removed: 0, changed: 0 };
  }
  for (const entry of entries) {
    if (!entry.status) continue;
    let current = parentOf(entry.path);
    for (;;) {
      const ancestor = nodes.get(current);
      if (ancestor?.rollup) ancestor.rollup[entry.status] += 1;
      if (current === "") break;
      current = parentOf(current);
    }
  }

  const childrenByParent = new Map<string, ImageDiffEntry[]>();
  for (const node of nodes.values()) {
    if (node.path === "") continue;
    const parent = parentOf(node.path);
    const siblings = childrenByParent.get(parent) ?? [];
    siblings.push(node);
    childrenByParent.set(parent, siblings);
  }
  for (const siblings of childrenByParent.values()) siblings.sort((a, b) => a.path.localeCompare(b.path));
  return childrenByParent;
}

function toSideMetadata(entry: FilesystemEntry): ImageDiffSideMetadata {
  return { sizeBytes: entry.sizeBytes, mode: entry.mode, uid: entry.uid, gid: entry.gid, linkTarget: entry.linkTarget };
}

async function computeDiff(
  imageIdA: string,
  imageIdB: string,
  entriesA: FilesystemEntry[],
  entriesB: FilesystemEntry[],
  onProgress: (comparedPaths: number, totalPaths: number) => void,
): Promise<ImageFilesystemDiff> {
  const byPathA = new Map(entriesA.map((entry) => [entry.path, entry]));
  const byPathB = new Map(entriesB.map((entry) => [entry.path, entry]));
  const allPaths = Array.from(new Set([...byPathA.keys(), ...byPathB.keys()])).sort((a, b) => a.localeCompare(b));

  const archivePathA = getExtractedArchivePath(imageIdA);
  const archivePathB = getExtractedArchivePath(imageIdB);
  const indexA = archivePathA ? await buildContainedArchiveIndex(archivePathA) : undefined;
  const indexB = archivePathB ? await buildContainedArchiveIndex(archivePathB) : undefined;

  const result: ImageDiffEntry[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;

  for (let i = 0; i < allPaths.length; i += 1) {
    const path = allPaths[i];
    const entryA = byPathA.get(path);
    const entryB = byPathB.get(path);

    if (entryA && !entryB) {
      result.push({ path, name: entryA.name, kind: entryA.kind, status: "removed", a: toSideMetadata(entryA) });
      removedCount += 1;
    } else if (!entryA && entryB) {
      result.push({ path, name: entryB.name, kind: entryB.kind, status: "added", b: toSideMetadata(entryB) });
      addedCount += 1;
    } else if (entryA && entryB) {
      const natures = await diffNatures(entryA, entryB, archivePathA, indexA?.get(path), archivePathB, indexB?.get(path));
      if (natures.length > 0) {
        result.push({ path, name: entryB.name, kind: entryB.kind, status: "changed", natures, a: toSideMetadata(entryA), b: toSideMetadata(entryB) });
        changedCount += 1;
      }
    }

    if ((i + 1) % PROGRESS_STRIDE === 0 || i === allPaths.length - 1) onProgress(i + 1, allPaths.length);
  }

  return { imageIdA, imageIdB, entries: result, addedCount, removedCount, changedCount };
}

/** The set of REQ-64 change aspects that differ between the two sides; empty when the entry is unchanged and so excluded from the diff. */
async function diffNatures(
  entryA: FilesystemEntry,
  entryB: FilesystemEntry,
  archivePathA: string | undefined,
  locationA: TarEntryLocation | undefined,
  archivePathB: string | undefined,
  locationB: TarEntryLocation | undefined,
): Promise<ImageDiffNature[]> {
  const natures: ImageDiffNature[] = [];

  if (entryA.kind !== entryB.kind) return ["content"];

  if ((entryA.mode ?? undefined) !== (entryB.mode ?? undefined)) natures.push("mode");
  if ((entryA.uid ?? undefined) !== (entryB.uid ?? undefined) || (entryA.gid ?? undefined) !== (entryB.gid ?? undefined)) natures.push("ownership");

  if (entryA.kind === "symlink") {
    if (entryA.linkTarget !== entryB.linkTarget) natures.push("symlink-target");
    return natures;
  }
  if (entryA.kind === "directory") return natures;

  // A file: a size mismatch already proves the content differs, with no need
  // to read either side; equal sizes still need a content hash to tell.
  if ((entryA.sizeBytes ?? 0) !== (entryB.sizeBytes ?? 0)) {
    natures.push("size", "content");
    return natures;
  }
  if (archivePathA && locationA && archivePathB && locationB) {
    const [bufferA, bufferB] = await Promise.all([readTarEntryAt(archivePathA, locationA), readTarEntryAt(archivePathB, locationB)]);
    if (hash(bufferA) !== hash(bufferB)) natures.push("content");
  }
  return natures;
}

function hash(buffer: Buffer): string {
  return createHash("sha1").update(buffer).digest("hex");
}
