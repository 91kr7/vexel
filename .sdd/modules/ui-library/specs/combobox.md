---
module: ui-library
component: Combobox
type: UI component
---

# Combobox

**Purpose** → a text input that suggests known options while still accepting any free text: the
typed value is always the value, a suggestion is only a shortcut. Options may arrive
asynchronously.

## Contract

- `<Combobox value onChange options loading? loadingLabel? emptyLabel? placeholder? ariaLabel?
   maxVisibleOptions? error? autoFocus? />`
  - `options: { value, label, hint? }[]` — suggestions; `hint?` is shown at the end of the row.
  - `onChange(value)` — called on every keystroke and when a suggestion is chosen.
  - `loading?` — reports that the options are still being read.
  - `maxVisibleOptions?` — how many matching suggestions are listed at once (default 8).
  - `error?` — validation message shown below the input, in the danger tone.

Shows:
- The current value in a text input; while the input has focus, the suggestions whose label or
  value contains the typed text (case-insensitive substring), capped at `maxVisibleOptions`.
- `loadingLabel` in place of the list when `loading` and nothing matches yet; `emptyLabel` when
  not loading and nothing matches.
Actions:
- typing → reports the typed text as the new value and opens the suggestion list.
- choosing a suggestion → reports that option's `value` and closes the list.
- Escape, or losing focus → closes the list without changing the value.

## Rules and invariants

- A value that matches no option is never rejected nor rewritten: free text is a legitimate value.
- Choosing a suggestion commits before focus is lost, so a click on a suggestion never ends up
  discarded by the blur that follows it.

## Dependencies

- FieldMessage

## Requirements served

- plan-docker_management_app/REQ-29
