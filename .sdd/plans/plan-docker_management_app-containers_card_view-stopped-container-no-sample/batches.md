---
slug: docker_management_app-containers_card_view-stopped-container-no-sample
date: 2026-08-31
spec: chat, 2026-08-31 — the business spec was given in the conversation; no analysis file exists for this cycle
requirements: .sdd/plans/plan-docker_management_app-containers_card_view-stopped-container-no-sample/requirements.md
status: validated
---

# Batches — The card of a stopped container says *no sample* again

Fix of a delivered defect. **Two features, two batches, eight interventions, one product file.**
Batch numbers and `REQ-n`/`INT-n` ids are local to this plan.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · figures-follow-the-listing | F1 — A container the listing does not call running is answered with no figures | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7 | — | implemented | A stopped container says it has no measurement |
| 2 · an-empty-frame-is-no-measurement | F2 — A pass refuses the answer given for a container that is no longer running | REQ-8, REQ-9, REQ-10, REQ-11 | 1 | todo | A container stopped and started again shows no figure it did not measure |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases. **In this cycle they stop at `implemented`** — see the first
assumption below.

Batch files:
[`batches/batch-figures-follow-the-listing.md`](batches/batch-figures-follow-the-listing.md),
[`batches/batch-an-empty-frame-is-no-measurement.md`](batches/batch-an-empty-frame-is-no-measurement.md).

**Batch 2 depends on batch 1 by order, not by mechanism.** Either works without the other. They edit
the same product file and the same two paragraphs of the component spec, and batch 1 is what closes
the reported defect, so it goes first.

## Assumptions and decisions

- **The batches close as `implemented`, not `certified`** — the human's decision of 2026-08-31. No
  phase of this cycle runs a test or a build: the end-to-end suite empties the operator's own Docker
  daemon before every file. So the code and the checks are written and the batch is marked
  implemented; the suite is run, and the batches certified, in a later session, on the human's own
  outcome. This departs from the method's default, where green tests certify a batch.
- **A refused frame does not evict what is cached** (batch 2). The pass stores nothing for that
  container and leaves its previous reading alone. The eviction the pass already does removes it on
  the pass whose running set no longer holds the container, and batch 1 keeps it off the card
  meanwhile.
- **No new end-to-end check is written for F2.** The case is a container stopped and started again
  inside one sampling interval: a check for it would depend on a window of a few seconds and would be
  intermittent by construction, which is the class of defect this cycle exists to remove. F2 is
  covered by server unit cases, F1 by the unit cases and by the existing card check.
- **`client/e2e/containers-card-geometry.spec.ts` is not edited, and the baseline is commit
  `8457ef7`** (REQ-7). That commit is on the branch already and belongs to a different repair of the
  same file. **Read and confirmed**: it does not make the stopped-container assertion vacuous. Its
  `waitForTheListToCatchUp` holds the test until the screen states, container by container, what
  `docker ps --all` states — so the test measures the listing in which the fixture reads `exited`,
  which is the listing that carries the false `0.0%`. `waitForASample` then holds it until the
  sampler has completed a pass, which is the pass that writes that false measurement. The added wait
  makes the check land on the defect, not away from it.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` and the test rules in `CLAUDE.md`.
- **The plan `plan-docker_management_app-containers_card_view` is read and not edited**
  ([[past-analyses-and-plans-are-never-touched]]). Its `REQ-16` is the requirement the product fails;
  it stays as written, and this plan carries the correction.
- **This is a defect, not technical debt** ([[technical-debt-goes-in-the-tech-debt-register]]): the
  operator sees it, so it goes through the normal cycle and nothing is added to `.sdd/tech-debt/`.

## Departures from the spec

**None.** Nothing here contradicts the business spec. Two things it did not state are recorded
instead of being smuggled in:

- **The defect is wider than the symptom the spec describes.** It is not only a zero: any reading
  survives its container's stop for up to ten seconds, so a container measured at 12% and then
  stopped shows 12% beside `EXITED`. Same cause, same window. REQ-3 states it, and only F1 closes it.
- **The certification arrangement** above departs from the method, not from the spec, and was decided
  by the human today.

## Coverage check

**Every REQ is served by at least one INT, and every REQ closes inside one batch.** Nothing is split
across batches. Ids below are qualified by batch, since `INT-n` is local to its own batch file.

| REQ | Closes in | Interventions serving it |
| --- | --- | --- |
| REQ-1 | batch 1 | INT-1, INT-2, INT-3, INT-4 |
| REQ-2 | batch 1 | INT-1 (observed by the existing card check, REQ-7) |
| REQ-3 | batch 1 | INT-1, INT-4 |
| REQ-4 | batch 1 | INT-1, INT-4 |
| REQ-5 | batch 1 | INT-1, INT-2, INT-4 |
| REQ-6 | batch 1 | INT-1 — the perimeter of the one product change |
| REQ-7 | batch 1 | INT-4 — the perimeter of the coverage this plan adds |
| REQ-8 | batch 2 | INT-1, INT-2, INT-3, INT-4 |
| REQ-9 | batch 2 | INT-1, INT-2, INT-3, INT-4 |
| REQ-10 | batch 2 | INT-1, INT-4 |
| REQ-11 | batch 2 | INT-1, INT-4 |

**REQ-6 and REQ-7 are prohibitions, and they are served by a perimeter rather than by work.** REQ-6
is held by batch 1's INT-1 being the whole product change and being on the server; REQ-7 is held by
batch 1's INT-4 putting this plan's new coverage in the server unit tree and nowhere else. Both bind
batch 2 as well — its interventions may not touch `client/src/` nor the card check — without being
reopened there.

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none.

| INT | REQ served |
| --- | --- |
| batch 1 · INT-1 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6 |
| batch 1 · INT-2 | REQ-1, REQ-5 |
| batch 1 · INT-3 | REQ-1 |
| batch 1 · INT-4 | REQ-1, REQ-3, REQ-4, REQ-5, REQ-7 |
| batch 2 · INT-1 | REQ-8, REQ-9, REQ-10, REQ-11 |
| batch 2 · INT-2 | REQ-8, REQ-9 |
| batch 2 · INT-3 | REQ-8, REQ-9 |
| batch 2 · INT-4 | REQ-8, REQ-9, REQ-10, REQ-11 |

## Risks carried forward

- **The correction ships unrun.** Two batches of product code and two files of new checks are
  delivered without a single execution, by the constraint above. Whatever the later session finds is
  found late, and the plan's own coverage is what the implementer has to reason with meanwhile.
- **The intermittent check stays intermittent until it is run.** `containers-card-geometry.spec.ts`
  failed by luck of timing, so a pass proves less than a failure did. Certifying this fix needs the
  file run enough times to be believed, not once.
- **The 12% case has no check of its own on the screen.** REQ-3 is covered at the server, where a
  reading can be planted. Reproducing it in the browser means measuring a container while it works
  and stopping it at the right moment — the kind of timing check this plan refuses to add.
