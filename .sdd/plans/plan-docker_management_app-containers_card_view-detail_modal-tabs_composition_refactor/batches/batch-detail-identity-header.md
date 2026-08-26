---
batch: detail-identity-header
feature: F1 — The header carries the container's identity
closed_req: [REQ-6, REQ-7, REQ-8, REQ-9, REQ-10]
depends: [stable-detail-height]
---

# Batch — The dialog's header says which container this is, and how it is doing

A regression against a mockup already approved: the status dot, the state pill and the short id were
in it and were not built, the dialog receiving the single string `Container — payments-service`. The
prefix states what the operator already knows, and the state — the one thing that may have changed
since they opened it — is not there at all.

**Where the values come from, and why nothing new is asked of the daemon** (REQ-9): the state and the
health outcome are in the container data the screen already holds for the card — the daemon's own
status sentence carries `(healthy)` / `(unhealthy)`. Should the outcome turn out not to be reachable
from there, the fallback is the inspect data the detail already reads for its Config tab, shared
upward rather than fetched a second time. Either way no request, endpoint or cadence is added.

**A container that has ceased to exist freezes the header.** Decided by the human on 2026-08-26: the
identity keeps its last known values and the body goes on carrying the stated end state, exactly as
`plan-docker_management_app-containers_card_view-detail_modal/REQ-33` certifies. The dialog keeps its
chrome there, as it does today.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/feedback/Modal.tsx` | The dialog's `title` accepts composed content as well as a string, drawn in the same place on the same chrome band, beside the close control where one was asked for. A caller passing a string renders exactly what it renders today. | REQ-6, REQ-10 | — |
| INT-2 | create | client, containers feature area | The container's identity as it is drawn on a dialog's chrome: status dot, name, state pill, health pill when the container has a health check, short id — composed from library primitives and nothing else, with no `Container — ` prefix. Domain knowledge, so it stays out of the library. | REQ-6, REQ-7, REQ-8 | INT-1 |
| INT-3 | modify | `client/src/containers/ContainersScreen.tsx` | The detail's dialog is titled with that identity instead of the string, fed from the container data the screen already holds; in the "no longer exists" end state the identity keeps its last known values while the body carries the statement. | REQ-6, REQ-7, REQ-8, REQ-9 | INT-2 |
| INT-4 | modify | `client/e2e/containers.spec.ts`, `client/test/unit/containers-screen.test.tsx` | Every check that located the dialog or asserted its identity by reading the title string is rewritten against the identity header — the dot, the name, the state pill, the health pill's presence on a container that has a health check and its absence on one that has none, and the short id — rather than deleted or weakened. The close control, the focus return and the frozen header in the end state are named there too. | REQ-7, REQ-10, REQ-42, REQ-43, REQ-44, REQ-45 | INT-3 |

**Standing constraints on every intervention above** — REQ-38, REQ-39, REQ-40, REQ-41, REQ-42. They
are closed in the plan's last batch and honoured in this one.

## Human acceptance

### Scenario: the dialog's header says as much as the card the operator just left

- REQ → REQ-6, REQ-8
- Given → a running container in the list
- When → the operator opens its detail from the card's corner control
- Then → the dialog's header shows the state dot, the container's name on its own without the
  `Container — ` prefix, its state as a pill, and its short id

### Scenario: a container with a health check says how it is doing, one with none says nothing

- REQ → REQ-7
- Given → one container declaring a health check and one declaring none
- When → the operator opens each of their details in turn
- Then → the first shows its health outcome as a pill in the header, and the second shows no health
  pill and no gap where one would be

### Scenario: the state in the header keeps up with the container

- REQ → REQ-9
- Given → a running container with its detail open
- When → the container is stopped from elsewhere
- Then → the header's state pill reads the new state, without the operator doing anything

### Scenario: no other dialog's header changed

- REQ → REQ-10
- Given → any other dialog in the product — the create form, a confirmation, the layer explorer
- When → the operator opens it
- Then → its title reads as it always did, in the same place
