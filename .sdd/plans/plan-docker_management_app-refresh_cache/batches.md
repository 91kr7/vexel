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
| lists-from-held-values | The lists are answered from values the server keeps current | REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17 | read-once-values | todo | The operator's own action is visible at once |
| volume-sizes-separated | Volume sizes are read on their own schedule | REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23 | lists-from-held-values | todo | Volumes still show their sizes |

**Execution order**: the first three are independent of one another and of the rest — each is a small,
self-contained saving that needs nothing built first, and any order among them will do. Then
`lists-from-held-values`, then `volume-sizes-separated`.

The dependency of `lists-from-held-values` on `read-once-values` is deliberate and is about the work,
not about compilation: the image listing is one of the kinds moved onto held values, and moving a
listing that still inspects every image on the daemon means writing its refresher against a read we
already know to be wasteful. Fixing that first means it is written once.

**Why the cheap batches come first.** They are independent, they are small, and together they remove
the larger part of the cost — before the one batch in the plan that can make the product worse if it
is got wrong. If the work stops after the first three, the application is meaningfully better and
nothing has been destabilised.

## Assumptions and decisions

- **The cache is one feature, not three.** The held value, its reaction to events and its demand gate
  are one mechanism and are implemented together. A held value with only a timer reacts more slowly
  than today's poll, and one without a demand gate calls the daemon with no browser open — today it
  does not. Either alone is a regression, so neither is a shippable state of the product and neither
  is a batch. This is the dogma's own rule about not splitting what is always implemented together,
  applied at the level of the feature.
- **"Prove it on containers first" is an intervention dependency, not a batch boundary.** The design
  study recommends building the mechanism against one list before moving seven more onto it. That is
  ordering *inside* `lists-from-held-values` and is carried by the `Depends` column of its
  interventions: INT-15 depends on INT-14, and INT-16 to INT-21 all depend on INT-15. Making it a
  batch boundary would have produced a batch closing no requirement, which the method allows only for
  a declared enabling batch — and this one is not enabling, it is the feature applied to one kind.
- **Detail reads stay direct — the human's decision, taken on 2026-08-27**, and it is in the spec as
  such. A detail view shows one object at a time and must show it as the daemon reports it now. This
  plan therefore holds no value for inspect of any kind, and REQ-22 exists to keep it that way.
- **The client's list hooks are untouched, and the detail hooks are the stated exception.** REQ-21
  covers the list hooks: same shape, same intervals, same subscriptions. `detail-reread-scoped`
  changes four *detail* hooks, which is a different set and a different requirement (REQ-7). The
  distinction is deliberate and is why REQ-21 names the list hooks rather than "the client".
- **The connection status keeps a real probe of the daemon — a considered departure from the design
  study**, which suggested deriving reachability from the event stream's health alone. The stream's
  state is a sound liveness signal and INT-21 uses it to mark the status due, but the status also
  reports the negotiated Engine API and engine versions, and only a real call returns those. So the
  probe stays and merely becomes much less frequent. Deriving it entirely from the stream would have
  meant reporting a version nobody had asked the daemon for.
- **What marks each kind due was read from the code, not guessed.** The listings and the daemon event
  types they already subscribe to today: containers ← `container`; images ← `image`; volumes ←
  `volume` and `container`; networks ← `network` and `container`; compose ← `container` (compose
  projects are derived from container labels, and Docker publishes no compose event). Contexts,
  builders, build cache and connection status subscribe to nothing today and get no event type: their
  timer and the application's own write operations are what refresh them.
- **The daemon event stream is consumed in process, and nothing about it changes.** It is already an
  emitter with a single shared subscription and a backlog, so INT-14 subscribes to what it already
  publishes. Its own reconnection, backlog and republishing are untouched, which is half of REQ-23.
- **The discard on context change reuses the signal that already exists** — the notification the
  active-endpoint component publishes, which the event stream service already acts on for its
  backlog. INT-14 does the same for every held value; INT-20 states the one case that needs care,
  the context listing itself, which is the thing being switched.
- **Nothing is persisted.** Every held value lives in the running server and is gone when it stops.
  A restart re-reads what it needs, which is the first-request path of REQ-9.
- **Swarm does not appear in this plan.** Its removal is already planned and in progress, so its
  listing is not among the kinds moved onto held values.

## Departures

- **The human validation gates of the method were not performed, at the human's explicit request.**
  The method stops after the requirements for the human to validate them (Step 2) and again after the
  coverage check (Step 5). The human asked for the analysis and the whole plan in one pass, in this
  session, outside the `/sdd-plan` command and its subagent, having judged that the subagent route
  would not carry the reasoning already built up here. Consequently **`requirements.md` and this file
  both carry `status: draft`, not `validated`**, and they must not be advanced by anyone until the
  human has read the requirements and the coverage. Nothing about the plan's content is affected;
  what is missing is the confirmation.
- **No departure from the spec is recorded.** Every decision above sits inside what the spec states
  or explicitly assumes. The connection-status probe departs from the *design study*, not from the
  spec — the spec already records it as an assumption — so **nothing here asks for a correction to
  the business spec**.

## Coverage check

Every REQ is served by at least one INT, every INT serves at least one REQ, and **no REQ is split
across batches** — each closes in the batch where its interventions live. There is **no enabling
intervention** in this plan.

| REQ | Served by | Closes in |
|-----|-----------|-----------|
| REQ-1 | INT-1, INT-3, INT-4 | read-once-values |
| REQ-2 | INT-2, INT-3, INT-4 | read-once-values |
| REQ-3 | INT-1, INT-2, INT-4 | read-once-values |
| REQ-4 | INT-5, INT-7, INT-8 | daemon-connection-reused |
| REQ-5 | INT-6, INT-7, INT-8 | daemon-connection-reused |
| REQ-6 | INT-9, INT-10, INT-12 | detail-reread-scoped |
| REQ-7 | INT-11, INT-12, INT-13 | detail-reread-scoped |
| REQ-8 | INT-11, INT-12, INT-13 | detail-reread-scoped |
| REQ-9 | INT-14, INT-15, INT-16, INT-17, INT-18, INT-19, INT-20, INT-21, INT-22, INT-24 | lists-from-held-values |
| REQ-10 | INT-14, INT-15, INT-23 | lists-from-held-values |
| REQ-11 | INT-14, INT-15, INT-16, INT-17, INT-18, INT-19, INT-20, INT-21, INT-22, INT-23 | lists-from-held-values |
| REQ-12 | INT-14, INT-15, INT-16, INT-17, INT-18, INT-19, INT-22, INT-23 | lists-from-held-values |
| REQ-13 | INT-15, INT-16, INT-17, INT-18, INT-19, INT-20, INT-21, INT-22, INT-24, INT-25 | lists-from-held-values |
| REQ-14 | INT-14, INT-23 | lists-from-held-values |
| REQ-15 | INT-14, INT-21, INT-23 | lists-from-held-values |
| REQ-16 | INT-14, INT-20, INT-23 | lists-from-held-values |
| REQ-17 | INT-24 | lists-from-held-values |
| REQ-18 | INT-26, INT-27, INT-28, INT-29, INT-30 | volume-sizes-separated |
| REQ-19 | INT-26, INT-27, INT-29, INT-30 | volume-sizes-separated |
| REQ-20 | INT-31 | volume-sizes-separated |
| REQ-21 | INT-32 | volume-sizes-separated |
| REQ-22 | INT-27, INT-31 | volume-sizes-separated |
| REQ-23 | INT-28, INT-31 | volume-sizes-separated |

**Three notes on the shape of this coverage, deliberate.**

- **The plan's own guardrails are served by checks, not by changes.** REQ-20 to REQ-23 say that
  nothing else moves, and a requirement of that kind is met by an intervention that proves something
  did *not* change: INT-31 walks the screens and the live streams, INT-32 asserts the client's list
  hooks were not touched. INT-32 exists for a specific failure this plan could have — finishing the
  work by moving it into the client instead of the server — and it would catch exactly that.
- **REQ-17 rests on one intervention, INT-24, and it is the requirement the whole plan is for.**
  Two clients costing what one costs is the only benefit here that cannot be obtained any other way,
  and it is the hardest to observe from a screen. If INT-24 is not written, the plan's central claim
  has nothing behind it and must not be declared met by reasoning about the design.
- **REQ-13 is carried by nine interventions and is the one to watch.** Every kind moved onto a held
  value has to mark it due on its own write operations, and a single route that forgets to produces
  exactly the regression this plan must not ship: the operator acts and the screen does not follow.
  It is spread across INT-15 to INT-21 for that reason — one per area, so that a missed area is a
  missing intervention rather than a forgotten line.
