---
module: ui-library
component: SegmentedControl
type: UI component
---

# SegmentedControl

**Purpose** → a compact row of joined segments used to pick one, or several, of a small fixed set
of options (e.g. which streams of a log to show).

## Contract

- `<SegmentedControl options selectedIds onChange multiple? ariaLabel? />`
  - `options: { id, label }[]`.
  - `selectedIds: string[]` — the currently selected option ids.
  - `onChange(ids): void` — called with the new selection.
  - `multiple?: boolean` (default `false`).
  - `ariaLabel?: string`.

Shows:

- one segment per option; selected segments are visually distinguished and reported as pressed.

Actions:

- clicking a segment, `multiple` false → `onChange([id])`.
- clicking an unselected segment, `multiple` true → `onChange` with that id added, in `options`
  order.
- clicking a selected segment, `multiple` true → `onChange` with that id removed.

## Rules and invariants

- The selection is never emptied: clicking the only selected segment leaves the selection unchanged
  and does not call `onChange`.

## Requirements served

- plan-docker_management_app/REQ-30
