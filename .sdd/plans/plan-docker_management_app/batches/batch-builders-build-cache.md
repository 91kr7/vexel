---
batch: 21 · builders-build-cache
feature: F24 — Builders and build cache
closed_req: [REQ-88, REQ-89, REQ-91]
depends: [2]
---

# Batch 21 — Builders and build cache

buildx builder management and the build-cache inventory.

**This screen observes builders and their cache; it does not run builds.** REQ-90 (launching a
multi-platform build on the selected builder) was withdrawn on 2026-08-07 together with F12 — see
"Departures from the spec" in `batches.md`. With it went the batch's dependency on batch 11, which
existed only to reuse that batch's build execution and output streaming. Do not add a build-launch
affordance to this screen.

The cache half stands on its own merit regardless: a build cache grows whenever the operator builds
from a terminal, and `docker system prune` does not reclaim a `docker-container` builder's cache —
only `docker buildx prune` does. Surfacing and reclaiming it is a genuine contribution.

Visual reference: `.sdd/analysis/ui-mock/builders_cache.png` — **ignore the build configuration rows
it shows**; they belong to the withdrawn REQ-90.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Selection-state badge variants ("in use" / "use" action) on the list-card primitive, and a usage-state badge set (shared / in use / reclaimable) for cache records. | REQ-88, REQ-91 | — |
| INT-2 | create | server, build area | buildx builder inventory through the CLI channel: name, driver, endpoint, supported platforms, status and cache size, which builder is in use, plus select-active, create (name, driver, endpoint, platforms) and remove. | REQ-88, REQ-89 | — |
| ~~INT-3~~ | — | — | *Withdrawn 2026-08-07 with REQ-90 (multi-platform build launch). Number retired.* | — | — |
| INT-4 | create | server, build area | Build-cache inventory (record id, type, size, usage state) with prune, export and import, reporting the space reclaimed or transferred. | REQ-91 | — |
| INT-5 | create | client, data-access layer | Builder queries and mutations, and cache inventory queries with prune/export/import mutations. | REQ-88, REQ-89, REQ-91 | INT-2, INT-4 |
| INT-6 | create | client, build feature area | Builders & cache screen: builder list with driver, endpoint, platforms, status, cache size and the active one switchable; create and remove a builder; build-cache records with usage state and prune/import/export. | REQ-88, REQ-89, REQ-91 | INT-1, INT-5 |
| INT-7 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the "Builders & cache" placeholder with the real screen. | REQ-88 | INT-6 |
