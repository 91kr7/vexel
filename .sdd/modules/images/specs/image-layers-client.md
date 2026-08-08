---
module: images
component: Image layers client
type: frontend data client
---

# Image layers client

**Purpose** → typed `fetch` wrapper for the layer stack and layer-to-build-cache traceability
endpoints, and the URL builder for the changeset analysis progress stream (REQ-47–51, REQ-68).

## Contract

- `fetchImageLayerStack(id): Promise<ImageLayerStack>` — `GET /api/images/{id}/layers`.
  - `ImageLayerStack`: `{ imageId, layers }`.
  - `LayerMetadata`: `{ index, diffId?, diffIdUnavailableReason?, uncompressedSizeBytes,
    compressedSizeBytes?, compressedSizeUnavailableReason?, emptyLayer, instruction, command?,
    commandUnavailableReason?, sharedWith }`; `sharedWith: { id, tags }[]`.
- `imageChangesetsStreamUrl(id): string` — builds `/api/images/{id}/changesets/stream`; consumed
  with `useImageChangesetStream`.
- `ImageChangesets`: `{ imageId, layers }`; `LayerChangeset`: `{ layerIndex, diffId?, paths }`;
  `LayerChangesetPath`: `{ path, status: 'added' | 'modified' | 'deleted', sizeBytes?,
  sizeUnavailableReason?, contentHash? }` — `contentHash` is consumed by the layer-signals view
  (REQ-65, REQ-66) via Image signals client, not read directly here.

- `fetchImageBuildCacheTrace(id, signal?): Promise<ImageBuildCacheTrace>` —
  `GET /api/images/{id}/layers/build-cache`; aborting `signal` abandons the read, so a caller can
  supersede it.
  - `ImageBuildCacheTrace`: `{ imageId, layers }`.
  - `LayerBuildCacheLink`: `{ layerIndex, diffId?, instruction, command?, cacheRecord?,
    unavailableReason?, unavailableDetail? }`; `cacheRecord` is the `BuildCacheRecord` shape of
    Builders client, and is present exactly when `unavailableReason` is absent.
  - `LayerBuildCacheUnavailableReason`: `'MetadataOnlyStep' | 'NoRecordedCommand' |
    'BuildCacheUnreadable' | 'BuildCacheEmpty' | 'NoMatchingCacheRecord'`.

## Rules and invariants

- A layer with no association is not a failure: it arrives carrying its own reason, and
  `unavailableDetail` is the sentence the UI shows.
- A non-2xx response's error carries the server's own `error` message when the body is JSON with
  one, otherwise a generic `Request failed with HTTP <status>` message.

## Requirements served

- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-48
- plan-docker_management_app/REQ-49
- plan-docker_management_app/REQ-50
- plan-docker_management_app/REQ-51
- plan-docker_management_app/REQ-68
