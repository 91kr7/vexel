---
module: refresh-cache
component: Refresh cache
type: backend service
---

# Refresh cache

**Purpose** → the one place on the server where a value the interface asks for repeatedly is held and
kept current. A caller registers a **kind** of data — a way to read it and a period — and from then
on asks the cache instead of the daemon. Generic: it knows no Docker vocabulary and no HTTP.

The name departs from the request's own words on purpose: "daemon" already means the Docker daemon
in this product, and "cache" alone would be read as the image analysis cache. The background workers
are **refreshers**, one per kind.

## Contract

- `registerRefreshKind({ key, read, periodMs, eventTypes?, demandExpiryMs?, groupingWindowMs? }) → RefreshKind`
  - `key` names the kind; registering the same key twice is a programming error and throws
  - `read` is the function that produces the value; the cache never interprets it
  - `eventTypes` are the daemon event types that mark this kind due; none by default
  - `demandExpiryMs` and `groupingWindowMs` default to the values under "Rules and invariants" and
    exist so a check can register a kind with its own timings
  - no daemon call is made by registering: nothing is read until the kind is first asked for

- `RefreshKind.read() → { value, readAt, ageMs, stale, error? }`
  - `readAt` is when the value was read (epoch ms), `ageMs` how old it is at this call
  - `stale` is true when the last read attempt failed and this is the previous value; `error` is
    that failure's message
  - renews the kind's demand and starts its refresher if it was not running
  - answers **from the held value, without calling the daemon**, except in the two cases below
  - **no value has ever been held** → waits for a read; a read already running is joined rather than
    started again, so two callers arriving together cost one read
  - **the kind was marked changed and the held value predates that change** → waits for the read
    covering the change, which is already running; it never starts one on the caller's behalf
  - a read failing while a value is held never turns the answer into a failure: the held value is
    returned with `stale` true
  - a read failing when no value has ever been held rethrows that failure unchanged, so the caller
    still maps a daemon error the way it does today

- `RefreshKind.markChanged()`
  - states that the application itself has just changed this data, and that any value read before
    now does not describe it
  - reads again at once, without waiting for the period and without the grouping window
  - does nothing while nobody is asking for the kind: there is no held value to correct

- `RefreshKind.peek() → held value or undefined` — what is held right now, without asking for it and
  without renewing demand. For checks and for a caller that must not start a refresher.
- `RefreshKind.isRefreshing() → boolean` — whether a refresher is running for this kind.
- `RefreshKind.dispose()` — stops the refresher, drops the held value and unregisters the kind.

- `discardHeldValues()` — drops every held value of every kind at once
  - runs by itself whenever the active Docker endpoint changes
  - a read that was in flight when it ran no longer stores its result
  - the refreshers keep running: the interface is still asking, and what it is asking about is now
    the other daemon

- `resetRefreshCache()` — puts every kind back to the state it had when it was registered: nothing
  held, no refresher running, no demand. The seam a check uses between two cases, so neither
  inherits what the other read.

- `reloadHeldValues() → { reloaded: string[], skipped: string[], failed: { key, error }[] }` — the
  operator's "read it all again now"
  - reads again, at once, every kind that currently holds a value, whatever kind it is
  - a kind holding nothing is **skipped**, not read: nobody is asking for it
  - ends only when every one of those reads has ended
  - a read that fails leaves the kind's held value untouched and is listed under `failed`; the
    operation itself never throws
  - changes nothing else about the cache: no period restarted, no refresher started, no demand
    renewed, no event subscription touched

- `POST /api/refresh` → runs that reload
  - request: no body
  - `200` → `{ ok, reloaded, skipped, failed }`; `ok` is false when at least one read failed. The
    response is written only once the reload has ended, so a client that has this answer knows the
    values it will be served next are the reloaded ones.

- `sendHeld(response, held)` — writes a held value as the body of an HTTP response and its read time
  as headers
  - body → `held.value` as JSON, **unchanged**: no endpoint's body shape moves because of the cache
  - `X-Vexel-Read-At` → the ISO-8601 instant the value was read
  - `X-Vexel-Age-Ms` → its age in milliseconds
  - `X-Vexel-Stale` → `true`, only when the last read attempt failed

## Rules and invariants

- **One refresher per kind, never one for all of them.** Each has its own timer and its own read, so
  a read that blocks delays its own kind and no other.
- A refresher runs on a chained timer, never a repeating one: a read taking longer than the period
  is never overlapped by the next tick, and no backlog of ticks accumulates.
- **Demand gate** — a kind is refreshed only while it is being asked for. `read()` renews the
  demand; when a whole `demandExpiryMs` (default **60 s**) passes with no `read()`, the refresher
  stops **and the held value is dropped**, so the next `read()` reads fresh rather than serving a
  value of unknown age. While no kind is demanded the cache calls nothing at all.
  - 60 s is longer than the longest interval a client polls at (15 s), so a slowly polled kind never
    expires between two of its own requests.
- **Event grouping** — at most one read is *started* per `groupingWindowMs` (default **750 ms**) per
  kind, however many events arrive. A burst produces one read at once and, only if further events
  landed after that read had begun, one more when the window ends — never one read per event. The
  first read of a burst starts immediately: an event is how something done outside the application
  reaches the interface, and delaying it would make the product slower than it is today.
- **Timers never hold the process open**: every timer is unreferenced, so a server with nothing else
  to do still exits.
- A read whose result arrives after `discardHeldValues()` is thrown away rather than stored: no
  value read from the daemon left behind is ever served.
- The cache holds nothing on disk. A restarted server has read nothing, and every kind takes the
  first-request path once.
- The event subscription is a single listener on the republished daemon event stream, whatever the
  number of registered kinds.
- A manual reload never joins a read that started before the request was made: when the read it
  awaited turns out to be an older one, it reads once more. Otherwise "read it all again now" could
  be answered with a value read seconds before the operator pressed anything.

## Dependencies

- Active endpoint (module `docker-access`) — the change notification the discard runs on.
- Event stream (module `events`) — the republished daemon events that mark kinds due.

## Requirements served

- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-10
- plan-docker_management_app-refresh_cache/REQ-11
- plan-docker_management_app-refresh_cache/REQ-12
- plan-docker_management_app-refresh_cache/REQ-13
- plan-docker_management_app-refresh_cache/REQ-14
- plan-docker_management_app-refresh_cache/REQ-15
- plan-docker_management_app-refresh_cache/REQ-16
- plan-docker_management_app-refresh_cache/REQ-17
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-7
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-8
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-9
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-10
