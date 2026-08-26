---
module: ui-library
component: Surface
type: UI component
---

# Surface

**Purpose** → the base glass panel every other visible surface in the application is built from.

## Contract

- `<Surface elevation? padding? material? accent? onSelect? selected? children?>`
  - `elevation`: `'flat' | 'raised' | 'sunken'` (default `'flat'`) — selects the surface's
    background alpha, border strength and shadow.
  - `padding`: `'none' | 'sm' | 'md' | 'lg'` (default `'none'`) — inner spacing from the tokens'
    spacing scale.
  - `material`: `'base' | 'overlay'` (default `'base'`) — `'overlay'` adds the blurred overlay
    glass material (`overlay-glass.md`) on top of the chosen elevation, so what is behind the
    surface shows through it blurred. Only a surface drawn above what it covers may ask for it.
  - `accent`: `'success' | 'warning' | 'danger' | 'neutral'` — draws a bar down the surface's left
    edge, running its full height and following the surface's own left rounding rather than cutting
    across the corner. Absent, the surface has no accent and is drawn exactly as before.
  - `onSelect?()` — makes the surface **selectable**: it takes the pointer cursor, the hover
    highlight, and reports which one is selected. Called on a click anywhere on the surface that a
    control inside it did not swallow.
  - `selected` — whether this is the selected surface. Only meaningful with `onSelect`; it then also
    becomes the surface's `aria-selected`.
  - `footer?` — a band closing the surface: its own ground, a hairline above it, spanning the
    surface's full width from edge to edge and following its bottom rounding. Absent, the surface is
    one undivided band and is drawn exactly as before.

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
- **This is where the card's material lives, and there is one of it.** A selectable Surface's hover
  highlight is `--color-surface-2` and its selected highlight `--color-accent-tint` — the two tokens
  `.ui-data-table__row:hover` and `.ui-data-table__row--selected` already carry, referenced and not
  re-declared, so a list drawn as one surface per object wears the object table's own material
  (plan-docker_management_app-containers_card_view/REQ-28, REQ-29). The highlight is laid over the
  surface's fill rather than replacing it, because a Surface already fills itself with one of those
  tokens: that is what makes the composite identical to the row's, and a fill swap would leave a
  `flat` surface with no visible hover at all.
- The accent bar's colour is the state role's own token (`--color-success` / `--color-warning` /
  `--color-danger` / `--color-text-muted`); the bar is painted on the surface's `::after` layer,
  clipped by the surface's own radius, and takes no pointer event. `::before` belongs to the overlay
  material, and the two are never asked for together.
- A `Surface` asked for no `accent`, no `onSelect` and no `selected` renders exactly what it rendered
  before those existed: same markup, same classes, same computed style, no click handler and no
  `aria-selected`. The same holds for `footer`: without one the children are the surface's own,
  unwrapped.
- **A footer parts the surface into two bands, and the padding goes with them.** The inset asked for
  by `padding` leaves the surface and is taken by each band, which is what lets the footer's ground
  and its hairline reach the surface's edges instead of stopping short of them. The two bands
  therefore share one inset: a control in the footer stands at the same x as the content above it.
- **The footer's ground is a wash over the surface's own fill, not a second surface colour**
  (`--color-wash-1`), and its bottom corners inherit the surface's radius rather than restating it —
  a surface with a footer is exactly as round as one without. The accent bar, being a layer over the
  whole surface, runs through the footer as it runs through the content (2026-08-25).
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
- plan-docker_management_app-containers_card_view/REQ-2
- plan-docker_management_app-containers_card_view/REQ-18
- plan-docker_management_app-containers_card_view/REQ-28
- plan-docker_management_app-containers_card_view/REQ-29
- plan-docker_management_app-containers_card_view/REQ-30
