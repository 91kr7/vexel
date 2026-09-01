---
module: containers
component: useContainers
type: frontend hook
---

# useContainers

**Purpose** → the client-side read surface for the container list, kept current without the caller
managing polling or event subscriptions itself.

## Contract

- `useContainers(): { containers: ContainerSummary[], loaded: boolean, error?: string, refresh: ()
  => void }`
  - `containers` starts empty and is replaced by the server's list once the initial fetch resolves.
  - `loaded` becomes `true` once the initial fetch has settled (successfully or not).
  - `error` carries the last fetch failure's message; cleared on the next successful fetch.
  - `refresh()` re-reads the list immediately.

## Rules and invariants

- Re-reads on a 3-second poll — the declared figure, multiplied by the page's timing scale — and
  whenever a `container`-typed daemon event arrives (REQ-19), so the
  list reflects a lifecycle change without the operator refreshing.
- Does not re-read for a `resize`, `exec_create`, `exec_start`, `exec_die`, `exec_detach` or `top`
  action: these fire on every terminal resize or exec lifecycle step of an open exec/attach session
  (REQ-34, REQ-35) without changing anything the container list displays, so refetching on them
  would starve the UI with an unbounded refresh loop.
- Re-reads from scratch when another context becomes the active one: the list belonged to the
  daemon left behind (REQ-93).
- Re-reads on the manual reload signal, and that signal waits for this read: when the
  operator's refresh ends, the screen is already showing the reloaded data. The read replaces
  the data in place — nothing is closed, navigated or reset (plan-docker_management_app-refresh_cache-manual_refresh/REQ-11,
  plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- Containers client (fetchContainers)
- events: subscribeToDaemonEvents
- contexts: Active-context broadcast
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-20
- plan-docker_management_app/REQ-21
- plan-docker_management_app/REQ-22
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
