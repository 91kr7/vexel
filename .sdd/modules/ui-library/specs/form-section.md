---
module: ui-library
component: FormSection
type: UI component
---

# FormSection

**Purpose** → one titled group of fields inside a long form; several stacked groups make up one
sectioned form.

## Contract

- `<FormSection title description?>{fields}</FormSection>`
  - `title` — the group's heading, rendered by `SectionHeader` in its group (`eyebrow`) treatment.
  - `description?` — one line under the heading, the header's own description line.
  - `children` — the fields of the group, stacked vertically.

## Rules and invariants

- The section is always expanded: it groups, it never hides (collapsing is `CollapsibleSection`).
- **A field group is not a card.** It draws no border, no background, no radius and no inset of its
  own; a group is separated from the next by its heading and by a step wider than the one between
  two fields of the same group, and by nothing else. That step is the group's own, not the shell's,
  so a short dialog and a long sheet read alike. A dialog of groups therefore reads as one form rather than as a stack
  of cards inside a card, and each group costs the form the height of its heading instead of that
  height plus ~42px of chrome.
- **The heading is the product's one section header**, not a treatment this component declares:
  there is no rule anywhere carrying a form-section title type. A form does not add a fourth way of
  titling something.
- A group's heading and a field's label are two different things and read as two different things:
  the heading is the group treatment (small, uppercase, spaced), the label is the label treatment
  (small, quiet, its own case) — see `form-field.md`.

## Dependencies

- SectionHeader
- Design tokens

## Requirements served

- plan-docker_management_app/REQ-27
- plan-ui-coherence-optimisation/REQ-78
- plan-ui-coherence-optimisation/REQ-79
- plan-ui-coherence-optimisation/REQ-81
