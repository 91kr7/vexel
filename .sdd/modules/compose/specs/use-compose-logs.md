---
module: compose
component: useComposeLogs
type: frontend hook
---

# useComposeLogs

**Purpose** → subscribes to a compose project's aggregated log stream, each line carrying its own
service, with a bounded buffer and reconnection.

## Contract

- `useComposeLogs(projectName, maxLines?): { lines, connected, ended, error?, clear, restart }`
  - `lines: { seq, service, timestamp?, text }[]`, capped at `maxLines` (default `5000`), oldest
    dropped first.
  - Reconnects with backoff after an unexpected drop; `restart()` forces a fresh connection.
  - A change of `projectName` discards the buffer and opens a new stream.

## Dependencies

- compose: Compose client (`composeLogsStreamUrl`)

## Requirements served

- plan-docker_management_app/REQ-78
