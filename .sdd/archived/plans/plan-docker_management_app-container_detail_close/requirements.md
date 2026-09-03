---
slug: docker_management_app-container_detail_close
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-container_detail_close.md
status: validated
---

# Requirements — The container detail panel closes by its row, not by a `✕`

Evolution of the existing product. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md); the immediate
predecessor is [`plan-docker_management_app-container_row_actions`](../plan-docker_management_app-container_row_actions/requirements.md)
(change-1, certified and merged), which emptied this panel's action slot and introduced the row
overflow menu that now competes for `Escape`.

Requirements are observable, individually verifiable behaviours. Ids are local to this plan: `REQ-1`
below is *not* `plan-docker_management_app/REQ-1`. Requirements of other plans are always cited with
their path prefix.

Visual reference: `bugs-screen/change-2.png`, normative only for **which** control is meant — the
round `✕` on the container detail panel. Its row band and its `Export filesystem…` entry show a state
change-1 already replaced.

One feature, one batch. The library variant (REQ-13) has no observable behaviour until a screen
chooses it, so it is delivered and accepted through its only consumer in this change, the containers
screen.

## F1 — The container detail panel closes by its row, not by a `✕`

| ID | Requirement |
| --- | --- |
| REQ-1 | The container detail panel presents no close control: the round `✕` is gone from the rendered interface, not hidden, not disabled and not moved elsewhere on the panel. |
| REQ-2 | No replacement dismissal affordance appears on the container detail panel in its place — no collapse link, no chevron, no rendered keyboard hint — and the action area change-1 emptied stays empty. |
| REQ-3 | Selecting the already-selected container row closes the panel, and this is covered by the product's automated verification rather than merely being true. |
| REQ-4 | Selecting a *different* container row leaves the panel open and re-points it at the newly selected container. |
| REQ-5 | `Escape` closes the open container detail panel. |
| REQ-6 | `Escape` dismisses the panel from wherever focus sits inside the panel's own contents, so a keyboard user who reached those contents by tabbing can leave without a pointer. |
| REQ-7 | `Escape` is arbitrated innermost-first against the other consumers of that key on this screen: while a container row's overflow menu is open, `Escape` closes the menu and leaves the panel open; a second `Escape` then closes the panel. |
| REQ-8 | An interactive session, an exec terminal or any other keystroke-consuming session hosted in or reached from the panel never loses an `Escape` keystroke to the panel: the keystroke reaches the session and the panel stays open. |
| REQ-9 | While a dialog or confirmation of the product is open over the containers screen, `Escape` does not dismiss the panel behind it. What the dialog itself does with the key is its own existing behaviour and is not changed here. |
| REQ-10 | `Escape` acts on the panel only while a panel is open; with no panel open it changes nothing about what is selected, filtered or displayed on the containers screen. |
| REQ-11 | When `Escape` closes the panel, the operator's point of interaction is left somewhere stable and sensible in the containers list — never on an element that no longer exists and never lost to the document as a whole. |
| REQ-12 | An open panel's bond to its row is visible without acting: the owning row is distinguishable from every other row as the one whose panel is open. |
| REQ-13 | The shared detail panel offered by the UI library can present either with or without a close control, as one component with a variant rather than a second panel that looks like it; the choice is made by whoever uses it, through the library's public entry point, and the component stays free of Docker vocabulary. |
| REQ-14 | The variant is applied in this change to the container detail panel only: the images detail panel keeps its close control and dismisses exactly as it does today. |
| REQ-15 | The panel never outlives its row without a way out when the container disappears from the list: if the container owning an open panel is removed, or otherwise leaves the live list on a daemon event, the panel does not remain open with no dismissal route. |
| REQ-16 | Filtering does not destroy a selection: when the row owning an open panel is excluded by the list's search or state filters, its row and its panel are simply not rendered — nothing is stranded on screen — the selection is kept, and the panel reappears unchanged when the container re-enters the filtered list. |
| REQ-17 | Nothing else about the container detail panel changes: the same data, the same operations reachable from it and from its row, the same confirmations, the same feedback and the same live updates as before — any observable difference beyond the disappearance of the `✕` and the addition of `Escape` is a defect. |
| REQ-18 | The change adds no overlay surface and no runtime blur: nothing joins the interface's enforced blur allow-list, and the conformance check passes with its allow-list unchanged. |
| REQ-19 | After this change the product's automated verification demonstrates that the container detail panel is dismissable — by row re-selection and by `Escape`. Every existing check that dismissed a detail panel by clicking its `✕` is rewritten to a surviving route rather than deleted, skipped or weakened, and the check that clicks the images panel's `✕` keeps passing untouched. |
