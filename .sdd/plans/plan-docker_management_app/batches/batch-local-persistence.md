---
batch: 3 · local-persistence
feature: F30 — Local persistence and host-path access (enabling)
closed_req: [REQ-115]
depends: [1, 2]
---

# Batch 3 — Local persistence and host-path access

Enabling batch. It provides the local store (preferences, console history, analysis cache) and the
host-path validation used by every feature that accepts an operator-typed path. Only REQ-115 is
observable here; REQ-113 closes in batch 14, REQ-114 in batch 29, REQ-116 in batch 11 (declared in
`batches.md`).

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Path input primitive (value, validation state, refusal message, browse-hint) and a storage-usage row with size and a clear action. | REQ-115, REQ-116 | — |
| INT-2 | create | server, persistence layer | Local store in a per-user application-data directory, created on first run: namespaced records for UI preferences, console history and the analysis-cache index, with schema versioning and safe concurrent writes. | REQ-113, REQ-114, REQ-115 | — |
| INT-3 | create | server, persistence layer | Content-addressed cache for extraction/analysis artifacts, keyed by image content digest: lookup, insert, invalidation when the content changes, total size accounting, clear, and reclaim of entries left by an interrupted run. | REQ-113 | INT-2 |
| INT-4 | create | server, host-filesystem area | Host-path validation service: existence, kind (file/directory), readability/writability, refusal of traversal and of symlink escape outside the allowed root, each refusal carrying its reason. Single entry point for all features taking a path. | REQ-116 | — |
| INT-5 | create | server, HTTP API surface | Endpoints for preferences read/write, analysis-cache size and clear, and path validation. | REQ-113, REQ-115, REQ-116 | INT-2, INT-3, INT-4 |
| INT-6 | create | client, data-access layer | Preference hooks (read, write, defaults) and the startup restore of the last screen, the list filters and the selected context. | REQ-115 | INT-5 |
| INT-7 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Restore the persisted screen/context at startup, persist screen and filter changes, and expose the analysis-cache size with its clear action. | REQ-113, REQ-115 | INT-1, INT-6 |
