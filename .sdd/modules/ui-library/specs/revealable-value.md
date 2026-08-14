---
module: ui-library
component: RevealableValue
type: UI component
---

# RevealableValue

**Purpose** → shows a sensitive value the application *received* (a join token, a one-time code):
masked by default, revealed only on an explicit request, and with room for the one action that
replaces it (rotation).

> **The purpose used to end "copyable without ever being shown", and that clause was withdrawn on
> 2026-08-14** by [`plan-docker_management_app-remove_copy_controls`](../../../plans/plan-docker_management_app-remove_copy_controls/requirements.md)
> (REQ-21), which removed every copy affordance from the client on the reporter's own instruction.
> It is recorded here, rather than quietly edited out, because a stated purpose that loses half its
> sentence invites the next reader to conclude the remaining half is vestigial too and remove that as
> well. **It is not.** The masking is still what keeps a token off a shared screen, a projector or a
> recorded session until the operator asks for it, and still what lets a rotation be performed
> without exposing the value being replaced. What changed is the **cost**, which that plan records
> as accepted and not to be mitigated: taking a token now means displaying it, because `Show` is the
> only route left.

## Contract

- `<RevealableValue value? ariaLabel revealed onRevealedChange loading? placeholder? action? />`
  - `value?: string` — the value once it is known; absent while it has not been read yet.
  - `ariaLabel: string` — **required**: the surface carries no visible label of its own.
  - `revealed: boolean`, `onRevealedChange(revealed)` — the reveal state is the caller's, so the
    caller can force it back to hidden (e.g. when its dialog closes).
  - `loading?: boolean` — the value is being read; the reveal affordance is disabled.
  - `placeholder?: string` — the line shown when there is no value yet (default "Not read yet").
  - `action?: { label, onClick, disabled? }` — one extra action rendered after the reveal control
    (e.g. "Rotate").

Shows:
- while hidden: a fixed run of mask glyphs, never sized after the real value.
- while revealed: the value verbatim, in monospace, wrapped rather than truncated.
- with no value: the placeholder, muted.
Actions:
- "Show" / "Hide" → `onRevealedChange(!revealed)`; disabled while there is no value or `loading`.
- the `action`, when given → `onClick`.

## Rules and invariants

- The value is never rendered while `revealed` is false — not in the DOM, not as a title/tooltip,
  not as a `value` attribute: hiding is not a visual effect over rendered text.
- The mask has a fixed length: its width says nothing about the length of the value behind it.
- No affordance is ever unmounted for lack of a value: the reveal control stays in place and goes
  inert, so the row does not reflow and its buttons do not move under the pointer between a read
  starting and settling.
- The component retains nothing of the value beyond the render it was handed, and holds no state of
  its own at all.
- Once revealed, the value is real selectable text: the browser's own selection is what takes it off
  the surface, and that belongs to the platform rather than to this component.
- It is for a value the application *displays back*; a value the operator *types in* is
  `SecretField`, which has no reveal control at all.

## Dependencies

- Surface, Row, Button

## Requirements served

- plan-docker_management_app/REQ-80
- plan-docker_management_app-remove_copy_controls/REQ-7, /REQ-21
