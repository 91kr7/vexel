---
module: containers
component: useContainerLogs
type: frontend hook
---

# useContainerLogs

**Purpose** → the client-side subscription to a container's log stream: a bounded line buffer fed
without one render per line, automatic reconnection, and a snapshot of the buffer for copy or
download.

## Contract

- `useContainerLogs(id?: string, options?: ContainerLogOptions & { maxLines?: number }):
  { lines: ContainerLogLine[], connected: boolean, ended: boolean, error?: string,
    clear: () => void, restart: () => void, snapshot: () => ContainerLogLine[] }`
  - `lines` — the buffered lines in arrival order, at most `maxLines` (default `5000`).
  - `connected` — true while the stream is open.
  - `ended` — true once the server reported the stream exhausted (`follow` false, or the container's
    output closed).
  - `error` — the last stream failure's message; cleared when a subsequent attempt connects.
  - `clear()` — empties the buffer without closing the stream.
  - `restart()` — closes the current stream and opens a new one, emptying the buffer first.
  - `snapshot()` — returns the current buffer, including lines received but not yet reflected in
    `lines`.

## Rules and invariants

- Lines are applied to `lines` in batches on a short interval rather than one state update per
  line, so a fast-talking container cannot starve the UI.
- The buffer is bounded: once it holds `maxLines`, the oldest lines are dropped as new ones arrive.
- The stream is reopened after an unexpected drop, with a delay that grows with consecutive
  failures and is capped; it is not reopened after an `end` event, nor after the caller unmounts or
  changes `id`.
- Changing `id` or any option empties the buffer and opens a stream for the new parameters.
- The stream is closed when the caller unmounts, and when `id` is `undefined` no stream is opened.

## Dependencies

- Container logs client (containerLogStreamUrl, ContainerLogLine, ContainerLogOptions)

## Requirements served

- plan-docker_management_app/REQ-30
- plan-docker_management_app/REQ-31
