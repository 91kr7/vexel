---
module: ui-library
component: BulkActionBar
type: UI component
---

# BulkActionBar

**Purpose** → the bar shown above a list once at least one row is multi-selected (e.g. several
images picked for a bulk save): the selection count, the actions that apply to the selection, and a
way to clear it.

## Contract

- `<BulkActionBar count label? actions onClear />`
  - `count: number` — the number of selected rows; the bar renders nothing while `count` is `0`.
  - `label?` — noun following the count (default `'selected'`), e.g. `"3 selected"`.
  - `actions: { id, label, onClick, destructive?, disabled? }[]` — each renders as a small `Button`,
    `destructive` selecting the destructive variant.
  - `onClear: () => void` — the trailing "Clear" action.

## Requirements served

- plan-docker_management_app/REQ-42
