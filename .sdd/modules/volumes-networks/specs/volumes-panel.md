---
module: volumes-networks
component: VolumesPanel
type: UI component
---

# VolumesPanel

**Purpose** → every local volume, its create/inspect/remove actions and prune of unused volumes
(REQ-70, REQ-71), listed and revealed with the library's object list and detail panel.

## Contract

- `<VolumesPanel volumes loaded error? onRefresh />` — `volumes: VolumeSummary[]`, `onRefresh: () =>
  void` re-reads the list (the caller owns `useVolumes()`).

Description:
- A card holding, in this order: the section header "Volumes", the screen toolbar carrying the
  page-level actions, and the object list (`DataTable variant="comfortable"`) of every volume. The
  header carries no actions of its own.
Shows:
- One row per volume, in columns: `NAME` (the name over the mountpoint as its monospace second
  line), `DRIVER`, `MOUNTED BY` (the mounting containers as badges, "nothing" when unattached),
  `SIZE` (or "–" while the daemon has not computed it), and the row's action cluster.
- An empty state when there are no volumes: while loading, the title alone; once loaded, a title, a
  line of explanation and the action that resolves it (creating a volume).
- Selecting a row reveals its detail panel inside the same card, directly below the row, at the full
  width of the screen's content column: driver, mountpoint, scope, created time, mounting
  containers, driver options and labels as property bands, then the raw inspect payload at that same
  full width. Selecting the same row again, or `Escape`, closes it.
Actions:
- "Create volume…" (toolbar, primary) opens a `FormDialog` for a name (optional, blank lets the
  daemon generate one), a driver (free text, suggesting `local`), driver options and labels (each a
  repeatable key/value list, REQ-71); submitting creates the volume, closes the dialog and re-reads
  the list.
- "Prune" (toolbar, destructive) confirms first, then reports the number of volumes removed and the
  reclaimed space via `useToast()` on success and re-reads the list; any failure reports the
  daemon's own message via `useErrorReporter()`.
- "Remove" (row cluster, destructive) goes through `useConfirmation().confirm()` first; cancelling
  performs nothing. On success it closes any detail open on that volume and re-reads the list.

## Rules and invariants

- "Prune" is disabled when there is no volume to prune.
- Every control on this screen is a control: no action is bare text, and the page-level actions sit
  in the toolbar under the section header rather than in the header itself.
- At most one volume's detail is revealed at a time, and — the detail panel being the library's —
  revealing one closes any panel open elsewhere on the screen, the Networks panel's included.
- The row truncates the mountpoint with an ellipsis; the detail panel is the route to it in full,
  wrapped, left-aligned and selectable. No value on this panel is right-aligned.
- The list states no column minimum, no breakpoint-conditional column set and no width of its own:
  the column contract and the truncation contract are the object list's, inherited by construction.
- In the create dialog the driver-options rows and the label rows carry distinct accessible names,
  so no two of its fields are announced alike.

## Dependencies

- ui-library: Card, SectionHeader, ScreenToolbar, DataTable (comfortable), TwoLineCell, MetaCell,
  BadgeListCell, ActionButtonGroup, DetailPanel, CodeViewer, ErrorBanner, EmptyState, Button,
  FormDialog, FormField, TextField, Combobox, KeyValueEditor, Stack, useToast
- Volumes client, useVolumeInspect
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-71
- plan-ui-coherence-optimisation/REQ-31
- plan-ui-coherence-optimisation/REQ-32
- plan-ui-coherence-optimisation/REQ-33
- plan-ui-coherence-optimisation/REQ-34
- plan-ui-coherence-optimisation/REQ-35
