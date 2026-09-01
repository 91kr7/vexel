---
id: stats-gate-waits-no-longer-scale-with-the-sampling-interval
area: client
severity: medium
cost: correctness
date: 2026-09-01
source: test phase of plan-docker_management_app-timing_scale, while repairing the refetch bound in container-exec-attach.spec.ts
status: open
---

# A budget that claimed to sit below one sampling interval now sits above four

**What** → `containers-stats-gate.spec.ts` declares four waits as multiples of the statistics
sampling interval, in a comment beside each. The suite now runs the product at `VEXEL_TIMING_SCALE=0.2`
(`client/playwright.config.ts`), so the interval is a fifth of what those figures were written
against, and the arithmetic in the comments no longer holds. One of them **stops proving what it
says it proves**:

`PROMPT_MS = 8_000` — "below one sampling interval on purpose — a figure that only appeared after
ten seconds would mean no prompt sample was taken". On the suite's clock the interval is 2 s, so
8 s is four intervals. A figure that arrived from an ordinary periodic sample, with no prompt sample
taken at all, meets this budget comfortably. The check is green and asserts nothing about
promptness.

**Where** → `client/e2e/containers-stats-gate.spec.ts:42` (`PROMPT_MS`), used at lines 141, 225 and
390. Its three neighbours are the same defect one degree milder — they are budgets that have become
generous rather than claims that have become false: `ONE_INTERVAL_MS = 16_000` (line 44, "one
sampling interval and one list poll", now 2 000 + 600 = 2 600 ms), `STALENESS_BOUND_MS = 30_000`
(line 34, "three intervals", now 6 000 ms) and `PAST_STALENESS_MS = 36_000` (line 36), the last two
spent as real `waitForTimeout` sleeps at lines 253, 322 and 417.

**Evidence** → `STATS_SAMPLE_INTERVAL_MS = cadence(10000)`
(`server/src/containers/containers-service.ts:180`); the suite starts the serving process at factor
`0.2`, so the interval it runs at is 2 000 ms — confirmed in the same run by the container list
polling at exactly 600 ms against its shipped 3 000 ms
(`container-exec-attach.spec.ts` trace, ten reads spaced 600 ms apart over six seconds). 8 000 ms is
therefore 4.0 intervals where the comment claims fewer than 1.0. The three sleeps are worth roughly
seventy seconds of wall clock per pass, against the 12–15 s their comments now describe.

**Why it matters** → the check is not red, and the behaviour it names is covered at the service
level, so nothing is unprotected today. What is gone is the reason to believe it: a budget whose
justification is arithmetic that no longer computes is a check that has quietly stopped claiming
anything, and it passes — which is the failure mode that leaves no trace. The other three are the
same fault costing time instead of meaning.

**Direction** → derive the four figures from the configured factor, as the product's own cadences
are derived, rather than restating them by hand: read the factor from `/api/timing-scale` (the
source the browser itself uses — `plan-docker_management_app-timing_scale/REQ-7`) and express each
wait as `shipped × factor`, so `PROMPT_MS` is once again below one interval on any clock and the
sleeps shrink with it. That keeps
`plan-docker_management_app-timing_scale/REQ-18` — no spec writes a scaled figure of its own — since
nothing scaled is written down. The plan's own analysis already sets this aside as a separate
request (`.sdd/analysis/docker_management_app-timing_scale.md`, "Rewriting any spec's own declared
waits is out"), and names the same seventy seconds.
