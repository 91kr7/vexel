---
module: ui-library
component: PathInput
type: UI component
---

# PathInput

**Purpose** → a text field for an operator-typed host path, with a validation state, a refusal
message and a browse hint (REQ-115, REQ-116).

## Contract

- `<PathInput value onChange label? placeholder? validationState? refusalMessage? browseHint?
  disabled? />`
  - `value`, `onChange(value: string)` — controlled text value.
  - `label?` — field label shown above the input.
  - `validationState?`: `'idle' | 'valid' | 'invalid'` (default `'idle'`) — tints the field's border
    (neutral / success / danger).
  - `refusalMessage?` — shown below the field, in the danger tone, only when `validationState` is
    `'invalid'`.
  - `browseHint?` — shown below the field, in a muted tone, whenever `refusalMessage` is not shown
    (i.e. `validationState` is `'idle'` or `'valid'`).
  - `placeholder?`, `disabled?` — passed through to the underlying field.

## Rules and invariants

- Exactly one helper line is visible at a time below the field: the refusal message when invalid,
  otherwise the browse hint (if given); never both, never stacked.

## Dependencies

- ui-library: design tokens

## Requirements served

- plan-docker_management_app/REQ-115
- plan-docker_management_app/REQ-116
