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

- Re-reads when `id` changes and whenever an `image`-typed daemon event **about that same image**
  arrives (REQ-40, plan-docker_management_app-refresh_cache/REQ-8).
- An `image` event about another image is ignored: the daemon is not asked about the shown image
  (plan-docker_management_app-refresh_cache/REQ-7). The event is attributed by its `actorId`; one
  carrying none is treated as about the shown image, so no change is ever missed.
- Re-reads on the manual reload signal, and that signal waits for this read: an open detail
  view shows the reloaded data when the operator's refresh ends. Its event filter and its
  object scope are unchanged, and the view is neither closed nor reset
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-12, plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- Images client (fetchImageInspect)
- events: subscribeToDaemonEvents, daemonEventConcerns
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-40
- plan-docker_management_app-refresh_cache/REQ-7
- plan-docker_management_app-refresh_cache/REQ-8
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-12
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
