// Entry metadata read from an already-extracted image filesystem (REQ-58):
// size, permissions, owner, modification time, type and symlink target,
// looked up from the same indexed list `FilesystemExtractionService` builds
// and validates, so a metadata read can never surface an entry INT-7 refused.
import { getExtractedFilesystem, normalizePath, type FilesystemEntryKind } from "./filesystem-extraction-service.js";

export interface FilesystemEntryMetadata {
  path: string;
  name: string;
  kind: FilesystemEntryKind;
  sizeBytes?: number;
  /** `rwxr-xr-x`-style rendering of the entry's permission bits; `undefined` when the archive carried none. */
  permissions?: string;
  uid?: number;
  gid?: number;
  /** ISO-8601 modification time; `undefined` when the archive carried none. */
  modifiedAt?: string;
  /** Target text of a symlink entry, contained within the tree (REQ-62); present only for `kind: 'symlink'`. */
  linkTarget?: string;
}

const PERMISSION_TRIADS = ["r", "w", "x"];

/** Renders POSIX permission bits (owner/group/other) the way `ls -l` does, e.g. `rwxr-xr-x`. */
function formatPermissions(mode: number): string {
  const bits = mode & 0o777;
  let result = "";
  for (let shift = 6; shift >= 0; shift -= 3) {
    const triad = (bits >> shift) & 0o7;
    result += PERMISSION_TRIADS.map((letter, index) => ((triad & (4 >> index)) !== 0 ? letter : "-")).join("");
  }
  return result;
}

/**
 * `imageId`'s entry at `path` (REQ-58). `undefined` when the image has no
 * cached extraction, or the path names no entry — including one INT-7
 * refused at extraction time, which never entered the index in the first
 * place.
 */
export async function getFilesystemEntryMetadata(imageId: string, path: string): Promise<FilesystemEntryMetadata | undefined> {
  const filesystem = await getExtractedFilesystem(imageId);
  if (!filesystem) return undefined;
  const normalized = normalizePath(path);
  const entry = filesystem.entries.find((candidate) => candidate.path === normalized);
  if (!entry) return undefined;

  return {
    path: entry.path,
    name: entry.name,
    kind: entry.kind,
    sizeBytes: entry.sizeBytes,
    permissions: entry.mode !== undefined ? formatPermissions(entry.mode) : undefined,
    uid: entry.uid,
    gid: entry.gid,
    modifiedAt: entry.mtimeMs !== undefined ? new Date(entry.mtimeMs).toISOString() : undefined,
    linkTarget: entry.kind === "symlink" ? entry.linkTarget : undefined,
  };
}
