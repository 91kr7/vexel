---
slug: docker_management_app-toast_feedback
date: 2026-08-24
spec: .sdd/analysis/docker_management_app-toast_feedback.md
status: validated
---

# Requirements — The toast says what happened, fits what it says, and can be closed

Fix of the delivered product. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md); this corrects three
delivered behaviours of one shared UI-library component, the bottom-right toast stack
(`client/src/ui/feedback/Toast.tsx`, the `.ui-toast*` rules in `client/src/ui/feedback/feedback.css`).

Requirements are observable, individually verifiable behaviours. Ids are local to this plan: `REQ-1`
below is *not* `plan-docker_management_app/REQ-1`. Requirements of other plans are always cited with
their path prefix.

**One feature, not three.** The spec's own argument is that the doubled padding, the unread `tone`
and the missing dismiss are three independent omissions in *one* component — opened once, not three
times, and any later toast inherits the correction. Splitting them would produce three batches that
edit the same two files and cannot be accepted apart, which is a split by artefact rather than by
feature. The requirements below are therefore written about the toast, not about the screens that
raise one.

**Severity is not uniform, and the plan must not flatten it.** REQ-1 to REQ-5 are the correctness
half: the product already computes the outcome of an operation on a live daemon, already passes it,
and throws it away at the render. REQ-11 to REQ-16 (size) and REQ-6 to REQ-10 (dismiss) are comfort
and control. A delivery that got the size and the close button right and left a failure toast looking
like a success has failed this plan.

**What "today's appearance" means here.** Measured on the running build (dev arrangement, Images &
layers → Tag…): surface `360x106`, inner `.ui-toast` `318x64`, title `286x19`, message `286x17`;
`Surface padding="md"` computes 20px and `.ui-toast` adds `12px 16px` on top of it; the stack's
viewport is a fixed `width: min(360px, calc(100vw - var(--space-6) * 2))`. Where a requirement below
says a value is preserved, it is preserved against those readings; where it says a box shrinks, it
shrinks against them.

## F1 — The toast says what happened, fits what it says, and can be closed

| ID | Requirement |
| --- | --- |
| REQ-1 | The tone a caller passes is actually rendered: a toast pushed with `tone: 'danger'` is visibly different from one pushed with `tone: 'success'`, and both are visibly different from one pushed with no tone. Verified on the call sites that already pass a tone today — a successful image tag, a failed system prune, a failed filesystem archive — with none of those files edited. |
| REQ-2 | The three tones are distinguishable from one another at a glance, on the glass material, before any word of the toast is read: the operator does not have to read the prose to know an operation failed. |
| REQ-3 | Outcome is not carried by hue alone: each tone differs from the other two in at least one respect that is not colour, so the three stay mutually distinguishable when the interface is seen without colour (greyscale, or a colour-blindness simulation). A red card and a green card of identical shape do not satisfy this. |
| REQ-4 | A call site that passes no tone keeps today's tone treatment — which is the absence of one: no tint, no mark, no accent. `neutral` is and stays the default, and it is what an omitted tone resolves to, so the ~20 feature files that push an untoned toast acquire no new colour. (The size correction of REQ-11 to REQ-16 and the dismiss control of REQ-6 apply to every toast including this one; they are not what this requirement preserves.) |
| REQ-5 | Text stays legible against the tone treatment: on a toned toast the title and the message are at least as readable against their own surface as they are on today's untoned toast. A failure toast that is the hardest toast in the product to read inverts the intent of the fix and fails this requirement. |
| REQ-6 | Every toast carries a dismiss affordance on the toast itself — visible without hovering, and reachable by pointer at its own visible coordinates. Operating it with a real pointer removes that toast immediately, before its timeout. |
| REQ-7 | Dismissing one toast removes only that one: the other toasts on screen remain, each keeps its own remaining time (none is prolonged, shortened or restarted), and the pending timeout of the dismissed toast never removes a toast that is still standing. |
| REQ-8 | After a dismissal the stack closes up predictably: the surviving toasts keep their relative order and stay anchored to the corner they live in, so the operator does not lose track of a message they were reading. No toast is reordered, duplicated or re-animated as if newly arrived. |
| REQ-9 | The dismiss affordance is a real control: it has an accessible name, it can be reached and operated from the keyboard, and its appearance does not move focus or scroll the screen the operator is working on. Everything the toast does today for assistive technology it continues to do. |
| REQ-10 | The toast stack intercepts no pointer events outside the visible toast cards: a click on the space beside a narrow toast, between two cards, or anywhere in the corner region once the stack is empty, reaches the screen underneath. Today the stack's container is a fixed 360px-wide column whatever the toasts inside it measure, and shrinking the cards must not leave that dead area behind. |
| REQ-11 | A toast has exactly one padding, taken from the library's spacing tokens: the second, inner padding is gone and the empty band it produced with it. The measured gap between the card's box and the text it holds is one padding on every side. |
| REQ-12 | The card is the height of what it holds: the two-line toast that measures 106px today for roughly 40px of text is materially shorter afterwards, and no toast shows a band of empty glass above or below its text. |
| REQ-13 | A short toast does not occupy the card of a long one: width follows content up to a maximum, and a two-word toast is measurably narrower than a full-sentence one. Today's 360px becomes that maximum — a long toast is never wider than it. |
| REQ-14 | A toast is never so narrow that it stops reading as a notification card: below the content-driven width there is a floor, so a one-word toast still presents as a card and not as a chip. |
| REQ-15 | The stack is aligned on the edge nearest the corner it occupies, so toasts of differing widths share that edge and only the inward side is ragged. Three stacked toasts of three widths read as one stack, not as three loose cards. |
| REQ-16 | The narrow-viewport behaviour survives: at a phone-width window no toast exceeds the viewport, each keeps the clearance from the screen edges it keeps today, and long text wraps inside the card rather than overflowing it. |
| REQ-17 | The size correction reaches the toast and nothing else: every other surface built on the shared glass surface and its padding scale — dialogs, sheets, menus, popovers, drawers, panels, cards — measures exactly what it measures today. A fix applied at the shared padding, or at the shared surface's `md` step, fails this requirement even if the toast comes out right. |
| REQ-18 | The public API of `ToastProvider` / `useToast` stays backward compatible: every existing call site compiles and behaves identically without being edited, no prop becomes required, and no feature file changes for this fix to land. |
| REQ-19 | The correction lives entirely inside the UI library (`client/src/ui/`): no CSS and no raw markup appears outside it as a result, and no screen, page or panel acquires knowledge of toast presentation or compensates for it locally. |
| REQ-20 | Every value introduced by the fix is a named design token in `client/src/ui/tokens.css` — tone colours, the padding, the radius, the width floor and maximum, the size of the dismiss affordance, any z-index. No colour, length, font size or z-index literal is written on the spot. |
| REQ-21 | The blur allow-list and its enforcement are untouched: `client/scripts/check-ui-conformance.mjs` is not modified, its `blurAllowedOverlaySelectors` gains and loses nothing, the toast keeps its overlay glass material through `.ui-overlay-glass` and acquires no new blurring selector, no second blur value and no `ui-blur-exception:` comment. The check passes. |
| REQ-22 | The cap of three visible toasts survives, in value and in behaviour: a fourth toast still displaces the oldest, and neither the tone treatment nor the dismiss control introduces a blurred surface whose count is not bounded by that cap. It is the condition of the toast surface's place on the allow-list. |
| REQ-23 | Nothing else about the toast changes: the 5s default auto-dismiss, for every tone alike; the per-toast duration override; which actions raise a toast and what they say; the corner it appears in; the order in which toasts stack; the overlay glass material and elevation. Any observable difference beyond tone, size and dismissal is a defect of this change. |
| REQ-24 | The product still has exactly one toast component: the existing one is extended with the tone treatment and the dismiss control rather than duplicated, and no second toast surface or near-duplicate class family appears in the library. |
| REQ-25 | The dismiss control is verified by an automated check that operates it the way a human does — a real pointer at the control's own visible coordinates — never `element.click()`, never a dispatched event, and never aimed at a visually hidden element behind the control. |
| REQ-26 | The size correction is verified on measured boxes: the toast surface's own viewport rectangle, a short toast's against a long one's and both against today's 360x106, never on the toast's text content. |
| REQ-27 | The tone rendering is covered by an automated check that fails if the render stops reading the tone again, and that check covers the non-colour half of REQ-3 — it cannot be satisfied by hue alone. This is the requirement that answers the spec's "the defect returns unnoticed" risk: the prop was declared, passed by three screens and dropped at the render for the whole life of the product with nothing failing. |
| REQ-28 | No existing automated check is left broken or hollowed by this change: checks that locate a toast by its text, its box or its position keep passing and keep asserting what they were written for; any that depended on the old geometry is updated deliberately, and none is weakened into asserting nothing. |
</content>
</invoke>
