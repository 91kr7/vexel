---
module: swarm
component: useSwarm
type: frontend hook
---

# useSwarm

**Purpose** → the whole swarm reading of the active daemon — state, nodes, services, stacks, secrets
and configs — kept current together, plus the mutations over them (REQ-79 to REQ-84).

## Contract

- `useSwarm(): { state, nodes, services, stacks, secrets, configs, loaded, error?, refresh,
  initialise, join, leave, readTokens, rotateToken, updateNode, removeNode, createService,
  updateService, removeService, removeStack, createData, removeData }`
  - `state: SwarmState | undefined` — undefined until the first read settles.
  - `nodes`, `services`, `stacks`, `secrets`, `configs` — each a `{ items, unavailableReason? }`
    listing; on a daemon that is not a manager the items are empty and the reason says why. That is
    a settled reading, not an error.
  - `loaded` — true once the first read has settled, whether it succeeded or not.
  - `error?` — the message of the last failed read (the daemon being unreachable, not the daemon
    being outside a swarm); cleared by the next successful one.
  - `refresh()` — re-reads state and all five listings together.
  - `initialise(input)`, `join(input)`, `leave(force)` → the resulting state, then a refresh.
  - `readTokens(): Promise<SwarmTokensReading>` — reads the join tokens **on demand**; the result is
    handed to the caller and not stored by the hook.
  - `rotateToken(target): Promise<SwarmTokensReading>` — rotates one token and answers with both.
  - `updateNode(id, { role?, availability? })`, `removeNode(id, force)`, `createService(input)`,
    `updateService(id, input)`, `removeService(id)`, `removeStack(name)`,
    `createData(kind, input)`, `removeData(kind, id)` — each performs the change, then refreshes;
    each rejects with the server's message.

## Rules and invariants

- **No join token and no secret value is ever held in this hook's state**: tokens are read on demand
  and returned to the caller, and a created secret's value is a call argument only (REQ-80, REQ-84).
- The five listings and the state are read as one round: the panels of a screen never show two
  different moments of the same cluster.
- **An answer that is not the shape it promises is a failed read**: a listing without an `items`
  array, or a state without a role and a raft reading, is reported through `error` and **never
  stored** — so no panel is ever handed something it cannot render. One malformed answer fails the
  whole round rather than storing a half of it: the panels stay on the last reading they agreed on.
- A daemon outside a swarm is a normal, successful reading — `error` stays empty and each listing
  carries its reason.
- It re-reads on every daemon event of a swarm-related object (`node`, `service`, `secret`,
  `config`), on the active-context broadcast (another context is another daemon, REQ-93) and on a
  bounded poll — the poll being the only way to notice a `docker swarm init` or `join` run from a
  terminal, which emits no event.
- A read that settles after the hook unmounts updates nothing.

## Dependencies

- swarm: Swarm client
- events: daemon event subscription
- contexts: active-context broadcast

## Requirements served

- plan-docker_management_app/REQ-79
- plan-docker_management_app/REQ-80
- plan-docker_management_app/REQ-81
- plan-docker_management_app/REQ-82
- plan-docker_management_app/REQ-83
- plan-docker_management_app/REQ-84
