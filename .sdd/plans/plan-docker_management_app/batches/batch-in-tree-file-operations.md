---
batch: 15 · in-tree-file-operations
feature: F15 — In-tree file operations
closed_req: [REQ-58, REQ-59, REQ-60, REQ-61, REQ-62]
depends: [14]
---

# Batch 15 — In-tree file operations

Read, inspect, search and export inside an extracted image filesystem. Host-write safety (REQ-62)
is a first-class intervention, not a side effect of the export.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Content-viewer primitives: monospace text viewer with line numbers and a truncation notice, hex-dump viewer, and a viewer-mode switch. | REQ-59 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Tree-search field with in-place match marking and next/previous, and a metadata panel variant of the definition list for file attributes. | REQ-58, REQ-60 | — |
| INT-3 | create | server, image-analysis area | Entry metadata read from the extracted tree: size, permissions, uid/gid, modification time, entry type and symlink target. | REQ-58 | — |
| INT-4 | create | server, image-analysis area | File content read with content-type detection (text vs binary), byte-range/truncation bounds for oversized files, and a hex-oriented read mode. | REQ-59 | — |
| INT-5 | create | server, image-analysis area | Path/name search across the extracted tree returning matches with their position in the tree, bounded in result count and cancellable. | REQ-60 | — |
| INT-6 | create | server, host-filesystem area | Export of a file or a subtree: browser download for a single file, and write to an operator-typed destination for a file or subtree, reporting what was written where. | REQ-61 | — |
| INT-7 | create | server, host-filesystem area | Host-write safety for exports: neutralise or refuse `../` segments and symlinks leaving the extracted tree, refuse a destination that is unsafe, non-existent or not writable, and report every refusal with its reason. Applied by INT-6 before any byte is written. | REQ-62 | INT-6 |
| INT-8 | create | client, data-access layer | Metadata, content, search and export operations over an extracted tree, with the refusal payloads surfaced to the UI. | REQ-58, REQ-59, REQ-60, REQ-61, REQ-62 | INT-3, INT-4, INT-5, INT-6, INT-7 |
| INT-9 | modify | client, images feature area (created by `batch-image-filesystem-browser`) | Add to the filesystem browser: the metadata panel, the text/hex preview with mode override and truncation notice, tree search, single-file download and file/subtree export to a typed destination with its refusal messages. | REQ-58, REQ-59, REQ-60, REQ-61, REQ-62 | INT-1, INT-2, INT-8 |
