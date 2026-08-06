---
module: ui-library
component: ProgressBar
type: UI component
---

# ProgressBar

**Purpose** → shows that a non-instantaneous operation is under way, with or without a known
completion percentage.

## Contract

- `<ProgressBar percent? />` — `percent` (0-100) renders a determinate fill; omitting it renders an
  indeterminate, continuously sliding fill.

## Requirements served

- plan-docker_management_app/REQ-8
