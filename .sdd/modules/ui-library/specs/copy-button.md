---
module: ui-library
component: CopyButton
type: UI component
---

# CopyButton

**Purpose** → the copy affordance reused by `DefinitionList` and `CodeViewer` (and any future
component that needs to copy an exact value to the clipboard).

## Contract

- `<CopyButton value label? disabled? />`
  - `value: string` — the exact text copied to the clipboard.
  - `label?: string` — button label before the value is copied (default `'Copy'`).
  - `disabled?: boolean` (default `false`) — the affordance stays in place but is inert and cannot
    be activated, for a value that is not there yet or is still being read.

## Rules and invariants

- Copying replaces the label with "Copied" for 1.5 seconds, then reverts.
- A disabled button copies nothing: no clipboard write, and no "Copied" confirmation.
- Disabling is offered so a caller with no value yet can keep the affordance mounted instead of
  removing it: a control that disappears and reappears moves the ones around it under the pointer.

## Dependencies

- Button

## Requirements served

- plan-docker_management_app/REQ-26
