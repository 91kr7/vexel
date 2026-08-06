---
module: ui-library
component: Spinner
type: UI component
---

# Spinner

**Purpose** → a small rotating indicator for a pending, non-instantaneous operation, e.g. next to
a button label.

## Contract

- `<Spinner label? />` — `label` (default `'Loading'`) is the accessible name (`role="status"`,
  `aria-label`).

## Requirements served

- plan-docker_management_app/REQ-8
