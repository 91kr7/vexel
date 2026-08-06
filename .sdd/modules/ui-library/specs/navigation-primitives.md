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

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-2
