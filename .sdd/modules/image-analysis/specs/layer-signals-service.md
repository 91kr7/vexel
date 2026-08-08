---
module: image-analysis
component: LayerSignalsService
type: backend service
---

# LayerSignalsService

**Purpose** → the single job behind the layer-efficiency and secret-signal view: runs (or reuses the
cached result of) the batch-13 changeset analysis job, then derives waste, duplicate-content and
secret-pattern findings from it (REQ-65, REQ-66, REQ-67), sharing that job's cache with the layer
explorer.

## Contract

- `analyzeLayerSignals(imageId, handlers): Promise<() => void>`
  - `handlers`: `{ onProgress(progress), onError(message), onEnd(result) }`; `progress` is
    `ChangesetProgress`, unchanged from ChangesetService.
  - `onEnd(result)`: `LayerSignals`: `{ imageId, waste: LayerWasteAnalysis, duplicates:
    LayerDuplicateAnalysis, secrets: LayerSecretScan }`.
  - Returns a cancel function with the same semantics as `computeImageChangesets`.

## Rules and invariants

- Delegates entirely to `computeImageChangesets` for progress, caching and cancellation; the three
  findings categories are derived synchronously once it ends, adding no further progress phase.
- `onError` and `onEnd` are mutually exclusive and each fires at most once per call.

## Dependencies

- image-analysis: ChangesetService, LayerWasteAnalysis, LayerDuplicateDetection, SecretPatternScan

## Requirements served

- plan-docker_management_app/REQ-65
- plan-docker_management_app/REQ-66
- plan-docker_management_app/REQ-67
