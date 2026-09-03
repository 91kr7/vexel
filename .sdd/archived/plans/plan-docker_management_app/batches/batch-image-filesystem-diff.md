---
batch: 16 · image-filesystem-diff
feature: F16 — Cross-image filesystem diff
closed_req: [REQ-63, REQ-64]
depends: [14]
---

# Batch 16 — Cross-image filesystem diff

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Diff-tree variant of the tree primitive: nodes carrying an added/removed/changed status with roll-up on collapsed directories, and a filter by status. | REQ-63 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Side-by-side viewer surface pairing two content viewers with a shared scroll and a per-side header. | REQ-64 | — |
| INT-3 | create | server, image-analysis area | Comparison of the merged filesystems of two images: added, removed and changed paths, with the nature of each change (content, size, mode, ownership, symlink target), reusing the cached extractions of both images and reporting progress. | REQ-63, REQ-64 | — |
| INT-4 | create | client, data-access layer | Diff job control (start, progress, cancel), diff-tree queries and paired content reads for a changed path. | REQ-63, REQ-64 | INT-3 |
| INT-5 | create | client, images feature area | Diff view: pick two images, then the difference as a navigable tree with status filtering; selecting a changed path states what changed and previews both sides side by side. | REQ-63, REQ-64 | INT-1, INT-2, INT-4 |
| INT-6 | modify | client, images feature area (created by `batch-images-core`) | Start a comparison from a selection of two images or from the image detail surface ("compare with…"). | REQ-63 | INT-5 |
