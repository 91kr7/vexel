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

- `<ActionButtonGroup actions overflow? segmented? size? />`
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
  - `segmented?: boolean` (default `false`) — draws the cluster as **one segmented control**: its
    slots share a single outer boundary, with one hairline divider between two of them instead of
    two borders and a gap. Appearance only: the actions, their number, their order, their positions,
    their disabled reasons and the overflow menu are exactly what they are without it, and a group
    that does not ask for it renders exactly what it rendered before the prop existed.
  - `size?: 'sm' | 'md'` (default `'sm'`) — how large the cluster's controls are drawn. `'sm'` is
    the density every list row in the product uses and is what every delivered call site gets;
    `'md'` is the library's ordinary button size, for a cluster standing on its own rather than
    ending a row — the band that closes a card. Size only: the actions, their order, their
    positions, their legality and the overflow menu are untouched, and it is not a way to ask for an
    appearance — every weight still renders what its weight renders.

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
- **Segmented, every slot is one height, and the group is what owns it.** Each slot resolves to the
  tallest slot's height rather than to its own content's — because the members are not all the same
  kind of control: a lifecycle `Button` stands beside the overflow `Menu`'s trigger, which carries
  its own padding and a tighter line height. Derived per member they came out at 27px and 24px, and
  the cluster's rounded end read as a bulge escaping a boundary it was not in fact sharing (found on
  the containers card, 2026-08-25). A segmented cluster whose members differ in height has no shared
  boundary at all, which is the whole of what `segmented` promises. Owning the height at the group
  is also what keeps that true for a member added later with a different glyph, size or line height.
- Segmented, the outer corners are the cluster's: only its first and last slot keep a radius, and the
  radius, the border and the divider are the button's own tokens — no second declaration of any of
  them.

## Dependencies

- Button
- Menu

## Requirements served

- plan-docker_management_app-containers_card_view/REQ-4
- plan-docker_management_app-containers_card_view/REQ-20
- plan-docker_management_app-containers_card_view/REQ-30

- plan-docker_management_app/REQ-20
- plan-docker_management_app-container_row_actions/REQ-1
- plan-docker_management_app-container_row_actions/REQ-3
- plan-docker_management_app-container_row_actions/REQ-4
- plan-docker_management_app-container_row_actions/REQ-5
- plan-docker_management_app-container_row_actions/REQ-25
- plan-ui-coherence-optimisation/REQ-27
- plan-ui-coherence-optimisation/REQ-28
- plan-ui-coherence-optimisation/REQ-30
