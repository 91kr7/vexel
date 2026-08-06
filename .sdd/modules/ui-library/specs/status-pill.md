---
module: ui-library
component: StatusPill
type: UI component
---

# StatusPill

**Purpose** → a small dot + label pill for live/connection/health status (e.g. "Live · daemon
events").

## Contract

- `<StatusPill tone? children? action?>`
  - `tone`: `'success' | 'neutral' | 'warning' | 'danger'` (default `'success'`), colors the dot.
  - `action?: { label, onClick }` — when provided, renders an inline text action (e.g. "Retry")
    after the label, inside the pill.

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-6
- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-10
