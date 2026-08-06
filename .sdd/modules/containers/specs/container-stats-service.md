---
module: containers
component: ContainerStatsService
type: backend service
---

# ContainerStatsService

**Purpose** → the live resource usage of one container: the daemon's raw stats frames turned into
ready-to-display readings, delivered as they arrive and stopped on demand.

## Contract

- `ContainerStatsSample = { at, cpuPercent, memoryUsageBytes, memoryLimitBytes, memoryPercent,
  networkRxBytes, networkTxBytes, blockReadBytes, blockWriteBytes, pids }`
  - `at` — ISO-8601 instant of the frame (the daemon's own reading time; the current time when the
    daemon reports none or an unparseable one).
- `streamContainerStats(id, { onSample, onError, onEnd }) → Promise<cancel>`
  - opens the daemon's streaming stats for `id`; every frame produces exactly one `onSample`.
  - rejects when the stream cannot be opened (unknown container, unreachable daemon) with the
    daemon's own error.
  - `onError(message)` → the stream failed mid-flight; the message is the daemon's, verbatim.
  - `onEnd()` → the daemon closed the stream (e.g. the container stopped).
  - `cancel()` → closes the daemon stream; after it, no handler is called again, and calling it
    twice is harmless.
- `normalizeSample(rawFrame) → ContainerStatsSample` — the frame-to-reading conversion, on its own.

## Rules and invariants

- `cpuPercent` is the usage delta over the system delta, scaled by the number of online CPUs; it is
  `0` whenever either delta is not positive.
- `cpuPercent` is `0` on the first frame of a stream, which has no predecessor: the daemon marks it
  with the sentinel `preread` instant `0001-01-01T00:00:00Z` (or an unparseable one), and its
  `precpu_stats` is a placeholder whose deltas carry no meaning.
- `memoryUsageBytes` excludes page cache, matching what `docker stats` reports as used memory, and
  is never negative.
- `memoryPercent` is usage over limit, and `0` when no limit is known.
- Network counters are the sum over every attached network; block I/O counters are the sums of the
  read and of the write operations. All four are cumulative since the container started, as the
  daemon reports them.
- A missing field in a frame reads as `0` rather than failing the stream; a frame that is not valid
  JSON is skipped.
- Frames are delimited by newlines and reassembled across chunks, so a frame split in transit is
  reported once, whole.

## Dependencies

- docker-access: EngineClient (`requestStream`)

## Requirements served

- plan-docker_management_app/REQ-32
