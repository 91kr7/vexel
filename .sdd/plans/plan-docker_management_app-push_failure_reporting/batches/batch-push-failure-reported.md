---
batch: push-failure-reported
feature: A refused push reaches the operator, and a check that can fail proves it
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10]
depends: []
---

# Batch — push-failure-reported

Requirements: `.sdd/plans/plan-docker_management_app-push_failure_reporting/requirements.md`.

**Read INT-1 before writing anything.** REQ-7 makes the diagnosis a precondition of the correction,
not a formality: four of the eight interventions below are conditional on what it finds, and
changing a link the finding does not name is a violation of the requirement, not merely extra work.

**Branch** — this batch is committed on the branch already open,
`feat/docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload`.
No branch of its own. See "Departures" in `batches.md`.

## Interventions

| ID | Type | Where | What | REQ | Depends |
|----|------|-------|------|-----|---------|
| INT-1 | create | the plan folder `.sdd/plans/plan-docker_management_app-push_failure_reporting/` | Establish, by hand and before any change, where the refusal is lost. Tag a local image as `localhost:1/…`, run the push, and follow the outcome link by link: what the daemon actually emits on its own stream at the refusal, what the server's stream endpoint sends on, what the client hook concludes, what the dialog draws. Write the finding into `finding.md` in this folder — the daemon's own lines at the refusal, the link that drops them, and therefore exactly what will change. Both candidates named in the spec are in scope, the delivery path **and** the check. | REQ-7 | — |
| INT-2 | modify | `server/src/images/image-transfer-service.ts` — the shared `streamTransfer`, which serves both push and pull | Make the end of the daemon's stream a **stated** outcome. A refusal is reported the instant its line arrives, whatever shape the daemon states it in, carrying the daemon's own message verbatim. An end with no stated success is reported as a failure, carrying the last message the daemon gave, never as a clean completion. A success is concluded only from a stated success. Introduce no timer, no watchdog and no "nothing arrived in N seconds" fallback of any kind. | REQ-1, REQ-2, REQ-3, REQ-5, REQ-6 | INT-1 |
| INT-3 | modify | `server/src/images/images-routes.ts` — the pull and push progress stream endpoints | Only if INT-1 names this link: carry the failure through to the client as the stream's `error` event with the daemon's message, and end the stream on it. No deadline of the endpoint's own. | REQ-1, REQ-2, REQ-3, REQ-6 | INT-1 |
| INT-4 | modify | `client/src/data/use-image-transfer.ts` — `useImageTransferStream` | Only if INT-1 names this link: a stream that ends with no stated success leaves the hook in failure, carrying the message, rather than in a clean completion; the hook closes on the daemon's word, never on a deadline of its own. | REQ-2, REQ-3, REQ-4, REQ-6 | INT-1 |
| INT-5 | modify | `client/src/images/ImagesScreen.tsx` — the push progress dialog | On the corrected path, confirm the reported failure is drawn in the push progress dialog with the daemon's message legible in it, and that the dialog stays open until the operator dismisses it (the delivered behaviour per `images-screen.md`). Change it only if it does not. | REQ-4 | INT-2 |
| INT-6 | create | client end-to-end checks, images area (`client/e2e/`) | A Playwright spec driving the refusal through the product's own interface: tag a fixture image as `localhost:1/<repo>:v1`, open the Images screen, use the row's overflow menu → `Push…` with a **real pointer at the visible controls**, submit, and — watching from before the push starts — assert the progress dialog **shows** the failure with the daemon's message in it. A budget of its own above forty-five seconds (Playwright's default thirty is below the refusal time). No network is reached: `localhost:1` answers nothing. Fixture image and tag removed in a `finally`, with the ownership labels. | REQ-8, REQ-9, REQ-10 | INT-2 |
| INT-7 | modify | `server/test/api/images-push-routes.test.ts` — the refused-push check, currently failing | Keep this check and keep its forty-five-second budget; after the correction it must pass. Touch it **only** if INT-1 names the check itself as the broken one, and then only the assertion the finding condemns — never the budget, which the spec forbids raising as a remedy. The successful-push check in the same file stays exactly as it is: it is REQ-5's guard. | REQ-7, REQ-10 | INT-1 |
| INT-8 | modify | `.sdd/modules/images/specs/` — `image-transfer-service.md`, and `images-endpoints.md` / `use-image-transfer-stream.md` if their components changed | Carry the corrected outcome rule into the spec of every component actually changed: the invariant is now that a success is stated, and that an end without one is a failure. Update only the specs of components this batch touched. | REQ-2, REQ-6 | INT-2 |

## Human acceptance

### Scenario: The operator learns that a push to an unreachable registry failed, and why

- REQ → REQ-1, REQ-2, REQ-3, REQ-4
- Given → an image on the Images screen carrying a tag pointing at an address that answers nothing
- When → the operator pushes that tag and waits for the daemon to give up
- Then → the push's progress dialog states that the push failed, and shows the daemon's own words naming the address and the cause
- And → nothing on screen is still presented as a push in progress

### Scenario: The failure stays until the operator has read it

- REQ → REQ-4
- Given → the push's progress dialog showing the failure just reported
- When → the operator leaves it alone, then closes it themselves
- Then → the dialog stays open and readable for as long as they leave it, and goes away only when they close it

### Scenario: A push that works is unchanged

- REQ → REQ-5
- Given → an image tagged for a registry that is reachable
- When → the operator pushes it
- Then → the per-layer progress runs and the push completes exactly as it did before

### Scenario: A pull that is refused says so too

- REQ → REQ-6
- Given → the Images screen and a pull asked for from an address that answers nothing
- When → the operator starts the pull and waits for the daemon to give up
- Then → the pull's progress dialog states the failure with the daemon's own words, and no pull is left apparently running

### Scenario: The reader can find out what was actually broken

- REQ → REQ-7
- Given → the finished batch
- When → the human opens `finding.md` in this plan's folder
- Then → it names what the daemon emits at the refusal, which link was dropping it, and which files were changed as a consequence — and nothing outside that list was touched

### Scenario: The check fails on the delivered product and passes on the corrected one

- REQ → REQ-8, REQ-9, REQ-10
- Given → the new end-to-end check, run with the machine offline from any registry
- When → it is run against the product as delivered, and then against the corrected product
- Then → it fails the first time by not finding the failure on screen, passes the second, and in neither run does it wait less than the forty-five seconds already granted or need more of them
