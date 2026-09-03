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

- Reads when `id` changes — the detail being opened on an image — and when the operator asks for a
  refresh, and at no other moment (REQ-40). A daemon event triggers nothing, so an image changed
  elsewhere leaves the open detail showing what it last read, and nothing on screen says so
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-10).
- Re-reads on the manual reload signal, and that signal waits for this read: an open detail
  view shows the reloaded data when the operator's refresh ends. Its object scope is unchanged,
  and the view is neither closed nor reset
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-12, plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- Images client (fetchImageInspect)
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-40
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-12
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
