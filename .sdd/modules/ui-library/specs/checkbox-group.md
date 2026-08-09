---
module: ui-library
component: CheckboxGroup
type: UI component
---

# CheckboxGroup

**Purpose** → a multi-select list of labelled options, each able to carry a description and a
trailing note (e.g. a size): the shape a scope selection takes inside a dialog.

## Contract

- `<CheckboxGroup options selectedIds onChange ariaLabel? />`
  - `options: { id, label, description?, note?, disabled? }[]`.
  - `selectedIds: string[]` — the currently selected option ids.
  - `onChange(ids): void` — called with the new selection, in `options` order.
  - `ariaLabel?: string` — names the group.

Shows:

- one row per option: a checkbox, the label, the description under it when given, and the note
  right-aligned when given.

Actions:

- clicking an unselected option → `onChange` with its id added, in `options` order.
- clicking a selected option → `onChange` with its id removed, the last one included.
- a `disabled` option cannot be toggled.

## Rules and invariants

- The selection may be emptied — that is what separates it from SegmentedControl: for a scope,
  "nothing" is a legitimate answer the caller then refuses to act on, rather than a state to
  prevent.
- Each checkbox is reachable and named for assistive technology by its own label.

## Requirements served

- plan-docker_management_app/REQ-96
