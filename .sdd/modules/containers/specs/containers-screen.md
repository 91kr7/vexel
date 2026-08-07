---
module: containers
component: ContainersScreen
type: UI component
---

# ContainersScreen

**Purpose** → the Containers screen: every container with its state-transition lifecycle actions, an
inline rename affordance on its name, bulk prune and text/state filtering; exec/attach are reached
through the row's detail panel.

## Contract

- `<ContainersScreen containers loaded error? onRefresh images? imagesLoaded? />` —
  `containers: ContainerSummary[]`, `onRefresh: () => void` re-reads the list (the caller, the
  Shell, owns `useContainers()`); `images?: ImageSummary[]` are the local images the create/run
  form offers as suggestions.

Description:
- A `ScreenToolbar` with a "Run container…" primary action, a "Create from image…" secondary
  action, a "Prune stopped" destructive action and a filters row (a `SearchField` and
  state `FilterChips`: all/running/stopped/paused), above a `DataTable` of every container matching
  the current search/filter.
Shows:
- One row per matching container: a state-tone status dot, name over short id · state (with a
  rename icon action revealed on hover/focus next to the name), image, CPU %, memory used/limit,
  published ports (`publicPort→privatePort`, `–` when none, single line — truncates with the full
  list available as a tooltip when it does not fit), the daemon's own uptime/status text, and a
  lifecycle action group.
- The lifecycle actions shown depend on the container's state (REQ-20), state-transition actions
  only, at most 5, always fitting on a single line — never rename (which sits on the name cell
  instead), exec or attach, which live in the row's detail panel:
  - `running` → stop, pause, restart, kill, rm.
  - `paused` → start, unpause, restart, kill, rm.
  - `restarting` → kill, rm.
  - `created` / `exited` / `dead` / `removing` → start, rm.
- An empty/loading state inside the table area when there are no matching containers.
Actions:
- Any non-destructive lifecycle action (start, stop, pause, unpause, restart) runs immediately
  through `useProgress().run` and re-reads the list on completion.
- `kill`, `rm` and "Prune stopped" go through `useConfirmation().confirm()` first; cancelling
  performs nothing. "Prune stopped" reports the removed count and reclaimed space via `useToast()`
  on success. Any failure reports the daemon's own message via `useErrorReporter()`.
- The name cell's rename icon action (REQ-21) replaces the cell with an inline text field
  (pre-filled with the current name); submitting (Enter or the save icon) renames the container and
  re-reads the list; the cancel icon discards the edit. Submitting an unchanged or empty value is a
  no-op. The action is always reachable via Tab/keyboard even though it is only visually revealed on
  row hover or focus.
- "Run container…" and "Create from image…" both open the same `ContainerCreateForm` (REQ-27); the
  first makes "Create and start" the primary commit action, the second "Create only". A created
  container closes the form, becomes the selected row and the list is re-read; cancelling changes
  nothing.
- The search field matches name, image or state (case-insensitive substring); state chips narrow to
  running / stopped (`created`, `exited`, `dead`) / paused (`paused`, `restarting`) / all.
- Selecting a row (anywhere outside its action buttons) opens a `ContainerDetailPanel` inline below
  it (REQ-24); selecting the same row again, or its close control, closes it. A selected container
  that is removed from the daemon closes its detail panel; one merely filtered out of view stays
  selected (its panel reappears if the filter changes back). After a configuration change recreates
  the container, the panel stays open on the new container's id. A running container's `exec`/
  `attach` sessions (REQ-34, REQ-35) are reached as tabs of that same panel.

## Rules and invariants

- A row's action buttons disable while that row's own action is in flight, so a second click cannot
  race the first.
- "Prune stopped" is disabled when no container is currently stopped.

## Dependencies

- ui-library: ScreenToolbar, SearchField, FilterChips, DataTable, StatusDotCell, TwoLineCell,
  MetaCell, ActionButtonGroup, TextField, IconButton, Card, ErrorBanner, EmptyState, Row, Stack,
  useToast
- Containers client, Images client (`ImageSummary`)
- ContainerDetailPanel, ContainerCreateForm
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-20
- plan-docker_management_app/REQ-21
- plan-docker_management_app/REQ-22
- plan-docker_management_app/REQ-23
- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
- plan-docker_management_app/REQ-109
