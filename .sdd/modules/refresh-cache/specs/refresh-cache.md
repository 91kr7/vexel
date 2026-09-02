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

- `registerRefreshKind({ key, read, periodMs, eventTypes?, derivedFrom?, differs?, announce?, demandExpiryMs?, groupingWindowMs? }) → RefreshKind`
  - `key` names the kind; registering the same key twice is a programming error and throws
  - `read` is the function that produces the value; the cache never interprets it
  - `periodMs` is the period the caller wants **at the operator's factor of `1`**: the cache puts it
    on this process's clock, like every other server cadence. At a factor of `0.2` a declared 30 s
    kind refreshes every 6 s. A kind cannot be declared off the clock the rest of the process runs on
  - `eventTypes` are the daemon event types that mark this kind due; none by default
  - `derivedFrom` is the **key** of the kind this one is derived from: when that kind stores a value
    **its own `differs` calls different** from the one it held, this kind is marked due, exactly as a
    daemon event marks it due. Declared on the derived kind and named by key, so the two register in
    either order and the source needs to know nothing about who derives from it. A key naming no
    registered kind is inert.
  - `differs(previous, next) → boolean` states whether a value just read differs from the one it
    replaces, **as far as whoever derives from this kind is concerned**. It is the source kind's own
    declaration, never the cache's: the cache holds values and does not read them
  - `announce(value) → unknown` is what a subscriber is told this kind stored, when that is not the
    value held itself: a kind holding the daemon's own response announces the projection its
    consumers read. Undeclared, what is announced is what is held
  - `demandExpiryMs` and `groupingWindowMs` default to the values under "Rules and invariants" and
    exist so a check can register a kind with its own timings
  - no daemon call is made by registering: nothing is read until the kind is first asked for

- `RefreshKind.read({ coverNotices? }?) → { value, readAt, ageMs, stale, error? }`
  - `readAt` is when the value was read (epoch ms), `ageMs` how old it is at this call
  - `stale` is true when the last read attempt failed and this is the previous value; `error` is
    that failure's message
  - renews the kind's demand and starts its refresher if it was not running
  - answers **from the held value, without calling the daemon**, except in the cases below
  - **no value has ever been held** → waits for a read; a read already running is joined rather than
    started again, so two callers arriving together cost one read
  - **the kind was marked changed and the held value predates that change** → waits for the read
    covering the change, which is already running; it never starts one on the caller's behalf
  - **`coverNotices` was asked for and the held value predates the last notice the kind held when
    this call arrived** → waits for the read that notice already caused, and starts none. See
    "Notice coverage" below. Not asking is the default, and a caller that does not ask is answered
    exactly as it is without the option
  - a read failing while a value is held never turns the answer into a failure: the held value is
    returned with `stale` true
  - a read failing when no value has ever been held rethrows that failure unchanged, so the caller
    still maps a daemon error the way it does today
  - **the read it was waiting on was disowned by a discard** (the active endpoint changed while it
    was in flight, so it stored neither a value nor a failure) → reads again, against the endpoint
    now active, and answers with that value or with that daemon's own failure. It is never answered
    with "the value could not be read", which is what neither of the two would mean (REQ-27). Up to
    three such attempts, so a chain of discards cannot hold the caller indefinitely

- `RefreshKind.markChanged()`
  - states that the application itself has just changed this data, and that any value read before
    now does not describe it
  - reads again at once, without waiting for the period and without the grouping window
  - does nothing while nobody is asking for the kind: there is no held value to correct

- `RefreshKind.peek() → held value or undefined` — what is held right now, without asking for it and
  without renewing demand. For checks and for a caller that must not start a refresher.

- `RefreshKind.hold() → release()` — keeps this kind read **without reading it**: for a caller that
  wants the values announced rather than returned
  - starts the refresher if it was not running, and reads once when the kind holds nothing
  - the kind's demand never expires while one hold is live, however long nobody calls `read()`
  - `release()` gives the hold up; releasing twice releases once. When the last hold is given up the
    kind expires exactly as it does with no caller at all
  - after a discard, a kind with a live hold reads again at once instead of waiting for its period:
    a holder is told what is stored, and a discard leaves it nothing to be told about

- `holdEveryKind() → release()` — one hold on every registered kind, released together. However many
  callers want the values kept current, the number of them changes nothing about how often Docker is
  read.
- `RefreshKind.isRefreshing() → boolean` — whether a refresher is running for this kind.
- `RefreshKind.dispose()` — stops the refresher, drops the held value and unregisters the kind.

- `discardHeldValues()` — drops every held value of every kind at once
  - runs by itself whenever the active Docker endpoint changes
  - a read that was in flight when it ran no longer stores its result
  - the refreshers keep running: the interface is still asking, and what it is asking about is now
    the other daemon

- `onValueStored(listener) → unsubscribe` — told `{ key, value, readAt }` for **every value a kind
  stores**, right after it is stored. `value` is the kind's own `announce` projection when it
  declared one, else the value held. The announcement starts no read, and a listener that throws is
  not the read's failure.
- `onHeldValuesDiscarded(listener) → unsubscribe` — told once whenever `discardHeldValues()` has run.
- `onReloadEnded(listener) → unsubscribe` — told when `reloadHeldValues()` has ended, after every
  value that reload stored has been announced. What says a value that produced no announcement was
  not changed by it.

- `resetRefreshCache()` — puts every kind back to the state it had when it was registered: nothing
  held, no refresher running, no demand and no hold. The seam a check uses between two cases, so neither
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

- **Every period this cache runs on is a declared figure the process's timing scale multiplies** —
  the two defaults below, and each kind's own `periodMs`. At the operator's factor of `1` they are
  exactly the figures declared; at any other factor every cadence of the process moves together, so
  the ratios they are chosen for — the expiry longer than the slowest client poll, the coverage wait
  counted in grouping windows, a kind refreshed faster than the check watching it waits — hold
  without a second decision. A `demandExpiryMs` or `groupingWindowMs` passed explicitly is the
  exception and is taken as written: it exists so a check can pin its own timings.
- **One refresher per kind, never one for all of them.** Each has its own timer and its own read, so
  a read that blocks delays its own kind and no other.
- A refresher runs on a chained timer, never a repeating one: a read taking longer than the period
  is never overlapped by the next tick, and no backlog of ticks accumulates.
- **Demand gate** — a kind is refreshed only while it is being asked for. `read()` renews the
  demand and `hold()` suspends its expiry; when a whole `demandExpiryMs` (default **60 s**) passes
  with no `read()` and no hold live, the refresher stops **and the held value is dropped**, so the
  next `read()` reads fresh rather than serving a value of unknown age. While no kind is demanded the
  cache calls nothing at all.
  - 60 s is longer than the longest interval a client polls at (15 s), so a slowly polled kind never
    expires between two of its own requests.
- **Event grouping** — at most one read is *started* per `groupingWindowMs` (default **750 ms**) per
  kind, however many events arrive. A burst produces one read at once and, only if further events
  landed after that read had begun, one more when the window ends — never one read per event. The
  first read of a burst starts immediately: an event is how something done outside the application
  reaches the interface, and delaying it would make the product slower than it is today.
- **A replaced value tells whoever derived from it.** When a kind stores a value its own `differs`
  calls different from the one it held, every kind that declared itself `derivedFrom` this one is
  marked due and reads again within a grouping window. Their reads go through the ordinary path: the
  demand gate applies (a derived kind nobody is asking for is not read), the grouping window applies,
  and a derived kind whose read is in flight on the value just replaced reads once more when it ends.
  - **A value found no different tells nobody.** A kind read again on its own period and unchanged
    drags no derived read behind it, however many kinds derive from it.
  - **A first value tells nobody.** With nothing held before it, there is no earlier copy anyone can
    have derived from — and that includes the first value after a discard.
  - **The cache compares nothing it was not given a comparison for.** Without `differs` a kind never
    notifies, whoever declares themselves derived from it: what "different" means belongs to the
    kind whose value it is, the only one that knows which parts of that value anybody reads.
  - A failed read notifies nobody: nothing was stored, and the value held is the one the derived
    kinds already built on.
- **A notice is recorded whether or not a read follows it.** Every time something outside a kind says
  it may have changed — a daemon event, or the source it derives from being replaced — the kind
  records the instant, **before every reason not to read at once**: a read already in flight, a
  grouping window still open, nobody asking. It is a separate instant from the one `markChanged()`
  records, and the two are waited for on different terms: the application's own operation is covered
  for every caller, a notice only for the caller that asks.
- **Timers never hold the process open**: every timer is unreferenced, so a server with nothing else
  to do still exits.
- A read whose result arrives after `discardHeldValues()` is thrown away rather than stored: no
  value read from the daemon left behind is ever served — and the caller that was waiting on it is
  handed a read against the daemon now active, not the absence the discard left behind. Never a
  value, never an error is not an outcome this cache produces (REQ-27).
- The cache holds nothing on disk. A restarted server has read nothing, and every kind takes the
  first-request path once.
- The event subscription is a single listener on the republished daemon event stream, whatever the
  number of registered kinds.
- A manual reload never joins a read that started before the request was made: when the read it
  awaited turns out to be an older one, it reads once more. Otherwise "read it all again now" could
  be answered with a value read seconds before the operator pressed anything.

### Notice coverage

- **It is one caller's option, never the kind's rule** — `read({ coverNotices: true })`. The caller
  is answered from a value read after the last notice the kind held **when its call arrived**;
  everybody else is answered from the held value at once, exactly as before. That is the whole
  difference between repairing one reader and putting a wait in front of every list in the product.
- **The instant is taken once, at the call.** Notices landing while the caller waits do not extend
  the wait, so a busy host never starves the request it is meant to answer.
- **It starts no read, in any case.** The notice already caused one — at once, or at the end of the
  grouping window — and the wait joins that read: the one in flight when the call arrived, or the one
  the window has deferred and that has therefore not started yet. The daemon is asked for nothing
  extra by the option existing or by its being used.
- **It is bounded twice**, and reaching either bound hands the caller **the value held** rather than
  an error or an answer that never comes:
  - in reads — the read owed, plus one chained follow-up;
  - in time — four grouping windows, capped at the kind's own period, so waiting for coverage is
    never longer than simply waiting for the kind's next scheduled read.
- **A read that fails ends the wait.** A failed read is never chased, so no further read is owed and
  the caller takes the held value, `stale` and its error with it. A daemon that has stopped answering
  therefore costs this caller one read's time, not its patience.
- A discard ends it too: nothing is held any more, so the caller takes the first-request path.
- **A caller that asks on a quiet kind waits for nothing.** With no notice outstanding — every
  request on a host where nothing is happening — the held value is returned at once.

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
- plan-docker_management_app-refresh_cache/REQ-27
- plan-docker_management_app-refresh_cache/REQ-52
- plan-docker_management_app-refresh_cache/REQ-53
- plan-docker_management_app-refresh_cache/REQ-55
- plan-docker_management_app-refresh_cache/REQ-58
- plan-docker_management_app-refresh_cache/REQ-59
- plan-docker_management_app-refresh_cache/REQ-60
- plan-docker_management_app-refresh_cache/REQ-61
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-7
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-8
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-9
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-10
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-74
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-75
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-4
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-7
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-13
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-14
- plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-15
