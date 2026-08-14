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
- `<NavRail brand footer? children?>` — the rail itself; `children` are `NavGroup` elements. The
  brand and the footer keep their size at every viewport; the entries take what is left of the rail
  and scroll inside it.
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
- **The rail never lays out or paints anything outside its own card**, whatever its entries measure:
  the card is bounded by the height its wrapper gives it (`frame.md`), and the entry region is the
  one part of it that gives way. The region takes the height the brand and the footer card leave and
  scrolls when the entries exceed it; the footer card keeps its size and its place at the bottom and
  is never overlapped, at any viewport height (plan-ui-coherence-optimisation/REQ-2,
  plan-ui-coherence-optimisation/REQ-4). Below the height at which every entry fits — which on a
  thirteen-entry rail is every ordinary laptop — reaching the last entries is a scroll, not a
  resize.
- **The region states where its content is cut, and the entry meeting the cut is faded** on whichever
  edge still holds entries beyond it. Scrolling alone does not make those entries reachable: where
  the platform draws overlay scrollbars there is no scrollbar to see and the cut falls between two
  entries, so a list of thirteen reads as a complete set of ten and three destinations are invisible
  rather than merely off screen (plan-ui-coherence-optimisation/REQ-1). The fade is a mask over the
  region's own content — it reads nothing behind the rail and computes no filter, so it is not a
  blur and does not touch the blur allow-list (plan-ui-coherence-optimisation/REQ-5).
- Above the height at which the entries fit, the region simply stops scrolling: no fade is shown, and
  the space left over stays between the last entry and the footer card, which keeps its anchoring
  (plan-ui-coherence-optimisation/REQ-3).
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
- plan-ui-coherence-optimisation/REQ-1
- plan-ui-coherence-optimisation/REQ-2
- plan-ui-coherence-optimisation/REQ-3
- plan-ui-coherence-optimisation/REQ-4
- plan-ui-coherence-optimisation/REQ-5
