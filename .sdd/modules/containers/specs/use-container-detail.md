---
module: containers
component: useContainerDetail
type: frontend hook
---

# useContainerDetail

**Purpose** → the client-side read surface for a single container's inspect data, kept current
without the caller managing fetching or event subscriptions itself.

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

- Re-reads whenever `id` changes and whenever a `container`-typed daemon event **about that same
  container** arrives, so the detail view reflects a lifecycle or configuration change without the
  operator refreshing (plan-docker_management_app-refresh_cache/REQ-8).
- A `container` event about another container is ignored: the daemon is not asked about the shown
  container, and the view does not change (plan-docker_management_app-refresh_cache/REQ-7). The
  event is attributed by its `actorId`; one carrying none is treated as about the shown container,
  so no change is ever missed.
- Does not re-read for a `resize`, `exec_create`, `exec_start`, `exec_die`, `exec_detach` or `top`
  action: these fire on every terminal resize or exec lifecycle step of an open exec/attach session
  (REQ-34, REQ-35) without changing anything the inspect payload reports, so refetching on them
  would starve the UI with an unbounded refresh loop.

## Dependencies

- Containers client (fetchContainerInspect)
- events: subscribeToDaemonEvents, daemonEventConcerns

## Requirements served

- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-25
- plan-docker_management_app-refresh_cache/REQ-7
- plan-docker_management_app-refresh_cache/REQ-8
