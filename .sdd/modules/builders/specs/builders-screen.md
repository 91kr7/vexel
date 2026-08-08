---
module: builders
component: BuildersScreen
type: UI component
---

# BuildersScreen

**Purpose** → the Builders & cache screen: buildx builder inventory with the active one switchable,
create/remove, and the build-cache inventory with usage state and prune.

Description:
- Two stacked cards. "buildx builders" lists every builder as a card row: name, driver and platforms
  as subtitle, its endpoint, a status badge, its cache size, an "in use" badge for the active builder
  or a clickable "use" badge for the others, and a "Remove" action. "Build cache" lists every
  build-cache record as a card row: a truncated id, its type, a usage-state badge (shared / in use /
  reclaimable) and its size.

Shows:
- Every builder currently known to buildx, with its driver, endpoint, platforms, status, cache size
  and whether it is the active one.
- Every build-cache record, with its type, size and usage state.

Actions:
- "Create builder" → opens a form (name, driver, endpoint, platforms) and creates the builder on
  submit.
- a builder's "use" badge → sets that builder as active.
- a builder's "Remove" action → confirms (destructive-confirmation service), then removes it.
- "Prune" (build cache) → confirms, then prunes every reclaimable record and reports the space
  reclaimed via a toast.

Does not:
- Offer any build-launch affordance (REQ-90 withdrawn).
- Offer cache export or import (withdrawn half of REQ-91).

## Dependencies

- ui-library: Card, SectionHeader, CardList, Badge, ActionButtonGroup, FormDialog, FormField,
  TextField, Combobox, ChipInput, Row, Stack, EmptyState, ErrorBanner, useToast
- builders: useBuilders, useBuildCache
- app-shell: useConfirmation, useProgress, useErrorReporter

## Requirements served

- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-89
- plan-docker_management_app/REQ-91
