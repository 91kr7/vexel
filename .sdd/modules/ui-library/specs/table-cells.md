---
module: ui-library
component: StatusDotCell, TwoLineCell, MetaCell, IdentifierCell, BadgeListCell
type: UI component
---

# Table cells

**Purpose** → the reusable cell contents composed inside a `DataTable` column's `render`: a colored
status dot, a title-over-subtitle pair, a muted monospace value, a truncated identifier, and a list
of badges with an overflow indicator.

## Contract

- `<StatusDotCell tone label? />` — `tone`: `'success' | 'neutral' | 'warning' | 'danger'`; renders a
  colored dot, followed by `label` when given.
- `<TwoLineCell title subtitle? action? />` — `title` on its own line, `subtitle` (e.g. short id ·
  state) in muted monospace underneath, and an optional trailing `action` (e.g. an edit affordance)
  hidden until the cell is hovered or a descendant gains keyboard focus — never `display: none`, so
  it stays reachable via Tab and to assistive technology regardless of hover state.
- `<MetaCell children? wrap? title? />` — muted monospace text for a numeric/meta value (CPU,
  memory, ports, uptime, …); renders `'–'` when `children` is empty. Single line by default:
  overflowing text ellipsis-truncates instead of wrapping or growing the row, with the full value
  available as a native tooltip (`title`, defaulting to the text content itself when `children` is a
  string or number). `wrap: true` instead wraps long unbroken values (e.g. a PATH-style line) onto
  multiple lines within the cell.
- `<IdentifierCell value? maxChars? />` — an opaque identifier (hash, digest, key) in monospace.
  Renders `'–'` when `value` is empty. When `maxChars` is given and the value is longer, the value is
  cut at its tail and the cut is marked with an ellipsis character, so every row shows the same
  number of characters regardless of the column width; whatever survives that cut still
  ellipsis-truncates to one line if the column is narrower. The full, uncut value is always available
  as a native tooltip.
- `<BadgeListCell labels tone? maxVisible? emptyLabel? emptyTone? />` — `labels: string[]` rendered
  as one `Badge` each, in order, on a single line.
  - at most `maxVisible` badges are rendered (default 3); when there are more, a trailing `+N` badge
    reports how many are hidden and lists them in its tooltip
  - `tone` applies to the label badges (default `neutral`); the `+N` badge is always `neutral`
  - empty `labels` → `emptyLabel` rendered as a single badge with `emptyTone` (default `neutral`)
    when given, otherwise `'–'`

## Rules and invariants

- Every cell stays on one line and never grows the row's fixed height: content that does not fit is
  truncated or clipped, never wrapped.

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-37
