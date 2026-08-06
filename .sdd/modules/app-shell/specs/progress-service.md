---
module: app-shell
component: ProgressProvider, useProgress
type: frontend service
---

# Progress service

**Purpose** → gives every screen the same pending/progress behavior (REQ-8): a non-instantaneous
operation shows a pending indication and never blocks navigation.

## Contract

- `<ProgressProvider children>` — must wrap any part of the tree that calls `useProgress()`.
- `useProgress(): { pending: PendingOperation[], run(label, task): Promise<T> }`
  - `PendingOperation`: `{ id, label }`.
  - `run(label, task)` adds a pending entry for the duration of `task()`, removes it (success or
    failure) when `task()` settles, and returns/throws whatever `task()` does.
- Calling `useProgress()` outside a `ProgressProvider` throws.

## Rules and invariants

- `run(...)` never prevents the caller, or any other part of the application, from navigating away
  while `task()` is in flight: it only tracks state, it does not gate rendering (REQ-8).

## Requirements served

- plan-docker_management_app/REQ-8
