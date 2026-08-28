---
batch: detail-reread-scoped
feature: A detail view re-reads only for the object it shows
closed_req: REQ-6, REQ-7, REQ-8
depends: —
---

# Batch — detail re-read scoped

The requirements are in `../requirements.md` and are cited here by id only.

A detail view asks for one object, correctly, by identifier. What is not scoped is the decision to
ask again: it re-reads whenever *any* event of that kind arrives, so looking at one container and
starting another re-reads the first. The event does not carry enough to tell them apart — it
publishes the object's name, with the identifier only as a fallback — so the server side comes first.

**What this batch deliberately does not do.** A volume's and a network's detail also re-read on
`container` events, because the containers mounting or attached to them are part of what the view
shows, and a container event genuinely can change that. Those stay. They stop being expensive in
`volume-sizes-separated`, which is where the cost actually lives.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `server/src/events/event-stream-service.ts` | Publish the actor's identifier as a field of its own, alongside the name the event already carries. The existing field keeps its meaning and its fallback, so every current consumer is unaffected; the event identity used for the backlog does not change. | REQ-6 | — |
| INT-2 | modify | `client/src/data/event-stream.ts` | Carry the new field through to subscribers in the published event type. The subscription, the backlog priming and the by-object-type registry are otherwise untouched. | REQ-6 | INT-1 |
| INT-3 | modify | `client/src/data/use-container-detail.ts`, `client/src/data/use-image-inspect.ts`, `client/src/data/use-network-inspect.ts`, `client/src/data/use-volume-inspect.ts` | Re-read only when the event's identifier matches the object the view was opened for. Existing exclusions stay — the container detail keeps ignoring resize and exec actions — and the cross-kind triggers stay, a `container` event still re-reading a volume's and a network's detail. | REQ-7, REQ-8 | INT-2 |
| INT-4 | modify | `client/src/data/use-container-detail.ts`, `client/src/data/use-image-inspect.ts`, `client/src/data/use-network-inspect.ts`, `client/src/data/use-volume-inspect.ts` | Treat an event carrying no usable identifier as concerning the shown object, so a detail view can never go stale by silently ignoring an event it could not attribute. | REQ-8 | INT-3 |
| INT-5 | modify | `.sdd/modules/events/specs/event-stream-service.md`, `.../event-stream-client.md`, `.sdd/modules/containers/specs/use-container-detail.md`, `.sdd/modules/images/specs/use-image-inspect.md`, `.sdd/modules/networks/specs/use-network-inspect.md`, `.sdd/modules/volumes/specs/use-volume-inspect.md` | Carry the changes into the specs of the components that changed: the added identifier and its fallback rule, and for each detail hook which events re-read it and which no longer do. | REQ-6, REQ-7, REQ-8 | INT-1, INT-2, INT-3, INT-4 |
| INT-6 | create | client check tree, e2e | A check that a detail open on one object is not re-read because of another of the same kind: with a container's detail open, acting on a *different* container leaves it unchanged and asks the daemon nothing about it, while acting on the shown one updates it as today. | REQ-7, REQ-8 | INT-3, INT-4 |

## Human acceptance

### Scenario: Another container's activity leaves the open detail alone

- REQ → REQ-6, REQ-7
- Given → the operator has one container's detail open, and another container also exists
- When → the other container is started and then stopped
- Then → the open detail goes on showing the container it was opened for, unchanged and without flickering or reloading

### Scenario: The shown object still updates immediately

- REQ → REQ-8
- Given → the operator has one container's detail open
- When → that same container is stopped
- Then → the detail reflects the new state at once, exactly as it does today

### Scenario: A volume's detail still follows the containers that mount it

- REQ → REQ-8
- Given → the operator has a volume's detail open, showing the containers that mount it
- When → a container that mounts that volume is removed
- Then → the detail stops listing that container, as it does today
