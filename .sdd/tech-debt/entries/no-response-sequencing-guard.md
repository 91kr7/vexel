---
id: no-response-sequencing-guard
area: client
severity: medium
cost: correctness
date: 2026-08-27
source: study .sdd/analysis/studies/refresh-and-polling.html
status: open
---

# Nothing guarantees the last response is the latest reading

**What** → each hook guards its responses with a single flag meaning "the component unmounted".
There is no sequence number and no cancellation of an in-flight request. Two overlapping re-reads
can therefore land out of order, and the **older response arriving last overwrites the newer one**.

**Where** → `client/src/data/use-containers.ts:33` (`cancelledRef`) and the same shape in the other
ten polled hooks.

**Evidence** → not observed in the wild; it is a read of the code. The window is small at a
3-second cadence with ~50–130 ms responses, but it widens exactly where it hurts: during an event
burst seven re-reads start inside one second — see [[polled-hooks-do-not-coalesce-events]].

**Why it matters** → the symptom is a list showing a superseded state until the next round corrects
it, which reads as a flicker or a stale row rather than as a bug, and so would not be reported.

**Direction** → a per-request sequence number, or an `AbortController` cancelling the previous
in-flight read. Under [[no-server-side-sampling-or-dedup]] the defect disappears on its own: one
sampler is a single writer producing a monotonic sequence of snapshots.
