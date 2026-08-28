---
batch: remaining-checks-reload
feature: The remaining checks reload through the control
closed_req: REQ-30
depends: —
---

# Batch — remaining checks reload

The requirements are in `../requirements.md` and are cited here by id.

`contexts` (five-minute period), `builders` and `build-cache` (thirty seconds) have no daemon event,
so an object created from the CLI while a check is running stays invisible for a whole period. The
human decided on 2026-08-28 that this is the product's behaviour and that it stands; the answer for a
check is the manual refresh control, which is built and certified.

**This batch changes checks only.** No source file, no component spec, no index. Whoever implements
it should end with the same application it started with.

**Its real dependency is in another plan**, so it cannot appear in the `Depends` column, which takes
ids from this plan alone: the control it presses is
`plan-docker_management_app-refresh_cache-manual_refresh`, batch `manual-refresh` (certified), and
the helper it presses it with is `client/e2e/support/refresh-control.ts` —
`refreshThroughTheControl(page)`, built by batch `e2e-reload` of that same plan, which already
converted seven checks this way. Nothing new is written for these: the same helper, used the same
way. No endpoint and no hook is added for the checks.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `client/e2e/contexts-row-geometry.spec.ts` | The fifteen checks that create a context from the CLI press the control through the helper before asserting it is listed. What each check asserts does not change. | REQ-30 | — |
| INT-2 | modify | `client/e2e/list-order.spec.ts` | The contexts check and the builders check do the same; the builders one loses its twenty-five-second wait under a thirty-second period. | REQ-30 | — |
| INT-3 | modify | `client/e2e/truncation-contract.spec.ts` | The contexts check does the same. | REQ-30 | — |
| INT-4 | modify | `client/e2e/layer-build-cache.spec.ts` | The build-cache check does the same, losing its twenty-second wait under a thirty-second period. | REQ-30 | — |

`contexts-row-geometry.spec.ts` is the one to watch: it passes on its own, because nothing has read
the context list yet, and fails whenever an earlier spec has opened the application — the shell reads
the contexts on every page load. Pressing the control removes that order dependence, which is the
rule that a spec must pass on its own **and** in any position of a full pass.

## Human acceptance

### Scenario: The context, builder and build-cache checks pass wherever they run

- REQ → REQ-30
- Given → a full pass in which earlier checks have already opened the application
- When → these checks create their context, builder or build-cache record from the CLI and press the refresh control
- Then → the object is listed, each check asserts what it always asserted, and none of them waits out a period
