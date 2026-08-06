---
batch: 18 · volumes
feature: F19 — Volumes
closed_req: [REQ-70, REQ-71]
depends: [1, 2]
---

# Batch 18 — Volumes

Visual reference: the left panel of `.sdd/analysis/ui-mock/volume-networks.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Two-panel screen layout (side-by-side panels with their own header and actions) and a list row with title, monospace secondary lines and a trailing size value. | REQ-70 | — |
| INT-2 | create | server, volumes area | Volume listing with name, driver, mountpoint, size and the containers mounting each one (unattached ones identifiable), plus create (name, driver, driver options, labels), inspect and remove, and prune of unused volumes with the space reclaimed. | REQ-70, REQ-71 | — |
| INT-3 | create | client, data-access layer | Volume queries and mutations, re-read on volume-related daemon events. | REQ-70, REQ-71 | INT-2 |
| INT-4 | create | client, volumes-networks feature area | Volumes panel: list with driver, mountpoint, size and mounting containers; create dialog; inspect surface; remove and prune through the confirmation service with the reclaimed space reported. | REQ-70, REQ-71 | INT-1, INT-3 |
| INT-5 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the "Volumes & networks" placeholder with the screen hosting the volumes panel (the networks panel is added by batch 19). | REQ-70 | INT-4 |
