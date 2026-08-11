---
module: containers
component: ContainerDetailPanel
type: UI component
---

# ContainerDetailPanel

**Purpose** → the container detail surface opened from a row of the Containers screen: the
container's logs, its live statistics, its inspect data in an editable Config tab, the processes
running inside it, the read-only Inspect tab with the raw payload, and — for a running container —
exec and attach interactive sessions. Rename and the filesystem export both live on the row instead
(REQ-21), not in this panel.

## Contract

- `<ContainerDetailPanel container onClose onContainerReplaced />`
  - `container: ContainerSummary` — the selected row.
  - `onClose: () => void` — called when the panel's close control is used.
  - `onContainerReplaced: (newId: string) => void` — called after a recreate, since the original
    container id no longer exists.

Description:
- A `DetailPanel` (untitled — the container's name/id/state are already shown by the table row it
  expands below) holding a `Tabs` row (Logs, Stats, Config, Processes, Inspect, and — only when the
  container is running — Exec, Attach) and the active tab's content. Config is the tab selected when
  the panel opens.
- **No header actions.** "Export filesystem…" was this panel's only one and is started from the
  row's overflow menu now; the slot is deliberately left empty rather than filled with a
  replacement.
Shows (Logs tab):
- The container's `ContainerLogsView`; the inspect data is neither needed nor awaited for it.
Shows (Stats tab):
- The container's `ContainerStatsView`; the inspect data is neither needed nor awaited for it.
Shows (Processes tab):
- The container's `ContainerProcessesView`; the inspect data is neither needed nor awaited for it.
Shows (Exec tab):
- The container's `ContainerSessionView` with `kind="exec"`; the inspect data is neither needed nor
  awaited for it.
Shows (Attach tab):
- The container's `ContainerSessionView` with `kind="attach"`; the inspect data is neither needed
  nor awaited for it.
Shows (Config tab, view mode):
- A `DefinitionList` of restart policy, CPU limit, memory limit, port mapping, health check command
  and networks; collapsible sections for the full environment variable list and the mount list; an
  "Edit configuration" action.
Shows (Config tab, edit mode):
- Restart policy (select) with a max-retries field shown only for `on-failure`, CPU/memory limit
  fields, a key/value editor for environment variables, a repeatable row list for port mappings
  (container port, protocol, host port) and one for mounts (source, destination, read-only), a
  health-check toggle revealing command/interval/timeout/retries/start-period fields when enabled,
  and a form footer (save/cancel, dirty indicator).
Shows (Inspect tab):
- A `DefinitionList` of id, name, image, command, entrypoint, created date, state, started/finished
  dates and exit code; collapsible sections for networks, labels and (when the container defines a
  health check) the latest health status/failing streak/log entries; the raw inspect payload as
  formatted, copyable JSON (REQ-26).
Actions:
- "Edit configuration" switches the Config tab to edit mode, seeded from the current inspect data.
- Saving computes which fields changed since edit mode was entered (REQ-25):
  - only restart policy and/or resource limits changed → applied directly, no warning.
  - env, ports, mounts or health check changed → the operator is asked to confirm a recreate first
    (via the shell's confirmation service, naming the container and stating the consequence);
    declining leaves the container and its configuration unchanged.
  - the outcome (`in-place` or `recreate`) is reported via a toast; on `recreate`,
    `onContainerReplaced` is called with the new container id and the panel returns to view mode
    showing the new container's data; on `in-place`, the panel re-reads the same container.
  - a failure reports the daemon's own message via the shell's error-reporting service and leaves
    edit mode open with the operator's input intact.
- "Cancel" (form footer) discards the in-progress edit and returns to view mode without contacting
  the server.
- Selecting the Inspect tab's copy affordance copies the exact raw payload text to the clipboard.

## Rules and invariants

- Only the active tab's content exists: leaving the Stats tab (switching tab, closing the panel or
  selecting another row) unmounts the stats view and thereby stops the live stats stream (REQ-32);
  leaving the Exec or Attach tab likewise closes the interactive session (REQ-36).
- Switching `container` (a different row selected) resets edit mode and any in-progress edit.
- The Exec and Attach tabs are only offered for a running container.
- The save action is disabled while there is nothing to save (no field differs from the value edit
  mode was seeded with) and while a save is in flight.

## Dependencies

- ContainerLogsView
- ContainerStatsView
- ContainerProcessesView
- ContainerSessionView
- ui-library: DetailPanel, Tabs, DefinitionList, CollapsibleSection, CodeViewer, Select, NumberField,
  Toggle, TextField, KeyValueEditor, RepeatableRowList, FormFooter, SectionHeader, Row, Stack,
  Button, ErrorBanner, EmptyState, FormDialog, useToast
- Containers client (updateContainerConfig)
- useContainerDetail
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-25
- plan-docker_management_app/REQ-26
- plan-docker_management_app/REQ-30
- plan-docker_management_app/REQ-32
- plan-docker_management_app/REQ-33
- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
- plan-docker_management_app/REQ-36
- plan-docker_management_app-container_row_actions/REQ-19
- plan-docker_management_app-container_row_actions/REQ-21
