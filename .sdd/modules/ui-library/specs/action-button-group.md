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

## Dependencies

- Button

## Requirements served

- plan-docker_management_app/REQ-20
