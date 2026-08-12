---
slug: docker_management_app-image_row_actions
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-image_row_actions.md
status: validated
---

# Requirements — The images row's actions move into one menu, and the image panel closes by its row

Evolution of the existing product. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md); the images list, its
six row actions and its detail panel were delivered there. Two merged predecessors are the starting
state and are reused rather than reproduced:
[`plan-docker_management_app-container_row_actions`](../plan-docker_management_app-container_row_actions/requirements.md)
(change-1 — the shared overflow menu and the trailing overflow slot) and
[`plan-docker_management_app-container_detail_close`](../plan-docker_management_app-container_detail_close/requirements.md)
(change-2 — the panel's `dismissal` variant and the `Escape` arbitration).

Requirements are observable, individually verifiable behaviours. Ids are local to this plan: `REQ-1`
below is *not* `plan-docker_management_app/REQ-1`. Requirements of other plans are always cited with
their path prefix.

Visual reference: `bugs-screen/change-3.png`, and it shows the **current** state, not a target. It is
normative only for *which* controls are meant — the six-button strip at the end of an images row, and
the round `✕` on the image detail panel. No arrangement is read off it.

**One feature, one batch, two separately verifiable halves.** The halves below touch different
surfaces — the row's action area and the panel's close control — and neither is a precondition of the
other, so a failure in one is attributable to one: half one is REQ-1 to REQ-19, half two is REQ-20 to
REQ-31. They are one feature because they are one change to one screen, sharing its screen component,
its `Escape` arbitration and its verification; splitting them into two batches would split a feature
by surface and make the second batch's acceptance depend on re-reading the first's.

## F1 — The images row's actions move into one menu, and the image panel closes by its row

### Half one — the row's actions (REQ-1 … REQ-19)

| ID | Requirement |
| --- | --- |
| REQ-1 | The action area at the end of an image row holds exactly one control — the one that opens the row's menu — and no other action-bearing control or action-bearing glyph appears anywhere on the row. |
| REQ-2 | Every image row carries that control, in the same final position, in every state of the image — tagged, multi-tagged or dangling. It is never conditional, never revealed on hover, and never the control that moves. |
| REQ-3 | The control reads unmistakably as "there is more here": it carries an accessible name identifying the image whose row it belongs to, and announces that it opens a menu and whether that menu is currently open. |
| REQ-4 | The menu lists exactly six entries, in this order: `Run`, `Tag`, `Untag`, `Push`, `Save`, `Remove` — no operation added, none taken away. |
| REQ-5 | `Remove` is shown in the interface's destructive tone and set apart, as a group, from the five entries above it — the same treatment change-1 established for `Kill` and `Remove` on the container menu. |
| REQ-6 | `Remove` carries `rmi` as secondary text alongside its label. No other entry carries a secondary hint: the remaining labels are the CLI verbs already. |
| REQ-7 | Entry labels are human-readable, and the ellipsis convention is applied to what each operation actually does: an entry that opens a form or asks for a value before it acts carries a trailing ellipsis, and an entry that acts at once or only asks for a confirmation does not. Applied to the flows as they exist, and leaving the row's order untouched: `Run…`, `Tag…`, `Untag`, `Push…`, `Save`, `Remove` — `Run…`, `Tag…` and `Push…` carry an ellipsis, `Untag`, `Save` and `Remove` do not. |
| REQ-8 | `Untag` and `Push` are shown in place and disabled, never removed, when the image has no tags; the menu presents the same six entries in the same order at every opening, on every image, whatever its tags. |
| REQ-9 | Why a disabled entry is unavailable is discoverable from the interface: an operator can tell "not for this image, because it has no tags" from "this entry is broken". |
| REQ-10 | Every operation reachable from the row before this change is reachable after it, from its menu entry, and does exactly what it did: `Run…` opens the create-and-run form pre-filled with the image's reference (its short id when dangling); `Tag…` opens the reference dialog, tags, reports success and re-reads the list; `Untag` untags at once when the image has a single tag and opens the choice dialog when it has several; `Push…` opens the reference dialog and shows per-layer upload progress to its end; `Save` starts the browser download of the tarball and reports it; `Remove` confirms, removes and re-reads. Same effect, same dialogs, same success and failure feedback. |
| REQ-11 | The confirmation in front of `Remove` is unchanged: standing behind a menu is an added step, never a substitute for it. |
| REQ-12 | At most one row's menu is open at a time, it is unambiguously attached to the row it belongs to, and opening another row's menu closes the first. |
| REQ-13 | The menu closes on any dismissal — choosing an entry, `Escape`, clicking outside it — and returns the operator where they were, the focus going back to the control that opened it. |
| REQ-14 | An open menu is displayed in full wherever its row sits, including the last rows of a long list and inside the scrolled table, and is never clipped by the table, the card or any scroll container between it and the edge of the viewport. |
| REQ-15 | The menu is fully operable without a pointer, in the conventional way for a control of this kind, and every entry carries a real text label — no icon-only entry. |
| REQ-16 | An entry never acts on an image other than the one whose row it belongs to, while the images list re-reads, re-sorts, gains rows and loses them — whether the change came from this application, from the operator's own terminal or from any tooling on the machine. |
| REQ-17 | No second menu affordance is introduced and no images-specific variant of the existing one: the row's control and its popup are the shared library's overflow menu, consumed through the trailing overflow slot of the shared row-action group exactly as the containers row consumes them. The images screen contributes no markup and no styling of its own, and anything the library must gain to serve this screen is generic and usable unchanged by another object list. |
| REQ-18 | The width the six buttons held returns to the data: the row's action column is sized for the single control it now carries rather than left at the width of six buttons, and the images table's own columns — repository and tag, id, platform, size, creation time — take that width back. The sizing value is a design token of the UI library, not a value written on the screen. |
| REQ-19 | The images list's multi-selection is untouched: the leading checkbox column, the bulk action bar and its `Save to tarball…` and `Compare filesystems…` actions behave exactly as before, and none of them moves into the row's menu. |

### Half two — the panel's close control (REQ-20 … REQ-31)

| ID | Requirement |
| --- | --- |
| REQ-20 | The image detail panel presents no close control: the round `✕` is gone from the rendered interface — not hidden, not disabled, not moved elsewhere on the panel — and no replacement dismissal affordance appears in its place: no collapse link, no chevron, no rendered keyboard hint. |
| REQ-21 | The panel keeps its four actions unchanged: `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…` and `Compare with…`, in the same order, with the same behaviour, including `Compare with…` being unavailable when there are fewer than two images to compare. |
| REQ-22 | Selecting the already-selected image row closes the panel, and this is covered by the product's automated verification rather than merely being true. |
| REQ-23 | Selecting a *different* image row leaves the panel open and re-points it at the newly selected image. |
| REQ-24 | `Escape` closes the open image detail panel, from wherever the focus sits inside the panel's own contents — a section, a field or a control reached by `Tab` alone — so a keyboard user can leave without a pointer. |
| REQ-25 | `Escape` is arbitrated innermost-first on this screen: while a row's overflow menu is open it closes the menu only and the panel stays open, a second `Escape` then closing the panel; and while any dialog or flow opened from the panel or from the menu is open — the layer explorer, the efficiency and signals view, the filesystem browser, the comparison, the create-and-run form, the tag, untag and push dialogs, the remove confirmation — the panel is not dismissed behind it. What each of those does with the key itself is its existing behaviour and is not changed here. |
| REQ-26 | `Escape` acts on the panel only while a panel is open; with no panel open it changes nothing about what is selected, searched, filtered or displayed on the images screen. |
| REQ-27 | When the panel is dismissed by `Escape`, the operator's point of interaction is left somewhere stable in the images list — never on an element that no longer exists, and never lost to the document as a whole. |
| REQ-28 | An open panel's bond to its row is visible without acting: the owning row is distinguishable from every other row as the one whose panel is open. It is the only remaining cue that the row is the way back. |
| REQ-29 | The panel never outlives its row, and the selection does not outlive the image. When the image owning an open panel leaves the list — removed from the menu of that very row, or removed, pruned or replaced by a prune, a build or a `docker rmi` elsewhere on the machine — nothing is left on screen with no way out, **and** the selection is cleared with it. The second half is not cosmetic: an image's id is a digest of its content, so pulling or building the same content again reproduces the same id, and a selection that outlived the removal makes the panel spring open by itself, for a reason the operator cannot see and did not ask for. |
| REQ-30 | Searching does not destroy a selection, and is the case REQ-29 must not be conflated with: when the row owning an open panel is excluded by the list's search, its row and its panel are simply not rendered — nothing is stranded on screen — the selection is kept, and the panel reappears unchanged when the image re-enters the filtered list. An image still on the daemon but hidden by a search has not left the list in REQ-29's sense. |
| REQ-31 | The shared detail panel's existing presentation variant is what selects this: the images panel asks for the presentation without a close control, through the component's public contract. No new variant, no images-specific panel, and the containers panel's presentation is unaffected. |

### Both halves — verification and standing properties (REQ-32 … REQ-37)

| ID | Requirement |
| --- | --- |
| REQ-32 | Every existing automated check whose control this change removes still drives what it drove, through the surviving route: the checks that clicked one of the six row buttons reach that operation through its menu entry, and the checks that closed the image detail panel by its `Close detail` control close it by re-selecting its row or by `Escape`. None is deleted, skipped or weakened because the control it used to click is gone. |
| REQ-33 | The images list keeps updating at the same rate and with the same fidelity as before — on its poll and on `image` daemon events — including while a row's menu is open. |
| REQ-34 | The list's responsiveness does not regress at any list length: the per-row control costs no more than the six buttons it replaces, and no per-row surface computes a runtime blur or any other backdrop filter. |
| REQ-35 | The change adds no overlay surface: nothing joins the interface's enforced blur allow-list, no new blur value appears, and the conformance check passes with its allow-list unchanged. |
| REQ-36 | The menu's labels, its destructive tone, its `rmi` hint, its disabled entries and their reasons stay legible where this screen opens it — over dense image data on the glass material — meeting the same documented minimum contrast the rest of the application is held to (`plan-docker_management_app/REQ-4`). |
| REQ-37 | Nothing else about the images screen changes: the same toolbar and its pull, load, import and prune actions, the same columns, search and empty state, the same panel contents, the same dialogs, the same progress, toasts and error reporting, and the same API behind every operation. Any observable difference beyond the six actions moving into the menu and the `✕` leaving the panel is a defect of this change. |
