---
request_slug: docker_management_app-timing_scale
date: 2026-09-01
type: feat
size: ordinary
reference: .sdd/analysis/docker_management_app.md
---

## Request

> The e2e suite spends most of its time waiting for cadences the product imposes on itself: the
> list polls in the client (3s, 5s, 15s), the event grouping window in the server (750ms), the
> stats sampling interval (10s) and the per-kind demand expiry (60s).
>
> Measured: with those cadences lowered, a whole pass fell from about fifty minutes to 23.1
> minutes, 648 tests out of 648 green. But those values cannot ship — the sampling interval in
> particular has a requirement behind it (traffic reaching the operator's daemon) and is asserted
> at `10_000` by `server/test/unit/containers-stats-sampling.test.ts`.
>
> Introduce one factor, `VEXEL_TIMING_SCALE`, that multiplies every cadence. The operator's process
> does not set it and gets `1` — the shipped product to the millisecond. The test suites set it low
> and get the same product on its own clock, faster.

## Reference

Evolution of [`docker_management_app.md`](docker_management_app.md). It changes no behaviour the
operator can observe: at the default the product is byte-for-byte what it is today.

## Summary

One multiplier, read once per process, applied to every cadence and to no tolerance.

**Why one factor and not a knob per constant.** These figures are bound to each other by ratios.
`DEMAND_EXPIRY_MS` is documented as being longer than the slowest interval a client polls at; the
staleness bound of the stats gate is three sampling intervals; the wait a change coverage costs is
counted in grouping windows. A single multiplier keeps every one of those ratios for free. Separate
knobs would let two of them drift apart and break an invariant nobody would notice until a check
failed for a reason unrelated to the product.

## The distinction the work rests on

A timeout is one of two things, and only one of them may be scaled.

- A **cadence** is a rhythm the product chooses for itself: how often it polls, how long it groups
  events before reading again, how often it samples. Nothing outside the process has an opinion
  about it, so running it faster is the same behaviour on a shorter clock.
- A **tolerance** is a bet about how slow the outside world may be: how long a registry may take to
  answer, how long a lock may be held before its owner is presumed dead, how long resolving the
  active context may take, how long to back off before reconnecting. A disk does not get faster
  because a test is running. Scaling one of these does not make the product quicker — it makes it
  **wrong under load**, and wrong in a way no check will catch, because the failure needs a slow
  machine and a green suite says nothing about it.

`LOCK_STALE_MS` is the sharpest case: scaled down, a live writer has its lock stolen, and what
breaks is the operator's persisted state.

The line is measured, not preferred. A pass that scaled everything — tolerances, input debounces and
render flushes included — broke. A pass that scaled the cadences alone went green over 648 tests.

## How the value reaches the client

The browser has no environment to read, so the process that has one hands the figure over: an
endpoint answering the factor, read by the client at bootstrap.

That keeps **one bundle**. The interface the suite exercises is byte for byte the one an operator
runs, and only the configuration of the process serving it differs — as it already does for `PORT`
and `VEXEL_DATA_DIR`. Inlining the factor at build time (`import.meta.env.VITE_…`) would have been
less work and would have left the e2e suite verifying an artefact that is not the shipped one, which
CLAUDE.md refuses.

**One consequence is not obvious and decides the shape of the client work.** A cadence written as a
module-level constant is evaluated when the module is imported. If the entry point imports the
application graph statically, every one of those constants is already evaluated before any request
can answer, and the factor would always arrive too late. So the entry has to read the value first
and reach the graph second.

A factor that cannot be read — an unreachable or slow server — leaves the client at `1`. The product
running its own rhythm is the right answer to a server that is not answering.

## Requirements

Behaviour that must be true when this is done.

- With the variable unset, every cadence in both workspaces holds exactly the value it holds today,
  and the unit tests that pin those values stay green **without being edited**.
- One factor governs every cadence; adding a cadence later has one obvious place to declare it.
- No tolerance is scaled, and each one says at its declaration that it is a tolerance and why it is
  absolute.
- A factor outside the accepted range (0.1 to 10) is refused with an error naming the variable and
  the value, never taken silently as `1`: a suite that meant to run at a fifth and is running at
  full speed reports a slowness nobody can explain, and a typo is exactly how that happens.
- A scaled cadence never rounds below one millisecond.
- The client obtains the factor from the server at runtime, and the bundle is identical whatever the
  factor.
- The client renders, at factor `1`, when the value cannot be obtained.
- The test suites configure the factor for the process they start; no spec writes a scaled figure of
  its own.

## Scope

**In.** The scaling factor, its single declaration per workspace, the endpoint that carries it to
the browser, the client bootstrap that reads it, and the fourteen cadences censused below. The test
suites setting the factor for the processes they start.

Cadences to scale — server: `EVENT_GROUPING_WINDOW_MS` (750) and `DEMAND_EXPIRY_MS` (60000) in
`refresh-cache/refresh-cache.ts`; `STATS_SAMPLE_INTERVAL_MS` (10000) in
`containers/containers-service.ts`. Client: `POLL_INTERVAL_MS` in `use-containers`, `use-images`,
`use-volumes`, `use-networks`, `use-compose-projects` (3000), `use-builders`, `use-build-cache`
(5000), `use-contexts`, `use-plugins`, `use-registries` (15000), and
`shell/services/ConnectionStatusService.tsx` (5000).

**Out.** Tolerances, which stay absolute: `REQUEST_TIMEOUT_MS`, `LOCK_STALE_MS`,
`LOCK_WAIT_TIMEOUT_MS`, `LOCK_POLL_MS`, `ENDPOINT_RESOLUTION_TIMEOUT_MS`, `INITIAL_BACKOFF_MS`,
`MAX_BACKOFF_MS`, and the client's `RECONNECT_BASE_MS` / `RECONNECT_MAX_MS`.

Also out, to be judged separately: the input debounces (`DEBOUNCE_MS`), the render flushes
(`FLUSH_INTERVAL_MS`), the coalescing windows (`EVENT_COALESCE_MS`) and `AUTO_CLOSE_MS`. They are
cadences by the definition above, but the pass that scaled them broke, and they contributed nothing
to the measured saving. They are a separate question, not a silent omission.

Rewriting any spec's own declared waits is out. The four hand-written sleeps in
`containers-stats-gate.spec.ts` are counted in staleness bounds and will not shrink on their own;
deriving them from the configured factor is worth roughly seventy seconds and is its own request.

## Risks

- **A cadence misfiled as a tolerance, or the reverse.** The first costs speed nobody notices; the
  second ships a product that is wrong on a loaded machine and green in every suite. The census
  above is the mitigation: the list is closed, and each exclusion carries its reason at the
  declaration.
- **The client bootstrap gains a round trip before first paint.** On localhost this is a couple of
  milliseconds, and the application can do nothing without the server anyway — but a server that
  hangs must not leave a blank page, which is why the failure path renders at `1`.
