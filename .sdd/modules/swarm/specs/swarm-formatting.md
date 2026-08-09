---
module: swarm
component: Swarm formatting
type: frontend utility
---

# Swarm formatting

**Purpose** → the few readings the swarm panels all show the same way: an age, a replica count and
the tone a node's or a task's state maps to.

## Contract

- `formatAge(iso?) → string`
  - an ISO timestamp → the mockup's shorthand: `3m ago`, `5h ago`, `18d ago`, `4mo ago`.
  - under a minute → `just now`; absent or unparseable → `—`.
- `formatReplicas(running?, desired?) → string`
  - both known → `running/desired`; only the desired → `?/desired`; neither → `—`.
- `toLabels(pairs) → Record<string, string>`
  - the key/value rows of a label editor as the daemon takes them; a row whose key is blank is
    dropped, and a key is trimmed.
- `nodeStatusTone(status) → StatusTone`
  - `ready` → success; `down` / `disconnected` → danger; anything else → warning.
- `availabilityTone(availability) → BadgeTone`
  - `active` → success; `pause` → warning; `drain` → warning.
- `taskStateTone(state) → StatusTone`
  - `running` / `complete` → success; `failed` / `rejected` / `orphaned` → danger; anything else
    (assigned, preparing, starting, shutdown…) → warning.

## Rules and invariants

- An unknown state is never dropped and never coloured as healthy: it reads as a warning and keeps
  the daemon's own word.

## Requirements served

- plan-docker_management_app/REQ-81
- plan-docker_management_app/REQ-82
- plan-docker_management_app/REQ-84
