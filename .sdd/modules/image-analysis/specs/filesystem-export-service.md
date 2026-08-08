---
module: image-analysis
component: FilesystemExportService
type: backend service
---

# FilesystemExportService

**Purpose** → exports part of an already-extracted image filesystem as a browser download: a single
file as itself, or a subtree as one freshly built tar archive, with a preview of what the archive
will contain before the operator confirms (REQ-61). Every entry *name* an archive can carry was
already validated by `FilesystemExtractionService` (REQ-62), so this service can only ever produce
one whose entry names stay inside the tree; a symlink's own recorded target is separately re-derived
so the archive is both safe and usable once extracted with a real `tar`.

## Contract

- `openFilesystemEntryDownload(imageId, path): Promise<{ download } | { refusal: string } |
  undefined>` — `undefined` when the image has no cached extraction; `{ refusal }` for a directory,
  or a symlink whose already-contained target (`FilesystemEntry.linkTarget`, resolved at indexing
  time — see `FilesystemExtractionService`) does not name a regular file in the tree.
  - `FileDownload`: `{ stream, suggestedFilename, sizeBytes }` — `stream` reads directly from the
    cached archive's known byte range, never buffering the file whole.
- `getSubtreeExportSummary(imageId, rootPath): Promise<{ summary } | { refusal: string } |
  undefined>` — the preview shown before the operator confirms a subtree download; reads no file
  content. `rootPath` empty means the whole tree.
  - `SubtreeExportSummary`: `{ rootPath, fileCount, directoryCount, symlinkCount, totalBytes,
    refusals }` — `refusals` are entries selected for the subtree that could not be located in the
    cached archive, each with its reason; they are excluded from the counts and from the archive.
  - `{ refusal }` when `rootPath` names no entry, names something other than a directory, or the
    archive is no longer cached.
- `openSubtreeArchiveDownload(imageId, rootPath): Promise<{ archive } | { refusal: string } |
  undefined>` — same selection and refusal rules as the summary; streams the resulting tar archive
  one file at a time (never the whole subtree buffered at once).
  - `SubtreeArchive`: `{ stream, suggestedFilename }`.

## Rules and invariants

- A produced archive's entry **names** keep their full tree-relative path (no rebasing to the
  subtree root) and carry no absolute path and no `../` segment, because every entry name was
  already validated when `FilesystemExtractionService` first indexed it (REQ-62) — this half of
  REQ-62 is unconditional, with no exception for any entry kind.
- A directory entry is written to the archive with a trailing `/` and no content. A symlink entry's
  `linkname` is `FilesystemEntry.linkTarget` (already the contained, tree-root-relative target —
  never the tar header's own raw text, which may itself be absolute or carry a `..` chain reaching
  past the tree's root) re-expressed as the path **relative to the symlink's own directory**: POSIX
  resolves a relative symlink target against its containing directory, not the tree's root, so the
  bare tree-root-relative form points at the wrong place — and resolves to nothing — for every
  symlink not sitting exactly at the tree's root (verified by extracting a produced archive with the
  real `tar` binary). This directory-relative form may itself legitimately contain a `../` segment
  (e.g. `../etc/passwd`); that is not a REQ-62 violation, because at this point the target is
  already-contained *content*, not a write path — a `../` inside it can only lead somewhere still
  inside the extracted tree. A symlink with no resolvable `linkTarget` is excluded from the archive
  rather than written with a missing or unresolved target.
- A file entry's bytes are streamed from the cached archive's known byte range.
- Header fields (mode, uid, gid, mtime) fall back to a sane default (`0o644` files, `0o755`
  directories/symlinks, uid/gid `0`, the current time) when the original tar header carried none.
- The archive is valid POSIX/USTAR: long paths split across the `name`/`prefix` fields, a correct
  checksum per header, and two trailing zero blocks closing the stream.

## Dependencies

- image-analysis: FilesystemExtractionService (`getExtractedFilesystem`, `getExtractedArchivePath`,
  `normalizePath`, `FilesystemEntry.linkTarget`), the archive index builder (internal, shared with
  FilesystemContentService), the tar reader (internal, `TarEntryLocation`)

## Requirements served

- plan-docker_management_app/REQ-61
- plan-docker_management_app/REQ-62
