---
batch: 1 · failures-become-toasts
feature: F2 — Every other failure is a toast
closed_req: REQ-5, REQ-6, REQ-7, REQ-8, REQ-13
depends: —
---

# Batch 1 — failures-become-toasts

Requirements: `.sdd/plans/plan-docker_management_app-inline_error_panels/requirements.md`. Ids cited,
never copied.

**One service carries most of this batch.** `ErrorReportingProvider` already collects every operation
failure from 13 feature files. It holds them in a list, and the Shell draws that list as panels. Make
the service raise a toast instead, and every one of those call sites changes behaviour without being
touched.

**The toast component is not modified.** It already caps the stack at three and drops the oldest when
a fourth arrives, which is exactly what REQ-6 asks for, and it already has the `danger` tone REQ-5
asks for.

**The transfer failures come here too** (INT-6 to INT-8), by the human's decision of 2026-09-03: a
message about something that was running is a toast. The retry those messages carried becomes an
action of the transfer dialog, since REQ-7 allows no button on a toast — decisions D2, D7 and D8 in
`batches.md`. The progress display itself is not touched.

## What this batch builds

- **Failure reporter** — the one way a screen hands the reporting service a failure it holds as
  state: a read that failed, a transfer that failed. Batch 2 uses it on every screen; without it,
  twenty screens each write the same effect.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/App.tsx`, `client/src/shell/Shell.tsx` | The reporting service must be able to raise a toast and to read the connection status. Move the toast provider above it. Every existing consumer of both keeps working. | REQ-5, REQ-13 | — |
| INT-2 | modify | `client/src/shell/services/ErrorReportingService.tsx` | The service stops holding a list. A report raises one `danger` toast carrying the same title and the daemon's own message, with no action control. Every repetition raises another one, copies included. | REQ-5, REQ-6, REQ-7, REQ-8 | INT-1 |
| INT-3 | modify | `client/src/shell/services/ErrorReportingService.tsx` | A report raised while the connection status says nothing is reachable is dropped: the header tells that failure, and it is told once. | REQ-13 | INT-2 |
| INT-4 | create | client, app-shell area | The failure reporter: a screen hands it a failure it holds as state, and it reports one per occurrence. The same failure still standing across a re-render reports nothing. | REQ-5, REQ-6 | INT-2 |
| INT-5 | modify | `client/src/shell/Shell.tsx` | Remove the two panels the Shell draws in the content area: the reported-error list and the daemon-unreachable panel. The header pill and its `Retry` stay untouched. | REQ-1, REQ-2, REQ-13 | INT-2 |
| INT-6 | modify | `client/src/ui/feedback/TransferProgressDialog.tsx` | The dialog stops drawing the failure message. It keeps its progress display where the transfer stopped, and offers the retry it had as one of its own actions, beside `Close`. | REQ-5, REQ-7 | INT-4 |
| INT-7 | modify | `client/src/images/ImagesScreen.tsx` (the pull and push dialogs), `client/src/registries/RegistriesScreen.tsx` (the pull dialog) | Remove the three transfer-failure panels. Each screen reports the failure of its own transfer through the reporter of INT-4. | REQ-5, REQ-7 | INT-4 |
| INT-8 | modify | `client/src/images/LayerExplorer.tsx`, `LayerEfficiencyView.tsx`, `FilesystemBrowser.tsx`, `ImageDiffView.tsx`, `ImagesScreen.tsx` | The six call sites of the transfer dialog report its failure through the reporter of INT-4, and pass their retry to the dialog's own action. | REQ-5, REQ-7 | INT-6 |
| INT-9 | modify | `.sdd/modules/app-shell/index.md`, `specs/error-reporting-service.md`, `specs/shell.md`, `specs/app.md`, `.sdd/modules/ui-library/index.md` and `specs/transfer-progress-dialog.md`, the `images` and `registries` specs of the files above | Record the new reporting path, the two surfaces the Shell no longer draws, the dialog's failed state with its retry action, and the new component with its own spec row. | REQ-5, REQ-6, REQ-7, REQ-13 | INT-4, INT-5, INT-7, INT-8 |

## Human acceptance

### Scenario: a failed action is reported by a toast and by nothing in the page

- REQ → REQ-5, REQ-7
- Given → the Docker daemon is reachable and the operator is on the Volumes & networks screen
- When → the operator removes a volume the daemon refuses to remove
- Then → a failure toast appears in the bottom-right corner, carrying the daemon's own message and no
  button other than its dismiss control
- And → no panel appears anywhere in the page

### Scenario: the same failure happens four times

- REQ → REQ-6, REQ-8
- Given → the operator is on a screen where an action keeps failing the same way
- When → the operator repeats that action four times
- Then → four toasts are raised, at most three are on screen at once, and the first one is gone

### Scenario: an image pull fails while it runs

- REQ → REQ-5, REQ-7
- Given → the operator started a pull and its progress dialog is open
- When → the transfer fails
- Then → a failure toast appears with the reason, and the dialog shows no failure message
- And → the dialog offers `Retry` beside `Close`, and one press starts the transfer again

### Scenario: the daemon is unreachable and the page says nothing

- REQ → REQ-13
- Given → the Docker daemon is stopped
- When → the operator opens the application
- Then → the header report says the daemon is unreachable
- And → no toast is raised for it
