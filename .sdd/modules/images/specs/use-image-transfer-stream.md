---
module: images
component: useImageTransferStream
type: frontend hook
---

# useImageTransferStream

**Purpose** → subscribes to a pull or push progress stream and collects its per-layer steps for
display, until the daemon reports completion or failure.

## Contract

- `useImageTransferStream(url: string | undefined): { steps: ImageTransferStep[], done: boolean,
  error?: string }`
  - Passing `undefined` keeps the stream closed and the result at its initial empty/not-done state.
  - `steps` keeps each step id's most recent state (a later `step` event for the same `id` replaces
    its entry in place; a new `id` is appended) — mirrors how Docker re-emits status per layer as a
    pull/push advances.
  - `done` becomes `true` once the stream ends or errors.
  - `error` carries the daemon's failure message when the stream ends in error; `undefined` on a
    clean completion.
- Opening a new `url` (or closing on `undefined`) resets `steps`, `done` and `error`.

## Rules and invariants

- The `EventSource` is closed as soon as the stream reports `end` or `error`, and on unmount — no
  reconnection: a transfer is a one-shot, user-initiated operation, not a long-lived monitor.

## Dependencies

- None (browser `EventSource` against the URL built by the Images client).

## Requirements served

- plan-docker_management_app/REQ-38
- plan-docker_management_app/REQ-39
