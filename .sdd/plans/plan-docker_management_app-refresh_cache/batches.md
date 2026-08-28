---
slug: docker_management_app-refresh_cache
date: 2026-08-28
spec: .sdd/analysis/docker_management_app-refresh_cache.md
status: draft
---

# Batches — refresh cache

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
|-------|---------|------------|---------|--------|------------------|
| read-once-values | Values that cannot change are read once | REQ-1, REQ-2, REQ-3 | — | todo | The interface still reports the installed Docker tooling |
| daemon-connection-reused | One connection to the daemon is reused | REQ-4, REQ-5 | — | todo | Every screen still works against the daemon |
| detail-reread-scoped | A detail view re-reads only for the object it shows | REQ-6, REQ-7, REQ-8 | — | todo | Another container's activity leaves the open detail alone |
| lists-from-refresh-cache | The lists are answered from values the server keeps current | REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17 | read-once-values | todo | The operator's own action is visible at once |
| volume-sizes-separated | Volume sizes are read on their own schedule | REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23 | lists-from-refresh-cache | todo | Volumes still show their sizes |

## What the plan builds

**One new component, the refresh cache**, built by `lists-from-refresh-cache` and named in that
batch file before its table. Everything else in the plan is an existing component adopting it, or a
value stopped from being re-read. No other batch creates a component.

**Execution order**: the first three are independent of one another and of the rest, so any order
among them will do. Then `lists-from-refresh-cache`, then `volume-sizes-separated`.

The dependency of `lists-from-refresh-cache` on `read-once-values` is about the work, not about
compilation: the image listing is one of the kinds moved onto the cache, and moving a listing that
still inspects every image on the daemon means writing its refresher against a read we already know
to be wasteful. Fixing that first means it is written once.

**Why the cheap batches come first.** They are independent, they are small, and together they remove
the larger part of the cost — before the one batch that can make the product worse if it is got
wrong. If the work stops after the first three, the application is meaningfully better and nothing
has been destabilised.

## Assumptions and decisions

- **The cache is one feature, not three.** The held value, its reaction to events and its demand gate
  are one mechanism and are implemented together. A cache with only a timer reacts more slowly than
  today's poll; one without a demand gate calls the daemon with no browser open, which today it does
  not. Either alone is a regression, so neither is a shippable state of the product and neither is a
  batch. This is the dogma's own rule about not splitting what is always implemented together.
- **"Prove it on containers first" is an intervention dependency, not a batch boundary.** It is
  ordering inside `lists-from-refresh-cache`, carried by that batch's `Depends` column: INT-8 depends
  on the component being built, and INT-10 to INT-16 all depend on INT-8. A batch boundary there
  would have produced a batch closing no requirement.
- **The component's name departs from the human's words, deliberately and once.** The request asked
  for "a daemon that polls server-side and caches". It is called the **refresh cache**, with
  **refreshers** as its background workers, because "daemon" already means the Docker daemon in this
  product and "cache" alone would collide with the image analysis cache. The departure is stated in
  the batch file where the name is introduced, so the human can map their word onto it.
- **Detail reads stay direct — the human's decision of 2026-08-27**, and it is in the spec as such.
  This plan therefore holds no value for inspect of any kind, and REQ-22 keeps it that way.
- **The client's list hooks are untouched; the detail hooks are the stated exception.** REQ-21 covers
  the list hooks. `detail-reread-scoped` changes four *detail* hooks, a different set under a
  different requirement (REQ-7), which is why REQ-21 names the list hooks rather than "the client".
- **The connection status keeps a real probe — a considered departure from the design study**, which
  suggested deriving reachability from the event stream's health alone. The stream's state is a
  sound liveness signal and INT-16 uses it to mark the status due, but the status also reports the
  negotiated Engine API and engine versions, and only a real call returns those.
- **What marks each kind due was read from the code, not guessed** — the event types each listing
  already subscribes to today: containers ← `container`; images ← `image`; volumes ← `volume` and
  `container`; networks ← `network` and `container`; compose ← `container`, compose projects being
  derived from container labels and Docker publishing no compose event. Contexts, builders, build
  cache and connection status subscribe to nothing today and get no event type.
- **The daemon event stream is consumed in process and nothing about it changes.** It is already an
  emitter with a single shared subscription and a backlog, so the cache subscribes to what it already
  publishes. Its reconnection, backlog and republishing are untouched — half of REQ-23.
- **The discard on context change reuses the signal that already exists**, the one the event stream
  service already acts on for its backlog. INT-14 states the one case needing care: the context
  listing itself, which is the thing being switched.
- **Nothing is persisted.** Every held value lives in the running server and is gone when it stops. A
  restart re-reads what it needs, which is the first-request path of REQ-9.
- **Swarm does not appear in this plan.** Its removal is already reintegrated, so its listing is not
  among the kinds moved onto the cache.

## Departures

- **The human validation gates of the method were not performed, at the human's explicit request.**
  The method stops after the requirements (Step 2) and again after the coverage check (Step 5). The
  human asked for the analysis and the whole plan in one pass, in a session outside the `/sdd-plan`
  command and its subagent, having judged that the subagent route would not carry the reasoning
  already built up there. Consequently **`requirements.md` and this file both carry `status: draft`,
  not `validated`**, and must not be advanced until the human has read the requirements and the
  coverage. Nothing about the plan's content is affected; what is missing is the confirmation.
- **No departure from the spec is recorded.** Every decision above sits inside what the spec states
  or explicitly assumes. The connection-status probe departs from the *design study*, not from the
  spec — which already records it as an assumption — so **nothing here asks for a correction to the
  business spec**.

## Coverage check

Every REQ is served by at least one INT, every INT serves at least one REQ, and **no REQ is split
across batches** — each closes in the batch where its interventions live. There is **no enabling
intervention** in this plan.

Intervention ids restart at `INT-1` in each batch, per the `identifiers.md` convention, and are
therefore qualified with their batch below.

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

**Three notes on the shape of this coverage, deliberate.**

- **The plan's own guardrails are served by checks, not by changes.** REQ-20 to REQ-23 say that
  nothing else moves, and a requirement of that kind is met by an intervention proving something did
  *not* change: `batch-volume-sizes-separated/INT-7` walks the screens and the live streams,
  `/INT-8` asserts the client's list hooks were not touched. The latter exists for a specific failure
  this plan could have — finishing the work by moving it into the client instead of the server.
- **REQ-17 rests on one intervention and it is the requirement the whole plan is for.** Two clients
  costing what one costs is the only benefit here obtainable no other way, and the hardest to observe
  from a screen. If `batch-lists-from-refresh-cache/INT-19` is not written, the plan's central claim
  has nothing behind it and must not be declared met by reasoning about the design.
- **REQ-13 is carried by ten interventions and is the one to watch.** Every kind moved onto the cache
  must mark it due on its own write operations, and a single route that forgets produces exactly the
  regression this plan must not ship: the operator acts and the screen does not follow. It is spread
  one per area for that reason, so a missed area is a missing intervention rather than a forgotten
  line.
