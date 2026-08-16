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
- **The label carries the product's one label treatment, and it is not a section header's.** It is
  small and quiet and stays in the case it was written in: it declares no uppercasing and no
  letter-spacing, the two properties that used to make `IMAGE`, `ENTRYPOINT` and `COMMAND` read as
  headings of sections that do not exist and compete with the heading of the group actually holding
  them. A label names its control; the same treatment a property row's label carries.
- The label keeps its association with its control whatever it is drawn like: every field states its
  label, and the control keeps its own accessible name.

## Dependencies

- FieldMessage

## Requirements served

- plan-docker_management_app/REQ-27
- plan-docker_management_app/REQ-28
- plan-ui-coherence-optimisation/REQ-79
- plan-ui-coherence-optimisation/REQ-81
