---
module: containers
component: useContainerProcesses
type: frontend hook
---

# useContainerProcesses

**Purpose** → reads the processes running inside a container and follows them, on the same clock as
the inspect data beside them, while the listing is on screen.

## Contract

- `useContainerProcesses(id?: string, options?: { running?: boolean }):
  { processes: ContainerProcess[], titles: string[], loaded: boolean, loading: boolean,
    error?: string, refresh: () => void }`
  - `running` — whether the container is in the daemon's running set (the caller's judgement);
    `true` when the caller says nothing.
  - `loaded` — true once a first attempt has completed for the current `id`, successful or not, and
    true as soon as `running` is false (see below).
  - `loading` — true while a read is in flight (including the first one).
  - `error` — the failure's message; cleared by a successful read.
  - `refresh()` — re-reads the listing for the current `id`; a no-op when `id` is `undefined`.
- The clock: one interval of **3 000 ms**, declared through the client's timing scale as
  `cadence(3000)` — the same figure the inspect data runs on — running only while the caller is
  mounted and `running` is true, and cleared when either stops holding.

## Rules and invariants

- **The clock is scoped to the listing being on screen**
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-27,
  …-client_event_refresh_removal/REQ-28). The scoping is the caller's mount: the only consumer,
  `ContainerProcessesView`, is drawn only while the Processes tab is the active one, so no reading
  is taken on any other tab. The listing is read the moment that view opens, and again on each tick.
- **A container that is not running is asked for nothing at all**
  (…-client_event_refresh_removal/REQ-27): with `running` false no read is taken, and the listing is
  empty and settled — `loaded` true, no error — so the view reads "no process is running" rather
  than a listing that outlived the container's processes. An explicit ask still reads: `refresh()`
  and the reload signal call the endpoint whatever the state, which is how a stopped container still
  reports the daemon's own refusal verbatim (…-client_event_refresh_removal/REQ-34).
- **A read that comes back the same as what is held replaces nothing**
  (…-client_event_refresh_removal/REQ-29): `processes` and `titles` keep their identity, so the
  table is not redrawn and the operator's place in a long listing is kept.
- **A read that fails leaves the held listing in place** (…-client_event_refresh_removal/REQ-32) and
  reports the message through `error`, which is what the view draws instead of the table — the
  failure is told exactly as it was before the clock. This **replaces** the earlier rule that a
  failed read emptied the listing: under a clock, one failed tick would otherwise throw away a
  listing that is still the last thing known.
- Changing `id` empties the previous container's listing before the new read.
- Results arriving after the caller unmounted are discarded.
- **Nothing announces the clock** (…-client_event_refresh_removal/REQ-35): the tab keeps the refresh
  control it already offers and gains no indicator, no "last updated" and no setting.
- Re-reads on the manual reload signal, and that signal waits for this read: an open detail
  view shows the reloaded data when the operator's refresh ends. Its event filter and its
  object scope are unchanged, and the view is neither closed nor reset
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-12,
  plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- Container stats client (fetchContainerProcesses, ContainerProcess)
- timing-scale: Client timing scale (`cadence`)
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-33
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-12
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-27
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-28
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-29
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-32
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-33
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-34
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-35
