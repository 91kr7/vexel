---
module: ui-library
component: Button
type: UI component
---

# Button

**Purpose** → the application's single button primitive, used for every clickable action
including destructive ones.

## Contract

- `<Button variant? disabled? onClick? type? children?>`
  - `variant`: `'primary' | 'secondary' | 'ghost' | 'destructive'` (default `'secondary'`).
  - `type`: `'button' | 'submit'` (default `'button'`).

## Rules and invariants

- `destructive` is visually distinct (danger color) from every other variant, so a destructive
  action is always marked as such at the point of interaction (REQ-6).
- `disabled` renders at reduced opacity and stops pointer interaction.

## Requirements served

- plan-docker_management_app/REQ-6
