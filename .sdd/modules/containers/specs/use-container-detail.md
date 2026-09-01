---
module: containers
component: useContainerDetail
type: frontend hook
---

# useContainerDetail

**Purpose** → the client-side read surface for a single container's inspect data, without the
caller managing the fetching itself.

## Contract

- `useContainerDetail(id?: string, options?: { shown?: boolean }): { inspect?: ContainerInspect,
  loaded: boolean, error?: string, refresh: () => void }`
  - `shown` — whether a tab showing the inspect data is the one on screen; `true` when the caller
    says nothing.
  - `inspect` is `undefined` until the first fetch for the current `id` resolves, and whenever `id`
    is `undefined` (no container selected).
  - `loaded` becomes `true` once the initial fetch for the current `id` has settled (successfully
    or not); it resets to `false` whenever `id` changes.
  - `error` carries the last fetch failure's message; cleared on the next successful fetch.
  - `refresh()` re-reads the current `id`'s inspect data immediately; a no-op when `id` is
    `undefined`.
- The clock: one interval of **3 000 ms**, declared through the client's timing scale as
  `cadence(3000)` — the period the container listing behind the detail's header polls at — running
  only while `shown`, and cleared when it stops being true or when the caller unmounts.

## Rules and invariants

- **The clock is scoped to the data being on screen**
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-26,
  …-client_event_refresh_removal/REQ-28): while `shown` is false nothing is read at all, and the
  moment it becomes true the data is read once and the interval starts. The detail's header and the
  payload under it therefore describe the same moment, never two
  (…-client_event_refresh_removal/REQ-25).
- **A read that comes back the same as what is held replaces nothing**
  (…-client_event_refresh_removal/REQ-29): `inspect` keeps its identity, so nothing downstream is
  redrawn and what the operator has opened, typed, selected or scrolled to stays as it was. Only a
  read that differs replaces.
- **A read that fails leaves the last one in place** (…-client_event_refresh_removal/REQ-32):
  `inspect` is untouched and the message is reported through `error`, exactly as a failed manual
  refresh is. A container that has ceased to exist is reported the way it always was.
- Reads when `id` changes — the detail being opened on a container — on the clock, when the operator
  asks for a refresh, and on the reload signal. A daemon event triggers nothing
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1,
  …-client_event_refresh_removal/REQ-34).
- **Nothing announces the clock** (…-client_event_refresh_removal/REQ-35): no indicator, no "last
  updated", no control, no setting. The values change where they stand.
- A configuration update made in the detail itself re-reads through `refresh()`, as it always has
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-9).
- Re-reads on the manual reload signal, and that signal waits for this read: an open detail
  view shows the reloaded data when the operator's refresh ends. Its object scope is unchanged,
  and the view is neither closed nor reset
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-12,
  plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).
- A read that settles after the caller unmounted updates nothing.

## Dependencies

- Containers client (fetchContainerInspect)
- timing-scale: Client timing scale (`cadence`)
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-25
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-12
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-25
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-26
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-28
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-29
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-32
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-33
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-34
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-35
