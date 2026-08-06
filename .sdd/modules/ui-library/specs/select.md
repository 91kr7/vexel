---
module: ui-library
component: Select
type: UI component
---

# Select

**Purpose** → single-choice dropdown for a form (e.g. a restart policy).

## Contract

- `<Select value onChange options ariaLabel? />`
  - `value: string`, `onChange(value): void`.
  - `options: { value, label }[]`.

## Requirements served

- plan-docker_management_app/REQ-25
