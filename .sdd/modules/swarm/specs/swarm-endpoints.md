---
module: swarm
component: Swarm endpoints
type: REST endpoint
---

# Swarm endpoints

**Purpose** → exposes the swarm state, its join tokens, and the node, service, stack, secret and
config inventories with their operations (REQ-79 to REQ-84).

## Contract

Every listing answers `200` with `{ items, unavailableReason? }`: on a daemon that is not a swarm
manager the items are empty and `unavailableReason` says why, so no reading of this area ever
surfaces as an error. Every mutation answers `409` with that same reason when it needs a manager and
this daemon is not one.

Any other daemon-side failure on any endpoint below → **`502`, or the error's own status code when
the daemon gave one** (a swarm operation refused by a daemon outside a swarm comes back as the
daemon's `503`), with `{ error: message }` carrying the daemon's own message verbatim.

- `GET /api/swarm` → the swarm state
  - `200` → `SwarmState` (role, localNodeState, manager, clusterId?, nodeId?, nodeCount?,
    managerCount?, raft, unavailableReason?, error?) — for an inactive daemon too.
  - the daemon being unreachable is a failure, per the rule above.
- `POST /api/swarm/init` → initialises a swarm
  - request: `{ advertiseAddr?, listenAddr? }`; `200` → the resulting state; a refusal (e.g. already
    in a swarm) per the rule above.
- `POST /api/swarm/join` → joins a swarm with a token
  - request: `{ remoteAddrs: string[], joinToken, advertiseAddr?, listenAddr? }`.
  - `200` → the resulting state; `400` → no address or no token.
- `POST /api/swarm/leave` → leaves the swarm
  - request: `{ force? }`; `200` → the resulting state; a daemon outside a swarm refuses with its
    own status and message, per the rule above.
- `GET /api/swarm/tokens` → the join tokens
  - `200` → `{ tokens?: { worker, manager }, unavailableReason? }`.
- `POST /api/swarm/tokens/rotate` → rotates one token
  - request: `{ target: 'worker' | 'manager' }`; `200` → both current tokens; `400` → an unknown
    target; `409` → not a manager.
- `GET /api/swarm/nodes` → `200` → `{ items: SwarmNode[], unavailableReason? }`.
- `POST /api/swarm/nodes/:id/update` → request `{ role?, availability? }`; `200` → the updated node;
  `400` → an unknown role or availability; `409` → not a manager.
- `DELETE /api/swarm/nodes/:id?force=` → `204`; `409` → not a manager.
- `GET /api/swarm/services` → `200` → `{ items: SwarmService[], unavailableReason? }`.
- `POST /api/swarm/services` → request `{ name, image, mode, replicas?, env?, ports?, labels? }`;
  `200` → the created service; `400` → a missing name/image or an unknown mode; `409` → not a
  manager. `labels` is read the same way as on the secret and config creations: string entries only,
  anything else ignored.
- `GET /api/swarm/services/:id` → `200` → `{ service, env, labels, tasks, raw }`; `409` → not a
  manager; an unknown service comes back as the daemon's own refusal, per the rule above.
- `POST /api/swarm/services/:id/update` → request `{ image?, replicas?, env?, ports? }`; `200` → the
  updated service; `409` → not a manager, or replicas asked of a global service.
- `DELETE /api/swarm/services/:id` → `204`.
- `GET /api/swarm/stacks` → `200` → `{ items: SwarmStack[], unavailableReason? }`.
- `DELETE /api/swarm/stacks/:name` → `200` → what was removed (services, secrets, configs,
  networks); `409` → not a manager.
- `GET /api/swarm/secrets`, `GET /api/swarm/configs` → `200` → `{ items: SwarmDataItem[],
  unavailableReason? }`.
- `POST /api/swarm/secrets`, `POST /api/swarm/configs` → request `{ name, value, labels? }`
  - `200` → the created object's **metadata only**; `400` → a missing name or value; `409` → not a
    manager; a name already taken comes back as the daemon's own refusal, per the rule above.
- `GET /api/swarm/secrets/:id`, `GET /api/swarm/configs/:id` → `200` → metadata only.
- `DELETE /api/swarm/secrets/:id`, `DELETE /api/swarm/configs/:id` → `204`.

## Rules and invariants

- **No response of this router ever carries a secret's or a config's value**, in a success answer or
  in an error one; the creation endpoints are the only place a value is accepted, and they accept it
  in a request body (REQ-84).
- The join tokens are returned by the two token endpoints alone, and by nothing else: they are not
  part of the state, of a node, or of any listing (REQ-80).
- **No endpoint here takes a compose file, a file path or a stack definition**: stacks are listed and
  removed, never deployed (departure Three, REQ-83).
- A path parameter is passed to the daemon as an id or a name and never interpolated raw; a stack
  name selects objects through the daemon's own label filter.
- **Every creation of this router accepts labels** — services, secrets and configs alike: an object
  created through the application must be markable as its own by whoever created it, or nothing can
  prove later that it is theirs to remove.

## Dependencies

- swarm: SwarmStateService, SwarmNodesService, SwarmServicesService, SwarmStacksService,
  SwarmSecretsService
- docker-access: typed daemon error (status mapping)

## Requirements served

- plan-docker_management_app/REQ-79
- plan-docker_management_app/REQ-80
- plan-docker_management_app/REQ-81
- plan-docker_management_app/REQ-82
- plan-docker_management_app/REQ-83
- plan-docker_management_app/REQ-84
