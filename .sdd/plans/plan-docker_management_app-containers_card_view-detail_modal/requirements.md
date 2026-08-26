---
slug: docker_management_app-containers_card_view-detail_modal
date: 2026-08-26
spec: .sdd/analysis/docker_management_app-containers_card_view-detail_modal.md
status: validated
---

# Requirements — The container detail moves out of the card row and onto the modal dialog surface

Evolution of the delivered product. The immediate reference plan is
[`plan-docker_management_app-containers_card_view`](../plan-docker_management_app-containers_card_view/requirements.md),
which built the card's top-right control *"present and inert by decision"* and announced this very
intervention; two further certified plans are load-bearing here and are preserved by name below —
[`container_detail_close`](../plan-docker_management_app-container_detail_close/requirements.md)
(the rule that a panel carries a close control exactly when it has no other way out, and `Escape`
arbitrated innermost-first) and
[`dialog_sizing`](../plan-docker_management_app-dialog_sizing/requirements.md) (a dialog's card is
the size of its content, width a designed constant, height the variable).

Requirements are observable, individually verifiable behaviours. Ids are local to this plan: `REQ-1`
below is *not* `plan-docker_management_app-containers_card_view/REQ-1`. Requirements of other plans
are always cited with their path prefix.

**Two features, because they fail independently.** F1 is the move itself — the detail leaves the
grid for the dialog surface, the card's control becomes the way in and the card body stops being a
way in at all. F2 is the modal's bond to a live list: a container can be filtered out, re-read,
recreated or removed while its detail stands over the screen, and each of those four has a different
correct answer. F1 can be right while a removed container leaves a modal on stale data; F2 cannot be
built before F1 exists, which is the dependency and not a second reason to merge them.

**This change moves a surface and adds nothing.** No new capability, tab, data, API, metric,
sampling cadence or liveness gate, and no new keyboard behaviour anywhere. Every requirement below
is either "the detail is now drawn, opened and closed differently" or "what was already true is
still true, and is checked rather than assumed".

## Values and readings fixed in these requirements, and why

No placeholder is left below. Four points the spec leaves open are decided here, each with its
reason and each cheap to reverse in one place:

- **`Escape` closes nothing, this modal included** (REQ-11, REQ-14) — the human's decision of
  2026-08-26, taken on the delivered product: *"sta cosa dell'esc che chiude i popup non farla"*. The
  library's rule therefore stands entirely untouched — an open dialog claims the key and
  deliberately does nothing with it, which is what stops a dismissible surface underneath being
  dismissed behind it — and the container detail is a dialog like the others. **This is a behaviour
  change against the starting point and is stated as one** (REQ-11): the inline panel closes on
  `Escape` today, and the modal that replaces it will not. The requirement of the source analysis
  that said otherwise is the analyst's own addition, and is being struck from it.
- **The dimmed area outside the card still dismisses, as it does for every dialog** (REQ-13). The
  spec requires the modal to be dismissed by the routes every dialog in this product is dismissed
  by and to invent none of its own; a click on the scrim is one of those routes today, on every
  dialog including the four large-format ones. Withdrawing it here would be the invention.
- **A container that ceases to exist is stated in place, on the modal itself** (REQ-33, REQ-34), not
  reported by a toast as the modal vanishes and not resolved by a silent close. The spec names both
  failure modes — sitting on stale data, and vanishing without explanation — and only a statement on
  the surface the operator is looking at avoids both.
- **Creating a container opens no detail** (REQ-26). The delivered screen makes a newly created
  container the selected card, which is what opened its inline panel. With the control as the sole
  route in (REQ-6) and no selected state left on a card (REQ-8), the alternative would be a second
  route into the modal that no gesture of the operator's asked for.

## F1 — The container detail opens in a modal from the card's control, and the card stops being clickable

| ID | Requirement |
| --- | --- |
| REQ-1 | The container detail is presented on the product's existing modal dialog surface — the one every dialog in the product is drawn on. No second dialog idiom is introduced for it: not a browser window, not a drawer, not a non-modal floating panel, not a surface of its own. |
| REQ-2 | The inline expansion is gone from the containers screen: no detail opens beneath a card or beneath a row of cards, and no preference, flag or gesture brings it back. |
| REQ-3 | Opening or closing the detail leaves the list exactly as it was: no card moves, no card changes height, the grid does not reorder and the list does not scroll. |
| REQ-4 | The detail shows the same tabs in the same order — Logs, Stats, Config, Processes, Inspect and, for a running container, Exec and Attach — opening on the same tab as delivered, with the same data, the same operations, the same confirmations and the same live behaviour. Any observable difference beyond where the detail is drawn and how it is opened and closed is a defect of this change. |
| REQ-5 | The card's top-right control opens that container's detail. It is no longer inert, it keeps its delivered accessible name, and it is operable by keyboard as well as by pointer. |
| REQ-6 | The card's top-right control is the only route into the detail: clicking the card anywhere else opens nothing. |
| REQ-7 | The card presents itself as a surface that is not interactive: no hover treatment, no selected treatment and no other affordance implying the card body can be clicked. |
| REQ-8 | The card carries no expanded and no selected state in any form: nothing on any card marks it as the one whose detail is open. |
| REQ-9 | The card's footer keeps its delivered contract in full — the three lifecycle slots in their fixed order, the overflow menu and its four entries, their legality, their disabled reasons and the one-menu-at-a-time rule — and none of them ever opens the detail. |
| REQ-10 | The modal carries a close control: one labelled control, reachable by pointer and by keyboard, that dismisses it. |
| REQ-11 | `Escape` does not close the modal: it is a dialog like every other in the product, so while it is open it claims the key and does nothing with it, and nothing on the screen it covers is dismissed behind it. **This is a change against the starting point, and is stated as one rather than left to be inferred from an absence**: the inline panel the modal replaces closes on `Escape`; the modal does not. The ways out are the close control (REQ-10) and the click outside (REQ-13). |
| REQ-12 | An `Escape` typed into a live exec or attach session inside the modal is received by the session: the session stays live, the modal stays open and nothing anywhere is dismissed. |
| REQ-13 | A click on the dimmed area outside the modal's card dismisses it, as it does for every dialog in the product. |
| REQ-14 | No other dialog in the product changes: every other dialog keeps exactly the dismissal routes and the controls it has today, its behaviour on `Escape` included. The close control of REQ-10 is asked for by this one surface and by nothing else. |
| REQ-15 | At most one container detail is open at a time, and no route presents a second one while one stands. |
| REQ-16 | The modal states which container it belongs to, legibly and without the operator acting: the identity is carried on the modal itself rather than by proximity to a card. |
| REQ-17 | Closing the modal returns the operator's point of interaction to the control that opened it, by every dismissal route. |
| REQ-18 | The modal is sized by the delivered dialog rules as a large-format surface, alongside the image diff, layer explorer, layer efficiency and filesystem browser dialogs: one designed width, the card the size of its content with no band of empty glass beside it and nothing rendered outside it, the height bounded by the viewport, and the content scrolling inside the card rather than escaping it. |
| REQ-19 | At 375×812 the detail stays usable: every tab reachable, no value clipped to nothing, the terminal and the log views operable, and nothing requiring horizontal scrolling. |
| REQ-20 | No surface joins the blur allow-list and none leaves it: the conformance check's blur pass and its allow-list gain and lose nothing, no new blurring selector and no new blur value appears anywhere, and no `ui-blur-exception:` comment is added. |
| REQ-21 | The log stream's floating jump-to-live control still blurs the lines beneath it while the Logs tab is shown inside the modal, and is not repaired by adding anything to the allow-list. |
| REQ-22 | The shared per-container sampling gate is untouched and an open modal does not close it: while the modal stands over the containers screen the daemon keeps being sampled at its certified cadence, and closing the modal blanks no card. |
| REQ-23 | Every stream and session the detail owns ends when the modal is dismissed, by every dismissal route: the stats stream, the log stream and any exec or attach session. Nothing outlives a closed modal. |
| REQ-24 | Repeated opening and closing, over many containers and in every state, accumulates nothing: no orphaned stream, no orphaned session, no retained focus trap, no growing listener count. |
| REQ-25 | Operating the Config tab's health-check switch inside the modal leaves the modal's viewport box unchanged and leaves the switch itself inside the viewport. |
| REQ-26 | Creating a container from the screen's create/run form selects nothing and opens no detail: the form closes, the list is re-read, and the new container appears as a card like any other. |
| REQ-27 | The images screen is untouched: its detail panel keeps its inline expansion and its delivered dismissal, and the shared panel's without-close presentation is not deleted and continues to serve it. |
| REQ-28 | Every existing check that opened the detail by clicking a card, and every check that proved the detail dismissable, is rewritten against the modal rather than deleted, and none is weakened into passing while what it named goes unchecked. |
| REQ-29 | Every interaction of this change is driven with a real pointer at the visible control's own coordinates — never by an element's own `click()`, never by a dispatched event, never aimed at a visually hidden input — and the checks assert geometry: the modal's viewport box, the list's box behind it and the card's own box before and after. Content assertions stand beside those, never instead of them. |
| REQ-30 | Nothing under `client/src/` outside `client/src/ui/` acquires, as a result of this change, a raw DOM tag, a `.css` file, a CSS module, an inline `style` prop, a `className` carrying visual utilities, or a hard-coded colour, radius, blur, spacing, shadow, font size or z-index. |
| REQ-31 | The containers screen's toolbar, its search and state filters, its list ordering and its empty state behave exactly as delivered. |

## F2 — The modal is bound to its container, not to the list

| ID | Requirement |
| --- | --- |
| REQ-32 | A container filtered out of the list, searched out of it, or moved by a list re-read while its detail is open leaves the modal open on that same container, on the same tab, with its streams still running. |
| REQ-33 | When the container ceases to exist — removed from its own card's menu, removed by another client, or removed by the daemon — the modal states that it is gone, rather than sitting on stale data or vanishing without explanation. |
| REQ-34 | The operator leaves that stated end state by the modal's own dismissal routes, all of which still work there; nothing strands them in it. |
| REQ-35 | A configuration change that recreates the container is not a disappearance: the modal stays open and continues on the new container, exactly as the inline panel did. |
| REQ-36 | When the modal resolves itself on a container that ceased to exist, every stream and session it owned has ended, and the point of interaction lands somewhere stable in the containers list rather than on a control that no longer exists. |
