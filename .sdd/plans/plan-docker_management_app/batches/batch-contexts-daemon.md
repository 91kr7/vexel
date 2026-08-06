---
batch: 23 · contexts-daemon
feature: F25 — Contexts and daemon information
closed_req: [REQ-92, REQ-93, REQ-94]
depends: [2]
---

# Batch 23 — Contexts and daemon information

Turns the "active context" of the shell into something the operator chooses: every screen follows
the selected daemon.

Visual reference: `.sdd/analysis/ui-mock/context.png`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Active-selection row variant (active marker plus a "use" action) and a secure-endpoint form group (endpoint kind, host, TLS material paths) for the context creation form. | REQ-92 | — |
| INT-2 | create | server, contexts area | Context inventory (name, endpoint, which is active) plus create for the local socket, SSH and TCP+TLS kinds, select-active and remove, through the CLI channel and the local Docker configuration. | REQ-92 | — |
| INT-3 | modify | server, Docker access layer (created by `batch-daemon-connectivity`) | Make the active context the single source the Engine API client and the CLI runner point at, and re-establish connection and event stream when it changes. | REQ-93 | INT-2 |
| INT-4 | create | server, contexts area | Daemon information of the active context: version, Engine API version, BuildKit version, storage driver, cgroup driver, OS/architecture, root directory and container counts. | REQ-94 | INT-3 |
| INT-5 | create | client, data-access layer | Context queries and mutations, daemon-info query, and the invalidation of every cached view when the active context changes. | REQ-92, REQ-93, REQ-94 | INT-2, INT-3, INT-4 |
| INT-6 | create | client, contexts feature area | Contexts screen: context list with endpoint and active marker, create form for the three endpoint kinds, "use" to switch, remove with confirmation, and the daemon-information panel of the active context. | REQ-92, REQ-93, REQ-94 | INT-1, INT-5 |
| INT-7 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the Contexts placeholder with the real screen, feed the rail's context count, and make the footer's active-context block reflect and follow the switch. | REQ-92, REQ-93 | INT-6 |
