---
slug: docker_management_app-push_failure_reporting
date: 2026-08-27
spec: .sdd/analysis/docker_management_app-push_failure_reporting.md
status: validated
---

# Batches — push failure reporting

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
|-------|---------|------------|---------|--------|------------------|
| push-failure-reported | A refused push reaches the operator, and a check that can fail proves it | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10 | — | in progress | The operator learns that a push to an unreachable registry failed, and why |

One batch, so no execution order to declare.

## Assumptions and decisions

- **The thirty seconds belong to the daemon and that host.** Nothing planned here reads, waits for or
  depends on that value; it is only the reason the check's budget must stay above it.
- **No deadline exists on the server's image path today.** A search for `timeout` across
  `server/src` finds it only in `containers`, `registries`, `persistence` and `plugins` — never on
  the Engine API stream that carries a push. REQ-3 is therefore a constraint on the correction
  ("introduce none"), not a removal: no watchdog, no "if nothing arrives in N seconds" fallback may
  be added to make the failure appear.
- **The check's budget is not a deadline of the interface.** Playwright's default per-test timeout is
  thirty seconds, below the daemon's refusal time, so the new spec states a budget of its own above
  forty-five seconds. That is the test's patience, not the product's (REQ-3 is about the product).
- **`loadImages` is deliberately left alone.** The spec asks for the correction "where the outcome
  reporting is shared with the other streamed operations, pull first of all": that shared point is
  `streamTransfer`, which serves pull and push and nothing else. `loadImages` has a decoding loop of
  the same shape but is not on that path, and its end already carries a stated result (`references`)
  rather than inferring one from silence. Correcting it would go past "correct only what is broken".
  Flagged here so the human can overturn it in one line if they want it swept too.
- **The successful push keeps its existing guard.**
  `server/test/api/images-push-routes.test.ts:106` — the check that a real push to a real local
  registry ends in `end` with a retrievable manifest — is REQ-5's guard and must stay green
  unchanged. It is the evidence that the correction did not turn a success into a failure.
- **Operational, not a plan decision.** While the defect stands, the root `npm run test` stops at
  `test:api`, so `test:exclusive`, `test:sweep` and the entire client leg have not been running. The
  first green root run after this batch is the first time in this cycle that they do — treat their
  first results as new information, not as regressions from this batch alone.
  **Binding, not informative:** every red that surfaces there is **attributed before the batch
  closes** — neither charged to this batch by default, nor filed as "pre-existing" without having
  been shown to be. Perimeter demonstrated, not asserted.
- **One red is already known and is not this plan's.** `client/e2e/containers.spec.ts:1158` — an
  intermittent product defect in `ContainersScreen.tsx` (4 failures in 16 runs), left standing by the
  cycle that has just closed and carried to the human as work of their own. It is outside this
  batch's perimeter, it is not a requirement here, and nothing in this plan addresses it: it is
  recorded only so that a full Playwright run failing on that line is recognised for what it is
  rather than re-attributed to this fix.
- **The full Playwright suite runs once at the end of the plan**, not at the close of this batch
  (knowledge base: `batch-closing-commands` as amended by the human's standing instruction on e2e).

## Departures

Both were decided by the human on 2026-08-27 and are departures from the method, not from the spec —
the business spec says nothing about batching or branching, so **nothing here asks for a correction
to the spec**.

- **One batch, not several.** The dogma is one batch per feature, and this plan carries two feature
  sections (the correction, and the check that proves it). The human asked for a single batch:
  everything ships together. The cost accepted: the correction and its check cannot be certified
  independently, and the batch closes only when both are green.
- **The cycle lives on the branch already open**,
  `feat/docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload`,
  rather than on a `fix/` branch of its own ("ma fixa su questa branch"). That branch therefore
  carries two cycles at once: the Inspect-tab evolution and this fix. The cost accepted: the two
  cannot be merged or reverted separately.

## Coverage check

Every REQ is served by at least one INT:

| REQ | Served by | Closes in |
|-----|-----------|-----------|
| REQ-1 | INT-2, INT-3 | push-failure-reported |
| REQ-2 | INT-2, INT-3, INT-4, INT-8 | push-failure-reported |
| REQ-3 | INT-2, INT-3, INT-4 | push-failure-reported |
| REQ-4 | INT-4, INT-5 | push-failure-reported |
| REQ-5 | INT-2 | push-failure-reported |
| REQ-6 | INT-2, INT-3, INT-4, INT-8 | push-failure-reported |
| REQ-7 | INT-1, INT-7 | push-failure-reported |
| REQ-8 | INT-6 | push-failure-reported |
| REQ-9 | INT-6 | push-failure-reported |
| REQ-10 | INT-6, INT-7 | push-failure-reported |

Every INT serves at least one REQ — INT-1 to INT-8, no enabling intervention among them.

No REQ is split across batches: there is one batch, and all ten close in it.

**One caveat on the coverage, deliberate.** INT-3, INT-4, INT-5 and INT-7 are written as
*conditional* on INT-1's finding, because REQ-7 forbids changing what is not broken. Each of the
requirements they serve is also served by an unconditional intervention (INT-2 for REQ-1, REQ-2,
REQ-3, REQ-6; INT-4 for REQ-4 — itself conditional, but paired with INT-5's confirmation; INT-1 and
INT-6 for the check requirements), so no requirement depends solely on a conditional intervention
firing. If the finding shows a link the plan did not anticipate, that is the finding doing its job:
record it and correct that link under the same REQ.
