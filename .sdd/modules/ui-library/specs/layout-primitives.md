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
- `<Grid columns? gap? arrangement? children?>` — CSS grid; `columns` is a `grid-template-columns`
  value (default `repeat(auto-fill, minmax(220px, 1fr))`).
  - `arrangement?: 'pair' | 'even-row'` — a **named** arrangement the library owns end to end: the
    caller asks for the shape and states no template and no gap (`columns` and `gap` are ignored when
    it is set).
    - `pair` — two equal columns side by side, stacking to one full-width column when the grid's own
      box cannot carry both.
    - `even-row` — every child in a track of its own, all of equal width, on one row: the track count
      **is** the child count, whatever that count is, so no child is ever left alone on a row the
      others do not share. Below the phone breakpoint the row becomes a single stacked column.
- `<Spacer />` — a flexible spacer (`flex: 1 1 auto`) that pushes Row/Stack siblings apart.

## Rules and invariants

- `Grid`'s `pair` arrangement is **intrinsic**, not keyed to the viewport: it collapses the tracks its
  two children do not occupy, so the two that remain always share the full width equally, and it
  stacks when its own box falls below two short-scalar bands (~744px). A pair inside a narrow card
  therefore stacks on a wide screen, which a media query would get wrong — and no breakpoint is
  invented, since below 720px of viewport the panel is under that width anyway.
- `Grid`'s `even-row` arrangement states no count: it derives the tracks from the children placed in
  it, so a caller can neither hard-code a column count nor let one drift out of step with the number
  of items. Where an auto-fitting grid puts the fifth of five items alone on a second row as soon as
  only four tracks fit, this one cannot: there are five tracks because there are five children. It is
  the one arrangement keyed to the viewport, and to one breakpoint only — the phone breakpoint the
  shell already uses (720px) — because a stack is the only division of an arbitrary count that leaves
  no orphan, and no width narrower than that can carry a row of equal tracks at all.
- `Row` carries `min-width: 0`, overriding the `auto` minimum size a flex item gets by default.
  Without it a Row nested in a constrained parent refuses to shrink below its content's width and
  pushes out of its container instead of wrapping or letting its children shrink — which is how the
  shell header overflowed its card at narrow viewports (REQ-117).

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-2
- plan-docker_management_app/REQ-117
- plan-docker_management_app-detail_property_columns/REQ-12
- plan-docker_management_app-detail_property_columns/REQ-13
- plan-docker_management_app-detail_property_columns/REQ-18
- plan-ui-coherence-optimisation/REQ-63
