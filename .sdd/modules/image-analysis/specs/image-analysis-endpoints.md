---
module: image-analysis
component: Image analysis endpoints
type: REST endpoint
---

# Image analysis endpoints

**Purpose** → exposes the layer stack (with shared-layer markers), a cancellable changeset analysis
progress stream, the runtime-independent filesystem extraction/tree-read pair, the in-tree
metadata/content/search/export operations built on it, and the cross-image filesystem diff
stream/tree-read pair, to the client (REQ-47–64, REQ-113).

## Contract

- `GET /api/images/:id/layers` → `{ imageId, layers }`, one entry per `LayerMetadataService` layer
  plus `sharedWith: SharingImage[]` (from `SharedLayerService`, empty when the layer has no known
  diff id or shares with nothing).
- `GET /api/images/:id/changesets/stream` → server-sent events driving `computeImageChangesets`:
  `progress` (one per `ChangesetProgress`), `result` (the final `ImageChangesets`, sent just before
  `end`), `end`, or `error` (`{ message }`) if it fails. Disconnecting cancels the in-flight
  analysis.
- `GET /api/images/:id/filesystem/stream[?force=true]` → server-sent events driving
  `extractImageFilesystem`: `progress` (one per `FilesystemExtractionProgress`), `result` (the final
  `FilesystemExtractionResult`, sent just before `end`), `end`, or `error` (`{ message }`) if it
  fails. `force=true` bypasses the cache and re-extracts. Disconnecting cancels the in-flight
  extraction — the intermediate container is still removed.
- `GET /api/images/:id/filesystem/entries[?path=...]` → `{ path, entries }`, the direct children of
  `path` (root when omitted) from `listImageFilesystemChildren`; `404` when this image's filesystem
  has not been extracted yet.
- `GET /api/images/:id/filesystem/metadata?path=...` → `{ metadata }` from
  `getFilesystemEntryMetadata` (REQ-58); `404` when the image has no cached extraction or `path`
  names no entry.
- `GET /api/images/:id/filesystem/content?path=...[&mode=text|hex]` → `{ result }` from
  `readFilesystemEntryContent` (REQ-59); `404` when not extracted, `409` with `{ error }` on a
  refusal (a directory, a symlink, or an unlocated entry).
- `GET /api/images/:id/filesystem/search?query=...` → the `FilesystemSearchResult` from
  `searchFilesystemEntries` (REQ-60); `404` when not extracted.
- `GET /api/images/:id/filesystem/subtree-summary?path=...` → `{ summary }` from
  `getSubtreeExportSummary` (REQ-61); `404` when not extracted, `409` with `{ error }` on a refusal.
- `GET /api/images/:id/filesystem/download?path=...` → streams a single entry's file content as a
  browser download (`Content-Disposition: attachment`) from `openFilesystemEntryDownload` (REQ-61);
  `404` when not extracted, `409` with `{ error }` on a refusal.
- `GET /api/images/:id/filesystem/subtree-download?path=...` → streams a subtree's freshly built tar
  archive as a browser download from `openSubtreeArchiveDownload` (REQ-61); `404` when not extracted,
  `409` with `{ error }` on a refusal.
- `GET /api/images/diff/stream?a=...&b=...` → server-sent events driving `compareImageFilesystems`
  for images `a` and `b`: `progress` (one per `ImageDiffProgress`), `result` (the final
  `ImageFilesystemDiff`, sent just before `end`), `end`, or `error` (`{ message }`) if it fails
  (REQ-63, REQ-64). Disconnecting cancels the in-flight comparison (and any extraction it started).
- `GET /api/images/diff/entries?a=...&b=...[&path=...]` → `{ path, entries }`, the direct children
  of `path` (root when omitted) from `listDiffChildren` for the pair `(a, b)`; `404` when this pair
  has not been compared yet.

## Rules and invariants

- A `DockerDaemonError` from any service answers with its `statusCode` (default 502) and its own
  message; any other failure answers `500` with the failure's message.
- Every `path` query param on the five in-tree operation endpoints above is itself validated against
  the extracted tree (`FilesystemContainment.resolveRequestPath`) before it drives any lookup,
  answering `400` with the refusal's reason when it carries an absolute path or a `../` segment
  (REQ-62).

## Dependencies

- image-analysis: LayerMetadataService, SharedLayerService, ChangesetService,
  FilesystemExtractionService, FilesystemContainment, FilesystemEntryService,
  FilesystemContentService, FilesystemSearchService, FilesystemExportService, ImageDiffService
- images: `sanitizeTarFilename` (reused for the subtree archive's download filename)
- docker-access: DockerDaemonError

## Requirements served

- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-48
- plan-docker_management_app/REQ-49
- plan-docker_management_app/REQ-50
- plan-docker_management_app/REQ-51
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
- plan-docker_management_app/REQ-63
- plan-docker_management_app/REQ-64
- plan-docker_management_app/REQ-113
