---
module: ui-library
component: Surface
type: UI component
---

# Surface

**Purpose** → the base glass panel every other visible surface in the application is built from.

## Contract

- `<Surface elevation? padding? material? children?>`
  - `elevation`: `'flat' | 'raised' | 'sunken'` (default `'flat'`) — selects the surface's
    background alpha, border strength and shadow.
  - `padding`: `'none' | 'sm' | 'md' | 'lg'` (default `'none'`) — inner spacing from the tokens'
    spacing scale.
  - `material`: `'base' | 'overlay'` (default `'base'`) — `'overlay'` adds the blurred overlay
    glass material (`overlay-glass.md`) on top of the chosen elevation, so what is behind the
    surface shows through it blurred. Only a surface drawn above what it covers may ask for it.

## Rules and invariants

- The base material (`material="base"`, the default) is built only from translucency
  (`--color-surface-*`), a hairline border, an elevation shadow and a crisp 1px inset top highlight
  (`inset 0 1px 0 var(--color-highlight-top)`, catching light like a glass rim) over the Backdrop.
  It computes **no runtime blur**, at any elevation: that is what keeps every main-view panel built
  on a Surface free of one (plan-liquid_glass_overlays/REQ-7). Every elevation carries both the
  shadow and the highlight, revised 2026-08-06 — `flat` (the default, most-used elevation)
  previously carried neither, which read as pasted-on and flat rather than lifted glass.
- `material="overlay"` is the single opt-in that blurs, bounded by the `--blur-overlay` token and
  degrading through the `@supports` and reduced-transparency fallbacks stated in
  `overlay-glass.md`. Narrows the earlier "never `backdrop-filter` or `filter: blur(...)`"
  (`plan-docker_management_app/REQ-108`), which this plan supersedes.
- A `Surface` asked for no `material` renders exactly what it rendered before the opt-in existed:
  same markup, same classes, same computed style. The material is additive and reachable only by
  asking.
- `raised` carries `--shadow-3` and the strong border; `flat` carries `--shadow-1`; `sunken` carries
  an inset shadow instead of an elevation shadow, plus the same top highlight.
- Corner radius is `--radius-xl` (22px, raised from `--radius-lg`/16px 2026-08-06) for a rounder,
  more pillowy glass-card silhouette.

## Dependencies

- Overlay glass material (for `material="overlay"`)

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-4
- plan-docker_management_app/REQ-108
- plan-liquid_glass_overlays/REQ-1
- plan-liquid_glass_overlays/REQ-6
- plan-liquid_glass_overlays/REQ-7
- plan-liquid_glass_overlays/REQ-15
