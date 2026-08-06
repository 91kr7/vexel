---
module: ui-library
component: StatusPill
type: UI component
---

# StatusPill

**Purpose** → a small dot + label pill for live/connection/health status (e.g. "Live · daemon
events").

## Contract

- `<StatusPill tone? children?>` — `tone`: `'success' | 'neutral' | 'warning' | 'danger'` (default
  `'success'`), colors the dot.

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-6
