---
batch: 12 · image-transport
feature: F11 — Image transport (save/load, export/import)
closed_req: [REQ-42, REQ-43]
depends: [9]
---

# Batch 12 — Image transport: save/load and export/import

**Every transfer of this batch goes through the browser. No host path is involved anywhere.**
Decided on 2026-08-07 — see "Departures from the spec" in `batches.md`. A tarball saved to a path on
the machine running the server is an artefact the operator can neither see nor reach, and a tarball
to load would have to be placed on that machine by other means first; both are the ill-posed input
that withdrew F12. The four artefacts of this batch belong to the operator, so:

- **save an image / export a container filesystem** → the tarball is streamed out as a **browser
  download**, named after the reference or container it came from;
- **load images / import a filesystem** → the operator picks a file from **their own machine** and it
  is streamed up.

**Both directions must stream end to end.** A save streams from the Engine API straight into the HTTP
response, a load streams the uploaded body straight into the Engine API, and neither buffers a whole
tarball in memory or in a temporary file — these are routinely multi-gigabyte. The Engine API client
of batch 2 accepts a stream body for exactly this.

**REQ-116 does not apply to this batch** and no longer closes here — it closed in batch 11 until that
was withdrawn, then here until this decision; it now closes in batch 20, the only batch left that
consumes a host path (a discovered one). Do not use the host-path validation service, do not use the
`PathInput` primitive, and do not add a path field to any of these flows. The batch's dependency on
batch 3 goes with it.

**Where the progress of REQ-42 and REQ-43 is shown differs by direction, and the streaming rule
wins over a uniform look.** On an **upload** the application owns the bytes as it sends them, so it
shows byte progress in its own dialog with a working cancel. On a **download** the browser owns the
transfer and shows its own progress: the application reports that the download has started and what
it contains, and must **not** read the response into memory to draw a nicer bar — that would buffer
a multi-gigabyte tarball in the tab and defeat the streaming requirement above. Preparation work the
server does before the first byte (collecting the images, committing the container) is the
application's to report.

Visual reference: "Load tarball" in `.sdd/analysis/ui-mock/image_layers.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Multi-select affordance on the list-card primitive (selection checkbox, selection count, bulk-action bar), a file-picker primitive for choosing a local file to upload (with the chosen file's name and size shown), and a transfer-progress dialog with byte progress and cancel. | REQ-42, REQ-43 | — |
| INT-2 | create | server, images area | Save of one or several images as a tarball streamed to the HTTP response as a download, and load of images from a streamed request body, both reporting progress and the resulting references. | REQ-42 | — |
| INT-3 | create | server, containers area | Export of a container's filesystem as a tarball streamed to the HTTP response as a download, and import of an image from a streamed filesystem tarball with an optional target reference and config changes. | REQ-43 | — |
| INT-4 | create | client, data-access layer | Save/load/export/import operations: download triggering with progress, upload of a local file with byte progress and cancel, and refresh of the image or container list on completion. | REQ-42, REQ-43 | INT-2, INT-3 |
| INT-5 | create | client, images feature area | Save, load and import flows: image multi-selection for the save, file picking for the load and for the import of a filesystem tarball (with its optional target reference and config changes), progress, and the resulting references reported. | REQ-42, REQ-43 | INT-1, INT-4 |
| INT-6 | modify | client, containers feature area (created by `batch-container-inspect-config`) | Offer "export filesystem" from the container detail surface, reusing the same progress dialog. | REQ-43 | INT-5 |
| INT-7 | modify | client, images feature area (created by `batch-images-core`) | Wire the "Load tarball" toolbar action and the per-image "save" action to the flows above. | REQ-42 | INT-5 |
