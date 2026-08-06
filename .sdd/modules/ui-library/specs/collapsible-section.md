---
module: ui-library
component: CollapsibleSection
type: UI component
---

# CollapsibleSection

**Purpose** → a titled section of a detail surface that expands/collapses its content (e.g. a
container's environment variables or mounts list).

## Contract

- `<CollapsibleSection title summary? defaultOpen? children? />`
  - `title: string`.
  - `summary?: ReactNode` — shown next to the title regardless of open state (e.g. an item count).
  - `defaultOpen?: boolean` — initial open state (default `false`).
  - `children` render only while open.

## Requirements served

- plan-docker_management_app/REQ-24
