---
module: containers
component: useContainerDetail
type: frontend hook
---

# useContainerDetail

**Purpose** → the client-side read surface for a single container's inspect data, without the
caller managing the fetching itself.

## Contract

- `useContainerDetail(id?: string): { inspect?: ContainerInspect, loaded: boolean, error?: string,
  refresh: () => void }`
  - `inspect` is `undefined` until the first fetch for the current `id` resolves, and whenever `id`
    is `undefined` (no container selected).
  - `loaded` becomes `true` once the initial fetch for the current `id` has settled (successfully
    or not); it resets to `false` whenever `id` changes.
  - `error` carries the last fetch failure's message; cleared on the next successful fetch.
  - `refresh()` re-reads the current `id`'s inspect data immediately; a no-op when `id` is
    `undefined`.

## Rules and invariants

- Reads when `id` changes — the detail being opened on a container — and when the operator asks for
  a refresh, and at no other moment. A daemon event triggers nothing, so a container stopped from a
  terminal leaves the open detail showing what it last read, and nothing on screen says so
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2,
  plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-10).
- A configuration update made in the detail itself re-reads through `refresh()`, as it always has
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-9).
- Re-reads on the manual reload signal, and that signal waits for this read: an open detail
  view shows the reloaded data when the operator's refresh ends. Its object scope is unchanged,
  and the view is neither closed nor reset
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-12, plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- Containers client (fetchContainerInspect)
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-24
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-2
- plan-docker_management_app/REQ-25
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-12
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
