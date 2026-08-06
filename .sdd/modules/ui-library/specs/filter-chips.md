---
module: ui-library
component: FilterChips
type: UI component
---

# FilterChips

**Purpose** → a single-select row of filter chips (e.g. container state: all / running / stopped /
paused).

## Contract

- `<FilterChips options activeId onSelect />` — `options: { id, label }[]`; the chip whose `id`
  equals `activeId` renders active; `onSelect(id)` fires on click.

## Requirements served

- plan-docker_management_app/REQ-23
