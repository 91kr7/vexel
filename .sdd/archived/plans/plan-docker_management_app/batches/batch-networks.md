---
batch: 19 · networks
feature: F20 — Networks
closed_req: [REQ-72, REQ-73, REQ-74]
depends: [1, 2, 18]
---

# Batch 19 — Networks

Shares the "Volumes & networks" screen created by batch 18.

Visual reference: the right panel of `.sdd/analysis/ui-mock/volume-networks.png` (attached
containers as chips carrying a "detach" action).

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Chip-with-inline-action primitive (label plus a secondary action) and a chip group with an "add" affordance, for attached containers. | REQ-72, REQ-74 | — |
| INT-2 | create | server, networks area | Network listing with name, driver, scope, subnet, gateway and attached containers, plus create (name, driver, subnet, gateway, IP range, options, labels), inspect, remove, and prune of unused networks. | REQ-72, REQ-73 | — |
| INT-3 | create | server, networks area | Attach and detach of a container to/from a network, returning the updated attachment set. | REQ-74 | INT-2 |
| INT-4 | create | client, data-access layer | Network queries and mutations, re-read on network- and container-related daemon events. | REQ-72, REQ-73, REQ-74 | INT-2, INT-3 |
| INT-5 | create | client, volumes-networks feature area | Networks panel: list with driver, scope, subnet/gateway and attached containers as chips; create dialog; inspect surface; remove and prune with confirmation; attach a container and detach one from its chip. | REQ-72, REQ-73, REQ-74 | INT-1, INT-4 |
| INT-6 | modify | client, volumes-networks feature area (created by `batch-volumes`) | Add the networks panel next to the volumes panel on the shared screen. | REQ-72 | INT-5 |
