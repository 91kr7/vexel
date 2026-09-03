---
batch: 22 · layer-build-cache-traceability
feature: F18 — Layer to build-cache traceability
closed_req: [REQ-68, REQ-69]
depends: [13, 21]
---

# Batch 22 — Layer to build-cache traceability

Joins the layer material of batch 13 with the build-cache material of batch 21, so "this layer is
wasteful" leads to "this is the build step and cache entry behind it" without leaving the mental
model. Where the association genuinely does not exist (typically registry-pulled images), the
reason is stated rather than shown as an empty panel.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Cross-reference primitive: a reference chip/link that navigates to another object, with an "unavailable, because…" variant carrying the reason. | REQ-68, REQ-69 | — |
| INT-2 | create | server, image-analysis area | Association between a layer (diff id, history entry, build step) and the build-cache record that produced it, with an explicit "not associable" outcome carrying its reason when the data does not exist. | REQ-68 | — |
| INT-3 | create | server, build area | Reverse lookup from a build-cache record to the images and layers it is associated with, with the same explicit unavailable outcome. | REQ-69 | INT-2 |
| INT-4 | create | client, data-access layer | Traceability queries in both directions, carrying the unavailability reason to the UI. | REQ-68, REQ-69 | INT-2, INT-3 |
| INT-5 | modify | client, images feature area (created by `batch-layer-stack-changesets`) | From a selected layer, show and navigate to its build step and cache record, or state why the association is unavailable. | REQ-68 | INT-1, INT-4 |
| INT-6 | modify | client, build feature area (created by `batch-builders-build-cache`) | From a cache record, show and navigate to the images and layers it relates to, or state why that is unavailable. | REQ-69 | INT-1, INT-4 |
