---
module: ui-library
component: Chip, ChipGroup
type: UI component
---

# Chip, ChipGroup

**Purpose** → a short label chip carrying an optional muted meta reading and an optional inline
secondary action (e.g. "detach", "pull"), and a row of such chips with an optional trailing "add"
affordance (e.g. attaching a container to a network, or a repository's tags with the size each one
weighs).

## Contract

- `<Chip label meta? actionLabel? onAction? />`
  - `meta?` — a secondary reading shown after the label, muted (e.g. `256MB`); omitted when absent.
  - `actionLabel` and `onAction` must both be given for the action to show; either missing renders a
    plain, action-less chip.
- `<ChipGroup items addLabel? onAdd? emptyLabel? />`
  - `items: { key, label, meta?, actionLabel?, onAction? }[]` — each rendered as a `Chip`.
  - `addLabel` and `onAdd` must both be given for the trailing add affordance to show.
  - `emptyLabel?` — shown in place of any chip when `items` is empty.

Shows:
- One chip per item: its label, its meta reading when given, then its own inline action when given —
  in that order.
- A trailing add affordance when `addLabel`/`onAdd` are both given.
- The empty-state label when there are no items and `emptyLabel` is given.
Actions:
- a chip's inline action → calls that chip's `onAction`.
- the trailing add affordance → calls `onAdd`.

## Requirements served

- plan-docker_management_app/REQ-72
- plan-docker_management_app/REQ-74
- plan-docker_management_app/REQ-86
