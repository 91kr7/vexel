---
module: images
component: Image filesystem client
type: frontend data client
---

# Image filesystem client

**Purpose** → typed `fetch` wrapper for the filesystem extraction/tree-read endpoints (REQ-52–56,
REQ-113) and the in-tree file operations built on them: entry metadata, content preview, name/path
search, and single-file/subtree export as a browser download (REQ-58–62).

## Contract

- `imageFilesystemStreamUrl(id, force?): string` — builds `/api/images/{id}/filesystem/stream`
  (`?force=true` when `force`); consumed with `useImageFilesystemExtraction`.
- `fetchKeptImageFilesystem(id): Promise<KeptImageFilesystem>` — `GET
  /api/images/{id}/filesystem/kept`, the free read the browse action's two shapes are decided by.
  `KeptImageFilesystem`: `{ kept: false } | { kept: true; summary: FilesystemExtractionResult }`.
  **Kept and not-kept are two normal answers**, unlike the tree/metadata calls whose `404` means
  "extract first": absence is what the caller is asking about, so it is never an error here. A
  genuine failure (the read itself failing) still throws, so the caller degrades to the cost warning
  rather than reading a missing answer as "kept".
- `fetchImageFilesystemChildren(id, path?): Promise<FilesystemEntry[]>` — `GET
  /api/images/{id}/filesystem/entries[?path=...]`; throws (including on a `404`, meaning the
  filesystem has not been extracted yet) rather than returning an empty list.
- `FilesystemEntry`: `{ path, name, kind: 'file' | 'directory' | 'symlink', sizeBytes? }`.
- `FilesystemExtractionResult`: `{ imageId, entryCount, fromCache, refusedCount }`.
- `fetchImageFilesystemEntryMetadata(id, path): Promise<FilesystemEntryMetadata>` — `GET
  .../filesystem/metadata?path=...`; throws (including on a `404`) rather than returning
  `undefined`. `FilesystemEntryMetadata`: `{ path, name, kind, sizeBytes?, permissions?, uid?, gid?,
  modifiedAt?, linkTarget? }` (REQ-58).
- `fetchImageFilesystemEntryContent(id, path, mode?): Promise<FilesystemContentResult>` — `GET
  .../filesystem/content?path=...[&mode=...]`; throws (with the server's refusal reason) for a
  directory or a symlink. `FilesystemContentMode`: `'text' | 'hex'`. `FilesystemContentResult`:
  `{ path, mode, autoMode, content, totalSizeBytes, truncated }` (REQ-59).
- `searchImageFilesystem(id, query, signal?): Promise<FilesystemSearchResult>` — `GET
  .../filesystem/search?query=...`, forwarding an `AbortSignal` so a superseded search's response is
  ignored. `FilesystemSearchResult`: `{ query, matches, totalMatches, truncated }`.
  `FilesystemSearchMatch`: `{ path, name, kind, parentPath }` (REQ-60).
- `fetchSubtreeExportSummary(id, path): Promise<SubtreeExportSummary>` — `GET
  .../filesystem/subtree-summary?path=...`, the preview shown before the operator confirms a
  subtree download. `SubtreeExportSummary`: `{ rootPath, fileCount, directoryCount, symlinkCount,
  totalBytes, refusals: { path, reason }[] }` (REQ-61, REQ-62).
- `imageFilesystemEntryDownloadUrl(id, path): string`, `imageFilesystemSubtreeDownloadUrl(id,
  path): string` — download URL builders, consumed with the ui-library's `triggerDownload` (REQ-61).

## Rules and invariants

- A non-2xx response's error carries the server's own `error` message when the body is JSON with
  one, otherwise a generic `Request failed with HTTP <status>` message — including a `409` refusal,
  surfaced to the UI the same way as any other failure.

## Requirements served

- plan-docker_management_app/REQ-52
- plan-docker_management_app/REQ-53
- plan-docker_management_app/REQ-54
- plan-docker_management_app/REQ-55
- plan-docker_management_app/REQ-56
- plan-docker_management_app/REQ-58
- plan-docker_management_app/REQ-59
- plan-docker_management_app/REQ-60
- plan-docker_management_app/REQ-61
- plan-docker_management_app/REQ-62
- plan-docker_management_app/REQ-113
- plan-docker_management_app-filesystem_browse_direct/REQ-4
- plan-docker_management_app-filesystem_browse_direct/REQ-16
