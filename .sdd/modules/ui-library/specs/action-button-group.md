---
module: ui-library
component: ActionButtonGroup
type: UI component
---

# ActionButtonGroup

**Purpose** → the inline group of dense action buttons used for per-row actions in a table (e.g. a
container's lifecycle actions), with a destructive variant.

## Contract

- `<ActionButtonGroup actions />` — `actions: { id, label, onClick, destructive?, disabled? }[]`;
  each renders as a small (`size="sm"`) `Button`, `destructive` selecting the destructive variant.

## Rules and invariants

- Stops click-event propagation, so a click on any action button never also triggers a containing
  `DataTable` row's `onRowSelect`.

## Dependencies

- Button

## Requirements served

- plan-docker_management_app/REQ-20
