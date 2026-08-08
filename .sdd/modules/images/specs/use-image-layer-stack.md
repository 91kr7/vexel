---
module: images
component: useImageLayerStack
type: frontend hook
---

# useImageLayerStack

**Purpose** → the client-side read surface for a single image's layer stack.

## Contract

- `useImageLayerStack(id: string | undefined): { stack?: ImageLayerStack, loaded: boolean, error?:
  string, refresh: () => void }`
  - Returns an empty, unloaded result and performs no fetch while `id` is `undefined` (no image
    selected / layer explorer closed).
  - `loaded` becomes `true` once the fetch for the current `id` has settled.
  - `error` carries the last fetch failure's message; cleared on the next successful fetch.
  - `refresh()` re-reads the current `id`'s layer stack immediately.

## Rules and invariants

- Re-reads when `id` changes and whenever an `image`-typed daemon event arrives (REQ-47, REQ-50).

## Dependencies

- Image layers client (fetchImageLayerStack)
- events: subscribeToDaemonEvents

## Requirements served

- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-48
- plan-docker_management_app/REQ-50
