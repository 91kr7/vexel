---
slug: docker_management_app-timing_scale
date: 2026-09-01
spec: .sdd/analysis/docker_management_app-timing_scale.md
status: validated
---

# Batches — timing scale

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
|-------|---------|------------|---------|--------|------------------|
| [batch-timing-scale](batches/batch-timing-scale.md) | Timing scale — one factor governs every cadence of the product (foundation batch) | REQ-1 … REQ-21 (all) | — | certified | The product keeps its own rhythm when nothing is set |

One batch, and it is declared a **foundation batch**. The plan's four requirement groups are one
capability seen at the two processes that hold cadences, plus the guard rails around it. Splitting
them into a server batch and a client batch would be splitting by layer, and neither half stands on
its own: a product whose server clock and browser clock disagree is not a state to commit.

## Assumptions and decisions

- **The suites run at factor `0.2`**, chosen by the human, for the Playwright web server and for the
  daemon-backed server passes alike. Client polls become 600 / 1000 / 3000 ms, the grouping window
  150 ms, the stats sample 2000 ms, the demand expiry 12000 ms — so the documented invariant holds
  for free: the demand expiry (12000) still outlives the slowest poll (3000). The human took this
  over the more conservative third that the measured green run used, having been told 0.2 goes
  beyond what the measurement proved. It is affordable because the value is now a **runtime**
  decision: loosening it is one character in `client/playwright.config.ts` and one in
  `server/package.json`, with nothing rebuilt and no source touched. That is a large part of why the
  work is worth doing.
- **`test:unit` stays unset.** It is the pass that pins the shipped cadence values, and
  `server/test/unit/containers-stats-sampling.test.ts:89` asserts `STATS_SAMPLE_INTERVAL_MS` is
  exactly `10_000`. That assertion is the strongest single check that the default is untouched, and
  it must stay green without being edited (REQ-5, REQ-20).
- **Refusal means the server does not start.** The server's timing module throws when it reads a bad
  value, and it throws at import. That is deliberate: the three server cadences are module-level
  constants, so they are computed at import too, and a check running later would always run after
  the value had already been used. The thrown message names `VEXEL_TIMING_SCALE` and the rejected
  value (REQ-2).
- **The client never refuses.** It falls back to `1` and renders (REQ-9). A server that is not
  answering must not produce a blank page.
- **The client entry reads first and imports second.** `client/src/main.tsx` obtains the factor and
  then reaches the application through a dynamic import. A static import would evaluate every
  module-level cadence before the answer could arrive. Written with top-level await; the implementer
  should confirm the client build target accepts it, and may use a promise chain instead — what is
  binding is that no module holding a cadence is statically imported by the entry.
- **A cadence added later stays declarative.** It is written as `cadence(750)`, not as a bare number
  and not as a function called at use time. Turning every cadence into a call at the point of use
  would have removed the ordering constraint above, and was rejected: it rewrites fourteen call
  sites and loses the form in which these figures are readable.
- **Six client declaration sites, not two.** The spec names `RECONNECT_BASE_MS` and
  `RECONNECT_MAX_MS` as two tolerances. They are declared in three files —
  `use-compose-logs.ts`, `use-container-logs.ts`, `use-container-stats.ts` — so the annotation of
  REQ-17 is written at six places.
- **A new tolerance is introduced by this batch**: the bounded wait on the client's read of the
  factor, without which a hanging server would hang the bootstrap instead of falling back to `1`.
  It is absolute, and it carries the same comment as the other tolerances (INT-8). REQ-21 names it,
  in Feature 3 with the rest of the tolerance census: a tolerance no requirement names is the drift
  that feature exists to prevent.
- **The endpoint is its own address**, `GET /api/timing-scale`, and not a field of the connectivity
  status. The status reader is part of the application module graph, and the factor must be in hand
  before that graph is evaluated.
- **The factor lives in a small area of its own in each workspace**, not in the server bootstrap.
  `refresh-cache` and `containers` consume it; putting it in `server-app` would make them depend on
  the module that composes them.

## Departures from the spec

None. The spec does not name the value the suites use, so choosing `0.2` contradicts nothing in it.

## Out of scope, recorded rather than dropped

The spec puts four groups aside "to be judged separately": the input debounces (`DEBOUNCE_MS`), the
render flushes (`FLUSH_INTERVAL_MS`), the coalescing windows (`EVENT_COALESCE_MS`) and
`AUTO_CLOSE_MS`; and the four hand-written sleeps in `client/e2e/containers-stats-gate.spec.ts`,
worth about seventy seconds. They belong in `.sdd/tech-debt/`, one entry each, not in this batch.

## Risks

- **A daemon-backed check that asserts "nothing has happened yet".** The api and exclusive passes now
  run five times faster on every cadence. A check that waits a fixed absolute time and then asserts
  an event has *not* been grouped, or a value has *not* been refreshed, was outrunning a cadence that
  is now five times quicker, and can start failing. Checks that wait *for* a cadence are unaffected —
  they now wait longer than they need to. This is the one place where a green suite today may go red
  for a reason unrelated to the product, and it is where the first failed pass should be read.
- **A cadence misfiled as a tolerance, or the reverse.** The census in the spec is closed, and every
  exclusion carries its reason at its own declaration (INT-6, INT-11). That is the mitigation.

## Note for development

This batch changes what every test pass waits for, so it will call for a full pass. For this cycle
the human runs it: an agent reports that a full pass is due and stops. A decision of this cycle, not
a standing rule — it was briefly written into the knowledge base and withdrawn, having been scoped
to one session rather than to the project.

## Coverage check

Every requirement is served by at least one intervention:

| REQ | Interventions |
|-----|---------------|
| REQ-1 | INT-1, INT-14 |
| REQ-2 | INT-1, INT-14 |
| REQ-3 | INT-1, INT-7, INT-14 |
| REQ-4 | INT-4, INT-5 |
| REQ-5 | INT-4, INT-5 |
| REQ-6 | INT-1 |
| REQ-7 | INT-2, INT-3, INT-15 |
| REQ-8 | INT-8, INT-9, INT-17 |
| REQ-9 | INT-7, INT-8, INT-16 |
| REQ-10 | INT-10, INT-17 |
| REQ-11 | INT-10 |
| REQ-12 | INT-7, INT-16 |
| REQ-13 | INT-9, INT-18 |
| REQ-14 | INT-6 |
| REQ-15 | INT-6 |
| REQ-16 | INT-11 |
| REQ-17 | INT-11 |
| REQ-18 | INT-12, INT-17 |
| REQ-19 | INT-13 |
| REQ-20 | INT-13 |
| REQ-21 | INT-8 |

Every intervention serves at least one requirement: INT-1 to INT-18 all appear in the table above.
There is no enabling intervention.

Every requirement closes in this batch, since the plan has only one.
