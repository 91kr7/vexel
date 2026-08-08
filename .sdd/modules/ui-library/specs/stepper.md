---
module: ui-library
component: Stepper
type: UI component
---

# Stepper

**Purpose** → a decrement / value / increment control for a small bounded integer, e.g. a compose
service's replica count.

## Contract

- `<Stepper value onChange min? max? step? disabled? ariaLabel? />`
  - `value: number`, `onChange: (value: number) => void`.
  - `min?: number` (default `0`), `max?: number` (unbounded when omitted), `step?: number`
    (default `1`).
  - `disabled?: boolean` (default `false`) disables both actions regardless of bounds.
  - `ariaLabel?: string` (default `"value"`) names the two actions as "Decrease `<ariaLabel>`" /
    "Increase `<ariaLabel>`".

Shows:

- a decrement button, the current `value`, an increment button.

Actions:

- decrement → calls `onChange(value - step)`, clamped to `min`.
- increment → calls `onChange(value + step)`, clamped to `max` when given.

## Rules and invariants

- The decrement action is disabled once `value` is at `min`; the increment action is disabled once
  `value` is at `max` (when `max` is given).

## Dependencies

- IconButton

## Requirements served

- plan-docker_management_app/REQ-76
