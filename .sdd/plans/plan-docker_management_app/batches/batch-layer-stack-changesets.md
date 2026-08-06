---
batch: 13 · layer-stack-changesets
feature: F13 — Layer stack and per-layer changesets
closed_req: [REQ-47, REQ-48, REQ-49, REQ-50, REQ-51]
depends: [3, 9]
---

# Batch 13 — Layer stack and per-layer changesets

The layer half of the product's differentiator. Layer data is sourced from the image manifest and
config (rootfs diff ids, history entries, empty-layer markers), never from `docker history` alone,
and changesets come from reading layer blobs with whiteout awareness.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Layer-stack primitives: ordered stack list with a proportional size bar per entry, selectable entries, "shared"/"empty" markers, and a master-detail split surface (stack on one side, selected-entry detail on the other). | REQ-47, REQ-50 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Changeset primitives: change-status tokens and markers for added / modified / deleted, a virtualised path list with status marker, size and full path, and an "unavailable" inline note explaining why a value could not be obtained. | REQ-48, REQ-49 | — |
| INT-3 | create | client, UI library (`client/src/ui/`) | Cost-warning dialog (estimated time, temporary disk) and a cancellable determinate progress surface for long analyses. | REQ-51 | — |
| INT-4 | create | server, image-analysis area | Layer metadata assembly from the image manifest and config: ordered layers with digest, compressed and uncompressed size, empty-layer flag, originating instruction and full recorded command text; anything the daemon genuinely cannot provide is marked unavailable with its reason rather than omitted. | REQ-47, REQ-48 | — |
| INT-5 | create | server, image-analysis area | Per-layer changeset computation by reading each layer blob: paths added, modified and deleted by that layer alone, with per-path size, interpreting OCI whiteout markers (`.wh.<name>` and `.wh..wh..opq`) as deletions and opaque directories. Results stored through the analysis cache and reported as progress; cancellable. | REQ-49, REQ-51 | INT-4 |
| INT-6 | create | server, image-analysis area | Shared-layer detection across local images: for each layer, the other images that reference the same diff id. | REQ-50 | INT-4 |
| INT-7 | create | client, data-access layer | Layer stack, changeset and shared-layer queries, driven by the analysis job's progress stream with cancellation. | REQ-47, REQ-48, REQ-49, REQ-50, REQ-51 | INT-4, INT-5, INT-6 |
| INT-8 | create | client, images feature area | Layer explorer: ordered layer stack with size, instruction and command text, shared markers with the images sharing them, and the selected layer's added/modified/deleted paths; cost warning before analysing a large image, with progress and cancel. | REQ-47, REQ-48, REQ-49, REQ-50, REQ-51 | INT-1, INT-2, INT-3, INT-7 |
| INT-9 | modify | client, images feature area (created by `batch-images-core`) | Open the layer explorer from an image row / the image detail surface. | REQ-47 | INT-8 |
