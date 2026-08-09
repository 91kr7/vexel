---
module: volumes-networks
component: VolumesPanel
type: UI component
---

# VolumesPanel

**Purpose** → every local volume, its create/inspect/remove actions and prune of unused volumes
(REQ-70, REQ-71).

## Contract

- `<VolumesPanel volumes loaded error? onRefresh />` — `volumes: VolumeSummary[]`, `onRefresh: () =>
  void` re-reads the list (the caller owns `useVolumes()`).

Description:
- A card headed "Volumes" with "Create" and "Prune" actions, and a `CardList` of every volume below
  it.
Shows:
- One row per volume: the name, the mountpoint and a "driver `<driver>` · mounted by `<names>`" line
  (or "mounted by nothing" when unattached) as monospace secondary lines, and the size trailing the
  row (or "–" while the daemon has not computed it yet).
- An empty/loading state when there are no volumes.
- Selecting a row expands its inline inspect surface directly below it: driver, mountpoint, scope,
  created time, mounting containers, driver options, labels, the raw inspect payload, and a "Remove"
  action; selecting the same row again collapses it.
Actions:
- "Create" opens a `FormDialog` for a name (optional, blank lets the daemon generate one), a driver
  (free text, suggesting `local`), driver options and labels (each a repeatable key/value list, REQ-
  71); submitting creates the volume, closes the dialog and re-reads the list.
- A selected row's "Remove" action goes through `useConfirmation().confirm()` first; cancelling
  performs nothing. On success it collapses the row and re-reads the list.
- "Prune" confirms first, then reports the number of volumes removed and the reclaimed space via
  `useToast()` on success and re-reads the list; any failure reports the daemon's own message via
  `useErrorReporter()`.

## Rules and invariants

- "Prune" is disabled when there is no volume to prune.
- Only one volume's inspect surface is expanded at a time.
- In the create dialog the driver-options rows and the label rows carry distinct accessible names,
  so no two of its fields are announced alike.

## Dependencies

- ui-library: Card, SectionHeader, CardList, FormDialog, FormField, TextField, Combobox,
  KeyValueEditor, DefinitionList, CodeViewer, ErrorBanner, EmptyState, Button, Row, Stack, useToast
- Volumes client, useVolumeInspect
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-71
