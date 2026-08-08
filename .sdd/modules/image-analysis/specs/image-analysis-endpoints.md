---
module: image-analysis
component: Image analysis endpoints
type: REST endpoint
---

# Image analysis endpoints

**Purpose** → exposes the layer stack (with shared-layer markers), a cancellable changeset analysis
progress stream, and the runtime-independent filesystem extraction/tree-read pair, to the client
(REQ-47–56, REQ-113).

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

## Rules and invariants

- A `DockerDaemonError` from any service answers with its `statusCode` (default 502) and its own
  message; any other failure answers `500` with the failure's message.

## Dependencies

- image-analysis: LayerMetadataService, SharedLayerService, ChangesetService,
  FilesystemExtractionService
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
- plan-docker_management_app/REQ-113
