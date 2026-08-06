---
module: containers
component: Container stats endpoint
type: REST endpoint
---

# Container stats endpoint

**Purpose** → exposes `ContainerStatsService` to the client as a server-sent event stream.

## Contract

- `GET /api/containers/:id/stats/stream` → `200`, `text/event-stream`
  - `sample` events → `data` is a JSON `ContainerStatsSample`
    (`{ at, cpuPercent, memoryUsageBytes, memoryLimitBytes, memoryPercent, networkRxBytes,
    networkTxBytes, blockReadBytes, blockWriteBytes, pids }`).
  - `end` event → sent when the daemon closed the stats stream; `data` is `{}`.
  - `error` event → `data` is `{ message }` carrying the daemon's own message verbatim; sent when
    the stream cannot be opened or fails mid-flight, after which the response is closed.
  - takes no query parameters: the daemon's own sampling cadence is the stream's cadence.

## Rules and invariants

- The response is never buffered: each event is flushed as it is produced.
- When the client disconnects, the daemon stream is cancelled immediately — including when the
  disconnect happens while the stream is still being opened.

## Dependencies

- ContainerStatsService

## Requirements served

- plan-docker_management_app/REQ-32
