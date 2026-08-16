---
module: ui-library
component: CodeViewer
type: UI component
---

# CodeViewer

**Purpose** → a read-only monospace code/JSON block (e.g. a container's raw inspect payload), shown
in full as selectable text.

## Contract

- `<CodeViewer code maxHeight? />`
  - `code: string` — shown verbatim in a monospace block, wrapped by the library's payload-wrapping
    rule: the block breaks at the payload's own token boundaries, so no value is cut in half at the
    edge of the box, and the text stays complete and selectable (see `payload-wrapping.md`).
  - `maxHeight?: string` — caps the block's height with a scrollbar (default `'360px'`).
  - The block draws **nothing above the payload**. It used to carry a copy affordance in an action
    row of its own; that affordance was removed on 2026-08-14 by
    `plan-docker_management_app-remove_copy_controls`, and the row went with it rather than surviving
    as an empty strip — it held one child, and an empty one would still consume the block's own gap
    above every payload it draws. Obtaining the payload is now the browser's own selection.

## Dependencies

- ScrollArea, Payload wrapping

## Requirements served

- plan-docker_management_app/REQ-26
- plan-ui-coherence-optimisation/REQ-76
