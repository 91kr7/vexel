---
module: ui-library
component: ScreenToolbar
type: UI component
---

# ScreenToolbar

**Purpose** → the action bar at the top of a list screen: a leading primary action, secondary
actions, a trailing destructive action, and an optional filters row underneath.

## Contract

- `<ScreenToolbar primaryAction? secondaryActions? destructiveAction? filters? />`
  - `primaryAction?, destructiveAction?: { label, onClick, disabled? }`.
  - `secondaryActions?: { label, onClick, disabled? }[]`.
  - `filters?: ReactNode` — rendered on its own row below the actions (e.g. a `SearchField` and
    `FilterChips`).
  - a toolbar given no action draws no action row, and therefore no space where one would have
    been: a screen whose only screen-level control is its filter gets the filter alone.

## Dependencies

- Button

## Requirements served

- plan-docker_management_app/REQ-20
- plan-docker_management_app/REQ-22
- plan-docker_management_app/REQ-23
