---
module: ui-library
component: ToastProvider, useToast
type: UI component
---

# Toast

**Purpose** → transient, non-blocking notifications stacked bottom-right.

## Contract

- `<ToastProvider children>` — renders its children plus the toast viewport; must wrap any part of
  the tree that calls `useToast()`.
- `useToast(): { push(toast) }` — `toast`: `{ title, message?, tone?, durationMs? }`;
  `tone`: `'neutral' | 'success' | 'danger'` (default `'neutral'`); a pushed toast auto-dismisses
  after `durationMs` (default 5000ms), for every tone alike.
- Calling `useToast()` outside a `ToastProvider` throws.

Description:
- a card of overlay glass per toast, stacked in the bottom-right corner, newest last. The card is
  the size of what it holds: one padding, a width that follows its content between a floor
  (`--toast-min-width`) and a maximum (`--toast-max-width`), and a height of its own text.

Shows:
- at most **three** toasts at once, newest last. Pushing a fourth drops the oldest immediately, so
  the fourth is on screen and the first is gone.
- the title, and the message when one was passed. Long unbroken text (a tag reference, a digest)
  wraps inside the card instead of pushing past its edge.
- the tone, before any word of the toast is read, carried by **one** mark — a round glyph badge in
  the tone's own family, before the text:
  - `success` → a badge carrying `✓`;
  - `danger` → a badge carrying `!`;
  - `neutral` → **no badge element at all**: no glyph, no accent, no tint. An untoned toast is drawn
    exactly as it was before the tone was rendered at all.
- a dismiss control on every toast, at the card's trailing edge, visible without hovering.

Actions:
- operating the dismiss control removes **that** toast immediately, before its timeout.

## Rules and invariants

- Toasts never block interaction with the rest of the screen or navigation (REQ-8). The stack
  intercepts no pointer event outside the visible cards: a click beside a narrow toast, between two
  cards, or into the corner region while the stack is empty reaches the screen underneath.
- Each toast's surface carries the overlay glass material: it renders a blurred image of whatever
  it covers, with the same treatment as the dialog surfaces and the same fallbacks
  (`overlay-glass.md`).
- The cap of three is what bounds the number of blurred surfaces the compositor can be asked for at
  one moment (plan-liquid_glass_overlays/REQ-10) — it is the one overlay surface whose count is not
  naturally one, and it is **the condition of the toast's place on the blur allow-list**. Neither
  the tone treatment nor the dismiss control is a surface of its own: both are drawn inside the
  card's already-blurred glass, so nothing this component holds is blurred beyond that cap.
- A toast dropped by the cap, or dismissed before its time, takes its pending auto-dismissal with
  it: it never dismisses a toast that took its place, and its remaining time never shortens
  another's. Dismissing one toast therefore leaves every other standing, each with its own
  remaining time — none prolonged, shortened or restarted.
- After a dismissal the stack closes up in place: the survivors keep their relative order, stay
  anchored to their corner, and none is reordered, duplicated or re-announced as newly arrived.
- **Outcome is never carried by hue alone, and the glyph is what guarantees it.** Each tone differs
  from the other two in at least one respect that is not colour: the **presence** of a badge element
  separates a toned toast from `neutral`, and the badge's **shape** (`✓` against `!`) separates
  `success` from `danger`. Both channels survive a greyscale screen or a colour-blindness
  simulation, and neither depends on the badge's tint being seen — which is why one mark is enough.
  A tone accent down the card's leading edge was delivered beside the glyph and **withdrawn on
  sight**: a coloured line on one edge of one card is not how anything else in this interface marks
  a state, and it read as foreign rather than as an accent. It was a *second, redundant* non-colour
  channel, so its removal cost redundancy and not the guarantee above. It is not to be reinstated in
  the belief that the guarantee needs it; a reader wanting more separation adds it to the badge.
- **Nothing tones the card's fill**, only its glyph badge: a toned toast's title and message stand
  on the same background as an untoned one's and read no worse than it.
- The dismiss control is the library's `IconButton`: a real `<button type="button">` reachable and
  operable from the keyboard, with the accessible name `Dismiss notification: <title>` — unique per
  toast, so three on screen at once are told apart. Its appearance moves no focus and scrolls
  nothing.
- The card's padding is **one** padding, and it is **symmetric**: the surface underneath is asked
  for `padding="none"`, the card carries no border of its own on any edge, so the gap between the
  glass edge and the content is the same spacing token on the leading edge as on the trailing one,
  for a toned toast exactly as for an untoned one. The shared surface padding scale is untouched by
  this — every other overlay surface measures what it always measured.
- The stack is aligned on the edge nearest its corner, so cards of differing widths share that edge
  and only the inward side is ragged. At a narrow viewport the maximum width comes down with the
  viewport and each card keeps its clearance from the screen edges.
- There is exactly **one** toast component in the product. A tone, a size or an affordance is added
  to this one; a second toast surface or a near-duplicate class family is not to be written.

## Dependencies

- Surface, Overlay glass material, IconButton, Row (layout primitives), Design tokens

## Requirements served

- plan-docker_management_app/REQ-8
- plan-liquid_glass_overlays/REQ-3
- plan-liquid_glass_overlays/REQ-10
- plan-docker_management_app-toast_feedback/REQ-1
- plan-docker_management_app-toast_feedback/REQ-2
- plan-docker_management_app-toast_feedback/REQ-3
- plan-docker_management_app-toast_feedback/REQ-4
- plan-docker_management_app-toast_feedback/REQ-5
- plan-docker_management_app-toast_feedback/REQ-6
- plan-docker_management_app-toast_feedback/REQ-7
- plan-docker_management_app-toast_feedback/REQ-8
- plan-docker_management_app-toast_feedback/REQ-9
- plan-docker_management_app-toast_feedback/REQ-10
- plan-docker_management_app-toast_feedback/REQ-11
- plan-docker_management_app-toast_feedback/REQ-12
- plan-docker_management_app-toast_feedback/REQ-13
- plan-docker_management_app-toast_feedback/REQ-14
- plan-docker_management_app-toast_feedback/REQ-15
- plan-docker_management_app-toast_feedback/REQ-16
- plan-docker_management_app-toast_feedback/REQ-17
- plan-docker_management_app-toast_feedback/REQ-18
- plan-docker_management_app-toast_feedback/REQ-19
- plan-docker_management_app-toast_feedback/REQ-21
- plan-docker_management_app-toast_feedback/REQ-22
- plan-docker_management_app-toast_feedback/REQ-23
- plan-docker_management_app-toast_feedback/REQ-24
