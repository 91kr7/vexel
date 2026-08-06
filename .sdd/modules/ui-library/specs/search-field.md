---
module: ui-library
component: TextField, SearchField
type: UI component
---

# TextField, SearchField

**Purpose** → the library's single-line text input primitive, and its full-width search/filter
variant for a screen toolbar.

## Contract

- `<TextField value onChange placeholder? ariaLabel? onSubmit? autoFocus? />` — `onSubmit` fires on
  Enter.
- `<SearchField value onChange placeholder? ariaLabel? />` — a `TextField` at full width, default
  placeholder `'Search…'`.

## Requirements served

- plan-docker_management_app/REQ-21
- plan-docker_management_app/REQ-23
