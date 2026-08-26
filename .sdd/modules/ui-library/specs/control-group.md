---
module: ui-library
component: ControlGroup
type: UI component
---

# ControlGroup

**Purpose** → a labelled group of controls on a toolbar row: the label says what the controls it
holds have in common, and the group is the block the row wraps by.

## Contract

Description:

- a short label followed by the controls given to it, laid out as one horizontal block. Several
  groups placed in one wrapping row read as the row's sections.

Props:

- `<ControlGroup label>{controls}</ControlGroup>`
  - `label: string` — the group's own label, drawn in the product's eyebrow treatment (the same one
    `SectionHeader variant="eyebrow"` uses), so a group reads as a section of the row and not as a
    field with a caption.
  - `children?: ReactNode` — the controls, drawn in the order given, on the group's own row.

Shows:

- the label first, then the controls; nothing else — no border, no background, no inset of its own.
  A group is a **grouping**, not a card.

## Rules and invariants

- **The group is the unit that wraps.** Placed among other groups in a wrapping row, its whole
  content decides where the row breaks: the break falls between groups and never inside one, and no
  control is left behind on another group's line.
- **A group breaks internally only when it alone is wider than the row it is on** — the narrow
  viewport — because overflowing is worse than wrapping there. At every width that can carry the
  groups side by side or one per line, no group is broken.
- The group states no width of its own and claims no free space: it is as wide as the label and the
  controls it holds.
- The controls sit on a row of the library's own, so a control that sizes itself by the axis it was
  placed on — the stream search band — reads the same axis inside a group as it does directly on a
  row.
- Domain-agnostic: the group knows nothing about what it holds and does nothing to it; every control
  keeps its own behaviour, its own labelling and its own hit box.

## Dependencies

- Row

## Requirements served

- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-27
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-28
