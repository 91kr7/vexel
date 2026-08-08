---
module: ui-library
component: IconButton
type: UI component
---

# IconButton

**Purpose** → a square, icon-only button (e.g. dismiss, close).

## Contract

- `<IconButton label onClick? children? size? disabled? />` — `label` is required and becomes the
  button's accessible name (`aria-label`); `children` is the icon content; `size`: `'md' | 'sm'`
  (default `'md'`) — `'sm'` is a compact variant sized for inline use inside dense content (e.g. a
  table cell); `disabled?: boolean` (default `false`) disables the native button.

## Requirements served

- plan-docker_management_app/REQ-6
