---
module: ui-library
component: EndpointField
type: UI component
---

# EndpointField

**Purpose** → the form group that captures an endpoint: which kind of endpoint it is, and the single
host value that kind needs — or the statement of the fixed host it uses, when the kind needs no
input at all.

## Contract

- `<EndpointField kinds kind onKindChange host onHostChange error? kindLabel? />`
  - `kinds: { value, label, hostLabel?, hostPlaceholder?, hostHint?, fixedHost? }[]` — the offered
    kinds, in the order given.
  - `kind: string`, `onKindChange(value)` — the selected kind; changing the selection calls back.
  - `host: string`, `onHostChange(value)` — the host value the selected kind needs.
  - `error?: string` — validation message shown under the host input, replacing its hint.
  - `kindLabel?: string` — label of the kind selector (default "Endpoint kind").

Shows:
- A single-choice selector holding every offered kind.
- For a kind carrying `hostLabel`: a labelled text input for the host, with its own placeholder and
  hint (or the validation message, when `error` is set).
- For a kind carrying `fixedHost` instead: that sentence, read-only, in place of the input.
- Nothing below the selector for a kind carrying neither.

Actions:
- Choosing another kind → reports the new kind; the input (or fixed-host statement) below becomes
  that kind's own.
- Typing in the host input → reports the value on each keystroke.

## Rules and invariants

- The host input belongs to the selected kind: a kind that declares no `hostLabel` shows no input,
  so a kind needing nothing from the operator can never be given a value by mistake.
- The component holds no state of its own: the selected kind and the host value are the caller's.

## Dependencies

- FormField, Select, TextField, FieldMessage, Stack

## Requirements served

- plan-docker_management_app/REQ-92
