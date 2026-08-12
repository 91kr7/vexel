---
module: swarm
component: SwarmNodesService
type: backend service
---

# SwarmNodesService

**Purpose** → the inventory of the nodes of the swarm (hostname, role, availability, status) and the
two changes an operator makes to one: its role or availability, and its removal from the cluster
(REQ-81).

## Contract

- `listNodes() → SwarmListing<SwarmNode>`
  - `SwarmNode` = `{ id, hostname, role, availability, status, statusMessage?, address?, leader,
    reachability?, engineVersion?, platform?, self, version, labels, createdAt?, updatedAt? }`.
  - `role` → `'manager' | 'worker'`; `availability` → `'active' | 'pause' | 'drain'`.
  - `status` → the daemon's node state (`ready`, `down`, `unknown`, `disconnected`), with
    `statusMessage` when it explains one.
  - `leader` / `reachability` → only meaningful on a manager node; `leader` is false on a worker.
  - `self` → this node is the daemon the application is talking to.
  - `version` → the index the daemon requires to accept the next update of this node.
  - **Managers come before workers**, that grouping being compared before anything else; within a
    role, **ordered by hostname** under the list-order rule (`compareNames`), with the node **id**
    as the final comparison — so two nodes whose hostnames differ only in case never tie, and the
    cluster reads the same way twice running whatever order the daemon listed the nodes in.
  - off a manager: no items and the stated reason (see SwarmStateService).
- `updateNode(id, { role?, availability? }) → SwarmNode`
  - effect: the node's role and/or availability change; everything else about the node is preserved.
  - omitting a field leaves it as it is.
  - rejects if the daemon is not a manager → the stated reason.
  - rejects with the daemon's own message when it refuses (e.g. demoting the last manager).
- `removeNode(id, force) → void`
  - effect: the node is no longer part of the cluster.
  - `force` is what removing a node that is still reachable requires.
  - rejects if the daemon is not a manager, and on the daemon's refusal.

## Rules and invariants

- An update sends the node's **whole** current spec with the requested fields changed: a partial
  spec would silently drop the node's name and labels.
- An update is applied against the version the node currently carries, re-read immediately before:
  the daemon refuses a stale one, which is what stops two concurrent updates from overwriting each
  other.
- Nothing here promotes or demotes implicitly: role and availability change only when asked for.

## Dependencies

- swarm: SwarmStateService (manager scoping, local node id)
- docker-access: EngineClient (active context)
- list-order: List order (`byNameThenIdentity`, with the role as the group rank)

## Requirements served

- plan-docker_management_app/REQ-81
- plan-docker_management_app-list_ordering/REQ-23
- plan-docker_management_app-list_ordering/REQ-24
- plan-docker_management_app-list_ordering/REQ-25
