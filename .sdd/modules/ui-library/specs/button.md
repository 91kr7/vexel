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
- The element carrying that description is drawn on the button it describes, so it intercepts no
  pointer aimed at anything else and moves no surface.

## Measured, and deliberately left untouched

The description carrier has the same off-screen shape as Toggle's hidden checkbox, and Toggle's was
displaced (see `toggle.md`). This one was **established by real-pointer hit-testing, not by
argument** — that a span cannot take focus is a reason to expect it clean, never the evidence that it
is. Measured at an 813×800 viewport on a disabled row action ("Pause", "This container is not
running.") in a containers table of 14 rows whose surrounding surface was scrolled to its end
(263px of 263):

- carrier box and button box **coincide — a gap of 0px** (both at `x=527.3, y=741.1`);
- `document.elementFromPoint` at the carrier's own centre returns the button's own wrapper, so
  nothing elsewhere on the screen is covered by it;
- a real pointer click delivered at that point leaves the table where it was (`y=20.9` before and
  after) and changes no scroll offset;
- its frame of reference sits **inside** the scrolling ancestors, so the condition in `toggle.md` is
  not met.

It measures clean, so it was **not edited** and no standing check was invented for it. The
measurement is recorded here so it is inherited rather than re-derived.

## Requirements served

- plan-docker_management_app/REQ-6
- plan-docker_management_app/REQ-20
- plan-docker_management_app-container_row_actions/REQ-4
- plan-docker_management_app-toggle_focus_scroll/REQ-8
- plan-docker_management_app-toggle_focus_scroll/REQ-9
