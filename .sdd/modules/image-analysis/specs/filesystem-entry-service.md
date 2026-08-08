---
module: image-analysis
component: FilesystemEntryService
type: backend service
---

# FilesystemEntryService

**Purpose** → one extracted entry's full metadata for the detail panel: size, permissions, owner,
modification time, type and symlink target (REQ-58).

## Contract

- `getFilesystemEntryMetadata(imageId, path): Promise<FilesystemEntryMetadata | undefined>` —
  `undefined` when the image has no cached extraction, or `path` names no entry — including one
  `FilesystemExtractionService` refused at extraction time, which never entered the index.
  - `FilesystemEntryMetadata`: `{ path, name, kind, sizeBytes?, permissions?, uid?, gid?,
    modifiedAt?, linkTarget? }`.
  - `permissions`: `rwxr-xr-x`-style rendering of the entry's POSIX mode bits; `undefined` when the
    archive carried none.
  - `modifiedAt`: ISO-8601, from the entry's `mtimeMs`; `undefined` when the archive carried none.
  - `linkTarget`: only for `kind: 'symlink'` — `FilesystemContainment.resolveSymlinkTarget`'s
    resolved, tree-root-relative value, exactly as `FilesystemExtractionService` stored it at
    indexing time; **never** the tar header's own raw target text, which could otherwise name a path
    on the *server's* host and be shown to the operator as if it were the image's own content
    (REQ-58, REQ-62).

## Rules and invariants

- `linkTarget` is read straight from the already-resolved `FilesystemEntry.linkTarget`; this service
  performs no containment resolution of its own — it has nothing left to resolve, since
  `FilesystemExtractionService` never indexes a symlink whose target could not be contained.

## Dependencies

- image-analysis: FilesystemExtractionService (`getExtractedFilesystem`, `normalizePath`)

## Requirements served

- plan-docker_management_app/REQ-58
