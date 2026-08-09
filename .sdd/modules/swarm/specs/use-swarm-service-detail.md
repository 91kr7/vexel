---
module: swarm
component: useSwarmServiceDetail
type: frontend hook
---

# useSwarmServiceDetail

**Purpose** → the full reading of one swarm service together with its tasks, for the service the
operator has opened (REQ-82).

## Contract

- `useSwarmServiceDetail(serviceId?: string): { detail, loaded, error?, refresh }`
  - `serviceId` absent → nothing is read; `detail` is undefined, `loaded` false, `error` empty.
  - `detail?: SwarmServiceDetail` — the service, its environment, its labels, its tasks and the
    daemon's own payload.
  - `loaded` — true once the read for the current `serviceId` has settled.
  - `error?` — the message of the last failed read; cleared by the next successful one.
  - `refresh()` — re-reads the currently opened service.
  - changing `serviceId` drops the previous detail immediately: the panel never shows one service's
    tasks under another service's name.

## Rules and invariants

- **An answer that is not the shape it promises is a failed read**: a payload without a service, or
  without a task list and an environment list, is reported through `error` and never stored, so the
  panel is never handed something it cannot render.
- It re-reads on every `service` daemon event while a service is open, so the task list follows the
  cluster converging.
- It re-reads on the active-context broadcast (REQ-93).
- A read that settles after the hook unmounts, or after the opened service changed, updates nothing.

## Dependencies

- swarm: Swarm client
- events: daemon event subscription
- contexts: active-context broadcast

## Requirements served

- plan-docker_management_app/REQ-82
