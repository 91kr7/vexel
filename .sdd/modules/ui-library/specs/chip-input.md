---
module: ui-library
component: ChipInput
type: UI component
---

# ChipInput

**Purpose** → a free-form list of short values: each value entered becomes a removable chip.

## Contract

- `<ChipInput values onChange placeholder? ariaLabel? addLabel? error? />`
  - `values: string[]`, `onChange(values)` — called with the full next list on any add or remove.
  - `addLabel?` — label of the add action (default `'Add'`).
  - `error?` — validation message shown below the entry field, in the danger tone.

Shows:
- One chip per value, each with its own remove action; the chip area disappears when the list is
  empty.
- An entry field with the add action next to it.
Actions:
- Enter in the entry field, or the add action → appends the trimmed draft and empties the field.
- a chip's remove action → drops that value.

## Rules and invariants

- A blank or already-present value is never appended; the draft is cleared either way.
- The add action is disabled while the draft is blank.

## Dependencies

- Button, FieldMessage

## Requirements served

- plan-docker_management_app/REQ-27
