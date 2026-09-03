---
batch: batch-every-listing-arrives-by-push
feature: Every other listing the server holds arrives on the live channel
closed_req: [REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-33, REQ-34]
depends: [batch-containers-arrive-by-push]
---

# batch-every-listing-arrives-by-push

The nine listings that still poll are given the same treatment the container listing already had:
each reads from the pushed-value store and drops its clock. The disk accounting needs no work in the
browser — it is already published, and the two screens that show it keep their own triggers.

Every intervention below is the same shape: read from the store, drop the poll and its period figure,
keep the first read, the loaded flag, the failure reporting, the reload signal and whatever the hook
drives. Where the hook re-reads after one of the operator's own actions, that re-read waits for the
push the server's own operation causes, instead of calling the endpoint.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | modify | `client/src/data/use-images.ts` | Read the image listing from the pushed-value store; drop the poll and its period figure. | REQ-17, REQ-20, REQ-21, REQ-25, REQ-33, REQ-39 | — |
| INT-2 | modify | `client/src/data/use-volumes.ts` | Read the volume listing from the store; drop the poll and its period figure. The Volumes & networks screen keeps mounting it. | REQ-17, REQ-20, REQ-21, REQ-25, REQ-33, REQ-39 | — |
| INT-3 | modify | `client/src/data/use-networks.ts` | Read the network listing from the store; drop the poll and its period figure. The Networks panel keeps mounting it. | REQ-17, REQ-20, REQ-21, REQ-25, REQ-33, REQ-39 | — |
| INT-4 | modify | `client/src/data/use-compose-projects.ts` | Read the compose project listing from the store; drop the poll and its period figure. | REQ-17, REQ-20, REQ-21, REQ-25, REQ-33, REQ-39 | — |
| INT-5 | modify | `client/src/data/use-builders.ts` | Read the builder listing from the store; drop the poll and its period figure. Create, remove and select-active keep driving as today. | REQ-17, REQ-20, REQ-21, REQ-25, REQ-33, REQ-39 | — |
| INT-6 | modify | `client/src/data/use-build-cache.ts` | Read the build-cache inventory from the store; drop the poll and its period figure. Prune keeps driving as today. | REQ-17, REQ-20, REQ-21, REQ-25, REQ-33, REQ-39 | — |
| INT-7 | modify | `client/src/data/use-contexts.ts` | Read the context inventory from the store; drop the poll and its period figure. Create, remove, select-active and the active-context announcement keep working as today. | REQ-17, REQ-20, REQ-21, REQ-24, REQ-25, REQ-33, REQ-39 | — |
| INT-8 | modify | `client/src/data/use-plugins.ts` | Read both inventories from the store as the one round the server holds; drop the poll and its period figure. Install, enable, disable, inspect and remove keep driving as today. | REQ-17, REQ-20, REQ-21, REQ-25, REQ-33, REQ-39 | — |
| INT-9 | modify | `client/src/data/use-registries.ts` | Read the registries inventory from the store; drop the poll and its period figure. Log in and log out keep driving as today. | REQ-17, REQ-20, REQ-21, REQ-25, REQ-33, REQ-39 | — |
| INT-10 | modify | `client/src/data/use-kept-reading.ts` | The converted listings no longer store through it — the pushed-value store keeps that rule now. It stays for the container detail's inspect data and process listing. | REQ-21 | INT-1 … INT-9 |
| INT-11 | modify | `client/src/data/reload-signal.ts` | The converted listings no longer subscribe. The signal keeps serving the views that still read on demand, and one call still ends only when every subscribed read has ended. | REQ-23, REQ-34 | INT-1 … INT-9 |
| INT-12 | modify | `.sdd/tech-debt/index.md` and the response-sequencing entry under `.sdd/tech-debt/entries/` | State what is left of the ordering problem now that no converted value is read on demand, or remove the entry and its index row if nothing is left. | REQ-22 | INT-1 … INT-9 |
| INT-13 | create | the check trees (`server/test/api/`, `client/e2e/`) | Drive every converted listing through the push: a change made outside the application reaching each screen, an action's own result, a context switch, and the manual refresh control. | REQ-23, REQ-24, REQ-25, REQ-34 | INT-11 |
| INT-14 | create | the check trees (`client/e2e/`) | Guard what must not move: the Dashboard's overview figures on their clock, the container detail's two clocks, the five views waiting for the operator, the live streams, and the list endpoints answering as before. | REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-33 | INT-1 … INT-9 |

## Human acceptance

### Scenario: Every screen follows the host with nothing to press

- REQ → REQ-33
- Given → the Images screen is open and untouched
- When → the operator removes an image from a terminal, outside the application
- Then → the row disappears from the list without the operator doing anything

### Scenario: The result of the operator's own action appears at once

- REQ → REQ-25, REQ-34
- Given → the Volumes & networks screen is open
- When → the operator creates a volume
- Then → the new volume is in the list as soon as the action reports success, as it is today

### Scenario: The manual refresh control still reloads everything

- REQ → REQ-23, REQ-34
- Given → any screen offering the refresh control is open
- When → the operator presses it
- Then → the control stays busy until the screen shows the reloaded data, and then reports the outcome as it does today

### Scenario: A context switch shows the new daemon and nothing of the old one

- REQ → REQ-24
- Given → the Contexts screen is open and another context is available
- When → the operator makes that context the active one
- Then → every screen shows the objects of the new daemon, and no object of the previous one is left on screen

### Scenario: The views that were left alone are still left alone

- REQ → REQ-27, REQ-28, REQ-29, REQ-30
- Given → the Dashboard, a container's detail and the disk-usage view of System & prune
- When → the operator uses each of them as they do today
- Then → the overview figures still move on their own, the container detail still follows the container it shows, the disk-usage view still waits to be asked, and the logs, statistics and console sessions behave as before

### Scenario: What the change leaves behind is written down and still answers

- REQ → REQ-21, REQ-22, REQ-31
- Given → the interface is running on the pushed values
- When → a reader opens the technical-debt register and calls the list endpoints directly
- Then → the register describes what is left of the ordering problem, or no longer holds it, and every list endpoint answers with the body and headers it answers with today
