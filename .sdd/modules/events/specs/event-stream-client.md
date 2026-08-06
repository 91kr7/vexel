---
module: events
component: subscribeToDaemonEvents, onDaemonObjectTypeChanged
type: frontend data client
---

# Event stream client

**Purpose** → the client-side half of the live event channel: one shared `EventSource` connection,
fanned out to listeners, plus an invalidation registry keyed by Docker object type.

## Contract

- `subscribeToDaemonEvents(listener): () => void` — opens the shared connection to
  `/api/events/stream` on first use; calls `listener(event)` for every event received (including
  backlogged ones the server sends on connect); returns an unsubscribe function.
- `onDaemonObjectTypeChanged(objectType, invalidate): () => void` — calls `invalidate()` whenever an
  event whose `type` equals `objectType` arrives, so a view showing that kind of object can re-read
  it automatically (REQ-11); returns an unsubscribe function.

## Rules and invariants

- A single `EventSource` is shared across all callers in the page: multiple subscribers never open
  multiple connections.

## Requirements served

- plan-docker_management_app/REQ-11
- plan-docker_management_app/REQ-12
