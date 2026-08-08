---
module: images
component: Image layers client
type: frontend data client
---

# Image layers client

**Purpose** → typed `fetch` wrapper for the layer stack endpoint, and the URL builder for the
changeset analysis progress stream (REQ-47–51).

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
  sizeUnavailableReason? }`.

## Rules and invariants

- A non-2xx response's error carries the server's own `error` message when the body is JSON with
  one, otherwise a generic `Request failed with HTTP <status>` message.

## Requirements served

- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-48
- plan-docker_management_app/REQ-49
- plan-docker_management_app/REQ-50
- plan-docker_management_app/REQ-51
