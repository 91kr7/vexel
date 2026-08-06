---
module: ui-library
component: Button
type: UI component
---

# Button

**Purpose** → the application's single button primitive, used for every clickable action
including destructive ones.

## Contract

- `<Button variant? size? disabled? onClick? type? children?>`
  - `variant`: `'primary' | 'secondary' | 'ghost' | 'destructive'` (default `'secondary'`).
  - `size`: `'md' | 'sm'` (default `'md'`) — `'sm'` is the dense size used for inline row actions.
  - `type`: `'button' | 'submit'` (default `'button'`).

## Rules and invariants

- `destructive` is visually distinct (danger color) from every other variant, so a destructive
  action is always marked as such at the point of interaction (REQ-6).
- `disabled` renders at reduced opacity and stops pointer interaction.

## Requirements served

- plan-docker_management_app/REQ-6
- plan-docker_management_app/REQ-20
