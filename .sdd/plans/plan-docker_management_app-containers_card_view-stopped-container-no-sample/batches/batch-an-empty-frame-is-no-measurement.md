---
batch: 2 · an-empty-frame-is-no-measurement
feature: F2 — A pass refuses the answer given for a container that is no longer running
closed_req: [REQ-8, REQ-9, REQ-10, REQ-11]
depends: [1]
---

# Batch 2 — A pass refuses the answer given for a container that is no longer running

A sampling pass asks the daemon for the statistics of every container the held listing calls running.
That listing can be a few hundred milliseconds old, so the pass sometimes asks about a container that
has already stopped. The daemon answers instead of failing, and the empty answer is stored as a
measurement of zero. This batch refuses it.

Requirements are cited by id; their text is in [`requirements.md`](../requirements.md). Do not
restate it here.

## What is already true, and must stay true

- **The written contract says this already, and the code does not do it.**
  `.sdd/modules/containers/specs/containers-service.md`: *"A container that stopped between the
  listing being read and its statistics call going out is simply skipped for that pass."* The skip
  was left to a failure that does not happen.
- **The daemon answers.** Measured on the operator's daemon (Docker 29.7.2), `GET
  /v1.43/containers/<id>/stats?stream=false` on an `exited` container: HTTP 200, `memory_stats: {}`,
  every CPU counter zero, no `system_cpu_usage`, no `networks`. The `catch` in `sampleOnce`, whose
  comment claims to cover this, never runs.
- **The mark of the empty answer is the missing memory limit.** A container that is running always
  reports the limit of its cgroup; the paused fixture of the failed run reported 18830254080 while
  the stopped one produced a zero. The conversion of a frame to a reading already reads
  `memory_stats.limit`, defaulting it to `0` — that default is where the false zero enters.
- **Batch 1 is not made redundant by this**, and does not make this redundant. A reading taken while
  the container really was running is a real measurement, so nothing here refuses it; only batch 1
  keeps it off the card of a container that has since stopped.
- **The pass's other rules stand**: the 10-second cadence, the immediate first sample on start, one
  pass at a time with no backlog, the derivation of the set from the held listing through `peek()`,
  and the dropping of a cached reading for a container that has left the running set.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `server/src/containers/containers-service.ts` — the sampling pass (`sampleOnce`) and the conversion of a stats frame into a reading (`computeUsage`) | An answer that reports no memory limit is not a measurement: store nothing for that container on that pass, and leave the cached reading alone. Correct the comment beside the `catch`, which claims a failure that never happens. | REQ-8, REQ-9, REQ-10, REQ-11 | — |
| INT-2 | modify | `.sdd/modules/containers/specs/containers-service.md` — the rule on a container that stopped between the listing and the statistics call | Make the line true and say what makes it true: the daemon answers such a call successfully, and an answer with no memory limit is not stored. | REQ-8, REQ-9 | INT-1 |
| INT-3 | modify | `.sdd/modules/containers/index.md` — the `ContainersService` row | Beside "withheld once a reading is older than three intervals", add that an answer carrying no memory limit is not a reading at all. | REQ-8, REQ-9 | INT-1 |
| INT-4 | modify | `server/test/unit/containers-stats-sampling.test.ts` | Cases: an answer with no memory limit stores nothing and provokes no second call; a complete frame is stored as today; a container the listing calls running whose answer is empty reports no figures, and reports them on the pass that measures it for real. | REQ-8, REQ-9, REQ-10, REQ-11 | INT-1 |

## Order

`INT-1` → `INT-2`, `INT-3`, `INT-4`.

## Out of this batch

The projection of the listing, which is batch 1. The cadence, the gate on live consumers, the
staleness bound and the eviction rule: all unchanged. No extra call to the daemon, and no second mark
of an empty frame — the absent `system_cpu_usage` is not used, one mark is enough and two would have
to be kept in step. Nothing under `client/src/`.

## Human acceptance

### Scenario: a container stopped and started again shows no figure it did not measure

- REQ → REQ-8, REQ-9, REQ-10
- Given → a container on the Containers screen, stopped and then started again within a few seconds
- When → the operator watches its card while it says `RUNNING` again
- Then → CPU and MEMORY read `—` with the *no sample* wording until a reading is taken, and never `0.0%`
- And → the first real figures appear within about ten seconds

### Scenario: the other cards keep measuring as they did

- REQ → REQ-11
- Given → the Containers screen with a running container and a paused one
- When → the operator watches them through several sampling passes
- Then → the running card updates its numbers at the rate it does today
- And → the paused card still reads `0.0%` with its capacity note

Both scenarios are **deferred as automated verification**: this cycle runs no test and no build. See
the assumption on certification in [`batches.md`](../batches.md).
