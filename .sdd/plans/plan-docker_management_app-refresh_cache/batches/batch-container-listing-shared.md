---
batch: container-listing-shared
feature: One container listing serves every consumer
closed_req: REQ-37, REQ-38, REQ-39, REQ-40, REQ-41, REQ-42, REQ-43
depends: —
---

# Batch — one container listing serves every consumer

The requirements are in `../requirements.md` and are cited here by id.

**Four callers fetch the same listing, and the cache cannot serve three of them.** The container
listing, the volume list, the network list and the dashboard overview each issue
`/containers/json?all=true` for themselves: `containers-service.ts:185` (the cache's own read),
`volumes-service.ts:75`, `networks-service.ts:65`, and `overview-service.ts:63` through
`listContainers()` — the raw read, not the cache. Seven a minute while all three lists are being
asked for, four of them derivative, plus the overview's on every daemon event that moves one of its
numbers.

The reason is a design decision, not a missed call. `containerListCache`
(`containers-service.ts:200`) holds `ContainerSummary[]`, and that projection carries **no `Mounts`
and no `NetworkSettings`** — precisely the two fields `readMountedBy` and `readAttachedContainers`
exist to read. The held value is not a smaller copy of the answer; it is a different answer, shaped
for one consumer. Nor is there a route around it on the daemon's side: `GET /networks` leaves its
`Containers` map empty in the list path, and `GET /volumes` reports no mount information at all.

## The move

**The cache holds the daemon's own response; the projection moves to the layer above it** (REQ-39).

- `containerListCache` holds `RawContainer[]`, filtered of the internal extraction containers and of
  nothing else. That filter is not a projection but an exclusion the whole application shares
  (REQ-41), and today it lives inside `listContainers()`, which is why volumes and networks do not
  apply it: a volume mounted only by an intermediate extraction container is listed as mounted by a
  container the operator can see nowhere in the interface.
- `toSummary` and the ordering run in `readContainerList()` (`:212`), the function that answers the
  endpoint. **`ContainerSummary` and the body the client receives do not change by one byte.** This
  is a move inside the server.
- `readMountedBy`, `readAttachedContainers` and the overview derive from the held value (REQ-37).

**Every one of them reads through the cache's `read()`, never `peek()`** (REQ-38). `read()` carries
REQ-13's change coverage — a caller is served a listing that covers an operation the application has
just performed — and it renews demand. `peek()` is cheaper, passes every counting check, and would
let a volume list read straight after a container was removed still name that container.

**The double merge collapses to one** (REQ-40). Today `toSummary` injects the current sample when the
cache fills, and `withCurrentSample` (`:216`) overwrites it at read time because the held projection
carries frozen figures. With the native response held, `toSummary` runs at read time and the second
merge answers a question that no longer exists.

**One behaviour does change** (REQ-42). Volumes, networks and the overview become consumers of the
containers kind, so they register demand on it: opening the volumes screen keeps the container
refresher running even when nobody is on the containers screen. That is what the demand gate is for,
and it is still a change.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/containers/containers-service.ts` | The `containers` refresh kind holds the daemon's own listing, filtered of the internal extraction containers and of nothing else. Its read no longer projects and no longer orders. | REQ-37, REQ-39, REQ-41 | — |
| INT-2 | modify | `server/src/containers/containers-service.ts` | `readContainerList()` projects the held listing into `ContainerSummary`, orders it and merges the sampler's current figures — once. The second merge that overwrote frozen figures goes. | REQ-39, REQ-40 | INT-1 |
| INT-3 | modify | `server/src/containers/containers-service.ts` | Offer the held listing to the other services: one exported read that returns it through the cache's `read()`, never `peek()`. The direct summary read used after a recreate stays a direct daemon call. | REQ-37, REQ-38, REQ-42 | INT-1 |
| INT-4 | modify | `server/src/volumes/volumes-service.ts` | `readMountedBy` derives the mounting containers from the held listing instead of calling the daemon. Both callers use it: the volume listing and a volume's inspect. | REQ-37, REQ-38, REQ-41, REQ-42 | INT-3 |
| INT-5 | modify | `server/src/networks/networks-service.ts` | `readAttachedContainers` derives the attached containers from the held listing instead of calling the daemon. The network inspect keeps reading its own `Containers` map. | REQ-37, REQ-38, REQ-41, REQ-42 | INT-3 |
| INT-6 | modify | `server/src/system/overview-service.ts` | The container counts come from the held listing instead of `listContainers()`. How the states are counted does not change. | REQ-37, REQ-38, REQ-41, REQ-42 | INT-3 |
| INT-7 | modify | `.sdd/modules/containers/specs/containers-service.md`, `.sdd/modules/volumes/specs/volumes-service.md`, `.sdd/modules/networks/specs/networks-service.md`, `.sdd/modules/system/specs/overview-service.md`, and the component row in each of the four modules' `index.md` | Carry it into the specs: what the kind holds, where the projection and the ordering happen, the one merge of the sampled figures, the shared exclusion, the three services deriving from the held listing through `read()`, and the demand they register on it. | REQ-37, REQ-38, REQ-39, REQ-40, REQ-41, REQ-42 | INT-1, INT-2, INT-3, INT-4, INT-5, INT-6 |
| INT-8 | create | server check tree, unit | Against a daemon stub that counts what it receives: refreshing the container, volume and network listings together issues **one** `/containers/json?all=true` in total, and the overview issues none of its own. | REQ-37 | INT-4, INT-5, INT-6 |
| INT-9 | create | server check tree, unit | An operation that marks the container listing changed is covered by what the derived readers are served next: the volume list, the network list and the overview describe the containers as they are after it. A reader using `peek()` fails this. | REQ-38 | INT-4, INT-5, INT-6 |
| INT-10 | create | server check tree, unit | The container endpoint's body is what it is today — same fields, same values, same order — and the sampled figures are merged once: a sample taken after the listing was held still reaches the caller. | REQ-39, REQ-40 | INT-2 |
| INT-11 | create | server check tree, api | Against the real daemon: a container carrying the internal label appears in no volume's mounting containers, in no network's attached containers and in no dashboard figure. | REQ-41 | INT-4, INT-5, INT-6 |
| INT-12 | create | server check tree, unit | Asking for the volume list alone keeps the container listing refreshed; once nothing is asked for, the container listing is refreshed no more. | REQ-42 | INT-4 |
| INT-13 | create | server check tree, api | The guardrail, against the real daemon and on the check's own fixtures: the container listing, the volume list with its mounting containers, the network list with its attached containers and the dashboard counts answer the same values in the same order as before this batch. | REQ-43 | INT-2, INT-4, INT-5, INT-6 |
| INT-14 | modify | `.sdd/tech-debt/entries/container-listing-refetched-by-every-consumer.md`, `.sdd/tech-debt/index.md` | Remove the debt entry and its index row: the register holds what is still open. What closed it is this batch. | REQ-37 | INT-4, INT-5, INT-6 |

## Human acceptance

### Scenario: The daemon is asked for the container listing once, not four times

- REQ → REQ-37
- Given → the application is open on the Volumes & networks screen, with `VEXEL_DOCKER_LOG` left at its default
- When → the operator watches the server's Docker call log for a minute
- Then → `/containers/json?all=true` appears about three times instead of seven, and never twice in the same instant

### Scenario: A container the operator removes leaves the volume and network lists at once

- REQ → REQ-38, REQ-43
- Given → a container is running with a volume mounted and a network attached, and the operator is on the Volumes & networks screen
- When → they remove that container from the Containers screen and return
- Then → the volume no longer names it under its mounting containers, and the network no longer names it under its attached containers

### Scenario: The containers screen shows exactly what it showed

- REQ → REQ-39, REQ-40, REQ-43
- Given → containers are running on the host
- When → the operator opens the Containers screen
- Then → the same cards in the same order, with live CPU and memory figures that keep moving

### Scenario: Browsing an image's filesystem leaves no ghost container on the lists

- REQ → REQ-41
- Given → the operator browses the filesystem of an image that declares a volume
- When → they open the Volumes & networks screen while that browse is running
- Then → no volume names an internal container of the application under its mounting containers, and no network names one under its attached containers

### Scenario: The dashboard still counts the host

- REQ → REQ-38, REQ-43
- Given → the operator is on the Dashboard
- When → they start a container from another terminal
- Then → the running count rises and the total stays right, as fast as it does today
