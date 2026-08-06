---
module: containers
component: ContainersScreen
type: UI component
---

# ContainersScreen

**Purpose** → the Containers screen: every container with its lifecycle actions, rename, bulk prune
and text/state filtering.

## Contract

- `<ContainersScreen containers loaded error? onRefresh />` — `containers: ContainerSummary[]`,
  `onRefresh: () => void` re-reads the list (the caller, the Shell, owns `useContainers()`).

Description:
- A `ScreenToolbar` with a "Prune stopped" destructive action and a filters row (a `SearchField` and
  state `FilterChips`: all/running/stopped/paused), above a `DataTable` of every container matching
  the current search/filter.
Shows:
- One row per matching container: a state-tone status dot, name over short id · state, image, CPU
  %, memory used/limit, published ports (`publicPort→privatePort`, `–` when none), the daemon's own
  uptime/status text, and a lifecycle action group.
- The lifecycle actions shown depend on the container's state (REQ-20):
  - `running` → rename, stop, pause, restart, kill, rm.
  - `paused` → rename, unpause, restart, kill, rm.
  - `restarting` → rename, kill, rm.
  - `created` / `exited` / `dead` / `removing` → rename, start, rm.
- An empty/loading state inside the table area when there are no matching containers.
Actions:
- Any non-destructive lifecycle action (start, stop, pause, unpause, restart) runs immediately
  through `useProgress().run` and re-reads the list on completion.
- `kill`, `rm` and "Prune stopped" go through `useConfirmation().confirm()` first; cancelling
  performs nothing. "Prune stopped" reports the removed count and reclaimed space via `useToast()`
  on success. Any failure reports the daemon's own message via `useErrorReporter()`.
- `rename` replaces the name cell with an inline text field (pre-filled with the current name);
  submitting (Enter or the save icon) renames the container and re-reads the list; the cancel icon
  discards the edit. Submitting an unchanged or empty value is a no-op.
- The search field matches name, image or state (case-insensitive substring); state chips narrow to
  running / stopped (`created`, `exited`, `dead`) / paused (`paused`, `restarting`) / all.

## Rules and invariants

- A row's action buttons disable while that row's own action is in flight, so a second click cannot
  race the first.
- "Prune stopped" is disabled when no container is currently stopped.

## Dependencies

- ui-library: ScreenToolbar, SearchField, FilterChips, DataTable, StatusDotCell, TwoLineCell,
  MetaCell, ActionButtonGroup, TextField, IconButton, Card, ErrorBanner, EmptyState, Row, Stack,
  useToast
- Containers client
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-20
- plan-docker_management_app/REQ-21
- plan-docker_management_app/REQ-22
- plan-docker_management_app/REQ-23
- plan-docker_management_app/REQ-109
