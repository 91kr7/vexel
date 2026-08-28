---
module: images
component: useImageBuildCacheTrace
type: frontend hook
---

# useImageBuildCacheTrace

**Purpose** → reads one image's layer-to-build-cache association for the layer explorer (REQ-68).

## Contract

- `useImageBuildCacheTrace(id?): { trace?, loaded, error?, refresh }`
  - `id` undefined → no request is made and the result stays empty (`trace` undefined,
    `loaded` false); this is how a closed explorer costs nothing.
  - `id` given → reads it once, and again on every `id` change and on `refresh()`.
  - `error` → the server's own message; cleared by a later successful read.
  - `loaded` → true once a read has settled, whether it succeeded or failed.

## Rules and invariants

- Changing `id` clears the previous image's trace before the new read, so no layer is ever shown
  against another image's cache records.
- A layer whose association does not exist is not an error: it arrives inside `trace` carrying its
  own reason.
- A read that settles after the hook is unmounted or after `id` changed is discarded.
- Re-reads on the manual reload signal, and that signal waits for this read: an open detail
  view shows the reloaded data when the operator's refresh ends. Its event filter and its
  object scope are unchanged, and the view is neither closed nor reset
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-12, plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- images: Image layers client (`fetchImageBuildCacheTrace`)
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-68
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-12
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
