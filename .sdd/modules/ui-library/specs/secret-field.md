---
module: ui-library
component: SecretField
type: UI component
---

# SecretField

**Purpose** → a single-line input for a secret the operator types once (a password, an access
token): every character is masked and nothing typed into it can ever be read back on screen.

## Contract

- `<SecretField value onChange ariaLabel placeholder? onSubmit? autoFocus? />`
  - `ariaLabel` is **required**: the field carries no visible label of its own and must still be
    nameable by assistive technology.
  - `onChange(value)` fires on every keystroke with the current value.
  - `onSubmit?()` fires on Enter.
  - `autoFocus?` focuses the field on mount.

Shows:
- The typed value masked, one placeholder glyph per character; the placeholder text when empty.
Actions:
- typing → `onChange` with the new value.
- Enter → `onSubmit`, when given.

## Rules and invariants

- **There is no reveal control, and no prop that adds one**: the value is never rendered in clear
  text, in any state (REQ-87). A caller that wants a visible value uses `TextField` — a different
  component for a different kind of value.
- Browser autofill, password managers and spell-checking are all kept off the field, so the value
  is not offered for storage anywhere outside the keystroke that produced it.
- The component holds no state of its own: the value lives with the caller, which is what lets the
  caller drop it the moment the form closes.

## Requirements served

- plan-docker_management_app/REQ-87
