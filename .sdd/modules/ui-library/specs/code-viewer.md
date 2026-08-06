---
module: ui-library
component: CodeViewer
type: UI component
---

# CodeViewer

**Purpose** → a read-only monospace code/JSON block with a copy affordance (e.g. a container's raw
inspect payload).

## Contract

- `<CodeViewer code maxHeight? />`
  - `code: string` — shown verbatim in a monospace, wrapped block.
  - `maxHeight?: string` — caps the block's height with a scrollbar (default `'360px'`).
  - A `CopyButton` above the block copies `code` exactly as shown.

## Dependencies

- CopyButton
- ScrollArea

## Requirements served

- plan-docker_management_app/REQ-26
