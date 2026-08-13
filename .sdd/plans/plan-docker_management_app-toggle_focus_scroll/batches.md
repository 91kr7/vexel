---
slug: docker_management_app-toggle_focus_scroll
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-toggle_focus_scroll.md
requirements: .sdd/plans/plan-docker_management_app-toggle_focus_scroll/requirements.md
status: validated
---

# Batches — A switch does not move the surface it sits on

Fix of the delivered product; bug-2 **reopened**. **One feature, one batch, six interventions, one
declaration of product code.** Batch numbers and `REQ-n`/`INT-n` ids are local to this plan.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · switch-surface-stability | F1 — A switch does not move the surface it sits on | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21 | — | implemented | **First, by hand, the report itself**: at a narrow window open Containers → `Run container…`, click `Run privileged` **with the mouse** — the sheet does not move, the switch is on and still under the pointer, the form still reads as it did. Then the same click on the container detail panel's health-check `Enabled`, on the container logs view's `Timestamps`, and on the plugins screen's switches: nothing moves, and on each of the four screens the switch looks and sits exactly as before — same size, same label, same place, nothing overlapping a neighbour. Then `Tab` to a switch and operate it from the keyboard: it is reachable, it takes visible focus, it toggles, and a screen reader still announces its label and state. **Then the evidence that the check could have caught it**: the implementer reports the two specs **run against this build with INT-3 reverted, and observed failing**, naming what failed and by how much — a check never seen red proves only that it passes. **Then the siblings**: the report carries a real-pointer measurement for `.ui-file-picker__input` and for `.ui-button-with-description__text` — the gap and the surface's position before and after — and for each either a correction or "measured clean, untouched"; a sibling recorded clean shows **no diff** and has acquired no test. **Then that nothing else moved**: `git diff` on `client/src/` is the one `.ui-toggle` declaration plus, at most, a matching one for a sibling proved defective; no feature file, no `Toggle.tsx`, no `check-ui-conformance.mjs`, no selector added to or removed from the blur allow-list. **Then the durable part**: `CLAUDE.md` carries both halves of the lesson beside the existing rules, each with its evidence; the three ui-library specs carry the corrected behaviour and both sibling measurements; the superseded analysis is **unedited**, its verdict sites reported for the human to annotate; and `bugs.md` carries under bug-2 a **second** annotation line superseding the first, with the first line and the human's own report unaltered to the character. **Test runs are batch-scoped**: `npm run lint`, `npm run test:typecheck -w client`, `npm run test -w client` and this batch's two e2e specs, each run on its own. The complete suites are the human's, at the end. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases. On green tests the batch goes to `certified`.

Batch file: [`batches/batch-switch-surface-stability.md`](batches/batch-switch-surface-stability.md).

## Assumptions and decisions

- **The checks come first, and the fix is not made until they have been seen red** (REQ-14). The
  observation is made by running INT-1 and INT-2 against the build with the one declaration reverted,
  and is reported in the batch's certification — the same thing this repository did for bug-1's
  dialog sizing. **No permanent negative control is added for it**: unlike bug-2's blank-sheet
  control, there is now a real defect to have failed against, and the observation is the evidence.
- **The second consumer is the container detail panel's health-check `Enabled` switch** (REQ-13),
  because it puts the switch in a *different* scrolling container from the create form — which is
  what demonstrates the fault was the library's and not the create form's. One `vexel-test-tiny:1`
  container, created through the product and never started, removed with `docker rm -fv`.
- **The existing bug-2 spec keeps its 813px viewport and its blanked-sheet negative control**, and
  gains the position assertions alongside them. The viewport is the geometry the human's own
  screenshot was taken at; the control guards the *content* assertion, which remains a real assertion
  even though it is not the one that catches this defect. Dropping coverage while fixing a defect
  found by missing coverage would be a poor trade.
- **The sibling measurements are one-time and are recorded in the component specs, not turned into
  standing checks** (REQ-7 to REQ-9). A standing check on a control never shown to be broken asserts
  nothing anyone can name, and would be deleted in a year by someone who cannot see what it was for.
  The measurement is what has value, and the place for a measurement nobody must repeat is the spec.
  A sibling proved defective is corrected in INT-4 and is then covered like the switch.
- **REQ-4, REQ-5, REQ-6 and REQ-18 are served by INT-3 as confirmations, not as work.** They state
  that this change has no side effects — daemon behaviour, appearance and layout on all four
  consumers, keyboard and assistive-technology operation, the blur allow-list. Nothing is built for
  them; they are how INT-3 is judged, which is what makes a one-line change reviewable.
- **The correction is CSS in the library and nothing else** (REQ-17). `Toggle.tsx` is not touched, no
  feature screen compensates locally, and the fix is not attempted in JavaScript (`preventScroll`,
  scroll restoration, a focus trap): the browser's scroll-on-focus cannot be turned off, so the
  correction has to be to where the hidden control sits.
- **`bugs.md` is appended to, never edited** (REQ-21, decided by the human at the coverage gate). Its
  existing annotation under bug-2 — "investigated, not reproduced" — is a true record of what was
  concluded at the time and stays exactly as it is; a second line beneath it supersedes it. Leaving
  "not reproduced" standing alone under a defect just reproduced and fixed would be the most
  misleading artefact this work could leave, and `bugs.md` is the first place anyone looks.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` and the test rules in `CLAUDE.md`; the canonical commands come from `.archi`.

## Departures from the spec

**None.** Nothing here contradicts the analysis. The four decisions taken at the requirements gate
(the detail-panel consumer, one-time sibling measurement, seen-red by revert, keeping the existing
spec's viewport and control) each narrow towards the spec rather than away from it.

## Coverage check

Every REQ is served by at least one INT, and **every REQ closes inside batch 1** — there is one
batch, so nothing is split across batches.

| REQ | Interventions serving it |
| --- | --- |
| REQ-1 | INT-3 (verified by INT-1, INT-2) |
| REQ-2 | INT-3 |
| REQ-3 | INT-3 (second consumer covered by INT-2) |
| REQ-4 | INT-3 |
| REQ-5 | INT-3 |
| REQ-6 | INT-3 |
| REQ-7 | INT-4 |
| REQ-8 | INT-4 |
| REQ-9 | INT-4, INT-6 |
| REQ-10 | INT-1, INT-2 |
| REQ-11 | INT-1, INT-2 |
| REQ-12 | INT-1 |
| REQ-13 | INT-2 |
| REQ-14 | INT-1, INT-2, INT-3 |
| REQ-15 | INT-1, INT-2 |
| REQ-16 | INT-5 |
| REQ-17 | INT-3, INT-4 |
| REQ-18 | INT-3 |
| REQ-19 | INT-6 |
| REQ-20 | INT-6 |
| REQ-21 | INT-6 |

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none — the
shared measurement helper is written inside INT-1, which is a requirement-serving check in its own
right.

| INT | REQ served |
| --- | --- |
| INT-1 | REQ-10, REQ-11, REQ-12, REQ-14, REQ-15 |
| INT-2 | REQ-10, REQ-11, REQ-13, REQ-15 |
| INT-3 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-14, REQ-17, REQ-18 |
| INT-4 | REQ-7, REQ-8, REQ-9, REQ-17 |
| INT-5 | REQ-16 |
| INT-6 | REQ-9, REQ-19, REQ-20, REQ-21 |

**Two notes on the shape of that mapping**, both deliberate:

- **The checks outweigh the fix, four interventions to one declaration.** That is the correct
  proportion for this item: the defect is one line, and the reason it reached a certified product is
  the verification, which is why REQ-10 to REQ-16 exist.
- **INT-4 may end in no code change at all.** If both siblings measure clean, its entire deliverable
  is two measurements recorded by INT-6. That is a completed intervention doing exactly what it was
  asked to do — measure rather than assume — and it must not be read as one that achieved nothing.

## Risks carried forward

- **The rewritten check still cannot fail.** The failure mode has already happened once here. The
  guard is REQ-14: the check is run against the unfixed build and watched failing before the fix
  exists. If that observation is not reported, the batch is not done.
- **A one-line positioning change has a wide blast radius across four screens.** A switch that now
  overlaps a neighbour, or sits behind something, would be a regression introduced by the repair —
  which is why REQ-5 is confirmed by looking at each of the four consumers rather than at one.
- **The superseding annotation is a sentence, not a mechanism.** `bugs.md` will hold two annotations
  under bug-2, the first of them wrong; anyone quoting the first without reading the second gets
  "investigated, not reproduced" for a defect that was reproduced and fixed. Nothing enforces reading
  both, which is the accepted cost of never editing the human's file.
