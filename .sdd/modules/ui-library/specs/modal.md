---
module: ui-library
component: Modal
type: UI component
---

# Modal

**Purpose** → the base overlay dialog every modal/drawer content in the application is built from.

## Contract

- `<Modal open title children? actions? onClose>`
  - `open` — when `false`, renders nothing.
  - `onClose` — called when the dimmed overlay is clicked; content clicks do not propagate to it.
  - `actions` — optional trailing action row (e.g. Cancel/Confirm buttons).

## Rules and invariants

- The dialog surface is a `raised` Surface: translucency and a shadow, never `backdrop-filter` or
  `filter: blur(...)` (REQ-108), even though it visually sits above other panels.

## Dependencies

- Surface

## Requirements served

- plan-docker_management_app/REQ-6
- plan-docker_management_app/REQ-108
