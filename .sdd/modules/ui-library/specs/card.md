---
module: ui-library
component: Card
type: UI component
---

# Card

**Purpose** → the everyday content block: a padded Surface with an optional title, used for
dashboard tiles, list panels and grouped content.

## Contract

- `<Card title? elevation? padding? children?>`
  - `title` — optional heading above the content, rendered as a `SectionHeader` in its eyebrow
    treatment.
  - `elevation` — forwarded to the underlying Surface (default `'flat'`).
  - `padding` — forwarded to the underlying Surface (default `'lg'`); `'none'` where the content
    manages its own edge-to-edge inset (e.g. a table).

## Rules and invariants

- **The title is a `SectionHeader`, not a treatment of the card's own.** A card's heading and a
  section's heading were two ways of stating one thing — byte-identical declarations in two
  stylesheets — and one of them had to stop existing. All the card keeps is the step between its
  heading and its content, which is the card's spacing rather than the header's.
- Rendered geometry and typography are unchanged by that: card box, the content's offset inside it
  and the heading's computed type measure identically before and after, at 1440×1000, 1280×800 and
  375×812.

## Dependencies

- Surface
- SectionHeader

## Requirements served

- plan-docker_management_app/REQ-3
- plan-ui-coherence-optimisation/REQ-26
- plan-ui-coherence-optimisation/REQ-30
