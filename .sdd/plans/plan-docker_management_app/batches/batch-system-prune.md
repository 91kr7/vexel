---
batch: 24 · system-prune
feature: F26 — System disk usage and prune
closed_req: [REQ-95, REQ-96, REQ-97]
depends: [2, 9, 18, 19, 21]
---

# Batch 24 — System disk usage and prune

The most destructive screen of the application: it reuses the confirmation mechanism of batch 1 and
adds the scope selection and the shared-daemon warning.

Visual reference: `.sdd/analysis/ui-mock/system-and-prune.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Reclaim-row primitive (category, description, size, destructive action) and a checkbox group usable inside the confirmation dialog for scope selection, plus a result summary block. | REQ-95, REQ-96 | — |
| INT-2 | create | server, system area | Disk-usage breakdown by stopped containers, dangling images, unused volumes, unused networks and build cache, each with its size and what it contains. | REQ-95 | — |
| INT-3 | create | server, system area | Per-category prune and system-wide prune with a selectable scope, returning what was removed and the space actually reclaimed. | REQ-96 | INT-2 |
| INT-4 | create | client, data-access layer | Disk-usage query and prune mutations, with refresh of the breakdown and of the affected lists after a prune. | REQ-95, REQ-96 | INT-2, INT-3 |
| INT-5 | create | client, system feature area | System & prune screen: the daemon-information panel alongside the reclaimable-space breakdown, per-category prune and scoped system prune, each confirming with the scope, stating that the daemon is shared with other tools, and reporting the reclaimed space. | REQ-95, REQ-96, REQ-97 | INT-1, INT-4 |
| INT-6 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the "System & prune" placeholder with the real screen. | REQ-95 | INT-5 |
