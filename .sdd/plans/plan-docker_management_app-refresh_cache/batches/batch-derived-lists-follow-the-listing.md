---
batch: derived-lists-follow-the-listing
feature: The derived lists follow the container listing they are built on
closed_req: REQ-52, REQ-53, REQ-54, REQ-55, REQ-56, REQ-57
depends: —
---

# Batch — the derived lists follow the container listing they are built on

The requirements are in `../requirements.md` and are cited here by id.

**A volume mounted by four containers is listed as mounted by none, then by one, for 27.9 seconds.**
Measured on the running API on 2026-08-30, no browser involved: a volume was created with four
containers mounting it, and `GET /api/volumes` reported 0, then 1, then — after 27.9 seconds — the 4
the daemon had held from the start. On the screen that is the `MOUNTED BY` column of the Volumes &
networks screen, empty and then wrong, for half a minute.

## What happens, in order

A `container` event marks four kinds due — compose projects, containers, networks, volumes, in
registration order. Their re-reads are **started one after another and not awaited**, so the daemon
calls overlap while the decisions stay strictly ordered.

1. the containers kind starts reading `/containers/json?all=true`;
2. the volumes kind starts reading, and `listVolumes` asks for the held container listing;
3. a listing **is** held, so `read()` answers from it — it joins a read in flight only when nothing has
   ever been held, and `awaitChangeCoverage` returns at once because `markDue` never raises
   `changedAt`;
4. the volume list is built on the **previous** container listing and stored as good;
5. nothing marks it due again. It stays wrong until its own period, 30 seconds.

**On a cold process it does not happen at all**: nothing is held, the derived read joins the read in
flight, and the answer is right. Hence the signature of the end-to-end spec that surfaced it — green on
the first run of a server process, red on the second.

**It is a regression of `container-listing-shared` (`aa4fc5c`).** Before that batch, `readMountedBy`
fetched a container listing of its own on every request, and a per-request listing cannot be a copy
somebody else has replaced. The saving is worth keeping; what is missing is the other half of it.

## The perimeter

| Reader | Derives | Holds a listing of its own | In perimeter |
|---|---|---|---|
| `server/src/volumes/volumes-service.ts` → `readMountedBy` | the `MOUNTED BY` column | yes, the `volumes` kind | **yes** |
| `server/src/networks/networks-service.ts` → `readAttachedContainers` | a network's attached containers | yes, the `networks` kind | **yes** |
| `server/src/system/overview-service.ts` → the counts by state | the dashboard tiles | no — computed on each request | no |
| `server/src/compose/compose-discovery-service.ts` | compose projects | yes | no — it derives from `docker compose`, not from the held listing |

Only a reader that **holds** what it derived can hold something built on a copy already replaced. The
overview reads the held listing and answers in the same request, so it is never older than that
listing. Compose discovery reacts to the same event but shares nothing with it.

## The correction, and the three that were rejected

**Whoever derives is told when the copy they built on has been replaced.** When the containers kind
stores a listing different from the one it held, the kinds derived from it are marked due, and they
recompute within a grouping window. They keep reading the one shared copy: **no extra call to the
daemon for a container listing** (REQ-54), so the saving of `container-listing-shared` stays whole. It
depends neither on the order in which the re-reads start nor on which grouping window falls when
(REQ-55).

The human argued and rejected the three alternatives on 2026-08-30. They are recorded so they are not
proposed again:

- **Make the derived reader await the container read in flight.** Closes only the instant in which
  that read has already started. Postpone the containers re-read by its own 750 ms grouping window and
  there is nothing to await: the defect returns identically.
- **Serialise the fan-out**, awaiting each re-read before starting the next. Works today only because
  the containers kind registers before the networks and volumes kinds — an order nobody declares, which
  falls out of module load order and one moved import would change in silence. It also replaces
  overlapping reads with the sum of their times, and still does not cover the grouping-window case.
- **Send each derived list back to asking the daemon for its own container listing.** Undoes
  `container-listing-shared`: four questions where there is now one.

## What "different" means, and why the whole value is the wrong comparison

**A notification on every stored value would cost more than the defect.** The containers kind reads
every 20 s and the two derived kinds every 30 s, so notifying unconditionally makes each container
period drag a volume-list and a network-list read behind it — the traffic three batches of this plan
were spent removing. REQ-53 is that constraint.

**And a deep comparison of the daemon's own response is not the same thing as "changed".** Every entry
carries `Status`, a humanized uptime — `"Up 5 seconds"`, then `"Up 25 seconds"` — so a whole-value
comparison reports a difference on nearly every read of a host where nothing has happened. It would
behave exactly like notifying unconditionally, while looking like it does not.

So the comparison is over what the derived readers actually read, and the source kind is the one that
declares it: per container, its **id**, its **name**, its **volume mounts** and its **network
attachments**. That declaration is the contract between the container listing and everything derived
from it, which is how this goes wrong later: **a reader that starts deriving from a field the
declaration does not cover is not notified**, and the defect comes back for that field alone. It is
written beside the accessors that hand the listing out, where a new reader is added.

The refresh cache itself compares nothing on its own: it holds values and does not read them
(`refresh-cache.md` — generic, no Docker vocabulary). What it gains is the ability to be told.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/refresh-cache/refresh-cache.ts`, kind registration | A kind may declare the key of the held value it is derived from, and a kind may declare how two of its own values are told apart for that purpose. Resolved by key through the registry, like the event-type map beside it, so registration order decides nothing. | REQ-52, REQ-53, REQ-55 | — |
| INT-2 | modify | `server/src/refresh-cache/refresh-cache.ts`, where a read stores its value | A stored value the declaration says differs from the one held marks the kinds derived from it due, through the same path a daemon event uses. A first value, with nothing held before it, notifies nobody: there is no earlier copy anyone can have derived from. | REQ-52, REQ-53, REQ-55 | INT-1 |
| INT-3 | modify | `server/src/containers/containers-service.ts`, the `containers` kind and the accessors beside it | Declare what counts as a different listing for whoever derives from it: per container, its id, its name, its volume mounts and its network attachments — not the whole response, whose `Status` differs between two reads of an unchanged host. | REQ-52, REQ-53 | INT-1 |
| INT-4 | modify | `server/src/volumes/volumes-service.ts`, the `volumes` kind | Declare it derived from the container listing, since its mounting containers come from there. | REQ-52 | INT-1 |
| INT-5 | modify | `server/src/networks/networks-service.ts`, the `networks` kind | Declare it derived from the container listing, since its attached containers come from there. | REQ-52 | INT-1 |
| INT-6 | modify | `.sdd/modules/refresh-cache/specs/refresh-cache.md` and the Refresh cache row of `.sdd/modules/refresh-cache/index.md` | Carry it into the contract: the derivation declaration, the notification on a changed value only, the first value notifying nobody, and that the cache compares nothing it was not given a comparison for. | REQ-52, REQ-53, REQ-55 | INT-1, INT-2 |
| INT-7 | modify | `.sdd/modules/containers/specs/containers-service.md`, `.sdd/modules/volumes/specs/volumes-service.md`, `.sdd/modules/networks/specs/networks-service.md` | Carry it into the three services: what the container listing declares as a different listing, and that each derived listing is read again when it changes rather than waiting out its period. | REQ-52, REQ-53 | INT-3, INT-4, INT-5 |
| INT-8 | create | server check tree, unit, beside the shared-container-listing checks | From a held state: the container listing is replaced by one where a container has gained a volume mount, and the next volume list names it. Read once, no wait. | REQ-52, REQ-56, REQ-57 | INT-2, INT-4 |
| INT-9 | create | server check tree, unit, in that same file | The same for the network list: a container attached only in the replacement listing is in the next network list. Read once, no wait. | REQ-52, REQ-56, REQ-57 | INT-2, INT-5 |
| INT-10 | create | server check tree, unit, in that same file | A container listing read again and unchanged notifies nobody: over several container periods on an unchanged host, the volume list and the network list are read on their own periods and no more. | REQ-53 | INT-2, INT-3 |
| INT-11 | create | server check tree, unit, in that same file | Count what reaches the daemon across the whole sequence: the derived re-reads add no `/containers/json` read of any form. | REQ-54 | INT-2, INT-4, INT-5 |
| INT-12 | create | server check tree, unit, on the refresh cache itself | On two kinds of its own: a derived kind read again *before* the source stores anything is read again when it does, and a source read postponed by its grouping window notifies just the same. Neither order is arranged by the cache. | REQ-55 | INT-1, INT-2 |
| INT-13 | create | server check tree, API pass against the real daemon, volumes area | The measurement of the report, from a warm server: a volume and the containers mounting it, and `GET /api/volumes` names every one of them on the request that follows, not a period later. | REQ-52, REQ-56 | INT-4 |
| INT-14 | modify | `client/e2e/badge-list-pills.spec.ts` | Left exactly as written — no wait, no retry, no poll added. It is run twice in a row against one server process and is green both times. | REQ-57 | INT-4 |
| INT-15 | modify | `server/src/containers/containers-service.ts`, the comparison declared by INT-3 | The three sorts inside that comparison carry the ordering check's own exception marker, naming what they are: a canonicalisation of a digest, never a list anybody reads. Found by this batch's own checks. | REQ-53 | INT-3 |

## How the checks are made able to fail

**Every check here starts from a held listing.** That is REQ-56 and it is the whole difficulty of this
batch: on a server that holds nothing, the derived read joins the read in flight and the product
answers correctly *without the correction*. A check written against a freshly started process passes
before and after, certifies nothing, and looks like proof. So each case first fills the container
listing — reading it, or the kind's own `read()` — and only then replaces it.

**Replacing it must be a real replacement.** The state the defect needs is: a listing held, a different
one being read, and a derived read arriving in between. `server/test/unit/shared-container-listing.test.ts`
already mocks the daemon and counts every call it receives, which is the observation these checks need
too; two hazards it documents apply here unchanged.

- **Count the exact path.** `engine.callsTo()` matches on `call.pathname` with the query stripped, so
  it cannot tell `/containers/json?all=true` from the sampler's `/containers/json`. Filter on
  `call.path`, as that file already does.
- **A held value is a state a case must set**, and setting it starts a refresher on its own period,
  which issues reads of its own while the fake clock advances. INT-10 and INT-11 count over windows, so
  the periodic reads must be accounted for rather than discovered.

**INT-12 is the one that fails on the rejected alternatives.** It drives the cache directly, with two
kinds of its own, and arranges the two orders the fan-out does not guarantee. An implementation that
awaited the read in flight, or that serialised the fan-out, satisfies INT-8 and INT-9 — the case they
reproduce is the one those repairs cover — and fails here.

**INT-14 is what the report asked for and it is not negotiable.** The spec that surfaced the defect
(`client/e2e/badge-list-pills.spec.ts` — one volume, four containers with long names, geometry measured
on the `MOUNTED BY` column) fails on the second consecutive run and passes on the first and third. It
goes green **as it is written**. A `waitFor` on the fourth pill would turn a wrong list into a slow one
and hide exactly what this batch repairs.

## The appended intervention, and why the marker rather than the shared rule

`server/scripts/check-list-order-conformance.mjs` fails closed on every `.sort()` written under
`server/src/` outside the ordering area, "because judging what a comparator sorts by needs the types
the guard does not have". INT-3 wrote three of them and named none, so the check reports three
violations — and, being chained ahead of the unit pass inside `npm run test -w server`, it stops the
whole suite before a single test runs. It is a regression of this batch and it is repaired here.

**The shared rule is the wrong tool for this, and adopting it would be the real violation.**
`plan-docker_management_app-list_ordering/REQ-1` exists so that **names an operator reads** are
compared by one rule in one place. Nothing here is read by anybody: the three sorts canonicalise a
digest so that two listings the daemon returned in different orders compare equal — that equality is
the whole of REQ-53, and the check "a shuffled listing does not count as different" is what asserts
it. A human-facing collation applied to a digest would make the digest depend on the locale and on a
rule that may legitimately change for presentation reasons, which is precisely how a comparison stops
being an identity.

So each of the three carries the marker the check itself prescribes, on the spot, saying what it
canonicalises. The exception is per comparison, not per file: a name comparison written in this
service later is a violation exactly as before.

## Human acceptance

**REQ-55, REQ-56 and REQ-57 have no scenario of their own, and that is deliberate.** REQ-55 is about
orders the operator cannot arrange; REQ-56 and REQ-57 are constraints on the checks, not on the
product. INT-12, INT-13 and INT-14 are what prove them.

### Scenario: The MOUNTED BY column names every container mounting the volume, at once

- REQ → REQ-52
- Given → the server has been running for a while and the operator is on the Volumes & networks screen
- When → they create a volume and start four containers mounting it
- Then → the volume's `MOUNTED BY` column lists all four within a moment, instead of showing nothing, then one name, for half a minute

### Scenario: A container attached to a network shows on the network at once

- REQ → REQ-52
- Given → the same running server, with the Networks panel open
- When → the operator attaches a container to a network
- Then → the network lists that container straight away, rather than at the end of its own refresh period

### Scenario: A host where nothing happens costs no extra reading

- REQ → REQ-53, REQ-54
- Given → the Volumes & networks screen is open on a host where no container starts, stops or changes, with `VEXEL_DOCKER_LOG` left at its default
- When → the operator watches the server's Docker call log for a few minutes
- Then → the volume and network listings are read on their own rhythm and no more, and no container listing is read for them beyond the one the server already keeps
