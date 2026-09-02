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

**Where** → the twelve hooks that still hold the shape, all of them reads on demand or on a clock of
their own: `use-container-detail.ts`, `use-container-processes.ts`, `use-system-overview.ts`,
`use-disk-usage.ts`, `use-daemon-info.ts`, `use-coverage.ts`, `use-console.ts`,
`use-compose-file.ts`, `use-image-inspect.ts`, `use-image-layers.ts`, `use-network-inspect.ts`,
`use-volume-inspect.ts` (each `cancelledRef`).

**Evidence** → not observed in the wild; it is a read of the code. What used to widen it — an event
burst starting seven re-reads inside one second — no longer applies to any of the hooks left: none
of them re-reads on a daemon event.

**Why it matters** → the symptom is a list showing a superseded state until the next round corrects
it, which reads as a flicker or a stale row rather than as a bug, and so would not be reported.

**Direction** → a per-request sequence number, or an `AbortController` cancelling the previous
in-flight read.

**Re-examined on 2026-09-03, after the twelve values the server holds moved to the live channel**
(`plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-22).
**The lists are out of it**: every listing a screen shows now arrives on one ordered channel, where
an older message cannot land after a newer one, and none of them issues a request at all. What is
left is what still reads on demand — a detail panel, an inspect, a disk-usage view — plus the three
that keep a clock of their own by decision (the Dashboard's overview figures, the container detail
and its Processes tab). Those overlap only when the operator asks twice, or when a clock's own tick
meets a manual one, so the race survives on a much smaller surface than the one this entry was
written about.

**Re-examined on 2026-09-01.** This entry expected server-side sampling to close it on its own —
one writer, one monotonic sequence of snapshots. the refresh cache (`plan-docker_management_app-refresh_cache`) shipped that, and it does not
close this: the server being a single writer says nothing about the order two of its answers reach
the browser, and the overwrite happens there. What it does do is make consecutive answers identical
most of the time, since the held value now changes far less often than the client asks for it, so
the window in which the race has any effect is much narrower.
