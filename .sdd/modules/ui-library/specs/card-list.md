---
module: ui-library
component: CardList
type: UI component
---

# CardList

**Purpose** → full-width card rows shared by every "one row per named object" screen that is not a
dense table (images, builders, contexts, registries, plugins): title, monospace subtitle, a
trailing badge group and meta values, selectable, with an optional expanded content slot rendered
inside the same card.

## Contract

- `<CardList items itemKey renderRow selectedKey? onSelect? expandedKey? renderExpanded?
  emptyState? />`
  - `items: T[]`, `itemKey(item): string`.
  - `renderRow(item): { title, subtitle?, badges?, meta?, content? }` — `title` bold; `subtitle`
    monospace, muted, one string or several (each rendered on its own line, in order); `badges` and
    `meta` render trailing, on the same row; `content` renders in its own row below the header, e.g.
    a chip group with per-chip actions.
  - `selectedKey?: string`, `onSelect?(item)` — clicking a row's header calls `onSelect`; the row
    whose key matches `selectedKey` renders in its selected state.
  - `expandedKey?: string`, `renderExpanded?(item)` — when an item's key matches `expandedKey`,
    `renderExpanded(item)`'s content renders inside that same card, directly below its header row.
  - `emptyState?: ReactNode` — shown instead of any cards when `items` is empty.

## Rules and invariants

- Each item renders as its own glass card (not a shared table grid): selection/hover states and the
  expanded content stay scoped to that one card.
- Only the header row is clickable for `onSelect`; content rendered by `content` or `renderExpanded`
  is outside that clickable area, so its own interactive elements never also toggle selection.

## Dependencies

- Surface

## Requirements served

- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-41
- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-72
