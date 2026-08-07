---
module: images
component: useImageInspect
type: frontend hook
---

# useImageInspect

**Purpose** → the client-side read surface for a single image's inspect data.

## Contract

- `useImageInspect(id: string | undefined): { inspect?: ImageInspect, loaded: boolean, error?:
  string, refresh: () => void }`
  - Returns an empty, unloaded result and performs no fetch while `id` is `undefined` (no image
    selected).
  - `loaded` becomes `true` once the fetch for the current `id` has settled.
  - `error` carries the last fetch failure's message; cleared on the next successful fetch.
  - `refresh()` re-reads the current `id`'s inspect data immediately.

## Rules and invariants

- Re-reads when `id` changes and whenever an `image`-typed daemon event arrives (REQ-40).

## Dependencies

- Images client (fetchImageInspect)
- events: subscribeToDaemonEvents

## Requirements served

- plan-docker_management_app/REQ-40
