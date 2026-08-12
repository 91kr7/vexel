---
slug: docker_management_app-dialog_sizing
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-dialog_sizing.md
requirements: .sdd/plans/plan-docker_management_app-dialog_sizing/requirements.md
status: validated
---

# Batches — A dialog's glass card is the size of the dialog it holds

Fix of a certified product. **One defect, one component, one batch, four interventions.** Batch
numbers and `REQ-n`/`INT-n` ids are **local to this plan**: `REQ-1` here is not
`plan-docker_management_app/REQ-1`.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · dialog-sizing | F1 — A dialog's glass card is the size of the dialog it holds | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18 | — | in progress | At a 1280px viewport, open Contexts → Create context: the glass card ends where the content ends — no empty glass to the right of the text — and measured in the inspector the overlay's first element child, the glass surface and `.ui-modal` all read **480px**, where the card read 1016px before. Repeat on Registries → Log in, Registries → Log out, Volumes & networks → both prune dialogs, System & prune → System prune, Containers → prune stopped, Images & layers → import filesystem, Swarm → initialize and join, Builders & cache → create builder, Plugins → install plugin: **all of them are now the same width as each other**, and each is the width of its own content. Log out of a registry with a long hostname and one with a short one: same width. Squeeze the window to phone width: the card still ends where the content ends, the dialog keeps its margin from the screen edges and nothing runs off the side. Open a large dialog — Images & layers → Explore layers, layer efficiency, image diff, filesystem browser: still wide (`min(1100px, 92vw)`, unchanged), card and content again the same width, its inner scroll behaving as before. Open Containers → Create container: the sheet is unchanged at 760px, card and content in agreement as they already were. Nothing else about any dialog moved: same glass, same padding, same typography, same placement, same scrim, same open/close, same wording, same behaviour. `npm run lint`, `npm run test:typecheck -w client`, `npm run test -w client` (the UI conformance check included, with `client/scripts/check-ui-conformance.mjs` unmodified and `blurAllowedOverlaySelectors` unchanged) and this batch's single e2e spec `client/e2e/dialog-sizing.spec.ts` pass — and that spec has been **seen red on the pre-fix build** before being seen green. `FormSheet` was checked and is unaffected: stated here and recorded in `.sdd/modules/ui-library/specs/form-sheet.md`. The full unit suite and the complete e2e suite are not this batch's business: they run once at the end, after all six items of `bugs.md` are certified — bug-1 is the fourth of six. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases.

## Assumptions and decisions

- **One batch, and there is no honest second one.** The spec's own argument is that this is one
  defect in one shared component; splitting the CSS from the component, or the fix from its
  verification, would be a split by layer, which the batching rule forbids — and neither half is
  acceptable alone: a positioner class nothing sizes changes nothing, and a width moved with no
  check that the two boxes now agree is exactly the "signed off on the wide dialogs" risk the spec
  names as the overwhelming one.
- **The mechanism, established by reading the component rather than guessed.** `Modal.tsx` renders
  `.ui-modal-overlay` (a `display: grid; place-items: center` scrim) → a **classless** `<div>` that
  only stops the click from reaching the scrim → `<Surface material="overlay">`, the element that
  paints the glass → `.ui-modal`, which carries `width: min(480px, 100%)` and the padding. The
  classless div is the grid item and is sized `fit-content`; computing that intrinsic width asks
  `.ui-modal` for a contribution, and **in intrinsic sizing a percentage is treated as `auto`**, so
  the `100%` term drops out and the child contributes its **max-content** width — the longest
  unwrapped line. The card adopts it; only afterwards does `.ui-modal` resolve `min(480px, …)` to
  480px. Two boxes, two rules, and the gap between them is what the operator sees.
- **The fix has a working precedent in this very file, and that is why no mechanism is invented.**
  `FormSheet` — the surface the spec asks us only to *verify* — already does the right thing: its
  grid item is `.ui-form-sheet__positioner { width: min(760px, 100%) }` and its content is
  `.ui-form-sheet { width: 100% }`. One element states the width; everything inside fills it; the two
  cannot disagree, in either direction, at any viewport. **`Modal` is made to follow the shape
  `FormSheet` already has** (INT-1, INT-2). Anything more inventive than that should be treated as a
  sign of having wandered off.
- **`FormSheet` is therefore expected to be unaffected by construction, and is still measured.** The
  structural argument is not accepted as the verification: REQ-13 asks for both failure modes checked
  on the running surface, and INT-3 does that. What the structure buys is a prediction the check
  should confirm, not a reason to skip it.
- **The numbers do not move: 480px stays 480px, `min(1100px, 92vw)` stays `min(1100px, 92vw)`.** The
  declarations are relocated, not retuned (REQ-7, REQ-8). `.ui-modal`'s padding stays on `.ui-modal`
  and the reset's `border-box` keeps the total at the same 480px, so the content column is
  byte-for-byte the width it is today. If a dialog's content width changes at all, that is a
  regression of this batch, not a design decision taken in passing.
- **`large`'s height cap stays where it is.** `max-height: 85vh; overflow-y: auto` belongs to the
  scrolling content, not to the positioner; only `width` moves. The glass card keeps hugging that
  content in height, which is REQ-10 and which works today.
- **jsdom cannot verify this, and no substitute for measurement is accepted.** `getBoundingClientRect`
  returns zeros there, so a unit test can assert nothing about card-versus-content width. Equally
  refused: a static assertion over the CSS text ("the width declaration is on the positioner"), which
  would check *this fix's implementation* instead of *the required effect*, and would keep passing
  while a future change reintroduced the disagreement by another route. The verification lives in the
  **e2e tree**, where a real browser lays the page out. This is the human's instruction at the
  requirements gate, and it is recorded so it is not re-litigated into a cheaper unit test later.
- **The check must be seen red before it is seen green.** The disagreement is present on today's
  build for five separately measured dialogs, so INT-3 is written and run **against the unfixed
  code first**. A test authored after a fix and never observed failing proves that the code passes
  it, not that it detects anything.
- **The short-content case is constructed in the page, deliberately.** It does not occur naturally —
  five real dialogs were measured hunting for one and all five were too wide — so INT-3 shortens an
  open dialog's own text and re-measures, which is precisely the technique that produced the known
  398-vs-480 instance. That is a legitimate test of a library property, not a test reaching into
  feature internals: the substituted text stands in for the short copy or the short runtime value a
  future dialog will legitimately have.
- **One new spec file, no shared helper, no test route in the product.** The measurement function is
  local to `client/e2e/dialog-sizing.spec.ts`. A `client/e2e/support/` helper would be indirection
  for a single caller, and a debug route that mounts library components with test content would ship
  a test surface inside the product to avoid writing one test.
- **The spec is non-destructive and stays out of `exclusive/`.** Every prune and removal dialog it
  opens is opened to be *measured and cancelled*, never confirmed; nothing is pruned, so it does not
  belong with the destructive-by-nature specs. It creates no Docker object of its own; the one
  fixture it needs is `vexel-test-tiny:1` through `ensureImage(TINY_IMAGE)`, exactly as
  `client/e2e/layer-explorer.spec.ts` gets it, from the run's own registry via the standard
  preliminary steps. It pins its screen with `openApp` and imports `test` from
  `client/e2e/support/test.ts`, per the project's test rules.
- **The library's public entry point gains nothing.** No new component, no new prop, no new export
  from `client/src/ui/index.ts`: a class name and a moved declaration are internal to `Modal`.
- **The test runs are batch-scoped, and the reason matters more than the permission.** The human's
  instruction is about the two **expensive** gates — the complete e2e suite and the daemon-backed
  server suite — which run once at the end, after all six items of `bugs.md` are certified, because
  they cost a quarter of an hour and contend for the operator's own daemon. bug-1 is the fourth of
  six and is not that end. The **client unit pass is neither**: it is fast and it touches no daemon,
  so running it whole here is not a widening of scope but the *only* guard against the specific risk
  this batch carries — a renamed or re-nested node silently breaking the **47 files** that query
  `.ui-modal-overlay` / `.ui-modal` across `client/test/unit/` and `client/e2e/`, which would
  otherwise surface at the final gate among five other items' changes and cost far more to
  attribute. So: `npm run lint`, `npm run test:typecheck -w client` (the only pass that typechecks
  the e2e tree at all), the whole client unit pass, and from the e2e tree **only**
  `client/e2e/dialog-sizing.spec.ts`. No server pass — nothing server-side is touched.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` and `CLAUDE.md`: `client/src/ui/` is the only place in the client allowed CSS and
  raw DOM tags, which is where this entire correction lives.

## Departures from the spec

**None.** Two clarifications were folded in at the requirements gate, both narrowing towards the
spec rather than away from it:

- **REQ-7 and REQ-8 pin today's widths as preservation**, while REQ-6 forbids any requirement from
  being *defined* by the value 480. The two are different statements and must not be collapsed: the
  first says this fix has no visual side effects (which is what makes it reviewable — a width that
  moves is a regression, not a taste question), the second says correctness may never be stated as a
  number.
- **REQ-13's outcome is reported in two places**, the batch's acceptance criteria and
  `.sdd/modules/ui-library/specs/form-sheet.md`. The spec half is the one that matters in six
  months: an acceptance criterion is consumed once, while the component spec is where the next
  person looks before touching that surface.

One finding of the intervention step is recorded rather than departed from: `FormSheet` shares the
**scrim** class `.ui-modal-overlay` with `Modal` (it is the same positioning context) but has its
own grid item, correctly sized. That is why it is unaffected, and why the fix pattern was not
invented for this batch.

## Coverage check

**Every REQ is served by at least one INT**, and every REQ closes inside batch 1 — there is one
batch, so nothing is split across batches.

| REQ | Batch | Interventions serving it |
| --- | --- | --- |
| REQ-1 | 1 | INT-1, INT-2, INT-3 |
| REQ-2 | 1 | INT-1, INT-2, INT-3 |
| REQ-3 | 1 | INT-1, INT-2, INT-3 |
| REQ-4 | 1 | INT-1, INT-2, INT-3 |
| REQ-5 | 1 | INT-1, INT-2, INT-3 |
| REQ-6 | 1 | INT-1, INT-2 |
| REQ-7 | 1 | INT-2, INT-3 |
| REQ-8 | 1 | INT-1, INT-2, INT-3 |
| REQ-9 | 1 | INT-2, INT-3 |
| REQ-10 | 1 | INT-2, INT-3 |
| REQ-11 | 1 | INT-1, INT-2, INT-3 |
| REQ-12 | 1 | INT-1, INT-2 |
| REQ-13 | 1 | INT-3, INT-4 |
| REQ-14 | 1 | INT-1, INT-2 |
| REQ-15 | 1 | INT-1, INT-2 |
| REQ-16 | 1 | INT-3 |
| REQ-17 | 1 | INT-3 |
| REQ-18 | 1 | INT-3 |

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none.

| INT | REQ served |
| --- | --- |
| INT-1 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-8, REQ-11, REQ-12, REQ-14, REQ-15 |
| INT-2 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-14, REQ-15 |
| INT-3 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-13, REQ-16, REQ-17, REQ-18 |
| INT-4 | REQ-13 |

**Four notes on the shape of that mapping**, all deliberate:

- **The mapping is dense on purpose, and that is the point of the plan.** One structural change
  serves eleven dialogs, four large ones and every dialog added later. A mapping in which each
  requirement had its own intervention would mean the fix had been split across screens — the exact
  shape of work the spec forbids.
- **REQ-11, REQ-12, REQ-14 and REQ-15 are requirements the batch can only fail.** Nothing is built
  for them: they are kept true by INT-1 and INT-2 touching two files inside `client/src/ui/`, adding
  no filter declaration, editing no feature file, no dialog's wording and not
  `client/scripts/check-ui-conformance.mjs` — which then passes on its unchanged allow-list under
  `npm run lint` and `npm run test -w client`.
- **REQ-6 is closed by construction, not by an assertion.** Once one element states the width and
  everything inside it is `100%`, retuning that single declaration moves card and content together;
  there is nothing left that could disagree with it. The rule is written into
  `.sdd/modules/ui-library/specs/modal.md` (INT-2) so the next person retunes the width rather than
  re-splitting it across two elements.
- **REQ-16, REQ-17 and REQ-18 hang on INT-3 alone, and INT-3 is the batch's real risk.** They are
  the requirements that stop this becoming "the wide dialogs look better now". They are also why
  INT-3 is written before the fix and observed failing: coverage that has never been red is not
  coverage.
- **REQ-5 is verified on three dialogs, not eleven, and that is the decision rather than a
  shortcut.** INT-3 measures a `FormDialog` (Create context), a `ConfirmDialog` (a prune or log-out
  confirmation — a genuinely different content composition, which is why the second one is not a
  second `FormDialog`) and the `large` dialog it needs for REQ-8 anyway, and asserts the ordinary
  two are the same width **as each other**. The rest is closed by construction: once the width is
  stated in exactly one place, per-screen variation is not something a test could find, **because it
  is not something the code can express**. A sweep of the nine screens would spend triple the
  runtime re-proving that one CSS declaration applies to all of its consumers and would leave nine
  fragile setups behind — the kind of coverage deleted in a year by someone who cannot see what it
  was for. What keeps that honest rather than merely cheap is the rule INT-2 and INT-3 write down:
  **if a screen ever needs a dialog width of its own, that is a new requirement and a new decision,
  not something to be discovered by a test.**

## Risks carried forward

- **The guard lives only in the e2e pass.** `npm run test` (client unit) will not catch a
  reintroduced disagreement; `client/e2e/dialog-sizing.spec.ts` will, and it runs in the complete
  e2e suite. That is the cost of the human's — correct — refusal to accept a jsdom or CSS-text
  substitute, and it is accepted: a slower check that measures the real thing beats a fast one that
  measures a proxy.
- **A future dialog can still opt out of the positioner.** The correction makes `Modal` right; it
  does not make it impossible for someone to hand-roll a dialog next to it. The spec entry written by
  INT-2 is the whole defence, and it is a sentence, not a mechanism.
- **The constructed short-content case is a test-side edit of an open dialog's text.** If the copy of
  the dialog INT-3 picks is later rewritten, the check may need its selector adjusted. Preferred over
  the alternative — no coverage of the mode the spec calls the more damaging one.
