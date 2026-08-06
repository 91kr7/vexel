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
- The frame is a fixed `height: 100vh` grid with `overflow: hidden`: the page itself never
  scrolls. The rail and the content region each scroll independently within that fixed height, so
  the rail, the header and the footer stay in place while the content scrolls (REQ-2).
- The rail and main regions each carry an explicit `grid-column` **and** `grid-row`. Both are
  required together: CSS grid auto-placement assigns rows by DOM order for any axis left
  implicit, so a component may reorder `rail`/`children` in the DOM (e.g. for reading/tab order)
  without either explicit `grid-row`, and the auto-placement cursor pushes the second-rendered
  region onto a new row instead of beside the first — collapsing the two-column layout. Setting
  `grid-row` on both makes the visual position independent of DOM order.

## Dependencies

- Backdrop

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-2
