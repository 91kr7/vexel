---
batch: stats-two-plus-three
feature: F2 — Stats is two metrics with a ceiling, then three without
closed_req: [REQ-13, REQ-14, REQ-15, REQ-16, REQ-17]
depends: [stable-detail-height]
---

# Batch — Two metrics that can be a percentage of something, and three that cannot

Five tiles in five equal tracks, every one carrying a meter. But CPU and Memory have a ceiling and
their percentages mean something, while Net I/O, Block I/O and PIDs have none: for those three the
meter enters its "no measurable maximum" state — a bar that by construction cannot fill in
proportion to anything. Giving them one was right against the alternative of the time, an empty track
indistinguishable from a broken one. The third choice is that a counter which only rises tells its
story with its shape, not with a fill.

**This batch supersedes two certified requirements**, deliberately and by name, and they are recorded
in `../batches.md`: `plan-ui-coherence-optimisation/REQ-63` (five tiles in the `even-row`
arrangement, one track per tile) and `REQ-64` (all five tiles built alike, each with a meter — whose
spec calls a tile without one *"a defect and not a variant"*). REQ-63's reason survives and is
answered differently: 2 + 3 orphans no metric either.

**The area fill the mock asks for is already drawn.** `Sparkline` renders a tinted area under its
line today (`client/src/ui/metrics/Sparkline.tsx`, the `ui-sparkline__area` path); the mock's reading
of it as a bare polyline is the one place its finding does not match the delivered component. What is
genuinely missing is the marked final point, which is what INT-1 adds.

**Each sparkline plots the series whose role it carries** — decided by the human on 2026-08-26:
inbound for Net I/O, read for Block I/O, the count for PIDs. Not the two summed, which is what the
delivered view plots for the first two.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/metrics/Sparkline.tsx` | The last sample of the window is marked with a point, so the current value is findable without following the line. The area under the line stays as it is. The component still repaints only when its samples or its scale change — no animation loop, no timer, no transition. | REQ-16 | — |
| INT-2 | modify | `client/src/containers/ContainerStatsView.tsx` | The five tiles become two groups: CPU and Memory on a row of two, keeping their meters filled against their own ceilings, then Net I/O, Block I/O and PIDs on a row of three. The arrangement is stated as a shape, never as a count of columns or a width, and it stacks below the phone breakpoint as it does today. | REQ-13, REQ-14 | — |
| INT-3 | modify | `client/src/containers/ContainerStatsView.tsx` | The three uncapped metrics carry no meter at all — no bar and no "no measurable maximum" state of one — and each carries its sparkline, plotting the inbound series for Net I/O, the read series for Block I/O and the count for PIDs. | REQ-15 | INT-2 |
| INT-4 | modify | `client/src/containers/ContainerStatsView.tsx` | Net I/O shows its inbound and outbound values, and Block I/O its read and written values, as two separately labelled and visually distinguished readings instead of one `a / b` string. The units, decimals and tone rules of the delivered view are unchanged. | REQ-17 | INT-2 |
| INT-5 | modify | `client/test/unit/container-stats-view.test.tsx`, `client/e2e/container-stats-processes.spec.ts` | The checks that assert five equal tracks and a meter on every tile are rewritten against 2 + 3 and against three tiles carrying no meter, naming `plan-ui-coherence-optimisation/REQ-63` and `REQ-64` as superseded rather than dropping the assertions silently; the marked final point and the two distinguished readings are asserted, and the live-stream and stream-ends-on-leaving behaviours re-asserted unchanged. | REQ-41, REQ-43, REQ-44, REQ-45 | INT-1, INT-3, INT-4 |

**Standing constraints on every intervention above** — REQ-38, REQ-39, REQ-40, REQ-41, REQ-42. They
are closed in the plan's last batch and honoured in this one.

## Human acceptance

### Scenario: the bars are only where a bar can mean something

- REQ → REQ-13, REQ-14, REQ-15
- Given → a running container's detail, open on Stats, with samples arriving
- When → the operator looks at the readings
- Then → CPU and Memory sit on a row of two, each with a bar filled against its own ceiling, and Net
  I/O, Block I/O and PIDs sit on a row of three below them, each with a line of its recent history
  and no bar at all

### Scenario: the current value of a rising counter is findable at a glance

- REQ → REQ-16
- Given → the Stats tab with several samples received
- When → the operator looks at any of the history lines
- Then → the line is drawn over a filled area and its most recent point is marked

### Scenario: in and out are two readings, not one string

- REQ → REQ-17
- Given → a container that has both received and sent traffic
- When → the operator looks at Net I/O and at Block I/O
- Then → each shows two readings, labelled and told apart from one another, instead of two numbers
  separated by a slash
