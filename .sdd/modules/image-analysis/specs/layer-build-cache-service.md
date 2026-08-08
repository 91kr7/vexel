---
module: image-analysis
component: LayerBuildCacheService
type: backend service
---

# LayerBuildCacheService

**Purpose** → pairs each layer of an image with the local build-cache record that produced it, and —
where that association genuinely does not exist — with the reason, so a registry-pulled image
answers with an explanation instead of an empty panel (REQ-68).

## Contract

- `getImageBuildCacheTrace(imageId): Promise<ImageBuildCacheTrace>`
  - `ImageBuildCacheTrace`: `{ imageId, layers }` — one `LayerBuildCacheLink` per layer of the
    image's layer stack, in the same order and with the same `layerIndex` as that stack.
  - `LayerBuildCacheLink`: `{ layerIndex, diffId?, instruction, command?, cacheRecord?,
    unavailableReason?, unavailableDetail? }`.
  - `cacheRecord` — the `BuildCacheRecord` (builders) behind the layer; present exactly when the
    association exists.
  - `unavailableReason` / `unavailableDetail` — present exactly when `cacheRecord` is absent;
    `unavailableDetail` is the sentence shown to the operator.
  - reason pseudocode, per layer:
    ```
    if the layer is empty                      → "MetadataOnlyStep"
    else if its command yields no comparable key → "NoRecordedCommand"
    else if the build cache could not be read   → "BuildCacheUnreadable" (carrying the CLI's message)
    else if the build cache holds no records    → "BuildCacheEmpty"
    else if no record matches the step          → "NoMatchingCacheRecord"
    else                                        → cacheRecord
    ```
  - `"NoMatchingCacheRecord"` states both possibilities in its detail: the image was not built on
    this host (the registry-pulled case), or its record has been pruned since.
  - rejects only when the image's own layer stack cannot be read → the daemon's own error.

## Rules and invariants

- A build cache the CLI cannot read never fails the call: it becomes every layer's stated reason,
  and the layer stack is still answered with.
- Only `regular` cache records stand for a layer-producing step; a record of any other type is never
  matched to a layer.
- Where two records carry the same build step, the first one the cache reports wins, so the answer
  is stable for a given cache listing.
- Every layer of the stack is present in the answer: none is dropped for having no association.

## Dependencies

- image-analysis: LayerMetadataService, BuildStepMatching
- builders: BuildCacheService

## Requirements served

- plan-docker_management_app/REQ-68
