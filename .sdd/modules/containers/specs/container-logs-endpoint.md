---
module: containers
component: Container logs endpoint
type: REST endpoint
---

# Container logs endpoint

**Purpose** → exposes `ContainerLogsService` to the client as a server-sent event stream.

## Contract

- `GET /api/containers/:id/logs/stream` → `200`, `text/event-stream`
  - query: `stdout`, `stderr`, `follow`, `timestamps` (`"true"`/`"false"`, defaults `stdout=true`,
    `stderr=true`, `follow=true`, `timestamps=false`), `tail` (a positive integer or `all`,
    default `all`), `since`, `until` (ISO-8601 instant or relative duration).
  - `line` events → `data` is a JSON `{ seq, stream, timestamp?, text }`.
  - `end` event → sent when the log stream is exhausted (`follow=false`, or the container's stream
    closed); `data` is `{}`.
  - `error` event → `data` is `{ message }` carrying the daemon's own message verbatim; sent when
    the stream cannot be opened or fails mid-flight, after which the response is closed.

## Rules and invariants

- The response is never buffered: each event is flushed as it is produced.
- When the client disconnects, the daemon stream is cancelled immediately.

## Dependencies

- ContainerLogsService

## Requirements served

- plan-docker_management_app/REQ-30
