---
module: ui-library
component: CopyButton
type: UI component
---

# CopyButton

**Purpose** → the copy affordance reused by `DefinitionList` and `CodeViewer` (and any future
component that needs to copy an exact value to the clipboard).

## Contract

- `<CopyButton value label? />`
  - `value: string` — the exact text copied to the clipboard.
  - `label?: string` — button label before the value is copied (default `'Copy'`).

## Rules and invariants

- Copying replaces the label with "Copied" for 1.5 seconds, then reverts.

## Dependencies

- Button

## Requirements served

- plan-docker_management_app/REQ-26
