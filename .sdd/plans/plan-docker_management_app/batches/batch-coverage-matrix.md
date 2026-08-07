---
batch: 30 · coverage-matrix
feature: F29 — Coverage matrix
closed_req: [REQ-105, REQ-106]
depends: [29]
---

# Batch 30 — Coverage matrix

Keeps the "100% of Docker features" claim honest: what has a dedicated screen, what is reachable
only through the console, and against which Docker baseline that statement holds. Last batch,
because it describes the coverage the previous ones delivered.

Visual reference: the "Coverage matrix" navigation entry present in every mockup.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Matrix-table variant of the table primitive: coverage-state badge per row (dedicated screen / console only / not applicable) and a navigating cell. | REQ-105 | — |
| INT-2 | create | client, coverage feature area | Declaration of the coverage map: one entry per Docker capability area with its coverage state and the screen that covers it, maintained as data so a later batch updates one line rather than a screen. **Image building is a required entry, in state "console only"** — F12 was withdrawn on 2026-08-07 (see "Departures from the spec" in `batches.md`) and this matrix is where the product states that honestly, alongside Docker Scout. | REQ-105 | — |
| INT-3 | create | server, system area | Baseline reporting: the Engine API and CLI baseline the application targets, alongside the version of the daemon currently connected, so a mismatch is visible. | REQ-106 | — |
| INT-4 | create | client, data-access layer | Baseline query joined with the coverage map for display. | REQ-105, REQ-106 | INT-2, INT-3 |
| INT-5 | create | client, coverage feature area | Coverage matrix screen: capability areas with their coverage state, navigation to the covering screen or to the raw console, and the declared baseline next to the connected daemon version with the mismatch made visible. | REQ-105, REQ-106 | INT-1, INT-4 |
| INT-6 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the "Coverage matrix" placeholder with the real screen. | REQ-105 | INT-5 |
