---
module: events
component: EventStreamService
type: backend service
---

# EventStreamService

**Purpose** → keeps one live connection to the daemon's event stream and republishes normalized
events to server-side subscribers (REQ-11, REQ-12), independent of how many clients are listening.

## Contract

- `start()` — begins the connect loop; idempotent (a second call is a no-op).
- `getBacklog(): DaemonEvent[]` — the most recent events (up to 50), oldest first, for late
  subscribers to catch up on connect.
- `onConnectionChanged(listener): () => void` — registers `listener` to run whenever this stream's
  own connection to the daemon drops or comes back, with `true`/`false`; returns the unsubscribe
  function. Fires only on a change, never twice for one state.
- `isConnected(): boolean` — whether the stream is currently reading from the daemon.
- Emits `'event'` with a `DaemonEvent` for every event as it arrives.
  - `DaemonEvent`: `{ id, timestamp (ISO 8601), type, action, actor?, actorId? }` — `type`/`action`
    come from the daemon's own `Type`/`Action` fields (container, image, network, volume, builder,
    …); `actor` is the object's name when the daemon reports one, else its id.
  - `actorId` — the identifier of the object the event is about, whatever the daemon reported as its
    name, so a reader can tell two objects of one kind apart
    (plan-docker_management_app-refresh_cache/REQ-6). Absent when the daemon reports no actor id;
    `actor` keeps its own meaning and its fallback unchanged.
  - `id` — the identity of the event: the daemon's nanosecond instant, its scope, its type, its
    action and the actor's id, joined. Two events on one object within the same second therefore
    carry different identities.
  - `timestamp` — the daemon's own instant, to the millisecond when the daemon reports one.

## Rules and invariants

- On a stream error or the daemon being unreachable, reconnects with exponential backoff (starting
  at 1s, capped at 30s), so the app recovers automatically once the daemon is back (REQ-9, REQ-11).
- A malformed event line is skipped rather than stopping the stream.
- The connection state is the stream's own, and it is the cheapest liveness signal the server has:
  the stream is already open against the daemon every other area talks to, so whoever holds a
  reachability answer re-reads on it instead of shortening its own period. Reconnection, backlog and
  republishing are unchanged by this.
- **An identity is minted once, when the event arrives, and never recomputed**: the same event
  carries the same `id` on every emission and every appearance in the backlog, so a subscriber
  reading it twice can recognize it as one event.
- Two events differing in instant, scope, type, action or actor have different identities. In
  particular, a stop and a start on the same container inside one second are two identities: the
  daemon's `time` has second resolution and cannot separate them, its nanosecond stamp can, and the
  nanosecond digits are taken from the raw line because a double rounds the last of them away.
- When the daemon reports no nanosecond stamp, the identity carries a monotonic arrival ordinal
  instead. Nothing in such an event separates two identical actions on one object in one second, so
  the component is synthesised — but on the server, once, at arrival, so it travels with the event
  and is identical for every delivery (a counter kept by a reader would differ between them).
- `actorId` is a published field only: the event's identity is built from the actor's id already and
  is unaffected by it.
- The backlog never grows past 50 entries (oldest dropped first).
- When the active context changes, the stream of the daemon left behind is dropped and a new one is
  opened against the newly active daemon **at once**, without waiting out the pending backoff — and
  without entering the backoff the dropped stream would otherwise have started, whether the switch
  lands while a stream is live or while one is being waited for (REQ-93). The backlog is emptied at
  the same time: those events describe another daemon's objects.

## Dependencies

- docker-access: EngineClient (the shared, active-context client), Active endpoint

## Requirements served

- plan-docker_management_app/REQ-11
- plan-docker_management_app/REQ-12
- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache/REQ-6
- plan-docker_management_app-refresh_cache/REQ-15
