---
module: volumes-networks
component: NetworksPanel
type: UI component
---

# NetworksPanel

**Purpose** → every network, its create/inspect/remove actions, prune of unused networks, and
attaching/detaching a container (REQ-72, REQ-73, REQ-74), listed and revealed with the library's
object list and detail panel.

## Contract

- `<NetworksPanel networks loaded error? onRefresh />` — `networks: NetworkSummary[]`, `onRefresh:
  () => void` re-reads the list (the caller owns `useNetworks()`).

Description:
- A card holding, in this order: the section header "Networks", the screen toolbar carrying the
  page-level actions, and the object list (`DataTable`) of every network. The header carries no
  actions of its own.
Shows:
- One row per network, in columns: `NAME` (the name over a "`<subnet>` · gw `<gateway>`" monospace
  second line, "no subnet" when the network has none), `DRIVER`, `SCOPE`, and the row's action
  cluster.
- Below every row's cells, inside the same table, the chip group of that network's attached
  containers, each chip carrying its own "detach" action; "No attached containers" in place of the
  chips when none are attached. That slot is conditional on nothing: this list supplies it, so it is
  drawn.
- An empty state when there are no networks: while loading, the title alone; once loaded, a title, a
  line of explanation and the action that resolves it — "Create the first network", the invitation
  rather than the toolbar's own word (see the rule below).
- Selecting a row reveals its detail panel inside the same table, directly below the row and its
  chips, at the full width of the screen's content column: driver, scope, subnet, gateway, IP range,
  options and labels as property bands — every value left-aligned, `Options` included — then the raw
  inspect payload at that same full width. Selecting the same row again, or `Escape`, closes it.
Actions:
- "Create network…" (toolbar, primary) and "Create the first network" (the empty state's own
  action) open the same `FormDialog`, for a name, a driver (free text,
  suggesting `bridge`/`overlay`/`macvlan`), subnet, gateway, IP range, options and labels (each a
  repeatable key/value list); submitting creates the network, closes the dialog and re-reads the
  list.
- "Prune" (toolbar, destructive) confirms first, then reports the number of networks removed via
  `useToast()` on success and re-reads the list; any failure reports the daemon's own message via
  `useErrorReporter()`.
- "Attach…" (row cluster) opens a `FormDialog` offering a `Combobox` of known container names (from
  `useContainers()`); submitting attaches that container to that row's network, closes the dialog
  and re-reads the list.
- "Remove" (row cluster, destructive) goes through `useConfirmation().confirm()` first; cancelling
  performs nothing. On success it closes any detail open on that network and re-reads the list.
- A chip's "detach" action detaches that container immediately (no confirmation) and re-reads the
  list; failure reports the daemon's own message via `useErrorReporter()`.

## Rules and invariants

- **The toolbar's action and the empty state's are two controls, and neither name contains the
  other.** Both open the same dialog, and while the list is empty both are on screen at once — the
  toolbar because a page-level action lives there (plan-ui-coherence-optimisation/REQ-41), the empty
  state's because an empty result states the way out of itself
  (plan-docker_management_app/REQ-25). A suffix is not a different name, and two identical names are
  the same collision rather than its repair, so the empty state takes the invitation and the toolbar
  keeps the standing action's word. **This panel is where that cost the most and showed the least**:
  its two controls carried the *same* label, and the check that drives them
  (`client/e2e/networks.spec.ts:102`) is scoped to the panel and locates them by that shared name — so it
  has always resolved two controls whenever the list is empty, and passed only because this daemon
  happens to hold one. Green by luck. The single account, with the deferred ellipsis question, is in
  `ui-library/specs/empty-state.md` and `swarm/specs/swarm-secrets-panel.md` (DEF-2).
- "Prune" is disabled when there is no network to prune.
- Every control on this screen is a control: attaching a container is an action of the row's cluster
  rather than bare text beside the chips, and the page-level actions sit in the toolbar under the
  section header rather than in the header itself.
- At most one network's detail is revealed at a time, and — the detail panel being the library's —
  revealing one closes any panel open elsewhere on the screen, the Volumes panel's included.
- **The list is one table**, as containers and images are: one header row over a continuous run of
  rows, a single hairline between each pair, no gap between two rows and no surface, corner or
  outline of any row's own. A row that carries chips below its cells is ruled beneath them, so the
  hairline still separates one network from the next rather than a network from its own chips.
- **A row is sized by what it holds**, not clipped to a fixed height: the `NAME` cell puts the
  network's name over its subnet line, and both lines are on the row at every viewport. Below the
  desktop breakpoint the list pans horizontally rather than growing its rows.
- No value on this panel is right-aligned, `Options` included.
- The list states no column minimum and no breakpoint-conditional column set: the column contract
  and the truncation contract are the object list's, inherited by construction. The one width it
  states is its action column's, a length covering the controls that column holds — the object
  list's width contract admits no intrinsic track, which would resolve to a different width in the
  header and in each row.
- In the create dialog the option rows and the label rows carry distinct accessible names, so no two
  of its fields are announced alike.
- Attach and detach are not routed through the confirmation service: neither is destructive to data.

## Dependencies

- ui-library: Card, SectionHeader, ScreenToolbar, DataTable (content-sized rows, row content), TwoLineCell, MetaCell,
  ChipGroup, ActionButtonGroup, DetailPanel, CodeViewer, ErrorBanner, EmptyState, Button,
  FormDialog, FormField, TextField, Combobox, KeyValueEditor, Stack, useToast
- Networks client, useNetworkInspect
- containers module: useContainers
- app-shell: ConfirmationService, ProgressService, ErrorReportingService

## Requirements served

- plan-docker_management_app/REQ-72
- plan-docker_management_app/REQ-73
- plan-docker_management_app/REQ-74
- plan-ui-coherence-optimisation/REQ-31
- plan-ui-coherence-optimisation/REQ-32
- plan-ui-coherence-optimisation/REQ-33
- plan-ui-coherence-optimisation/REQ-34
- plan-ui-coherence-optimisation/REQ-35
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-14
