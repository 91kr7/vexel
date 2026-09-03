---
batch: 17 · layer-efficiency-signals
feature: F17 — Layer efficiency, waste and secret signals
closed_req: [REQ-65, REQ-66, REQ-67]
depends: [13, 14]
---

# Batch 17 — Layer efficiency, waste and secret-leak signals

Turns the per-layer changeset data of batch 13 into actionable findings (the `dive` parity bar),
plus the heuristic secret-leak signal. It must read as a signal, never as a security verdict.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Findings primitives: findings list with a severity/kind marker, per-finding size impact and drill-down, score/gauge display, and a callout for the heuristic disclaimer. | REQ-65, REQ-66, REQ-67 | — |
| INT-2 | create | server, image-analysis area | Waste analysis over the per-layer changesets: files added by one layer and deleted or overwritten by a later one, with the bytes they still occupy, a total wasted-bytes estimate and an efficiency score. | REQ-65 | — |
| INT-3 | create | server, image-analysis area | Duplicate-content detection across layers: identical content stored more than once, with the paths involved and the bytes wasted. | REQ-66 | INT-2 |
| INT-4 | create | server, image-analysis area | Secret-pattern scan over the whole layer history, including paths absent from the final merged filesystem, reporting the introducing and removing layers, as a heuristic signal with the matched pattern named. | REQ-67 | — |
| INT-5 | create | client, data-access layer | Efficiency, duplication and secret-signal queries, sharing the analysis job and cache of batch 13. | REQ-65, REQ-66, REQ-67 | INT-2, INT-3, INT-4 |
| INT-6 | create | client, images feature area | Efficiency and signals view: wasted bytes and efficiency score, deleted-later files with their cost, duplicated content, and flagged credential-looking paths with their layers — each finding navigating to the layer or path it concerns, under an explicit heuristic disclaimer. | REQ-65, REQ-66, REQ-67 | INT-1, INT-5 |
| INT-7 | modify | client, images feature area (created by `batch-layer-stack-changesets`) | Add the signals view next to the layer explorer and mark, in the layer stack, the layers carrying findings. | REQ-65, REQ-67 | INT-6 |
