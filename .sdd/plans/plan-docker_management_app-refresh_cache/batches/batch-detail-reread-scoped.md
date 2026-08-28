---
batch: detail-reread-scoped
feature: A detail view re-reads only for the object it shows
closed_req: REQ-6, REQ-7, REQ-8
depends: —
---

# Batch — detail re-read scoped

The requirements are in `../requirements.md` and are cited here by id.

A detail view asks for one object, by identifier, and that part is correct. What is not scoped is the
decision to ask again. It reads again for any event of that kind, so looking at one container and
starting another re-reads the first. The event does not carry enough to tell them apart: it publishes
the object's name, and the identifier only as a fallback. So the server side comes first.

**What this batch does not do.** A volume's detail and a network's detail also read again on
`container` events, because the containers mounting or attached to them are part of what the view
shows. A container event can really change that, so those triggers stay. They stop being expensive in
`volume-sizes-separated`.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/events/event-stream-service.ts` | Publish the actor's identifier as a field of its own, next to the name the event already carries. The existing field keeps its meaning and its fallback, so current consumers are unaffected. The event identity used for the backlog does not change. | REQ-6 | — |
| INT-2 | modify | `client/src/data/event-stream.ts` | Carry the new field through to subscribers in the published event type. The subscription, the backlog priming and the by-object-type registry do not change. | REQ-6 | INT-1 |
| INT-3 | modify | `client/src/data/use-container-detail.ts`, `client/src/data/use-image-inspect.ts`, `client/src/data/use-network-inspect.ts`, `client/src/data/use-volume-inspect.ts` | Read again only when the event's identifier matches the object the view was opened for. The container detail keeps ignoring resize and exec actions, and the cross-kind triggers stay. | REQ-7, REQ-8 | INT-2 |
| INT-4 | modify | `client/src/data/use-container-detail.ts`, `client/src/data/use-image-inspect.ts`, `client/src/data/use-network-inspect.ts`, `client/src/data/use-volume-inspect.ts` | Treat an event with no usable identifier as one about the shown object, so a view never goes stale by ignoring an event it could not attribute. | REQ-8 | INT-3 |
| INT-5 | modify | `.sdd/modules/events/specs/event-stream-service.md`, `.../event-stream-client.md`, `.sdd/modules/containers/specs/use-container-detail.md`, `.sdd/modules/images/specs/use-image-inspect.md`, `.sdd/modules/networks/specs/use-network-inspect.md`, `.sdd/modules/volumes/specs/use-volume-inspect.md` | Carry the changes into the specs: the new identifier and its fallback rule, and for each detail hook which events read it again. | REQ-6, REQ-7, REQ-8 | INT-1, INT-2, INT-3, INT-4 |
| INT-6 | create | client check tree, e2e | A check that a detail open on one object is not read again because of another object of the same kind. With a container's detail open, acting on a different container leaves it unchanged, while acting on the shown one updates it as today. | REQ-7, REQ-8 | INT-3, INT-4 |

## Human acceptance

### Scenario: Another container's activity leaves the open detail alone

- REQ → REQ-6, REQ-7
- Given → the operator has one container's detail open, and another container also exists
- When → the other container is started and then stopped
- Then → the open detail keeps showing the container it was opened for, unchanged and without reloading

### Scenario: The shown object still updates immediately

- REQ → REQ-8
- Given → the operator has one container's detail open
- When → that same container is stopped
- Then → the detail shows the new state at once, as it does today

### Scenario: A volume's detail still follows the containers that mount it

- REQ → REQ-8
- Given → the operator has a volume's detail open, showing the containers that mount it
- When → a container that mounts that volume is removed
- Then → the detail stops listing that container, as it does today
