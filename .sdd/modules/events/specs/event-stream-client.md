---
module: events
component: subscribeToDaemonEvents
type: frontend data client
---

# Event stream client

**Purpose** → the client-side half of the live event channel: one shared `EventSource` connection,
fanned out to listeners.

## Contract

- `subscribeToDaemonEvents(listener): () => void` — opens the shared connection to
  `/api/events/stream` on first use; calls `listener(event)` for every event received (including
  backlogged ones the server sends on connect); returns an unsubscribe function.
  - the event delivered is the server's own `DaemonEvent`, `actorId` included
    (plan-docker_management_app-refresh_cache/REQ-6): the identifier of the object the event is
    about, alongside `actor`, which stays the name-or-id it has always been.

## Rules and invariants

- A single `EventSource` is shared across all callers in the page: multiple subscribers never open
  multiple connections.
- The module offers no by-object-type invalidation and no event-attribution test: no view of the
  interface reads its data again because an event arrived, so nothing serves that purpose
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-3).
- The event-feed service of the shell is the only caller in the client
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-13).

## Requirements served

- plan-docker_management_app/REQ-11
- plan-docker_management_app/REQ-12
- plan-docker_management_app-refresh_cache/REQ-6
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-3
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-4
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-13
