---
batch: 6 · container-logs
feature: F7 — Container logs
closed_req: [REQ-30, REQ-31]
depends: [4]
---

# Batch 6 — Container logs

Introduces the log/stream surface of the UI library, later reused by compose aggregated logs, build
output and the raw console.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Log-stream surface: virtualised monospace lines, follow/auto-scroll with a "jump to live" affordance, optional timestamp column, stream tagging (stdout/stderr), match highlighting, and copy/download actions. | REQ-30, REQ-31 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Stream-control primitives: segmented control, tail-size selector, time-range (since/until) input, and an in-surface search field with match count and next/previous. | REQ-30, REQ-31 | — |
| INT-3 | create | server, containers area | Container log streaming over the Engine API: stdout/stderr selection, follow, timestamps, tail size, since/until, with clean cancellation when the client disconnects. | REQ-30 | — |
| INT-4 | create | client, data-access layer | Log subscription hook with backpressure/buffer bounds, reconnection, and a snapshot of the visible buffer for copy/download. | REQ-30, REQ-31 | INT-3 |
| INT-5 | create | client, containers feature area | Container logs view: stream controls, live tail, search with highlighted matches, copy and download of the visible log. | REQ-30, REQ-31 | INT-1, INT-2, INT-4 |
| INT-6 | modify | client, containers feature area (created by `batch-container-inspect-config`) | Add the logs view as a tab/section of the container detail surface, opened from the container list. | REQ-30 | INT-5 |
