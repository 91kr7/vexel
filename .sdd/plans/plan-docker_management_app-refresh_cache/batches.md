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
| startup-order-and-disowned-read | The endpoint is set before the server serves | REQ-24, REQ-27, REQ-29 | lists-from-refresh-cache | certified | The first screen after a restart is shown, not refused |
| remaining-checks-reload | The remaining checks reload through the control | REQ-30 | — | certified | The context, builder and build-cache checks pass wherever they run |
| version-negotiated-once | The Engine API version is negotiated once, and the probe still probes | REQ-31, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36 | — | todo | The application asks the daemon half as much, and still notices it going away |

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
| REQ-24 | `batch-startup-order-and-disowned-read/INT-2`, `batch-startup-order-and-disowned-read/INT-4`, `batch-startup-order-and-disowned-read/INT-6` | startup-order-and-disowned-read |
| REQ-25 | — withdrawn 2026-08-28 | — |
| REQ-26 | — withdrawn 2026-08-28 | — |
| REQ-27 | `batch-startup-order-and-disowned-read/INT-1`, `batch-startup-order-and-disowned-read/INT-4`, `batch-startup-order-and-disowned-read/INT-5`, `batch-startup-order-and-disowned-read/INT-6` | startup-order-and-disowned-read |
| REQ-28 | — withdrawn 2026-08-28 | — |
| REQ-29 | `batch-startup-order-and-disowned-read/INT-3`, `batch-startup-order-and-disowned-read/INT-4`, `batch-startup-order-and-disowned-read/INT-7` | startup-order-and-disowned-read |
| REQ-30 | `batch-remaining-checks-reload/INT-1`, `batch-remaining-checks-reload/INT-2`, `batch-remaining-checks-reload/INT-3`, `batch-remaining-checks-reload/INT-4` | remaining-checks-reload |
| REQ-31 | `batch-version-negotiated-once/INT-1`, `batch-version-negotiated-once/INT-4`, `batch-version-negotiated-once/INT-10` | version-negotiated-once |
| REQ-32 | `batch-version-negotiated-once/INT-2`, `batch-version-negotiated-once/INT-3`, `batch-version-negotiated-once/INT-5` | version-negotiated-once |
| REQ-33 | `batch-version-negotiated-once/INT-2`, `batch-version-negotiated-once/INT-5`, `batch-version-negotiated-once/INT-6` | version-negotiated-once |
| REQ-34 | `batch-version-negotiated-once/INT-1`, `batch-version-negotiated-once/INT-3`, `batch-version-negotiated-once/INT-7` | version-negotiated-once |
| REQ-35 | `batch-version-negotiated-once/INT-2`, `batch-version-negotiated-once/INT-3`, `batch-version-negotiated-once/INT-8` | version-negotiated-once |
| REQ-36 | `batch-version-negotiated-once/INT-9` | version-negotiated-once |

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

**Reduced on 2026-08-28, before development.** The human withdrew the startup warm read. The batch
`warm-start` lost the warm read and the two requirements that existed only to make it safe, and was
renamed **`startup-order-and-disowned-read`** — it warms nothing, so the old name named the wrong
thing. What was withdrawn, and why, is in `requirements.md` beside the ids themselves. Only this
appended section, that batch's row and its coverage rows changed; every certified batch is untouched.

**Execution order.** `startup-order-and-disowned-read` comes after `lists-from-refresh-cache`, which
builds the cache it repairs; it is the last of the source batches. It no longer depends on
`volume-sizes-separated`: that dependency existed only for the volume-size exclusion, withdrawn with
the warm read. `remaining-checks-reload` depends on neither and can be done at any point, but it is
the cheaper of the two and it unblocks a full pass, so it is worth doing first.

### Assumptions and decisions

- **The startup warms nothing, and does not need to.** The first-request path of REQ-9 already fills
  a cold value with the client waiting, per kind, so an operator never waits a period for data; the
  volume list already answers without sizes and marks itself changed when they land. A warm read
  bought only the latency of one read on the very first screen, and cost a deviation from REQ-14 and
  the whole demand-expiry safeguard written to make that deviation survivable. Withdrawn by the
  human on 2026-08-28, with REQ-25, REQ-26 and REQ-28.
- **The defect is closed without it.** The failure a fresh server served — the active endpoint
  resolved after the port was already open, discarding held values under a first read in flight — is
  closed by the awaited startup order (REQ-24) and the disowned-read repair (REQ-27). Neither needed
  the warm read; they had merely been bundled with it.
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

- **The two departures recorded here are withdrawn** — 2026-08-28, with the warm read that caused
  them. They were: REQ-25 against REQ-14 (the warm read called the daemon with no client asking), and
  REQ-25 against this plan's assumption that a restart reads what it needs on the first request. Both
  are gone. The plan's own sentence, "a restart reads what it needs, which is the first-request path
  of REQ-9", is true again rather than reversed, and REQ-14 holds without exception. Neither REQ-14
  nor the assumption was ever edited, so nothing has to be put back.
- **No departure from the business spec.** There was none before and there is none now: the appended
  requirements never contradicted the spec, and withdrawing three of them contradicts it no more. No
  correction to the spec is owed.
- **The two validation gates were delegated, not held.** The human was unavailable and delegated
  every decision here to the orchestrator, including the requirement wording and the startup order.
  The withdrawal of the warm read is the human's own decision, taken on 2026-08-28 and delegated for
  execution the same way. The planner did not stop at Step 2 or Step 5. Nothing here is an open
  question; everything is a decision taken on the human's instruction.

### Coverage check — the appended requirements

Every appended requirement still standing — REQ-24, REQ-27, REQ-29, REQ-30 — is served by at least
one intervention, and every intervention of the two appended batches serves at least one of them; the
rows are in the table above. REQ-25, REQ-26 and REQ-28 are withdrawn and serve nothing, which is why
their rows carry no intervention. No standing REQ is split across batches: REQ-24, REQ-27 and REQ-29
close in `startup-order-and-disowned-read`, REQ-30 in `remaining-checks-reload`. There is no enabling
intervention.

The reduction removed four interventions from that batch — the warm operation, its no-demand
behaviour, its exclusion flag and the volume-size kind declaring itself excluded. The seven that
remain were renumbered `INT-1` to `INT-7`: intervention ids are local to their batch file, the batch
had never been developed, and the only artifact citing them is the coverage table above, rewritten in
the same pass. Requirement ids were **not** renumbered, for the opposite reason — see the note in
`requirements.md`.

Two notes on it.

- **REQ-29 is the one that must not be lost to the fix.** Resolving the active context reads Docker's
  own configuration, and making the startup wait on the daemon is the obvious mistake: it would turn
  an unreachable daemon into a server that never listens.
  `batch-startup-order-and-disowned-read/INT-3` states it and `/INT-7` proves it.
- **REQ-27 is served by a check that does not go through the startup.**
  `batch-startup-order-and-disowned-read/INT-5` drives the discard against a read in flight directly
  on the cache, because the case it guards — a context changed while a first read is running —
  outlives the startup ordering that hid it.

## Appended on 2026-08-29 — one batch

The Docker call log shipped on 2026-08-28 made this plan's own subject readable for the first time,
and the first thing it showed is that **half the traffic is echo**: 235 of 447 socket calls at rest
were `GET /version`, one before every real call. It was recorded as debt the same day
(`.sdd/tech-debt/entries/engine-version-negotiated-on-every-call.md`) and promoted to a fix by the
human on 2026-08-29. The batch below closes it.

Per the knowledge base, work found after a batch is appended as a further batch and never edited into
one already closed: **nothing above this line was changed**, beyond the one row added to the batch
table and the six coverage rows. No certified batch is reopened.

**Execution order.** `version-negotiated-once` depends on nothing in this plan. It changes
`EngineClient`, which `daemon-connection-reused` last touched and which is certified; it needs that
work present but not repeated, which is what a certified batch already guarantees.

### Assumptions and decisions

- **The version is read for two purposes, and only one of them is cached.** Composing a path wants a
  number, not a fresh one. Deciding whether the daemon is there wants a real call and nothing else.
  `getVersion()` keeps meaning the second — it is the connection status's probe, and the source of
  the two versions that status publishes — and the held value is an internal reading beside it, not
  a replacement for it. **A probe served from a memo stops probing** is the one way this batch could
  ship something worse than the cost it removes.
- **The held value has no expiry of its own, on purpose.** It is refreshed by every negotiation that
  reached the daemon (REQ-33), and the probe performs one on its own schedule while a client is
  asking. So the value is never older than the last successful probe, and a daemon upgraded under a
  running server is picked up with no timer and no eviction rule to tune. Adding a TTL beside that
  would be a second mechanism answering a question the first already answers.
- **The scoping needs nothing new and must not be thrown away.** The shared client is already
  discarded and rebuilt on a change of the active endpoint, so a value held on the instance cannot
  outlive the daemon it was negotiated with. Held module-wide it would survive that discard. REQ-34
  exists to make that a check rather than a code review.
- **The debt entry is closed, not deleted.** `status: closed`, naming this batch — the register is a
  record, like the analyses.
- **The second finding of the same audit is not in this batch.** The three services that each fetch
  the whole container list is a different cause — a cache holding a narrowed projection — and it
  already has its own register entry. Bundling them would put two causes in one batch.

### Departures

- **The validation gates were not held, again.** The human stated the contract themselves — the
  version composing the path reads from cache, the reachability probe does not — and asked for it to
  be developed in the same turn. The requirements and the coverage below were written to that
  statement and not put back for validation.
- **No departure from the business spec.** The spec already assumes the connection status keeps a
  real probe; this batch is the first thing to state that in a requirement.

### Coverage check — the appended requirements

REQ-31 to REQ-36 are each served by at least one intervention of `version-negotiated-once`, and every
one of its ten interventions serves at least one of them; the rows are in the table above. No
appended REQ is split across batches — all six close here. There is no enabling intervention.

One note on it. **REQ-32 is the requirement that protects the product from this batch.** REQ-31 is
the saving and it is easy to check by counting; REQ-32 is what stops the saving from being taken out
of the reachability probe, and a check that only counted calls would be satisfied by the very defect
it must refuse. `batch-version-negotiated-once/INT-5` counts in the opposite direction — n calls to
`getVersion()`, n requests — for that reason.
