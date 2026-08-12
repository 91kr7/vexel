---
module: swarm
component: SwarmStacksService
type: backend service
---

# SwarmStacksService

**Purpose** → the stacks deployed on the swarm, listed with the services that make them up, and
their removal (REQ-83, reduced form). **It does not deploy stacks**: deployment was withdrawn on
2026-08-07 (departure Three), so nothing here takes a compose file.

## Contract

- `listStacks() → SwarmListing<SwarmStack>`
  - `SwarmStack` = `{ name, serviceCount, services[], secretCount, configCount, networkCount }`.
  - `services` → each `{ id, name, image, mode, replicasRunning?, replicasDesired? }`, the service's
    own name as the daemon holds it (namespace included), **ordered by service name** under the
    list-order rule (`compareNames`) with the service **id** as the final comparison. A service
    stays nested inside its stack: the nesting is what the panel is, and no service is ever lifted
    out of it.
  - a stack exists as soon as one object carries its namespace, even with no service left.
  - **Ordered by stack name** under the same rule. A stack carries no identifier other than its
    name, so the final comparison is **that same name compared exactly**, which separates two stacks
    whose names differ only in case or in leading zeros (`app-1` from `app-01`).
  - The same stacks produce the **same sequence on every read**, whatever order the daemon listed
    the underlying services in.
  - off a manager: no items and the stated reason.
- `removeStack(name) → { removedServices[], removedSecrets[], removedConfigs[], removedNetworks[] }`
  - effect: every service, secret, config and network belonging to that stack is gone; nothing
    outside the stack is touched.
  - the four lists name what was actually removed.
  - rejects when the name is empty, when the daemon is not a manager, and with the daemon's own
    message when a removal is refused — the objects removed before the refusal stay removed.

## Rules and invariants

- A stack is not a Docker object: it exists only as the `com.docker.stack.namespace` label carried by
  the services, secrets, configs and networks that were deployed together. Membership is read from
  that label alone, so a stack deployed from a terminal is listed exactly like any other.
- Removal follows the same order the CLI uses — services first, then secrets, configs and networks —
  so nothing is removed while a running task still depends on it.
- An object without the namespace label is never part of any stack and is never removed by a stack
  removal.
- Nothing in this service reads, writes or asks for a compose file (departure Three).

## Dependencies

- swarm: SwarmStateService (manager scoping), SwarmServicesService (the namespace label)
- docker-access: EngineClient (active context)
- list-order: List order (`byNameThenIdentity`)

## Requirements served

- plan-docker_management_app/REQ-83
- plan-docker_management_app-list_ordering/REQ-23
- plan-docker_management_app-list_ordering/REQ-24
- plan-docker_management_app-list_ordering/REQ-25
