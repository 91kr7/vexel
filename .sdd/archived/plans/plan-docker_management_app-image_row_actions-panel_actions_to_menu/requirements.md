---
slug: docker_management_app-image_row_actions-panel_actions_to_menu
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-image_row_actions-panel_actions_to_menu.md
status: validated
---

# Requirements — The image panel's four actions become row-menu entries, and their four views become the screen's

Evolution of the delivered product, and a re-opening of certified work. The starting state is
[`plan-docker_management_app-image_row_actions`](../plan-docker_management_app-image_row_actions/requirements.md)
(change-3, delivered, certified and merged): the images row already carries one overflow control with
six entries, and the image detail panel already has no `✕`. Its predecessors
[`plan-docker_management_app-container_row_actions`](../plan-docker_management_app-container_row_actions/requirements.md)
(change-1 — the shared `Menu`, its separated groups and destructive tone, the trailing overflow slot)
and
[`plan-docker_management_app-container_detail_close`](../plan-docker_management_app-container_detail_close/requirements.md)
(change-2 — the panel's control-less presentation and the `Escape` arbitration registry) are consumed,
not reproduced. The ancestor is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md), where the four flows
themselves were delivered.

Requirements are observable, individually verifiable behaviours. Ids are local to this plan: `REQ-1`
below is *not* `plan-docker_management_app/REQ-1` and *not*
`plan-docker_management_app-image_row_actions/REQ-1`. Requirements of other plans are always cited
with their path prefix.

There is no visual mock for this change. The spec's screenshot shows the **current** state to be
changed — the panel's four buttons — and no arrangement is read off it.

**One feature, one batch, four separately verifiable parts**, matching the spec's own division:
part one is the move (REQ-1…REQ-4), part two the menu of ten (REQ-5…REQ-12), part three the four
flows becoming views of the screen (REQ-13…REQ-22), part four `Compare with…` from a row
(REQ-23…REQ-27 and REQ-35), and REQ-28…REQ-34 are the verification and standing properties owed by
all of them.
They fail differently and independently — entries can be in the menu while a flow cannot open without
a panel; a flow can open correctly while `Compare with…` picks the wrong side — so a failure names
its part. They are one feature because they are one change to one screen, sharing its component, its
menu, its `Escape` arbitration and its verification: a menu entry that opens a flow is worthless
until the flow can open without a panel, and a flow lifted to the screen is unreachable until the
entry exists.

**The spec's part five — correcting change-3's record — carries no requirement here**, because it is
already done: `.sdd/analysis/docker_management_app-image_row_actions.md` carries the head-of-file
banner and a superseding note at each of the four named sites, plus a `superseded_in_part_by` key in
its frontmatter. The spec assigns that work to the human, not to this plan; it is recorded as an
assumption in [`batches.md`](batches.md) rather than as a requirement nobody would implement.

## F1 — The image panel's four actions become row-menu entries, and their four views become the screen's

### Part one — the move (REQ-1 … REQ-4)

| ID | Requirement |
| --- | --- |
| REQ-1 | The image detail panel presents no actions: `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…` and `Compare with…` are gone from the rendered panel — not hidden, not disabled, not relocated elsewhere on it, not turned into tabs or links — and no replacement affordance of any kind appears in their place. The row's menu is the affordance. |
| REQ-2 | The panel's action bar is empty and stays empty, exactly as the container panel's is: no reserved strip, no gap and no stray padding where the four buttons sat, the panel's header reading as the container panel's does. This is the intended end state, not an unfinished one. |
| REQ-3 | The panel is otherwise exactly as change-3 left it: the same contents, sections, order and raw payload; opening by selecting its row; closing by re-selecting that row and by `Escape`; no close control; disappearing with its image when the image leaves the list, and with its row when a search hides it. Any observable difference beyond the four buttons leaving is a defect of this change. |
| REQ-4 | Each of the four operations is initiated from the image row's overflow menu, on every image row, and reaches exactly the flow it reaches today: the same view, the same data, the same loading, the same cost warning where there is one, the same caching, the same errors and the same way out. This change relocates an entry point and changes nothing behind it. |

### Part two — the menu of ten (REQ-5 … REQ-12)

| ID | Requirement |
| --- | --- |
| REQ-5 | The row's overflow menu holds exactly ten entries, in this order: `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…`, `Compare with…`, `Run…`, `Tag…`, `Untag`, `Push…`, `Save`, `Remove`. No entry is added beyond the four arrivals and none is taken away. |
| REQ-6 | The ten read as three groups, marked by separation and tone alone: a separator between `Compare with…` and `Run…`, and the separator that already sets `Remove` apart from the entries above it. No section heading, no group label, no icon and no other new decoration is introduced. |
| REQ-7 | The four arriving entries carry the labels they had on the panel — `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…`, `Compare with…` — each keeping its trailing ellipsis, and none carries a secondary hint. |
| REQ-8 | The six existing entries are unchanged in every respect but their position: the same relative order (`Run…`, `Tag…`, `Untag`, `Push…`, `Save`, `Remove`), the same labels and ellipses, `Remove` last, in the destructive tone, set apart and carrying `rmi`, the same confirmation in front of it, the same dialogs, the same success and failure feedback and the same list re-read afterwards, and `Untag` and `Push…` still shown disabled in place with their reason on a tagless image. |
| REQ-9 | The menu presents the same ten entries in the same order at every opening, on every image, whatever its tags and whatever else the list holds. An entry that does not apply is shown in place and disabled with a discoverable reason, never removed. |
| REQ-10 | The ten-entry menu is displayed in full wherever its row sits — including the last rows of a long list, inside the scrolled table, and over an open detail panel — and is never clipped by the table, the card, the panel or any scroll container between it and the edge of the viewport. |
| REQ-11 | The menu's established behaviour holds over ten entries: at most one row's menu is open at a time and it is unambiguously attached to its row, opening another row's menu closing the first; it closes on choosing an entry, on `Escape` and on a click outside, returning the focus to the control that opened it; it is fully operable without a pointer; every entry carries a real text label; and no entry ever acts on an image that has taken another's place while the list re-read. |
| REQ-12 | No second menu affordance and no images-specific variant of the existing one: the row's control and its popup remain the shared library's overflow menu, consumed unchanged through the shared row-action group. Neither the menu component nor the row-action group is modified to make this screen work, the images screen contributes no markup and no styling of its own, and anything the library must genuinely gain is generic and usable unchanged by another object list. |

### Part three — four views of the screen, reachable with no panel open (REQ-13 … REQ-22)

| ID | Requirement |
| --- | --- |
| REQ-13 | Each of the four is a view the images screen presents: it opens, shows its content and stays open with no detail panel open anywhere on the screen. Whether a panel happens to be open has no bearing on whether one of the four can be opened, on what it shows, or on whether it stays open. |
| REQ-14 | A flow opened from a row's menu acts on that row's image — whatever image is selected, whatever image an open panel is showing, and however the list re-sorts, re-reads, gains or loses rows afterwards. A panel open on a *different* image does not become the flow's subject. |
| REQ-15 | Opening one of the four opens no detail panel and changes nothing about the selection; closing one closes no detail panel and changes nothing about the selection. A panel the operator had opened is exactly as they left it when the flow closes, and a screen with no panel open still has none. |
| REQ-16 | At most one of the four is open at a time: opening one from the menu closes whichever of them was already open, and two are never on screen together. |
| REQ-17 | Everything the panel supplied to these four beyond the image is preserved: from the efficiency and signals view, choosing a finding still closes it and opens the layer explorer at the layer that finding concerns, with that layer's analysis already primed rather than behind its cost warning; the findings the efficiency view reports still mark the layers that carry them in the layer explorer; and a build-cache cross-reference followed to this screen still opens the layer explorer at the layer it names, on the image it names. |
| REQ-18 | `Escape` is arbitrated in the case the product has not had before — one of the four open with **no panel beneath it**: the open flow holds the innermost claim on the key and consumes it, so nothing underneath is dismissed by it — no detail panel closes behind it, the selection does not change, and nothing on the images list moves. Whether the key also *closes* the flow is `Modal`'s established behaviour — `Escape` closes no dialog in this product — and is **not** changed here: the flow's way out stays the one it has today (REQ-4), and taking it returns the operator to the images list rather than to a panel. Where the order already applied it is unchanged: a panel open under a flow takes the key only once the flow has gone. |
| REQ-19 | **Softened during development on 2026-08-12, by the human's decision, after measurement.** It read: *"Opening and closing one of the four with no panel open leaves the operator's point of interaction somewhere stable in the images list — never lost to the document as a whole, and never on an element that no longer exists."* It now reads: **while one of the four is open with no panel open, the operator's point of interaction is the row control that opened it, and it is never on an element that no longer exists.** Where the point of interaction lands *after* the flow is dismissed is `Modal`'s established behaviour and is **not** constrained by this change: dismissing by the overlay returns it to the document, and the human accepted that as correct — the flow closes and the operator is back on the images list. `Modal` gains no focus handling here. See the settlement recorded in `batches.md`. |
| REQ-20 | None of the four outlives its image: when the image a flow is showing leaves the live list — removed from that very menu, pruned, or removed or re-tagged in the operator's own terminal or by tooling on the machine — the flow resolves itself rather than staying open showing an image that no longer exists. |
| REQ-21 | Nothing about the four flows' own behaviour changes, their caching included: what each computes, displays, streams and costs is what it does today, the analysis cache is hit exactly as it is today, and nothing re-extracts what has already been extracted. |
| REQ-22 | The change adds no overlay surface: nothing joins the interface's enforced blur allow-list, no new blur value appears anywhere, and the conformance check passes with its allow-list unchanged. |

### Part four — `Compare with…` from a row (REQ-23 … REQ-27, REQ-35)

REQ-35 belongs to this part and is numbered last because it was added at the requirements gate, after
REQ-1…REQ-34 were fixed; ids are never renumbered once validated.

| ID | Requirement |
| --- | --- |
| REQ-23 | Started from a row's `Compare with…`, the comparison opens with that row's image already occupying the left-hand operand, and the view states which image that is, by the reference the row shows, so the operator reads which side is theirs rather than inferring it. The right-hand operand starts unchosen. |
| REQ-24 | The second image is chosen inside the comparison view, from the images the product already lists; the menu entry supplies the left-hand side and nothing else. No second selection gesture is introduced on the list: no pick-two mode, no new multi-select, no modal "now choose the other one" state on the table. |
| REQ-35 | The one comparison view the screen presents serves **both** shapes of the operation, and this is a constraint on that view rather than a note about the past: the bulk path supplies **both** operands from two checked rows and opens with both pre-chosen, and the row path supplies **only** the left one, with the right chosen inside the view. Both shapes work, from the same view, in either order and repeatedly, and neither leaks the other's operands into a later opening. The bulk `Compare filesystems…` — its two-checkbox precondition, its pre-chosen pair, and everything it does afterwards — is observably unchanged. |
| REQ-25 | `Compare with…` is shown in place and disabled, never removed, when the list holds no second image to compare with, and the reason it gives states that the dependency is on the list holding a second image — not on anything about the row's own image — so an entry greying out because an unrelated image was deleted does not read as a fault of the row. |
| REQ-26 | That availability is live: it follows images appearing and vanishing from outside the application, and a menu left open across such a change never offers a comparison that has become impossible. |
| REQ-27 | A comparison of an image with itself cannot be started. |

### Verification and standing properties (REQ-28 … REQ-34)

| ID | Requirement |
| --- | --- |
| REQ-28 | Every existing automated check whose control this change removes still drives what it drove, through the surviving route: each check that reached one of the four by first opening the detail panel and clicking its button reaches it through the row's menu entry instead, and keeps asserting the same outcome. None is deleted, skipped or weakened because the control it used to click is gone. |
| REQ-29 | change-3's own coverage survives intact: the six entries with their order, labels, ellipses, tone, `rmi` hint, confirmations and disabled reasons; the row's action area holding one control; the panel's dismissal by re-selecting its row and by `Escape`; the selection not outliving its image; and the search case that must not be confused with it — all still asserted after the menu is reorganised around them. |
| REQ-30 | New coverage exists for the cases that did not exist before: each of the four opened from a row's menu **with no detail panel open**, showing that row's image, and closed again without a panel having opened or closed; and **both shapes of the comparison** (REQ-35) driven against the one view — the row shape with one operand supplied, and the bulk shape with two — the bulk one being the shape least exercised and first to break. |
| REQ-31 | No regression in the images list's live behaviour or responsiveness, at any list length, with a ten-entry menu open or closed: the list keeps updating at the same rate and fidelity on its poll and on daemon events, the per-row control is unchanged, and no per-row surface acquires an overlay treatment or a runtime filter. |
| REQ-32 | The menu stays legible over the glass material across three groups, two separators, the destructive tone and disabled entries in two different groups for two different reasons, meeting the same documented minimum contrast the rest of the application is held to (`plan-docker_management_app/REQ-4`). |
| REQ-33 | No worsening of keyboard or assistive-technology reachability: all ten entries are reachable and activatable from the keyboard alone, each of the four opened with no panel announces what it is, and the point of interaction on opening and on closing such a flow is placed deliberately rather than left to the document. |
| REQ-34 | Nothing else changes. On the images screen: the same toolbar with its pull, load, import and prune actions, the same columns, search, sorting and empty state, the same checkbox column and bulk bar, the same detail-panel contents, the same dialogs, progress, toasts and error reporting, and the same API behind every operation. On the containers screen and everywhere else in the product: nothing at all. Any observable difference beyond the four buttons leaving the panel, the four entries arriving in the menu, and the four flows becoming openable without a panel is a defect of this change. |
