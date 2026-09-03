---
batch: 1 · figures-follow-the-listing
feature: F1 — A container the listing does not call running is answered with no figures
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7]
depends: []
---

# Batch 1 — A container the listing does not call running is answered with no figures

The container listing is projected and the sampled figures are merged onto it at the same moment,
from the same held listing. Today the merge looks only at the age of the sample, so a card can state
`EXITED` and a measured value at once. This batch makes the state and the figures come from the same
reading.

Requirements are cited by id; their text is in [`requirements.md`](../requirements.md). Do not
restate it here.

## What is already true, and must stay true

Checked in the module index, in `containers-service.md` and — where the spec could not settle it —
in the code itself.

- **One projection point.** `server/src/containers/containers-service.ts` turns a listing entry into
  a summary in `toSummary`, and both readers of the listing go through it (`listContainers`,
  `readContainerList`). The container's own state is already in hand there, on the entry being
  projected. There is no second place to change.
- **The running set is already declared beside the sampler**: `DAEMON_RUNNING_STATES` =
  `running`, `paused`, `restarting` (`containers-service.ts`, above `runningContainersToSample`). It
  is what decides who gets measured. This batch makes it decide who gets answered as well. Do not
  write a second set and do not use `state === "running"`.
- **The staleness rule stays where it is.** `freshSample` withholds a reading older than three
  sampling intervals (`plan-docker_management_app-containers_card_view/REQ-52`). The new condition
  stands beside it, not in its place.
- **A paused container's figures are real.** Measured on the operator's daemon on 2026-08-31: the
  paused fixture reported `memoryUsageBytes: 831488` and `memoryLimitBytes: 18830254080`, its cgroup
  limit. It reads `0.0%` because it is measured at zero, which is the distinction the screen exists
  to show (REQ-4).
- **The periodic drop of a cached sample is not this rule.** `sampleOnce` deletes the cached reading
  of a container that has left the running set of the pass, up to ten seconds later. That stays, and
  becomes maintenance instead of the thing correctness rests on.
- **The card needs no change.** `.sdd/modules/containers/specs/container-card.md` already states that
  a metric with no sample reads `—`, `no sample` in the capacity note's place, and an empty track.
  `DashboardScreen.tsx` already reads `—` for a container with no CPU figure. Nothing under
  `client/src/` is touched (REQ-6).
- **The e2e check that reports the defect is not this batch's to edit** (REQ-7).
  `client/e2e/containers-card-geometry.spec.ts` is left as commit `8457ef7` leaves it. That commit
  belongs to another repair and it does **not** make the stopped-container assertion vacuous — the
  opposite. Its `waitForTheListToCatchUp` holds the test until the screen states, per container, what
  `docker ps --all` states, so the test measures the very listing in which the fixture is `exited`:
  the listing that carries the false `0.0%` today. `waitForASample` then holds it until the sampler
  has completed a pass, which is the pass that writes that false measurement.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `server/src/containers/containers-service.ts` — the projection of a listing entry into a summary (`toSummary`) | Hand the six figures only to a container whose state, in the listing being projected, is in `DAEMON_RUNNING_STATES`. Every other container is projected with none of the six. Nothing else about the projection changes, and the staleness rule keeps deciding the rest. | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6 | — |
| INT-2 | modify | `.sdd/modules/containers/specs/containers-service.md` — the `cpuPercent`/`memoryUsageBytes`/… contract line, and the rule on the cached sample being dropped | State that the figures reach only a container the projected listing puts in the running set. Say that the periodic drop is maintenance and no longer what keeps a stopped container's card honest. | REQ-1, REQ-5 | INT-1 |
| INT-3 | modify | `.sdd/modules/containers/index.md` — the `ContainersService` row | The row says the endpoint merges the sampled figures onto the listing at read time. Add that the merge reaches only the containers that same listing shows in the running set. | REQ-1 | INT-1 |
| INT-4 | modify | `server/test/unit/containers-stats-sampling.test.ts` | Cases beside the staleness ones: a container the listing shows as `exited` is answered with none of the six figures while a fresh sample of it is cached; a `paused` and a `restarting` one keep theirs; a non-zero reading does not outlive its container's stop. | REQ-1, REQ-3, REQ-4, REQ-5, REQ-7 | INT-1 |

## Order

`INT-1` → `INT-2`, `INT-3`, `INT-4`.

## Out of this batch

The sampling pass itself: what it asks for, when, and what it does with the answer is batch 2. The
sampler's cadence, its gate on live consumers and the staleness bound are untouched here. Nothing
under `client/src/`. No endpoint, no shape of the response, no new field. The detail panel's Stats
tab and its own stream are not involved.

## Human acceptance

### Scenario: a stopped container says it has no measurement

- REQ → REQ-1, REQ-2, REQ-4, REQ-6
- Given → the Containers screen showing a running container, a paused one and one just stopped
- When → the operator looks at the stopped container's card in the seconds after it stopped
- Then → its CPU and MEMORY read `—`, with *no sample* in the capacity note's place and an empty track
- And → the paused card beside it still reads `0.0%` with its capacity note

### Scenario: a container that was working loses its reading when it stops

- REQ → REQ-3, REQ-5
- Given → a container whose card shows a non-zero CPU reading
- When → the operator stops it
- Then → the card reads `—` and *no sample* as soon as it shows `EXITED`, and never the last figure it was measured at

### Scenario: the check that reported the defect passes without being touched

- REQ → REQ-7
- Given → `client/e2e/containers-card-geometry.spec.ts` exactly as commit `8457ef7` leaves it
- When → that file is run
- Then → *a card with no sample is drawn unlike a measured one, and unlike a measured zero* passes, with every assertion, wait and budget as they were

This last scenario is **deferred**: this cycle runs no test and no build. See the assumption on
certification in [`batches.md`](../batches.md).
