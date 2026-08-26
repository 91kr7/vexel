---
module: containers
component: ContainerProcessesView
type: UI component
---

# ContainerProcessesView

**Purpose** → the processes running inside a container, listed with pid, user and command, and
re-read only when the operator asks.

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
  container" when the listing came back empty.
- a failure banner carrying the error message verbatim, with a retry, instead of the table.

Actions:

- "Refresh" → re-reads the listing; it is disabled and labelled "Refreshing…" while a read is in
  flight.
- retry on the failure banner → re-reads the listing.

## Rules and invariants

- The listing is read once when the view opens and afterwards only on an explicit refresh: it never
  polls (REQ-33).
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
- Nothing about the data changes with either: one read when the view opens, one per explicit
  refresh, the same endpoint and the same payload.

## Dependencies

- useContainerProcesses
- ui-library: BandStack, DataTable, MetaCell (and `LOAD_ATTENTION_PERCENT`), Button, Row, Spacer,
  ErrorBanner, EmptyState

## Requirements served

- plan-docker_management_app/REQ-33
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-32
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-33
