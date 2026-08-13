---
request_slug: docker_management_app-progress_completion_autoclose
date: 2026-08-14
type: fix
reference: .sdd/analysis/docker_management_app.md
---

## Request

> images menù > after the file system extraction the status is "starting"!
> how to fix: update the status from "starting" to "completed" and after 1sec from "completed"
> autoclose the popup.
> be carefull! the same problem exists in the popup "Analyzing layer efficiency"! apply the same fix

Reported as bug-1 in `bugs.md`, with `bugs-screen/bug-1.png`. The screenshot shows the "Extracting
the filesystem" dialog for `alpine:3.20`: the progress bar drawn **completely full**, and directly
underneath it the caption still reading **`Starting…`**. The only control offered is `Close` — which
is itself the proof the work has ended, since that control replaces `Cancel` only when the operation
is over. The dialog is therefore telling the operator three contradictory things at once, and then
waiting to be dismissed by hand.

## Reference

Fix of the delivered product analysed in
[`.sdd/analysis/docker_management_app.md`](./docker_management_app.md).

**Starting point.** That analysis specified a Docker management client whose long, expensive image
analyses — extracting an image's filesystem, analysing its layer changesets, measuring its layer
efficiency, comparing two images — must be **announced before they start** (the operator is warned
of the time and temporary disk they will cost), **observable while they run**, and **cancellable**.
That contract is delivered through one shared progress surface, given a different title and a
different phase wording by each screen that uses it. The delivered product honours the first and the
third parts of the contract. What it never states is the fourth, unwritten one: **that the work has
finished.**

**Changes.** This request adds no capability and removes none. It corrects delivered behaviour on
that shared progress surface, in two joined halves: the surface acquires a **completed state it
does not currently have** — the progress bar's fullness is today the only signal of completion, and
the caption beside it contradicts it — and, for the operations whose outcome is revealed *behind*
the dialog, the surface **dismisses itself one second later** instead of waiting for a hand. Nothing
about what any operation does, costs or produces changes.

## Summary

The product's shared progress dialog has no completed state: at the end of the work the bar is
forced full while the caption still shows the wording for a phase that is over or never began — in
the reported case `Starting…`, on a run that had already finished. The operator is told the work has
not begun, the bar says it is done, and the dialog then sits there until dismissed. The correction
is made once, on the shared surface: at completion the caption reads **`Completed`**, and one second
later the dialog closes itself, unless it is reporting a failure or is the only place the operation's
result is shown.

## Business goal

**The product's most expensive operations end by lying to the operator.** These are exactly the
actions the reference analysis said must be handled with care: the operator was stopped beforehand,
shown an estimate in seconds and megabytes, and asked to confirm. Having paid that attention cost,
they are shown a dialog that reports the work as not started. The two readings available to them are
both wrong and both damaging — *"it is stuck, I should cancel"* (there is nothing left to cancel, and
the daemon has already done the work), or *"it failed silently"* (it succeeded, and the result is
sitting behind the dialog). A progress indicator whose final frame is `Starting…` costs more trust
than showing no progress at all, because it is not merely uninformative: it is confidently wrong at
the one moment the operator is looking at it hardest.

**The last step of every one of these operations is manual, and does nothing.** The work is over, the
result is already rendered in the view underneath, and the operator's remaining task is to press
`Close` on a dialog that has nothing left to say. On a cached extraction — the normal case for an
image already browsed, since the analysis cache never evicts by design — the whole dialog exists for
a few hundred milliseconds of loading and then waits indefinitely for that press. Removing a
mandatory gesture that carries no decision is the entire user-facing value of the second half of this
fix.

**One surface, two reports, six places.** The human reported this on the filesystem extraction and,
unprompted, named the layer-efficiency dialog as having "the same problem" — and he is right for a
reason stronger than resemblance: **they are the same surface**, and so are four others. Fixing the
two he happened to look at would leave the identical defect standing on "Analyzing layer changesets",
"Comparing filesystems" and the two tarball transfers, each waiting to arrive later as its own
report. This is precisely the divergence the project's single-UI-library rule exists to prevent, and
it is why this is one fix in the library rather than two fixes on two screens.

## Established findings

Read from the delivered code before writing this analysis, because the answer to *"is this one
defect or two?"* determines the shape of the whole fix. Recorded so a later reader can weigh the
conclusion rather than take it on trust.

| Observation | What was found |
|---|---|
| Are the two reported dialogs the same mechanism, or the same symptom? | **The same mechanism.** Both are the same shared progress dialog of the UI library, differing only in the title and the phase wording each screen supplies. |
| How many places use it? | **Six.** Extracting the filesystem, Analyzing layer efficiency, Analyzing layer changesets, Comparing filesystems, Loading tarball, Importing filesystem tarball. |
| Why the caption is stuck | The shared surface **forces the bar to full at completion but leaves the caption to the screen's own in-flight wording**, which only ever describes a phase in progress. There is no completed wording anywhere in the product. |
| Why `Starting…` specifically, and not a later phase | The reported run was served **from the analysis cache**, so the work reported no phase at all before ending. The "no phase yet" wording — `Starting…` — was therefore both the first and the last thing shown. |
| What the same defect looks like on an uncached run | The final phase wording stays on screen: `Indexing the filesystem…` for an extraction, `Exporting the image…` or `N of M layers analyzed` for the layer analyses. Less alarming than `Starting…`, equally untrue, and never says finished. |
| Is the completion state itself missing, or just mislabelled? | **Missing.** The surface distinguishes running / failed and nothing else; "the bar is full" is the only completion signal it has, which is why the contradiction in the screenshot is possible at all. |
| Where the result of each operation appears | For the four analyses, **behind the dialog**, in the view that opened it. For the two tarball transfers, **inside the dialog** — the created image references are shown there and nowhere else. |

**Conclusion: one defect, one fix, six surfaces** — with the auto-close deliberately not universal,
for the reason in the row above.

## Requirements

### Functional

- **The shared progress surface gains a completed state, and it is stated in words.** At the moment
  the operation ends successfully, the caption reads **`Completed`**. The wording belongs to the
  shared surface, not to any screen, so the six places cannot drift apart — that drift is the whole
  reason this reached the operator on two dialogs at once.
- **No state exists in which the bar is full and the caption names a phase.** This is the reported
  defect written as a checkable condition, and it must hold on a cached run (no phase ever reported),
  on a fresh run (a last phase reported), and on a run so fast the two arrive together.
- **One second after `Completed` becomes visible, the dialog closes itself**, with no operator
  action. The second is counted from the moment completion is *shown*, not from the moment the work
  internally ended, so the completed caption is actually seen rather than skipped.
- **A failed operation never auto-closes.** The dialog keeps reporting the failure, with its cause,
  until the operator dismisses it. An auto-close that swallowed an error message would be a worse
  defect than the one being fixed, and it is the single most likely way to ship one here.
- **A cancelled operation never auto-closes**, and cancelling closes the dialog immediately as it
  does today. Cancellation is already an explicit operator decision with an immediate outcome.
- **The dialog stays dismissible by hand throughout that second.** `Close` keeps working, and the
  usual dismissal gestures keep working. The auto-close is a convenience that removes a pointless
  gesture; it must never become a second's worth of unresponsiveness, and the operator who presses
  `Close` at the same instant must see exactly one close and no error.
- **A pending auto-close belongs to the operation that armed it, and to nothing else.** If the
  operator dismisses the dialog by hand, closes the view around it, or starts the operation again
  within that second, the pending close is abandoned. It must not close a dialog it did not arm — a
  re-run started inside that window being the realistic case.
- **A dialog that is the only place the operation's result is shown states completion but does not
  auto-close.** That is the two tarball transfers, whose completion carries the references of the
  images just created. They gain `Completed` like the rest, and keep waiting to be dismissed,
  because auto-closing them would destroy information the operator has nowhere else to read.
- **The correction covers all six surfaces, not the two that were reported.** The completion wording
  applies everywhere; the auto-close applies to the four analyses, whose outcome is already on screen
  behind the dialog the moment it closes.
- **When the dialog closes by itself, the operator's next look lands on the outcome.** The view
  underneath already shows the extracted tree, the efficiency signals, the changesets or the diff;
  the closing must reveal that view intact, and must not leave the operator's keyboard position on
  something that no longer exists.
- **Completion must be perceivable without sight, and the operator must not be required to read
  within the second.** Completion is announced when it happens, and because the surface is removed
  shortly afterwards, nothing that is only stated in the dialog may be lost with it — which is the
  same reason the two result-carrying dialogs are excluded from the auto-close.

### Non-functional

- **Nothing on the daemon side changes.** No operation, cost, cancellation semantics, cached result
  or produced object is affected. This fix is entirely about what the operator is told and for how
  long.
- **The correction lives in the UI library.** Feature screens supply their own in-flight wording as
  they do today and supply no completion wording of their own; a screen-level completion state would
  be a second definition of the thing that just diverged.
- **No new visual element, no raw markup and no local styling in feature code**, per the project's
  standing UI rule. Nothing joins the blur allow-list: this fix adds no surface.
- **The dialog's appearance, size, title, description, phase wording, controls and cancel behaviour
  are otherwise untouched.** Any visible difference other than the completed caption and the surface
  leaving on its own is a defect of this fix.
- **Verified in the delivered product against the real daemon**, under the project's test discipline:
  own fixtures, full cleanup, no assumption of an empty daemon or of inherited application state,
  every spec passing on its own.
- **English only**, per the project's convention.

## What the operator must observe, in order

The outcome is verifiable only as a sequence in time, so it is stated as one:

1. The operator confirms the cost warning; the dialog appears with the operation's title and the
   image named, `Cancel` offered.
2. While the work runs, the caption describes what is happening and `Cancel` stays available.
3. At the moment the work ends, **the caption reads `Completed`** and the bar is full — the two
   agreeing, in the same frame. `Close` is offered.
4. With **nothing touched**, about a second later, **the dialog is gone**.
5. The view underneath is showing the result of the operation that just ran.
6. If instead the operation fails: the failure and its cause are shown, the dialog **stays**, and it
   leaves only when the operator dismisses it.

**How this must be checked, explicitly and for the record.** A check for this has to observe the
**real sequence over time** — the caption's text *at completion*, and the dialog's *absence*
afterwards — driven through the product's own path, with a real pointer on the real controls, never
by calling an element's `click()` or dispatching events. This is not a stylistic preference: the
project's rule on what a check drives and what it measures (`CLAUDE.md`) was paid for by exactly that
mistake, where content-only assertions and programmatic activation passed twice over a shipped
defect. A timing-dependent close is precisely the class of behaviour a content-only assertion passes
on — "the dialog has a heading and some text" is true before the fix, true after it, and true with
the defect active. What must be asserted is **which words, at which moment, and that the surface is
gone without a hand on it.**

## Assumptions

Every gap the report leaves is closed here with a default and its reason; none is returned as a
question, the human having delegated the detail.

- **This is a fix, not an evolution.** The delivered behaviour is wrong on its own terms — a full bar
  captioned `Starting…` — the cause is identified, and the corrected behaviour is stateable and
  checkable. No capability is added.
- **`Completed` is the wording, and it is the same everywhere.** It is the human's own word, it is
  unambiguous, and one wording for all six surfaces is what stops them diverging again. Per-screen
  completion phrasings ("Extraction complete", "Analysis complete") were rejected on that ground: the
  variation buys nothing the title above it does not already say.
- **The completion wording replaces the final phase wording rather than sitting beside it.** At the
  end of a fresh extraction the caption goes from `Indexing the filesystem…` to `Completed`, and the
  layer analyses lose their final `N of N layers analyzed` in the same way. The count is informative
  while the work runs and redundant once it is over, and the surface is about to close.
- **One second, literally, as requested.** Not tuned, not made configurable, not turned into a
  variable of the operation's length. The human named a value; there is no evidence justifying a
  different one, and inventing one would be a decision made against his stated intent.
- **The auto-close is not suspended for an operator who is "interacting".** At completion these four
  dialogs offer exactly one control — `Close` — whose effect is identical to what the timer is about
  to do, so there is no interaction the close can interrupt and no unsaved decision to protect. What
  is guaranteed instead is the weaker and sufficient thing: the manual dismissal keeps working
  throughout, and it wins if it lands first.
- **The four analysis dialogs may close on their own; the two tarball transfers may not.** Decided on
  where the operation's result lives (see Established findings), not on how the six were grouped in
  the report. An auto-close is safe exactly when it hides nothing.
- **An operation that completes almost instantly still shows the dialog, and it still leaves after a
  second.** A cached extraction will therefore appear and disappear inside roughly a second and a
  half. Accepted rather than special-cased: suppressing the dialog on a fast path would mean the
  operator sometimes gets no confirmation at all that anything happened, and the outcome is on screen
  behind it either way.
- **The report describes one defect on one shared surface, so the fix is applied to all six of its
  users.** This is not scope widening: it is the smallest change that makes the reported statement
  true, since there is only one place to make it.
- **Existing checks that dismiss these dialogs by hand will be updated as part of this fix.** They
  press `Close` on a dialog that is about to leave on its own, which is a race the fix creates and
  therefore owns.

## Constraints

- **One visual language, defined in exactly one place.** The completion state is added to the shared
  surface in the UI library; no screen may carry a local version of it.
- **The main view pays nothing for the glass.** The project's standing performance rule is untouched:
  no new surface, nothing added to the blur allow-list.
- **The cost warning, the cancellation contract and the never-evicting analysis cache are delivered
  behaviour and stay exactly as they are.** In particular, the cached path is the one that produced
  the report, and it must keep serving from cache — it is fixed by being *described* correctly, not
  by being made to do work it does not need to do.
- **A self-dismissing surface must not be the sole carrier of any information.** This constrains
  which dialogs may auto-close, and it is the reason two of the six do not.
- **The suite runs against the operator's own daemon**, so verification obeys the project's fixture
  rules: it creates what it needs, removes it, assumes nothing about prior state, and passes on its
  own.
- **The behaviour is time-dependent, so any check of it must be able to fail.** A check that only
  waits for the dialog to be gone would pass on a product that closed it instantly, or never showed
  the completed caption at all; both intermediate states have to be asserted.

## Market trends

Relevant, and consulted narrowly — not on the competitive landscape, but on the one design question
this fix turns on, which is settled in published practice and turns out to cut **both ways**. That
matters here, because it is the difference between the human's instruction being applied literally
everywhere and being applied where it is safe.

- **A success dialog for an *unattended* process should require explicit dismissal.** Nielsen Norman
  Group is direct about it: *"Make use of modals for success dialogs occurring after long waits (i.e.,
  do not allow them to disappear without explicit user interaction)"*, because *"users are likely not
  paying attention to or thinking about these processes as they continue their work."* That case is
  the argument **against** an auto-close — and it applies squarely to the two tarball transfers,
  whose completion carries the created image references. It does **not** apply to the four analyses:
  the operator has just confirmed a cost warning and is watching a bar for a handful of seconds, the
  wait is attended, and the outcome is already rendered behind the dialog. This is the published
  reason for the split adopted above, rather than taste.
  ([NN/g — Designing for Long Waits and Interruptions](https://www.nngroup.com/articles/designing-for-waits-and-interruptions/))
- **Progress feedback is worth having only while it is truthful, and stale feedback is noise.** The
  same body of research is why the product shows these bars at all — users shown a dynamic progress
  indicator tolerate far longer waits — and it is the same argument for not leaving a finished
  indicator on screen saying something untrue.
  ([NN/g — Progress Indicators Make a Slow System Less Insufferable](https://www.nngroup.com/articles/progress-indicators/))
- **Completion is a status message, and status messages must reach assistive technology without
  stealing focus.** WCAG 4.1.3 covers exactly this case — information about "the success of an
  action" or the progress of a process — requiring that it *"can be presented to the user by
  assistive technologies without receiving focus."* A completion the sighted operator reads and the
  screen-reader user does not would be this fix half-delivered.
  ([W3C — Understanding SC 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html))
- **A time limit is a problem when the user must react within it.** WCAG 2.2.1 governs time limits
  *set by the content* that the user has to act inside of. The one-second close is deliberately kept
  outside that category: no decision is required inside it, the manual dismissal remains available,
  and everything the dialog states at completion — beyond the word itself — is also visible in the
  view behind. The result-carrying transfers are excluded precisely so that this stays true.
  ([W3C — Understanding SC 2.2.1 Timing Adjustable](https://www.w3.org/WAI/WCAG21/Understanding/timing-adjustable.html))

## Risks

- **The auto-close swallows a failure.** The single worst outcome available here: an operation fails,
  the dialog leaves on its own, and the operator is looking at a view with no result and no
  explanation — a silent failure, strictly worse than the defect being fixed. The failed state must
  be excluded explicitly, not left to whether the completion path happens to be reached.
- **The auto-close swallows a result.** Same shape, quieter: the tarball dialogs report the created
  image references and nothing else does. An auto-close applied uniformly "because the human said
  apply the same fix" destroys them.
- **The timer outlives its dialog.** The operator dismisses by hand, or re-runs the operation, inside
  that second; a pending close then fires on the next dialog, or on nothing, closing a surface the
  operator had just deliberately opened. This is the most likely functional regression of the fix.
- **Only the two reported dialogs are fixed.** The report names two; the surface has six. Fixing what
  was looked at closes this report and leaves four future ones, each arriving as "the status is still
  wrong here too".
- **The check passes on a product that is still broken.** A content-only assertion — the dialog is
  present, the dialog has text — is true before this fix, true after it, and true with the defect
  active. So is an assertion that only waits for the dialog to vanish. Both halves of the sequence
  have to be observed: the caption *at* completion, and the absence *after* it, through the product's
  own path with a real pointer. This project has already shipped one certified defect behind exactly
  the weaker form.
- **The existing checks start racing.** Several current checks wait for `Close` and press it; after
  this fix the press may land on a dialog that has already gone, or on whatever now occupies those
  coordinates underneath. They must be updated with the fix, not left to fail intermittently and be
  re-run.
- **The completed caption is never actually seen.** If the second is counted from the internal end of
  the work rather than from the caption becoming visible, the operator gets a flash or nothing at
  all — the defect fixed on paper and unchanged in practice.
- **Completion is announced only visually.** The surface leaves in one second; a screen-reader user
  who is not told about the completion in that window learns nothing from it at all.

## Scope

**In scope**

- Adding a completed state to the product's shared progress dialog, captioned `Completed`, defined
  once in the UI library and used by all six surfaces that show it.
- Closing that dialog automatically one second after completion is shown, for the four analysis
  operations — extracting the filesystem, analysing layer efficiency, analysing layer changesets and
  comparing filesystems — whose result appears in the view behind it.
- Excluding failures and cancellations from the auto-close entirely, and excluding the two tarball
  transfers, which state completion and wait to be dismissed because the dialog is where their result
  is shown.
- Keeping manual dismissal available and authoritative throughout the second, and making sure a
  pending close cannot act on anything other than the dialog that armed it.
- Making completion perceivable to assistive technology at the moment it happens.
- Verification that observes the whole sequence over time on both reported dialogs — the caption at
  completion, the surface's disappearance without a hand on it, and the failure path staying open —
  driven through the product's own path with a real pointer, together with updating the existing
  checks that press `Close` by hand.

**Out of scope**

- Any change to what these operations do, cost, produce or cache, and to the cost warning shown
  before they start.
- Any redesign of the progress dialog's appearance, layout, sizing or controls.
- Making the delay configurable, adaptive, or dependent on the operation's duration.
- Replacing the completion dialog with any other notification mechanism.
- The other reports in `bugs.md` — bug-2, bug-3, bug-4 and bug-5 — each taken separately in its own
  analysis. bug-2 concerns the same entry path as the extraction dialog and is still not folded in
  here: this fix changes what that dialog says at the end, not how it is reached.
