---
batch: 12 · image-transport
feature: F11 — Image transport (save/load, export/import)
closed_req: [REQ-42, REQ-43]
depends: [3, 9]
---

# Batch 12 — Image transport: save/load and export/import

Visual reference: "Load tarball" in `.sdd/analysis/ui-mock/lmages-layers.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Multi-select affordance on the list-card primitive (selection checkbox, selection count, bulk-action bar) and a transfer-progress dialog with byte progress and cancel. | REQ-42, REQ-43 | — |
| INT-2 | create | server, images area | Save of one or several images to a tarball at a validated host path, and load of images from a tarball, both streamed with progress and reporting the resulting references. | REQ-42 | — |
| INT-3 | create | server, containers area | Export of a container's filesystem to a tarball at a validated host path, and import of an image from a filesystem tarball with an optional target reference and config changes. | REQ-43 | — |
| INT-4 | create | client, data-access layer | Save/load/export/import mutations with their progress streams, host-path validation before starting, and refresh of the image or container list on completion. | REQ-42, REQ-43 | INT-2, INT-3 |
| INT-5 | create | client, images feature area | Save/load and import flows: image multi-selection, target/source path input with refusal messages, progress, and the resulting references reported. | REQ-42, REQ-43 | INT-1, INT-4 |
| INT-6 | modify | client, containers feature area (created by `batch-container-inspect-config`) | Offer "export filesystem to tarball" from the container detail surface, reusing the same path input and progress dialog. | REQ-43 | INT-5 |
| INT-7 | modify | client, images feature area (created by `batch-images-core`) | Wire the "Load tarball" toolbar action and the per-image "save" action to the flows above. | REQ-42 | INT-5 |
