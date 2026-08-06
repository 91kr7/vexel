---
module: ui-library
component: Layout primitives (Stack, Row, Grid, Spacer)
type: UI component
---

# Layout primitives

**Purpose** → generic flex/grid building blocks so feature code composes layout without ever
writing a wrapper `<div>`.

## Contract

- `<Stack gap? children?>` — vertical flex column; `gap` is a CSS length or token (default
  `var(--space-4)`).
- `<Row gap? align? justify? wrap? onClick? children?>` — horizontal flex row; `align`: `'start' |
  'center'`; `justify`: `'start' | 'between'`; `wrap`: boolean (default `false`); `onClick?` — passed
  through to the underlying element (e.g. to stop propagation inside a clickable ancestor).
- `<Grid columns? gap? children?>` — CSS grid; `columns` is a `grid-template-columns` value
  (default `repeat(auto-fill, minmax(220px, 1fr))`).
- `<Spacer />` — a flexible spacer (`flex: 1 1 auto`) that pushes Row/Stack siblings apart.

## Rules and invariants

- `Row` carries `min-width: 0`, overriding the `auto` minimum size a flex item gets by default.
  Without it a Row nested in a constrained parent refuses to shrink below its content's width and
  pushes out of its container instead of wrapping or letting its children shrink — which is how the
  shell header overflowed its card at narrow viewports (REQ-117).

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-2
- plan-docker_management_app/REQ-117
