---
batch: container-detail-modal
feature: F1 — The container detail opens in a modal from the card's control, and the card stops being clickable
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31]
depends: []
---

# Batch — `container-detail-modal`

The move itself. The container's tabbed detail leaves the card grid for the product's existing
dialog surface at its large size — the one the image diff, layer explorer, layer efficiency and
filesystem browser views already use. The card's top-right control, built inert by decision on
2026-08-25, becomes the way in; the card body stops being a way in at all, and with it go the card's
hover, selected and expanded states.

**Nothing the detail contains, shows or does changes** (REQ-4). Any observable difference beyond
where the detail is drawn and how it is opened and closed is a defect of this batch, not a
consequence of it. In particular: no view inside it is re-sized — the dialog is large, and what it
holds is what it held.

**The modal has two ways out: its close control and a click on the dimmed area.** `Escape` is not
one of them (REQ-11) — the human's decision of 2026-08-26 — so the library's rule is untouched: an
open dialog claims the key and does nothing with it. That is a change against the starting point,
the inline panel this replaces closing on `Escape`, and it is stated rather than left to be inferred.
Nothing in `client/src/ui/controls/escape-arbitration.ts`, `Modal`'s claim, `FormSheet` or
`Combobox` is edited by this batch; what REQ-12 fixes is that a live session inside the dialog still
takes the key, as it already does.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/feedback/Modal.tsx` | Two opt-in presentations, asked for by the caller and by nothing else. A **labelled close control** on the dialog's own chrome, by `container_detail_close`'s rule — present where it is the only labelled way out. And the **return of the point of interaction** on dismissal to whatever held it when the dialog opened, falling back to the nearest enclosing dismissal focus target when that element has gone. A dialog asking for neither renders exactly what it renders today. | REQ-10, REQ-14, REQ-17 | — |
| INT-2 | modify | `client/src/containers/ContainerDetailPanel.tsx` | Stops wrapping itself in the shared `DetailPanel` and becomes the dialog's body: the same tabs in the same order, the same one active on open, the same active-tab-only mounting that ends a stream or a session when its tab goes away, the same content, operations and confirmations. It declares no header, no close control and no dismissal of its own — those are the dialog's. No raw tag, no stylesheet, no length. | REQ-4, REQ-23, REQ-24, REQ-30 | INT-1 |
| INT-3 | modify | `client/src/containers/ContainersScreen.tsx` | Hosts the detail in a large-format dialog instead of the grid's row-spanning expansion: the card's control opens it, the dialog names the container it belongs to, at most one stands, and the expansion together with the card-selection state is gone. A created container is no longer selected and opens nothing. The screen keeps holding the stats subscription while the dialog covers it — it is still the screen being shown. No raw tag, no stylesheet, no length. | REQ-1, REQ-2, REQ-3, REQ-5, REQ-11, REQ-12, REQ-13, REQ-15, REQ-16, REQ-17, REQ-18, REQ-22, REQ-26, REQ-30, REQ-31 | INT-1, INT-2 |
| INT-4 | modify | `client/src/containers/ContainerCard.tsx` | The top-right control stops swallowing its click and calls the open-detail callback, keeping its delivered accessible name, geometry and position, and being operable by keyboard. The card body's click gesture goes, together with the `selected` prop and the selectable treatment the card asks the library for. The footer's four slots, their order, their legality and their disabled reasons are untouched, and none of them opens the detail. | REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-30 | — |
| INT-5 | modify | `client/test/unit/containers-screen.test.tsx`, `client/test/unit/container-card.test.tsx`, `client/test/unit/container-detail-panel.test.tsx`, `client/test/unit/container-detail-panel-stats.test.tsx`, `client/test/unit/detail-panel-one-open.test.tsx` | The component-level checks that open the detail by selecting a card, that assert the card's selected treatment, or that assert the shared panel's control-less presentation **on this consumer**, restated against the dialog. The same checks read on the images consumer stay exactly as they are. | REQ-28 | INT-2, INT-3, INT-4 |
| INT-6 | modify | `client/e2e/containers.spec.ts`, `client/e2e/containers-card-geometry.spec.ts`, `client/e2e/container-detail-density.spec.ts`, `client/e2e/container-detail-property-columns.spec.ts`, `client/e2e/container-detail-switch-surface.spec.ts`, `client/e2e/container-logs.spec.ts`, `client/e2e/container-stats-processes.spec.ts`, `client/e2e/container-exec-attach.spec.ts`, `client/e2e/containers-stats-gate.spec.ts`, `client/e2e/container-create-run.spec.ts`, `client/e2e/copy-affordance-absence.spec.ts`, `client/e2e/copy-affordance-geometry.spec.ts`, `client/e2e/dialog-sizing.spec.ts` | Every delivered check that reaches the container detail by clicking a card body, that dismisses it by clicking that card again, or that dismisses it with `Escape`, rewritten to open it from the card's control and to dismiss it by the dialog's two routes — none deleted, none weakened into passing while what it named goes unchecked. The delivered `Escape` checks on this panel are restated as what now holds (the key leaves the dialog standing) rather than dropped. The geometry this change is judged on is added where the spec demands it: the dialog's viewport box, the list's box behind it, the card's box before and after, the Config tab's switch not dragging its surface, the jump-to-live control still blurring inside the dialog, and 375×812. The checks that must stay green **unedited** are named rather than assumed: the blur-policy unit pass, the UI conformance pass and the images screen's own panel checks. | REQ-19, REQ-20, REQ-21, REQ-25, REQ-27, REQ-28, REQ-29 | INT-3, INT-4 |

## Human acceptance

### Scenario: the container's detail opens in a dialog from the card's corner control

- REQ → REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-16, REQ-18, REQ-28, REQ-29, REQ-30
- Given → the Containers screen shows the operator's containers as cards, three to a row
- When → the operator clicks the small control at the top right of one card
- Then → that container's detail opens as a dialog over the screen, naming the container it belongs to and showing the same tabs it showed inline — Logs, Stats, Config, Processes, Inspect and, for a running container, Exec and Attach
- And → nothing has opened beneath the row: no card has moved, changed height or changed order, and the list has not scrolled

### Scenario: the card body no longer opens anything

- REQ → REQ-6, REQ-7, REQ-8, REQ-9
- Given → the Containers screen with no detail open
- When → the operator clicks the card's body — its name, its image line, its metrics
- Then → nothing opens, and the card offers no hover or selected treatment suggesting it could
- And → the footer's `Stop` / `Pause` / `Restart` / `…` still act on the container, and none of them opens the detail

### Scenario: the detail is left by its close control and by clicking outside it

- REQ → REQ-10, REQ-13, REQ-15, REQ-17, REQ-23
- Given → a container's detail is open over the Containers screen
- When → the operator uses the dialog's close control
- Then → the dialog closes, the list behind it is exactly as it was, and the keyboard's point of interaction is back on the control that opened it
- And → a click on the dimmed area beside the dialog does the same thing

### Scenario: `Esc` leaves the dialog standing

- REQ → REQ-11, REQ-14
- Given → a container's detail is open over the Containers screen, on any tab
- When → the operator presses `Esc`
- Then → the dialog stays open, and nothing on the screen it covers is dismissed behind it
- And → this is the one thing the operator could do before and cannot now: the inline panel closed on that key, and the dialog does not

### Scenario: a live session keeps its `Esc` inside the dialog

- REQ → REQ-12
- Given → a container's detail is open on the Exec tab with a live session
- When → the operator presses `Esc` with the cursor in the terminal
- Then → the session receives the keystroke and stays connected, and nothing anywhere is dismissed

### Scenario: the cards keep measuring behind the open dialog

- REQ → REQ-22
- Given → a container's detail is open over the Containers screen
- When → the operator leaves it open for longer than one sampling interval and then closes it
- Then → every card's CPU and memory read as measurements rather than *no sample*, and no card is blank

### Scenario: the log stream reads as it did, jump-to-live included

- REQ → REQ-20, REQ-21
- Given → the detail is open on the Logs tab of a container producing output
- When → the operator scrolls the lines back from the live edge
- Then → the floating "Jump to live" control appears over the lines, and the lines under it are blurred by it

### Scenario: the detail is usable on a phone-sized viewport

- REQ → REQ-19
- Given → the browser window is 375×812 on the Containers screen
- When → the operator opens a container's detail and moves through its tabs
- Then → every tab is reachable, no value is cut to nothing, the terminal and the log view are operable, and nothing needs horizontal scrolling

### Scenario: the health-check switch does not drag the dialog off screen

- REQ → REQ-25
- Given → the detail is open on the Config tab, in edit mode
- When → the operator clicks the health-check switch
- Then → the dialog is exactly where it was, and the switch is still in view

### Scenario: creating a container opens nothing

- REQ → REQ-26, REQ-31
- Given → the operator has filled in "Run container…"
- When → they create and start the container
- Then → the form closes, the new container appears as a card among the others in the list's usual order, and no detail opens

### Scenario: opening and closing many details leaves nothing behind

- REQ → REQ-23, REQ-24
- Given → several containers in different states
- When → the operator opens and closes each one's detail in turn, visiting the Logs, Stats and Exec tabs of each
- Then → the screen stays responsive, no session or stream is still running behind a closed dialog, and the cards go on updating as before

### Scenario: no other dialog and no other screen changed

- REQ → REQ-14, REQ-27
- Given → the operator opens the "Prune stopped" confirmation, the "Run container…" form, and the Images screen
- When → they use each of them as they did before
- Then → each dialog has the same controls and the same ways in and out as before this change, its behaviour on `Esc` included
- And → an image's detail still opens beneath its row, still offers no close control, and still closes by re-selecting that row

REQ-20, REQ-28, REQ-29 and REQ-30 are discipline requirements over how this batch is built and
checked rather than user paths of their own; they are cited above on the scenarios whose checks carry
them, and are verified by the delivered conformance and blur passes staying green and unedited.
