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
  - `DaemonEvent`: `{ id, timestamp, type, action, actor? }` — `id` is the identity the server
    minted for the event (events module).
  - `events` holds at most the 50 most recent events, newest first.
- Calling `useDaemonEventStream()` outside a `DaemonEventStreamProvider` throws.

## Rules and invariants

- Subscribes once, on mount, to the daemon events of the **live channel** — the browser's one
  connection — and not to a stream of its own; a new event updates `events` without a manual refresh
  (REQ-11, …-multiplexed_sse/REQ-1, /REQ-26).
- **No two held events share an identity**: an event whose `id` is already held is dropped, and
  `events` is left untouched. The stream can deliver one event twice — the browser reopens a dropped
  connection and the server replays its catch-up backlog — and a list that held it twice would
  render two rows under one key.
- An event's identity does not change while it is held: the same event keeps the same `id` from the
  render that first showed it to the one that drops it off the end of the window. This is what lets
  a consumer key rows on it.
- Every screen showing recent daemon activity reads from this one provider, so the guarantee holds
  for the shell's event panel and the dashboard's recent-events panel alike, without either
  restating it.

## Dependencies

- live-channel: Live channel client (`subscribeToDaemonEvents`)

## Requirements served

- plan-docker_management_app/REQ-11
- plan-docker_management_app/REQ-12
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-26
