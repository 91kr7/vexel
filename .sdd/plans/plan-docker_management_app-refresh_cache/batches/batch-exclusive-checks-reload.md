---
batch: exclusive-checks-reload
feature: The exclusive checks reload through the control
closed_req: REQ-64, REQ-65, REQ-66, REQ-67
depends: —
---

# Batch — the exclusive checks reload through the control

The requirements are in `../requirements.md` and are cited here by id.

`contexts` (five-minute period), `builders` and `build-cache` (thirty seconds) have no daemon event, so
an object created from the command line while a check is running stays invisible for a whole period. The
human decided on 2026-08-28 that this is the product's behaviour and that it stands; the answer for a
check is the manual refresh control. **This batch decides nothing new: it applies that decision where the
census of 2026-08-28 never looked, and does the census properly this time.**

**Its real dependency is in another plan**, so it cannot appear in the `Depends` column, which takes ids
from this plan alone: the control is `plan-docker_management_app-refresh_cache-manual_refresh`, batch
`manual-refresh` (certified), and the helper is `client/e2e/support/refresh-control.ts` —
`refreshThroughTheControl(page)`, used here exactly as the four files of `remaining-checks-reload` use it.
**No new helper, no new endpoint, no lengthened wait.**

## The census, over the whole tree

Every list kind with no daemon event, from the registrations in `server/src/`: `contexts` (300 s),
`builders`, `build-cache`, `connection-status` and `volume-sizes` (the last two are not lists of objects a
command line creates). So the sites to find are those that create a **context**, a **builder** or a
**build-cache record** from the command line and then wait for it on screen.

| File | Creates | Presses |
|------|---------|---------|
| `contexts.spec.ts` | contexts (4 checks) | yes |
| `contexts-row-geometry.spec.ts` | contexts (15 checks) | yes |
| `truncation-contract.spec.ts` | context | yes |
| `list-order.spec.ts` | contexts, builders | yes |
| `builders.spec.ts` | builders, a build (4 checks) | yes |
| `layer-build-cache.spec.ts` | build-cache record | yes |
| `manual-refresh.spec.ts` | context | by design — it asserts the **absence** first; it is the control's own check and is not touched |
| `exclusive/build-cache-prune.spec.ts` | builder, build-cache records | **no — this batch** |

The other four files of `exclusive/` (`prune`, `system-prune`, `volumes-prune`, `raw-console-destructive`)
create containers, volumes and images only, all of which the daemon announces. The `docker build` calls in
eight further specs make **images**, and those specs assert on the image list, never on a cache record.
**One file to repair, and no second one.**

## What the census also found, and where it belongs

`buildx du` reports the **active** builder's records. So selecting a builder changes what the build-cache
inventory answers for — and `useBuilder` marks only the builder inventory changed. The screen, and this
check's own prune guard, are answered with the previous builder's records for up to thirty seconds. That
is a gap in REQ-13, in the product, and INT-2 closes it there: pressing the control a second time in the
check would make it green over a screen that names the wrong builder's cache, which is what
[[a-check-is-never-weakened-to-pass]] forbids. It touches no period and no schedule.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `client/e2e/exclusive/build-cache-prune.spec.ts` | After `openApp(page, 'builders-cache')` and before the builder row is asserted, press the control through `refreshThroughTheControl`. What the check asserts does not change, and no budget in it moves. | REQ-64, REQ-66, REQ-67 | — |
| INT-2 | modify | `server/src/builders/builders-service.ts` | `useBuilder` marks the build-cache inventory changed as well as the builder inventory, with the reason on the spot: `buildx du` answers for the active builder. | REQ-65 | — |
| INT-3 | modify | `.sdd/modules/builders/specs/builders-service.md`, `.sdd/modules/builders/specs/build-cache-service.md`, `.sdd/modules/builders/index.md` | Carry INT-2: select-active marks both inventories, and the build-cache inventory states that a builder selection is what marks it due besides its own prune. | REQ-65 | INT-2 |
| INT-4 | modify | `client/e2e/exclusive/build-cache-prune.spec.ts` | The existing prune guard becomes the check for REQ-65, with the reason written beside it: the records the application reports after the selection are the fixture builder's own. No assertion is added or relaxed. | REQ-65, REQ-67 | INT-2 |
| INT-5 | modify | `.sdd/tech-debt/entries/build-cache-prune-guard-blocked-by-run-fixtures.md` | Settle it against the run: if the guard now passes, the entry is removed per [[technical-debt-goes-in-the-tech-debt-register]]; if it still refuses, its diagnosis is corrected with what the run showed. | REQ-65 | INT-2, INT-4 |
| INT-6 | modify | `client/e2e/support/refresh-control.ts` | Its doc comment names build-cache records as the third eventless list beside contexts and builders, and states that the rule covers `client/e2e/exclusive/` too. | REQ-66 | — |

## How it is reproduced, and how it is run

**The defect needs a warm server and nothing else.** It appears when the builder inventory is already
being held, so the CLI-created builder waits out a whole period; a freshly started server holds nothing
and reads fresh on the first request, which is why the file passes on its own. Two commands, under a
minute, no pass of any length:

1. `npm run serve` — one long-lived process.
2. `curl -s localhost:3000/api/builders` — the server now holds the inventory and refreshes it.
3. `docker buildx create --name warm-check --driver docker-container`
4. `curl -s localhost:3000/api/builders` again, within thirty seconds → `warm-check` is absent. That is
   the whole failure. Then `docker buildx rm warm-check`.

**The file is run alone**, and `--no-deps` is not optional: without it Playwright runs the entire suite as
a prerequisite ([[exclusive-project-needs-no-deps]]).

```
npm run test:e2e -w client -- --project=exclusive --no-deps client/e2e/exclusive/build-cache-prune.spec.ts --repeat-each=2
```

`--repeat-each=2` is the only form in which this file says anything: one server process serves the run, so
the first repetition warms it and the second is the one that fails on the product as it stands. A single
green run proves nothing here.

## Human acceptance

### Scenario: The build-cache prune check passes on a server that is already holding its lists

- REQ → REQ-64, REQ-66, REQ-67
- Given → the application has been running long enough to be holding the builder inventory
- When → the check creates its builder from the command line, opens Builders & cache and presses the interface's Refresh control
- Then → the builder is listed at once, the check asserts everything it always asserted, and it waits out no period

### Scenario: The cache shown after selecting a builder is that builder's own

- REQ → REQ-65
- Given → the Builders & cache screen, with a builder other than the one just created in use
- When → the operator presses `Use` on the new builder
- Then → the build cache listed under it is the newly selected builder's, not the previous one's, without the operator refreshing or waiting
