---
module: image-analysis
component: FilesystemContainment
type: backend utility
---

# FilesystemContainment

**Purpose** → the single place that decides whether a path stays inside an extracted image's tree.
REQ-62 distinguishes two different things this module resolves: an **entry name** (a write path —
an absolute one or one carrying a `..` segment lets extraction write outside the directory the
operator chose, and stays forbidden without exception) and a symlink's **target** (content, not a
write path — once resolved against the tree it can never point outside it, regardless of what its
own relative form looks like). Applied to every tar entry name, every symlink's target text, and
every incoming request path, before any byte is read from the archive, written into a produced one,
or shown back to the operator (REQ-58, REQ-62).

## Contract

- `resolveEntryPath(rawName): { path } | { refusal }` — normalizes a raw tar entry name (or, via
  `resolveRequestPath`, an operator/client-supplied request path) into a tree-relative path;
  `{ refusal: { path, reason } }` for one that carries an absolute path or a `..` segment attempting
  to leave the tree, instead of silently re-rooting it. Used only where the path names a *write or
  read location* — never for a symlink's target text.
- `resolveSymlinkTarget(entryPath, rawTarget): { path } | { refusal }` — resolves a symlink's target
  text against its own entry's directory, purely within the virtual tree (never against the server's
  real filesystem); `{ refusal }` for a target that, read as tree-root-relative, cannot be produced by
  any legitimate relative chain (i.e. it climbs past the tree's root). An absolute target (e.g.
  `/bin/busybox`) is read as tree-root-relative, matching what an absolute symlink means inside the
  image's own rootfs. The returned `path` is the *content* of the symlink, contained within the tree
  by construction — every consumer (the metadata endpoint, `FilesystemExtractionService`'s indexed
  `linkTarget`, the archive builder) stores and shows this resolved value, never the tar header's raw
  text.
- `resolveRequestPath(rawPath): { path } | { refusal }` — the same resolution as `resolveEntryPath`,
  applied to an operator/client-supplied path (e.g. an HTTP query param), validated the same way
  before it drives any lookup.
- `ContainmentRefusal`: `{ path, reason }`.

## Rules and invariants

- Normalization never lets `path.posix.normalize`'s own root-clamping hide an escape attempt: a
  leading `/` reaches it untouched (only a leading `./` is ever stripped beforehand) and a
  net-negative `..` chain is never pre-rooted before normalizing, so both a genuinely absolute input
  and an over-climbing chain surface as, respectively, a leading `/` or a leading `../` in the
  normalized result — refused rather than silently re-rooted or clamped by the platform path library.
- `resolveEntryPath`/`resolveRequestPath` refuse absolute input outright: there, "absolute" itself is
  the violation, because the path is used as a write or read location. `resolveSymlinkTarget` does
  not — an absolute *target* is ordinary, expected content inside a container image — but still
  refuses one that, once read as tree-root-relative, could not possibly be produced by a legitimate
  relative chain (the same over-climb check).
- A root-level entry (empty parent directory) is joined without an extra path separator, so an
  ordinary relative symlink target at the tree's root is never mistaken for an absolute one.
- `resolveSymlinkTarget`'s result is a tree-root-relative path, not itself a form any consumer writes
  verbatim as a POSIX symlink's target text: a symlink resolves against its *own containing
  directory*, not the tree's root, so a caller producing an actual on-disk (or in-archive) symlink
  must re-express this result relative to the symlink's own directory — see
  `FilesystemExportService`, which may legitimately reintroduce a `..` segment there, because at that
  point the target is validated content, not a write path (REQ-62).
- A refusal always carries a human-readable reason naming what was attempted (REQ-62).

## Requirements served

- plan-docker_management_app/REQ-58
- plan-docker_management_app/REQ-62
