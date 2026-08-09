---
module: ui-library
component: KeyValueEditor
type: UI component
---

# KeyValueEditor

**Purpose** → repeatable key/value row editor for a form (e.g. a container's environment
variables).

## Contract

- `<KeyValueEditor pairs onChange name? keyPlaceholder? valuePlaceholder? addLabel? />`
  - `pairs: { key, value }[]`, `onChange(pairs): void` — called with the full next array on any
    edit, add or remove.
  - An "add" action appends an empty pair; each row has a remove action.
  - `name` — what the caller calls this editor (e.g. the label of the field group it fills). It
    qualifies the accessible name of every control in the editor; it is not displayed.

## Rules and invariants

- Row `N` (1-based) exposes two textboxes and one remove action, named:
  - with `name` given → `<name> Key N`, `<name> Value N`, `Remove <key> from <name>`
  - without `name` → `Key N`, `Value N`, `Remove <key>`
  - where `<key>` is the row's current key, or `pair N` while it is still empty.
- Two editors mounted on the same form therefore share no accessible name, as long as their callers
  pass different `name`s: a screen reader announces which editor a field belongs to.
- `name` never changes what is rendered on screen: it is an accessible-naming qualifier only. The
  visible placeholders and the add action stay exactly as the caller set them.

## Dependencies

- TextField, IconButton, Button

## Requirements served

- plan-docker_management_app/REQ-25
