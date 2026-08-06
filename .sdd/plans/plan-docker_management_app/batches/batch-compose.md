---
batch: 20 · compose
feature: F21 — Compose
closed_req: [REQ-75, REQ-76, REQ-77, REQ-78]
depends: [2, 3, 4]
---

# Batch 20 — Compose

Uses the CLI channel (`docker compose`) for discovery, lifecycle and validation, and the host-path
validation of batch 3 for the compose file written back to disk.

Visual reference: `.sdd/analysis/ui-mock/compose.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Editable code surface (monospace, line numbers, editable, dirty state) with a validation status line, and a stepper control (decrement / value / increment) for replica counts. | REQ-76, REQ-77 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Grouped-rows panel: a project header with its actions and its indented service rows carrying state, image and a trailing control — plus a source-labelled variant of the log surface for aggregated logs. | REQ-75, REQ-78 | — |
| INT-3 | create | server, compose area | Compose project discovery (project name, compose file path, overall and per-service state) through the CLI channel, with the daemon's own message when a project cannot be read. | REQ-75 | — |
| INT-4 | create | server, compose area | Stack lifecycle: up, down, restart, and per-service scaling, streaming the command output and returning the resulting state. | REQ-76 | INT-3 |
| INT-5 | create | server, compose area | Compose file read, validated write-back to its path on disk (through the host-path validation service), and validation on demand returning valid/invalid with errors plus the declared services, volumes and networks. | REQ-77 | INT-3 |
| INT-6 | create | server, compose area | Aggregated log streaming for all services of a project, each line carrying its service name, cancellable. | REQ-78 | INT-3 |
| INT-7 | create | client, data-access layer | Compose queries, lifecycle and scaling mutations, file read/write/validate, and the aggregated log subscription. | REQ-75, REQ-76, REQ-77, REQ-78 | INT-3, INT-4, INT-5, INT-6 |
| INT-8 | create | client, compose feature area | Compose screen: projects with their file path and per-service state, up/down/restart and per-service replica stepper, compose file editor with validation and a confirmed save back to disk, and the aggregated live logs labelled per service. | REQ-75, REQ-76, REQ-77, REQ-78 | INT-1, INT-2, INT-7 |
| INT-9 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the Compose placeholder with the real screen and feed the rail's stack count. | REQ-75 | INT-8 |
