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
  table cell); `disabled?: boolean` (default `false`) disables the native button;
  `busy?: boolean` (default `false`) puts the control in the busy state described below.

## Rules and invariants

- **Busy is "working", not "unavailable"** — the same state `Toggle` already carries. A busy control
  keeps its box exactly, shows a `Spinner` in place of its icon, states it is busy to assistive
  technology, and answers no press until the work ends. It is not dimmed the way a disabled one is:
  the operator is not being refused, they are being made to wait. The indicator is sized inside the
  control's own square, so nothing beside it moves while the work runs.
- **The size decides the rounding, and there is one rule per size.** The compact box takes the
  tighter radius of the library's scale, because the ordinary one is 42% of a 24px square's own side
  and reads as a soft blob rather than as a quiet control — measured beside a card's name, 23.2px
  tall, which the control was already taller than (2026-08-25). It is declared on the **size**, not
  on a variant of the one call site that noticed: every compact icon button in the product is the
  same box, and the reasoning belongs to the box rather than to the caller. Neither size states a
  radius of its own invention; both name a step of the scale.
- A control given no `onClick` renders **present and inert** rather than disabled: it takes every
  treatment an operable one takes and does nothing when pressed. That is a legitimate state to ask
  for — a control whose behaviour arrives later — and it is the caller's business to record why,
  where a reader will find it.

## Requirements served

- plan-docker_management_app/REQ-6
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-2
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-4
