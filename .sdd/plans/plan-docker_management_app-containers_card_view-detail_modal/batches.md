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
| `container-detail-modal` | F1 — The container detail opens in a modal from the card's control, and the card stops being clickable | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31 | — | todo | The container's detail opens in a dialog from the card's corner control, and the list underneath does not move |
| `modal-container-bond` | F2 — The modal is bound to its container, not to the list | REQ-32, REQ-33, REQ-34, REQ-35, REQ-36 | `container-detail-modal` | todo | A container removed while its detail is open says so, instead of showing data that has stopped |

**Why this order.** `modal-container-bond` cannot precede `container-detail-modal`: there is no modal
to bond to a container before it.

**A third batch was planned and withdrawn.** `escape-closes-dialogs` would have made every dialog in
the product close on `Escape`; the human reversed that decision on 2026-08-26 before any of it was
built — *"sta cosa dell'esc che chiude i popup non farla e rimuovila dalle specifiche"* — and
`Escape` now closes nothing, this modal included (REQ-11). Nothing of that batch survives: the
library's `Modal`, `FormSheet` and `Combobox` keep exactly the behaviour they have today, and the
`Combobox` popup's handler stays outside the arbitration registry where the library deliberately
left it, its only hazard having been the widening that is gone. Recorded here so the withdrawal is
found by anyone who hears the idea a second time.

## Departures from the spec

None. Every decision in this plan is inside the spec's scope, and the one requirement of the source
analysis that this plan does **not** implement — `Escape` closing the modal — is being struck from
the analysis itself rather than departed from: the human named it as the analyst's own addition, not
something the request asked for.

## Assumptions and decisions

1. **"Popup" is the delivered `Modal` at `size='large'`** — the same surface the image diff, layer
   explorer, layer efficiency and filesystem browser views already use, whose sizing (`dialog_sizing`)
   is certified. Nothing is created: no new dialog component, no width variant, no second idiom
   (REQ-1, REQ-18).
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
5. **No view inside the detail is re-sized.** The business goal's "on its own surface it gets the
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
