---
module: containers
component: useContainerStats
type: frontend hook
---

# useContainerStats

**Purpose** → the client-side subscription to a container's live resource usage: the latest reading
plus a bounded history of recent samples for the sparklines, kept updated while the caller is
mounted and dropped as soon as it is not.

## Contract

- `useContainerStats(id?: string, options?: { maxSamples?: number, enabled?: boolean }):
  { latest?: ContainerStatsSample, samples: ContainerStatsSample[], connected: boolean,
    ended: boolean, error?: string, restart: () => void }`
  - `samples` — the retained history in arrival order, at most `maxSamples` (default `60`).
  - `latest` — the most recent sample, `undefined` until the first one arrives.
  - `connected` — true while the stream is open.
  - `ended` — true once the server reported the stream exhausted (e.g. the container stopped).
  - `error` — the last stream failure's message; cleared when a subsequent attempt connects.
  - `restart()` — closes the current stream and opens a new one, emptying the history first.
  - `enabled` (default `true`) — `false` opens no stream and closes an open one.

## Rules and invariants

- Samples are applied in batches on a short interval rather than one state update per sample.
- The history is bounded: once it holds `maxSamples`, the oldest samples are dropped as new ones
  arrive.
- The stream is reopened after an unexpected drop, with a delay that grows with consecutive failures
  and is capped; it is not reopened after an `end` event, nor after the caller unmounts, changes
  `id`, or disables it.
- Changing `id`, `enabled` or `maxSamples` empties the history and re-opens accordingly.
- The stream is closed when the caller unmounts — leaving the view is what stops the daemon-side
  streaming (the endpoint cancels on disconnect); when `id` is `undefined` no stream is opened.

## Dependencies

- Container stats client (containerStatsStreamUrl, ContainerStatsSample)

## Requirements served

- plan-docker_management_app/REQ-32
