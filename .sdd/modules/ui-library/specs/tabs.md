---
module: ui-library
component: Tabs
type: UI component
---

# Tabs

**Purpose** → single-select row of tabs switching which content panel of a detail surface is shown
(e.g. a container's Config/Inspect tabs).

## Contract

- `<Tabs tabs activeId onSelect />`
  - `tabs: { id, label }[]`.
  - `activeId: string` — the currently selected tab's `id`.
  - `onSelect(id): void` — called when a tab is clicked.
- Every tab given is drawn alike, with only the active one distinguished. The component offers no
  disabled, muted or otherwise lesser tab: a tab a caller does not want presented is left out of
  `tabs`, and one that is presented is presented like every other.

## Requirements served

- plan-docker_management_app/REQ-24
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-12
