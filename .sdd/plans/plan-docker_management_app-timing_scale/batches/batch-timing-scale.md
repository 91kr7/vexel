---
batch: batch-timing-scale
feature: Timing scale — one factor governs every cadence of the product (foundation batch)
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21]
depends: []
---

# Batch — Timing scale

One factor, `VEXEL_TIMING_SCALE`, multiplies every cadence in both processes. It multiplies no
tolerance. The operator's process does not set it and gets `1`, so the shipped product keeps every
value it holds today.

This is a **foundation batch**, and it is one batch on purpose. The four requirement groups are not
four features: they are one capability seen at the two processes that hold cadences, plus the guard
rails that keep it honest. A batch that scaled the server alone would leave the browser polling at
full speed, so the two clocks of one product would disagree. That is not a state to ship or commit.

## What this batch builds

- **Server timing scale** — a new server area. It reads `VEXEL_TIMING_SCALE` once, holds the factor
  for the whole process, and exposes the `cadence(ms)` helper every server cadence is written
  through. This is the single place a server cadence added later is declared from.
- **Timing-scale endpoint** — in the same area. `GET /api/timing-scale` answers the factor this
  process is using, because the browser has no environment to read.
- **Client timing scale** — a new client area. It holds the factor the entry point obtained, exposes
  the same `cadence(ms)` helper, and answers `1` until it is told otherwise. This is the single
  place a client cadence added later is declared from.

Two declarations, one per workspace, because these are two processes. Neither can read the other's
memory, and the client's copy arrives over HTTP.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | create | server, a new timing area of its own | Read `VEXEL_TIMING_SCALE` once, at import. Use `1` when it is unset or empty; throw when it is not a number or is outside 0.1 to 10, with a message naming the variable and the rejected value. Export `cadence(ms)`, which multiplies by the factor and never returns less than 1. | REQ-1, REQ-2, REQ-3, REQ-6 | — |
| INT-2 | create | server, the same timing area | An endpoint answering the factor this process uses, at `GET /api/timing-scale`. It reads nothing from the daemon and answers before any Docker work. | REQ-7 | INT-1 |
| INT-3 | modify | `server/src/index.ts` | Mount the timing-scale router with the other `/api/*` routers, before the API's JSON 404. | REQ-7 | INT-2 |
| INT-4 | modify | `server/src/refresh-cache/refresh-cache.ts` (lines 8 and 10) | Pass `EVENT_GROUPING_WINDOW_MS` (750) and `DEMAND_EXPIRY_MS` (60000) through `cadence()`. The declared figures stay written where they are. | REQ-4, REQ-5 | INT-1 |
| INT-5 | modify | `server/src/containers/containers-service.ts` (line 179) | Pass `STATS_SAMPLE_INTERVAL_MS` (10000) through `cadence()`. The staleness bound stays three sampling intervals, so it scales with it and no second edit is needed. | REQ-4, REQ-5 | INT-1 |
| INT-6 | modify | the seven server tolerance declarations: `registries/registry-catalog-service.ts:18`, `events/event-stream-service.ts:23-24`, `index.ts:77`, `persistence/local-store.ts:79-81` | Change no value. Add one comment at each declaration saying it is a tolerance and why scaling it would be wrong. | REQ-14, REQ-15 | — |
| INT-7 | create | client, a new timing area of its own | Hold the factor for the running page: `1` until set, a setter the entry point calls once, and `cadence(ms)` multiplying by it and never returning less than 1. | REQ-3, REQ-9, REQ-12 | — |
| INT-8 | create | client, the same timing area | Read the factor from the server's endpoint at bootstrap, under a bounded wait. A refusal, a failure or a wait that runs out gives `1`. The bounded wait is a tolerance: it is not multiplied by the factor, and it carries the comment INT-6 and INT-11 write. | REQ-8, REQ-9, REQ-21 | INT-7 |
| INT-9 | modify | `client/src/main.tsx` | Obtain the factor, set it, and only then reach the application through a dynamic import. No module holding a cadence may be statically imported here, or its constant is already evaluated. | REQ-8, REQ-13 | INT-8 |
| INT-10 | modify | the ten polling hooks under `client/src/data/` (`use-containers`, `use-images`, `use-volumes`, `use-networks`, `use-compose-projects`, `use-builders`, `use-build-cache`, `use-contexts`, `use-plugins`, `use-registries`) and `client/src/shell/services/ConnectionStatusService.tsx` | Pass each `POLL_INTERVAL_MS` through `cadence()`. The declared figures (3000, 5000, 15000) stay written where they are. | REQ-10, REQ-11 | INT-7 |
| INT-11 | modify | the six client reconnect declarations, two in each of `data/use-compose-logs.ts`, `data/use-container-logs.ts`, `data/use-container-stats.ts` | Change no value. Add one comment at each declaration saying it is a tolerance and why scaling it would be wrong. | REQ-16, REQ-17 | — |
| INT-12 | modify | `client/playwright.config.ts`, the `webServer.env` block (line 99) | Add `VEXEL_TIMING_SCALE: '0.2'` beside `PORT`, `VEXEL_DATA_DIR` and `VEXEL_DOCKER_LOG`. One line of the same kind as the three already there. | REQ-18 | — |
| INT-13 | modify | `server/package.json`, the `test:api` and `test:exclusive` scripts | Set `VEXEL_TIMING_SCALE=0.2` inline, beside the `VEXEL_DOCKER_LOG` and `VEXEL_DATA_DIR` those scripts already set. Leave `test:unit` unset. | REQ-19, REQ-20 | — |
| INT-14 | create | server test tree, unit pass | Check the factor itself: `1` when unset and when empty, the multiplication, the one-millisecond floor, and the refusal naming variable and value for a non-number, for a value below 0.1 and for one above 10. | REQ-1, REQ-2, REQ-3 | INT-1 |
| INT-15 | create | server test tree, api pass | Check that the endpoint answers the factor the process was started with. | REQ-7 | INT-3 |
| INT-16 | create | client test tree, unit pass | Check the client factor: `1` before it is set, the multiplication, the floor, and `1` when the read fails or does not answer in time. | REQ-9, REQ-12 | INT-8 |
| INT-17 | create | client e2e | Check that the browser runs on the configured clock: with the suite at 0.2, a change made outside the interface appears in a list well inside the shipped three-second interval. | REQ-8, REQ-10, REQ-18 | INT-9 |
| INT-18 | create | client test tree, unit pass | Check that the client sources never name `VEXEL_TIMING_SCALE` and never read it from `import.meta.env`, so the factor cannot enter the bundle at build time. | REQ-13 | INT-7 |

## Human acceptance

### Scenario: the product keeps its own rhythm when nothing is set

- REQ → REQ-1, REQ-4, REQ-5, REQ-10, REQ-11
- Given → the application started with `npm start`, with `VEXEL_TIMING_SCALE` not set
- When → the operator opens the Containers screen and stops one of the listed containers from a terminal
- Then → the row shows the new state after about three seconds, exactly as it does today

### Scenario: a full pass runs on a faster clock

- REQ → REQ-8, REQ-10, REQ-18, REQ-19
- Given → the suites configured at factor 0.2
- When → the human runs a full e2e pass and a full server pass
- Then → the same tests are green and both passes finish markedly sooner than today

### Scenario: a typo in the factor stops the server and says which one

- REQ → REQ-2
- Given → nothing running
- When → the operator starts the server with `VEXEL_TIMING_SCALE=02`
- Then → the server does not start, and the reported error names `VEXEL_TIMING_SCALE` and the value `02`

### Scenario: the smallest accepted factor still leaves a working application

- REQ → REQ-3
- Given → the server started with `VEXEL_TIMING_SCALE=0.1`
- When → the operator uses the interface for a minute
- Then → every screen keeps updating, and nothing polls in a tight loop

### Scenario: the interface opens even when the factor cannot be obtained

- REQ → REQ-7, REQ-9, REQ-21
- Given → a server that serves the page and then never answers the factor, leaving the request open
- When → the operator opens the application
- Then → the application renders after a short, fixed wait and polls at its shipped rhythm, and the page is never blank

### Scenario: one bundle, whatever the clock

- REQ → REQ-13
- Given → the same source tree
- When → the human builds the client twice, once with `VEXEL_TIMING_SCALE=0.2` set and once without
- Then → the files produced under `client/dist/assets` are identical

### Scenario: every tolerance says why it is absolute

- REQ → REQ-14, REQ-15, REQ-16, REQ-17, REQ-21
- Given → the branch of this batch
- When → the human opens the nine tolerance declarations named in the spec (seven in the server, two client names written at six places) and the one this batch adds, the wait on the client's read of the factor
- Then → every value is the one it holds today, the new one is not multiplied by the factor, and each declaration carries one comment saying it is a tolerance and why scaling it would be wrong

### Scenario: a new cadence has one place to be declared from

- REQ → REQ-6, REQ-12
- Given → the branch of this batch
- When → the human looks for where a cadence is declared in each workspace
- Then → there is one such place per workspace, and every scaled cadence in that workspace goes through its helper

### Scenario: the unit pass still measures the shipped values

- REQ → REQ-5, REQ-20
- Given → `test:unit` with no factor set
- When → the human runs `npm run test:unit -w server`
- Then → the test asserting the sampling interval is 10000 passes, and its file has not been edited
