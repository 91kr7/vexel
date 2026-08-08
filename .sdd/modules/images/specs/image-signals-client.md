---
module: images
component: Image signals client
type: frontend data client
---

# Image signals client

**Purpose** → typed URL builder for the layer-efficiency and secret-signal analysis progress stream
(REQ-65, REQ-66, REQ-67).

## Contract

- `imageSignalsStreamUrl(id): string` — builds `/api/images/{id}/signals/stream`; consumed with
  `useImageSignalsStream`.
- `LayerSignals`: `{ imageId, waste: LayerWasteAnalysis, duplicates: LayerDuplicateAnalysis, secrets:
  LayerSecretScan }`.
- `LayerWasteAnalysis`: `{ imageId, wastedFiles, totalWastedBytes, totalBytesWritten,
  efficiencyScore }`; `WastedFile`: `{ path, layerIndex, sizeBytes, supersededByLayerIndex, reason:
  'overwritten' | 'deleted' }`.
- `LayerDuplicateAnalysis`: `{ imageId, duplicates, totalDuplicateWastedBytes }`;
  `DuplicateContentGroup`: `{ contentHash, sizeBytes, paths: { path, layerIndex }[], wastedBytes }`.
- `LayerSecretScan`: `{ imageId, findings }`; `SecretFinding`: `{ path, patternName,
  introducedLayerIndex, removedLayerIndex? }`.

## Requirements served

- plan-docker_management_app/REQ-65
- plan-docker_management_app/REQ-66
- plan-docker_management_app/REQ-67
