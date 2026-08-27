---
batch: lists-from-held-values
feature: The lists are answered from values the server keeps current
closed_req: REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17
depends: read-once-values
---

# Batch — lists from held values

The requirements are in `../requirements.md` and are cited here by id only.

This is the batch the plan exists for, and the one that can go wrong in a way the operator feels.
Read the two paragraphs below before the table.

**The failure mode to avoid.** An implementation that answers only after refreshing, or that does
not mark values due when the operator acts, produces an application that costs less and reacts more
slowly. That is a worse product than the one we have. REQ-10 and REQ-13 are what forbid it, and the
acceptance scenarios below are written to catch it.

**One refresher per kind of data (REQ-11), never one pass over everything.** Today a slow volume
read delays volumes and nothing else. A single sequential pass would let one blocked `/system/df` or
one wedged `compose ls` freeze every list at once — introducing, in the name of efficiency, a
failure the product does not currently have.

**Order inside the batch.** INT-14 builds the mechanism and INT-15 makes the container list its
first and only consumer; INT-16 to INT-21 are the other kinds adopting it, and every one of them
depends on INT-15. That is deliberate: the mechanism is proved against one list, on a real screen,
before seven more are moved onto it.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-14 | create | server, a shared area of its own beside the Docker access layer | The held-value mechanism, generic and with no Docker vocabulary of its own: a caller registers a kind of data with a way to read it and a refresh period, and gets back a way to ask for the current value and a way to mark it due. It holds the last value with the time it was read; it serves that value immediately, including while a refresh is in flight, and fetches with the caller waiting only when it has never read one. It runs **one independent refresher per registered kind**. It keeps the last good value when a read fails, and reports how old it is rather than failing. It refreshes only while the kind is in demand, demand being renewed by asking for the value and expiring after a bounded silence, and it discards every held value on the signal the active-endpoint component already publishes when the context changes. It subscribes to the daemon events republished in-process and marks due the kinds a caller declared interested in an event type, grouping events that arrive together into a single re-read. Being a new component it gets its specification and its index row in the same turn. | REQ-9, REQ-10, REQ-11, REQ-12, REQ-14, REQ-15, REQ-16 | — |
| INT-15 | modify | `server/src/containers/containers-service.ts`, `server/src/containers/containers-routes.ts` | The container listing becomes a kind registered with INT-14 — its read, its period, and `container` as the event type that marks it due. The list endpoint answers from the held value. Every lifecycle, rename, prune and configuration route of this file marks the container kind due after it succeeds, so the operator sees the result of their own action at once (REQ-13). Inspect, logs, statistics, processes and sessions are **not** touched: they stay direct. | REQ-9, REQ-10, REQ-11, REQ-12, REQ-13 | INT-14 |
| INT-16 | modify | `server/src/images/images-service.ts`, `server/src/images/images-routes.ts`, `server/src/images/image-transfer-service.ts` | The image listing becomes a registered kind, marked due by `image` events; the listing endpoint answers from it. Pull, push, tag, untag, remove and prune mark it due when they succeed. The progress streams, the save/load streams and image inspect stay direct. | REQ-9, REQ-11, REQ-12, REQ-13 | INT-15 |
| INT-17 | modify | `server/src/volumes/volumes-service.ts`, `server/src/volumes/volumes-routes.ts` | The volume listing becomes a registered kind, marked due by `volume` and `container` events; create, remove and prune mark it due. Volume inspect stays direct. The size reading it performs is left exactly as it is here and is separated in `volume-sizes-separated`. | REQ-9, REQ-11, REQ-12, REQ-13 | INT-15 |
| INT-18 | modify | `server/src/networks/networks-service.ts`, `server/src/networks/networks-routes.ts` | The network listing becomes a registered kind, marked due by `network` and `container` events; create, remove, prune, attach and detach mark it due. Network inspect stays direct. | REQ-9, REQ-11, REQ-12, REQ-13 | INT-15 |
| INT-19 | modify | `server/src/compose/compose-discovery-service.ts`, `server/src/compose/compose-routes.ts`, `server/src/compose/compose-lifecycle-service.ts` | Compose project discovery becomes a registered kind, marked due by `container` events — compose projects being derived from container labels, that is the event that can change them. Up, down, restart and scaling mark it due when they finish. The compose file read/write and the log streaming stay direct. | REQ-9, REQ-11, REQ-12, REQ-13 | INT-15 |
| INT-20 | modify | `server/src/contexts/contexts-service.ts`, `server/src/contexts/contexts-routes.ts` | The context inventory becomes a registered kind with a long period and no event type — the daemon announces nothing about contexts. Create, select-active and remove mark it due. **The active-context change must keep working exactly as it does today**: this listing is the one that reports which context is active, and the mechanism's own discard-on-context-change must not leave the interface without an answer at the moment it is switched. | REQ-9, REQ-11, REQ-13, REQ-16 | INT-15 |
| INT-21 | modify | `server/src/builders/builders-service.ts`, `server/src/builders/build-cache-service.ts`, `server/src/builders/builders-routes.ts`, `server/src/connectivity/connection-status-service.ts`, `server/src/connectivity/connectivity-routes.ts` | The builder inventory, the build-cache inventory and the connection status become registered kinds with periods of their own and no event type. Builder create, remove, select-active and cache prune mark their kinds due. The connection status keeps a real probe of the daemon — it reports the negotiated versions, which only a call returns — at a much longer period, and is marked due when the daemon event stream's own connection drops or recovers, so an unreachable daemon is still reported promptly. | REQ-9, REQ-11, REQ-13, REQ-15 | INT-15 |
| INT-22 | modify | `.sdd/modules/containers/specs/containers-service.md`, `.../containers-endpoints.md`; `.sdd/modules/images/specs/images-service.md`, `.../images-endpoints.md`; `.sdd/modules/volumes/specs/volumes-service.md`, `.../volumes-endpoints.md`; `.sdd/modules/networks/specs/networks-service.md`, `.../networks-endpoints.md`; `.sdd/modules/compose/specs/compose-discovery-service.md`; `.sdd/modules/contexts/specs/contexts-service.md`; `.sdd/modules/builders/specs/builders-service.md`, `.../build-cache-service.md`; `.sdd/modules/connectivity/specs/connection-status-service.md`, `.../connectivity-status-endpoint.md`; and the index of every module touched | Carry each change into the specification of the component that changed, in the same turn: which listing is answered from a held value, what marks it due, and what stays direct. Add the new module or index row for INT-14's component beside the modules that use it. | REQ-9, REQ-11, REQ-12, REQ-13 | INT-14, INT-15, INT-16, INT-17, INT-18, INT-19, INT-20, INT-21 |
| INT-23 | create | server check tree, unit | Checks of the mechanism itself, against INT-14 rather than through a route: a value is served without a read when one is held; a read in flight does not delay or fail an answer; a failed read keeps the previous value and reports its age; a burst of events produces one re-read; demand expiring stops the refresher and asking again restarts it; a context change discards what was held; and one kind blocked on a slow read leaves the others answering. | REQ-10, REQ-11, REQ-12, REQ-14, REQ-15, REQ-16 | INT-14 |
| INT-24 | create | server check tree, api | A check, against the running endpoints on a real daemon, that a list endpoint answers without the daemon being called for it, that repeated requests from two clients do not multiply the daemon's work, and that an operation performed through the application is reflected by the next request to the affected list without waiting for a timer. | REQ-9, REQ-13, REQ-17 | INT-15, INT-16, INT-17, INT-18, INT-19, INT-20, INT-21 |
| INT-25 | create | client check tree, e2e | A check that the screens are unchanged where it matters most: acting on a container from the containers screen updates the row without a perceptible wait, and the same for a volume, a network and a compose project on their own screens. Real pointer on the visible controls, and the assertion is on what the screen shows after the action, not on how it was obtained. | REQ-13 | INT-15, INT-17, INT-18, INT-19 |

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
- Then → it appears in the list, and it appears as quickly as it does today

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
- When → the operator moves between the containers, images and networks screens while that read is
  still going on
- Then → each list appears immediately with what was last read, and none of them waits for the
  volumes

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
