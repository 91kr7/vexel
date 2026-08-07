---
batch: 15 · in-tree-file-operations
feature: F15 — In-tree file operations
closed_req: [REQ-58, REQ-59, REQ-60, REQ-61, REQ-62]
depends: [14]
---

# Batch 15 — In-tree file operations

Read, inspect, search and export inside an extracted image filesystem. Containment (REQ-62) is a
first-class intervention, not a side effect of the export.

**Export goes through the browser; there is no host destination.** Decided on 2026-08-07 — see
"Departures from the spec" in `batches.md`. A single file downloads as itself, a subtree downloads as
one archive. Do not use the host-path validation service, do not use the `PathInput` primitive, and
do not add a destination field.

**REQ-62 is reframed by that decision, not softened.** With no host write left, containment applies
in two places instead of one, and the first is more dangerous than what it replaces:

1. **On reads** — a `../` segment or a symlink pointing outside the extracted tree must be
   neutralised or refused, never followed. Otherwise the server reads a file of its own host and
   serves it to whoever is using the application: an exfiltration channel, not a stray write.
2. **On the archive produced for a subtree** — no entry may carry an absolute path or a `../`
   segment. That archive is extracted on the operator's machine, so a poisoned entry writes outside
   the directory they chose, on their machine.

Both refusals are reported with their reason.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Content-viewer primitives: monospace text viewer with line numbers and a truncation notice, hex-dump viewer, and a viewer-mode switch. | REQ-59 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Tree-search field with in-place match marking and next/previous, and a metadata panel variant of the definition list for file attributes. | REQ-58, REQ-60 | — |
| INT-3 | create | server, image-analysis area | Entry metadata read from the extracted tree: size, permissions, uid/gid, modification time, entry type and symlink target. | REQ-58 | — |
| INT-4 | create | server, image-analysis area | File content read with content-type detection (text vs binary), byte-range/truncation bounds for oversized files, and a hex-oriented read mode. | REQ-59 | — |
| INT-5 | create | server, image-analysis area | Path/name search across the extracted tree returning matches with their position in the tree, bounded in result count and cancellable. | REQ-60 | — |
| INT-6 | create | server, image-analysis area | Export as a browser download: a single file streamed as itself, and a subtree streamed as one archive, reporting what the archive contains. | REQ-61 | — |
| INT-7 | create | server, image-analysis area | Containment for exports and reads: neutralise or refuse `../` segments and symlinks leaving the extracted tree so no byte outside it is read or served, emit no absolute path and no `../` segment into the produced archive, and report every refusal with its reason. Applied by INT-3, INT-4 and INT-6 before any byte is read or written. | REQ-62 | INT-6 |
| INT-8 | create | client, data-access layer | Metadata, content, search and export operations over an extracted tree, with the refusal payloads surfaced to the UI. | REQ-58, REQ-59, REQ-60, REQ-61, REQ-62 | INT-3, INT-4, INT-5, INT-6, INT-7 |
| INT-9 | modify | client, images feature area (created by `batch-image-filesystem-browser`) | Add to the filesystem browser: the metadata panel, the text/hex preview with mode override and truncation notice, tree search, and single-file and subtree download with the refusal messages of INT-7. | REQ-58, REQ-59, REQ-60, REQ-61, REQ-62 | INT-1, INT-2, INT-8 |
