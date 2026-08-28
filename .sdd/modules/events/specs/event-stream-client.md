---
module: events
component: subscribeToDaemonEvents, onDaemonObjectTypeChanged, daemonEventConcerns
type: frontend data client
---

# Event stream client

**Purpose** → the client-side half of the live event channel: one shared `EventSource` connection,
fanned out to listeners, plus an invalidation registry keyed by Docker object type.

## Contract

- `subscribeToDaemonEvents(listener): () => void` — opens the shared connection to
  `/api/events/stream` on first use; calls `listener(event)` for every event received (including
  backlogged ones the server sends on connect); returns an unsubscribe function.
  - the event delivered is the server's own `DaemonEvent`, `actorId` included
    (plan-docker_management_app-refresh_cache/REQ-6): the identifier of the object the event is
    about, alongside `actor`, which stays the name-or-id it has always been.
- `onDaemonObjectTypeChanged(objectType, invalidate): () => void` — calls `invalidate()` whenever an
  event whose `type` equals `objectType` arrives, so a view showing that kind of object can re-read
  it automatically (REQ-11); returns an unsubscribe function.
- `daemonEventConcerns(event, identifier): boolean` — whether the event is about the object named by
  `identifier`, so a view showing one object re-reads for its own events alone
  (plan-docker_management_app-refresh_cache/REQ-7).
  - `true` when the event's `actorId`, or its `actor`, names that object
  - `true` when the event carries no `actorId`, or when `identifier` is undefined: an event that
    cannot be attributed is treated as one about the shown object, so no view goes stale by ignoring
    it (plan-docker_management_app-refresh_cache/REQ-8)
  - `false` otherwise — the event is about another object

## Rules and invariants

- A single `EventSource` is shared across all callers in the page: multiple subscribers never open
  multiple connections.
- Two identifiers name one object when they are equal, ignoring case, a leading `sha256:` and
  surrounding blanks, or when the shorter is the truncated form of the longer. Truncation is read
  only into hexadecimal identifiers, and only from 12 characters — Docker's short form — so two
  names sharing a prefix stay two objects.

## Requirements served

- plan-docker_management_app/REQ-11
- plan-docker_management_app/REQ-12
- plan-docker_management_app-refresh_cache/REQ-6
- plan-docker_management_app-refresh_cache/REQ-7
- plan-docker_management_app-refresh_cache/REQ-8
