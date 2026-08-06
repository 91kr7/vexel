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
- `<Row gap? align? justify? wrap? children?>` — horizontal flex row; `align`: `'start' | 'center'`;
  `justify`: `'start' | 'between'`; `wrap`: boolean (default `false`).
- `<Grid columns? gap? children?>` — CSS grid; `columns` is a `grid-template-columns` value
  (default `repeat(auto-fill, minmax(220px, 1fr))`).
- `<Spacer />` — a flexible spacer (`flex: 1 1 auto`) that pushes Row/Stack siblings apart.

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-2
