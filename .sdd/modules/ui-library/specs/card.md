---
module: ui-library
component: Card
type: UI component
---

# Card

**Purpose** → the everyday content block: a padded Surface used for dashboard tiles, list panels and
grouped content.

## Contract

- `<Card elevation? padding? children?>`
  - `elevation` — forwarded to the underlying Surface (default `'flat'`).
  - `padding` — forwarded to the underlying Surface (default `'lg'`); `'none'` where the content
    manages its own edge-to-edge inset (e.g. a table).

## Rules and invariants

- **A card titles nothing.** There is no `title` prop, no title element and no card stylesheet: a
  card that could title itself was a second way of asking the one question `SectionHeader` answers.
  A screen that wants a heading composes one into the card, which is what every screen in the
  product already did — the prop's last feature call site went with the About screen, and it was
  retired rather than left exported for the next screen to find.
- Rendered geometry is a Surface's: the card's box and its content's offset inside it are the
  padding and elevation asked for, and nothing else.

## Dependencies

- Surface

## Requirements served

- plan-docker_management_app/REQ-3
- plan-ui-coherence-optimisation/REQ-26
- plan-ui-coherence-optimisation/REQ-30
- plan-ui-coherence-optimisation/REQ-81
