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
- a header row (process count on the left, refresh action on the right) above a dense table.

Shows:

- one row per process: PID, User, Command, and the %CPU / %MEM readings when the daemon reports
  them (`–` when it does not).
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
- The table scrolls within a bounded height rather than growing without limit.

## Dependencies

- useContainerProcesses
- ui-library: DataTable, MetaCell, Button, Row, Spacer, Stack, ErrorBanner, EmptyState

## Requirements served

- plan-docker_management_app/REQ-33
