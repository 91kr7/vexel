// Export as a browser download (REQ-61): a single file streamed as itself,
// a subtree streamed as one freshly built tar archive. Every entry name an
// archive carries was already validated by FilesystemExtractionService
// (INT-7) when it was first indexed, so no entry name can ever be an
// absolute path or carry a `../` segment (REQ-62) — that is the only shape
// of `../` REQ-62 forbids in the archive: a symlink's own recorded target is
// content, not a write path, and once contained within the tree it is
// re-expressed as a path relative to the symlink's own directory (the only
// form POSIX resolves correctly on extraction), which may legitimately
// contain `../` without that ever reaching outside the extracted footprint.
// This service additionally reports any selected entry it could not locate
// in the cached tarball.
import { createReadStream } from "node:fs";
import { posix } from "node:path";
import { Readable } from "node:stream";
import { type ContainmentRefusal } from "./filesystem-containment.js";
import { buildContainedArchiveIndex } from "./filesystem-archive-index.js";
import {
  getExtractedArchivePath,
  getExtractedFilesystem,
  normalizePath,
  type FilesystemEntry,
} from "./filesystem-extraction-service.js";
import { type TarEntryLocation } from "./tar-reader.js";

export interface SubtreeExportSummary {
  rootPath: string;
  fileCount: number;
  directoryCount: number;
  symlinkCount: number;
  totalBytes: number;
  refusals: ContainmentRefusal[];
}

export type SubtreeExportSummaryOutcome = { summary: SubtreeExportSummary } | { refusal: string } | undefined;

export interface FileDownload {
  stream: Readable;
  suggestedFilename: string;
  sizeBytes: number;
}

export type FileDownloadOutcome = { download: FileDownload } | { refusal: string } | undefined;

export interface SubtreeArchive {
  stream: Readable;
  suggestedFilename: string;
}

export type SubtreeArchiveOutcome = { archive: SubtreeArchive } | { refusal: string } | undefined;

const BLOCK_SIZE = 512;

/** A single file at `path`, streamed as itself (REQ-61). `{ refusal }` for a directory, or a symlink whose target does not resolve to a regular file inside the tree. */
export async function openFilesystemEntryDownload(imageId: string, path: string): Promise<FileDownloadOutcome> {
  const filesystem = await getExtractedFilesystem(imageId);
  if (!filesystem) return undefined;

  const normalized = normalizePath(path);
  const entry = resolveDownloadableFile(filesystem.entries, normalized);
  if (!entry) return { refusal: "This entry has no downloadable file content (a directory, or a symlink whose target leaves the tree or is not a regular file)." };

  const archivePath = getExtractedArchivePath(imageId);
  if (!archivePath) return { refusal: "This image's extracted archive is no longer cached; re-extract the filesystem to download." };

  const index = await buildContainedArchiveIndex(archivePath);
  const location = index.get(entry.path);
  if (!location) return { refusal: "This entry could not be located in the extracted archive." };

  // Streams directly from the cached archive's known byte range: never buffers the whole file in memory.
  const stream = location.size > 0 ? createReadStream(archivePath, { start: location.offset, end: location.offset + location.size - 1 }) : Readable.from(Buffer.alloc(0));
  return {
    download: { stream, suggestedFilename: entry.name || "download", sizeBytes: location.size },
  };
}

/**
 * A symlink resolves (looked up by its already-contained, tree-root-relative
 * `linkTarget` — `FilesystemExtractionService` stores the resolved value,
 * never the tar header's raw text, so this never touches a real filesystem
 * path, REQ-62) to the file it targets; any other kind is not directly
 * downloadable as a single file.
 */
function resolveDownloadableFile(entries: FilesystemEntry[], path: string): FilesystemEntry | undefined {
  const entry = entries.find((candidate) => candidate.path === path);
  if (!entry) return undefined;
  if (entry.kind === "file") return entry;
  if (entry.kind === "symlink" && entry.linkTarget !== undefined) {
    const target = entries.find((candidate) => candidate.path === entry.linkTarget);
    return target?.kind === "file" ? target : undefined;
  }
  return undefined;
}

/** Selects `rootPath`'s subtree (the whole tree when empty) without reading any file content — the preview shown before the operator confirms the download (REQ-61). */
export async function getSubtreeExportSummary(imageId: string, rootPath: string): Promise<SubtreeExportSummaryOutcome> {
  const filesystem = await getExtractedFilesystem(imageId);
  if (!filesystem) return undefined;

  const normalizedRoot = normalizePath(rootPath);
  const selection = selectSubtree(filesystem.entries, normalizedRoot);
  if ("refusal" in selection) return selection;

  const archivePath = getExtractedArchivePath(imageId);
  if (!archivePath) return { refusal: "This image's extracted archive is no longer cached; re-extract the filesystem to export." };
  const index = await buildContainedArchiveIndex(archivePath);

  const refusals: ContainmentRefusal[] = [];
  let fileCount = 0;
  let directoryCount = 0;
  let symlinkCount = 0;
  let totalBytes = 0;
  for (const entry of selection.entries) {
    if (entry.kind === "directory") {
      directoryCount += 1;
    } else if (entry.kind === "symlink") {
      symlinkCount += 1;
    } else {
      const location = index.get(entry.path);
      if (!location) {
        refusals.push({ path: entry.path, reason: "could not be located in the extracted archive; skipped" });
        continue;
      }
      fileCount += 1;
      totalBytes += location.size;
    }
  }

  return { summary: { rootPath: normalizedRoot, fileCount, directoryCount, symlinkCount, totalBytes, refusals } };
}

/** Streams `rootPath`'s subtree as one freshly built tar archive (REQ-61), reading one file at a time (never the whole archive at once). */
export async function openSubtreeArchiveDownload(imageId: string, rootPath: string): Promise<SubtreeArchiveOutcome> {
  const filesystem = await getExtractedFilesystem(imageId);
  if (!filesystem) return undefined;

  const normalizedRoot = normalizePath(rootPath);
  const selection = selectSubtree(filesystem.entries, normalizedRoot);
  if ("refusal" in selection) return selection;

  const archivePath = getExtractedArchivePath(imageId);
  if (!archivePath) return { refusal: "This image's extracted archive is no longer cached; re-extract the filesystem to export." };
  const index = await buildContainedArchiveIndex(archivePath);

  const suggestedFilename = `${(normalizedRoot.split("/").pop() || "filesystem").replace(/[^a-zA-Z0-9._-]+/g, "_")}.tar`;
  return { archive: { stream: Readable.from(buildTarArchive(selection.entries, archivePath, index)), suggestedFilename } };
}

function selectSubtree(entries: FilesystemEntry[], normalizedRoot: string): { entries: FilesystemEntry[] } | { refusal: string } {
  if (normalizedRoot === "") return { entries };
  const rootEntry = entries.find((entry) => entry.path === normalizedRoot);
  if (!rootEntry) return { refusal: "No such entry in the extracted tree." };
  if (rootEntry.kind !== "directory") return { refusal: "This entry is not a directory; use the single-file download instead." };
  const prefix = `${normalizedRoot}/`;
  return { entries: [rootEntry, ...entries.filter((entry) => entry.path.startsWith(prefix))] };
}

async function* buildTarArchive(
  entries: FilesystemEntry[],
  archivePath: string,
  index: Map<string, TarEntryLocation>,
): AsyncGenerator<Buffer> {
  for (const entry of entries) {
    const mode = entry.mode ?? (entry.kind === "directory" ? 0o755 : entry.kind === "symlink" ? 0o777 : 0o644);
    const mtimeSec = Math.floor((entry.mtimeMs ?? Date.now()) / 1000);

    if (entry.kind === "directory") {
      yield writeTarHeader({ name: `${entry.path}/`, size: 0, typeFlag: "5", mode, uid: entry.uid ?? 0, gid: entry.gid ?? 0, mtimeSec });
      continue;
    }
    if (entry.kind === "symlink") {
      const linkName = entry.linkTarget !== undefined ? directoryRelativeSymlinkTarget(entry.path, entry.linkTarget) : undefined;
      if (linkName === undefined) continue; // no contained target to write (REQ-62); never write the tar header's raw, unresolved text
      yield writeTarHeader({ name: entry.path, size: 0, typeFlag: "2", mode, uid: entry.uid ?? 0, gid: entry.gid ?? 0, mtimeSec, linkName });
      continue;
    }

    const location = index.get(entry.path);
    if (!location) continue; // already reported by getSubtreeExportSummary; never silently corrupt the archive

    yield writeTarHeader({ name: entry.path, size: location.size, typeFlag: "0", mode, uid: entry.uid ?? 0, gid: entry.gid ?? 0, mtimeSec });
    // Streams this one file's bytes from their known range: only one file's worth of buffering ever happens at a time, never the whole subtree.
    if (location.size > 0) {
      for await (const chunk of createReadStream(archivePath, { start: location.offset, end: location.offset + location.size - 1 })) {
        yield chunk as Buffer;
      }
    }
    const paddingBytes = paddedSize(location.size) - location.size;
    if (paddingBytes > 0) yield Buffer.alloc(paddingBytes);
  }
  yield Buffer.alloc(BLOCK_SIZE * 2); // two zero blocks close a tar archive
}

function paddedSize(size: number): number {
  return Math.ceil(size / BLOCK_SIZE) * BLOCK_SIZE;
}

/**
 * The `linkname` bytes actually written for a symlink entry (REQ-62): never
 * the tar header's own raw target text (which may be absolute, or carry a
 * `..` chain climbing past the tree's root), and never the bare
 * tree-root-relative form either — POSIX resolves a relative symlink target
 * against its *own containing directory*, not the tree's root, so a
 * root-relative form points at the wrong place (and resolves to nothing)
 * for every symlink not sitting exactly at the tree's root. Instead, this
 * re-expresses `resolvedTargetPath` (already contained within the tree, by
 * construction free of any escaping `..`) as the path relative to the
 * symlink's own directory that a real `tar` extracts correctly: it may
 * itself contain `../` (e.g. `../etc/passwd`), and that is fine — content
 * once contained cannot reach outside the extracted footprint, which is the
 * corrected reading of REQ-62 (only an entry *name* is a write path).
 */
function directoryRelativeSymlinkTarget(entryPath: string, resolvedTargetPath: string): string {
  const parentDir = entryPath.includes("/") ? entryPath.slice(0, entryPath.lastIndexOf("/")) : "";
  const relative = posix.relative(`/${parentDir}`, `/${resolvedTargetPath}`);
  return relative === "" ? "." : relative;
}

interface TarHeaderInput {
  name: string;
  size: number;
  typeFlag: string;
  mode: number;
  uid: number;
  gid: number;
  mtimeSec: number;
  linkName?: string;
}

/** Splits a path over USTAR's `name` (100 bytes) + `prefix` (155 bytes) fields at the rightmost `/` that fits both; falls back to a truncated tail for an implausibly deep path. */
function splitTarName(name: string): { prefix: string; name: string } {
  if (name.length <= 100) return { prefix: "", name };
  let splitAt = -1;
  for (let i = 0; i < name.length; i += 1) {
    if (name[i] === "/" && name.length - i - 1 <= 100 && i <= 155) splitAt = i;
  }
  if (splitAt === -1) return { prefix: "", name: name.slice(-100) };
  return { prefix: name.slice(0, splitAt), name: name.slice(splitAt + 1) };
}

function writeAsciiField(buffer: Buffer, start: number, length: number, value: string): void {
  buffer.write(value.slice(0, length), start, "ascii");
}

function writeOctalField(buffer: Buffer, start: number, length: number, value: number): void {
  const field = `${Math.max(0, Math.floor(value)).toString(8).padStart(length - 1, "0")}\0`;
  writeAsciiField(buffer, start, length, field);
}

/** Builds one 512-byte POSIX/USTAR header block for `input`. */
function writeTarHeader(input: TarHeaderInput): Buffer {
  const block = Buffer.alloc(BLOCK_SIZE);
  const { prefix, name } = splitTarName(input.name);
  writeAsciiField(block, 0, 100, name);
  writeOctalField(block, 100, 8, input.mode);
  writeOctalField(block, 108, 8, input.uid);
  writeOctalField(block, 116, 8, input.gid);
  writeOctalField(block, 124, 12, input.size);
  writeOctalField(block, 136, 12, input.mtimeSec);
  block.fill(0x20, 148, 156);
  block[156] = input.typeFlag.charCodeAt(0);
  if (input.linkName) writeAsciiField(block, 157, 100, input.linkName);
  writeAsciiField(block, 257, 6, "ustar");
  writeAsciiField(block, 263, 2, "00");
  if (prefix) writeAsciiField(block, 345, 155, prefix);

  let checksum = 0;
  for (let i = 0; i < BLOCK_SIZE; i += 1) checksum += block[i] ?? 0;
  writeAsciiField(block, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return block;
}
