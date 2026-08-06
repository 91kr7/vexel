---
batch: 14 · image-filesystem-browser
feature: F14 — Runtime-independent image filesystem browser
closed_req: [REQ-52, REQ-53, REQ-54, REQ-55, REQ-56, REQ-57, REQ-113]
depends: [3, 9, 13]
---

# Batch 14 — Runtime-independent image filesystem browser

The distroless-inspection differentiator: create a container from the image without ever starting
it, copy its filesystem out, browse it, and remove the intermediate container whatever happens. It
is the first capability creating a Docker object as an internal detail, so the cleanup guarantee is
an intervention of its own. REQ-113 (cache reuse across restarts, store built in batch 3) closes
here.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Tree-view primitive: virtualised, expandable/collapsible nodes with entry-type glyphs (file, directory, symlink), selection, keyboard navigation, and a lazily loaded subtree contract. | REQ-52 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Split-pane surface (tree on one side, detail on the other) and an analysis-status header showing the source of the displayed data (freshly extracted / from cache) with a re-extract action. | REQ-52, REQ-113 | — |
| INT-3 | create | server, image-analysis area | Extraction of an image's merged filesystem: create a container from the image and never start it, copy its filesystem out, and build the browsable tree — identically for images with a shell and for distroless/scratch images, since no process from the image is ever executed. | REQ-52, REQ-53, REQ-56 | — |
| INT-4 | create | server, image-analysis area | Cleanup guarantee for the intermediate container: removal on success, on error and on cancellation, plus a sweep at startup that removes any intermediate container left by an interrupted run; these containers are tagged so no other surface of the application ever lists them. | REQ-54, REQ-57 | INT-3 |
| INT-5 | create | server, image-analysis area | Cost estimation, progress reporting and cancellation for an extraction, and release of the temporary data when the inspection session ends; extraction results are stored and retrieved through the analysis cache keyed by image content digest, and reused instead of re-extracting. | REQ-55, REQ-57, REQ-113 | INT-3 |
| INT-6 | create | server, image-analysis area | Tree read API over an extracted filesystem: directory listing by path with entry type, size and metadata, designed for lazy expansion of large trees. | REQ-52 | INT-3 |
| INT-7 | modify | client, containers feature area (created by `batch-containers-lifecycle`) | Guarantee that intermediate extraction containers are excluded from the container list and counts. | REQ-54 | INT-4 |
| INT-8 | create | client, data-access layer | Extraction job control (start, progress, cancel), lazy tree queries, cache-state reporting and cache clearing. | REQ-52, REQ-55, REQ-113 | INT-5, INT-6 |
| INT-9 | create | client, images feature area | Filesystem browser view: cost warning then cancellable extraction progress, then the merged filesystem as a lazily expanded tree, with the indication of whether the data came from the cache and the option to re-extract. | REQ-52, REQ-55, REQ-113 | INT-1, INT-2, INT-8 |
| INT-10 | modify | client, images feature area (created by `batch-images-core`) | Open the filesystem browser from an image row / the image detail surface, alongside the layer explorer. | REQ-52 | INT-9 |
