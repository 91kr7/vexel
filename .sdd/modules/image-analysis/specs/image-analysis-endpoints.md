---
module: image-analysis
component: Image analysis endpoints
type: REST endpoint
---

# Image analysis endpoints

**Purpose** → exposes the layer stack (with shared-layer markers) and a cancellable changeset
analysis progress stream to the client (REQ-47–51).

## Contract

- `GET /api/images/:id/layers` → `{ imageId, layers }`, one entry per `LayerMetadataService` layer
  plus `sharedWith: SharingImage[]` (from `SharedLayerService`, empty when the layer has no known
  diff id or shares with nothing).
- `GET /api/images/:id/changesets/stream` → server-sent events driving `computeImageChangesets`:
  `progress` (one per `ChangesetProgress`), `result` (the final `ImageChangesets`, sent just before
  `end`), `end`, or `error` (`{ message }`) if it fails. Disconnecting cancels the in-flight
  analysis.

## Rules and invariants

- A `DockerDaemonError` from either service answers with its `statusCode` (default 502) and its own
  message; any other failure answers `500` with the failure's message.

## Dependencies

- image-analysis: LayerMetadataService, SharedLayerService, ChangesetService
- docker-access: DockerDaemonError

## Requirements served

- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-48
- plan-docker_management_app/REQ-49
- plan-docker_management_app/REQ-50
- plan-docker_management_app/REQ-51
