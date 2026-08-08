---
module: compose
component: useComposeLifecycle
type: frontend hook
---

# useComposeLifecycle

**Purpose** → drives compose stack lifecycle and per-service scaling; never throws at the caller.

## Contract

- `useComposeLifecycle(onResult, onError): { runningProjects, up, down, restart, scale }`
  - `onResult(project)` fires with the resulting project on every successful command.
  - `onError(message)` fires with the daemon's own message on a refusal.
  - `up(name)`, `down(name)`, `restart(name)`, `scale(name, service, replicas)` — each resolves with
    the resulting project, or `undefined` on failure (the failure having already reached `onError`).
  - `runningProjects: string[]` — names of the projects with a command currently in flight, for
    disabling their own lifecycle/scale controls while busy.

## Dependencies

- compose: Compose client

## Requirements served

- plan-docker_management_app/REQ-76
