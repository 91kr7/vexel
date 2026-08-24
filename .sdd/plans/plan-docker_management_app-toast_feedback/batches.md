---
slug: docker_management_app-toast_feedback
date: 2026-08-24
spec: .sdd/analysis/docker_management_app-toast_feedback.md
requirements: .sdd/plans/plan-docker_management_app-toast_feedback/requirements.md
status: validated
---

# Batches — The toast says what happened, fits what it says, and can be closed

Fix of a certified product. **One defect surface, one component, one batch, six interventions.**
Batch numbers and `REQ-n`/`INT-n` ids are **local to this plan**: `REQ-1` here is not
`plan-docker_management_app/REQ-1`.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · toast-feedback | F1 — The toast says what happened, fits what it says, and can be closed | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28 | — | todo | On Images & layers, tag an image you created for the purpose (row overflow menu → Tag…): the toast that appears bottom-right is **visibly a success** — a round tone glyph before the text and the tone accent down the card's left edge, the same vocabulary `Callout` already uses for info/warning — and it is **the size of its text**: measured in the inspector the surface is materially shorter than today's 106px and its width follows the content instead of sitting at a fixed 360px. Tag again with a long reference: that toast is **wider** than the short one, and never wider than 360px; the two are **aligned on their right edge**, the ragged side facing inward. Push a third and a fourth toast: still **at most three**, oldest dropped. **Click the close control with the mouse, at the control itself**: that toast goes, the others stay and expire at their own times, the stack closes up in place, nothing is reordered. Click on the empty space beside a narrow toast: the click reaches the screen underneath, not the stack. Force a failure toast (System & prune, a prune with a failing category, or a filesystem archive that cannot be prepared): it is **immediately distinguishable from the success one — and still distinguishable with the screen in greyscale**, the glyph and the accent differing in shape, not only in hue; its title and message are as readable as an untoned toast's. An untoned toast is exactly the toast of today: no tint, no glyph, no accent. Squeeze the window to phone width: no toast crosses the viewport edge, each keeps its margin, long text wraps. Nothing else moved: same corner, same 5s, same stacking order, same glass. No feature file was edited. `npm run lint`, `npm run test:typecheck -w client` and `npm run test -w client` (the UI conformance check included, with `client/scripts/check-ui-conformance.mjs` and its `blurAllowedOverlaySelectors` unmodified) pass; from the e2e tree this batch's own new toast spec passes — **seen red on the pre-fix build before being seen green** — and so do `client/e2e/dialog-sizing.spec.ts` (the guard that no other overlay surface moved, REQ-17) and `client/e2e/images.spec.ts` (the busiest toast-asserting spec, REQ-28). The complete e2e suite and the server suite are not this batch's business and are run by the human, on request, at the end. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases.

## Assumptions and decisions

- **One batch, and there is no honest second one.** The three symptoms live in the same two files and
  are read by the same eye in the same second: an operator looking at a toast sees its outcome, its
  size and its close control at once. Splitting them would give three batches editing
  `Toast.tsx` and `feedback.css` in turn — a split by artefact, which the batching rule forbids —
  and each half would be unacceptable alone (a tone treatment inside a card 60% of which is empty
  padding is not the fix the spec describes).
- **The tone vocabulary is `Callout`'s, and it was chosen against the two alternatives, not by
  default.** `Callout` (`client/src/ui/feedback/Callout.tsx` + `.ui-callout*`) is the library's
  existing answer to "a card that states a condition": a round glyph badge
  (`.ui-callout__glyph`, `--color-<tone>-tint` background on `--color-<tone>` text) **plus** a
  structural accent (`border-left` in the tone colour on the body). Glyph *and* accent is exactly the
  two-channel treatment REQ-3 asks for, and it is already how this product distinguishes `info` from
  `warning`. The two candidates checked at the coordinator's instruction were rejected for the same
  reason: **`Badge`** (`specs/badge.md`) and **`StatusPill`** (`specs/status-pill.md`) are both
  *labelled* indicators — a filled pill carrying a word, a dot carrying a word — so using either
  inside a toast would mean inventing a word ("Success", "Failed") that no caller wrote, on a card
  whose text is the caller's alone. `Callout` is the only one of the three that tones **the card
  itself**, which is what a toast is. The toast's tones are `success` and `danger` where `Callout`'s
  are `info` and `warning`: the same vocabulary applied to the tone families the toast already
  declares, not a new one.
- **`neutral` gets neither glyph nor accent**, which is what makes REQ-4 literally true rather than
  approximately: an untoned toast renders the markup it renders today.
- **The doubled padding is removed at the toast, never at the shared surface.** `Surface` is asked
  for `padding="none"` and the one padding stays on `.ui-toast`, where it already is
  (`var(--space-3) var(--space-4)`). `client/src/ui/glass/surface.css`, the `ui-surface--pad-*`
  scale and the `--space-*` tokens are **not touched** — that is the spec's named risk (REQ-17), and
  the reason the fix is not "change `padding="md"` to `padding="sm"`".
- **`.ui-toast` stays the class of the toast card.** It is the handle
  `client/test/unit/toast.test.tsx` counts toasts by, and it is the element that now carries the
  single padding, the tone accent and the radius. Removing it to merge everything onto the `Surface`
  would need `Surface` to accept a `className`, which it deliberately does not, and would break the
  only structural queries in the tree.
- **The accent bar follows the card's corners.** With one padding, `.ui-toast` fills the surface
  exactly, so its `border-left` sits at the glass edge; it takes the surface's own radius token so
  the bar reads as part of the card and not as a line crossing a rounded corner.
- **The dismiss control is the library's `IconButton`, not a new one.** It is already a real
  `<button type="button">` with a **required** accessible label (REQ-9), a square hit target and a
  compact `sm` variant for dense content — so the affordance costs no new component, no new size
  token and no new focus treatment. It calls the provider's existing per-id `dismiss`, which is
  already written to take a toast's pending timeout with it (`specs/toast.md`), so REQ-7 is served by
  the mechanism that is already there rather than by a new one.
- **Width becomes `fit-content` between a floor and today's 360px.** The maximum is today's figure
  unchanged; the floor is a token, defaulting to **240px** — two thirds of the maximum, enough to
  read as a card rather than a chip — and retunable in one place once seen. The stack is right-aligned
  (`align-items: flex-end` on the viewport), so the ragged side faces inward, which is the spec's own
  answer to the ragged-stack risk.
- **The stack stops swallowing clicks.** Today `.ui-toast-viewport` is a fixed 360px column whatever
  its cards measure; once the cards shrink, that dead area would remain. `pointer-events: none` on
  the viewport with `auto` on the cards makes the corner transparent to the pointer except where a
  toast actually is (REQ-10). This is also the only part of the dismiss/timeout race that is in
  scope — see the risks below.
- **No blur declaration is written, moved or removed.** The toast keeps the overlay material through
  `Surface material="overlay"` → `.ui-overlay-glass`; the glyph badge and the dismiss control are
  drawn *inside* an already-blurred surface and are not surfaces of their own, so the allow-list gains
  nothing and `client/scripts/check-ui-conformance.mjs` is not opened.
- **The cap of three is untouched, and stays where it is documented.** `maxVisibleToasts` and the
  push/cap/timer logic of `ToastProvider` are not edited by this batch: only the render is. That is
  what keeps the toast's admission to the blur allow-list intact (REQ-22).
- **Two verification homes, each where it can actually assert.** The jsdom pass drives `push()` — the
  library's own public API — so it can raise **all three tones** and assert the rendered structure per
  tone, which is the guard that fails the moment the render stops reading `tone` again. The browser
  pass does what jsdom cannot: a **real pointer** at the close control's own coordinates (REQ-25) and
  **measured viewport boxes** (REQ-26). Geometry is never asserted in jsdom, where
  `getBoundingClientRect` returns zeros.
- **The e2e spec's toast is the tag toast, and its two widths are the same flow twice.** `Images &
  layers → Tag…` on a fixture image the spec built itself is the cheapest toast in the product and is
  entirely non-destructive; the toast's message is the tag reference, which the spec controls — so a
  short reference and a long one produce the short and the long toast REQ-13 needs, from one flow,
  with the tags removed in a `finally`.
- **The browser pass sees a toned toast painted; it does not see a `danger` one.** Surveyed: every
  toast the product raises carries a tone, and **the only two `danger` toasts in the whole client**
  are `SystemScreen`'s failed prune (destructive by nature — it belongs to `e2e/exclusive/` and must
  never be provoked from an ordinary spec) and `FilesystemBrowser`'s failed archive (reachable only
  after a full image extraction, for one assertion). So the browser checks that the tone treatment
  **paints** on the `success` toast it raises anyway, and the three-way distinction — success against
  danger against neutral, by structure and not by hue — is asserted in the unit pass, where all three
  are one `push()` away. Recorded as a risk below rather than hidden in the mapping.
- **The e2e spec obeys the project's test rules, and they are not negotiable here.** It creates its
  own fixture image and tags and destroys them in a `finally` (`docker rm -fv` semantics apply to any
  container it makes); it asserts only on objects it created, never on totals, counts or an empty
  daemon; it imports `test` from `client/e2e/support/test.ts`, pins its screen with `openApp`, gets
  any base image through `ensureImage`/the run's own registry rather than the network, and **passes
  run on its own**. It is non-destructive and therefore does **not** belong in `client/e2e/exclusive/`.
- **The check must be seen red before it is seen green.** All three defects are present on today's
  build and two of them are measurable, so the new spec is run against the unfixed code first. A test
  authored after a fix and never observed failing proves that the code passes it, not that it detects
  anything — and this is precisely the component where "nothing failed" let an unread prop live for
  the whole life of the product.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/ui-library/index.md` and `CLAUDE.md`: `client/src/ui/` is the only place in the client
  allowed CSS and raw DOM tags, and it is where this entire correction lives.

## Departures from the spec

**None.** Three points settled at the requirements gate, all narrowing towards the spec:

- **The non-colour half of REQ-3 is `Callout`'s glyph + structural accent**, decided by the
  coordinator standing in for the human, after `Badge` and `StatusPill` were checked and rejected for
  the reason recorded above.
- **REQ-27's coverage is split across the two passes**, structure in jsdom and paint/pointer/geometry
  in the browser.
- **REQ-4 preserves today's *tone* treatment, not today's *box*.** The size and dismiss corrections
  apply to every toast, untoned included; REQ-4 says only that an omitted tone acquires no colour.
  Written into the requirement text so it cannot later be read as a veto on the size fix.

One correction of the spec's own text, recorded rather than acted on: the spec cites
`client/src/system/SystemScreen.tsx` as pushing `tone: 'danger'` on a failed prune, and it does —
through a conditional (`result.categories.some(outcome => outcome.error) ? 'danger' : 'success'`),
not a literal. The spec is accurate; the detail is noted so nobody hunting a literal concludes the
call site is gone.

## Coverage check

**Every REQ is served by at least one INT**, and every REQ closes inside batch 1 — there is one
batch, so nothing is split across batches.

| REQ | Batch | Interventions serving it |
| --- | --- | --- |
| REQ-1 | 1 | INT-2, INT-5 |
| REQ-2 | 1 | INT-2, INT-6 |
| REQ-3 | 1 | INT-2, INT-3, INT-5 |
| REQ-4 | 1 | INT-2, INT-3, INT-5 |
| REQ-5 | 1 | INT-3, INT-6 |
| REQ-6 | 1 | INT-2, INT-6 |
| REQ-7 | 1 | INT-2, INT-5 |
| REQ-8 | 1 | INT-2, INT-6 |
| REQ-9 | 1 | INT-2, INT-4 |
| REQ-10 | 1 | INT-3, INT-6 |
| REQ-11 | 1 | INT-2, INT-3, INT-6 |
| REQ-12 | 1 | INT-2, INT-3, INT-6 |
| REQ-13 | 1 | INT-1, INT-3, INT-6 |
| REQ-14 | 1 | INT-1, INT-3, INT-6 |
| REQ-15 | 1 | INT-3, INT-6 |
| REQ-16 | 1 | INT-3, INT-6 |
| REQ-17 | 1 | INT-2, INT-3 |
| REQ-18 | 1 | INT-2, INT-5 |
| REQ-19 | 1 | INT-2, INT-3 |
| REQ-20 | 1 | INT-1, INT-3 |
| REQ-21 | 1 | INT-3 |
| REQ-22 | 1 | INT-2, INT-4, INT-5 |
| REQ-23 | 1 | INT-2, INT-3, INT-4 |
| REQ-24 | 1 | INT-2, INT-4 |
| REQ-25 | 1 | INT-6 |
| REQ-26 | 1 | INT-6 |
| REQ-27 | 1 | INT-5, INT-6 |
| REQ-28 | 1 | INT-5, INT-6 |

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none — INT-1
adds tokens, but they are the tokens REQ-20 requires by name and the widths REQ-13/REQ-14 are
stated in.

| INT | REQ served |
| --- | --- |
| INT-1 | REQ-13, REQ-14, REQ-20 |
| INT-2 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-6, REQ-7, REQ-8, REQ-9, REQ-11, REQ-12, REQ-17, REQ-18, REQ-19, REQ-22, REQ-23, REQ-24 |
| INT-3 | REQ-3, REQ-4, REQ-5, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-19, REQ-20, REQ-21, REQ-23 |
| INT-4 | REQ-9, REQ-22, REQ-23, REQ-24 |
| INT-5 | REQ-1, REQ-3, REQ-4, REQ-7, REQ-18, REQ-22, REQ-27, REQ-28 |
| INT-6 | REQ-2, REQ-5, REQ-6, REQ-8, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-25, REQ-26, REQ-27, REQ-28 |

**Four notes on the shape of that mapping**, all deliberate:

- **The dense rows are the point.** One component serves every toast the product will ever raise;
  a mapping with one intervention per requirement would mean the fix had been spread across screens,
  which is the shape the spec forbids.
- **REQ-17, REQ-18, REQ-19, REQ-21 and REQ-23 are requirements the batch can only fail.** Nothing is
  built for them: they hold because INT-2 and INT-3 touch three files inside `client/src/ui/`, edit
  no feature file, no `surface.css` and no `ui-surface--pad-*` rule, add no filter declaration and do
  not open `client/scripts/check-ui-conformance.mjs` — which then passes on its unchanged allow-list
  under `npm run lint` and `npm run test -w client`. REQ-17 additionally gets a measured guard for
  free, by running the existing `client/e2e/dialog-sizing.spec.ts` in this batch's test scope: it
  measures the dialog surfaces built on the same shared `Surface`.
- **REQ-27 is why INT-5 exists at all.** The tone prop was declared, passed by several screens and
  dropped at the render for the whole life of the product with nothing failing. A structural
  assertion per tone in the unit pass is the only check that fails the instant that recurs, and it is
  cheap enough to survive.
- **REQ-25 and REQ-26 hang on INT-6 alone**, and they are written the way `CLAUDE.md` demands
  because coverage that ignored those two rules passed a shipped defect twice: a real pointer at the
  visible control's own coordinates, and an assertion on the surface's measured viewport box rather
  than on its text.

## Risks carried forward

- **The dismiss control races the timeout, and this batch does not close that race.** A toast can
  expire while the pointer is travelling to its close control, leaving the click to land on whatever
  the toast was covering. The mitigation the spec names — pause-on-hover — is **explicitly out of
  scope**, so the batch takes the spec's own default: the race stands. What is fixed is the half that
  is in scope and is a defect in its own right, REQ-10: the stack no longer intercepts pointer events
  outside the cards, so the dead 360px column disappears with the oversized card. Recorded here so
  that reopening it is a decision about the product rather than a rediscovery.
- **No automated check ever sees a `danger` toast painted in a browser.** The structure is asserted in
  jsdom for all three tones and the paint is asserted for `success`; `danger` differs from it by a
  token, on the same rule. The alternative was provoking a prune failure from a non-exclusive spec,
  which this project forbids for good reason. If the tone treatment is ever restructured per tone
  rather than per token, this is the gap.
- **Greyscale distinguishability is asserted structurally, not perceptually.** A check can confirm
  that success carries a glyph of one shape and danger another, and that neutral carries none; it
  cannot confirm that a human tells them apart at a glance. That half is the human-acceptance
  column's, deliberately.
- **The width floor is a number nobody has seen yet.** 240px is a reasoned default, not a measured
  one; it is a single token, and retuning it after looking at three real toasts is expected, not a
  regression.
- **Twenty-three test files mention a toast and locate it by its text.** None queries its box or its
  position, and only `client/test/unit/toast.test.tsx` queries `.ui-toast` — which is why that class
  is preserved. The residual risk is a locator that matched the old two-`<p>` structure implicitly;
  `npm run test -w client` and the two named e2e specs are the guard, and the complete e2e suite at
  the end is the backstop.
- **A future toast can still be drawn by hand next to this one.** The correction makes the library's
  toast right; it does not make a second one impossible. `specs/toast.md` (INT-4) is the whole
  defence, and it is a sentence, not a mechanism.
</content>
