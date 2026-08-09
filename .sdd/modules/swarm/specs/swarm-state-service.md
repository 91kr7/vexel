---
module: swarm
component: SwarmStateService
type: backend service
---

# SwarmStateService

**Purpose** → the swarm state of the active daemon (inactive / manager / worker, cluster id, node
count, raft health), the operations that change that state (initialise, join, leave) and the join
tokens with their rotation. It also owns the rule every other swarm reading follows: a reading that
only a manager can serve degrades to a **stated reason**, never to an error and never to an empty
panel.

## Contract

- `getSwarmState() → SwarmState`
  - `SwarmState` = `{ role, localNodeState, manager, clusterId?, nodeId?, nodeCount?,
    managerCount?, raft: { status, detail }, unavailableReason?, error? }`.
  - `role` → `'inactive' | 'manager' | 'worker'`; `manager` is true only when the daemon carries the
    control plane.
  - `localNodeState` → the daemon's own word for it (`inactive`, `pending`, `active`, `error`,
    `locked`), passed through unchanged.
  - `clusterId`, `nodeCount`, `managerCount` → present only when the daemon reports them (a worker
    knows neither the cluster id nor the node count).
  - `raft.status` → `'healthy'` when every manager is reachable and one of them is the leader;
    `'degraded'` when a manager is unreachable or there is no leader, `detail` naming which;
    `'unknown'` off a manager or when the node listing itself failed, `detail` carrying the reason.
  - `unavailableReason` → why manager-only readings cannot be served here; absent on a manager.
  - never rejects because the daemon is not in a swarm — that is a state, not a failure. It rejects
    only when the daemon itself is unreachable.
- `getJoinTokens() → { tokens?: { worker, manager }, unavailableReason? }`
  - on a manager: both tokens.
  - otherwise: no tokens and the stated reason.
- `rotateJoinToken(target: 'worker' | 'manager') → { tokens?, unavailableReason? }`
  - rotates that one token and answers with both current tokens.
  - the other token is left as it is.
  - rejects if the daemon is not a manager → the reason it states.
- `initialiseSwarm({ advertiseAddr?, listenAddr? }) → SwarmState`
  - effect: this daemon becomes the first manager of a new swarm.
  - rejects if it is already in a swarm → the daemon's own message.
- `joinSwarm({ remoteAddrs, joinToken, advertiseAddr?, listenAddr? }) → SwarmState`
  - effect: this daemon joins the swarm the token belongs to, as the role the token carries.
  - rejects on an empty `remoteAddrs` or an empty `joinToken`, and on the daemon's refusal.
- `leaveSwarm(force) → SwarmState`
  - effect: this daemon leaves the swarm; `force` is what a last manager needs to leave.
  - rejects if the daemon is not in a swarm.
- `managerScoped<T>(read: () => Promise<T[]>) → { items: T[], unavailableReason? }`
  - on a manager: `{ items }` from `read`.
  - off a manager: `{ items: [], unavailableReason }` — `read` is never called.
  - when the daemon refuses the read *because* this node is not a manager (a state change between
    the two calls): `{ items: [], unavailableReason }` carrying the daemon's own message.
  - any other failure propagates.
- `requireManager()` → resolves on a manager; otherwise rejects with the stated reason, as a
  daemon-rejection carrying HTTP 409.

## Rules and invariants

- **A join token is a credential**: it is returned only to the one endpoint that asks for it, is
  never logged, and never appears in the swarm state or in any error message this service builds.
- The state is read from the daemon's own `info`, so it is available whatever the swarm state —
  including `inactive`, where every manager-only Engine API route answers 503.
- `unavailableReason` says which of the three cases holds and what to do about it: not in a swarm
  (initialise or join), a worker (only a manager can read the cluster), or a swarm that is pending,
  locked or in error (the daemon's own state, with its error message when it reports one).
- Raft health is derived, not reported: the daemon exposes no single health flag, so it comes from
  the reachability and leadership the node listing carries. A derived `unknown` states why.
- `initialiseSwarm` never forces a new cluster out of an existing one: recovering a lost quorum is a
  destructive, out-of-band operation and is not offered here.

## Dependencies

- docker-access: EngineClient (active context), typed daemon error

## Requirements served

- plan-docker_management_app/REQ-79
- plan-docker_management_app/REQ-80
