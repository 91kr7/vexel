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
- Emits `'event'` with a `DaemonEvent` for every event as it arrives.
  - `DaemonEvent`: `{ id, timestamp (ISO 8601), type, action, actor? }` — `type`/`action` come from
    the daemon's own `Type`/`Action` fields (container, image, network, volume, builder, …); `actor`
    is the object's name when the daemon reports one, else its id.

## Rules and invariants

- On a stream error or the daemon being unreachable, reconnects with exponential backoff (starting
  at 1s, capped at 30s), so the app recovers automatically once the daemon is back (REQ-9, REQ-11).
- A malformed event line is skipped rather than stopping the stream.
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
