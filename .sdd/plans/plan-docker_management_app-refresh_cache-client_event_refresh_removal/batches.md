---
slug: docker_management_app-refresh_cache-client_event_refresh_removal
date: 2026-09-01
spec: .sdd/analysis/docker_management_app-refresh_cache-client_event_refresh_removal.md
status: validated
---

# Batches — the client stops refreshing on Docker events

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
|-------|---------|------------|---------|--------|------------------|
| `batch-client-event-trigger-removal` | The client's Docker-event refresh trigger is removed | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15 | — | implemented | An open detail stops following the daemon on its own |
| `batch-dashboard-overview-clock` | The Dashboard's overview figures move on a clock | REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24 | `batch-client-event-trigger-removal` | implemented | The Dashboard follows the host with nobody touching it |
| `batch-container-detail-clock` | The container detail follows the container it shows | REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36, REQ-37, REQ-38, REQ-39 | `batch-dashboard-overview-clock` | implemented | The dialog stops contradicting itself |

Execution order: the removal, then the Dashboard's clock, then the container detail's. Each rebuild
takes back one of the seven triggers the demolition removed, and each reads a codebase the previous
one has left behind. The third depends on the second for one file — the check that closed REQ-21,
which it narrows — and that file must exist before it can be narrowed.

> **The plan was extended twice on 2026-09-01**, each time after the human saw the previous batch
> implemented, which is why the frontmatter reads `draft` again. Every row but the last is untouched
> and still says what its own batch did.

## The scope of REQ-12

REQ-12 says the server is unchanged. The clock the human asked for is cheap or expensive depending
on whether the overview endpoint may read what the server already holds, and that is server work.
Both cannot be read as statements about the whole plan, so one of them has to be scoped. **REQ-12 is
read as scoped to the first batch.** The figures behind that, and what the other reading would have
cost, are below.

**What one overview request costs today.** `GET /api/system/overview` calls `getSystemOverview()`,
which reads from the daemon on every request. Four readings, of which three bypass a value the
server already holds:

| Reading | Channel | What the server already holds for it |
|---------|---------|--------------------------------------|
| `/system/df` — the whole host's disk accounting | Engine API | nothing for the totals; `volumeSizeCache` reads the same call for volume sizes alone, on a 300 000 ms period |
| build-cache inventory | `docker buildx du` | `buildCacheListCache`, 30 000 ms |
| compose projects | `docker compose ls` | `composeProjectsCache`, 30 000 ms |
| builder inventory | `docker buildx ls` | `builderListCache`, 30 000 ms |

The container counts are the one free part: they already come from the held listing. So a tick costs
one `/system/df` plus three CLI process spawns, and it costs that **once per open window**.

`/system/df` is named by this cycle's spec, and by the refresh-cache analysis before it, as the
single most expensive call the application makes. The server allows itself twelve of them an hour,
and `volumes-service.ts:141-146` says in as many words why. `use-system-overview.ts` carries the
matching sentence on the client side: it does not poll because "a dashboard left open all day must
not keep the daemon busy computing it".

**Reading A, the one taken — REQ-12 is scoped to the first batch; the second batch may touch the
server.** The
overview is served from the values the server holds; a tick becomes an in-memory read and an HTTP
round trip, and the daemon-facing rate stops depending on how many windows are open. The client
period is then chosen for what the operator sees rather than for what it costs, and can sit with the
list clocks at 3 000 ms — the same clock as the container panel directly beneath the tiles, so the
two halves of one screen stop disagreeing. The sizes still move at whatever period is set for the
disk-usage reading, which becomes an explicit decision instead of a side effect.

Its cost: real server work — the disk-usage totals registered as a kind of their own, `overview-service`
reading held values, their component specs, index rows and server checks — and a departure to record,
because REQ-12 as written does not admit it.

**Reading B, refused — the second batch stays inside the client and pays.** No server file is touched, and
the tick keeps the four readings above. The shortest period defensible without a measurement on a
large host is 60 000 ms: sixty `/system/df` an hour per open window, against the twelve an hour the
server allows itself for the same call. At 30 000 ms it is a hundred and twenty an hour — ten times
the server's own rate for the call both comments call too expensive to repeat. What the operator
gets for it: a container started elsewhere appears in the activity panel after three seconds and in
the tile above it up to a minute later. What the suite gets: at the pass factor of 0.2 every check of
this clock waits twelve seconds, against 600 ms under Reading A.

**Why A.** REQ-12 sits in Feature 5, "Nothing else moves", which is a guard
on a demolition; it was closed by the first batch, whose INT-10 states in its own words that no file
under `server/` was changed. Read as a statement about the whole plan it forbids the rebuild the
human has just asked for, and the analysis puts that rebuild outside its own scope rather than
outlawing it. Under Reading A, REQ-12 stands unedited as the record of what the first batch did, and
REQ-22 and REQ-23 bound what the second one may change.

## The period of the Dashboard's clock

**3 000 ms.** Three reasons, in order of weight:

- It is the number the screen already runs on. The container activity panel under the tiles is fed
  by the containers listing, which polls at 3 000 ms, and the tile above it counts the same
  containers. Any slower number puts two clocks on one screen and shows the operator the same fact
  twice, at two different times.
- It is not a new figure. `use-containers`, `use-images`, `use-volumes`, `use-networks` and
  `use-compose-projects` all declare `cadence(3000)`; this adds a sixth caller of a number the
  product has already chosen, rather than a seventh cadence to reason about.
- Under Reading A it costs an in-memory read and an HTTP round trip, so the period is answerable to
  what the operator sees and to nothing else. What actually bounds each figure's freshness is the
  server's own period for the value behind it — the container counts follow the held listing, which
  is marked due by container events and so moves as fast as the lists do; the sizes follow the
  disk-usage reading, whose period the second batch sets deliberately.

Under Reading B this number would have been 60 000 ms, for the cost stated above and against both
comments that say the call is too expensive to repeat.

## Assumptions and decisions

### The third batch — the container detail's clock

- **The same 3 000 ms, and deliberately not a number of its own.** The defect the human saw is two
  clocks disagreeing: the header is drawn from the container summary the Containers screen polls at
  3 000 ms, the payload was frozen. A slower period for the payload leaves the dialog contradicting
  itself for the difference, which is the defect one layer down. The process listing takes the same
  figure for the same reason — two clocks inside one dialog is what this batch exists to end.
- **"One figure, declared in one place" (REQ-33) means the timing scale, not a new shared constant.**
  Every polled hook in this product declares its own `POLL_INTERVAL_MS = cadence(3000)` locally, and
  these two follow that convention. What is in one place is the factor every cadence passes through.
- **Both clocks are scoped to the tab that shows their data**, and that data is read the moment the
  tab is opened. Unscoped, an operator watching logs for ten minutes pays 400 requests for readings
  nobody is looking at. The accepted price is a parameter on both hooks and the change of shape in
  their two specs.
- **A container that is not running is never asked for its processes.** The daemon refuses `top` for
  a stopped container, so an unscoped clock would report a refusal every three seconds. A refusal
  blinking on a tab is a defect being introduced, not a state being reported.
- **A tick that finds nothing changed replaces nothing.** The Inspect tab is several hundred fields
  with sections the operator opens, a find that filters them and a raw payload they select text out
  of. The open sections and the find term are held by the explorer itself and survive a replacement
  (`client/src/ui/data/PayloadExplorer.tsx`), but the payload's flattening is memoized on its
  identity, so a replacement redraws the whole tree and takes an in-progress selection with it.
- **The edit form was checked and needs no protection it does not have.** `buildFormState` is called
  only from `startEdit`, and the footer's "what a save would cost" is a constant sentence, not a diff
  against the payload. REQ-31 pins that behaviour so a tick cannot acquire the power to disturb it.
- **This batch does not close `no-response-sequencing-guard`.** A three-second clock on a read that
  can take longer makes an older answer landing last reachable here, as it already is on every polled
  list. The debt stays in the register with its evidence; a plan does not schedule a debt it was not
  asked for.
- **The server is not touched.** The inspect data and the process listing stay pull-based — the
  human's standing decision, recorded in `detail-views-reread-on-unrelated-events`. One Engine call
  per period per open tab, and only one detail can be open at a time.

### The second batch — the Dashboard's clock

- **One held reading of `/system/df`, replacing the volume-size kind — not a second one beside it.**
  The human's decision of 2026-09-01 is that no rate is added for that call which does not exist
  today. Registering a disk-usage kind and leaving `volumeSizeCache` standing would put two readers
  of the same payload on the same 300 000 ms rhythm, which is the very thing
  `volumes-service.ts:141-146` refuses. So the existing reading is widened to hold the whole payload
  and the volume sizes become one view of it, at the same period, marked due by the same events and
  the same operations. The volume listing's behaviour does not change.
- **The reclaimable-space breakdown stays a direct read.** `getDiskUsage()`, behind System & prune,
  keeps calling the daemon when the screen asks it to — as it does today, so no rate is added there
  either, and REQ-23 holds for that screen. This also keeps a decision the earlier cycle took on
  purpose: `plan-docker_management_app-refresh_cache/batch-volume-sizes-separated/INT-4` states that
  the breakdown "does not change and does not become a held value".
- **Counts and sizes come from different places, and may describe different moments.** The human's
  decision: the counts follow the listings the server already holds — images and volumes are marked
  due by daemon events, so those tiles move as fast as their own screens — while the sizes follow the
  held disk-usage reading and may be up to five minutes old. One tile can therefore show a count that
  has moved beside a size that has not. It is the price of adding no `/system/df` rate, it is
  visible, and the operator's refresh control closes the gap on demand. The overview's contract says
  today that no two figures in one payload describe different moments; INT-7 replaces that sentence
  rather than leaving it to be discovered.
- **No disagreement is introduced on screen.** The Dashboard's disk-usage breakdown renders sizes
  only, never the item counts held beside them, so the counts inside the breakdown and the counts on
  the tiles are never shown against each other.
- **No endpoint is added and no payload changes shape.** The overview service and the held values are
  in one process; the client keeps calling `GET /api/system/overview` and receives what it receives
  today. The pattern is already in the codebase — `volumes-service.ts:168`, `heldVolumeSizes()`.
- **The first read still waits.** With nothing held yet the overview waits for the disk-usage
  reading, so a freshly started server paints the Dashboard with real figures rather than zeros. Only
  the reads after it answer from what is held (INT-5).
- **The clock does not stop when the browser tab is hidden.** No list hook pauses today, and REQ-17
  says the Dashboard's clock behaves like theirs. A visibility rule for the whole product is a
  decision of its own and is not taken here.

### The first batch — the removal

- **One batch, not several.** The spec names a half-done demolition as worse than either end of it:
  some screens with two triggers and some with one is a state nobody designed. REQ-13 is also only
  true once every subscriber is gone, so it cannot be closed by a first batch of a series.
- **The perimeter was counted in the client, not assumed.** Thirteen places subscribe to the daemon
  event stream. Twelve subscribe in order to re-read and are removed; the thirteenth is the
  Dashboard's event-feed service and is untouched. The seven views that lose their only automatic
  trigger are exactly the seven the spec names: `use-system-overview`, `use-disk-usage`,
  `use-container-detail`, `use-image-inspect`, `use-image-layers`, `use-network-inspect`,
  `use-volume-inspect`.
- **Six list hooks keep their clock**: `use-containers`, `use-images`, `use-volumes`, `use-networks`,
  `use-compose-projects`, `use-plugins`. Their poll, their active-context subscription and their
  reload subscription are not touched.
- **`client/e2e/detail-reread-scoped.spec.ts` is removed with the behaviour it covers.** Both its
  tests are about the client's event-driven detail re-read. Its second test also touched
  `plan-docker_management_app-refresh_cache/REQ-58`, which is a **server** requirement and survives;
  that requirement keeps its coverage in `server/test/api/detail-derivation-follows-listing.test.ts`
  and its unit counterpart. INT-9 makes confirming that a condition of removing the file.
- **The server's own reaction to events stays.** The server still marks its held values due on a
  daemon event, so the lists on the clock keep showing fresh data three seconds later. Only the
  browser stops deciding when to read.
- **`client/e2e/support/caught-up.ts` needs no change.** It waits for the list poll and the server's
  own grouping window, neither of which this batch touches.
- **The three technical-debt entries named by the spec stay in the register.** Human decision of
  2026-09-01: this plan removes none of them.

## Requirements this plan supersedes

Per [[past-analyses-and-plans-are-never-touched]], nothing in the earlier plan is edited. Recorded
here so the next reader is not confused by two live statements of the opposite behaviour:

- `plan-docker_management_app-refresh_cache/REQ-7` and `REQ-8` — a detail view re-reading for events
  about its own object. Superseded by REQ-1: it re-reads for no event at all.
- `plan-docker_management_app-refresh_cache/REQ-21`, its "event subscriptions" clause only. The rest
  of REQ-21 — the public shape of the list hooks and their intervals — stands, and REQ-6 restates it.

**Inside this plan, three requirements are records of their own batch and not of the plan's end
state.** They are not edited, for the same reason, and this is the map:

- **REQ-2** — the seven quiet views reading only when opened, asked or on a context switch. Still
  true of five of them. The Dashboard's overview left that list in the second batch (REQ-16), and the
  container detail in the third (REQ-26), the process listing beside it (REQ-27).
- **REQ-12** — the server unchanged. The record of the first batch; the second was allowed the server
  work REQ-22 needs, bounded by REQ-23. See "The scope of REQ-12".
- **REQ-21** — no other view gaining a trigger. Its own words scope it to the second batch, so the
  third contradicts nothing; what the third batch does change is the check that closed it, which
  REQ-37 narrows rather than deletes.

## Departures from the spec

All four are decisions of 2026-09-01, taken during validation. **The spec was corrected on the same
day** and now reads as REQ-9, REQ-13, the second batch and the third do; this section is the account
of why.

- **The spec put the server out of scope entirely, and said the mechanism replacing the event trigger
  "is a later step, with its own analysis".** The second batch is that step, folded into this cycle:
  the human, having seen the first batch implemented, asked for the Dashboard's clock here and chose
  extending this plan over opening a new analysis. The spec now carries the clock in its scope,
  together with the server work that "asks the daemon for nothing already held" implies, and its
  later-step line now covers only the six views this addition does not reach. The server work stays
  bounded by REQ-23 and reaches exactly the reading behind the overview.

- **That later-step line was narrowed a second time, the same day, for the third batch.** It now
  names the five views that are actually left: the disk-usage view of System & prune and the details
  of an image, an image's layers, a network and a volume. The container's inspect data and its
  process listing came out of it because the human ran the application and found the dialog
  contradicting itself — the reason they gave, and the reason the spec now carries, is that **a view
  that disagrees with itself is worse than one that is merely old**. That is a defect the operator
  can see, not a freshness preference. REQ-37 keeps a check standing over the five that remain.

- **The spec's requirement "An action the operator performs through the application still shows its
  result immediately"** is narrowed by REQ-9 to where the application already re-reads after its own
  action. The spec's wording would require adding a re-read to the seven views of REQ-2, and the
  human's instruction is that this step removes and adds nothing. Measured before the decision: the
  operator's actions live on the list screens, which call their own re-read, and the one action taken
  inside a detail view — the container's configuration update — already re-reads explicitly. So the
  narrowing costs the operator nothing they can see, except where a view other than the one acted
  upon was following along on the event.
- **The spec's non-functional requirement "The application makes strictly fewer requests than before
  this step"** is replaced by REQ-13. Nothing is measured and no request is counted. What is asked
  for instead can be read off the code: after this step the Dashboard's event feed is the only
  subscriber to the daemon event stream left in the client.

## Coverage check

Every REQ is served by at least one INT, and every INT serves at least one REQ, in all three batches.
No enabling intervention in any of them. No REQ is spread over two batches: REQ-1 to REQ-15 close in
`batch-client-event-trigger-removal`, REQ-16 to REQ-24 in `batch-dashboard-overview-clock`, REQ-25 to
REQ-39 in `batch-container-detail-clock`. The INT ids below are local to their own batch file.

### `batch-client-event-trigger-removal`

| REQ | Served by |
|-----|-----------|
| REQ-1 | INT-1, INT-2, INT-3, INT-11 |
| REQ-2 | INT-2, INT-3, INT-11 |
| REQ-3 | INT-1, INT-2, INT-3, INT-4, INT-8, INT-11 |
| REQ-4 | INT-4 |
| REQ-5 | INT-4, INT-10 |
| REQ-6 | INT-1, INT-7 |
| REQ-7 | INT-1, INT-2, INT-3 |
| REQ-8 | INT-1, INT-2 |
| REQ-9 | INT-1, INT-3 |
| REQ-10 | INT-1, INT-2, INT-3 |
| REQ-11 | INT-10 |
| REQ-12 | INT-10 |
| REQ-13 | INT-4, INT-5 |
| REQ-14 | INT-6, INT-7, INT-8, INT-9, INT-10 |
| REQ-15 | INT-6, INT-7, INT-9, INT-10 |

| INT | Serves |
|-----|--------|
| INT-1 | REQ-1, REQ-3, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10 |
| INT-2 | REQ-1, REQ-2, REQ-3, REQ-7, REQ-8, REQ-10 |
| INT-3 | REQ-1, REQ-2, REQ-3, REQ-7, REQ-9, REQ-10 |
| INT-4 | REQ-3, REQ-4, REQ-5, REQ-13 |
| INT-5 | REQ-13 |
| INT-6 | REQ-14, REQ-15 |
| INT-7 | REQ-6, REQ-14, REQ-15 |
| INT-8 | REQ-3, REQ-14 |
| INT-9 | REQ-14, REQ-15 |
| INT-10 | REQ-5, REQ-11, REQ-12, REQ-14, REQ-15 |
| INT-11 | REQ-1, REQ-2, REQ-3 |

### `batch-dashboard-overview-clock`

| REQ | Served by |
|-----|-----------|
| REQ-16 | INT-6, INT-8, INT-12 |
| REQ-17 | INT-6, INT-8, INT-9 |
| REQ-18 | INT-6, INT-8, INT-9, INT-12 |
| REQ-19 | INT-6, INT-8 |
| REQ-20 | INT-6, INT-14 |
| REQ-21 | INT-13 |
| REQ-22 | INT-1, INT-2, INT-3, INT-4, INT-5, INT-7, INT-10 |
| REQ-23 | INT-2, INT-3, INT-4, INT-7, INT-11, INT-14 |
| REQ-24 | INT-9, INT-10, INT-11, INT-12, INT-13, INT-14 |

| INT | Serves |
|-----|--------|
| INT-1 | REQ-22 |
| INT-2 | REQ-22, REQ-23 |
| INT-3 | REQ-22, REQ-23 |
| INT-4 | REQ-22, REQ-23 |
| INT-5 | REQ-22 |
| INT-6 | REQ-16, REQ-17, REQ-18, REQ-19, REQ-20 |
| INT-7 | REQ-22, REQ-23 |
| INT-8 | REQ-16, REQ-17, REQ-18, REQ-19 |
| INT-9 | REQ-17, REQ-18, REQ-24 |
| INT-10 | REQ-22, REQ-24 |
| INT-11 | REQ-23, REQ-24 |
| INT-12 | REQ-16, REQ-18, REQ-24 |
| INT-13 | REQ-21, REQ-24 |
| INT-14 | REQ-20, REQ-23, REQ-24 |

### `batch-container-detail-clock`

| REQ | Served by |
|-----|-----------|
| REQ-25 | INT-1, INT-12 |
| REQ-26 | INT-1, INT-5, INT-6, INT-8 |
| REQ-27 | INT-2, INT-5, INT-6, INT-9, INT-14 |
| REQ-28 | INT-1, INT-2, INT-5, INT-6, INT-8, INT-9, INT-11 |
| REQ-29 | INT-3, INT-6, INT-8, INT-9, INT-13 |
| REQ-30 | INT-5, INT-7, INT-13 |
| REQ-31 | INT-5, INT-7, INT-13 |
| REQ-32 | INT-4, INT-6, INT-8 |
| REQ-33 | INT-1, INT-2, INT-8, INT-9 |
| REQ-34 | INT-1, INT-2, INT-6, INT-15 |
| REQ-35 | INT-5, INT-7, INT-11 |
| REQ-36 | INT-5, INT-7, INT-15 |
| REQ-37 | INT-10 |
| REQ-38 | INT-15 |
| REQ-39 | INT-8, INT-9, INT-10, INT-11, INT-12, INT-13, INT-14, INT-15 |

| INT | Serves |
|-----|--------|
| INT-1 | REQ-25, REQ-26, REQ-28, REQ-33, REQ-34 |
| INT-2 | REQ-27, REQ-28, REQ-33, REQ-34 |
| INT-3 | REQ-29 |
| INT-4 | REQ-32 |
| INT-5 | REQ-26, REQ-27, REQ-28, REQ-30, REQ-31, REQ-35, REQ-36 |
| INT-6 | REQ-26, REQ-27, REQ-28, REQ-29, REQ-32, REQ-34 |
| INT-7 | REQ-30, REQ-31, REQ-35, REQ-36 |
| INT-8 | REQ-26, REQ-28, REQ-29, REQ-32, REQ-33, REQ-39 |
| INT-9 | REQ-27, REQ-28, REQ-29, REQ-33, REQ-39 |
| INT-10 | REQ-37, REQ-39 |
| INT-11 | REQ-28, REQ-35, REQ-39 |
| INT-12 | REQ-25, REQ-39 |
| INT-13 | REQ-29, REQ-30, REQ-31, REQ-39 |
| INT-14 | REQ-27, REQ-39 |
| INT-15 | REQ-34, REQ-36, REQ-38, REQ-39 |

**Two thin spots in the third batch, both deliberate.** REQ-37 — no other view gains a clock — is
served by one intervention, because it is again a statement about an absence: the five hooks it names
are touched by no intervention of this batch, and narrowing the check is the only way to keep them
that way. REQ-38 — the server unchanged — is served by the census alone, exactly as REQ-12 was in the
first batch: nothing under `server/` is edited by any intervention here, and the census is what
proves it.

**And two in the second, for the same reasons.** REQ-17 — the clock stops when the Dashboard is not
on screen — has no scenario of its own: nothing the operator can see distinguishes a stopped clock
from a running one, so it is checked where it is observable at all, in that batch's INT-9, and rides
along in its first scenario. REQ-21 is served by a single check, its INT-13, being the same kind of
statement about an absence — and it is that check the third batch narrows.
