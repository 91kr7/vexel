---
module: events
component: GET /api/events/stream
type: REST endpoint
---

# GET /api/events/stream

**Purpose** → exposes `EventStreamService` to the client as a Server-Sent Events stream.

## Contract

- `GET /api/events/stream` → `200`, `Content-Type: text/event-stream`, kept open.
  - On connect, immediately writes one `data:` line per backlogged event, oldest first.
  - After that, writes one `data:` line per live event as it is emitted by `EventStreamService`,
    each line a JSON-encoded `DaemonEvent`.
  - Unsubscribes from `EventStreamService` when the client disconnects.

## Dependencies

- EventStreamService

## Requirements served

- plan-docker_management_app/REQ-11
- plan-docker_management_app/REQ-12
