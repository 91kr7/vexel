---
module: ui-library
component: DetailPanel
type: UI component
---

# DetailPanel

**Purpose** → the detail surface for a selected object (e.g. a container opened from its row):
an optional header with title/subtitle, a trailing actions slot and a close control, and a
content body.

## Contract

- `<DetailPanel title? subtitle? onClose actions? children? />`
  - `title?: string`, `subtitle?: string` — omit both when the object is already labelled by the
    surface the panel opens from (e.g. the table row it expands below), to avoid duplicating it.
  - `onClose: () => void` — called when the close control is used.
  - `actions?: ReactNode` — rendered in the header, next to the close control.
  - `children` render as the panel's body, below the header.

## Requirements served

- plan-docker_management_app/REQ-24
