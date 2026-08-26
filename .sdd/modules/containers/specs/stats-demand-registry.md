---
module: containers
component: StatsDemandRegistry
type: backend service
---

# StatsDemandRegistry

**Purpose** → the gate in front of the shared per-container stats sampler: a count of the consumers
that are being shown the sampled figures right now, and nothing else decides whether the daemon is
asked for them.

## Contract

- `acquireStatsDemand(): () => void` — registers one live consumer and returns its release.
  - the count rises by one; when it rises **from zero to one** the sampler is started, and a sample
    is taken **immediately** rather than one interval later.
  - the returned release lowers the count by one; when it falls **to zero** the sampler is stopped
    and the daemon is asked for nothing further.
  - the release is **idempotent**: calling it a second time (or a tenth) releases once and cannot
    take the count below what the other consumers hold.
- `statsDemandCount(): number` — how many consumers are proving themselves live at this instant.
- `statsSamplingActive(): boolean` — whether the sampler is running, i.e. whether the daemon is
  being sampled at all.

## Rules and invariants

- It is a **count, not a flag**: two consumers are ordinary, one of them leaving does not stop the
  sampling the other is reading, and the last one leaving is the condition that stops it.
- `statsSamplingActive()` is `true` exactly while `statsDemandCount() > 0`, whatever the sequence of
  acquisitions and releases that led there — the two never disagree, and no route out leaves the
  sampler running with a count of zero.
- Nothing here is called at process boot: a server with no consumer registered has a count of zero
  and issues no stats request of any kind.
- The registry knows nothing of how a consumer proves itself live; holding a connection is the
  endpoint's concern (`container-stats-subscription-endpoint.md`).

## Dependencies

- containers: ContainersService (`startStatsSampling`, `stopStatsSampling`, `isStatsSamplingActive`)

## Requirements served

- plan-docker_management_app-containers_card_view/REQ-40
- plan-docker_management_app-containers_card_view/REQ-41
- plan-docker_management_app-containers_card_view/REQ-44
- plan-docker_management_app-containers_card_view/REQ-46
- plan-docker_management_app-containers_card_view/REQ-47
- plan-docker_management_app-containers_card_view/REQ-51
- plan-docker_management_app-containers_card_view/REQ-54
- plan-docker_management_app-containers_card_view/REQ-58
