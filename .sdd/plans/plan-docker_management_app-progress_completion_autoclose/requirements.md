---
slug: docker_management_app-progress_completion_autoclose
date: 2026-08-14
spec: .sdd/analysis/docker_management_app-progress_completion_autoclose.md
status: validated
---

# Requirements — The shared progress dialog says it has finished, then leaves

Fix of the delivered product; bug-1 of the human's `bugs.md`. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md). Ids are local to this
plan: `REQ-1` here is *not* `plan-docker_management_app/REQ-1`.

**One defect, one surface, six users.** The two dialogs the human reported — "Extracting the
filesystem" and "Analyzing layer efficiency" — are the same shared progress surface of the UI
library, and so are four others: "Analyzing layer changesets", "Comparing filesystems", "Loading
tarball", "Importing filesystem tarball". The requirements are written about that surface, not about
the screens that show it.

**The auto-close is deliberately not universal.** It applies to the four analyses, whose result is
already rendered in the view behind the dialog. It does not apply to the two tarball transfers,
whose dialog is the only place the created image references are shown.

**The fix creates a race in the existing coverage, and owns it.** Several delivered e2e checks wait
for `Close` on these dialogs and press it. After this fix that press may land on a dialog that has
already left. REQ-19 is about that, and it is part of this fix rather than a later surprise.

## F1 — The shared progress dialog states completion and dismisses itself

| ID | Requirement |
| --- | --- |
| REQ-1 | The shared progress surface has a **completed state**, distinct from running, failed and cancelled. At the moment an operation ends successfully the caption reads `Completed` and the bar is full, the two agreeing in the same frame. Today the surface distinguishes only running and failed, and a full bar is its sole completion signal. |
| REQ-2 | **No state exists in which the bar is full and the caption names a phase.** This holds on a run served from the analysis cache (no phase was ever reported, and today the caption is left reading `Starting…`), on a fresh run (a last phase was reported, e.g. `Indexing the filesystem…`, `Exporting the image…`, `N of M layers analyzed`), and on a run so fast that the last phase and the completion arrive together. |
| REQ-3 | The completion wording **replaces** the final phase wording rather than being added beside it, and it is `Completed` — the same words on every one of the six surfaces. |
| REQ-4 | The completion wording is defined **once, in the UI library**, and no feature screen supplies a completion wording, a completion state or a completion phrasing of its own. Screens keep supplying their own in-flight phase wording exactly as they do today. |
| REQ-5 | All **six** surfaces show the completed state: extracting the filesystem, analysing layer efficiency, analysing layer changesets, comparing filesystems, loading a tarball, importing a filesystem tarball. The two the human happened to look at are not a smaller scope than the defect. |
| REQ-6 | **One second after `Completed` becomes visible, the dialog closes itself**, with no operator action. The second is counted from the moment completion is *shown*, not from the moment the work internally ended, so the completed caption is actually seen rather than skipped. |
| REQ-7 | The delay is one second, fixed: it is not configurable, not adaptive, and not a function of how long the operation took. |
| REQ-8 | **A failed operation never auto-closes.** The dialog keeps reporting the failure with its cause until the operator dismisses it — including a failure that arrives after some progress has been reported. |
| REQ-9 | **A cancelled operation never auto-closes**, and cancelling closes the dialog immediately, exactly as it does today. |
| REQ-10 | **The dialog stays dismissible by hand throughout that second.** `Close` keeps working and the surface's usual dismissal gestures keep working; an operator who presses `Close` at the same instant as the timer sees exactly one close, no error and no reopening. |
| REQ-11 | **A pending auto-close belongs to the operation that armed it and to nothing else.** If the dialog is dismissed by hand, the view around it is closed, or the operation is started again inside that second, the pending close is abandoned. It never closes a dialog it did not arm — a re-run started inside the window being the realistic case. |
| REQ-12 | **The four analyses auto-close; the two tarball transfers do not.** Loading a tarball and importing a filesystem tarball show `Completed` like the rest and then keep waiting to be dismissed, because their dialog is the only place the references of the images just created are shown. |
| REQ-13 | **When the dialog closes by itself the outcome is what the operator's next look lands on**: the view underneath is revealed intact, showing the extracted tree, the efficiency signals, the changesets or the diff, and the keyboard position is not left on an element that no longer exists — it returns where a manual dismissal would have put it. |
| REQ-14 | **Completion is perceivable without sight**, announced to assistive technology at the moment it happens and without taking focus; and nothing stated only inside the dialog is lost when it leaves, which is the same reason the two result-carrying dialogs are excluded from the auto-close. |
| REQ-15 | **The correction lives entirely inside `client/src/ui/`.** The six consumers are re-pointed at the corrected surface, not re-implemented: none of them gains a timer, a completion caption, raw markup or local styling. No new visual element is introduced, the enforced blur allow-list gains no selector and loses none, and `client/scripts/check-ui-conformance.mjs` is not modified and passes. |
| REQ-16 | **Nothing else about the dialog changes.** Its appearance, size, title, description, in-flight phase wording, controls and cancel behaviour are as delivered. Any visible difference other than the completed caption and the surface leaving on its own is a defect of this fix. |
| REQ-17 | **Nothing on the daemon side changes**: no operation, cost estimate, cost warning, cancellation semantics, cached result or produced object is affected. In particular the cached path — the one that produced the report — keeps serving from the never-evicting analysis cache; it is fixed by being described correctly, not by being made to do work it does not need to do. |
| REQ-18 | An automated check observes the **whole sequence over time** on both reported dialogs — the filesystem extraction and the layer-efficiency analysis: the caption reading `Completed` **while the dialog is still on screen**, and the dialog's **absence afterwards with nothing touched**. A check that only waits for the dialog to be gone, or that asserts the dialog is present and has text, does not satisfy this requirement: all three are true before this fix, after it, and with the defect active. |
| REQ-19 | The check is driven **through the product's own path with a real pointer** — actual clicks at the visible controls' coordinates — never by calling an element's `click()`, never by dispatching an event, and never by aiming at a hidden element behind a control. |
| REQ-20 | Coverage includes the **failure path**: an operation that fails shows the failure and its cause, and the dialog is **still on screen** after the auto-close window has elapsed, leaving only when it is dismissed. |
| REQ-21 | Coverage includes a **result-carrying dialog**: a tarball transfer shows `Completed`, is still on screen after the auto-close window has elapsed, and still shows the references of the images it created. |
| REQ-22 | Coverage includes the **cached path**, which is the run the human reported: a second extraction of the same image, served from cache, shows `Completed` rather than `Starting…` and then leaves on its own. |
| REQ-23 | The new checks are **observed failing on the unfixed build**, before the correction exists, and that observation is reported with what failed and how. A check never seen red proves only that it passes — this project has already certified one defect behind a check that could not fail. |
| REQ-24 | The delivered e2e checks that wait for `Close` on these dialogs and press it — `client/e2e/filesystem-browser.spec.ts` and its siblings — are **updated as part of this fix**, so that none of them races the auto-close this fix introduces. The set to update is established by searching the e2e tree, not assumed from the two files named here, and each updated spec passes when run on its own. |
| REQ-25 | The whole verification obeys the project's test discipline against the real daemon: it creates its own fixtures and removes them (containers with `docker rm -fv`, ownership labels on everything), assumes neither an empty daemon nor an inherited application state, reaches no registry other than the run's own, and every spec passes when run on its own. |
| REQ-26 | The module indexes and component specs under `.sdd/modules/` are brought into line with what this fix changes: the shared surface's completed state and its self-dismissal, which consumers auto-close and which do not, and why the two exclusions exist. |
