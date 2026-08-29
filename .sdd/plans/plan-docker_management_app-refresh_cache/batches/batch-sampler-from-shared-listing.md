---
batch: sampler-from-shared-listing
feature: The statistics sampler reads the container listing the server already holds
closed_req: REQ-47, REQ-48, REQ-49, REQ-50, REQ-51
depends: —
---

# Batch — the statistics sampler reads the listing the server already holds

The requirements are in `../requirements.md` and are cited here by id.

**The last reader that still fetches a container listing for itself.** `sampleOnce()`
(`server/src/containers/containers-service.ts:552`) calls `GET /containers/json` — running containers
only — on every pass, for one thing: which containers to ask statistics for. The interval is ten
seconds (`STATS_SAMPLE_INTERVAL_MS`, `:179`), so that is **six list reads a minute for as long as
anyone is watching statistics**, on top of everything else the application asks the daemon.

The server already holds that listing. `containerListCache` (`:204`) holds the daemon's own response,
`RawContainer[]`, and every entry of it carries `State` (`:126`). `container-listing-shared` moved the
volume list, the network list and the dashboard onto it and left the sampler out, on the grounds that
its query and its cadence were its own. They still are — and what that batch changed, the held value
being the daemon's own answer rather than a projection, is exactly what makes the running set a filter
over a value already in memory.

## The two listings are not the same query, and the derivation absorbs the difference

| | the held listing | the sampler's own call |
|---|---|---|
| path | `/containers/json?all=true` (`readDaemonContainerList`, `:189`) | `/containers/json` — running only |
| internal extraction containers | removed once, for every consumer (`plan-docker_management_app/REQ-54`) | still present |

So the derivation is **a filter on `State`** (REQ-47), and it **inherits** the internal-container
exclusion the held listing already applies. That inheritance is correct rather than merely harmless:
an intermediate filesystem-extraction container is the application's own, it is never shown to the
operator, and no screen carries statistics for one. It also saves a stats call per extraction
container while an image browse is running.

**Which states count is the one thing here that is easy to get wrong.** `/containers/json` without
`all` returns what the daemon considers running, and the daemon considers a **paused** and a
**restarting** container running: their `State` reads `paused` and `restarting`, and both are in
today's answer. **Measured on 2026-08-30, not taken from the documentation**: a paused container and a
container in its restart backoff were each created and read back from `GET /containers/json` over the
socket, and each was present, reporting `paused` and `restarting` respectively. A filter narrowed to
`State === "running"` would stop sampling paused containers, and
the figures their cards carry today would go blank thirty seconds later — `freshSample` (`:623`) never
looks at the state, so nothing else would hold them. REQ-49 exists for that, and INT-8 asserts it
directly.

## Why `peek()` and never `read()` — the mirror image of the sibling rule

The human's decision of 2026-08-30. `readHeldContainerList` (`:222`) goes through the kind's `read()`,
and the comment above it says why: it covers the application's own last operation (REQ-38) and it
renews the demand that keeps the listing refreshed (REQ-42). **Both reasons are wrong for the
sampler.**

- **It must not wait** (REQ-51). A tick arriving while the previous pass is still out is dropped
  rather than queued (`runSamplePass`, `:540`). `read()` waits in two cases — nothing ever held, and
  the kind marked changed with the held value predating that change (`refresh-cache.md`) — and both
  are ordinary here: the operator presses Stop, the route marks the listing changed, and the sampler's
  next pass would queue behind a daemon round trip. What that costs is not latency but **samples**,
  because the tick behind it is dropped. Nobody awaits the sampler's answer, so there is nothing for a
  wait to buy.
- **It must register no demand** (REQ-50). `read()` renews the kind's demand and starts its refresher.
  An operator watching statistics would then keep the container listing being read every twenty
  seconds for a value nobody is displaying — the demand gate of REQ-14 pointed backwards. `peek()`
  registers none: "without asking for it and without renewing demand" (`refresh-cache.md`).

`peek()` returns `undefined` when nothing is held, **precisely because it keeps nothing alive**. That
is not an edge case to be discovered during development: it is the ordinary state of a server that has
just started, of one whose active context has just changed, and of one where nobody is asking for the
listing. The pass then reads the listing itself, exactly as today, **and samples on that same pass**
(REQ-48). Skipping it would blank the one screen the sampler exists for.

**The two comments must be written against each other.** `containers-service.ts:218-221` says why its
accessor uses `read()` and never `peek()`; the new one says why it uses `peek()` and never `read()`.
Read separately, either looks like the mistake the other corrects — which is how one of them gets
"fixed" into the other by a later reader. INT-1's deliverable is the pair, not the accessor.

## What it gains, and what does not move

- **With the dashboard or the containers screen open** — they ask for the listing already, so one is
  held: **six list reads a minute become none**. The sampler's contribution to the container-listing
  traffic disappears.
- **Watching statistics and nothing else**, with no other asker: nothing is held, the fallback fires,
  and it costs exactly what it costs today. Nothing gained, nothing lost.

**The per-sample statistics calls do not move, and cannot.** One
`GET /containers/{id}/stats?stream=false` per running container per pass, as today (REQ-49). Docker
reports statistics one container at a time: there is no bulk form of that endpoint, and no listing
carries the figures. This is written here so that "the sampler now costs one call less" is not read
later as an invitation to fold the stats calls into something. **There is nothing to fold them into.**

**A newly started container is no slower to appear.** The held listing declares `container` among the
event types that mark it due (`:207`), and the daemon's `container start` event lands inside the
750 ms grouping window, so a container started between two passes is in the held listing before the
next one reads it. The opposite case was already handled: a container that stopped after the listing
was read is asked for statistics, the call fails, and `sampleOnce`'s own `catch` (`:565`) has skipped
it since it was written.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/containers/containers-service.ts`, beside `readHeldContainerList` | A second accessor for the held listing, through the kind's `peek()`: the listing, or nothing when none is held. Its comment states why `peek()` and never `read()`, against the sibling comment that states the opposite. | REQ-47, REQ-50, REQ-51 | — |
| INT-2 | modify | `server/src/containers/containers-service.ts`, `sampleOnce()` | The set to sample is derived from the held listing by `State`, instead of `GET /containers/json`. The states counted are the ones the daemon reports as running: `running`, `paused`, `restarting`. | REQ-47, REQ-49 | INT-1 |
| INT-3 | modify | `server/src/containers/containers-service.ts`, `sampleOnce()` | With nothing held, the pass reads `GET /containers/json` itself and samples on that same pass, as today. The pass is never skipped for want of a held listing. | REQ-48 | INT-1 |
| INT-4 | modify | `.sdd/modules/containers/specs/containers-service.md` and the `ContainersService` row of `.sdd/modules/containers/index.md` | Carry it into the spec: what one pass reads now, the derivation by `State` and which states, the fallback, `peek()` and the two reasons for it, and that sampling registers no demand and waits on nothing. The "Rules and invariants" line naming `GET /containers/json` is the one that is now false. | REQ-47, REQ-48, REQ-49, REQ-50, REQ-51 | INT-1, INT-2, INT-3 |
| INT-5 | modify | `server/test/unit/containers-stats-sampling.test.ts`, its `beforeEach` | Reset the refresh cache before each case, so a held listing is a state a case sets rather than one it inherits from another. The cache is process-wide and its refreshers outlive the case that started them. | REQ-47, REQ-48, REQ-50 | — |
| INT-6 | create | server check tree, unit, in that same file | With a listing held, count the sampler's own listing calls over several passes: zero, while the stats calls keep going out on every pass. | REQ-47 | INT-2, INT-5 |
| INT-7 | create | server check tree, unit, in that same file | With nothing held, the sampler still samples on the pass: it reads the listing itself and one stats call per running container follows, on that pass and on the next. | REQ-48 | INT-3, INT-5 |
| INT-8 | create | server check tree, unit, in that same file | A held listing carrying a container in each state: statistics are asked for exactly the running, paused and restarting ones — one call each — and for none of the created, exited or dead ones. | REQ-49 | INT-2, INT-5 |
| INT-9 | create | server check tree, unit, in that same file | The sampler alone registers no demand: with nothing else asking, after several passes the container listing is not under refresh and no `?all=true` read has reached the daemon. | REQ-50 | INT-1, INT-2, INT-5 |
| INT-10 | create | server check tree, unit, in that same file | A listing marked changed with its read held open across a pass costs no sample: the stats calls go out on their own tick while that read is still in flight, and no pass is dropped. | REQ-51 | INT-1, INT-2, INT-5 |

## How the checks observe the mechanism, not its presence

`server/test/unit/containers-stats-sampling.test.ts` already mocks the daemon and the clock for
exactly this kind of measurement, and says why in its own header: what is measured is the **traffic**,
because the number of requests reaching the Engine API over a window is the only observation that
tells a gated sampler from an ungated one. The five new cases are the same measurement pointed at a
different call, and they sit beside the existing ones rather than replacing any:

- the existing cases assert the **stats** traffic — the cadence, the immediate first sample, the
  idempotent start and stop, the dropped tick, the staleness bound. None of them looks at the listing
  call, so none changes.
- **the existing cases hold nothing, so they exercise the fallback by construction.** Nothing in that
  file asks for the container listing, so after INT-3 every one of them takes the REQ-48 path and
  keeps passing unchanged. That is a property to preserve, which is why INT-5 resets the cache rather
  than filling it.

Two things the implementer must get right for the measurement to mean anything:

- **Count the exact path, not the pathname.** `engine.callsTo()` in `server/test/support/engine-mock.ts`
  matches `call.pathname`, with the query string stripped — so `callsTo("GET", "/containers/json")`
  counts the sampler's call **and** the held listing's `?all=true` read together, and a check written
  that way cannot tell them apart. Filter on `call.path === "/containers/json"` and on
  `call.path === "/containers/json?all=true"` respectively, as
  `server/test/unit/shared-container-listing.test.ts` already does for the second.
- **A held value is a state a case must set.** Call `readContainerList()` (or the kind's own `read()`)
  before the passes being counted, and remember that doing so puts the listing under refresh on its
  own twenty-second period — which issues `?all=true` reads of its own while the fake clock advances.
  That is another reason the two counts must be kept apart.

INT-9 is the one that counts in the opposite direction, and it is what makes INT-6 worth having: an
implementation reading with `read()` would pass INT-6 — it removes the six calls a minute all the same
— and fail INT-9, because it leaves a refresher running for a listing nobody displays.

INT-10 needs the case where `read()` genuinely blocks: a value already held, the kind marked changed,
and the covering read held open by the mocked daemon. `read()` waits for that read; `peek()` returns
what is held and the pass samples. Written against a slow read alone it would prove nothing —
`read()` answers from the held value without waiting in that case.

## Human acceptance

**REQ-50 has no scenario of its own, and that is deliberate.** Every screen that subscribes to the
figures also asks for a list, so an inverted demand gate is not observable from the interface: it is a
constraint that protects a future consumer, and INT-9 is what proves it.

### Scenario: Watching statistics costs no container listing of its own

- REQ → REQ-47, REQ-49
- Given → the operator is on the Containers screen with the live figures moving, and `VEXEL_DOCKER_LOG` left at its default
- When → they watch the server's Docker call log for a minute
- Then → the six `/containers/json` a minute the sampler used to add are gone, and every card still shows CPU and memory figures that keep moving

### Scenario: A server that has just started shows the figures without waiting

- REQ → REQ-48
- Given → the server has been restarted and holds no container listing at all
- When → the operator opens the Containers screen
- Then → the cards carry their CPU and memory figures as fast as they do today, not one interval later

### Scenario: A paused container still shows its figures

- REQ → REQ-49
- Given → a container is paused and the operator is on the Containers screen
- When → they look at its card half a minute later
- Then → it still carries the memory and CPU figures it carries today, rather than having gone blank

### Scenario: Stopping a container does not cost the other cards a reading

- REQ → REQ-51
- Given → several containers are running on the Containers screen with their figures updating
- When → the operator stops one of them
- Then → the remaining cards keep updating on their own ten-second rhythm, with no reading missed while the list is read again
