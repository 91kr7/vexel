---
module: events
component: GET /api/events/stream
type: REST endpoint
---

# GET /api/events/stream

**Purpose** → exposes `EventStreamService` to the client as a Server-Sent Events stream.

## Contract

- `GET /api/events/stream` → `200`, `Content-Type: text/event-stream`, kept open.
  - On connect, immediately writes the backlogged events, oldest first.
  - After that, writes one event per live event as it is emitted by `EventStreamService`.
  - Every event is written as an `id:` line carrying the event's identity followed by a `data:` line
    carrying the JSON-encoded `DaemonEvent`.
  - `Last-Event-ID` (sent by a browser reopening a dropped stream) → the catch-up resumes just after
    the event named, so an event already delivered is not sent again. An identity the backlog no
    longer holds → the whole backlog is sent, as on a first connect.
  - Unsubscribes from `EventStreamService` when the client disconnects.

## Rules and invariants

- An identity never breaks the frame: it is written on a single line.

## Dependencies

- EventStreamService

## Requirements served

- plan-docker_management_app/REQ-11
- plan-docker_management_app/REQ-12
