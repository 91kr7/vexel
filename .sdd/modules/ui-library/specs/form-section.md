---
module: ui-library
component: FormSection
type: UI component
---

# FormSection

**Purpose** → one titled group of fields inside a long form; several stacked sections make up a
sectioned form body.

## Contract

- `<FormSection title description?>{fields}</FormSection>`
  - `title` — the group's heading.
  - `description?` — one line under the heading explaining what the group covers.
  - `children` — the fields of the group, stacked vertically.

## Rules and invariants

- The section is always expanded: it groups, it never hides (collapsing is `CollapsibleSection`).

## Requirements served

- plan-docker_management_app/REQ-27
