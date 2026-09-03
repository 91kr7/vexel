---
batch: stable-detail-height
feature: F0 — One height for the whole detail, and the tab's content scrolls inside it
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5]
depends: []
---

# Batch — The detail's frame stops moving

The cross-cutting point of the mock, and the one it names as first if only one is done: it is the
only change noticeable without knowing to look for it, it is what makes Processes and the terminals
able to take the available height, and it closes the residue of
`plan-docker_management_app-containers_card_view-detail_modal/REQ-25` without anchoring anything.

**The mechanism already exists in two halves and is not being invented here.** `BandStack` is the
library's answer to "bands of chrome above one region that takes the height left", and `Modal`
already hands a `'large'` dialog's bounded height down to a body that holds one
(`ui-library/specs/modal.md`, `specs/band-stack.md`). What is missing is the third half: that bound
is a *maximum*, so a short tab still makes a short dialog. The opt-in below turns it into a height.

`fill` is the library's established name for "bounded by the region I am placed in, virtualisation
preserved" — `TreeView` has carried it since `plan-docker_management_app-filesystem_browser_layout`
— and the two regions that need it here take that same opt-in rather than a second idiom.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/feedback/Modal.tsx`, and the dialog's rules in `client/src/ui/feedback/feedback.css` | A fourth caller opt-in beside `closeControl`, `restoreFocus` and `fluidWidth`: at `size="large"` the card's height becomes a stable, viewport-bounded height instead of its content's. One declaration, compounded with the large format's own class so it is inert and independent of source order elsewhere. | REQ-1, REQ-2, REQ-4, REQ-5 | — |
| INT-2 | modify | `client/src/containers/ContainersScreen.tsx` | The detail's dialog asks for that opt-in by name, beside `fluidWidth`, `closeControl` and `restoreFocus`, and states no length of its own. | REQ-1, REQ-4 | INT-1 |
| INT-3 | modify | `client/src/containers/ContainerDetailPanel.tsx` | The panel's interior becomes the library's band arrangement: the tab row a band, the active tab's content the one filling region. That is also what makes the dialog hand its bounded height down, by the gate `modal.md` documents. The panel goes on stating no height, width or minimum of its own. | REQ-1, REQ-3 | INT-1 |
| INT-4 | modify | `client/src/ui/data/LogStream.tsx` | The log region gains the `fill` opt-in `TreeView` already carries: its bound comes from the region it is placed in rather than from `maxHeight`, with virtualisation, the follow behaviour and the jump-to-live control unchanged. A caller that does not ask for it keeps the delivered `maxHeight` path exactly. | REQ-3 | — |
| INT-5 | modify | `client/src/containers/ContainerLogsView.tsx` | The log region asks for that fill instead of the stated maximum. Nothing about which lines are streamed, buffered, rendered or downloaded follows from it. | REQ-3 | INT-3, INT-4 |
| INT-6 | modify | `client/src/containers/ContainerSessionView.tsx`, and `client/src/ui/terminal/SessionChrome.tsx` where the session surface's height is stated | The Exec and Attach surface takes the height of the region it is placed in, so the terminal fills the stable dialog. Their sessions, launch forms, controls and behaviour are untouched — this is the whole of what those two tabs change in this plan. | REQ-3 | INT-3 |
| INT-7 | modify | `client/e2e/container-detail-switch-surface.spec.ts`, `client/e2e/support/surface-stability.ts`, `client/e2e/containers.spec.ts`, `client/e2e/dialog-sizing.spec.ts` | The health-check switch goes back to the strict `clickAndExpectSurfaceUnmoved` that the predecessor's narrowing gave up, since the reason for the narrowing is gone. A new check drives a real pointer over every tab in turn and asserts the dialog's viewport box is identical across each change. `dialog-sizing.spec.ts` gains the four other large dialogs still being sized by their content in height. | REQ-1, REQ-2, REQ-5, REQ-43, REQ-44, REQ-45 | INT-2, INT-3, INT-6 |

**Standing constraints on every intervention above** — REQ-38 (nothing outside `client/src/ui/`
acquires markup, CSS or a hard-coded value), REQ-39 (the blur allow-list gains and loses nothing),
REQ-40 (375×812), REQ-41 (no new capability, endpoint or cadence), REQ-42 (the certified behaviours
of the dialog survive and are named). They are closed in the plan's last batch and honoured in this
one.

## Human acceptance

### Scenario: the dialog stays exactly where it is while the operator moves between tabs

- REQ → REQ-1, REQ-3
- Given → a container's detail is open on Config
- When → the operator clicks Logs, then Processes, then Inspect
- Then → the dialog's frame does not move or resize at any of the three changes: its top and bottom
  edges stay where they were, and each tab's content scrolls inside it instead of stretching it

### Scenario: revealing the health-check fields no longer lifts the dialog

- REQ → REQ-2
- Given → the Config tab is in editing, with the health check off
- When → the operator turns the health-check switch on
- Then → the five fields appear inside the form and the dialog's edges do not move at all

### Scenario: the dialog still fits the screen it is on

- REQ → REQ-4
- Given → the browser window is short
- When → the operator opens a container's detail
- Then → the whole dialog is visible inside the window, with its usual margin, and no part of it is
  cut off

### Scenario: the other large dialogs are as they were

- REQ → REQ-5
- Given → an image with several layers
- When → the operator opens the layer explorer, the layer efficiency view, the image diff and the
  filesystem browser
- Then → each is the size its content makes it, exactly as before
