---
module: ui-library
component: Toggle
type: UI component
---

# Toggle

**Purpose** → boolean on/off switch for a form (e.g. enabling a health check, marking a mount
read-only).

## Contract

- `<Toggle checked onChange label? ariaLabel? />`
  - `checked: boolean`, `onChange(checked): void`.
  - `label?: string` — rendered next to the switch; also used as the accessible name when
    `ariaLabel` is not given.

## Requirements served

- plan-docker_management_app/REQ-25
