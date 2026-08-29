---
slug: docker_management_app-refresh_cache
date: 2026-08-28
spec: .sdd/analysis/docker_management_app-refresh_cache.md
status: validated
---

# Requirements — refresh cache

> This plan changes how data reaches the interface, never what the interface shows. The last feature
> states what must not move.

## Feature — Values that cannot change are read once

| ID | Requirement |
|----|-------------|
| REQ-1 | Which CLI programs are installed, and their versions, are determined once for as long as the server runs; asking again launches no program. |
| REQ-2 | The platform of an image is determined once per image identity; listing images does not inspect an image whose platform is already known. |
| REQ-3 | Both keep answering as they do today: the same values reach the screen, and a value that cannot be determined is reported as it is now, not as an error and not as a blank. |

## Feature — One connection to the daemon is reused

| ID | Requirement |
|----|-------------|
| REQ-4 | Calls to the daemon reuse an open connection instead of opening one per call; on a remote context, a run of calls starts no new `ssh` process each and performs no new TLS handshake each. |
| REQ-5 | A reused connection belongs to the endpoint it was opened for; after the operator changes the active context, no call reaches the previous daemon. |

## Feature — A detail view re-reads only for the object it shows

| ID | Requirement |
|----|-------------|
| REQ-6 | A daemon event carries the identifier of the object it concerns, in addition to the name it already carries. |
| REQ-7 | A detail view reads again only for events about the object it shows; an event about another object of the same kind leaves it alone, and the daemon is not asked about the shown object. |
| REQ-8 | A detail view still reads again for every event about its own object, and still shows what the daemon reports at that moment. |

## Feature — The lists are answered from values the server keeps current

| ID | Requirement |
|----|-------------|
| REQ-9 | A list endpoint answers from a value the server already holds, without calling the daemon while the client waits; only a value never read before is fetched with the client waiting. |
| REQ-10 | A value being read again is still served meanwhile: a read in flight never delays an answer and never turns one into an error. |
| REQ-11 | One background task per kind of data keeps each held value current on a schedule the server owns, so a slow or blocked read of one kind delays only that kind. |
| REQ-12 | A daemon event marks the values it affects as due, and they are read again without waiting for the timer; events that arrive together produce one read, not one per event. |
| REQ-13 | An operation the operator performs through the application marks the values it affects as due, so its result is visible without waiting for a timer or an event. |
| REQ-14 | A value nobody has asked for within a bounded period stops being refreshed, and the next request starts it again; while no client is asking, the application calls the daemon for none of these values. |
| REQ-15 | When the daemon cannot be reached, the last good value is kept and served with the time it was read, instead of the endpoint failing. |
| REQ-16 | A change of active context discards every held value, so no value describing the previous daemon reaches the interface. |
| REQ-17 | Two clients asking for the same list cost the daemon what one costs. |

## Feature — Volume sizes are read on their own schedule

| ID | Requirement |
|----|-------------|
| REQ-18 | The size of a volume is read on its own schedule, separate from and much less frequent than the volume list; listing volumes no longer makes the daemon compute its whole disk usage. |
| REQ-19 | Volumes are still listed with their size and with the containers mounting them, as they are today. |

## Feature — Nothing else moves

| ID | Requirement |
|----|-------------|
| REQ-20 | No screen changes what it shows, how it is operated, or how fast it reflects the operator's actions. |
| REQ-21 | The client's list hooks keep the public shape their screens use, their intervals and their event subscriptions. |
| REQ-22 | Detail reads stay direct, with no value held on the server for them. |
| REQ-23 | The live streams keep their behaviour: container logs, container statistics, build and transfer output, compose logs, and the daemon event stream's own subscription, backlog and reconnection. |

## Feature — The endpoint is set before the server serves

> Appended on 2026-08-28, after a full pass showed a server started seconds earlier answering a list
> endpoint with a failure against a reachable daemon. Reduced the same day: see the note under the
> table.

| ID | Requirement |
|----|-------------|
| REQ-24 | The server accepts no request until the active Docker endpoint has been resolved and set, so no held value is ever discarded by the startup resolution while a request is being served. |
| REQ-25 | *Withdrawn on 2026-08-28 — the startup warm read. See the note below.* |
| REQ-26 | *Withdrawn on 2026-08-28 — demand expiry applied to warmed values. See the note below.* |
| REQ-27 | A read disowned by a discard does not leave the waiting caller with neither a value nor an error. |
| REQ-28 | *Withdrawn on 2026-08-28 — the volume-size exclusion from the warm read. See the note below.* |
| REQ-29 | A daemon that cannot be reached at startup does not stop the server from accepting requests: the port opens and the failure is served the way it is today. |

> **REQ-25, REQ-26 and REQ-28 are withdrawn on the human's decision of 2026-08-28**, before any of
> them was developed. The warm read solved a problem REQ-9 already solves: a value never read before
> is read by the first request that wants it, with the client waiting, so an operator never waits a
> period for data. It bought only the latency of one read on the very first screen, and REQ-26 and
> REQ-28 existed only to make it safe. The defect it was bundled with is real and is still closed
> here, by REQ-24 and REQ-27, neither of which needs it. With the warm read gone there is no
> deviation from REQ-14 and none from the plan's no-persistence assumption, so the two departures
> that stood here are withdrawn with it.
>
> **The three ids are marked withdrawn where they stand and are never reused.** `identifiers.md`
> makes ids stable after validation, this plan is validated, and REQ-30 — which would shift under a
> renumbering — belongs to a batch already certified.

## Feature — The remaining checks reload through the control

| ID | Requirement |
|----|-------------|
| REQ-30 | A check that creates a context, a builder or a build-cache record out of band sees it by pressing the refresh control, not by waiting out a period; what each check asserts does not change. |

## Appended on 2026-08-29 — the version negotiation

> Appended after the Docker call log made the traffic readable: **half of everything this server
> asks the daemon is a re-negotiation of the API version**. Measured at rest, 235 of 447 socket
> calls were `/version` — one before every single call, on the cheapest transport this application
> supports. Recorded first as debt (`.sdd/tech-debt/entries/engine-version-negotiated-on-every-call.md`),
> promoted to a fix here on the human's decision of 2026-08-29.
>
> Per [[every-change-updates-spec-requirements-plan]] this is appended as a further batch. **Nothing
> above this line was changed**, beyond the one row added to the batch table in `batches.md` and its
> coverage rows: no certified batch is reopened.

## Feature — The Engine API version is negotiated once, and the probe still probes

| ID | Requirement |
|----|-------------|
| REQ-31 | Composing the path of a call to the daemon uses a version the server already holds: a run of calls negotiates the Engine API version once, not once per call. Calls issued while a negotiation is in flight wait on that one instead of each starting their own. |
| REQ-32 | Determining whether the daemon can be reached still calls the daemon every time it is asked. Reachability is never reported from a held value, and neither are the Engine API and engine versions the connection status carries. |
| REQ-33 | A negotiation that actually reached the daemon becomes the value the paths are composed with, so what the calls use is never older than the last successful probe; an upgraded daemon is picked up without restarting the server. |
| REQ-34 | The held version belongs to the endpoint it was negotiated with: after the active context changes, no call is composed with the previous daemon's version. |
| REQ-35 | A negotiation that failed is not held. The call that hit the failure reports the daemon's own message exactly as it does today, and the next call negotiates again rather than inheriting the failure or a value from before it. |
| REQ-36 | Nothing else moves: the same paths are dialed, every endpoint answers what it answers today, and the connection status still reports the negotiated Engine API version and the engine version. |

## Appended on 2026-08-29 — one container listing for every consumer

> Appended after the second finding of the same call audit: **three services and the dashboard each
> fetch the whole container listing for themselves**. The refresh cache cannot serve them, because
> what it holds is a projection that has already dropped `Mounts` and `NetworkSettings` — the two
> fields they exist to read. Seven `/containers/json?all=true` a minute while all three lists are
> being asked for, four of them derivative. Recorded as debt on 2026-08-27 and revised on 2026-08-29
> (`.sdd/tech-debt/entries/container-listing-refetched-by-every-consumer.md`), promoted to a fix by
> the human on 2026-08-29.
>
> Per [[every-change-updates-spec-requirements-plan]] this is appended as a further batch. **Nothing
> above this line was changed**, beyond the one row added to the batch table in `batches.md` and its
> seven coverage rows: no certified batch is reopened.

## Feature — One container listing serves every consumer

| ID | Requirement |
|----|-------------|
| REQ-37 | The volume list, the network list and the dashboard overview are built from the container listing the server already holds; none of them calls the daemon for a container listing of its own. |
| REQ-38 | Each of them is served a listing that covers the operator's own last action: after an operation the application performed on a container, the next volume list, network list and dashboard describe the containers as they are after it. |
| REQ-39 | The listing the server holds is the daemon's own container response, and the projection the container endpoint answers with is produced when that endpoint is read. What `/api/containers` returns does not change: the same fields, the same values, the same order. |
| REQ-40 | The sampled CPU, memory and network figures are merged onto the container listing once, when it is read, and every container still carries figures no older than the sampler's own interval. |
| REQ-41 | The application's own internal extraction containers are excluded once, on the held listing: no volume is listed as mounted by one, and no network as attached to one. |
| REQ-42 | Asking for the volume list, the network list or the dashboard overview counts as asking for the container listing, so it keeps being refreshed while one of those screens is open; while nobody asks for any of them or for the containers screen, it is refreshed no more. |
| REQ-43 | Nothing else moves: every endpoint answers what it answers today — the same containers, the same volumes with the same mounting containers, the same networks with the same attached containers, the same dashboard counts, each in the same order. |
| REQ-44 | The held container listing is marked due by the daemon's network events as well as its container ones, because a container's network attachments are part of what that listing now carries. |

> **REQ-44 was added on 2026-08-29, during the batch**, after its checks found that attaching a
> container to a network no longer showed in the next network list. REQ-38 already required the fix
> for the operator's own action; REQ-44 is the other half — the listing must declare what invalidates
> it, so a route that forgets to say so is a delay and not a wrong answer. Per
> [[development-goes-through-sdd-dev]] a correction found mid-run becomes further interventions in
> the same batch, which is where both live.

## Appended on 2026-08-30 — the change-coverage check

> Appended after a check for REQ-13 was found to fail about one run in five. It fails on a claim the
> daemon does not make. The check is in `server/test/api/refresh-cache-routes.test.ts`, and it kills a
> container through the application and then asserts the very next listing reports it `exited`.
> `POST /containers/{id}/kill` answers 204 when the signal has been **delivered**, not when the
> container has exited. Docker emits `container kill` at that moment, with the container still alive,
> and `container die` later, when the process actually exits.
>
> Measured at the daemon on 2026-08-30, not assumed. A probe over the Engine API did create, start,
> kill and then `GET /containers/json?all=true`, back to back in one process. It reported the
> container still `running` on the very next listing **14 times out of 15**.
>
> The check makes two claims and only one of them is ours. That the listing served was read after the
> operation is ours, and it is REQ-13. That the container reads `exited` in that listing is the
> daemon's, and the 204 does not promise it. The cache does what REQ-13 asks. The check passes most of
> the time only because Express and the round trip give the daemon those milliseconds.
>
> Per [[every-change-updates-spec-requirements-plan]] this is appended as a further batch. **Nothing
> above this line was changed**, beyond the one row added to the batch table in `batches.md` and its
> two coverage rows: no certified batch is reopened.

## Feature — The change-coverage check asserts the guarantee, not the daemon's timing

| ID | Requirement |
|----|-------------|
| REQ-45 | After an operation whose effect on the daemon is not complete when the operation answers, a check of REQ-13 asserts that the listing it is served next was read after the operation was asked for, instead of asserting the object's resulting state. It still asserts the resulting state after operations whose effect is complete when they answer. |
| REQ-46 | No check of REQ-13 waits, retries or polls for a value to become what it expects. It reads the list once after the operation and asserts on that answer. |

> **REQ-46 forbids the obvious repair, and that is why it is a requirement and not an assumption.** A
> retry loop would turn a change-coverage check into an eventual-consistency one. It would pass even
> if the cache stopped re-reading and merely waited out its twenty-second period, which is to say it
> would pass by ceasing to test REQ-13. `CLAUDE.md` states the case: a test that has quietly stopped
> testing anything is worse than a slow one, and it is invisible because it passes.

## Appended on 2026-08-30 — the statistics sampler's own container listing

> Appended after the last reader that still fetches a container listing for itself was identified:
> the **statistics sampler**. `sampleOnce()` calls `GET /containers/json` — running containers only —
> every ten seconds, for one thing alone: which containers to ask statistics for. Six list reads a
> minute, for as long as anyone is watching statistics.
>
> The server already holds that listing. `container-listing-shared` made it the daemon's own response
> rather than a projection, so every entry of it carries the container's `State`, and the running set
> is a filter over a value already in memory. That batch left the sampler out on purpose — its query
> and its cadence are its own — and it is exactly what that batch changed that makes the sampler
> reachable now.
>
> **The sampler reads with `peek()` and never with `read()`**, which is the opposite of the rule the
> volume list, the network list and the dashboard follow, and the reason is the opposite too. They
> need REQ-13's change coverage. The sampler is a background timer: nobody awaits its answer, and a
> tick arriving while the previous pass is still out is dropped rather than queued, so a read that
> waits costs **samples** and not milliseconds. And `peek()` registers no demand, which is the second
> half of the decision: with `read()`, an operator watching statistics would keep the container
> listing being read for a value nobody is displaying — the demand gate of REQ-14 pointed backwards.
>
> Decided by the human on 2026-08-30, design and perimeter together. Per
> [[every-change-updates-spec-requirements-plan]] this is appended as a further batch. **Nothing above
> this line was changed**, beyond the one row added to the batch table in `batches.md` and its five
> coverage rows: no certified batch is reopened.

## Feature — The statistics sampler reads the container listing the server already holds

| ID | Requirement |
|----|-------------|
| REQ-47 | The statistics sampler derives the containers it samples from the container listing the server already holds. While a listing is held, a sampling pass asks the daemon for no container listing of its own. |
| REQ-48 | When the server holds no container listing, the sampler reads one itself, as it does today, and samples on that same pass. It never skips a pass for want of a held listing. |
| REQ-49 | The same containers are sampled as before: the ones the daemon reports when it is asked for running containers only — a paused and a restarting container among them — with one statistics call each. Every container that carries figures on the screen today still carries them. |
| REQ-50 | Sampling statistics is not asking for the container listing: while nobody else asks for it, sampling neither starts its refresher nor keeps one alive. |
| REQ-51 | A sampling pass never waits on the container listing: a read of it in flight, or a listing the application has just marked as changed, delays no pass and costs no sample. |

> **REQ-48, REQ-50 and REQ-51 are requirements and not assumptions, because each is a way this batch
> could be built wrong and still look right.** A sampler that skipped the pass when nothing was held
> would blank the figures on exactly the screen it exists for; REQ-48 is the difference between
> deriving a value and depending on one, and the case is ordinary rather than exceptional — `peek()`
> returns nothing precisely because it keeps nothing alive. REQ-50 and REQ-51 are the two halves of
> the `peek()` decision, and they fail differently: reading with `read()` breaks both at once, while a
> `peek()` written to wait for a refresh in flight breaks only the second. Each is observable on its
> own, so each is asserted on its own.
>
> **REQ-49 is the requirement that keeps the saving from being taken out of the product.** The set the
> daemon returns for running containers is not the set whose `State` reads `running`: it includes
> `paused` and `restarting`. Narrowing the filter by one word would stop sampling paused containers,
> and their figures would leave the screen half a minute later.
>
> Measured at the daemon on 2026-08-30, not inferred from the documentation. A paused container and a
> container in its restart backoff were each created and `GET /containers/json` — no `all`, the
> sampler's own query — was read back over the socket. Both were **present**, reporting `State`
> `paused` and `restarting` respectively; the states the listing carried across the whole host were
> exactly `running` and `paused` while the probe stood. The predicate this batch writes is therefore a
> set of three states and not an equality on one, and `batch-sampler-from-shared-listing/INT-8` is
> what fails when someone narrows it.
