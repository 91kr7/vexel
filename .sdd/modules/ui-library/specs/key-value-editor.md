---
module: ui-library
component: KeyValueEditor
type: UI component
---

# KeyValueEditor

**Purpose** → repeatable key/value row editor for a form (e.g. a container's environment
variables).

## Contract

- `<KeyValueEditor pairs onChange keyPlaceholder? valuePlaceholder? addLabel? />`
  - `pairs: { key, value }[]`, `onChange(pairs): void` — called with the full next array on any
    edit, add or remove.
  - An "add" action appends an empty pair; each row has a remove action.

## Dependencies

- TextField, IconButton, Button

## Requirements served

- plan-docker_management_app/REQ-25
