---
module: builders
component: BuildersScreen
type: UI component
---

# BuildersScreen

**Purpose** → the Builders & cache screen: buildx builder inventory with the active one switchable,
create/remove, and the build-cache inventory with usage state, prune, and — per record — the images
and layers it relates to (REQ-69).

Description:
- Two stacked, full-width cards, each a section header with the screen-level action under it in the
  toolbar (`plan-ui-coherence-optimisation/REQ-41`) and the object list's comfortable variant below.
- "buildx builders" lists every builder as a row of seven columns: the active marker, the builder
  (name over its driver), its endpoint, its platforms, its status, its cache size, and its actions.
  Every cell is one line high whatever the builder's state, so every row is the same height as every
  other.
- "Build cache" lists every record as a row of five columns: the record's identifier, its type, the
  build step it was recorded from, its usage state and its size — in identifier order as the service
  delivers it, deliberately not ranked by size. Selecting a row reveals that record in the library's
  detail panel, inside the same card, at the full width of the content column.

Shows:
- Every builder currently known to buildx, with its driver, endpoint, platforms, status, cache size
  and whether it is the active one.
  - The **endpoint column is empty for a builder whose endpoint is its own name** — what the
    `docker` driver reports, buildx naming such a builder after the context its node answers on. The
    name is stated once, as the row's title (`plan-ui-coherence-optimisation/REQ-40`); the cell's
    tooltip states why it holds nothing. Every other endpoint (a context name, `tcp://…`) is shown.
  - A cache size the builder did not report reads `unavailable`, with the reason as its tooltip —
    never a blank, and never a number belonging to another builder.
  - The platform list is one line, cut at the column's width with the whole of it as a tooltip.
- Every build-cache record, with its type, recorded build step, size and usage state. A record with
  no recorded step reads `–` in that column and the row does not change height for it.
- For the selected record, in the detail panel: its identifier **in full** — the list cell cuts it at
  20 characters (`plan-ui-coherence-optimisation/REQ-21`) — its type, size, usage state and build
  step in the two-column property grid, and below them a "Related images & layers" section holding
  one followable `CrossReference` per related layer (the image's first tag or short id as its kind,
  the layer's position and instruction as its label) or, in their place, the full sentence stating
  why none can be named: a record holding build input rather than a layer, a record with no recorded
  step, or no local image carrying that step (REQ-69).
- While that relation is still being read: a "Looking for the images this record relates to…"
  placeholder; a failed read: an `ErrorBanner` with retry, leaving the rest of the screen usable.
- An empty list states why it is empty: no builders (with the action that creates one) or no
  build-cache records (with no action, nothing on this screen filling the cache); each says so
  separately from the "still reading" state it used to share an element with.

Actions:
- "Create builder" (builders toolbar) and "Create the first builder" (the empty state's own action)
  → the same form (name, driver, endpoint, platforms), creating the builder on submit. **Two
  controls, two names, and neither contains the other** — see the rule below.
- a builder's "Use" action → sets that builder as active. It is an action of the row's cluster, with
  a weight and the appearance of a control, never a bare word
  (`plan-ui-coherence-optimisation/REQ-27`); it is offered only on the builders that are not already
  active, the active one being marked "in use" in its own column.
- a builder's "Remove" action → confirms (destructive-confirmation service), then removes it.
- "Prune" (build-cache toolbar) → confirms, then prunes every reclaimable record and reports the
  space reclaimed via a toast. Disabled while there is no record to prune.
- Selecting a cache record opens its detail panel; selecting it again, or `Escape`, closes it. At
  most one panel is open anywhere in the interface.
- Following a related layer's reference reaches that layer inside the Images & layers screen: the
  image is selected and its layer explorer opens at that layer (REQ-69). An unavailable reference is
  never followable.
- Arriving here from a layer's build-cache reference (REQ-68) selects the named record and opens it
  on its related images and layers, then acknowledges the navigation request.

Does not:
- Offer any build-launch affordance (REQ-90 withdrawn).
- Offer cache export or import (withdrawn half of REQ-91).
- Rank the build cache by size, or by anything but the identifier order the service delivers.

## Rules and invariants

- **The toolbar's action and the empty state's are two controls, and neither name contains the
  other.** Both open the same flow, and while the list is empty both are on screen at once — the
  toolbar because a page-level action lives there (plan-ui-coherence-optimisation/REQ-41), the empty
  state's because an empty result states the way out of itself
  (plan-docker_management_app/REQ-25). A name that is a prefix of another's is the same name to
  anything that finds a control by name, so the empty state takes the invitation and never the
  toolbar's own word with a suffix; identical labels are not the repair, they are the same collision.
  Reasoned out once, with the deferred ellipsis question, in `swarm/specs/swarm-secrets-panel.md`
  (DEF-2).
- **A builder's name is rendered once per row**, whatever the driver reports as its endpoint.
- **Every row of a list is the same height as every other row of that list**, at every viewport: no
  value's presence adds or removes a line, the two that come and go — the endpoint and the cache
  size — being columns of their own.
- **Every column starts at the same x on every row and under its own header label**, whichever
  actions that row carries — the object list's guarantee, which this screen inherits by stating each
  track as a length or a flex factor (the contract admits nothing else).
- **A state is never a control and a control never reads as a state**: status, cache size and the
  active marker are cells, and the only clickable things in a row are the cluster's buttons.

## Dependencies

- ui-library: Card, SectionHeader, ScreenToolbar, DataTable (comfortable), DetailPanel,
  TwoLineCell, MetaCell, IdentifierCell, StatusDotCell, StatusPill, ActionButtonGroup,
  CrossReferenceList, EmptyState, ErrorBanner, FormDialog, FormField, TextField, Combobox,
  ChipInput, Button, Stack, useToast
- builders: useBuilders, useBuildCache, useBuildCacheUsage
- app-shell: useConfirmation, useProgress, useErrorReporter, useCrossNavigation

## Requirements served

- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-89
- plan-docker_management_app/REQ-91
- plan-docker_management_app/REQ-69
- plan-ui-coherence-optimisation/REQ-39
- plan-ui-coherence-optimisation/REQ-40
- plan-ui-coherence-optimisation/REQ-41
