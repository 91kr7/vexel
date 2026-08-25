---
batch: 3
feature: F2 — The per-container sampling runs at 10 seconds and only while somebody is consuming it
closed_req: [REQ-39, REQ-40, REQ-41, REQ-42, REQ-43, REQ-44, REQ-45, REQ-46, REQ-47, REQ-48, REQ-49, REQ-50, REQ-51, REQ-52, REQ-54, REQ-55, REQ-56, REQ-57, REQ-58]
depends: [2]
---

# Batch 3 — stats-sampling-gate

The requirement texts live in [`requirements.md`](../requirements.md); they are cited here by id
only.

**This is server-side work, and that is the whole point.** Today `startStatsSampler()` is called at
process boot (`server/src/index.ts`) and loops for ever: every 3 seconds it lists the running
containers and asks the daemon for **one stats frame per running container** — on every screen, and
with no browser connected at all. **A gate built in the client would remove not one request.** Every
requirement below is stated as traffic reaching the daemon, and it is verified by counting that
traffic, never by watching the screen.

**The mechanism is liveness, and it is a requirement rather than a detail.** A consumer proves it
exists by holding a connection the server observes. It never announces that it is leaving, because a
stop signal is only as good as its worst case — a crash, a force-quit, a sleeping laptop, a pulled
network, a tab the browser discarded — and in every one of those the signal is absent while the
sampler would run for ever. Liveness inverts it: sampling exists only while something keeps proving a
consumer does, and it stops **on its own** when the proof stops. Nothing is signalled at unload:
**no `beforeunload`, no `pagehide`, no `unload`, no beacon** (REQ-49).

**Two shared consumers, not one screen.** The containers list and the dashboard read the same
sampled figures. Gating on the containers screen by name would silently break the dashboard's CPU
reading, on a screen nobody asked to change, and the symptom would be a dash rather than an error.

**Untouched, deliberately, and each gets a check saying so.** The container **list poll** keeps its
delivered 3-second cadence (`client/src/data/use-containers.ts`) — one request whose cost does not
grow with the number of containers, and what makes a state change prompt. The detail panel's Stats
tab keeps its own per-container stream (`/api/containers/:id/stats/stream`,
`container-stats-service.ts`, `use-container-stats.ts`) — a different consumer with a different
lifecycle, already demand-driven by construction.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | server, containers area (beside `server/src/containers/containers-service.ts`) | The **demand registry**: a count of live subscriptions to the sampled figures. Zero → the sampler is stopped and the daemon is asked for nothing. Zero-to-one → the sampler starts **and takes a sample immediately**, so a consumer arriving is not shown dashes for a full interval. One-to-zero → the sampler stops. It is a **count**, not a flag, so a second tab is ordinary and the last one leaving is the condition that stops the sampling. Passes never overlap or queue: a pass slower than the interval does not start a second beside it. | REQ-40, REQ-41, REQ-44, REQ-46, REQ-47, REQ-51, REQ-54, REQ-58 | — |
| INT-2 | modify | `server/src/containers/containers-service.ts` | `STATS_SAMPLE_INTERVAL_MS` becomes **10000**. The endless `sampleLoop` becomes startable and stoppable and is driven by INT-1's registry instead of by process boot. Each cached sample records **when it was taken**, and `toSummary` withholds `cpuPercent`, the memory pair and the network pair when that instant is older than **30 seconds** (3 × the interval) — so a figure that is too old to stand behind reaches **no** consumer as if it were current, by the same route a stopped container's absent sample already takes. The bound is one named constant, stated once. Nothing about the list poll or the per-container stats stream is touched. | REQ-39, REQ-40, REQ-52, REQ-55, REQ-58 | INT-1 |
| INT-3 | create | server, containers area — a new route in `server/src/containers/containers-routes.ts` | The **subscription endpoint**: a connection held open for as long as a consumer is being shown the figures. Registering a consumer on open and releasing it on close — including an abrupt close the client never announced — is the whole contract. The server **writes to each held connection every 10 seconds**, so a socket whose other end has vanished fails and is released rather than lingering as a phantom consumer; discovery therefore happens within about one sampling interval. Modelled on `server/src/events/events-routes.ts`, which already holds a connection and releases what belonged to it on disconnect — a second instance of a proven pattern, not new infrastructure. | REQ-46, REQ-47, REQ-50, REQ-54 | INT-1 |
| INT-4 | modify | `server/src/index.ts` | Stop starting the sampler at boot. A server running with nobody connected asks the daemon for nothing at all — the worst of today's behaviour and the case a developer never looks at. | REQ-41, REQ-44 | INT-1, INT-2 |
| INT-5 | create | client, containers data area (`client/src/data/`) | The **subscription hook**: holds the connection while it is mounted **and** the tab is visible; releases it on unmount and on the tab being hidden; re-opens when the tab returns. It signals nothing at unload — no `beforeunload`, no `pagehide`, no `unload`, no beacon — and the correct outcome never depends on one firing: `visibilitychange` is an optimisation on top of a mechanism that is already correct without it, since a page that dies simply stops answering the server's write. | REQ-42, REQ-43, REQ-45, REQ-48, REQ-49, REQ-51 | INT-3 |
| INT-6 | modify | `client/src/containers/ContainersScreen.tsx`, `client/src/dashboard/DashboardScreen.tsx` | Each of the two consuming screens calls INT-5's hook. **It is not hoisted into `client/src/shell/Shell.tsx`**: the Shell calls `useContainers()` unconditionally, so a subscription taken there would mean "a browser is open", which is the gate the spec rules out. The two screens are rendered conditionally on the active screen id, so a hook inside them mounts and unmounts exactly on a section change — the gate's first closing case, carried by the mechanism rather than by navigation plumbing. | REQ-42, REQ-45, REQ-48 | INT-5 |
| INT-7 | modify | `client/src/dashboard/DashboardScreen.tsx` | The dashboard's CPU reading states an **absent** sample rather than rendering a zero when the figures are withheld. Its layout, its list and its content are otherwise untouched — it appears in this batch only as a consumer, and the failure to guard against here is the one that shows as a dash on a screen nobody was reviewing. | REQ-45, REQ-52 | INT-2, INT-6 |
| INT-8 | modify | `.sdd/modules/containers/index.md`, `specs/containers-service.md`, `specs/containers-endpoints.md`, `.sdd/modules/dashboard/specs/dashboard-screen.md`, `.sdd/modules/server-app/` entrypoint spec | Record the new cadence, the registry, the endpoint, the staleness bound, and the fact that the entrypoint no longer starts a sampler. *(Enabling: closes no behaviour of its own.)* | — | INT-1, INT-2, INT-3, INT-4 |
| INT-9 | create | server test, containers area | The **measured** check, and the one that decides whether this batch happened: the count of stats requests reaching the daemon over a fixed window with a consumer registered, with none registered (**zero**), and with the interval elapsed several times over; the count returning to zero by **every route out**, including a connection destroyed without a close; two subscribers with one leaving and the sampling continuing; the count driven up and down repeatedly with the daemon confirmed quiet **each time**, since an upward drift is invisible from the interface and reinstates the original defect; that passes do not overlap; and that a subscriber arriving is served a sample promptly rather than after a full interval. Own labelled fixtures, cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon, its own data directory, no reach to Docker Hub, passing on its own. | REQ-39, REQ-41, REQ-44, REQ-47, REQ-50, REQ-54, REQ-57, REQ-58 | INT-1, INT-2, INT-3, INT-4 |
| INT-10 | create | client e2e, containers area | The gate driven **through the interface**, with a real pointer: on Containers the figures are current; move to a section that shows none and the daemon goes quiet; hide the tab and it goes quiet; return and a figure appears **promptly**, not after a full interval; the **dashboard** keeps its CPU reading across the same cycle; two tabs behave correctly with one closing while the other reads; and repeated section changes, tab switches and reloads leave nothing running and nothing wedged. Also asserts the list poll is unchanged — a container started outside the product still appears within its delivered window. Project test discipline throughout; passes on its own. | REQ-42, REQ-43, REQ-45, REQ-47, REQ-48, REQ-51, REQ-54, REQ-55 | INT-6, INT-7 |
| INT-11 | modify | `client/e2e/container-stats-processes.spec.ts` | Assert that the detail panel's own per-container stream is untouched by all of the above: it opens with the panel, streams at its own rate with its five readings, closes with the panel, and neither its cadence nor its lifecycle follows the sampler's gate. "We did not touch it" is not an observation anyone can make in six months. | REQ-56 | INT-2 |
| INT-12 | create | client test tree (unit) | A guard that no unload-time signal is introduced: `beforeunload`, `pagehide`, `unload` and `sendBeacon` appear nowhere under `client/src/`. The prohibition exists because the reintroduction will be made in good faith, as a tidy improvement — it is the kind of rule that survives only if something fails when it is broken. | REQ-49 | INT-5 |

## Watch for

- **The gate built in the wrong layer.** The most probable way this batch is answered wrongly: a
  client-side gate looks right on review, passes a test that watches the cards, and leaves every
  request exactly where it is. INT-9 counts requests at the daemon precisely because no observation
  of the screen can tell the two apart.
- **The count that drifts upward.** One route out that adds without subtracting — a duplicated
  subscription on remount, a connection closed twice or not at all — and after a day the count is
  never zero, the daemon is sampled for ever, and the interface looks perfect.
- **The case that will be dropped is "no client connected".** It is the state the product spends most
  of its life in and the one where the calls buy literally nothing, and it is the one nobody looks at.
  INT-4 is one line; INT-9 is what proves it.
- **A half-open connection.** Without INT-3's periodic write, a pulled network leaves a socket that
  looks alive indefinitely, and no amount of correct close-handling catches it because nothing ever
  closes.
- **Ten seconds reading as frozen.** The prompt sample on re-entry (INT-1) and the honest *no sample*
  state are the whole defence; skip either and the cadence will be blamed for a defect that is not in
  it.

## Out of this batch

- Anything about how the card looks or is arranged — batch 2's, and finished.
- The list poll's cadence, and the detail panel's per-container stats stream.
- Any explicit start/stop signalling by the client, and any unload-time signal — ruled out in the
  requirements rather than merely left undone.
- What the existing daemon event stream carries for its own purposes, and the lifecycle of anything
  else riding on it. It was considered as the carrier for this subscription and rejected with reasons
  recorded in `batches.md`; it is not modified.
- The dashboard's layout, list presentation or content, beyond the absent-sample reading of INT-7.
- Any operator setting for the interval, any per-metric history, and any sample-age display.
