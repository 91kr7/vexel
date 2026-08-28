---
batch: volume-sizes-separated
feature: Volume sizes are read on their own schedule
closed_req: REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23
depends: lists-from-refresh-cache
---

# Batch — volume sizes separated

The requirements are in `../requirements.md` and are cited here by id.

The size of a volume changes slowly. Today it is read every three seconds, because it is read
together with the volume list. The only way to obtain it is `/system/df`, the heaviest call the
daemon answers. This batch separates the two.

The product already made this decision once, the other way round: the disk-usage view does not poll
`/system/df` because it is expensive on a large host. This batch makes the volume list agree with it.

This is also the last batch, so the four "nothing else moves" requirements close here. Only now has
every list moved, and only now can they be answered for the whole change.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/volumes/volumes-service.ts` | Register volume sizes as a kind of their own in the refresh cache, with a period much longer than the list's, marked due by the events that can change them: a volume removed, a container removed, a prune. | REQ-18 | — |
| INT-2 | modify | `server/src/volumes/volumes-service.ts` | The listing reads the volumes and their mounting containers, and joins in whatever sizes are held. A volume whose size is not yet known is listed without one, instead of making the list wait, and gains it on the next read. | REQ-18, REQ-19 | INT-1 |
| INT-3 | modify | `server/src/volumes/volumes-service.ts`, `server/src/volumes/volumes-routes.ts` | A single volume's inspect does the same whole-disk-usage read today for one size. It joins in the held size the same way, and otherwise stays the direct read it is. | REQ-18, REQ-19, REQ-22 | INT-1 |
| INT-4 | modify | `server/src/system/disk-usage-service.ts` | The prune routes of this area mark the volume-size kind due once they succeed, so the sizes do not lag behind a reclaim the operator just performed. The disk-usage breakdown itself does not change and does not become a held value. | REQ-18, REQ-23 | INT-1 |
| INT-5 | modify | `.sdd/modules/volumes/specs/volumes-service.md`, `.sdd/modules/volumes/specs/volumes-endpoints.md`, `.sdd/modules/system/specs/disk-usage-service.md` | Carry the separation into the specs: a size held on its own schedule, what marks it due, an unknown size absent rather than awaited, and the disk-usage view unchanged. | REQ-18, REQ-19 | INT-1, INT-2, INT-3, INT-4 |
| INT-6 | create | server check tree, api | A check that listing volumes no longer makes the daemon compute its whole disk usage, that volumes are still listed with their sizes and mounting containers, and that a volume created a moment ago is listed at once, with or without a size. | REQ-18, REQ-19 | INT-2, INT-3 |
| INT-7 | create | client check tree, e2e | A sweep closing the plan's guardrails: every screen shows what it showed and is operated the same way; a detail view shows the daemon's answer at the moment it is opened; the log, statistics and compose-log streams still start, stream and stop. Real pointer on the visible controls, asserting the surface's viewport box before and after each interaction that opens a dialog or a panel. | REQ-20, REQ-22, REQ-23 | — |
| INT-8 | create | client check tree, unit | A check that the client's list hooks were not changed by this plan: each still exposes the shape its screens use, still holds its own interval, and still re-reads on the daemon events it subscribes to. It guards against finishing the plan by moving the work into the client. | REQ-21 | — |

## Human acceptance

### Scenario: Volumes still show their sizes

- REQ → REQ-18, REQ-19
- Given → the application is open on the volumes screen, with several volumes present, some mounted by containers
- When → the operator reads the list
- Then → every volume shows its size and the containers mounting it, as it does today

### Scenario: A new volume appears immediately

- REQ → REQ-18, REQ-19
- Given → the application is open on the volumes screen
- When → the operator creates a volume
- Then → it appears in the list at once, with no wait while the daemon computes anything

### Scenario: Reclaimed space is reflected

- REQ → REQ-18
- Given → the operator has unused volumes taking measurable space
- When → they prune unused volumes from the system screen and return to the volumes screen
- Then → the reclaimed volumes are gone, and what remains agrees with what the prune said it reclaimed

### Scenario: Nothing else about the application changed

- REQ → REQ-20, REQ-21, REQ-22, REQ-23
- Given → an operator who used the application before this change
- When → they follow their usual path: browsing containers, opening a container's detail, following its logs, watching its statistics, inspecting an image, editing a compose file and bringing a project up
- Then → every screen shows what it showed, is operated the same way, and reacts to their actions at least as fast as before
