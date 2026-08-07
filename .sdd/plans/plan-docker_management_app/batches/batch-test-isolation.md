---
batch: 32 · test-isolation
feature: Test-suite isolation (remediation, no product change)
closed_req: []
depends: [10, 31]
---

# Batch 32 — Every test owns its fixtures

Remediation batch, opened after profiling the suite. **No product code changes in this batch.**

## Why

Tests are not isolated: they share one Docker daemon and observe each other's fixtures. Measured
on 2026-08-07:

- **2 tests are globally destructive** — `POST /api/containers/prune`
  (`containers-routes.test.ts:240`) and `POST /api/images/prune` (`images-routes.test.ts:297`).
  They exercise the daemon's real prune, which removes *every* stopped container / dangling image
  on the host. `containers-routes.test.ts:238` documents this in a comment.
- **The 17 `fetchList(url)` call sites turned out NOT to be a problem.** First reading counted them
  as unscoped; inspection shows every one of them already filters to its own fixture
  (`containers.find((c) => c.id === id)`, `images.some((i) => i.tags.includes(tag))`). Nothing to
  restrict there — INT-3 is therefore dropped. Recorded so the wrong diagnosis is not re-derived.
- **1 single `--label` exists across the whole test tree**, so nothing can tell "mine" from
  "someone else's".
- **Helpers are duplicated in 9 of 11 API test files** (`startApp`, `createSleepingContainer`,
  `createLoggingContainer`, `removeContainerQuietly`), each with its own naming and cleanup.

Consequence: parallel runs are flaky, so runs fall back to serial. Measured whole-suite cost,
serial, one file at a time: **489s** (server unit 3s · server API 177s · client unit 13s ·
e2e 296s). The API suite alone is 36% of it.

## Interventions

| ID | Type | Where | What | Depends |
| --- | --- | --- | --- | --- |
| INT-1 | create | `server/test/support/fixtures.ts` | Shared fixture helper: a per-process `RUN_ID`, `createTestContainer(caseName, script)` naming containers `vexel-test-<case>-<RUN_ID>` and stamping `--label vexel.test.run=<RUN_ID>` and `--label vexel.test.case=<case>`, the matching image helper, `removeQuietly`, and `startApp`. One definition, replacing the per-file copies. | — |
| INT-2 | modify | `server/test/api/*.ts` (9 files with local helpers) | Replace the duplicated local helpers with the shared ones. Behaviour of each test is unchanged — this is a move, not a rewrite. | INT-1 |
| INT-3 | ~~modify~~ | — | **Dropped.** The assertions are already scoped to their own fixtures (see "Why"). No work needed. | — |
| INT-4 | modify | `server/package.json`, the two prune tests | The two prune tests are **irreducibly global**: the product's prune endpoint has no filter and REQ-22 requires exactly that behaviour, so no labelling can isolate them. Move them out of the parallel pass into an exclusive one: `test:api` runs everything else in parallel, `test:api:exclusive` runs the prune tests alone afterwards, and `test:api:all` chains the two. Their assertions stay as they are — they must keep exercising the real prune semantics. | INT-1 |
| INT-5 | create | `server/test/support/fixtures.ts` (sweep) + the npm scripts | Orphan sweep before and after a run: `docker rm -f $(docker ps -aq --filter label=vexel.test.run)` and the image equivalent, so fixtures left behind by a crashed run do not pollute later ones. Must never touch objects without the label. | INT-1 |
| INT-6 | modify | `client/e2e/*.spec.ts` | Same treatment for the Playwright fixtures: one shared helper, the `vexel-test-*` prefix and the ownership label, assertions scoped to own fixtures, and the destructive specs (containers prune, images prune dangling) marked so they do not run concurrently with the rest. | INT-1 |

## Constraints

- **No file under `server/src/` or `client/src/` may be modified.** If a test cannot be isolated
  without a product change, stop and report it instead of changing the product.
- Every test keeps asserting exactly what it asserts today. This batch changes *which objects* a
  test looks at, never *what it verifies*. No assertion may be weakened or deleted to make a test
  pass.
- The two flaky failures known before this batch are out of scope and must stay visible:
  `images.spec.ts:449` (pull from Docker Hub, network-dependent) and `local-persistence.spec.ts:18`.
  Do not paper over them.

## Outcome (2026-08-07)

Delivered:

- Shared fixtures (`server/test/support/fixtures.ts`, `client/e2e/support/fixtures.ts`) stamping
  `vexel.test.run` / `vexel.test.case` on every container, network and registry a test creates.
- The two prune tests moved out of the parallel passes: `server/test/exclusive/prune-routes.test.ts`
  and `client/e2e/exclusive/prune.spec.ts`, the latter in its own Playwright project that depends on
  the parallel one and runs serially within itself.
- Orphan sweep wired into `test:api` and `test:exclusive`, scoped to the ownership label.
- The e2e suite pinned to one worker, with the measurement that justifies it recorded in
  `client/playwright.config.ts`.

Measured:

- **Server API suite: three consecutive runs, zero failures** (248s, 248s, 257s). Before the batch
  the same suite failed intermittently and was being rerun serially to work around it. The exclusive
  prune pass adds 10s.
- **Wall-clock did not improve** — the API suite measured 167–184s before and 248–257s after, within
  a spread that also covered 205s and 220s on the unchanged code. The batch bought stability, not
  speed; the earlier estimate of "~60s" in this file was wrong and is left here as the record.

Not achieved — carried forward:

- **The full e2e run is not green.** Four specs fail in a whole-suite serial run and pass when run
  alone (`connectivity` 4/4, `container-create-run` 8/8, `images` 14/14). The failures are budget
  overruns, not cross-spec destruction: `container-create-run.spec.ts:97` exceeds a 60s budget in a
  full run against ~30s alone. The evidence points to load accumulated over a long run rather than
  to interference; the cause is not established.
- **`local-persistence.spec.ts:18`** fails alone as well — a defect of its own, untouched here.

## Defect found in the product (not fixed here — testers do not touch source)

`server/src/container-logs-service.ts`, `toUnixSeconds`: `Math.floor(parsed / 1000)` drops the
sub-second part of a `since`/`until` bound, so the instant slides back to the start of its second and
the daemon returns entries the caller asked to exclude. Observed: a bound set 104ms after a line was
printed still returned that line; `docker logs --since` with the same instant excludes it. REQ-30 and
`container-logs-endpoint.md` (which declares the ISO-8601 form) are the contracts concerned. Narrow
in effect — bounds more than a second away from the surrounding entries behave correctly.

## Human acceptance

The API suite runs in parallel without flaking across three consecutive runs; the whole suite is
measurably faster than the 489s baseline and the new figure is reported; running the suite while
the operator has their own stopped containers and dangling images on the daemon leaves those
objects untouched and does not fail any test; killing a run mid-way and re-running it passes,
the orphan sweep having cleaned the leftovers; `git status` shows no file under `server/src/` or
`client/src/` modified.
