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
  - `description?`: why the button is in the state it is in — typically why it is disabled. Offered
    on hover and read as the button's accessible description.

## Rules and invariants

- `destructive` is visually distinct (danger color) from every other variant, so a destructive
  action is always marked as such at the point of interaction (REQ-6).
- `disabled` renders at reduced opacity and stops pointer interaction.
- `description` never becomes part of the button's accessible name, and a button given one still
  offers its description while disabled — a disabled control dispatches no pointer event of its own,
  so the hover text is carried around it rather than on it.

## Requirements served

- plan-docker_management_app/REQ-6
- plan-docker_management_app/REQ-20
- plan-docker_management_app-container_row_actions/REQ-4
