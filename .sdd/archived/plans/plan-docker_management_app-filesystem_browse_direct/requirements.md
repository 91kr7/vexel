---
slug: docker_management_app-filesystem_browse_direct
date: 2026-08-14
spec: .sdd/analysis/docker_management_app-filesystem_browse_direct.md
status: validated
---

# Requirements — Browsing an image's filesystem starts where the decision is

Fix of the delivered product; bug-2 of the human's `bugs.md`. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md); the immediately
upstream sibling, delivered and certified, is
[`plan-docker_management_app-progress_completion_autoclose`](../plan-docker_management_app-progress_completion_autoclose/requirements.md).
Ids are local to this plan: `REQ-1` here is *not* `plan-docker_management_app/REQ-1`.

**One screen is removed, and the flow then has two shapes.** Choosing `Browse filesystem…` on an
image row opens a dialog whose whole body is an empty state offering the same request again. That
screen goes. On an image never extracted, the cost warning becomes the first thing on screen; on an
image whose extraction is still kept, the tree opens directly — no warning about a cost that will
not be paid, and no progress dialog for an operation that never runs.

**The cached entry is a different sequence, not a faster one.** It is the case the report does not
mention and the one where the whole entry ceremony guards nothing. It has its own requirements
(REQ-4, REQ-5, REQ-15) and its own check (REQ-25), and that check asserts a **sustained absence** of
both dialogs — the tree turning up is true with the defect active and certifies nothing.

**This fix sits immediately upstream of bug-1 and must not weaken it.** bug-1's completed caption and
one-second self-dismissal govern every dialog still raised, unchanged; its hardest case — a reused
result that reports no phase and must still state `Completed` — is verified today on the cached
filesystem run, which this fix stops raising a dialog at all. That coverage is relocated, never
deleted (REQ-28).

## F1 — Choosing `Browse filesystem…` opens the filesystem, not an offer to open it

| ID | Requirement |
| --- | --- |
| REQ-1 | The **not-extracted empty state is removed from the product** — its heading `Filesystem not extracted yet`, its paragraph and its `Browse filesystem…` button — not hidden, not relabelled, not made conditional. No surface at any point in this flow presents a control that repeats the request the operator has just made. |
| REQ-2 | When the image's filesystem has **not** been extracted, the **cost warning is the first thing on screen after the row action**. It names the image, states that a container is created from it and never started, and quotes the size and the rough duration — the delivered wording, its numbers and its estimate unchanged. |
| REQ-3 | Confirming that warning runs the extraction exactly as delivered — the shared progress dialog, cancellable, ending with `Completed` and dismissing itself a second later (bug-1, untouched) — after which the tree is on screen marked as freshly extracted. |
| REQ-4 | When the image's filesystem has **already been extracted and the result is still kept**, **no cost warning is shown and no extraction is started**. The operator is taken to the tree, and the surface states that it is showing a reused result, with its entry count, exactly as it does today once the tree is on screen. |
| REQ-5 | **No operation-progress dialog is raised for an open that starts no operation.** On a reused result there is nothing to report progress on, nothing to cancel and nothing whose completion needs announcing beyond the tree's arrival. bug-1's behaviour continues to govern every dialog that *is* raised — every first extraction and every re-extraction. |
| REQ-6 | **While the product determines which of the two shapes applies, the operator is asked for nothing.** If any wait is perceivable, it is a plain loading indication inside the surface being opened, carrying the image's identity — never a prompt, never a button, never an empty state. A wait that requires a gesture is the reported defect in different words. |
| REQ-7 | **Declining the cost warning leaves nothing open and nothing extracted.** The operator is back on the images list with the row action still available; there is no half-opened filesystem surface left to dismiss. |
| REQ-8 | **Cancelling a running extraction returns the operator to the images list**, with the extraction genuinely stopped and the intermediate container removed, as today. It never returns them to a surface offering to start it again. |
| REQ-9 | **A failed extraction states its cause and waits.** It is not auto-dismissed (bug-1's rule, unchanged), it names what went wrong, and it may offer a retry **inside the failure report**. Once dismissed, the operator is on the images list, not in an empty surface. |
| REQ-10 | **`Re-extract…` keeps its cost warning, always** — it deliberately discards a kept result and pays the full cost, so it is the one path where the warning is always true. Its wording, its confirmation and its behaviour are untouched. |
| REQ-11 | **Everything the extracted view offers survives unchanged**: the surface's title naming the image, the freshly-extracted / from-cache indication with its entry count, `Re-extract…`, `Download whole filesystem…`, the scaffolding note, the refused-entries note, search, the tree, the metadata and preview pane, and per-file and per-folder download. |
| REQ-12 | **The corrected behaviour belongs to the action, not to the menu it currently sits in.** There is one code path for "browse this image's filesystem", so any future entry point to it inherits both shapes without repeating the decision. |
| REQ-13 | **"Already extracted" means this image's content, not its tag.** A rebuilt image carrying a familiar tag has never been extracted and is treated as such — warned about, and extracted. The kept results stay keyed by image content, so the direct-to-tree shape can never serve a stale tree. |
| REQ-14 | **If a result believed to be kept turns out not to be readable, the flow degrades to the cost warning, never to a dead end.** Kept results are operator-clearable, so "already extracted" can stop being true between the moment it is decided and the moment the result is read; the operator is then offered the extraction with its cost, not an error with no way forward. |
| REQ-15 | **Opening the same image twice in a row behaves identically the second time**: the first open warns and extracts, and every later open of the same image content goes straight to the tree, for as long as the result is kept. |
| REQ-16 | **The two shapes are decided by a read that costs nothing.** Determining whether a result is kept creates nothing, starts no extraction and touches the daemon not at all. In particular it is **not** implemented by starting an extraction and then suppressing the surfaces once the answer comes back from cache — that would leave the operator's shape decided after the work, which is the delivered behaviour with its screens hidden. |
| REQ-17 | **Nothing on the daemon side changes**: no new Docker operation, no change to what an extraction creates, copies, removes or leaves behind, no change to cancellation, no change to what is kept or for how long. |
| REQ-18 | **No requirement of the reference analysis is weakened.** The cost is still announced before every extraction that actually starts, progress is still shown and still cancellable, the intermediate container is still removed on success, error and cancellation, and results are still kept and reused. The warning is removed from a case that pays no cost, never from one that does. |
| REQ-19 | **No visual element outside the UI library, no raw markup and no styling in feature code.** This fix removes a surface and adds none; the enforced blur allow-list gains no selector and loses none, and `client/scripts/check-ui-conformance.mjs` is not modified and passes. |
| REQ-20 | **Fewer surfaces must not mean less information.** Everything the operator can learn today about this operation — the image it acts on, what it does to the daemon, what it costs, that it is running, that it finished, that a result was reused — is still learnable after the fix. |
| REQ-21 | **Keyboard and assistive-technology operation of the flow is not regressed.** The removed screen held the control a keyboard operator currently lands on; after the change the cost warning is what receives them, properly. The direct-to-tree case leaves the point of interaction somewhere real inside the surface, never on a control that no longer exists. |
| REQ-22 | **Nothing outside this flow is touched**: the images list, the row overflow menu, its entries, their order and their labels (the entry keeps its ellipsis — on a first extraction it still asks for confirmation); the identically shaped `Not analyzed yet` screen on `Efficiency & signals…`, deliberately left to its own report so that a regression on either surface stays attributable; and `Explore layers…` and `Compare with…`, which are not instances of this defect. |
| REQ-23 | An automated check covers **shape A** — an image never extracted: **immediately after the row action** the cost warning is present **and** the removed screen's heading and its `Browse filesystem…` control are absent, asserted at that moment; confirming reaches the tree marked as freshly extracted; and the removed screen is absent at every later point of the flow, never merely at the end. |
| REQ-24 | The same coverage includes **declining** at the warning (nothing open, nothing extracted, the row action still there) and **cancelling** a running extraction (back on the images list, never on a surface offering to start it again). |
| REQ-25 | An automated check covers **shape B** — an image whose result is kept: **no cost warning and no progress dialog appear at all**, asserted as a **sustained absence across the window in which they would have appeared**, together with the tree's arrival and its reused-result marking. "The tree eventually appears" is true with the defect and without it and must not be the assertion that certifies this fix. |
| REQ-26 | **The rewritten reuse contract comes out stronger than the delivered one.** The delivered check proves reuse by asking for the extraction a second time, which after this fix it cannot do; the replacement proves it **without an extraction being requested at all**, and **fails on a product that silently re-extracted every time at full cost** — the failure this fix could otherwise hide for months. |
| REQ-27 | Every check of this fix is driven **through the product's own path with a real pointer at the visible controls' coordinates** — the row's overflow control, the menu entry, the warning's own buttons — never by calling an element's `click()`, never by dispatching an event, and never by aiming at a hidden element behind a control. |
| REQ-28 | **bug-1's cached-run completion coverage is relocated, never deleted.** bug-1 was certified partly on a cached filesystem run — no phase ever reported, and the dialog must still read `Completed` and leave on its own. This fix removes that dialog from that path, so the scenario is re-established on a surface where a reused result **still** raises the dialog (the layer analyses, whose flow is unchanged). Deleting it would retire the coverage that certified the sibling fix, with the suite green. |
| REQ-29 | **The delivered checks that drive the removed screen are rewritten, not dropped** — those that press `Browse filesystem…` inside the surface, that assert the empty state as the place the flow returns to after a cancellation, and that assert it as the state of a re-opened browser before a cached run. The set to rewrite is established by **searching the test tree**, not assumed from the file named in the analysis, and each rewritten spec passes when run on its own. |
| REQ-30 | The new and rewritten checks are **observed failing on the unfixed build**, before the correction exists, and that observation is reported with what failed and how — specifically, that shape A's absence assertion and shape B's sustained-absence assertion both fail on the delivered product. A check never seen red proves only that it passes; this project has already certified one defect behind a check that could not fail. |
| REQ-31 | The verification obeys the project's test discipline against the real daemon: its own fixtures with ownership labels, removed in full (containers with `docker rm -fv`), no assumption of an empty daemon, no inherited application state — the reused-result state is **created by the test itself, within the test** — no test reaching Docker Hub, and every spec passing on its own. |
| REQ-32 | The module indexes and component specs under `.sdd/modules/` are brought into line with what this fix changes: the removed empty state, the two shapes of the entry and where each is decided, the re-homed cancellation and failure fallbacks, and the fact that a reused result raises no progress dialog on this path while it still does on the layer analyses. |
