---
module: ui-library
component: SectionHeader
type: UI component
---

# SectionHeader

**Purpose** → the header of a content section within a screen (distinct from the screen-level
PageHeader): a title, an optional same-baseline sublabel, an optional one-line description and a
trailing actions slot.

**The one question it answers** → *how is a section titled?* There is one component that titles a
section, and a card's own title is this component (see `card.md`) rather than a treatment of the
card's.

## Contract

- `<SectionHeader title sublabel? description? trailing? variant? />`
  - `title: string`.
  - `sublabel?: string` — a qualifier belonging to the title: what the section holds, a count, a
    scope. Rendered **on the title's own line and its own baseline**, in a smaller muted treatment.
  - `description?: string` — one line under the title.
  - `trailing?: ReactNode` — the section's actions.
  - `variant?: 'default' | 'eyebrow'` (default `'default'`) — `'eyebrow'` is the small uppercase
    label for a column or group heading rather than a full title.

## Rules and invariants

- **A sublabel never changes the header's height**, because it sits on the title's line rather than
  under it. Two headers side by side therefore share a baseline whether one, both or neither carries
  one, and the two cards' contents start at the same y — which is the misalignment this exists to
  prevent, measured rather than judged by eye.
- The space before the sublabel is a margin, not a text node, so it survives a line break between
  the title and its qualifier.
- The sublabel resets the treatment the header's variant applies to the title (letter-spacing, case),
  so an eyebrow header's sublabel reads as a qualifier rather than as more of the same label.
- **`Card` renders its title through this component**; there is no second element and no second rule
  carrying a card-title treatment. The step between the heading and the card's content stays the
  card's, being the card's spacing rather than the header's.

## Dependencies

- Design tokens

## Requirements served

- plan-docker_management_app/REQ-3
- plan-ui-coherence-optimisation/REQ-26
- plan-ui-coherence-optimisation/REQ-28
- plan-ui-coherence-optimisation/REQ-30
