---
batch: detail-derivation-follows-the-listing
feature: The detail's derived values follow the container listing too
closed_req: REQ-58, REQ-59, REQ-60, REQ-61, REQ-62, REQ-63
depends: —
---

# Batch — the detail's derived values follow the container listing too

The requirements are in `../requirements.md` and are cited here by id.

**The detail panel of a volume keeps naming, under `Mounted by`, a container that no longer exists, and
does not stop while the panel stays open.** The check that finds it is
`client/e2e/detail-reread-scoped.spec.ts:170` — "keeps a volume detail following the containers that
mount it", which closes REQ-8. It fails 2 runs out of 2 with `--repeat-each=2` on that file alone, and
failed in the full pass. It is not an intermittent.

## What the traces measured

Read from the files inside `trace.zip` of the full run:

- the panel opens and reads `GET /api/volumes/<name>/inspect`;
- the container mounting the volume is removed with `docker rm -fv`, which makes the daemon emit
  `kill`, `die` and `destroy` in sequence;
- the client re-reads the inspect **four times in 100 ms**, one per event — the event chain works and
  the client reacts;
- **the inspect endpoint is then not called again for 20 seconds**, while `/api/volumes` and
  `/api/containers` keep being asked every 3 seconds.

The panel holds the wrong answer until the operator touches something.

## What happens, in order

1. the daemon's `destroy` event reaches the server; the containers kind is marked due and its re-read
   is scheduled — at once, or at the end of its 750 ms grouping window;
2. the same event reaches the browser, which asks for the inspect again a few milliseconds later;
3. `getVolumeInspect` (`server/src/volumes/volumes-service.ts:190`) calls `readMountedBy()`, which calls
   `readHeldContainerList()` — `containerListCache.read()`;
4. a listing **is** held, so `read()` answers from it, and `awaitChangeCoverage()` returns at once:
   only `markChanged()` raises `changedAt`, and it is reserved for the operations the application
   itself performs (REQ-13). **`markDue()` raises nothing.**
5. the listing is replaced correctly a moment later — and nobody asks the detail again, because the
   detail is read on events and on nothing else.

**It is the same family as `derived-lists-follow-the-listing`, one step further in.** That batch
repaired the readers that **hold** what they derived, by telling them the listing had been replaced.
This is the reader that derives **per request and is never asked again**, so there is nobody to tell:
what it needs is not a notice afterwards but the right listing at the time.

**The human's decision "detail reads stay direct" (REQ-22) is not what left it out.** The volume
detail's `mountedBy` is not a direct read at all: Docker's `volume inspect` does not say who mounts a
volume, so the application derives it — from the held listing, since `container-listing-shared`.

## The perimeter, verified reader by reader

| Reader | Derives | Asked again on its own | In perimeter |
|---|---|---|---|
| `volumes-service.ts:73` `readMountedBy` under **`getVolumeInspect`** | the `Mounted by` of the open panel | no — read on events only | **yes** |
| the same function under `listVolumes` | the `MOUNTED BY` column | yes, and it follows the listing since REQ-52 | no |
| `networks-service.ts:63` `readAttachedContainers` under `listNetworks` | a network's attached containers | yes, and it follows the listing since REQ-52 | no |
| `networks-service.ts:125` `getNetworkInspect` | a network's attached containers | — | **no, and it cannot have the defect**: it does not read the held listing at all. `GET /networks/{id}` returns its own `Containers` map, which the daemon fills and which the service uses instead (`networks-service.md`: "authoritative, unlike the listing"). Verified in the source and in the spec before writing this row |
| `system/overview-service.ts:64` | the dashboard's counts by state | yes, every 3 s | **no, and this is a decision**: the counts are computed on each request, so the request after the listing is replaced is already right. The wrong figure lives for one client interval and no aggregate count reads as a statement about an object that has ceased to exist. Making it wait would put the wait on the screen where container events are most frequent, for a value that corrects itself |

Docker's `volume inspect` carries no map of who mounts the volume. That is the whole reason the volume
detail is the only case, and why the network detail — which has one — is not.

## The correction, and the three that were refused

**The reader that cannot be asked again is answered with a listing that covers what the server already
knows.** A kind records when it was last told it may have changed — a daemon event, or the source it
derives from being replaced — and a caller may ask to be answered from a value read after the last such
notice. It waits for the read that notice **already caused**: the one in flight, or the one the grouping
window deferred. It starts none of its own.

Three properties make it affordable, and each is a requirement:

- **it asks the daemon for nothing** (REQ-59) — the wait attaches to a read that was going to happen;
- **only the caller that asks for it waits** (REQ-60) — no list endpoint does, so REQ-9 and REQ-10 are
  where they were;
- **it does not depend on which of the request and the read arrives first** (REQ-61).

The three alternatives, and why each was refused:

- **Send `inspectVolume` back to the daemon for a container listing of its own.** Local and simple, and
  it is the road the human already refused on 2026-08-30 for the lists, where it meant four questions
  instead of one. The refusal **does** extend here, and the reason is specific to a detail rather than
  general: the volume detail re-reads on **every** container event of any action
  (`client/src/data/use-volume-inspect.ts`, recorded as debt in
  `detail-views-reread-on-unrelated-events`), so the rate is set by the daemon and not by us. A
  `compose up`, or a running health check, would each buy a full `/containers/json?all=true`. "One open
  panel, one request" is exactly what this reader is not.
- **Make the wait for coverage unconditional**, by raising the change instant on every event. Then every
  request on every list waits for the listing to catch up. That is the cost this project has refused
  from the start, and it breaks REQ-9 and REQ-10 across the product to repair one panel.
- **Tell the client across the server boundary**, the shape of the REQ-52 decision carried to the
  browser. It adds a new kind of notice to the event stream and a new subscription to a detail hook, to
  end up asking the same endpoint again — the same wait, one HTTP round trip later, with more moving
  parts. The business spec puts "pushing values to the browser instead of the browser asking" out of
  scope, and the client's detail hooks are out of scope too.

**A second read after a delay, on the client, is forbidden and is not among them.** It is a wait put
there to make things pass, and it would turn a wrong answer into a slow one.

## What it costs, counted

**Calls to the daemon: none added, in any case.** The wait attaches to a read the notice had already
scheduled; when coverage cannot be reached within its bound, the caller is answered from the value held
rather than by a read of its own. The volume detail keeps costing its one `GET /volumes/{name}`, as
today. The savings of `container-listing-shared` and `derived-lists-follow-the-listing` are untouched,
and REQ-59 is counted rather than argued (INT-10).

**Latency: one grouping window, on one endpoint, and only when a notice is outstanding.** A volume
inspect arriving on an event it does not yet cover is answered after the read that event caused — at
most about 750 ms plus the read, and at most one further window if the read under way had started
before the event. It never waits out the container listing's 20 s period. When no notice is outstanding,
which is every request on a quiet host, nothing waits at all.

**The instant is taken once, when the call arrives** (REQ-61). Events arriving during the wait do not
extend it, or a busy host would starve the request it is meant to answer.

**The known millisecond window is inherited, not widened.** A read that started in the same millisecond
as the notice counts as covering it, which is
`.sdd/tech-debt/entries/change-coverage-millisecond-window.md`. Here the read that covers is the one the
notice caused, so the case is narrower than the entry's, and the entry is neither closed nor extended.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/refresh-cache/refresh-cache.ts`, a kind's bookkeeping | Record when the kind was last told it may have changed — a daemon event, or the source it derives from being replaced — beside the instant already recorded for the application's own operations. Recorded whether or not a read follows. | REQ-58, REQ-61 | — |
| INT-2 | modify | `server/src/refresh-cache/refresh-cache.ts`, `read()` | A caller may ask to be answered from a value read after the last notice the kind held when the call arrived. It waits for the read that notice already caused — in flight, or deferred by the grouping window — and starts none of its own. A caller that does not ask is answered exactly as today. | REQ-58, REQ-59, REQ-60, REQ-61 | INT-1 |
| INT-3 | modify | `server/src/refresh-cache/refresh-cache.ts`, that same wait | Bound it: the instant is taken once, at the call, so notices arriving during the wait never extend it; a read that fails, or coverage not reached within the bound, hands back the value held rather than an error or an answer that never comes. | REQ-60, REQ-61 | INT-2 |
| INT-4 | modify | `server/src/containers/containers-service.ts`, the accessors that hand the held listing out | The reading accessor gains the way to ask for that coverage. Its comment is written against the two beside it: which caller asks for it, and why the list readers and the sampler do not. | REQ-58, REQ-60 | INT-2 |
| INT-5 | modify | `server/src/volumes/volumes-service.ts`, `getVolumeInspect` and `readMountedBy` | The detail's mounting containers are read with coverage asked for; the listing's are not. The one function serving both takes the choice from its caller. | REQ-58, REQ-60 | INT-4 |
| INT-6 | modify | `.sdd/modules/refresh-cache/specs/refresh-cache.md` and the Refresh cache row of `.sdd/modules/refresh-cache/index.md` | Carry it into the contract: the recorded notice instant, the coverage a caller may ask for, that it starts no read, its bound, and that no other caller's answer moves. | REQ-58, REQ-60, REQ-61 | INT-2, INT-3 |
| INT-7 | modify | `.sdd/modules/containers/specs/containers-service.md` and `.sdd/modules/volumes/specs/volumes-service.md` | Carry it into the two services: the third way of reading the held listing and who uses it, and the volume detail's own `mountedBy` rule — the spec states that guarantee for the listing alone today. | REQ-58, REQ-59 | INT-4, INT-5 |
| INT-8 | create | server check tree, unit, a file of its own beside `derived-lists-follow-listing.test.ts` | From a held listing: a `container` event, then the volume inspect on that same event, and the container that has gone is named by nobody. One request, no wait. | REQ-58, REQ-62, REQ-63 | INT-5 |
| INT-9 | create | server check tree, unit, in that same file | The deferred case: the listing's re-read is still inside its grouping window when the inspect arrives, and the answer comes from a read started after the event all the same. | REQ-61, REQ-62 | INT-5 |
| INT-10 | create | server check tree, unit, in that same file | Count what reaches the daemon over the whole sequence: the covered inspect adds no `/containers/json` in any form, and costs the one `GET /volumes/{name}` it costs today. | REQ-59 | INT-5 |
| INT-11 | create | server check tree, unit, in that same file | The guardrail: with the same notice outstanding, the volume list, the network list and the dashboard overview are answered from the held value without waiting for the read it caused. | REQ-60 | INT-5 |
| INT-12 | create | server check tree, unit, on the refresh cache itself | On kinds of its own: coverage is reached in both orders — a read already in flight, and one the window deferred; notices arriving during the wait do not extend it; a failing read hands back the value held. | REQ-60, REQ-61 | INT-2, INT-3 |
| INT-13 | create | server check tree, API pass against the real daemon, volumes area | The report's own case from a warm server: a volume, a container mounting it, the container removed, the event, and one `GET /api/volumes/<name>/inspect` issued at once — it names the container no more. | REQ-58, REQ-62 | INT-5 |
| INT-14 | modify | `client/e2e/detail-reread-scoped.spec.ts` | Left exactly as written — no wait added, no retry, no poll, no budget lengthened, no assertion softened. Run with `--repeat-each=2` on that file and green both times. | REQ-63 | INT-5 |

## How the checks are made able to fail

**Every check here starts from a held container listing.** That is REQ-62, and it is the whole
difficulty, exactly as it was for REQ-56. On a server holding nothing, `read()` joins the read in flight
and the product answers correctly **without the correction**: a check written against a freshly started
process passes before and after, certifies nothing and looks like proof. So each case first fills the
listing — reading it, or the kind's own `read()` — and only then changes the world.

**The request must arrive on the event, not after it.** The defect is the request being served from the
copy the event is replacing, so a check that emits the event, waits, and then asks is testing nothing:
by then the listing has been replaced and the old product answers correctly too. INT-8 and INT-13 issue
the inspect **immediately** after the event, once, and assert once.

`server/test/unit/derived-lists-follow-listing.test.ts` and
`server/test/api/derived-lists-follow-listing.test.ts` are the model for both trees — the engine mock
that counts every call, the fake clock advanced in slices, and the warm-server preamble that reads the
sizes before the fixtures exist so `/system/df` does not land in the middle of a case and correct it by
accident. Two hazards those files document apply here unchanged:

- **count the exact path.** `engine.callsTo()` strips the query, so it cannot tell
  `/containers/json?all=true` from the sampler's `/containers/json`. Filter on `call.path`.
- **a held value is a state a case must set**, and setting it starts a refresher whose own reads must be
  accounted for rather than discovered — INT-10 and INT-11 count over windows.

**INT-9 is the one that fails on the half-repair.** Waiting for whatever read happens to be in flight
satisfies INT-8 whenever the event started a read at once, and does nothing when the grouping window has
deferred it — which is the ordinary case, since the three events of `docker rm -fv` arrive inside one
window. INT-12 states the same claim on the cache itself, with kinds of its own, so neither order is
left to the fan-out to arrange.

**INT-11 is what catches the correction being paid for by everybody else.** An implementation that made
the wait unconditional would pass INT-8, INT-9 and INT-13 and would put a grouping window in front of
every list in the product.

**INT-14 is what the report asked for and it is not negotiable.**
`client/e2e/detail-reread-scoped.spec.ts:170` goes green **as it is written**, by the product's merit
([[a-check-is-never-weakened-to-pass]]). Its assertion already carries a 20 s budget, which is generous
for a correction bounded by one grouping window; lengthening it, or adding a poll in front of it, would
turn a permanently wrong panel into a slow one and hide precisely what this batch repairs.

## Human acceptance

**REQ-59 to REQ-63 have no scenario of their own, and that is deliberate.** REQ-59 and REQ-60 are claims
about what the daemon is asked and about what nobody else pays, both invisible from the interface except
through the call log — the third scenario below is as close as an operator gets. REQ-61 is about orders
the operator cannot arrange, and REQ-62 and REQ-63 are constraints on the checks. INT-9 to INT-14 are
what prove them.

### Scenario: The open volume panel stops naming a container that no longer exists

- REQ → REQ-58
- Given → the server has been running for a while, and the operator has a volume's detail panel open, showing the container that mounts it under `Mounted by`
- When → that container is removed from outside the application
- Then → the panel drops the name within a moment and stays open where it was, instead of naming a container that no longer exists for as long as the panel is left open

### Scenario: A container that starts mounting the volume appears in the open panel

- REQ → REQ-58
- Given → the same running server, with the same detail panel open on a volume nothing mounts
- When → a container mounting that volume is started from outside the application
- Then → the panel names it straight away, without the operator closing and reopening the panel

### Scenario: The screens around it cost and wait exactly what they did

- REQ → REQ-59, REQ-60
- Given → the Volumes & networks screen and the dashboard open on a busy host, with `VEXEL_DOCKER_LOG` left at its default
- When → the operator watches the server's Docker call log while containers start and stop
- Then → no container listing is read beyond the one the server already keeps, and the lists and the dashboard answer as promptly as they do today
