---
batch: 27 · swarm
feature: F22 — Swarm
closed_req: [REQ-79, REQ-80, REQ-81, REQ-82, REQ-83, REQ-84]
depends: [2]
---

# Batch 27 — Swarm

Secondary area per the spec.

**This screen observes and removes stacks; it does not deploy them.** Stack deployment from a
compose file was withdrawn on 2026-08-07 — see "Departures from the spec" in `batches.md`. With it
went the batch's dependency on batch 20, which existed only to reuse that batch's compose file
handling. Do not add a deploy affordance, a compose-file path input or a compose editor to this
screen. Listing stacks with their services and removing them needs no file and is unaffected.

Visual reference: `.sdd/analysis/ui-mock/swarm.png` — **ignore any deploy-from-file affordance it
shows**; it belongs to the withdrawn half of REQ-83.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Cluster-state header (state, identifiers, health, trailing actions), role/availability badge set, and a reveal-and-copy field for tokens with a rotate action. | REQ-79, REQ-80, REQ-81 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) | Four-panel screen layout for the nodes / services / secrets / configs arrangement of the mockup. | REQ-81, REQ-82, REQ-83, REQ-84 | — |
| INT-3 | create | server, swarm area | Swarm state (inactive, manager, worker, cluster id, node count, raft health) plus init, join with a token, and leave; join-token display and rotation. | REQ-79, REQ-80 | — |
| INT-4 | create | server, swarm area | Node inventory (hostname, role, availability, status) with role and availability updates and node removal. | REQ-81 | INT-3 |
| INT-5 | create | server, swarm area | Service inventory (image, mode, running/desired replicas, published ports) with create, update (image, replicas, environment, ports), inspect with tasks, and remove. | REQ-82 | INT-3 |
| INT-6 | create | server, swarm area | Stack listing with their services and stack removal (no deployment — see the note above); secrets and configs listing, creation, metadata inspection and removal, never returning a secret's value. | REQ-83, REQ-84 | INT-3 |
| INT-7 | create | client, data-access layer | Swarm queries and mutations for state, tokens, nodes, services, stacks, secrets and configs, re-read on swarm-related daemon events. | REQ-79, REQ-80, REQ-81, REQ-82, REQ-83, REQ-84 | INT-3, INT-4, INT-5, INT-6 |
| INT-8 | create | client, swarm feature area | Swarm screen: cluster state with init/join/leave and join tokens; nodes with role/availability changes and removal; services with create/update/inspect/remove and their tasks; stacks listed with their services and removable; secrets and configs with metadata-only inspection — destructive actions confirmed, and an explicit inactive state when the daemon is not in swarm mode. | REQ-79, REQ-80, REQ-81, REQ-82, REQ-83, REQ-84 | INT-1, INT-2, INT-7 |
| INT-9 | modify | client, application shell area (created by `batch-foundation-ui-shell`) | Replace the Swarm placeholder with the real screen. | REQ-79 | INT-8 |
