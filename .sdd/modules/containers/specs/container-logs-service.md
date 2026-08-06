---
module: containers
component: ContainerLogsService
type: backend service
---

# ContainerLogsService

**Purpose** → streams a container's log output from the Engine API as discrete, stream-tagged
lines, and stops cleanly as soon as the consumer cancels.

## Contract

- `streamContainerLogs(id, options, handlers) → Promise<() => void>`
  - `options: { stdout?: boolean, stderr?: boolean, follow?: boolean, timestamps?: boolean,
    tail?: number | 'all', since?: string, until?: string }`
    - `stdout`/`stderr` default to `true`; at least one is requested (both false is treated as both
      true).
    - `follow` (default `true`) keeps the stream open for new output; when false the stream ends
      after the existing output.
    - `tail` (default `'all'`) limits the output to the last `n` lines.
    - `since`/`until` bound the output in time; each accepts an ISO-8601 instant or a relative
      duration (`30s`, `5m`, `2h`, `1d`), the latter meaning "that long before now".
  - `handlers: { onLine(line), onError(message), onEnd() }`
    - `line: { seq: number, stream: 'stdout' | 'stderr', timestamp?: string, text: string }` —
      `seq` increases by one per line over the life of one stream; `timestamp` is the RFC 3339
      instant Docker prefixed to the line, present only when `timestamps` was requested, and is not
      repeated inside `text`.
  - resolves with a cancel function; calling it stops the stream and releases the daemon
    connection, and no further handler is invoked afterwards.
  - rejects when the daemon refuses the request (unknown container, unreachable daemon) with the
    daemon's own error.

## Rules and invariants

- One `onLine` per log line: partial output arriving split across chunks is buffered until the line
  is complete, and a trailing incomplete line is emitted when the stream ends.
- Both multiplexed (non-TTY) and raw (TTY) Docker log streams are decoded; for a TTY container
  every line is tagged `stdout`, since the daemon does not separate the streams.
- `onEnd` fires exactly once, when the daemon closes the stream, and never after a cancel.
- An invalid `since`/`until` value is ignored rather than failing the stream.

## Dependencies

- docker-access: EngineClient (via `getEngineClient`)

## Requirements served

- plan-docker_management_app/REQ-30
