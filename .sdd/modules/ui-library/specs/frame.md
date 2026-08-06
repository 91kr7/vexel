---
module: ui-library
component: Frame
type: UI component
---

# Frame

**Purpose** → the application frame: composes the Backdrop with the rail / header / content /
footer regions so feature code never writes a layout wrapper element itself.

## Contract

- `<Frame rail header footer? children?>`
  - `rail` — rendered in a sticky, full-height left column.
  - `header` — rendered above the content, flow height.
  - `children` — the active screen, rendered in the scrollable content region.
  - `footer` — optional, rendered below the content.

## Rules and invariants

- Renders exactly one Backdrop, behind the rail/header/content/footer grid.
- The rail is `position: sticky` so it, the header and the footer stay in place while the content
  region scrolls independently (REQ-2).

## Dependencies

- Backdrop

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-2
