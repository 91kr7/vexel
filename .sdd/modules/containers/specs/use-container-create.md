---
module: containers
component: useContainerCreate
type: frontend hook
---

# useContainerCreate

**Purpose** → drives one container creation: the phase it is in, the pull progress while the image
is being fetched, and the daemon's refusal when there is one — exposed as state rather than thrown,
so the submitting form keeps everything the operator entered.

## Contract

- `useContainerCreate(onCreated?) → { phase, pullSteps, rejection?, submit, reset }`
  - `phase: 'idle' | 'pulling' | 'creating' | 'created' | 'rejected'`.
  - `pullSteps` — one entry per pull step id, each holding that id's most recent state; empty when
    the image was already present locally.
  - `rejection?` — the daemon's own message, present only in the `rejected` phase.
  - `submit(spec) → Promise<ContainerCreateResult | undefined>` — resolves with the created
    container, or with `undefined` when the daemon refused.
  - `reset()` — back to `idle`, with no steps and no rejection.
  - `onCreated?` — called once, after a successful creation (e.g. to re-read the container list).

## Rules and invariants

- `submit` never rejects: a refusal becomes `rejection` plus the `rejected` phase, so the caller's
  form is never unmounted or cleared by an unhandled error.
- Each `submit` clears the previous run's steps and rejection before starting.

## Dependencies

- Container create client

## Requirements served

- plan-docker_management_app/REQ-27
- plan-docker_management_app/REQ-28
- plan-docker_management_app/REQ-29
