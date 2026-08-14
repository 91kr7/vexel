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
  - `renderRow(item): { title, status?, subtitle?, badges?, meta?, content?, selection? }` — `title` bold;
    `subtitle` monospace, muted, one string or several (each rendered on its own line, in order);
    `badges` and `meta` render trailing, on the same row; `content` renders in its own row below the
    header, e.g. a chip group with per-chip actions.
  - `status?: StatusTone` — a leading state dot of that tone, for a row whose condition matters on
    its own (e.g. a registry being authenticated) outside any active-selection set.
  - `selection?: { active, onUse?, activeLabel?, useLabel? }` — the active-selection row variant, for
    a set where exactly one row is in use: every such row gains a leading dot, green on the active
    row and muted on the others; the active row shows the `activeLabel` marker (default "active")
    and the others an action labelled `useLabel` (default "use") that calls `onUse`.
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
- The "use" action of the selection variant never appears on the active row, and the "active" marker
  never appears on any other: the two are exclusive.
- A row with neither `selection` nor `status` has no leading dot and no marker.
- `selection` wins over `status` when both are given: a row that belongs to an active-selection set
  shows that set's dot, so one row never carries two different state dots.
- **The header row honors the truncation contract** (`truncation-contract.md`): the title/subtitle
  run shrinks and each of its lines truncates with an ellipsis; the trailing badge group and meta
  values keep their natural width. The run's box and the trailing group's box never intersect, at
  any viewport and for a title or subtitle of any length — a 64-character digest and an absolute
  mount path are the normal case here.
- **A subtitle is one line.** A subtitle with a break opportunity used to wrap onto a second line
  and now truncates instead, which is the same rule applied to the case that happened to survive
  it: the row is a list row. The full value is the detail surface's to show.

  > **This shortened rows on the delivered desktop, deliberately, and here is which ones** — so that
  > a reader meeting it later reads a decision rather than a regression. A subtitle only overlapped
  > its neighbour when it had *no* break opportunity (a 64-character digest, an absolute path); one
  > that had a space wrapped instead, and wrapping was never the contract, only the case that
  > happened to survive it. Measured before and after on the delivered build: **11 rows lose a line
  > at 1440×1000** — Registries (5, row height `91.1px → 73.7px`) and Builders & cache (6,
  > `112.5px → 95.1px`) — and **18 at 1280×800**, the same two screens plus one volumes row and one
  > contexts row. The loss is one 12px line each, **17.4px**, and nothing else about those rows
  > moves: the trailing group's box is identical in every row present in both states. Where that
  > second line carried something the operator needs in full, the answer is the object's detail
  > surface (`definition-list.md`), never restoring the wrap here.
- **When the row cannot hold both, the trailing group takes its own line** under the run, rather
  than being squeezed, pushed outside the card or overlapped. Measured on the delivered widths: no
  row wraps at 1440×1000 or 1280×800 — the narrowest run any of the 111 shipped rows is offered at
  1280×800 is 138.7px against a 120px floor — and every row wraps at 375×812, where the screens
  still hand their cards ~90px of width.

## Dependencies

- Surface, Badge, StatusDotCell, Truncation contract

## Requirements served

- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-41
- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-72
- plan-docker_management_app/REQ-85
- plan-docker_management_app/REQ-86
- plan-docker_management_app/REQ-92
- plan-ui-coherence-optimisation/REQ-17
- plan-ui-coherence-optimisation/REQ-18
- plan-ui-coherence-optimisation/REQ-19
