---
batch: modal-container-bond
feature: F2 — The modal is bound to its container, not to the list
closed_req: [REQ-32, REQ-33, REQ-34, REQ-35, REQ-36]
depends: [container-detail-modal]
---

# Batch — `modal-container-bond`

The containers list is live: it re-reads on every daemon event, it is filtered and searched, and the
daemon is the operator's own. So four different things can happen to a container while its detail
stands over the screen, and each has a different correct answer:

| what happens | the dialog |
| --- | --- |
| filtered or searched out of the visible list | untouched — the container still exists |
| moved or re-read by a daemon event | untouched — same container, same tab, same streams |
| recreated by a configuration change | follows it onto the new container |
| removed — by the operator, by another client, by the daemon | **states that it is gone**, and is closed by hand |

The inline panel closed silently when its container was removed. That is no longer enough: an overlay
that vanishes on its own leaves the operator wondering what they did, and one that stays on data that
has stopped is worse. The resolution is compared against the **unfiltered** list, exactly as the
images screen resolves its four analysis views — an object hidden by a filter has not gone anywhere.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/containers/ContainersScreen.tsx` | The open dialog is resolved against the **unfiltered** list: a container filtered or searched out of view leaves it open and untouched; a container that has left the daemon's list puts the dialog into a stated end state in place of the tabs — the library's one empty-result surface, carrying the explanation and the dialog's own dismissal as its resolving action, in one new English string — with every stream and session behind those tabs gone by then; a recreate re-points the dialog at the new container id instead of reading as a disappearance. The dialog keeps its chrome in that end state, so both of its ways out — the close control and the click outside — still work, and the point of interaction lands on the containers list rather than on a control that no longer exists. | REQ-32, REQ-33, REQ-34, REQ-35, REQ-36 | — |
| INT-2 | modify | `client/test/unit/containers-screen.test.tsx` | The delivered component-level checks of the same events — a removed container closing the panel, a filtered one staying selected — restated against the dialog and its stated end state, and the recreate check extended to prove a recreate is not read as a disappearance. | REQ-32, REQ-33, REQ-35 | INT-1 |
| INT-3 | modify | `client/e2e/containers.spec.ts` | The four events driven against the real daemon under an open detail: the fixture removed from outside the application, the fixture stopped out of a `running` filter, a recreate through the Config tab, and a list re-read. Own labelled fixtures, cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon; a real pointer at the visible control's coordinates, and the dialog's viewport box asserted across each event. | REQ-32, REQ-33, REQ-34, REQ-35, REQ-36 | INT-1 |

## Human acceptance

### Scenario: a container removed while its detail is open says so

- REQ → REQ-33, REQ-34, REQ-36
- Given → a container's detail is open on its Logs tab
- When → that container is removed — from its own card's overflow menu, or by someone else on the same daemon
- Then → the dialog stays where it is and states that the container no longer exists, instead of standing on logs that have stopped or vanishing without explanation
- And → the operator closes it with the dialog's close control, or by clicking outside it, and lands back on the containers list

### Scenario: a container filtered out of the list does not close its detail

- REQ → REQ-32
- Given → the state filter is set to *running* and a running container's detail is open on its Stats tab
- When → that container is stopped from outside the application, so it drops out of the filtered list behind the dialog
- Then → the dialog is untouched: the same container, the same tab, and its figures still arriving

### Scenario: a recreate keeps the detail open on the new container

- REQ → REQ-35
- Given → the detail is open on the Config tab in edit mode, with a change that requires a recreate (an added environment variable)
- When → the operator saves and confirms the recreate
- Then → the dialog stays open and shows the recreated container's configuration — not the statement that the container no longer exists
