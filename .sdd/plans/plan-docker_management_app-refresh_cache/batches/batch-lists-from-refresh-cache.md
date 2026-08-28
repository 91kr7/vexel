---
batch: lists-from-refresh-cache
feature: The lists are answered from values the server keeps current
closed_req: REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17
depends: read-once-values
---

# Batch — lists from the refresh cache

The requirements are in `../requirements.md` and are cited here by id only.

## What this batch builds

- **The refresh cache** — a new server-side component, generic and with no Docker vocabulary of its
  own. A caller registers a *kind* of data with a way to read it and a period; the cache holds the
  last value read, serves it without calling the daemon, refreshes it in the background on its own
  schedule, and can be told a value is due. It is the only new component in the whole plan; INT-1 to
  INT-7 build it, and everything after them is an existing service adopting it.

**On the name.** The human asked for "a daemon that polls server-side and caches". It is called the
*refresh cache* and its background workers *refreshers*, because in this product "daemon" already
means the Docker daemon and would be ambiguous in every sentence, and "cache" alone would collide
with the image analysis cache, which is a different thing entirely.

## Read before the table

**The failure mode to avoid.** An implementation that answers only after refreshing, or that does
not mark values due when the operator acts, produces an application that costs less and reacts more
slowly. That is a worse product than the one we have. REQ-10 and REQ-13 are what forbid it, and the
acceptance scenarios are written to catch it.

**One refresher per kind (REQ-11), never one pass over everything.** Today a slow volume read delays
volumes and nothing else. A single sequential pass would let one blocked `/system/df` or one wedged
`compose ls` freeze every list at once — introducing, in the name of efficiency, a failure the
product does not currently have.

**Order inside the batch.** INT-8 makes the container list the cache's first and only consumer, and
INT-9 to INT-15 all depend on it: the component is proved against one list, on a real screen, before
seven more are moved onto it.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | create | server, a shared area of its own beside the Docker access layer | The refresh cache's store: a caller registers a kind of data with a way to read it, and the cache holds the last value read together with the time it was read. | REQ-9 | — |
| INT-2 | create | server, the same area as INT-1 | Serving: a held value is returned without calling the daemon, and a value is fetched with the caller waiting only when none has ever been read for that kind. | REQ-9 | INT-1 |
| INT-3 | create | server, the same area as INT-1 | One independent refresher per registered kind, each on its own period, so a slow or blocked read delays only its own kind. A refresh in flight never delays an answer and never turns one into an error. | REQ-10, REQ-11 | INT-1 |
| INT-4 | create | server, the same area as INT-1 | Failure handling: a read that fails leaves the previous value in place and reports how old it is, rather than replacing it with an error. | REQ-15 | INT-1 |
| INT-5 | create | server, the same area as INT-1 | Marking due: a kind can be declared interested in a daemon event type, and the cache subscribes to the events republished in process and marks those kinds due. Events arriving together produce one re-read, not one each. | REQ-12 | INT-3 |
| INT-6 | create | server, the same area as INT-1 | The demand gate: a kind is refreshed only while it is being asked for. Asking renews the demand, a bounded silence expires it, and the next ask starts it again. | REQ-14 | INT-3 |
| INT-7 | create | server, the same area as INT-1 | Discard on context change: every held value is dropped on the notification the active-endpoint component already publishes, so nothing describing the previous daemon survives. Being a new component, its spec and its index row are written in the same turn. | REQ-16 | INT-1 |
| INT-8 | modify | `server/src/containers/containers-service.ts`, `server/src/containers/containers-routes.ts` | The container listing becomes a registered kind — its read, its period, `container` as its event type — and the list endpoint answers from it. Inspect, logs, statistics, processes and sessions stay direct. | REQ-9, REQ-11, REQ-12 | INT-2, INT-5, INT-6, INT-7 |
| INT-9 | modify | `server/src/containers/containers-routes.ts` | Every lifecycle, rename, prune and configuration route marks the container kind due once it succeeds, so the operator sees the result of their own action at once. | REQ-13 | INT-8 |
| INT-10 | modify | `server/src/images/images-service.ts`, `server/src/images/images-routes.ts`, `server/src/images/image-transfer-service.ts` | The image listing becomes a registered kind marked due by `image` events; pull, push, tag, untag, remove and prune mark it due. Progress streams, save/load and inspect stay direct. | REQ-9, REQ-11, REQ-12, REQ-13 | INT-8 |
| INT-11 | modify | `server/src/volumes/volumes-service.ts`, `server/src/volumes/volumes-routes.ts` | The volume listing becomes a registered kind marked due by `volume` and `container` events; create, remove and prune mark it due. Inspect stays direct, and the size reading inside the listing is left exactly as it is here. | REQ-9, REQ-11, REQ-12, REQ-13 | INT-8 |
| INT-12 | modify | `server/src/networks/networks-service.ts`, `server/src/networks/networks-routes.ts` | The network listing becomes a registered kind marked due by `network` and `container` events; create, remove, prune, attach and detach mark it due. Inspect stays direct. | REQ-9, REQ-11, REQ-12, REQ-13 | INT-8 |
| INT-13 | modify | `server/src/compose/compose-discovery-service.ts`, `server/src/compose/compose-routes.ts`, `server/src/compose/compose-lifecycle-service.ts` | Project discovery becomes a registered kind marked due by `container` events — compose projects being derived from container labels, that is the event that can change them. Up, down, restart and scaling mark it due. File read/write and log streaming stay direct. | REQ-9, REQ-11, REQ-12, REQ-13 | INT-8 |
| INT-14 | modify | `server/src/contexts/contexts-service.ts`, `server/src/contexts/contexts-routes.ts` | The context inventory becomes a registered kind with a long period and no event type; create, select-active and remove mark it due. **This listing reports which context is active**, so INT-7's discard must not leave the interface without an answer at the moment the context is switched. | REQ-9, REQ-11, REQ-13, REQ-16 | INT-8 |
| INT-15 | modify | `server/src/builders/builders-service.ts`, `server/src/builders/build-cache-service.ts`, `server/src/builders/builders-routes.ts` | The builder and build-cache inventories become registered kinds with periods of their own and no event type; create, remove, select-active and cache prune mark them due. | REQ-9, REQ-11, REQ-13 | INT-8 |
| INT-16 | modify | `server/src/connectivity/connection-status-service.ts`, `server/src/connectivity/connectivity-routes.ts` | The connection status becomes a registered kind with a much longer period. It **keeps a real probe of the daemon** — it reports the negotiated versions, which only a call returns — and is marked due when the daemon event stream's own connection drops or recovers, so an unreachable daemon is still reported promptly. | REQ-9, REQ-11, REQ-15 | INT-8 |
| INT-17 | modify | the specs and index of every module touched by INT-8 to INT-16 — containers, images, volumes, networks, compose, contexts, builders, connectivity | Carry each change into the spec of the component that changed, in the same turn: which listing is answered from the refresh cache, what marks it due, and what stays direct. | REQ-9, REQ-11, REQ-12, REQ-13 | INT-8, INT-9, INT-10, INT-11, INT-12, INT-13, INT-14, INT-15, INT-16 |
| INT-18 | create | server check tree, unit | Checks of the component itself rather than through a route: a held value is served without a read; a read in flight neither delays nor fails an answer; a failed read keeps the previous value and its age; a burst of events yields one re-read; demand expiring stops a refresher and asking restarts it; a context change discards what was held; one blocked kind leaves the others answering. | REQ-10, REQ-11, REQ-12, REQ-14, REQ-15, REQ-16 | INT-7 |
| INT-19 | create | server check tree, api | A check against the running endpoints on a real daemon: a list endpoint answers without the daemon being called for it, two clients do not multiply the daemon's work, and an operation performed through the application is reflected by the next request without waiting for a timer. | REQ-9, REQ-13, REQ-17 | INT-9, INT-10, INT-11, INT-12, INT-13, INT-14, INT-15, INT-16 |
| INT-20 | create | client check tree, e2e | A check that acting on a container from its screen updates the row with no perceptible wait, and the same for a volume, a network and a compose project on their own screens. Real pointer on the visible controls; the assertion is on what the screen shows after the action. | REQ-13 | INT-9, INT-11, INT-12, INT-13 |

## Human acceptance

### Scenario: The operator's own action is visible at once

- REQ → REQ-9, REQ-13
- Given → the application is open on the containers screen, showing a running container
- When → the operator stops it
- Then → the row shows it stopped as quickly as it does today, with no wait the operator can perceive

### Scenario: Something the operator did elsewhere still appears

- REQ → REQ-12
- Given → the application is open on the containers screen
- When → the operator starts a container from a terminal, outside the application
- Then → it appears in the list, and as quickly as it does today

### Scenario: Two windows cost what one costs

- REQ → REQ-17
- Given → the operator is watching the calls their daemon receives
- When → they open a second window of the application on the same screen as the first, and leave both alone
- Then → the daemon receives no more work than it received with one window open

### Scenario: A closed application asks nothing

- REQ → REQ-14
- Given → the server is running and the operator is watching the calls the daemon receives
- When → the operator closes every window of the application and waits
- Then → the daemon stops receiving list calls from the application altogether

### Scenario: A slow daemon does not make the interface wait

- REQ → REQ-10, REQ-11
- Given → the daemon is answering slowly, so that reading the volumes takes several seconds
- When → the operator moves between the containers, images and networks screens while that read is still going on
- Then → each list appears immediately with what was last read, and none of them waits for the volumes

### Scenario: An unreachable daemon does not blank the interface

- REQ → REQ-15
- Given → the application is open and showing containers, images, volumes and networks
- When → the daemon becomes unreachable
- Then → the application reports that it cannot reach the daemon, as it does today, and does not replace the lists with an error page

### Scenario: Changing context shows the other daemon's objects only

- REQ → REQ-16
- Given → the operator has two contexts pointing at different daemons, and the application is showing the objects of the first
- When → the operator makes the second context active
- Then → every list shows the objects of the second daemon, with nothing of the first left visible at any moment
