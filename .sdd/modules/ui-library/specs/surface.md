---
module: ui-library
component: Surface
type: UI component
---

# Surface

**Purpose** → the base glass panel every other visible surface in the application is built from.

## Contract

- `<Surface elevation? padding? children?>`
  - `elevation`: `'flat' | 'raised' | 'sunken'` (default `'flat'`) — selects the surface's
    background alpha, border strength and shadow.
  - `padding`: `'none' | 'sm' | 'md' | 'lg'` (default `'none'`) — inner spacing from the tokens'
    spacing scale.

## Rules and invariants

- Built only from translucency (`--color-surface-*`), a hairline border and a top-to-bottom
  highlight gradient over the Backdrop; never `backdrop-filter` or `filter: blur(...)` (REQ-108).
- `raised` carries `--shadow-2` and the strong border; `sunken` carries an inset shadow instead of
  a highlight.

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-4
- plan-docker_management_app/REQ-108
