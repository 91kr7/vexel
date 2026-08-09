---
module: ui-library
component: RevealableValue
type: UI component
---

# RevealableValue

**Purpose** → shows a sensitive value the application *received* (a join token, a one-time code):
masked by default, revealed only on an explicit request, copyable without ever being shown, and
with room for the one action that replaces it (rotation).

## Contract

- `<RevealableValue value? ariaLabel revealed onRevealedChange loading? placeholder? action? />`
  - `value?: string` — the value once it is known; absent while it has not been read yet.
  - `ariaLabel: string` — **required**: the surface carries no visible label of its own.
  - `revealed: boolean`, `onRevealedChange(revealed)` — the reveal state is the caller's, so the
    caller can force it back to hidden (e.g. when its dialog closes).
  - `loading?: boolean` — the value is being read; the reveal and copy affordances are disabled.
  - `placeholder?: string` — the line shown when there is no value yet (default "Not read yet").
  - `action?: { label, onClick, disabled? }` — one extra action rendered after copy (e.g. "Rotate").

Shows:
- while hidden: a fixed run of mask glyphs, never sized after the real value.
- while revealed: the value verbatim, in monospace, wrapped rather than truncated.
- with no value: the placeholder, muted.
Actions:
- "Show" / "Hide" → `onRevealedChange(!revealed)`; disabled while there is no value or `loading`.
- "Copy" → copies the exact value to the clipboard with the usual transient confirmation; available
  whether the value is revealed or hidden, since copying does not display it. **Always present**,
  and disabled while there is no value or `loading`.
- the `action`, when given → `onClick`.

## Rules and invariants

- The value is never rendered while `revealed` is false — not in the DOM, not as a title/tooltip,
  not as a `value` attribute: hiding is not a visual effect over rendered text.
- The mask has a fixed length: its width says nothing about the length of the value behind it.
- No affordance is ever unmounted for lack of a value: reveal and copy stay in place and go inert,
  so the row does not reflow and its buttons do not move under the pointer between a read starting
  and settling.
- The component keeps no copy of the value beyond the render it was handed, and holds no state
  except the copy confirmation.
- It is for a value the application *displays back*; a value the operator *types in* is
  `SecretField`, which has no reveal control at all.

## Dependencies

- Surface, Row, Button, CopyButton

## Requirements served

- plan-docker_management_app/REQ-80
