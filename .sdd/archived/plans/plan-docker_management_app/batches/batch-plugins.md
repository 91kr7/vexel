---
batch: 28 · plugins
feature: F27 — Plugins
closed_req: [REQ-98, REQ-99, REQ-111]
depends: [2]
---

# Batch 28 — Plugins

Listing plus full daemon-plugin management (human decision at validation).

Visual reference: `.sdd/analysis/ui-mock/plugins.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Toggle-switch primitive with a busy state, and a privilege-review list usable inside the confirmation dialog (each requested privilege with its value). | REQ-99, REQ-111 | — |
| INT-2 | create | server, plugins area | CLI plugin inventory (name, version, availability) from the local Docker installation, and daemon plugin inventory (name, type, enabled/disabled) from the Engine API, each degrading explicitly when the information is not exposed. | REQ-98, REQ-99 | — |
| INT-3 | create | server, plugins area | Daemon plugin management: install from a reference returning the privileges it requests before granting, enable, disable, inspect and remove. | REQ-111 | INT-2 |
| INT-4 | create | client, data-access layer | Plugin queries and management mutations, re-read on plugin-related daemon events. | REQ-98, REQ-99, REQ-111 | INT-2, INT-3 |
| INT-5 | create | client, plugins feature area | Plugins screen: CLI plugins with version and availability, daemon plugins with type and state; install with privilege review before granting, enable/disable toggle, inspect, and removal confirmed as destructive. | REQ-98, REQ-99, REQ-111 | INT-1, INT-4 |
| INT-6 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the Plugins placeholder with the real screen. | REQ-98 | INT-5 |
