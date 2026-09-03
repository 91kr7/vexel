---
batch: 1
feature: F3 — The card row stays retired everywhere else, and the containers exception is recorded
closed_req: [REQ-59, REQ-60, REQ-61, REQ-62, REQ-63]
depends: []
---

# Batch 1 — card-row-exception

The requirement texts live in
[`requirements.md`](../requirements.md); they are cited here by id only.

**What this batch is for.** The 2026-08-16 decision retired the card-per-row presentation across the
product and backed it with an automated check. Batch 2 draws one card per container, which that check
refuses on sight. This batch opens **one named exception**, keeps the guard failing everywhere else,
and makes the record say so — before anything is drawn, so that the exception is a decision taken in
the open rather than a guard got out of the way by whoever needed it moved.

**The product does not change.** After this batch the containers list is still a table and every
screen looks exactly as it did. What changes is a build script, the tests that drive it, and four
records.

**Two things must stay untouched, and one of them is checked by name.** The blur half of
`client/scripts/check-ui-conformance.mjs` — `blurAllowedOverlaySelectors`, its token binding and the
five declarations that decide on them — is byte-identical when this batch is done; it is pinned by
`client/test/unit/programme-constraints.test.ts` and it is the subject of REQ-33. And the card-row
pass acquires **no exception-comment mechanism** of its own: the spec is explicit that a marker
written at the call site that reintroduces the arrangement is how a decision becomes a formality.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/scripts/check-ui-conformance.mjs` | Add a **named admission** to the card-row pass's feature-file half (`cardRowSurfacesPerItem`): a single constant holding the two literal paths `client/src/containers/ContainersScreen.tsx` and `client/src/containers/ContainerCard.tsx`, with the date, the reason and a pointer to both records beside it. A `Surface`/`Card` inside a mapper is admitted in those two files and reported everywhere else. Nothing else in the file changes — not the retired-name patterns, not the CSS half, not one line of the blur half. | REQ-59, REQ-60, REQ-61, REQ-63 | — |
| INT-2 | modify | `client/test/unit/card-row-presentation-retired.test.ts` | Restate the guard's coverage instead of weakening it: the "no feature file draws a surface per row" assertion becomes "no feature file **except the two admitted paths**", and a new case drives the check over a fixture in another screen's path (must fail) and the same fixture at each admitted path (must pass). The pinned delivered revision the file compares against is updated deliberately, with the reason recorded on the spot. | REQ-59, REQ-60, REQ-63 | INT-1 |
| INT-3 | modify | `client/test/unit/ui-conformance-check.test.ts` | Extend the script's own unit coverage with the admission: the admitted paths pass, any other path with identical content fails, and the violation message still names the decision and the record. The eight delivered cases keep asserting what they were written for. | REQ-59, REQ-60, REQ-61 | INT-1 |
| INT-4 | modify | `client/test/unit/programme-constraints.test.ts` | Check that the blur-half pin survives an edit to the card-row half. If it is keyed to the file as a whole rather than to `blurAllowedOverlaySelectors` and the five declarations it exists to protect, narrow it to those, recording the narrowing and its reason — it must keep guarding REQ-33 exactly as hard afterwards. | REQ-61 | INT-1 |
| INT-5 | modify | `.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md` | Add an amendment block: **what changed, why, and on 2026-08-25** — one screen, containers, named; the geometric acceptance criteria (*"rows are flush… no row carries a rounded corner, an outline or a detached surface of its own"*) stated as holding everywhere except there; the reason taken from that analysis's own text (what it condemned was a hybrid, a column header over detached cards, and the containers card carries its labels inside itself); and a pointer to `.sdd/analysis/docker_management_app-containers_card_view.md`. The decision is not re-argued and not reversed. | REQ-62 | — |
| INT-6 | modify | `.sdd/plans/plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/` — `requirements.md`, `batches.md`, `closing-state.md` | Carry the same amendment into the plan artefacts that state the retirement as delivered behaviour, against the requirements the exception narrows (its REQ-1, REQ-22 and the geometry-bearing ones), each with the date and a pointer. Do not renumber, delete or rewrite a certified requirement: annotate it. | REQ-62 | INT-5 |
| INT-7 | modify | `.sdd/modules/ui-library/specs/ui-conformance-check.md`, `.sdd/modules/ui-library/specs/data-table.md` | The two component specs that state the rule are brought back into agreement with the code: the check's spec gains the admission (the two paths, the date, and the fact that there is still no exception comment); `data-table.md`'s *"the object list of the whole product, in one presentation"* is qualified by name — containers is a card list from 2026-08-25, every other list is this one — and its containers references are marked as leaving. | REQ-62, REQ-63 | INT-1 |

## What "done" looks like

- `npm run lint` and `npm run test -w client` are green with the pass running.
- A `<Card>` in a mapper, pasted into any screen file **other** than the two admitted paths, fails
  `npm run lint` with a message naming the decision and the record; the same content at either
  admitted path passes.
- `.ui-data-table__row` given a radius, `.ui-data-table__body` given a gap, and the words
  `'comfortable'` / `DataTableVariant` / `ComfortableRowCarrier` all still fail.
- The blur half of the script is byte-identical to its certified state.
- The four records carry an amendment block each, dated 2026-08-25, bounded to containers.

## Out of this batch

- Anything the operator can see. No component, no screen and no stylesheet is touched.
- The blur allow-list, the `--blur-overlay` token, the background asset, and `CLAUDE.md` — which
  states the blur rule and does **not** state the card-row rule, and therefore needs no edit.
- Creating `client/src/containers/ContainerCard.tsx`. Batch 1 names the path; batch 2 writes the
  file.
