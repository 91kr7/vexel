---
module: swarm
component: SwarmServicesService
type: backend service
---

# SwarmServicesService

**Purpose** → the inventory of the swarm's services (image, mode, running/desired replicas,
published ports), their creation, update, inspection together with their tasks, and their removal
(REQ-82).

## Contract

- `listServices() → SwarmListing<SwarmService>`
  - `SwarmService` = `{ id, name, image, mode, replicasRunning?, replicasDesired?, ports[], stack?,
    version, createdAt?, updatedAt? }`.
  - `mode` → `'replicated' | 'global'`.
  - `replicasRunning` / `replicasDesired` → the counts the daemon reports; `replicasDesired` falls
    back to the configured replica count when the daemon reports no status, and both are absent
    rather than zero when nothing is known.
  - `ports` → `{ published?, target, protocol, mode? }`, only the ports actually published.
  - `image` → without its pinned `@sha256:` digest, which the daemon appends to every deployed
    service and which is not what the operator recognises the service by.
  - `stack` → the stack the service belongs to, when it carries one.
  - ordered by name.
  - off a manager: no items and the stated reason.
- `getServiceDetail(id) → { service, env[], labels, tasks[], raw }`
  - `tasks` → `{ id, slot?, nodeId?, nodeHostname?, state, desiredState, message?, error?,
    timestamp? }`, most recent first.
  - `nodeHostname` → resolved from the node inventory; absent when the task is not on a node yet.
  - `raw` → the daemon's own service payload, for the full reading.
  - rejects if the daemon is not a manager, or with the daemon's message for an unknown service.
- `createService({ name, image, mode, replicas?, env?, ports?, labels? }) → SwarmService`
  - effect: the service exists, carrying the given labels, and the cluster starts converging on it.
  - `replicas` applies to `replicated` mode only; `global` runs one task per node.
  - `labels` are the service's own labels; an empty set is sent as none.
  - rejects on an empty name or image, if the daemon is not a manager, and on the daemon's refusal.
- `updateService(id, { image?, replicas?, env?, ports? }) → SwarmService`
  - effect: only the given fields change; the rest of the service definition is preserved.
  - changing `replicas` on a `global` service is refused → error `ReplicasNotApplicable`.
  - rejects if the daemon is not a manager, and on the daemon's refusal.
- `removeService(id) → void`
  - effect: the service and its tasks are gone.
  - rejects if the daemon is not a manager, and on the daemon's refusal.

## Rules and invariants

- An update sends the service's **whole** current spec with the requested fields changed, at the
  version the service carries right now: a partial spec would drop mounts, networks, secrets,
  restart policy and everything else the service was created with.
- `env` is exchanged as `KEY=value` strings, the shape the daemon itself uses, so a value containing
  `=` survives the round trip.
- A port with no published port is not published and is left out of the reading.
- **A service can be created with labels**, as a secret and a config can: labels are how a caller
  marks an object as its own and finds it again later, and a service with no way to carry them
  cannot be swept by whoever created it.
- Labels are set at creation and are not a field of the update: an update preserves them, since it
  sends the service's whole current spec back.
- Nothing here deploys a stack: a service is created one at a time, from arguments, never from a
  file (departure Three).

## Dependencies

- swarm: SwarmStateService (manager scoping)
- docker-access: EngineClient (active context)

## Requirements served

- plan-docker_management_app/REQ-82
