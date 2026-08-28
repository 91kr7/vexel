---
slug: docker_management_app-refresh_cache
date: 2026-08-28
spec: .sdd/analysis/docker_management_app-refresh_cache.md
status: validated
---

# Batches — refresh cache

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
|-------|---------|------------|---------|--------|------------------|
| read-once-values | Values that cannot change are read once | REQ-1, REQ-2, REQ-3 | — | certified | The interface still reports the installed Docker tooling |
| daemon-connection-reused | One connection to the daemon is reused | REQ-4, REQ-5 | — | certified | Every screen still works against the daemon |
| detail-reread-scoped | A detail view re-reads only for the object it shows | REQ-6, REQ-7, REQ-8 | — | certified | Another container's activity leaves the open detail alone |
| lists-from-refresh-cache | The lists are answered from values the server keeps current | REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17 | read-once-values | certified | The operator's own action is visible at once |
| volume-sizes-separated | Volume sizes are read on their own schedule | REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23 | lists-from-refresh-cache | certified | Volumes still show their sizes |
| warm-start | The server is warm before it accepts requests | REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29 | lists-from-refresh-cache, volume-sizes-separated | todo | The first screen after a restart is answered at once |
| remaining-checks-reload | The remaining checks reload through the control | REQ-30 | — | todo | The context, builder and build-cache checks pass wherever they run |

## What the plan builds

One new component, **the refresh cache**, built by `lists-from-refresh-cache` and named in that
batch file before its table. Everything else is an existing component starting to use it, or a value
stopped from being re-read.

**Execution order.** The first three are independent of each other and of the rest, so any order
among them works. Then `lists-from-refresh-cache`, then `volume-sizes-separated`.

`lists-from-refresh-cache` depends on `read-once-values` for the work, not for compilation. The image
listing is one of the kinds moved onto the cache. Moving a listing that still inspects every image
means writing its refresher against a read we already know is wasteful.

**Why the cheap batches come first.** They are small and independent, and together they remove the
larger part of the cost. They come before the one batch that can make the product worse if it is
built wrong. If the work stops after the first three, the application is better and nothing has been
destabilised.

## Assumptions and decisions

- **The cache is one feature, not three.** The held value, its reaction to events and its demand gate
  are one mechanism, implemented together. A cache with only a timer reacts more slowly than today's
  poll. One without a demand gate calls the daemon with no browser open, which today it does not.
  Either alone is a regression, so neither is a state we could ship, and neither is a batch.
- **"Prove it on containers first" is an intervention dependency, not a batch boundary.** It is
  ordering inside `lists-from-refresh-cache`, carried by that batch's `Depends` column. A batch
  boundary there would have produced a batch closing no requirement.
- **The component's name departs from the request's own words, on purpose.** The request asked for "a
  daemon that polls server-side and caches". It is called the **refresh cache**, with **refreshers**
  as its workers, because "daemon" already means the Docker daemon here, and "cache" alone would be
  confused with the image analysis cache. The departure is stated where the name is introduced.
- **Detail reads stay direct.** This is the human's decision of 2026-08-27 and it is in the spec. The
  plan holds no value for inspect of any kind, and REQ-22 keeps it that way.
- **The client's list hooks are untouched; the detail hooks are the exception.** REQ-21 covers the
  list hooks. `detail-reread-scoped` changes four detail hooks, under REQ-7. That is why REQ-21 names
  the list hooks and not "the client".
- **The connection status keeps a real probe.** This departs from the design study, which suggested
  reading reachability from the event stream's health alone. The stream's state is a good liveness
  signal, and INT-16 uses it to mark the status due. But the status also reports the negotiated
  Engine API and engine versions, and only a real call returns those.
- **What marks each kind due was read from the code.** These are the event types each listing
  already subscribes to today. Containers ← `container`. Images ← `image`. Volumes ← `volume` and
  `container`. Networks ← `network` and `container`. Compose ← `container`, because compose projects
  come from container labels and Docker publishes no compose event. Contexts, builders, build cache
  and connection status subscribe to nothing today, so they get no event type.
- **The daemon event stream is consumed in process and does not change.** It is already an emitter
  with one shared subscription and a backlog, so the cache subscribes to what it publishes. Its
  reconnection, backlog and republishing stay as they are, which is half of REQ-23.
- **The discard on context change reuses an existing signal**, the one the event stream service
  already acts on for its backlog. INT-14 states the case that needs care: the context listing
  itself, which is the thing being switched.
- **Nothing is persisted.** Every held value lives in the running server and is gone when it stops. A
  restart reads what it needs, which is the first-request path of REQ-9.
- **Swarm is not in this plan.** Its removal is already reintegrated.

## Departures

- **The two validation gates were performed after the plan was written, not during it.** The method
  stops after the requirements (Step 2) and again after the coverage check (Step 5). The human asked
  for the analysis and the whole plan in one pass, outside the `/sdd-plan` command and its subagent.
  The human then read the requirements and the coverage, and validated both on 2026-08-28.
  `requirements.md` and this file now carry `status: validated`. The plan's content never depended on
  this. Only the confirmation was missing.
- **No departure from the spec.** Every decision above sits inside what the spec states or assumes.
  The connection-status probe departs from the design study, not from the spec, which already records
  it as an assumption. Nothing here asks for a correction to the business spec.

## Coverage check

Every REQ is served by at least one INT. Every INT serves at least one REQ. No REQ is split across
batches. There is no enabling intervention.

Intervention ids restart at `INT-1` in each batch, per the `identifiers.md` convention, so they are
qualified with their batch below.

| REQ | Served by | Closes in |
|-----|-----------|-----------|
| REQ-1 | `batch-read-once-values/INT-1`, `batch-read-once-values/INT-3`, `batch-read-once-values/INT-4` | read-once-values |
| REQ-2 | `batch-read-once-values/INT-2`, `batch-read-once-values/INT-3`, `batch-read-once-values/INT-4` | read-once-values |
| REQ-3 | `batch-read-once-values/INT-1`, `batch-read-once-values/INT-2`, `batch-read-once-values/INT-4` | read-once-values |
| REQ-4 | `batch-daemon-connection-reused/INT-1`, `batch-daemon-connection-reused/INT-2`, `batch-daemon-connection-reused/INT-4`, `batch-daemon-connection-reused/INT-5` | daemon-connection-reused |
| REQ-5 | `batch-daemon-connection-reused/INT-3`, `batch-daemon-connection-reused/INT-4`, `batch-daemon-connection-reused/INT-5` | daemon-connection-reused |
| REQ-6 | `batch-detail-reread-scoped/INT-1`, `batch-detail-reread-scoped/INT-2`, `batch-detail-reread-scoped/INT-5` | detail-reread-scoped |
| REQ-7 | `batch-detail-reread-scoped/INT-3`, `batch-detail-reread-scoped/INT-5`, `batch-detail-reread-scoped/INT-6` | detail-reread-scoped |
| REQ-8 | `batch-detail-reread-scoped/INT-3`, `batch-detail-reread-scoped/INT-4`, `batch-detail-reread-scoped/INT-5`, `batch-detail-reread-scoped/INT-6` | detail-reread-scoped |
| REQ-9 | `batch-lists-from-refresh-cache/INT-1`, `batch-lists-from-refresh-cache/INT-2`, `batch-lists-from-refresh-cache/INT-8`, `batch-lists-from-refresh-cache/INT-10`, `batch-lists-from-refresh-cache/INT-11`, `batch-lists-from-refresh-cache/INT-12`, `batch-lists-from-refresh-cache/INT-13`, `batch-lists-from-refresh-cache/INT-14`, `batch-lists-from-refresh-cache/INT-15`, `batch-lists-from-refresh-cache/INT-16`, `batch-lists-from-refresh-cache/INT-17`, `batch-lists-from-refresh-cache/INT-19` | lists-from-refresh-cache |
| REQ-10 | `batch-lists-from-refresh-cache/INT-3`, `batch-lists-from-refresh-cache/INT-18` | lists-from-refresh-cache |
| REQ-11 | `batch-lists-from-refresh-cache/INT-3`, `batch-lists-from-refresh-cache/INT-8`, `batch-lists-from-refresh-cache/INT-10`, `batch-lists-from-refresh-cache/INT-11`, `batch-lists-from-refresh-cache/INT-12`, `batch-lists-from-refresh-cache/INT-13`, `batch-lists-from-refresh-cache/INT-14`, `batch-lists-from-refresh-cache/INT-15`, `batch-lists-from-refresh-cache/INT-16`, `batch-lists-from-refresh-cache/INT-17`, `batch-lists-from-refresh-cache/INT-18` | lists-from-refresh-cache |
| REQ-12 | `batch-lists-from-refresh-cache/INT-5`, `batch-lists-from-refresh-cache/INT-8`, `batch-lists-from-refresh-cache/INT-10`, `batch-lists-from-refresh-cache/INT-11`, `batch-lists-from-refresh-cache/INT-12`, `batch-lists-from-refresh-cache/INT-13`, `batch-lists-from-refresh-cache/INT-17`, `batch-lists-from-refresh-cache/INT-18` | lists-from-refresh-cache |
| REQ-13 | `batch-lists-from-refresh-cache/INT-9`, `batch-lists-from-refresh-cache/INT-10`, `batch-lists-from-refresh-cache/INT-11`, `batch-lists-from-refresh-cache/INT-12`, `batch-lists-from-refresh-cache/INT-13`, `batch-lists-from-refresh-cache/INT-14`, `batch-lists-from-refresh-cache/INT-15`, `batch-lists-from-refresh-cache/INT-17`, `batch-lists-from-refresh-cache/INT-19`, `batch-lists-from-refresh-cache/INT-20` | lists-from-refresh-cache |
| REQ-14 | `batch-lists-from-refresh-cache/INT-6`, `batch-lists-from-refresh-cache/INT-18` | lists-from-refresh-cache |
| REQ-15 | `batch-lists-from-refresh-cache/INT-4`, `batch-lists-from-refresh-cache/INT-16`, `batch-lists-from-refresh-cache/INT-18` | lists-from-refresh-cache |
| REQ-16 | `batch-lists-from-refresh-cache/INT-7`, `batch-lists-from-refresh-cache/INT-14`, `batch-lists-from-refresh-cache/INT-18` | lists-from-refresh-cache |
| REQ-17 | `batch-lists-from-refresh-cache/INT-19` | lists-from-refresh-cache |
| REQ-18 | `batch-volume-sizes-separated/INT-1`, `batch-volume-sizes-separated/INT-2`, `batch-volume-sizes-separated/INT-3`, `batch-volume-sizes-separated/INT-4`, `batch-volume-sizes-separated/INT-5`, `batch-volume-sizes-separated/INT-6` | volume-sizes-separated |
| REQ-19 | `batch-volume-sizes-separated/INT-2`, `batch-volume-sizes-separated/INT-3`, `batch-volume-sizes-separated/INT-5`, `batch-volume-sizes-separated/INT-6` | volume-sizes-separated |
| REQ-20 | `batch-volume-sizes-separated/INT-7` | volume-sizes-separated |
| REQ-21 | `batch-volume-sizes-separated/INT-8` | volume-sizes-separated |
| REQ-22 | `batch-volume-sizes-separated/INT-3`, `batch-volume-sizes-separated/INT-7` | volume-sizes-separated |
| REQ-23 | `batch-volume-sizes-separated/INT-4`, `batch-volume-sizes-separated/INT-7` | volume-sizes-separated |
| REQ-24 | `batch-warm-start/INT-6`, `batch-warm-start/INT-8`, `batch-warm-start/INT-10` | warm-start |
| REQ-25 | `batch-warm-start/INT-1`, `batch-warm-start/INT-6`, `batch-warm-start/INT-8`, `batch-warm-start/INT-9`, `batch-warm-start/INT-10` | warm-start |
| REQ-26 | `batch-warm-start/INT-2`, `batch-warm-start/INT-8`, `batch-warm-start/INT-9` | warm-start |
| REQ-27 | `batch-warm-start/INT-4`, `batch-warm-start/INT-8`, `batch-warm-start/INT-9`, `batch-warm-start/INT-10` | warm-start |
| REQ-28 | `batch-warm-start/INT-3`, `batch-warm-start/INT-5`, `batch-warm-start/INT-8`, `batch-warm-start/INT-9` | warm-start |
| REQ-29 | `batch-warm-start/INT-1`, `batch-warm-start/INT-7`, `batch-warm-start/INT-8`, `batch-warm-start/INT-11` | warm-start |
| REQ-30 | `batch-remaining-checks-reload/INT-1`, `batch-remaining-checks-reload/INT-2`, `batch-remaining-checks-reload/INT-3`, `batch-remaining-checks-reload/INT-4` | remaining-checks-reload |

**Three notes on this coverage.**

- **The guardrails are served by checks, not by changes.** REQ-20 to REQ-23 say nothing else moves,
  and that kind of requirement is met by proving something did not change.
  `batch-volume-sizes-separated/INT-7` walks the screens and the live streams. `/INT-8` asserts the
  client's list hooks were not touched, which guards against finishing the plan by moving the work
  into the client.
- **REQ-17 rests on one intervention, and it is the requirement the plan exists for.** Two clients
  costing what one costs cannot be obtained any other way, and it is the hardest thing here to see
  from a screen. If `batch-lists-from-refresh-cache/INT-19` is not written, the plan's central claim
  has nothing behind it.
- **REQ-13 is carried by ten interventions and is the one to watch.** Every kind moved onto the cache
  must mark it due on its own write operations. One route that forgets produces the regression this
  plan must not ship. It is spread one per area, so a missed area is a missing intervention rather
  than a forgotten line.

## Appended on 2026-08-28 — two batches

A full pass surfaced three reproducible regressions, none of them inside `volume-sizes-separated`'s
own perimeter. The two batches below close them. Per the knowledge base, work found after a batch is
appended as a further batch and never edited into one already closed: **nothing above this line was
changed**, beyond the two rows added to the batch table and the six coverage rows.

**Execution order.** `warm-start` comes after `lists-from-refresh-cache` (the cache it warms) and
after `volume-sizes-separated` (the volume-size kind it excludes from the warm read); it is the last
of the source batches. `remaining-checks-reload` depends on neither and can be done at any point, but
it is the cheaper of the two and it unblocks a full pass, so it is worth doing first.

### Assumptions and decisions

- **The warm read renews no demand.** That is what keeps the deviation from REQ-14 to one read at
  process start: the refresher it schedules ticks once, finds nobody has asked, and drops what was
  warmed **before** reading, so no second daemon call is made on the warm-up's account. Warming with
  demand renewed would have polled every kind for a whole expiry window with no browser open, which
  is the behaviour REQ-14 exists to forbid.
- **The exclusion is a property of the kind, not a list in the bootstrap.** A kind declares itself
  excluded from the warm read where it is registered, and is warmed by default. A list held in the
  startup file would have to be found and updated by whoever adds the next kind; the default is the
  safe one either way.
- **The disowned read is fixed in the cache, not by the startup order.** Ordering the startup removes
  the occasion this defect was found on; a genuine context change arriving while a first read is in
  flight is the same hole and is not covered by ordering. REQ-27 closes it where it is.
- **`remaining-checks-reload` changes no source.** It is checks only, and the product behaviour they
  were failing on is the behaviour the human confirmed on 2026-08-28. A batch that touched a service
  here would be reversing that decision through a test.
- **Its real dependency is cross-plan** — the certified manual refresh control and its e2e helper,
  in `plan-docker_management_app-refresh_cache-manual_refresh`. The `Depends` column takes ids from
  this plan only, so the dependency is stated in prose in the batch file.

### Departures

- **REQ-25 departs from REQ-14.** REQ-14 says that while no client is asking, the application calls
  the daemon for none of these values; the warm read calls it with no client asking. Bounded to one
  read per warmed kind at process start, it does not recur, and REQ-26 keeps REQ-14's acceptance
  scenario — a closed application asks nothing — true. **REQ-14 is not edited**, and the deviation is
  repeated beside the new requirements themselves.
- **REQ-25 departs from this plan's own assumption**, the one above reading "Nothing is persisted.
  Every held value lives in the running server and is gone when it stops. A restart reads what it
  needs, which is the first-request path of REQ-9." The second half is reversed: a restart now reads
  what it needs **before** serving, not on the first request. The first half stands — nothing is
  persisted either way. **The assumption is not edited**: it records what was decided then.
- **Neither of these departs from the business spec**, so no correction to the spec is owed. Both
  depart from decisions recorded inside this plan, which is why they are recorded here rather than
  reported as a spec defect.
- **The two validation gates were delegated, not held.** The human was unavailable and delegated
  every decision above to the orchestrator, including the requirement wording, the startup order, the
  answer to the staleness hazard and the volume-size exclusion. The planner did not stop at Step 2 or
  Step 5. Nothing here is an open question; everything is a decision taken on the human's instruction.

### Coverage check — the appended requirements

Every one of REQ-24 to REQ-30 is served by at least one intervention, and every intervention of the
two new batches serves at least one of them; the rows are in the table above. No appended REQ is
split across batches: REQ-24 to REQ-29 close in `warm-start`, REQ-30 in `remaining-checks-reload`.
There is no enabling intervention.

Two notes on it.

- **REQ-29 is the one that must not be lost to the fix.** Making the startup wait for the daemon is
  the obvious way to warm it and the wrong one: it would turn an unreachable daemon into a server
  that never listens. `batch-warm-start/INT-7` states it and `/INT-11` proves it, and they are the
  reason the warm read reports a failure instead of throwing.
- **REQ-27 is served by a check that does not go through the startup.** `batch-warm-start/INT-9`
  drives the discard against a read in flight directly on the cache, because the case it guards —
  a context changed while a first read is running — outlives the startup ordering that hid it.
