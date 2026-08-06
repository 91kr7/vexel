---
module: ui-library
component: NumberField
type: UI component
---

# NumberField

**Purpose** → single-line numeric input for a form (e.g. a CPU or memory limit).

## Contract

- `<NumberField value? onChange min? max? step? placeholder? ariaLabel? error? />`
  - `value?: number`, `onChange(value: number | undefined): void` — empty input reports
    `undefined`.
  - `min?`, `max?`, `step?: number`.
  - `error?: string` — when set, renders a `FieldMessage` under the field and marks it invalid.

## Dependencies

- FieldMessage

## Requirements served

- plan-docker_management_app/REQ-25
