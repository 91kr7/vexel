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

- Reads when `id` changes — the layer explorer being opened on an image — and at no other moment
  (REQ-47, REQ-50). There is nothing else to follow: an image's `id` is the digest of its content,
  so the layer stack of one `id` cannot change. A different stack is a different image, and that is
  an `id` change (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2).
- It subscribes to no daemon event and to no manual reload signal, and needs neither: both would
  re-read a result that cannot have moved.
- `refresh()` is exposed to the caller all the same, which offers it as the retry of a failed read.

## Dependencies

- Image layers client (fetchImageLayerStack)

## Requirements served

- plan-docker_management_app/REQ-47
- plan-docker_management_app/REQ-48
- plan-docker_management_app/REQ-50
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2
