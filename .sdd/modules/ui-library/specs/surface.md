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

- Built only from translucency (`--color-surface-*`), a hairline border, an elevation shadow and a
  crisp 1px inset top highlight (`inset 0 1px 0 var(--color-highlight-top)`, catching light like a
  glass rim) over the Backdrop; never `backdrop-filter` or `filter: blur(...)` (REQ-108). Every
  elevation carries both the shadow and the highlight, revised 2026-08-06 — `flat` (the default,
  most-used elevation) previously carried neither, which read as pasted-on and flat rather than
  lifted glass.
- `raised` carries `--shadow-3` and the strong border; `flat` carries `--shadow-1`; `sunken` carries
  an inset shadow instead of an elevation shadow, plus the same top highlight.
- Corner radius is `--radius-xl` (22px, raised from `--radius-lg`/16px 2026-08-06) for a rounder,
  more pillowy glass-card silhouette.

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-4
- plan-docker_management_app/REQ-108
