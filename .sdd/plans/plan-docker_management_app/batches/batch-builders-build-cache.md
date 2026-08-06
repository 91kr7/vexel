---
batch: 21 · builders-build-cache
feature: F24 — Builders and build cache
closed_req: [REQ-88, REQ-89, REQ-90, REQ-91]
depends: [2, 11]
---

# Batch 21 — Builders and build cache

Reuses the build execution and output surfaces of batch 11, adding buildx builder management and
the build-cache inventory.

Visual reference: `.sdd/analysis/ui-mock/build-and-cache.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Selection-state badge variants ("in use" / "use" action) on the list-card primitive, and a usage-state badge set (shared / in use / reclaimable) for cache records. | REQ-88, REQ-91 | — |
| INT-2 | create | server, build area | buildx builder inventory through the CLI channel: name, driver, endpoint, supported platforms, status and cache size, which builder is in use, plus select-active, create (name, driver, endpoint, platforms) and remove. | REQ-88, REQ-89 | — |
| INT-3 | create | server, build area | Multi-platform build launch on a selected builder (context, Dockerfile, target, platforms, build args, cache from/to, output/push), reusing the build execution and output streaming of batch 11. | REQ-90 | INT-2 |
| INT-4 | create | server, build area | Build-cache inventory (record id, type, size, usage state) with prune, export and import, reporting the space reclaimed or transferred. | REQ-91 | — |
| INT-5 | create | client, data-access layer | Builder queries and mutations, cache inventory queries and prune/export/import mutations, and the build launch with its output stream. | REQ-88, REQ-89, REQ-90, REQ-91 | INT-2, INT-3, INT-4 |
| INT-6 | create | client, build feature area | Builders & cache screen: builder list with driver, endpoint, platforms, status, cache size and the active one switchable; create and remove a builder; build-cache records with usage state and prune/import/export; multi-platform build configuration with live output. | REQ-88, REQ-89, REQ-90, REQ-91 | INT-1, INT-5 |
| INT-7 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the "Builders & cache" placeholder with the real screen. | REQ-88 | INT-6 |
