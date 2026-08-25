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
section, and by the end of the programme it is the **only** thing that titles one: a card no longer
has a title of its own to delegate (see `card.md`), a form's field group is titled by this component
too (see `form-section.md`), and a field's label is a label rather than a fourth heading (see
`form-field.md`).

## Contract

- `<SectionHeader title sublabel? description? trailing? variant? truncate? />`
  - `title: string`.
  - `sublabel?: string` — a qualifier belonging to the title: what the section holds, a count, a
    scope. Rendered **on the title's own line and its own baseline**, in a smaller muted treatment.
  - `description?: string` — one line under the title.
  - `trailing?: ReactNode` — the section's actions.
  - `variant?: 'default' | 'eyebrow'` (default `'default'`) — `'eyebrow'` is the small uppercase
    label for a column or group heading rather than a full title.
  - `truncate?: boolean` (default `false`) — the title gives way instead of pushing what stands
    beside it out of place: it keeps one line and ellipsises at its end, carrying the whole title as
    its `title` attribute. For a header standing in a row with something anchored to its right — a
    card's name against its identifier. A header that does not ask for it wraps as it always did.

## Rules and invariants

- **A sublabel never changes the header's height**, because it sits on the title's line rather than
  under it. Two headers side by side therefore share a baseline whether one, both or neither carries
  one, and the two cards' contents start at the same y — which is the misalignment this exists to
  prevent, measured rather than judged by eye.
- The space before the sublabel is a margin, not a text node, so it survives a line break between
  the title and its qualifier.
- **`truncate` is the library's one truncation contract, applied** (`truncation-contract.md`): the
  line class on the title, and the minimum widths without which a flex item never shrinks far enough
  for an ellipsis to appear. The header declares no ellipsis of its own, and the value stays
  obtainable in full on the object's detail surface.
- The sublabel resets the treatment the header's variant applies to the title (letter-spacing, case),
  so an eyebrow header's sublabel reads as a qualifier rather than as more of the same label.
- **No other component carries a heading treatment.** `Card` used to render a title through this one;
  it now renders none at all, its `title` prop having had no feature call site left, and there is no
  element and no rule anywhere else declaring a heading's type. A screen or a form that needs a
  heading states this component.
- The two variants are two treatments of one header, not two headers: `'default'` for a section's
  own title, `'eyebrow'` for a column, group or field-group heading inside one.

## Dependencies

- Design tokens

## Requirements served

- plan-docker_management_app/REQ-3
- plan-ui-coherence-optimisation/REQ-26
- plan-ui-coherence-optimisation/REQ-28
- plan-ui-coherence-optimisation/REQ-30
