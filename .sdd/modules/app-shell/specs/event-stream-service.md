---
module: app-shell
component: DaemonEventStreamProvider, useDaemonEventStream
type: frontend service
---

# Event stream service (client)

**Purpose** → keeps the most recent live daemon events available app-wide, newest first, for the
"Daemon event stream" panel and any future screen that shows recent activity (REQ-11, REQ-12).

## Contract

- `<DaemonEventStreamProvider children>` — must wrap any part of the tree that calls
  `useDaemonEventStream()`.
- `useDaemonEventStream(): { events: DaemonEvent[] }`
  - `DaemonEvent`: `{ id, timestamp, type, action, actor? }`.
  - `events` holds at most the 50 most recent events, newest first.
- Calling `useDaemonEventStream()` outside a `DaemonEventStreamProvider` throws.

## Rules and invariants

- Subscribes once, on mount, to the shared live event subscription (data-access); a new event
  updates `events` without a manual refresh (REQ-11).

## Dependencies

- data-access: `subscribeToDaemonEvents`

## Requirements served

- plan-docker_management_app/REQ-11
- plan-docker_management_app/REQ-12
