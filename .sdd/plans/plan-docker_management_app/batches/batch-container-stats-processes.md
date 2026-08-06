---
batch: 7 · container-stats-processes
feature: F8 — Container stats and processes
closed_req: [REQ-32, REQ-33]
depends: [4]
---

# Batch 7 — Container stats and processes

Introduces the metric primitives (tile, meter, sparkline) that the dashboard reuses later.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Metric primitives: metric tile (label, big value, sub-label), proportional bar meter with a used/limit reading, and a compact time-series sparkline fed by a bounded sample window. | REQ-32 | — |
| INT-2 | create | server, containers area | Live stats streaming per container over the Engine API: CPU percentage, memory used/limit, network in/out, block I/O, normalised into ready-to-display values, cancelled when the client disconnects. | REQ-32 | — |
| INT-3 | create | server, containers area | Container process listing (pid, user, command) on demand. | REQ-33 | — |
| INT-4 | create | client, data-access layer | Stats subscription hook keeping a bounded sample history for the sparkline, and a process-list query with manual refresh. | REQ-32, REQ-33 | INT-2, INT-3 |
| INT-5 | create | client, containers feature area | Container stats and processes view: live CPU/memory/network/block-I/O readings that keep updating while open, and the process table with a refresh action. | REQ-32, REQ-33 | INT-1, INT-4 |
| INT-6 | modify | client, containers feature area (created by `batch-container-inspect-config`) | Add stats and processes as sections/tabs of the container detail surface, and stop the stats stream when the view is left. | REQ-32, REQ-33 | INT-5 |
