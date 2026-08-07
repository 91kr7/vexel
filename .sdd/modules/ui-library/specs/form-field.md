---
module: ui-library
component: FormField
type: UI component
---

# FormField

**Purpose** → a labelled form control: the label above, the control, and one message line below —
a hint normally, the validation message when the field is invalid.

## Contract

- `<FormField label hint? error?>{control}</FormField>`
  - `label` — always shown above the control.
  - `hint?` — guidance shown below the control while `error` is absent.
  - `error?` — validation message shown below the control, in the danger tone.
  - `children` — the control (or controls) the label refers to.

## Rules and invariants

- At most one message line is shown: `error` replaces `hint` whenever it is present.

## Dependencies

- FieldMessage

## Requirements served

- plan-docker_management_app/REQ-27
- plan-docker_management_app/REQ-28
