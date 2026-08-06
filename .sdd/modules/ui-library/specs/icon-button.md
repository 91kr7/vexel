---
module: ui-library
component: IconButton
type: UI component
---

# IconButton

**Purpose** → a square, icon-only button (e.g. dismiss, close).

## Contract

- `<IconButton label onClick? children?>` — `label` is required and becomes the button's
  accessible name (`aria-label`); `children` is the icon content.

## Requirements served

- plan-docker_management_app/REQ-6
