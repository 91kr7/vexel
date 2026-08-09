---
module: ui-library
component: EventStream
type: UI component
---

# EventStream

**Purpose** → a monospace, timestamped list of live daemon events (object type + action
emphasized), for panels like "Daemon event stream".

## Contract

- `<EventStream entries emptyLabel? maxHeight? />`
  - `entries: { id, timestamp, type, action, summary? }[]` — `timestamp` is display-ready text (the
    caller formats it); `type` and `action` are shown with visual emphasis; `summary` is an
    optional trailing detail (e.g. the actor name).
  - `id` identifies the entry: the caller supplies one that is unique within `entries` and unchanged
    across renders for the same entry.
  - `emptyLabel` — title shown via EmptyState when `entries` is empty (default `"No events yet."`).
  - `maxHeight` — scroll region height (default `"260px"`).

## Rules and invariants

- One line per entry, in the order given: two entries agreeing on everything but their `id` are two
  lines, each keeping its own timestamp, type and action across a re-render.

## Dependencies

- EmptyState, ScrollArea

## Requirements served

- plan-docker_management_app/REQ-11
- plan-docker_management_app/REQ-12
