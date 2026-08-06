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
- `<TwoLineCell title subtitle? />` — `title` on its own line, `subtitle` (e.g. short id · state)
  in muted monospace underneath.
- `<MetaCell children? />` — muted monospace text for a numeric/meta value (CPU, memory, ports,
  uptime, …); renders `'–'` when `children` is empty.

## Requirements served

- plan-docker_management_app/REQ-19
