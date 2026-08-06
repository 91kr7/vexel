---
batch: 4 · containers-lifecycle
feature: F4 — Container list and lifecycle
closed_req: [REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-109]
depends: [1, 2]
---

# Batch 4 — Container list and lifecycle

First dense screen of the application: it introduces the table/toolbar family of the UI library that
most later screens reuse, and closes REQ-109 (the glass material must not cost frames on a long,
scrolling list).

Visual reference: `.sdd/analysis/ui-mock/containers.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Data-table primitives: table with column definitions, dense rows, hover/selected states, status-dot cell, two-line cell (title + muted subtitle), numeric/meta cell, and virtualised scrolling for long lists so scrolling stays smooth. | REQ-19, REQ-109 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Screen-toolbar primitive (leading primary action, secondary actions, trailing destructive action), search/filter field, filter chips, and an inline action-button group for row-level actions with a destructive variant. | REQ-20, REQ-22, REQ-23 | — |
| INT-3 | create | server, containers area | Container listing over the Engine API for every state, exposing name, short id, state, image, published ports, uptime, plus lifecycle operations: start, stop, restart, pause, unpause, kill, remove, rename, and prune of stopped containers with the reclaimed space. | REQ-19, REQ-20, REQ-21, REQ-22 | — |
| INT-4 | create | server, containers area | Live CPU and memory sampling per container, aggregated into the list payload at a bounded refresh rate. | REQ-19 | INT-3 |
| INT-5 | create | client, data-access layer | Container list query and lifecycle mutations, re-read on the daemon events that concern containers. | REQ-19, REQ-20, REQ-21, REQ-22 | INT-3, INT-4 |
| INT-6 | create | client, containers feature area | Containers screen: toolbar, table of every container with the REQ-19 columns, per-row lifecycle actions restricted to what the current state allows, rename, bulk prune of stopped containers, and text/state filtering — destructive actions routed through the shell's confirmation service. | REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-109 | INT-1, INT-2, INT-5 |
| INT-7 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the Containers placeholder with the real screen and feed the navigation rail's container count from the live list. | REQ-19 | INT-6 |
