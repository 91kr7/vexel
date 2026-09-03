---
batch: 1 · toast-feedback
feature: F1 — The toast says what happened, fits what it says, and can be closed
closed_req: REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28
depends: —
---

# Batch 1 — toast-feedback

Requirements: `.sdd/plans/plan-docker_management_app-toast_feedback/requirements.md` (cited by id,
never copied). Ids below are local to this plan.

**What this batch is.** Three delivered defects of one UI-library component — the bottom-right toast
stack — corrected together: the tone a caller already passes is rendered, the card is sized to what
it holds, and the operator can close a toast. **No feature file is edited**, and the public API of
`ToastProvider` / `useToast` is unchanged: that is the condition of the fix, not a nicety.

**Severity is not uniform.** The tone half (REQ-1…REQ-5) is correctness of information on a live
daemon — a failed prune currently draws exactly like a successful one. The size and dismiss halves
are comfort. A delivery that got size and dismiss right and left the failure toast looking like a
success has failed this batch.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/tokens.css` | Add the tokens the correction is stated in: the toast card's width **floor** (default 240px) and **maximum** (today's 360px, unchanged in value), and the tone glyph badge's size. Tone colours reuse the existing `--color-success` / `--color-success-tint` / `--color-danger` / `--color-danger-strong` / `--color-danger-tint` families — no new colour is invented. The toast's single padding is the existing `--space-3` / `--space-4`; no spacing token is added or retuned. **Nothing existing is changed**, only added. | REQ-13, REQ-14, REQ-20 | — |
| INT-2 | modify | `client/src/ui/feedback/Toast.tsx` | The render, and only the render. (a) **One padding**: ask `Surface` for `padding="none"` and leave the single padding on the inner `.ui-toast` element — the class is preserved, it is the handle the unit pass counts toasts by. (b) **Tone**: read `toast.tone` and give the card a per-tone class plus, for `success` and `danger`, a round glyph badge before the text — the vocabulary `Callout` already uses (`.ui-callout__glyph` + a tone `border-left`), applied to the toast's own tone families; `neutral` gets neither glyph nor accent, so an untoned toast renders as today. (c) **Dismiss**: a library `IconButton` (required accessible label, `size="sm"`) at the card's trailing edge, calling the provider's existing per-id `dismiss` — which already takes the toast's pending timeout with it, so the others keep their own remaining time. Compose with the library's own `Row`/`Stack`. **Do not touch** `maxVisibleToasts`, the push/cap/timer logic, `ToastInput`, `ToastTone` or `useToast`'s signature, and add no required prop. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-6, REQ-7, REQ-8, REQ-9, REQ-11, REQ-12, REQ-17, REQ-18, REQ-19, REQ-22, REQ-23, REQ-24 | INT-1 |
| INT-3 | modify | `client/src/ui/feedback/feedback.css` — the `.ui-toast*` rules only | (a) **Size**: the card keeps its one padding; `.ui-toast-viewport` stops being a fixed 360px column and becomes shrink-to-content between the INT-1 floor and maximum, with `align-items: flex-end` so the stack is aligned on the corner edge and the ragged side faces inward; the narrow-viewport clamp (`calc(100vw - var(--space-6) * 2)`) is preserved as part of the maximum and long text wraps inside the card. (b) **Pointer transparency**: `pointer-events: none` on the viewport, `auto` on the cards, so the corner is transparent to the pointer except where a toast actually is. (c) **Tone**: per-tone accent and glyph rules built from the `Callout` rules two blocks below in this same file; the accent takes the surface's own radius token so it follows the card's corners; check the tinted card's text against `--color-text-primary` / `--color-text-secondary` and do not let it read worse than the untoned one. (d) The dismiss control's placement. **Write no `backdrop-filter` and no `filter: blur()`**, add no selector to the allow-list, add no `ui-blur-exception:` comment, and do not edit `client/src/ui/glass/surface.css`, the `ui-surface--pad-*` scale or any `--space-*` token. Every value by token name. | REQ-3, REQ-4, REQ-5, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-19, REQ-20, REQ-21, REQ-23 | INT-1, INT-2 |
| INT-4 | modify | `.sdd/modules/ui-library/specs/toast.md`, and `.sdd/modules/ui-library/specs/design-tokens.md` for the tokens INT-1 adds | Record the contract as delivered: the three tones and how each is drawn (glyph + accent for `success`/`danger`, nothing for `neutral`, and **why the non-colour channel exists**); the dismiss affordance, its accessible name and the invariant that dismissing one toast never disturbs another's remaining time; the card's one padding and its floor/maximum width with the corner-edge alignment; the viewport's pointer transparency. Restate, do not weaken, the two standing invariants: the **cap of three** is the condition of the toast surface's place on the blur allow-list, and the toast is the library's **one** toast — a second one is not to be written. | REQ-9, REQ-22, REQ-23, REQ-24 | INT-2, INT-3 |
| INT-5 | modify | `client/test/unit/toast.test.tsx` | The jsdom half of the verification, driving `push()` — the library's own public API — so all three tones are one call away. Assert: each of `success` and `danger` renders a **distinct structure** (its own tone class and its own glyph), `neutral` renders **neither**, and the three are told apart by structure and not by colour — this is the check that fails the instant the render stops reading `tone` again. Assert that dismissing one toast (through the control's `onClick`, not a pointer — geometry and pointers are INT-6's job) removes that toast alone, leaves the others standing and does not shorten or restart their timers. Keep the existing cap, dropped-timeout and overlay-glass assertions passing against the new DOM. **Assert no geometry here**: `getBoundingClientRect` returns zeros in jsdom. | REQ-1, REQ-3, REQ-4, REQ-7, REQ-18, REQ-22, REQ-27, REQ-28 | INT-2, INT-3 |
| INT-6 | create | `client/e2e/` — the client e2e suite, non-exclusive project: one new spec of its own for the toast | The browser half, doing what jsdom cannot. Drive **Images & layers → row overflow menu → Tag…** on a fixture image the spec built itself: tag once with a short reference and once with a long one — the toast's message is the reference, so the spec controls both widths. Assert on **measured viewport boxes**, never on text content: the surface is materially shorter than today's 106px for the same text, the short toast is narrower than the long one, the long one never exceeds 360px, and the two share their right edge. Assert the tone treatment is actually **painted** (the glyph element visible, the accent computed on the card) — the browser half of REQ-2/REQ-5. Operate the close control **with a real pointer at its own visible coordinates** — never `element.click()`, never a dispatched event, never a hidden element behind it — and assert that toast's box is gone while the others are still there, in the same order, still anchored to the corner. Click a point beside a narrow toast and assert it reaches the screen underneath. Repeat one measurement at a phone-width viewport. **Project test rules apply and are not negotiable**: import `test` from `client/e2e/support/test.ts`, pin the screen with `openApp`, take any base image through `ensureImage` / the run's own registry (never the network), create every fixture itself and destroy it in a `finally` (tags removed, `docker rm -fv` semantics for anything containerised), assert only on what it created — never on totals, counts or an empty daemon — and **pass when run on its own**. Non-destructive, so it does **not** go in `client/e2e/exclusive/`. **Red-before-green is a step of this intervention, not a habit**: write the spec, run it against the **unfixed** build, observe it **fail** on the size and the missing close control, and report that observation — only then apply INT-2/INT-3 and see it pass. A spec authored after the fix and never seen red proves the code passes it, not that it detects anything, and this is the exact component where "nothing failed" let an unread prop survive the whole life of the product. The orchestrator will check that this step happened. | REQ-2, REQ-5, REQ-6, REQ-8, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-25, REQ-26, REQ-27, REQ-28 | — (authored **before** INT-2 and INT-3, against the unfixed build; green only once they land) |

## What the batch must not do

- Edit any file outside `client/src/ui/`, `client/test/unit/` and `client/e2e/` — no feature file,
  no screen, no panel. If a feature file needs editing, the fix is wrong.
- Change `client/scripts/check-ui-conformance.mjs`, its `blurAllowedOverlaySelectors`, or the blur
  allow-list in `CLAUDE.md`.
- Relax, parameterise or move `maxVisibleToasts`.
- Fix the size by retuning the shared `Surface` padding scale, or by changing what `padding="md"`
  means: that would resize every overlay in the product to fix one of them.
- Add a second toast component, a tone-specific toast, or a `className` escape hatch on `Surface`.
- Change the 5s default, add pause-on-hover, or make a lifetime depend on the tone.

## Test scope for this batch — fixed and bounded

Run exactly this, and nothing beyond it:

1. `npm run lint`
2. `npm run test:typecheck -w client` — the only pass that typechecks the e2e tree at all
3. `npm run test -w client` — the whole client unit pass, UI conformance check included; fast, no
   daemon, and the only guard on the files that mention a toast
4. From the e2e tree, **exactly three specs**: this batch's new toast spec,
   `client/e2e/dialog-sizing.spec.ts` (the measured guard that no other overlay surface moved,
   REQ-17) and `client/e2e/images.spec.ts` (the busiest toast-asserting spec, REQ-28)

**No server pass** — nothing server-side is touched.

**The complete e2e suite and the server suite are not run by this batch, and not by the
orchestrator.** They are the human's to launch, on his own daemon, when he is back: a concurrent run
against the same daemon fails in plausible-looking places that say nothing about this change. This is
an instruction, not a preference — do not widen the scope above because a check looked cheap.
</content>
