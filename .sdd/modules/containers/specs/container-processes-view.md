---
module: containers
component: ContainerProcessesView
type: UI component
---

# ContainerProcessesView

**Purpose** → the processes running inside a container, listed with pid, user and command, and
followed while the tab is on screen.

## Contract

Description:

- `<ContainerProcessesView container />` — `container` is the `ContainerSummary` whose processes are
  listed.
- a header row (process count on the left, refresh action on the right) is a band of its own
  height; the table below it is the region that takes whatever height the tab offers, and scrolls
  inside itself.

Shows:

- one row per process: PID, User, Command, and the %CPU / %MEM readings when the daemon reports
  them (`–` when it does not).
- a `%CPU` reading at or above the library's own attention threshold drawn distinguished in its
  column, so the consuming process is found without reading every row. **That column and no other**:
  `%MEM` and the three text columns are drawn exactly as before.
- the number of processes once a listing has been read successfully.
- "Reading the process list…" until the first read completes, then "No process is running in this
  container" when the listing came back empty — and that same statement, without any read at all,
  while the container is not running.
- a failure banner carrying the error message verbatim, with a retry, instead of the table.

Actions:

- "Refresh" → re-reads the listing; it is disabled and labelled "Refreshing…" while a read is in
  flight.
- retry on the failure banner → re-reads the listing.

## Rules and invariants

- **The listing is read when the view opens and again every 3 000 ms while it is on screen**
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-27,
  …-client_event_refresh_removal/REQ-28): the view is drawn only while the Processes tab is the
  active one, so its mount is what scopes the clock, and no reading is taken from any other tab.
  This replaces the earlier rule that the listing never polls; the explicit refresh REQ-33 asks for
  stays exactly as it was (…-client_event_refresh_removal/REQ-34).
- **A container that is not running is asked for nothing at all**
  (…-client_event_refresh_removal/REQ-27): no read is taken and the tab states that no process is
  running, rather than listing processes the container no longer has. "Running" is the daemon's own
  running set — `running`, `paused` or `restarting`, the set the statistics stream uses
  (`container-stats-view.md`) — because a paused container's processes exist, frozen, and the daemon
  lists them. The refresh control still reads when it is pressed, and still reports the daemon's own
  refusal verbatim.
- **A tick that finds nothing changed redraws nothing**
  (…-client_event_refresh_removal/REQ-29, …-client_event_refresh_removal/REQ-30): the operator's
  place in a long, virtualised table is kept, and a tick that finds a difference replaces the rows
  where they stand.
- **The tab gained nothing the operator can see** (…-client_event_refresh_removal/REQ-35): no
  indicator, no "last updated", no setting — the count band and the refresh control are the ones it
  already had.
- **The table takes the height its tab offers and states none of its own.** With the dialog at its
  stable height the rows occupy what is left under the header band, no band of empty surface stands
  beneath the table, and the rows scroll and virtualise inside the table rather than in a window a
  third of its height. The view states no length at all: the `320px` it used to pin was a measure of
  the inline panel it was born in and moved into the dialog unrevisited. It is therefore **not a tab
  that scrolls as a document**: the detail hands it the region directly rather than wrapping it in a
  scroller, which would offer it no definite height to take.
- **The threshold and the tone are the library's, named rather than restated** — a distinguished
  reading is `MetaCell tone="attention"` at or above `LOAD_ATTENTION_PERCENT`, and the reasoning for
  the value is recorded in `table-cells.md`. The `–` shown where the daemon reports no reading is
  never toned: there is no reading to distinguish.
- Neither the height rule nor the tone changes what is read: the same endpoint, the same payload.

## Dependencies

- useContainerProcesses
- ui-library: BandStack, DataTable, MetaCell (and `LOAD_ATTENTION_PERCENT`), Button, Row, Spacer,
  ErrorBanner, EmptyState

## Requirements served

- plan-docker_management_app/REQ-33
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-32
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-33
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-27
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-28
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-29
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-30
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-34
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-35
