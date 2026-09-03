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
- In this order: the section header "Volumes", the screen toolbar carrying the page-level actions,
  and then the object list (`DataTable`) of every volume, alone in an **unpadded card it fills edge
  to edge** — the composition containers and images ship. The header carries no actions of its own,
  and it is not on a surface: the panel's only surface is the list's own card.
Shows:
- One row per volume, in columns: `NAME` (the name over the mountpoint as its monospace second
  line), `DRIVER`, `MOUNTED BY` (the mounting containers as badges, "nothing" when unattached),
  `SIZE` (or "–" while the daemon has not computed it), and the row's action cluster.
- An empty state when there are no volumes: while loading, the title alone; once loaded, a title, a
  line of explanation and the action that resolves it — "Create the first volume", the invitation
  rather than the toolbar's own word (see the rule below).
- Selecting a row reveals its detail panel inside the same table, directly below the row, at the full
  width of the screen's content column: driver, mountpoint, scope, created time, mounting
  containers, driver options and labels as property bands, then the raw inspect payload at that same
  full width. Selecting the same row again, or `Escape`, closes it.
Actions:
- "Create volume…" (toolbar, primary) and "Create the first volume" (the empty state's own action)
  open the same `FormDialog`, for a name (optional, blank lets the
  daemon generate one), a driver (free text, suggesting `local`), driver options and labels (each a
  repeatable key/value list, REQ-71); submitting creates the volume, closes the dialog and re-reads
  the list.
- "Prune" (toolbar, destructive) confirms first, then reports the number of volumes removed and the
  reclaimed space via `useToast()` on success and re-reads the list; any failure reports the
  daemon's own message via `useErrorReporter()`.
- "Remove" (row cluster, destructive) goes through `useConfirmation().confirm()` first; cancelling
  performs nothing. On success it closes any detail open on that volume and re-reads the list.

## Rules and invariants

- **The toolbar's action and the empty state's are two controls, and neither name contains the
  other.** Both open the same dialog, and while the list is empty both are on screen at once — the
  toolbar because a page-level action lives there (plan-ui-coherence-optimisation/REQ-41), the empty
  state's because an empty result states the way out of itself
  (plan-docker_management_app/REQ-25). A suffix is not a different name, and two identical names are
  the same collision rather than its repair, so the empty state takes the invitation and the toolbar
  keeps the standing action's word. **This panel is where that cost the most and showed the least**:
  its two controls carried the *same* label, and the check that drives them
  (`client/e2e/volumes.spec.ts:95`) is scoped to the panel and locates them by that shared name — so it
  has always resolved two controls whenever the list is empty, and passed only because this daemon
  happens to hold one. Green by luck. The single account, with the deferred ellipsis question, is in
  `ui-library/specs/empty-state.md` (DEF-2).
- "Prune" is disabled when there is no volume to prune.
- Every control on this screen is a control: no action is bare text, and the page-level actions sit
  in the toolbar under the section header rather than in the header itself.
- At most one volume's detail is revealed at a time, and — the detail panel being the library's —
  revealing one closes any panel open elsewhere on the screen, the Networks panel's included.
- **The list is the containers list**, not merely table-like: one header row over a continuous run
  of rows, a single hairline between each pair, no gap between two rows and no surface, corner or
  outline of any row's own — and the **same row**, of the reference's own fixed height and vertical
  alignment, stating no row modifier of its own. There is no per-screen choice of presentation to be
  made here.
- **A two-line row needs no extra room.** The `NAME` cell puts the volume's name over its
  mountpoint, and both lines sit unclipped inside that fixed-height row at every viewport — the same
  cell the reference carries in the same row. Below the desktop breakpoint the list pans
  horizontally; its rows do not grow.
- The row truncates the mountpoint with an ellipsis; the detail panel is the route to it in full,
  wrapped, left-aligned and selectable. No value on this panel is right-aligned.
- The list states no column minimum and no breakpoint-conditional column set: the column contract
  and the truncation contract are the object list's, inherited by construction. The one width it
  states is its action column's, a length covering the controls that column holds — the object
  list's width contract admits no intrinsic track, which would resolve to a different width in the
  header and in each row.
- In the create dialog the driver-options rows and the label rows carry distinct accessible names,
  so no two of its fields are announced alike.
- **No failure panel, and the lost connection is not told here**
  (plan-docker_management_app-inline_error_panels/REQ-1, …/REQ-2, …/REQ-13): the listing's failure
  state is raised only while the live channel is not delivering, so it raises no toast either. With
  nothing to list, the shared "could not be loaded" placeholder stands in the list's place — one
  wording for every cause, no cause named and no control (…/REQ-3). The retry is the header's; none
  is offered here (…/REQ-4).
- **No failure panel** (plan-docker_management_app-inline_error_panels/REQ-1): a failed volume
  inspect read is reported as one toast through `useFailureReport`, and where it leaves nothing to
  show the shared "could not be loaded" placeholder stands in the detail's place — no cause named,
  no control (…/REQ-3). The retry is the header's; none is offered here (…/REQ-4).

## Dependencies

- ui-library: Card (unpadded, holding the list alone), SectionHeader, ScreenToolbar, DataTable, TwoLineCell, MetaCell,
  BadgeListCell, ActionButtonGroup, DetailPanel, CodeViewer, EmptyState, Button,
  FormDialog, FormField, TextField, Combobox, KeyValueEditor, Stack, useToast
- Volumes client, useVolumeInspect
- app-shell: ConfirmationService, ProgressService, ErrorReportingService, useFailureReport,
  FailedReadEmptyState

## Requirements served

- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-71
- plan-ui-coherence-optimisation/REQ-31
- plan-ui-coherence-optimisation/REQ-32
- plan-ui-coherence-optimisation/REQ-33
- plan-ui-coherence-optimisation/REQ-34
- plan-ui-coherence-optimisation/REQ-35
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-14
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-39
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40
- plan-docker_management_app-inline_error_panels/REQ-1
- plan-docker_management_app-inline_error_panels/REQ-2
- plan-docker_management_app-inline_error_panels/REQ-3
- plan-docker_management_app-inline_error_panels/REQ-4
- plan-docker_management_app-inline_error_panels/REQ-13
