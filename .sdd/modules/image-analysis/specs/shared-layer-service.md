---
module: image-analysis
component: SharedLayerService
type: backend service
---

# SharedLayerService

**Purpose** → finds, for a set of layer diff ids, which other local images reference the same
content-addressed layer, so the layer stack can mark it as shared (REQ-50).

## Contract

- `getSharedLayerImages(imageId, diffIds): Promise<Record<string, SharingImage[]>>`
  - `SharingImage`: `{ id, tags }`.
  - Returns one entry per requested diff id, listing every other local image (`id` different from
    `imageId`) whose own `RootFS.Layers` contains it; an empty array when no other image shares it.
  - `diffIds` empty → resolves immediately with an empty map, no daemon calls made.

## Rules and invariants

- An image whose own inspect call fails is treated as sharing nothing rather than failing the whole
  lookup.
- `imageId` itself is never listed as one of its own layers' sharing images.

## Dependencies

- docker-access: EngineClient (via `getEngineClient()`)
- images: ImagesService (`listImages`)

## Requirements served

- plan-docker_management_app/REQ-50
