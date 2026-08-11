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
- The open suggestion list carries the overlay glass material: the rows and controls it covers are
  rendered blurred and are not legible through it, degrading through the fallbacks stated in
  `overlay-glass.md`. It is the application's only styled popup — a `Select`'s dropdown is drawn by
  the browser and can carry no material.
- That holds wherever the popup is opened, including inside a dialog or a form sheet — which is
  where most of them are opened, and where the blur is worth most: the form's own labels under the
  list are unreadable through it.
- The suggestions scroll inside the popup, not with it: the popup surface itself never scrolls, so
  the blurred material covers the whole list at every scroll position. The listbox is the box
  holding the options, so the options remain its direct children and the input's `aria-controls`
  points at it.
- The row under the pointer or the keyboard stays as plainly distinguishable over that material as
  it was over the former opaque list.

## Dependencies

- FieldMessage, Overlay glass material

## Requirements served

- plan-docker_management_app/REQ-29
- plan-liquid_glass_overlays/REQ-4
