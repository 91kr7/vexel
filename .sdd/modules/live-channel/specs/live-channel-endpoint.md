---
module: live-channel
component: GET /api/live
type: REST endpoint
---

# GET /api/live

**Purpose** → the one connection a window opens: the daemon events and every value the server holds,
on a single Server-Sent Events stream.

## Contract

- `GET /api/live` → `200`, `Content-Type: text/event-stream`, kept open.
  - `event: daemon-event` → one normalized daemon event, JSON-encoded in `data`, preceded by an
    `id:` line carrying the event's identity. On connect the backlog is written first, oldest first.
  - `event: value` → one value the server holds; `data` is `{"name": <which value>, "value": <the
    value>}`. Every value held is written on connect, and each one again whenever it changes.
  - `event: discarded` → the values held are gone, the active context having changed. What follows
    are the new context's values as they arrive.
  - `event: reloaded` → a manual reload has ended; the values it changed were written before it.
  - `Last-Event-ID` (sent by a browser reopening a dropped channel) → the daemon-event catch-up
    resumes just after the event named. An identity the backlog no longer holds → the whole backlog,
    as on a first connect.
  - Unsubscribes from the daemon events and closes its channel when the client disconnects.

## Rules and invariants

- Only a daemon event carries an `id:` line, so `Last-Event-ID` names a daemon event and value
  traffic never moves the resumption point.
- The client says nothing about which values its screen needs: every channel carries every value.
- A channel that opens before the server holds anything is written no value message, and is written
  each one as it arrives.
- An identity never breaks the frame: it is written on a single line.

## Dependencies

- Held value publisher
- EventStreamService (module `events`)

## Requirements served

- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-1
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-2
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-3
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-5
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-8
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-26
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-32
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-40
