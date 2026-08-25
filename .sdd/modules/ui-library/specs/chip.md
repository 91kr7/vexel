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

- `<Chip label prefix? meta? tone? actionLabel? onAction? onSelect? />`
  - `prefix?` — a muted qualifier shown **before** the label, naming what the label is (e.g.
    `image` before an image reference); omitted when absent. Same muted treatment as `meta`, one
    declaration serving both positions.
  - `meta?` — a secondary reading shown after the label, muted (e.g. `256MB`); omitted when absent.
  - `tone?: 'neutral' | 'accent'` (default `'neutral'`) — `'accent'` marks the chip the caller
    wants read as the salient one among its neighbours, rather than as one more plain attribute
    beside them; it takes the accent role's own border, tint and text tokens and declares no
    colour of its own. What makes a value salient is the caller's to decide: the library states
    the emphasis, never the reason for it.
  - `actionLabel` and `onAction` must both be given for the action to show; either missing renders a
    plain, action-less chip.
  - `onSelect?` — makes the whole chip the click target, for a chip that is itself a starting point
    (e.g. a suggested command put into an input) rather than a label carrying a secondary action.
    A chip with `onSelect` carries no inline action.
- `<ChipGroup items addLabel? onAdd? emptyLabel? />`
  - `items: { key, label, prefix?, meta?, tone?, actionLabel?, onAction?, onSelect? }[]` — each
    rendered as a `Chip`, every field forwarded unchanged.
  - `addLabel` and `onAdd` must both be given for the trailing add affordance to show.
  - `emptyLabel?` — shown in place of any chip when `items` is empty.

Shows:
- One chip per item: its prefix when given, its label, its meta reading when given, then its own
  inline action when given — in that order.
- A trailing add affordance when `addLabel`/`onAdd` are both given.
- The empty-state label when there are no items and `emptyLabel` is given.
Actions:
- a chip's inline action → calls that chip's `onAction`.
- a chip carrying `onSelect` → clicking anywhere on it calls `onSelect`.
- the trailing add affordance → calls `onAdd`.

## Rules and invariants

- **A chip's inline action is a control and is drawn as one**: it carries a surface and a shape of
  its own inside the chip, so `detach` and `pull` read as something to press rather than as the last
  word of the chip's label. Bare text is never a control, wherever it sits.
- **The chip is exactly as tall with that action as it was without one drawn.** The action is filled
  rather than outlined for that reason: an edge would make it taller than the line it sits on and
  grow every chip, and with it the height of the rows that carry chip groups on the networks and
  registries lists, which two certified batches pinned to the pixel.
- **The trailing add affordance is the library's own button**, not an outline of its own invention.
  The dashed pill it used to be read as a placeholder waiting to be filled; it still calls `onAdd`
  and nothing else about the group changed.
- A chip that carries neither an action nor `onSelect` is a statement and holds no control at all.
- A chip asked for no `prefix` and no `tone` renders exactly what it rendered before those existed.

## Dependencies

- Button

## Requirements served

- plan-ui-coherence-optimisation/REQ-80

- plan-docker_management_app/REQ-72
- plan-docker_management_app/REQ-74
- plan-docker_management_app/REQ-86
- plan-docker_management_app/REQ-103
- plan-docker_management_app-containers_card_view/REQ-5
- plan-docker_management_app-containers_card_view/REQ-30
