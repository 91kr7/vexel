---
module: containers
component: ContainersScreen
type: UI component
---

# ContainersScreen

**Purpose** → the Containers screen: every container with three fixed lifecycle controls and an
overflow menu holding its secondary actions (rename, export filesystem, kill, remove), bulk prune
and text/state filtering; exec/attach are reached through the row's detail panel.

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
- One row per matching container: a state-tone status dot, name over short id · state (no action on
  the name cell), image, CPU %, memory used/limit, published ports (`publicPort→privatePort`, `–`
  when none, single line — truncates with the full list available as a tooltip when it does not
  fit), the daemon's own uptime/status text, and an action area of exactly four controls and nothing
  else.
- **Three lifecycle slots, fixed in number, order and position on every row and in every state** —
  the state-appropriate run/halt action, then `Pause`, then `Restart`. An action the state does not
  allow keeps its slot, disabled, stating why. The legality is the one the row already offered:
  nothing became legal here that the product did not allow before.

  | state | slot 1 | slot 2 (`Pause`) | slot 3 (`Restart`) |
  | --- | --- | --- | --- |
  | `running` | `Stop` | enabled | enabled |
  | `paused` | `Resume` | disabled — already paused | enabled |
  | `restarting` | `Stop`, disabled — restarting | disabled — restarting | disabled — restarting |
  | `created` / `exited` / `dead` / `removing` | `Start` | disabled — not running | disabled — not running |

- **One overflow control, always the fourth and last**, on every row in every state. Its menu holds
  exactly four entries, always all four, always in this order: `Rename…`, `Export filesystem…`,
  then — set apart as a group and in the destructive tone — `Kill` (hint `SIGKILL`) and `Remove`
  (hint `rm`). There is no `Duplicate config`. `Kill` is enabled for `running`, `paused` and
  `restarting` and disabled elsewhere with its reason; the other three are enabled in every state.
- An empty/loading state inside the table area when there are no matching containers.
Actions:
- Any non-destructive lifecycle action (start, stop, pause, unpause, restart) runs immediately
  through `useProgress().run` and re-reads the list on completion.
- `Kill`, `Remove` and "Prune stopped" go through `useConfirmation().confirm()` first; cancelling
  performs nothing. The menu is a step in front of that confirmation, never a substitute for it, and
  the confirmation, the progress line and the failure message all still read the operation's own
  name (`kill`, `rm`, `stop`, …) rather than the control's label. "Prune stopped" reports the removed
  count and reclaimed space via `useToast()` on success. Any failure reports the daemon's own message
  via `useErrorReporter()`.
- `Rename…` (REQ-21) replaces the name cell with an inline text field (pre-filled with the current
  name); submitting (Enter or the save icon) renames the container and re-reads the list; the cancel
  icon discards the edit. Submitting an unchanged or empty value is a no-op.
- `Export filesystem…` immediately triggers a browser download of the container's current filesystem
  named `<container name>.tar` via `triggerDownload`, and reports a "Download started" toast naming
  the file (REQ-43): the browser owns the download and its own progress from there, so no dialog is
  opened. This is the only place the export is offered; the detail panel no longer offers it.
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

- A row's controls disable while that row's own action is in flight, so a second click cannot race
  the first: the three lifecycle buttons and all four menu entries state that another action on the
  container is still running. The overflow control itself stays operable, so that reason can be
  read.
- Every disabled control — button or menu entry — carries the reason it is unavailable, so a greyed
  control is legible as "not now, because…" rather than as broken.
- The row's action area is the row's only action-bearing area: nothing else on the row is clickable
  except the row itself, which opens the detail panel. A click on any of the four controls never
  also selects the row.
- A menu's entries are bound to the container its row was rendered for, so the list re-reading or
  re-sorting under an open menu can never point an entry at another container; the menu belongs to
  the row's identity (the container id) and goes with it if that container leaves the list.
- The list keeps re-reading from daemon events at its usual rate while a menu is open: nothing is
  paused, throttled or debounced for the menu's benefit.
- This screen contributes no markup and no styling of its own: the four controls are one
  `ActionButtonGroup` with its trailing `Menu`.
- "Prune stopped" is disabled when no container is currently stopped.
- This screen deliberately carries no multi-select checkbox column or `BulkActionBar`: "Prune
  stopped" acts on every stopped container at once, with no per-row selection to drive. REQ-3's
  "same visual language" as the Images table (batch 31's remediation) means identical `DataTable`
  row height, header style, column typography, hover and selected treatment — not an identical
  column set between two screens listing different kinds of object; see `images-screen.md`'s own
  note on its (Images-only) selection column.

## Dependencies

- ui-library: ScreenToolbar, SearchField, FilterChips, DataTable, StatusDotCell, TwoLineCell,
  MetaCell, ActionButtonGroup, Menu, TextField, IconButton, Card, ErrorBanner, EmptyState, Row,
  Stack, triggerDownload, useToast
- Containers client, Container transfer client, Images client (`ImageSummary`)
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
- plan-docker_management_app/REQ-43
- plan-docker_management_app/REQ-109
- plan-docker_management_app-container_row_actions/REQ-1
- plan-docker_management_app-container_row_actions/REQ-2
- plan-docker_management_app-container_row_actions/REQ-3
- plan-docker_management_app-container_row_actions/REQ-4
- plan-docker_management_app-container_row_actions/REQ-5
- plan-docker_management_app-container_row_actions/REQ-6
- plan-docker_management_app-container_row_actions/REQ-7
- plan-docker_management_app-container_row_actions/REQ-8
- plan-docker_management_app-container_row_actions/REQ-9
- plan-docker_management_app-container_row_actions/REQ-14
- plan-docker_management_app-container_row_actions/REQ-16
- plan-docker_management_app-container_row_actions/REQ-18
- plan-docker_management_app-container_row_actions/REQ-20
- plan-docker_management_app-container_row_actions/REQ-21
- plan-docker_management_app-container_row_actions/REQ-22
- plan-docker_management_app-container_row_actions/REQ-24
- plan-docker_management_app-container_row_actions/REQ-25
