---
batch: 9 · images-core
feature: F10 — Image list and registry-facing actions
closed_req: [REQ-37, REQ-38, REQ-39, REQ-40, REQ-41]
depends: [1, 2]
---

# Batch 9 — Images: list, pull, push, tag, remove, inspect

Opens the Artifacts area and the "Images & layers" screen that batches 11 to 17 keep extending.

Visual reference: `.sdd/analysis/ui-mock/lmages-layers.png` (card rows with digest, platforms,
badges, age and size).

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | List-card primitive: full-width card row with title, monospace subtitle, trailing badge group and meta values, selectable and expandable — the shape used by images, builders, contexts, registries and plugins. | REQ-37, REQ-41 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Multi-step progress list (one row per unit of work with its own progress and terminal state) and a dialog form shell for short create/pull/tag flows. | REQ-38, REQ-39 | — |
| INT-3 | create | server, images area | Image listing over the Engine API with all tags, short digest, platform(s), size and creation age, plus image inspect (config, entrypoint/cmd, env, labels, exposed ports, digest, platform, size, recorded history) and the raw payload. | REQ-37, REQ-40 | — |
| INT-4 | create | server, images area | Registry-facing operations: pull by reference with optional platform and per-layer progress, push with progress, tag, untag, remove, prune of dangling images with the space reclaimed. | REQ-38, REQ-39 | INT-3 |
| INT-5 | create | client, data-access layer | Image list/inspect queries and pull/push/tag/remove/prune mutations, re-read on image-related daemon events, with progress streams surfaced to the UI. | REQ-37, REQ-38, REQ-39, REQ-40 | INT-3, INT-4 |
| INT-6 | create | client, images feature area | Images screen: toolbar (pull, build, load, prune dangling), card list of local images with search by reference or digest, per-image actions (tag, untag, push, remove) with destructive confirmation, and an inspect surface with the raw payload. Leaves the detail surface open to further panels added by later batches. | REQ-37, REQ-38, REQ-39, REQ-40, REQ-41 | INT-1, INT-2, INT-5 |
| INT-7 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the "Images & layers" placeholder with the real screen and feed the rail's image count. | REQ-37 | INT-6 |
