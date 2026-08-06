---
module: ui-library
component: Badge
type: UI component
---

# Badge

**Purpose** → a small tag/count/status label (e.g. lifecycle state, resource counts).

## Contract

- `<Badge tone? children?>` — `tone`: `'neutral' | 'success' | 'warning' | 'danger'` (default
  `'neutral'`).

## Requirements served

- plan-docker_management_app/REQ-1
