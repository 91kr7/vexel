---
module: ui-library
component: StatusDotCell, TwoLineCell, MetaCell
type: UI component
---

# Table cells

**Purpose** → the reusable cell contents composed inside a `DataTable` column's `render`: a colored
status dot, a title-over-subtitle pair, and a muted monospace value.

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

## Requirements served

- plan-docker_management_app/REQ-19
