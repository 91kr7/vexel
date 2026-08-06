---
module: containers
component: ContainerDetailPanel
type: UI component
---

# ContainerDetailPanel

**Purpose** → the container detail surface opened from a row of the Containers screen: inspect
data organised in a Config tab (editable) and an Inspect tab (read-only, with the raw payload).

## Contract

- `<ContainerDetailPanel container onClose onContainerReplaced />`
  - `container: ContainerSummary` — the selected row.
  - `onClose: () => void` — called when the panel's close control is used.
  - `onContainerReplaced: (newId: string) => void` — called after a recreate, since the original
    container id no longer exists.

Description:
- A `DetailPanel` titled with the container's name and short id · state, holding a `Tabs` row
  (Config, Inspect) and the active tab's content.
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

- Switching `container` (a different row selected) resets edit mode and any in-progress edit.
- The save action is disabled while there is nothing to save (no field differs from the value edit
  mode was seeded with) and while a save is in flight.

## Dependencies

- ui-library: DetailPanel, Tabs, DefinitionList, CollapsibleSection, CodeViewer, Select, NumberField,
  Toggle, TextField, KeyValueEditor, RepeatableRowList, FormFooter, SectionHeader, Row, Stack,
  Button, ErrorBanner, EmptyState, useToast
- Containers client (updateContainerConfig)
- useContainerDetail
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-24
- plan-docker_management_app/REQ-25
- plan-docker_management_app/REQ-26
