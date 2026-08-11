---
module: ui-library
component: ActionButtonGroup
type: UI component
---

# ActionButtonGroup

**Purpose** → the inline group of dense action buttons used for per-row actions in a table (e.g. a
container's lifecycle actions), with a destructive variant and an optional trailing menu holding the
row's secondary actions.

## Contract

- `<ActionButtonGroup actions overflow? />`
  - `actions: { id, label, onClick, destructive?, disabled?, disabledReason? }[]`; each renders as a
    small (`size="sm"`) `Button`, `destructive` selecting the destructive variant.
  - `disabledReason` states why a disabled action is unavailable: it is offered on hover and read as
    that button's accessible description, so a greyed control is legible as "not now, because…"
    rather than as broken. It is shown only while the action is disabled, and never becomes part of
    the button's name.
  - `overflow?: { label, entries }` renders a `Menu` (see `menu.md`) as the group's **last** slot,
    after every action button; omitting it leaves the group exactly as it was.

## Rules and invariants

- Stops click-event propagation, so a click on any action button — or on the overflow trigger —
  never also triggers a containing `DataTable` row's `onRowSelect`.
- Never wraps to a second line: the group stays on a single row regardless of how many actions it
  holds, clipped by its containing cell rather than overflowing it.
- The overflow control, when present, is always the trailing slot: it is never the control that
  moves as the actions before it change.
- The group itself carries no overlay material and computes no filter: it exists once per row.

## Dependencies

- Button
- Menu

## Requirements served

- plan-docker_management_app/REQ-20
- plan-docker_management_app-container_row_actions/REQ-1
- plan-docker_management_app-container_row_actions/REQ-3
- plan-docker_management_app-container_row_actions/REQ-4
- plan-docker_management_app-container_row_actions/REQ-5
- plan-docker_management_app-container_row_actions/REQ-25
