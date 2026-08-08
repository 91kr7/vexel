---
module: builders
component: BuildCacheUsageService
type: backend service
---

# BuildCacheUsageService

**Purpose** → the reverse of the layer-to-cache association: from a build-cache record, the local
images and layers it relates to, or the stated reason none can be named (REQ-69).

## Contract

- `getBuildCacheUsage(recordId): Promise<BuildCacheUsage | undefined>`
  - `undefined` → no record in the inventory carries that id.
  - `BuildCacheUsage`: `{ record, references, unavailableReason?, unavailableDetail? }`.
  - `BuildCacheLayerReference`: `{ imageId, imageShortId, tags, layerIndex, diffId?, instruction,
    command? }` — one per layer of a local image whose build step matches the record.
  - `unavailableReason` / `unavailableDetail` — present exactly when `references` is empty;
    `unavailableDetail` is the sentence shown to the operator.
  - reason pseudocode:
    ```
    if the record's type is not "regular"    → "NonLayerCacheRecord" (naming the type: build input,
                                                not an image layer)
    else if it carries no usable description → "NoRecordedDescription"
    else if no local image's step matches it → "NoMatchingImage"
    else                                      → references
    ```
  - rejects with the CLI's own message when the cache inventory itself cannot be read.

## Rules and invariants

- The lookup walks the local image list, reading a few images' layer stacks at a time rather than
  all at once.
- An image whose layer stack cannot be read (e.g. removed mid-walk) contributes nothing and never
  fails the lookup.
- Empty layers are never referenced: they produce no cache record.
- An unknown record id is answered as `undefined`, not as an error: naming it is the caller's job.

## Dependencies

- builders: BuildCacheService
- image-analysis: LayerMetadataService, BuildStepMatching
- images: ImagesService

## Requirements served

- plan-docker_management_app/REQ-69
