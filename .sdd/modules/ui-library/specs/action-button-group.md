---
module: ui-library
component: ActionButtonGroup
type: UI component
---

# ActionButtonGroup

**Purpose** → the inline group of dense action buttons used for per-row actions in a table (e.g. a
container's lifecycle actions), with an optional trailing menu holding the row's quieter actions.

**The one question it answers** → *what is a button, what is a menu item, and what may be text?*
A caller declares **actions and their weight**; the cluster decides the appearance. There is no prop
with which to ask for an appearance, which is what makes the rule un-re-answerable by a screen.

## Contract

- `<ActionButtonGroup actions overflow? />`
  - `actions: { id, label, onClick, weight?, destructive?, disabled?, disabledReason? }[]`.
  - `weight?: 'primary' | 'secondary' | 'destructive' | 'overflow'` (default `'secondary'`) — how
    much the action weighs, and **the only thing said about it**:
    - `'primary'` → the filled control of the cluster.
    - `'secondary'` → a quiet control (the delivered appearance).
    - `'destructive'` → the red-tinted control.
    - `'overflow'` → not a button at all: an entry of the trailing overflow menu, appended after any
      entries stated directly in `overflow.entries`, carrying its own disabled state and reason.
  - `destructive?: boolean` — the same statement in the shape the delivered call sites use;
    equivalent to `weight: 'destructive'`, and ignored when `weight` is given.
  - `disabledReason` states why a disabled action is unavailable: it is offered on hover and read as
    that button's accessible description, so a greyed control is legible as "not now, because…"
    rather than as broken. It is shown only while the action is disabled, and never becomes part of
    the button's name.
  - `overflow?: { label, entries? }` renders a `Menu` (see `menu.md`) as the group's **last** slot,
    after every action button; omitting it leaves the group exactly as it was. `entries` is optional:
    a cluster whose menu holds only `'overflow'`-weight actions states the trigger's accessible name
    and nothing else.

## Rules and invariants

- **Bare text is never a control.** There is no weight that renders as unadorned text: every weight
  above produces either a `Button` or a `Menu` entry, and an action too quiet for a button becomes an
  overflow entry rather than losing its affordance. `use`, `+ Attach`, `Add variable` and
  `Add port mapping` are actions, and there is no API through which they could be anything else.
- An `'overflow'`-weight action with no `overflow` menu to go to **is not rendered**, rather than
  being silently promoted back to a button: a trigger needs an accessible name, and inventing one
  would be the component deciding an appearance the caller declined to make possible.
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
- plan-ui-coherence-optimisation/REQ-27
- plan-ui-coherence-optimisation/REQ-28
- plan-ui-coherence-optimisation/REQ-30
