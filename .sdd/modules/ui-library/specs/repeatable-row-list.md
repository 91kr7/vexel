---
module: ui-library
component: RepeatableRowList
type: UI component
---

# RepeatableRowList

**Purpose** → generic repeatable list of custom-rendered rows with add/remove, for a form field
that is itself a list of structured values (e.g. a container's port mappings or mounts).

## Contract

- `<RepeatableRowList items onChange renderRow createItem addLabel? removeLabel? />`
  - `items: T[]`, `onChange(items): void` — called with the full next array on any edit, add or
    remove.
  - `renderRow(item, index, update): ReactNode` — `update(patch)` merges `patch` into that row's
    item and reports the change.
  - `createItem(): T` — produces a new row's initial value for the "add" action.
  - `removeLabel?(item): string` — accessible label for a row's remove action (default `'Remove row
    N'`).

## Dependencies

- IconButton, Button

## Requirements served

- plan-docker_management_app/REQ-25
