---
slug: docker_management_app-containers_card_view-detail_modal
date: 2026-08-26
spec: .sdd/analysis/docker_management_app-containers_card_view-detail_modal.md
requirements: requirements.md
status: validated
---

# Batches — The container detail moves onto the modal dialog surface

Two batches, one per feature, in build order. Requirement ids are this plan's (`requirements.md`);
intervention ids are local to each batch file.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| `container-detail-modal` | F1 — The container detail opens in a modal from the card's control, and the card stops being clickable | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31 | — | certified | The container's detail opens in a dialog from the card's corner control, and the list underneath does not move |
| `modal-container-bond` | F2 — The modal is bound to its container, not to the list | REQ-32, REQ-33, REQ-34, REQ-35, REQ-36 | `container-detail-modal` | certified | A container removed while its detail is open says so, instead of showing data that has stopped |

**Why this order.** `modal-container-bond` cannot precede `container-detail-modal`: there is no modal
to bond to a container before it.

**REQ-25 was narrowed on 2026-08-26**, by the human, after the batch's checks measured what it
actually catches here. It was written against bug-2 — a control whose visually hidden input is drawn
far from its visible track, carrying its surface off screen when focus lands on it. That is absent:
the health-check switch's hidden input sits 10.3px from its track. What the check caught instead is
the dialog being content-sized and vertically centred, so revealing the five health-check fields
grows it 85.2px and raises its top edge by half of that — which every control that reveals fields
would do. The requirement keeps its "the switch is still in the viewport" clause and asks for the
absence of a drag rather than an unchanged viewport box.

**A third batch was planned and withdrawn.** `escape-closes-dialogs` would have made every dialog in
the product close on `Escape`; the human reversed that decision on 2026-08-26 before any of it was
built — *"sta cosa dell'esc che chiude i popup non farla e rimuovila dalle specifiche"* — and
`Escape` now closes nothing, this modal included (REQ-11). Nothing of that batch survives: the
library's `Modal`, `FormSheet` and `Combobox` keep exactly the behaviour they have today, and the
`Combobox` popup's handler stays outside the arbitration registry where the library deliberately
left it, its only hazard having been the widening that is gone. Recorded here so the withdrawal is
found by anyone who hears the idea a second time.

## The test phase was cut short, then resumed and closed

**On 2026-08-26 the human asked to skip the tests and close the plan on the development**, and later
the same day asked to run them after all. Recorded because the gap was a decision, and because the
work came back in a different order than the command's own loop: `modal-container-bond` was
developed while `container-detail-modal` still carried three red checks, so its developer built on
an uncertified predecessor and said so.

Both batches are now `certified`. What the resumed run closed:

| check | how it was closed |
| --- | --- |
| `container-detail-switch-surface.spec.ts` | restated against REQ-25's narrowed wording. A new `clickAndExpectSurfaceNotDragged` in `client/e2e/support/surface-stability.ts` asserts the centre held **and** the top edge moved exactly minus half the growth, so a dialog that both grew and was dragged cannot pass on the centre alone; bug-2's 1044px drag changed no height and fails it by 1044px. The create sheet keeps the stricter `clickAndExpectSurfaceUnmoved`. |
| `container-detail-property-columns.spec.ts` | green through the suite, 8/8: 2 columns at 1280, 4 at 1920, 6 at 2560, all three ceilings cleared. |
| `dialog-sizing.spec.ts:433` | the container detail gets its own `fluidLargeDialogWidth`; `largeDialogWidth` is untouched and still the expectation for the layer explorer and filesystem browser, with a comment against folding them together. **It then failed by 0.006px**: `expectDesignedWidth` compares the content column to the constant too, and the 2px hairline slack is exact only while the designed width is an integer — `92vw` is fractional. Resolved by **tightening** the card assertion to 1px and leaving the content ↔ card agreement to `expectCardIsTheSizeOfItsContent`, the property REQ-1/REQ-2 actually name. |
| `containers-screen.test.tsx`, *"closes when its container leaves the list"* | rewritten by `modal-container-bond`'s INT-2 as the stated end state, which is what REQ-33/34/36 replace it with. |

One flake was found and fixed on the way: `containers.spec.ts` read the dialog's box the instant it
opened, before the Config tab's inspect data landed, so a comparison across a keystroke could report
the content's arrival as a displacement. A `settledDialogBox` helper now waits for the content;
confirmed over three consecutive full-file runs.

**Closing run** — whole client suite **2353 passed / 0 failed** (168 files), lint and UI-conformance
green, and the complete Playwright suite **588 passed / 1 failed / 2 skipped**, plus the `exclusive`
project **11/11** run separately (it had been skipped by the project dependency).

**The one e2e failure is outside this plan's perimeter, and did not reproduce**:
`client/e2e/classic-table-criteria.spec.ts:381`, the networks chips on the volumes/networks screen.

The tester reported it as reproducible on its own, twice, on two different assertions, and therefore
as a standing red rather than a regression. **That was checked and does not hold.** Run with the same
command on both commits, it passes:

| what was run | commit | result |
| --- | --- | --- |
| that test alone (`--grep "networks chips"`) | `main` | **1 passed** (12.3s) |
| that test alone, same command | this branch | **1 passed** (12.2s) |
| the whole file | this branch | **8 passed** (35.7s) |

So it is neither a regression of this plan nor a standing failure: it failed **once, under the full
suite**, and does not reproduce in isolation on either commit. Cause not established — it is a flake
under full-suite conditions on a spec this branch never touched.

Independently of the run, this branch cannot reach that screen: it never touched that spec, the
volumes/networks sources, `DetailPanel` or the table components. Its only library changes are
`Modal.tsx`, whose two new branches are gated on opt-ins that only `ContainersScreen` requests — the
`.ui-modal__header` band is rendered **only** when `closeControl` is asked for, so no other dialog's
title layout changed — and `feedback.css`, one rule gated on that same opt-in plus one compounded on
the fluid-width class.

One thing in that file is worth a later look, and is not this plan's to fix: the test restores its
fixture with a bare `docker network connect` on the **last line**, outside any `finally`. A failure
at either of the two assertions above it leaves the container detached, which is the kind of
leftover the project's own test rule exists to prevent — and a plausible reason a first failure
would make a second run fail differently.

## Departures from the spec

None. Every decision in this plan is inside the spec's scope, and the one requirement of the source
analysis that this plan does **not** implement — `Escape` closing the modal — is being struck from
the analysis itself rather than departed from: the human named it as the analyst's own addition, not
something the request asked for.

## Assumptions and decisions

1. **"Popup" is the delivered `Modal` at `size='large'`** — the same surface the image diff, layer
   explorer, layer efficiency and filesystem browser views already use, whose sizing (`dialog_sizing`)
   is certified. No new dialog component and no second idiom (REQ-1, REQ-18).

   **"No width variant" was struck on 2026-08-26 by the human**, on the batch's own evidence. The
   delivered large format is `min(1100px, 92vw)`; the inline panel it replaces took the frame's
   width. Holding the detail at 1100px left the Inspect section measuring 2 columns at 1280, 1920
   and 2560 alike — over the ceiling the certified `detail_property_columns` plan set — and the
   environment and mounts entries at one per line where they had flowed two. That is a column the
   operator had and no longer has, which REQ-4 makes a defect, so the collision was settled in
   REQ-4's favour and REQ-18's designed width gave way. The detail's format widens with the
   viewport; the four other large dialogs are untouched.
2. **The dialog carries the title and the single close control; the container detail stops wrapping
   itself in the shared `DetailPanel`.** Confirmed by the human. A `DetailPanel` inside a `Modal`
   would give the operator two headers and two dismissal affordances on one surface. The shared panel
   is untouched and its without-close presentation keeps serving the images screen (REQ-27); the
   panel primitive loses one of its two consumers, not a capability.
3. **The close control is an opt-in presentation of the shared dialog surface**, by
   `container_detail_close`'s own rule — present where it is the only labelled way out — so no dialog
   that does not ask for one gains one (REQ-10, REQ-14). This is the same shape of decision that plan
   took for the detail panel, applied one surface over.
4. **The modal has exactly two ways out: its close control and a click on the dimmed area.**
   `Escape` is not one of them (REQ-11), by the human's decision. That is a change against the
   starting point — the inline panel closes on `Escape` — and is written as a requirement rather than
   left as an absence, so that a later reader finds a decision instead of a gap.
5. **No view inside the detail is re-sized** — meaning no view is *grown for its own sake*. The
   format change of assumption 1 is not an exception to this: it restores the width the detail
   already had inline, which is what REQ-4 demands, rather than granting it more.

   The original reading follows. **No view inside the detail is re-sized.** The business goal's "on its own surface it gets the
   viewport" is the reason the surface moved, not a licence to grow the log stream, the terminal or
   the property lists: REQ-4 makes any observable difference beyond *where* the detail is drawn a
   defect. The dialog is large; what it holds is what it held.
6. **The detail holds no `BandStack`, so the dialog keeps the plain `'large'` layout.** The library's
   documented gate — a `'large'` dialog nesting a `BandStack` at any depth silently inherits the
   column layout — is recorded as a watch item for whoever later puts one inside this dialog, not as
   a change to make now.
7. **The card's control keeps its delivered geometry, position and accessible name.** The card's
   layout is out of the spec's scope, and the risk register names that control's prominence as the
   change's only mitigation for the withdrawn card click; changing it would be a new decision, not
   part of this one.
8. **The "no longer exists" statement is drawn on the library's one empty-result surface**, whose
   contract already demands a title, an explanation and a resolving action — the resolving action
   being the dialog's own dismissal. One new English string, and no new component (REQ-33, REQ-34).
9. **The test trees are not in the indexes**, which map components. The e2e and unit paths named in
   the `where` of the coverage interventions were located directly; recorded so nobody reads them as
   an index reading that has since drifted.

## Carried risks

- **A stray click on the dimmed area ends a live exec or attach session with no confirmation**
  (REQ-13). Accepted by the human, with the spec's own reasoning — the modal invents no route of its
  own — and named here because the failure is silent and the gesture is easy.
- **A keyboard operator inside the modal has no key to leave it with** (REQ-11). The close control is
  reachable by `Tab` and is labelled, so nobody is stranded; but the inline panel's `Escape` is gone
  and nothing announces that. The cheap reversal, if it is asked for, is a single claim handler on
  the one surface — deliberately not taken now.
- **The gesture operators use today — clicking a card — stops working, and nothing announces it**
  (REQ-6). The spec's own first risk; the cheap reversal is to let the card body open the dialog
  again, which is one call site.
- **Two detail idioms ship at once**: containers in a dialog, images inline (REQ-27). Accepted as
  temporary on the same terms as the last split of this panel.

## Coverage check

**Every REQ is served by at least one INT.** The mapping, by batch:

| REQ | Batch | INT |
| --- | --- | --- |
| REQ-1, REQ-2, REQ-3 | `container-detail-modal` | INT-3 |
| REQ-4 | `container-detail-modal` | INT-2 |
| REQ-5 | `container-detail-modal` | INT-3, INT-4 |
| REQ-6, REQ-7, REQ-8, REQ-9 | `container-detail-modal` | INT-4 |
| REQ-10 | `container-detail-modal` | INT-1 |
| REQ-11, REQ-12, REQ-13 | `container-detail-modal` | INT-3 |
| REQ-14 | `container-detail-modal` | INT-1 |
| REQ-15, REQ-16 | `container-detail-modal` | INT-3 |
| REQ-17 | `container-detail-modal` | INT-1, INT-3 |
| REQ-18 | `container-detail-modal` | INT-3 |
| REQ-19, REQ-20, REQ-21 | `container-detail-modal` | INT-6 |
| REQ-22 | `container-detail-modal` | INT-3 |
| REQ-23, REQ-24 | `container-detail-modal` | INT-2 |
| REQ-25 | `container-detail-modal` | INT-6 |
| REQ-26 | `container-detail-modal` | INT-3 |
| REQ-27 | `container-detail-modal` | INT-6 |
| REQ-28 | `container-detail-modal` | INT-5, INT-6 |
| REQ-29 | `container-detail-modal` | INT-6 |
| REQ-30 | `container-detail-modal` | INT-2, INT-3, INT-4 |
| REQ-31 | `container-detail-modal` | INT-3 |
| REQ-32 | `modal-container-bond` | INT-1, INT-2, INT-3 |
| REQ-33, REQ-35 | `modal-container-bond` | INT-1, INT-2, INT-3 |
| REQ-34, REQ-36 | `modal-container-bond` | INT-1, INT-3 |

**Every INT serves at least one REQ.** No intervention in this plan is enabling-only; there is no
declared exception.

**No REQ is completed across several batches.** Each closes in exactly one, and the "REQ closed"
column, this check and each batch's frontmatter carry the same list. One pair looks like it spans
batches and does not: REQ-23/REQ-24 (nothing outlives a dismissed dialog) close in
`container-detail-modal`, by the two dismissal routes that exist there; the third route — the
container ceasing to exist — is REQ-36, which closes in `modal-container-bond`. They were
deliberately written as separate requirements so that neither batch has to half-close the other's.

**Requirements whose verification is discipline rather than a user path** — REQ-20 (the blur
allow-list gains and loses nothing), REQ-28 (coverage rewritten, not deleted), REQ-29 (real pointer,
asserted geometry) and REQ-30 (no raw markup or CSS in feature code) — are served by the coverage
interventions of their batch and are cited on the acceptance scenarios whose checks carry them. They
are verified by the delivered conformance and blur passes staying green and unedited, plus the
rewritten specs.
