---
module: ui-library
component: Navigation primitives (NavRail, NavBrand, NavGroup, NavItem, FooterStatus)
type: UI component
---

# Navigation primitives

**Purpose** → the persistent left navigation rail and its parts: brand mark, grouped entries and
the footer status block showing the active Docker context.

## Contract

- `<NavBrand name tagline />` — application mark shown at the top of the rail.
- `<NavRail brand footer? children?>` — the rail itself; `children` are `NavGroup` elements.
- `<NavGroup label children?>` — a labeled group of entries (e.g. "Workloads"); `children` are
  `NavItem` elements.
- `<NavItem glyph label active? count? onSelect? />`
  - `glyph` — the two-letter glyph shown in a small badge to the left of the label.
  - `active` — marks the entry as the currently active screen (visually distinct background).
  - `count` — optional numeric badge (e.g. running-container count).
  - `onSelect` — called when the entry is activated.
- `<FooterStatus label value online? />` — status block (label + dot + value); `online` (default
  `true`) selects the dot's color.

## Rules and invariants

- Exactly one `NavItem` in the rail is `active` at a time, matching the currently displayed screen
  (REQ-2).
- `NavRail` renders as a self-contained glass panel (translucency, hairline border, elevation
  shadow, top highlight, `--radius-xl` corners on all sides) rather than a flush strip with a single
  edge border — revised 2026-08-06 alongside Frame's floating shell layout.
- `NavRail` is the surface that actually paints the rail, so it is where the material lives — its
  sizing wrapper (owned by Frame) carries none.
- **Below the phone breakpoint only**, where the rail has become the off-canvas drawer (`frame.md`),
  `NavRail` carries the overlay glass material: the content behind the open drawer shows through it
  blurred, degrading through the fallbacks stated in `overlay-glass.md`. Above that breakpoint the
  rail is docked — it is main view, it keeps the material above and computes no blur at all
  (plan-liquid_glass_overlays/REQ-7).

## Dependencies

- Overlay glass material (at the phone breakpoint)

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-2
- plan-docker_management_app/REQ-117
- plan-liquid_glass_overlays/REQ-5
- plan-liquid_glass_overlays/REQ-7
