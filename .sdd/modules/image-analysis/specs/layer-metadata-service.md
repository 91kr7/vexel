---
module: image-analysis
component: LayerMetadataService
type: backend service
---

# LayerMetadataService

**Purpose** → assembles an image's ordered layer stack from its manifest and config — never from
`docker history` text output alone — so a registry-pulled image still shows every layer with
whatever the daemon can report about it (REQ-47, REQ-48).

## Contract

- `getImageLayerStack(imageId): Promise<ImageLayerStack>` — via `GET /images/{imageId}/json` (for
  `RootFS.Layers`, the ordered content-addressed diff ids) and `GET /images/{imageId}/history` (for
  the per-build-step size and recorded command).
  - `ImageLayerStack`: `{ imageId, layers }`.
  - `LayerMetadata`: `{ index, diffId?, diffIdUnavailableReason?, uncompressedSizeBytes,
    compressedSizeBytes?, compressedSizeUnavailableReason?, emptyLayer, instruction, command?,
    commandUnavailableReason? }`.
  - `index` — position in build order (oldest/base first). The daemon's `GET
    .../history` itself answers newest-layer-first (verified against a running daemon on
    `hello-world` and `postgres:16`); the service reverses it to base-first before assigning `index`,
    so `index: 0` is always the base layer.
  - `diffId` — the layer's content-addressed digest, assigned from `RootFS.Layers` (already
    base-first) in order to every non-empty history entry, walked in the same base-first order;
    `diffIdUnavailableReason` explains why it is missing (an empty layer carries none, or the
    manifest reported fewer diff ids than non-empty steps).
  - `uncompressedSizeBytes` — the history entry's own `Size` (REQ-47).
  - `compressedSizeBytes` — always `undefined` for an image stored locally, with
    `compressedSizeUnavailableReason` explaining that only the uncompressed size is available
    locally (REQ-48).
  - `emptyLayer` — `true` when the step's `Size` is `0`.
  - `instruction` — the Dockerfile instruction parsed out of the step's `CreatedBy` (e.g. `COPY`,
    `RUN`, `EXPOSE`); a `#(nop)` step's instruction is the token following the marker, a step
    without it is `RUN`, and an empty `CreatedBy` yields `UNKNOWN` with `commandUnavailableReason`
    set.
  - `command` — the step's full, unmodified `CreatedBy` text (REQ-47's "full recorded command text
    where available"); `undefined` alongside `commandUnavailableReason` when the daemon recorded
    none.

## Rules and invariants

- History is reversed to base-first before any pairing happens; `diffId` assignment then consumes
  `RootFS.Layers` in order, one entry per non-empty history step in that base-first walk, and an
  empty step never consumes one.
- Every call rejects with a `DockerDaemonError` carrying the daemon's own message on failure.

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`)

## Requirements served

- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-48
