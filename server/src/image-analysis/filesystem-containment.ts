// Containment for every read of, and every archive produced from, an
// extracted image filesystem (REQ-62): a `../` segment or an absolute path
// found in the tarball itself, or a symlink target that resolves outside the
// extracted tree, is refused rather than followed — applied before any byte
// is read from the archive or written into a produced one.
import { posix } from "node:path";

export interface ContainmentRefusal {
  path: string;
  reason: string;
}

export type ContainmentResult = { path: string } | { refusal: ContainmentRefusal };

const ESCAPES_TREE_REASON = "escapes the extracted tree via an absolute path or a \"../\" segment";

/**
 * Resolves `raw` as a path relative to the tree's root, without ever letting
 * `path.posix.normalize`'s own root-clamping hide an escape attempt: the
 * normalization runs on the string exactly as given (never pre-stripped of a
 * leading `/`), so both a net-negative `..` chain and a genuinely absolute
 * path surface as, respectively, a leading `../` or a leading `/` — refused
 * rather than silently re-rooted (REQ-62). `undefined` means it escapes.
 */
function normalizeWithinTree(raw: string): string | undefined {
  const normalized = posix.normalize(raw).replace(/\/+$/, "");
  if (normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) return undefined;
  return normalized === "." ? "" : normalized;
}

/**
 * Normalizes a raw tar entry name (or an operator/client-supplied request
 * path) into a tree-relative path, refusing one that carries an absolute
 * path or a `..` segment attempting to leave the tree — never silently
 * re-rooted, so the refusal is reportable (REQ-62). Only a leading `./` is
 * stripped, since that is a relative-path convention, not an absolute
 * marker; a leading `/` reaches `normalizeWithinTree` untouched and is
 * refused there.
 */
export function resolveEntryPath(rawName: string): ContainmentResult {
  const stripped = rawName.replace(/^\.\//, "");
  const normalized = normalizeWithinTree(stripped);
  if (normalized === undefined) return { refusal: { path: rawName, reason: ESCAPES_TREE_REASON } };
  return { path: normalized };
}

/**
 * Resolves a symlink's target text against the entry's own directory, purely
 * within the virtual tree (never against the server's real filesystem);
 * refuses a target that resolves outside the tree's root instead of
 * following it (REQ-62). An absolute target is read as tree-root-relative,
 * matching what an absolute symlink means inside the image's own rootfs —
 * unlike `resolveEntryPath`, an absolute *target* is a legitimate, common
 * shape (e.g. `/bin/busybox`), not itself a containment violation; only the
 * archive builder is required to never write that raw absolute text back
 * out (it writes this function's resolved, tree-relative result instead).
 * A root-level entry (empty `parentDir`) is joined without an extra leading
 * separator, so an ordinary relative target is never mistaken for absolute.
 */
export function resolveSymlinkTarget(entryPath: string, rawTarget: string): ContainmentResult {
  const parentDir = entryPath.includes("/") ? entryPath.slice(0, entryPath.lastIndexOf("/")) : "";
  const combined = rawTarget.startsWith("/") ? rawTarget.replace(/^\/+/, "") : parentDir ? `${parentDir}/${rawTarget}` : rawTarget;
  const normalized = normalizeWithinTree(combined);
  if (normalized === undefined) {
    return { refusal: { path: entryPath, reason: `symlink target "${rawTarget}" ${ESCAPES_TREE_REASON}` } };
  }
  return { path: normalized };
}

/** A user-supplied request path (e.g. an HTTP query param) validated the same way before it drives any lookup (REQ-62). */
export function resolveRequestPath(rawPath: string): ContainmentResult {
  return resolveEntryPath(rawPath);
}
