---
module: ui-library
component: Card
type: UI component
---

# Card

**Purpose** → the everyday content block: a padded Surface used for dashboard tiles, list panels and
grouped content.

## Contract

- `<Card elevation? padding? accent? onSelect? selected? children?>`
  - `elevation` — forwarded to the underlying Surface (default `'flat'`).
  - `padding` — forwarded to the underlying Surface (default `'lg'`); `'none'` where the content
    manages its own edge-to-edge inset (e.g. a table).
  - `accent`, `onSelect`, `selected`, `footer` — forwarded to the underlying Surface unchanged: the
    state-coloured left edge, the selectable treatment and the closing band described in
    `surface.md`.

## Rules and invariants

- **The card declares no material of its own, and there is still no card stylesheet.** The accent
  edge, the hover/selected highlights and the footer band are the Surface's, forwarded — the one place those values
  live (plan-docker_management_app-containers_card_view/REQ-28, REQ-29). A card that carried a
  second declaration of them, even to the same value, is the defect this invariant names.
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
- plan-docker_management_app-containers_card_view/REQ-2
- plan-docker_management_app-containers_card_view/REQ-28
- plan-docker_management_app-containers_card_view/REQ-29
- plan-docker_management_app-containers_card_view/REQ-30
