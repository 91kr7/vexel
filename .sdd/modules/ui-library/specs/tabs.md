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

## Requirements served

- plan-docker_management_app/REQ-24
