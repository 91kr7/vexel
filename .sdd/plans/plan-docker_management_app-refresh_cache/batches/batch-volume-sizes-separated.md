---
batch: volume-sizes-separated
feature: Volume sizes are read on their own schedule
closed_req: REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23
depends: lists-from-held-values
---

# Batch — volume sizes separated

The requirements are in `../requirements.md` and are cited here by id only.

The volume list carries the size of each volume, and the only way to obtain it is `/system/df`, the
heaviest call the daemon answers. Bound together, the slowest-changing value in the application is
read on the schedule of the fastest-changing one. This batch separates them.

The product already took this decision once, the other way round, and wrote down why: the disk-usage
view does not poll `/system/df` **because** it is expensive on a large host. This batch makes the
volume list agree with it.

It is also the last batch of the plan, which is why the four "nothing else moves" requirements close
here: only now has every list moved, and only now can they be answered for the whole change.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-26 | modify | `server/src/volumes/volumes-service.ts` | Split the size reading out of the volume listing: sizes become a registered kind of their own, with a period far longer than the list's, marked due by the events that can change them — a volume removed, a container removed, a prune. The listing itself reads the volumes and their mounting containers, and joins in whatever sizes are currently held. A volume whose size is not yet known is listed without one rather than making the list wait, and gains it on the next read. | REQ-18, REQ-19 | — |
| INT-27 | modify | `server/src/volumes/volumes-service.ts`, `server/src/volumes/volumes-routes.ts` | Apply the same separation to a single volume's inspect, which today performs the same whole-disk-usage read for one volume's size. It joins in the held size like the listing does, and otherwise stays the direct read it is. | REQ-18, REQ-19, REQ-22 | INT-26 |
| INT-28 | modify | `server/src/system/disk-usage-service.ts` | Where the prune routes of this area already exist, mark the volume-size kind due after a prune that can reclaim volume space, so the sizes shown do not lag behind a reclaim the operator just performed. Nothing about the disk-usage breakdown itself changes: it stays the direct, event-driven read it already is, and does not become a held value. | REQ-18, REQ-23 | INT-26 |
| INT-29 | modify | `.sdd/modules/volumes/specs/volumes-service.md`, `.sdd/modules/volumes/specs/volumes-endpoints.md`, `.sdd/modules/system/specs/disk-usage-service.md` | Carry the separation into the specifications: that a volume's size is held on a schedule of its own, what marks it due, that a size not yet known is absent rather than awaited, and that the disk-usage view is unchanged. | REQ-18, REQ-19 | INT-26, INT-27, INT-28 |
| INT-30 | create | server check tree, api | A check that listing volumes no longer makes the daemon compute its whole disk usage, that the volumes are nevertheless listed with their sizes and their mounting containers, and that a volume created a moment ago is listed at once, without a size or with one, but never by making the list wait for one. | REQ-18, REQ-19 | INT-26, INT-27 |
| INT-31 | create | client check tree, e2e | A sweep over the screens that closes the plan's guardrails: every screen still shows what it showed and is still operated the same way; a detail view still reflects the daemon at the moment it is opened; and the log, statistics and compose-log streams still start, stream and stop as they did. Real pointer on the visible controls, with the surface's viewport box asserted before and after the interactions that open a dialog or a panel. | REQ-20, REQ-22, REQ-23 | — |
| INT-32 | create | client check tree, unit | A check that the client's list hooks were not changed by this plan: each still exposes the shape its screens consume, still holds its own interval, and still re-reads on the daemon events it subscribes to. This is a guard against the plan being "finished" by moving work into the client instead of the server. | REQ-21 | — |

## Human acceptance

### Scenario: Volumes still show their sizes

- REQ → REQ-18, REQ-19
- Given → the application is open on the volumes screen, with several volumes present, some mounted by containers
- When → the operator reads the list
- Then → every volume shows its size and the containers mounting it, exactly as it does today

### Scenario: A new volume appears immediately

- REQ → REQ-18, REQ-19
- Given → the application is open on the volumes screen
- When → the operator creates a volume
- Then → it appears in the list at once, with no wait while the daemon computes anything

### Scenario: Reclaimed space is reflected

- REQ → REQ-18
- Given → the operator has unused volumes taking measurable space
- When → they prune unused volumes from the system screen and return to the volumes screen
- Then → the reclaimed volumes are gone and what remains is reported consistently with what the prune said it reclaimed

### Scenario: Nothing else about the application changed

- REQ → REQ-20, REQ-21, REQ-22, REQ-23
- Given → an operator who used the application before this change
- When → they work through their usual path: browsing containers, opening a container's detail, following its logs, watching its statistics, inspecting an image, editing a compose file and bringing a project up
- Then → every screen shows what it showed, is operated the same way, and reacts to their actions at least as quickly as before
