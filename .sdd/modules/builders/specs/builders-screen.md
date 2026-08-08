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
- Two stacked cards. "buildx builders" lists every builder as a card row: name, driver and platforms
  as subtitle, its endpoint, a status badge, its cache size, an "in use" badge for the active builder
  or a clickable "use" badge for the others, and a "Remove" action. "Build cache" lists every
  build-cache record as a card row: a truncated id, its type and recorded build step as subtitle
  lines, a usage-state badge (shared / in use / reclaimable) and its size; selecting a record
  expands it, inside the same card, onto the images and layers it relates to.

Shows:
- Every builder currently known to buildx, with its driver, endpoint, platforms, status, cache size
  and whether it is the active one.
- Every build-cache record, with its type, recorded build step, size and usage state.
- For the selected record: a "Related images & layers" section holding one followable
  `CrossReference` per related layer — the image's first tag (or short id) as its kind, the layer's
  position and instruction as its label — or, in their place, the full sentence stating why none can
  be named (a record holding build input rather than a layer, a record with no recorded step, or no
  local image carrying that step) (REQ-69).
- While the relation is still being read: a "Looking for the images this record relates to…" line; a
  failed read: an `ErrorBanner` with retry, leaving the rest of the screen usable.

Actions:
- "Create builder" → opens a form (name, driver, endpoint, platforms) and creates the builder on
  submit.
- a builder's "use" badge → sets that builder as active.
- a builder's "Remove" action → confirms (destructive-confirmation service), then removes it.
- "Prune" (build cache) → confirms, then prunes every reclaimable record and reports the space
  reclaimed via a toast.
- Selecting a cache record opens its related images and layers; selecting it again closes it.
- Following a related layer's reference reaches that layer inside the Images & layers screen: the
  image is selected and its layer explorer opens at that layer (REQ-69). An unavailable reference is
  never followable.
- Arriving here from a layer's build-cache reference (REQ-68) selects the named record and opens it
  on its related images and layers, then acknowledges the navigation request.

Does not:
- Offer any build-launch affordance (REQ-90 withdrawn).
- Offer cache export or import (withdrawn half of REQ-91).

## Dependencies

- ui-library: Card, SectionHeader, CardList, Badge, ActionButtonGroup, CrossReferenceList,
  FormDialog, FormField, TextField, Combobox, ChipInput, MetaCell, Row, Stack, EmptyState,
  ErrorBanner, useToast
- builders: useBuilders, useBuildCache, useBuildCacheUsage
- app-shell: useConfirmation, useProgress, useErrorReporter, useCrossNavigation

## Requirements served

- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-89
- plan-docker_management_app/REQ-91
- plan-docker_management_app/REQ-69
