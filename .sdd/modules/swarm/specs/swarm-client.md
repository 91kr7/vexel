---
module: swarm
component: Swarm client
type: frontend data client
---

# Swarm client

**Purpose** → the typed `fetch` wrapper over the swarm endpoints: state, tokens, nodes, services,
stacks, secrets and configs (REQ-79 to REQ-84).

## Contract

- `fetchSwarmState() → SwarmState`
- `initialiseSwarm({ advertiseAddr?, listenAddr? }) → SwarmState`
- `joinSwarm({ remoteAddrs, joinToken, advertiseAddr?, listenAddr? }) → SwarmState`
- `leaveSwarm(force) → SwarmState`
- `fetchJoinTokens() → { tokens?, unavailableReason? }`
- `rotateJoinToken(target) → { tokens?, unavailableReason? }`
- `fetchSwarmNodes() → SwarmListing<SwarmNode>`
- `updateSwarmNode(id, { role?, availability? }) → SwarmNode`
- `removeSwarmNode(id, force) → void`
- `fetchSwarmServices() → SwarmListing<SwarmService>`
- `fetchSwarmServiceDetail(id) → SwarmServiceDetail`
- `createSwarmService(input) → SwarmService`
- `updateSwarmService(id, input) → SwarmService`
- `removeSwarmService(id) → void`
- `fetchSwarmStacks() → SwarmListing<SwarmStack>`
- `removeSwarmStack(name) → StackRemovalResult`
- `fetchSwarmData(kind) → SwarmListing<SwarmDataItem>` — `kind` is `'secret' | 'config'`
- `createSwarmData(kind, { name, value, labels? }) → SwarmDataItem`
- `removeSwarmData(kind, id) → void`

- every call rejects with an `Error` carrying the server's `error` message, or
  `Request failed with HTTP <status>` when the answer has no JSON body.
- a listing is returned as it comes: `{ items, unavailableReason? }` — an empty list with a reason is
  a **successful** read, not a failure.

## Rules and invariants

- `createSwarmService` and `createSwarmData` both take an optional `labels` map: an object created
  through the application can always be marked as its own by whoever created it.
- The value of a secret or a config is a **request argument only**: `createSwarmData` sends it and
  keeps no reference to it, and no function of this module ever returns one (REQ-84).
- A join token is returned only by the two token functions; nothing caches it at module level.
- There is no deploy function and none that takes a file or a path: stacks are listed and removed
  (departure Three, REQ-83).

## Dependencies

- swarm: Swarm endpoints

## Requirements served

- plan-docker_management_app/REQ-79
- plan-docker_management_app/REQ-80
- plan-docker_management_app/REQ-81
- plan-docker_management_app/REQ-82
- plan-docker_management_app/REQ-83
- plan-docker_management_app/REQ-84
