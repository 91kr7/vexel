---
module: image-analysis
component: ImageDiffService
type: backend service
---

# ImageDiffService

**Purpose** → compares two images' merged filesystems into added, removed and changed paths, with
the nature of each change (content, size, mode, ownership, symlink target), by comparing their
already-extracted (or freshly extracted, reusing `FilesystemExtractionService`) flat entry lists —
never by running either image (REQ-63, REQ-64). Reports progress and is cancellable.

## Contract

- `compareImageFilesystems(imageIdA, imageIdB, handlers): Promise<() => void>`
  - `handlers`: `{ onProgress(progress), onError(message), onEnd(result) }`.
  - `ImageDiffProgress`: `{ phase: 'extracting', side: 'a' | 'b', extraction:
    FilesystemExtractionProgress } | { phase: 'comparing', comparedPaths, totalPaths }` —
    extraction progress is forwarded, tagged with which side it belongs to, only for a side not
    already cached; `'comparing'` then reports every 200 compared paths.
  - `onEnd(result)`: `ImageFilesystemDiff`: `{ imageIdA, imageIdB, entries, addedCount,
    removedCount, changedCount }` — `entries: ImageDiffEntry[]` is every real added/removed/changed
    path, flat, sorted by path.
  - `ImageDiffEntry`: `{ path, name, kind, status?: 'added' | 'removed' | 'changed', natures?:
    ImageDiffNature[], a?: ImageDiffSideMetadata, b?: ImageDiffSideMetadata, rollup?: { added,
    removed, changed } }` — `ImageDiffNature`: `'content' | 'size' | 'mode' | 'ownership' |
    'symlink-target'`; `a`/`b` carry the side's own `{ sizeBytes?, mode?, uid?, gid?, linkTarget?
    }`, present when the path exists on that side (both for `'changed'`, one for `'added'`/
    `'removed'`).
  - Returns a cancel function; calling it stops the run at its next await point (during either
    side's extraction, or between compared paths) and no further handler fires.
- `getCachedDiff(imageIdA, imageIdB): ImageFilesystemDiff | undefined` — the last comparison's full
  result for this exact ordered pair; `undefined` when never compared.
- `listDiffChildren(imageIdA, imageIdB, parentPath?): ImageDiffEntry[] | undefined` — direct
  children of `parentPath` (default the root) from the last cached comparison of this pair, one
  directory level per call, designed for lazy tree expansion; `undefined` when this pair has not
  been compared yet.

## Rules and invariants

- Each side is extracted first only when it has no cached extraction yet (REQ-113); comparing two
  images already browsed through the filesystem browser reuses both without re-exporting anything.
- A path present on only one side is `'added'` (in B, not A) or `'removed'` (in A, not B); a
  directory/symlink/file kind change between the two sides is reported as `'changed'` with
  `natures: ['content']`, the closest REQ-64 aspect to "the object at this path is fundamentally
  different", without attempting to hash or compare it further.
- For a path present on both sides with the same kind: `mode` differing yields `'mode'`; `uid` or
  `gid` differing yields `'ownership'`; for a symlink, `linkTarget` differing yields
  `'symlink-target'` (no content/size comparison for a symlink or a directory); for a file, a size
  mismatch yields `'size'` and `'content'` with no further read (a size difference already proves
  the content differs); equal sizes are compared by reading each side's full content from its
  cached archive and hashing it, yielding `'content'` only when the hashes differ.
- A path with no nature difference is unchanged and excluded from `entries` entirely — the diff
  never lists a path nothing actually changed about.
- Every real entry's ancestor directory chain is synthesized into the per-directory listing
  (`listDiffChildren`) as a bare node (no `status`, no `natures`) the first time it is reached, so a
  changed path nested under an otherwise-unchanged directory is still reachable level by level; a
  directory's `rollup` counts every real entry anywhere in its subtree, whether the directory node
  itself is real or synthesized.
- `onError` and `onEnd` are mutually exclusive and each fires at most once per call.
- A new comparison of the same ordered pair replaces its cached result; comparing `(A, B)` and
  `(B, A)` are tracked as distinct pairs, since `added`/`removed` are directional.

## Dependencies

- image-analysis: FilesystemExtractionService (`extractImageFilesystem`, `getExtractedFilesystem`,
  `getExtractedArchivePath`, `normalizePath`, `parentOf`), the archive index builder (internal,
  shared with FilesystemContentService), the tar reader (internal, `readTarEntryAt`)

## Requirements served

- plan-docker_management_app/REQ-63
- plan-docker_management_app/REQ-64
