---
request_slug: docker_management_app-filesystem_browse_direct
date: 2026-08-14
type: fix
reference: .sdd/analysis/docker_management_app.md
---

## Request

> images menù > action "browse filesyste".
> everytime the popup "Filesystem not extracted yet" is showed!
> how to fix: i don't like this popup because it's obvious that the filesystem of an image is not
> extracter yet so don't show this popup and show immediatelly the popup that contains the text
> "Extracting the filesystem creates a container from the image (never started) and copies out about
> ***MB, taking roughly 5s."!

Reported as bug-2 in `bugs.md`, with `bugs-screen/bug-2.png`. The screenshot carries what the text
does not: the operator chose `Browse filesystem` on the `alpine:3.20` row, and what opened is a
**large dialog titled `Filesystem — alpine:3.20` whose entire body is an empty state** — the heading
`Filesystem not extracted yet`, a paragraph explaining that no process from the image is ever run,
and a single button labelled `Browse filesystem…`. That button is the same request the operator has
just made, on the same image, one gesture earlier. The dialog's first and only screen asks the
operator to repeat themselves, and its paragraph says in other words what the cost warning behind
that button already says.

## Reference

Fix of the delivered product analysed in
[`.sdd/analysis/docker_management_app.md`](docker_management_app.md). The immediately upstream
sibling, already delivered and certified in this same tranche, is
[`docker_management_app-progress_completion_autoclose.md`](docker_management_app-progress_completion_autoclose.md)
(bug-1); the two surfaces meet, and the boundary between them is drawn explicitly below. The entry
point this report starts from — the image row's overflow menu — is the one established by
[`docker_management_app-image_row_actions.md`](docker_management_app-image_row_actions.md) and
[`docker_management_app-image_row_actions-panel_actions_to_menu.md`](docker_management_app-image_row_actions-panel_actions_to_menu.md).

**Starting point.** The reference analysis made runtime-independent filesystem inspection a stated
differentiator of the product: any image's fully merged, post-union filesystem must be browsable as
a tree without running the image, identically for a distroless or `scratch` image, by creating a
container from it that is **never started**, copying its filesystem out and removing the container
again. Because that costs real time and real temporary disk, it also required the operator to be
told the expected cost **before the extraction starts**, to see progress while it runs, and to be
able to cancel it. And because the cost is genuine, it required the result to be **kept and reused**
when the same image content is inspected again, rather than recomputed. The delivered product
honours all of that. What it also does — asked for by nothing in the reference analysis — is put a
screen in front of it whose only content is an invitation to ask for the thing the operator already
asked for.

**Changes.** This request removes one surface from one flow and adds nothing. Choosing
`Browse filesystem` on an image row stops opening a *prompt to browse the filesystem* and instead
does what it says: if the image's filesystem has never been extracted, the **cost warning is the
first thing on screen**, exactly as the human asks; if it has already been extracted, the operator
is taken **straight to the tree**, because there is no cost to warn about and asking permission to
spend five seconds that will not be spent would be a new untruth in place of an old redundancy.
Nothing changes about what an extraction does, what it costs, what it produces, how it is cancelled,
what is cached, or what the progress dialog says while it runs and when it ends.

**Boundary with bug-1, stated so it cannot be blurred.** bug-1 fixed what the shared progress dialog
says *at the end* of the work and how it leaves. This fix changes *how that dialog is reached* and,
in one case, whether it is raised at all. bug-1's completed caption and one-second self-dismissal
stay exactly as delivered on every dialog that is still raised, and this fix must not weaken the
verification bug-1 was certified against — see the requirement on relocated coverage below.

## Summary

Choosing `Browse filesystem` on an image row opens a dialog whose whole body is an empty state
offering a `Browse filesystem…` button — the operator is made to ask twice. That screen goes. On an
image never extracted before, the cost warning appears immediately and the flow is one dialog
shorter; on an image already extracted, the tree appears directly, with no warning about a cost that
will not be paid.

## Business goal

**An operator who has chosen an action should not be asked to choose it again.** The entry cost of
inspecting an image's filesystem is currently three deliberate gestures before a single byte is
read: choose the row action, press a button that repeats it, confirm the cost. The middle one
carries no decision, offers no alternative and reveals no information the next screen does not state
better. It is pure ceremony in the flow the product treats as one of its differentiators, and the
human's reaction to it — *"it's obvious that the filesystem of an image is not extracted yet"* — is
the correct diagnosis: the screen states the one thing the operator could have deduced from having
just requested the extraction.

**The removed screen is a confirmation that confirms nothing, in front of one that confirms
something real.** The product genuinely does need to warn before an extraction — it creates a
container, copies out hundreds of megabytes on a large image and takes seconds — and that warning
earns its interruption. Putting an unearned interruption directly in front of it is the fastest way
to devalue the earned one: the operator learns that this flow answers a question before doing
anything, and starts clicking through both at the same speed. Removing the empty one is what keeps
the costly one worth reading.

**The cached case is where the real value is, and it is the case the report does not mention.** The
product deliberately keeps extraction results across restarts and reuses them for the same image
content. In that state the whole entry ceremony guards nothing: no container is created, nothing is
copied, nothing takes five seconds. Today the operator still passes the empty state, still reads a
warning quoting megabytes and seconds that will not be spent, and still watches a progress dialog
for an operation that never runs. Browsing an image a second time should feel like opening
something already there, because that is exactly what it is — and that is the promise the
never-evicting result cache was built to make.

**A read should not look like a write.** Browsing an image's filesystem changes nothing: no image,
no tag, no container is touched, and the intermediate container never runs. Two dialogs in front of
a read teach the operator that this action is dangerous, on a product whose stated purpose is to
make Docker's own `create` + `cp` trick — the thing an expert does at a terminal in one line —
approachable. The interface should cost less than the command it replaces.

## Established findings

Read from the delivered product before writing this analysis, because the report describes only the
first entry into an empty flow and the correct fix depends on what the *second* entry does.
Recorded so a later reader can weigh the conclusions rather than take them on trust.

| Question | What was found |
|---|---|
| The exact chain of surfaces, from row action to tree | Four, in this order: **(1)** the image row's overflow menu entry `Browse filesystem…`; **(2)** the **filesystem browser surface** — a large dialog titled `Filesystem — <tag>`, which owns the whole flow; **(3)** inside it, the **not-extracted empty state** (heading, paragraph, `Browse filesystem…` button) — the reported screen; **(4)** the **cost warning**, and then **(5)** the shared **progress dialog** (`Extracting the filesystem`), after which the browser surface shows the tree. Only (3) is removed. |
| Which component owns each step | The images screen owns (1) and opens (2); the **filesystem browser** feature component owns (2), (3), and the raising of (4) and (5); (4) and (5) are shared UI-library dialogs — the confirmation dialog and the progress dialog bug-1 fixed — used with feature-supplied wording. |
| Is `Browse filesystem` reachable from more than one place? | **No — exactly one entry point today:** the image row's overflow menu. The image detail panel's four analysis buttons were moved into that menu by `image_row_actions-panel_actions_to_menu`, so no second route exists. The corrected behaviour is nevertheless required of the *action*, not of the menu, so any future entry point inherits it. |
| Where the warning's numbers come from, and when they are known | From the **image's own size**, already carried by the images list row and visible in its `SIZE` column (`13.0MB` in the screenshot). Both the size and the derived duration are therefore **fully known at the instant the row action is chosen**; nothing has to be fetched, computed or waited for. There is no "spinner with no numbers" state to fall into. |
| What happens when an extraction is already cached | Today: **exactly the same three screens.** The client does not ask whether a result exists; it shows the empty state, takes the confirmation, opens the progress dialog, and only then does the server answer from cache — which is why the run in bug-1's screenshot reported no phase at all. The reuse is real and is contracted by an existing check, but it is invisible until after the operator has paid for it twice. |
| Can "already extracted" be known before doing any work? | **Yes.** The server decides it from an in-memory index lookup keyed by image content, before creating anything and before touching the daemon. It is a question with an instant answer, not an operation. |
| Is the cache keyed by tag or by content? | By **image content**. A rebuilt image reusing the same tag is a different key, so it is correctly *not* cached — the "already extracted" answer can never serve a stale tree for a changed image. |
| What else that empty state was carrying | Four things: its **heading**; its **paragraph** ("No process from this image is ever run…"), whose guarantee is **already stated in the cost warning** it introduces ("creates a container from the image (never started)"); the **only control that starts an extraction**; and — less obviously — the state the flow **falls back to** when the operator cancels the progress dialog or an extraction fails. The last is the only one that needs a decision (taken below); the others are redundant or removed by intent. |
| What it was *not* carrying | The surface's **title**, the **`Re-extract…`** affordance and the **`Download whole filesystem…`** control all belong to the browser surface or to its extracted view, not to the empty state, and are untouched by its removal. There is no route, deep link or persisted state attached to it. |
| Whether the same shape exists elsewhere | **Yes, once**: `Efficiency & signals…` opens a surface whose whole body is a `Not analyzed yet` empty state with an `Analyze layer efficiency…` button. `Explore layers…` and `Compare with…` are **not** the same case — the first shows the layer stack the operator asked for and offers changeset analysis as an optional deepening within a populated view; the second cannot start until the operator picks a second image. The one genuine sibling is recorded here and deliberately left out of scope. |

**Conclusion: one screen is removed from one flow, and the flow then has two shapes** — warn then
extract when there is nothing cached, open directly when there is.

## Requirements

### Functional — the flow

- **Choosing `Browse filesystem` on an image row never presents a screen whose content is an offer to
  browse that image's filesystem.** The heading `Filesystem not extracted yet`, its paragraph and its
  `Browse filesystem…` button are removed from the product, not hidden or relabelled. No surface at
  any point in this flow may present a control that repeats the request just made.
- **When the image's filesystem has not been extracted, the cost warning is the first thing the
  operator sees after the row action.** It names the image, states that a container is created from
  it and never started, and quotes the size and the rough duration — the wording the human quoted,
  unchanged.
- **When the image's filesystem has already been extracted, no cost warning is shown and no
  extraction is started.** The operator is taken to the tree, and the surface states that it is
  showing a reused result, exactly as it does today once the tree is on screen. Warning about a cost
  that will not be paid would replace a redundant screen with a false one.
- **No operation-progress dialog is raised for an open that starts no operation.** A reused result is
  a read, not a run: there is nothing to report progress on, nothing to cancel, and nothing whose
  completion needs announcing beyond the tree's arrival. This does not touch bug-1's behaviour, which
  continues to govern every dialog that *is* raised — every first extraction and every re-extraction.
- **While the product determines which of the two shapes applies, the operator is never asked for
  anything.** If any wait is perceivable at all, it is a plain loading indication inside the surface
  being opened, carrying the image's identity — never a prompt, never a button, never an empty state.
  A wait that requires a gesture is the reported defect wearing a different hat.
- **Declining the cost warning leaves nothing open and nothing extracted.** The operator returns to
  the images list, where the row action remains available. There is no half-opened filesystem surface
  to dismiss afterwards, because the surface has nothing to show.
- **Cancelling a running extraction returns the operator to the images list**, with the extraction
  genuinely stopped and the intermediate container removed, as it is today. It must not return them
  to a prompt that offers to start it again — that prompt is the thing being removed, and re-entering
  the flow is one gesture away on the row.
- **A failed extraction states its cause and waits.** The failure is not auto-dismissed (bug-1's
  rule, unchanged), it names what went wrong, and it may offer a retry **inside the failure report**.
  A retry offered there is a response to something that happened; a start button offered before
  anything happens is not. Once dismissed, the operator is back on the images list.
- **`Re-extract…` keeps its cost warning, always.** It is the one path that deliberately discards a
  reused result and pays the full cost even when one exists, so it is the one path where the warning
  is always true. Its wording, its confirmation and its behaviour are untouched.
- **Everything the extracted view offers survives unchanged**: the surface's title naming the image,
  the freshly-extracted / from-cache indication with its entry count, `Re-extract…`,
  `Download whole filesystem…`, the scaffolding note, the refused-entries note, search, the tree, the
  metadata and preview pane, and per-file and per-folder download.
- **The never-started guarantee remains stated where the operator decides.** It is in the cost
  warning already; it is not to be re-added as a separate screen, and it must not be lost from the
  warning. For a distroless or `scratch` image this sentence is the reassurance that makes the
  feature trustworthy.
- **The corrected behaviour belongs to the action, not to the menu it currently sits in.** Any future
  entry point to browsing an image's filesystem behaves identically.

### Functional — correctness of the two shapes

- **"Already extracted" must mean this image's content, not its tag.** A rebuilt image carrying a
  familiar tag has never been extracted and must be treated as such — warned about, and extracted.
- **If a result believed to be present turns out not to be usable, the flow degrades to the cost
  warning, never to a dead end.** The operator may clear the kept results, and they may be cleared
  between the moment the product decides "already extracted" and the moment it reads them. The
  operator must then be offered the extraction with its cost, not left with an error and no way
  forward.
- **Opening the same image twice in a row behaves identically the second time.** The first open
  warns and extracts; every later open of the same image content goes straight to the tree, for as
  long as the result is kept. This is the delivered reuse promise made visible, and it is what the
  fix must not break.

### Non-functional

- **Nothing on the daemon side changes.** No new Docker operation, no change to what an extraction
  creates, copies, removes or leaves behind, no change to cancellation, no change to what is kept or
  for how long. This fix is entirely about which surfaces the operator passes through.
- **No requirement of the reference analysis is weakened.** The cost is still announced before every
  extraction that actually starts; progress is still shown and still cancellable; the intermediate
  container is still removed on success, error and cancellation; results are still kept and reused.
  The warning is not removed from a case that pays a cost — it is removed from a case that pays none.
- **No visual element outside the UI library, no raw markup and no styling in feature code**, per the
  project's standing rule. This fix removes a surface and adds none; nothing joins the blur
  allow-list.
- **Fewer surfaces must not mean less information.** Everything the operator can learn today about
  this operation — the image it acts on, what it does to the daemon, what it costs, that it is
  running, that it finished, that a result was reused — must still be learnable after the fix.
- **The change must not regress keyboard or assistive-technology operation of the flow.** The removed
  screen held a focusable control that a keyboard operator currently lands on; after the change the
  first thing they meet is the cost warning, and it must receive them properly. The direct-to-tree
  case must leave the operator's point of interaction somewhere real inside the surface, never on a
  control that no longer exists.
- **Verification of bug-1 that this fix invalidates is relocated, never deleted.** bug-1 was
  certified partly on a **cached** filesystem run — the case where no phase is ever reported and the
  dialog must still say `Completed` and leave on its own. This fix removes that dialog from the
  cached filesystem path, so that scenario must be re-established on a surface where a reused result
  still raises the dialog (the layer analyses reuse results the same way and keep their flow),
  rather than quietly disappearing from the suite. Deleting it would retire the coverage that
  certified the sibling fix, with the suite green.
- **Existing checks that drive the removed screen are rewritten, not dropped.** The current checks
  press `Browse filesystem…` inside the surface, and one of them asserts the empty state as the
  place the flow returns to after a cancellation, and as the state of a re-opened browser before a
  cached run. Those are the assertions this fix changes, and it owns them: the reuse contract must
  come out of the rewrite **stronger** — a reused result now has to be *observable as such without
  an extraction being requested at all*.
- **Verified in the delivered product against the real daemon**, under the project's test
  discipline: own fixtures with ownership labels, full cleanup, no assumption of an empty daemon or
  of inherited application state, no test reaching Docker Hub, every spec passing on its own.
- **English only**, per the project's convention.

## What the operator must observe, in order

The outcome is a sequence, and it is stated as one. Both shapes are required; either alone is a
half-delivered fix.

**A — an image whose filesystem has never been extracted** (the reported case)

1. The operator opens the row's overflow menu and chooses `Browse filesystem…`.
2. **The very next thing on screen is the cost warning**, naming the image and reading *"Extracting
   the filesystem creates a container from the image (never started) and copies out about ***MB,
   taking roughly 5s."* At no moment before it, after it, or behind it does a screen appear offering
   to browse this image's filesystem.
3. Confirming shows the extraction progress, cancellable, ending with `Completed` and dismissing
   itself a second later — bug-1's behaviour, unchanged.
4. The tree is on screen, marked as freshly extracted, with search, download and the metadata pane.
5. Declining at step 2 instead returns the operator to the images list: nothing open, nothing
   extracted, the row action still there.

**B — an image already extracted, whose result is still kept**

1. The operator chooses `Browse filesystem…` on that image.
2. **No cost warning appears, and no extraction dialog appears.** The filesystem surface opens on the
   tree — showing at most a brief loading indication while the kept result is read, which asks
   nothing of the operator.
3. The surface states that the result was reused, and everything in it works as it does after a
   fresh extraction, `Re-extract…` included.
4. Choosing `Re-extract…` shows the cost warning again, because that path does pay the cost.

**How this must be checked, explicitly and for the record.** Two obligations, both paid for already
by this project (`CLAUDE.md`, "What a check drives, and what it measures", written after a shipped
defect that content-only, programmatically-driven coverage passed on twice):

- **The check drives the product's own path with a real pointer at the visible controls'
  coordinates** — the row's overflow control, the menu entry, the warning's own buttons — never by
  calling an element's `click()`, never by dispatching events, never by aiming at a hidden element.
- **The check asserts what is on screen immediately after the row action.** For shape A: that the
  cost warning is present *and* that the removed screen's heading and its `Browse filesystem…`
  control are absent — asserted at that moment, and never satisfied at any later point in the flow.
  For shape B: that no cost warning and no extraction dialog appear at all, asserted as a sustained
  absence across the window in which they would have appeared, together with the tree's arrival and
  its reused-result marking. **"The tree eventually appears" is true with the defect and without it,
  and must not be the assertion that certifies this fix.**

## Assumptions

Every gap the report leaves is closed here with a default and its reason. None is returned as a
question: the human delegated the detail, and none of these is a scope change, a destructive action
or a contradiction.

- **This is a fix, not an evolution.** The delivered flow asks the operator to issue the same request
  twice; the cause is identified, the corrected behaviour is stateable and checkable, and no
  capability is added or removed.
- **The intermediate screen goes entirely, exactly as instructed.** Nothing of it is preserved as a
  screen. Its one non-redundant role — being the place the flow fell back to after a cancellation or
  a failure — is re-homed *inside* the flow: cancellation returns to the images list, and failure is
  reported where it happens, with a retry available there. Its guarantee about no process ever
  running is already in the warning that follows it.
- **A reused result opens directly, with no cost warning.** This is the report's largest gap and the
  decision that matters most. It is settled by the product's own facts rather than by taste: the
  reference analysis requires the cost to be announced *before an extraction starts*, and on this
  path no extraction starts; the result is kept precisely so that it is not recomputed; and the
  warning quotes a size and a duration that would be simply untrue. Sending every entry through the
  warning would have been the easy uniform answer and would have made the product ask permission to
  spend five seconds it is not going to spend — the same class of defect as the one bug-1 just fixed,
  reintroduced one screen earlier.
- **A reused result raises no progress dialog either.** bug-1 accepted a dialog flashing by on a
  cached run, and it was right to, because the operator had just confirmed a cost warning and was
  owed a visible consequence for it. Remove the confirmation and that reason goes with it: nothing
  was authorised, nothing runs, and the tree's arrival is itself the confirmation. bug-1's behaviour
  is untouched wherever a dialog is still raised, and its cached-run coverage is relocated rather
  than dropped (stated as a requirement above, because this is the one way this fix could quietly
  weaken the previous one).
- **The cost numbers are shown at the first moment, because they are already known.** The image's
  size is on the row the operator just acted on, and the duration is derived from it, so the warning
  can be raised complete and instantly. No interim state with missing numbers is acceptable, and
  none is necessary.
- **The warning's wording is unchanged.** The human quoted it approvingly as the screen he wants to
  arrive at; rewording it while removing the screen in front of it would put a second, unrequested
  change inside this fix.
- **Nothing is added in the removed screen's place.** No explanatory banner, no illustration, no
  "about this operation" note. The flow is meant to be shorter, and a decorative replacement would
  restore the cost being removed while delivering less.
- **The identical shape on `Efficiency & signals…` is recorded and not fixed here.** Unlike bug-1,
  where six surfaces shared one component and there was only one place to make the change, these are
  separate feature surfaces: fixing both here would make a regression on either unattributable to
  the report that asked for it, and the efficiency surface carries a heuristics disclaimer whose
  placement needs judgement of its own. It is named in Scope so it can be requested deliberately
  rather than rediscovered.
- **`Explore layers…` and `Compare with…` are not instances of this defect** and are untouched. The
  first delivers what was asked for and offers a deeper analysis inside a populated view; the second
  legitimately waits for the operator to supply a second image.
- **The browser surface may or may not be open behind the cost warning; the requirement is on what
  the operator sees.** No arrangement is prescribed beyond this: nothing behind the warning invites
  the request to be repeated, and declining leaves nothing standing.
- **No change to the images list, the row menu, its entries, its order or its labels.** The entry
  keeps its ellipsis: it still asks for something before anything happens — on a first extraction it
  asks for confirmation, which is exactly what the convention marks.

## Constraints

- **Product constraint — the cost must still be announced before an extraction starts.** The
  reference analysis requires it, and this fix keeps it for every path that actually extracts,
  including every re-extraction. The warning is relocated to the front of the flow, not weakened.
- **Product constraint — kept results are reused, keyed by image content, and never silently
  stale.** The delivered behaviour is unchanged, and this fix now *depends* on it: it decides which
  of the two shapes the operator gets.
- **Product constraint — the operator may clear kept results.** So "already extracted" is a fact
  that can stop being true between one moment and the next, and the flow must survive that without a
  dead end.
- **Product constraint — no process from the image is ever executed, and the intermediate container
  is always removed.** Untouched, and the guarantee stays visible in the warning.
- **Product constraint — one visual language, defined in one place.** Every surface in this flow is
  a UI-library component used with feature-supplied wording; nothing raw and nothing locally styled
  may appear as a consequence of removing a screen.
- **Product constraint — the main view pays nothing for the glass.** No surface is added, so nothing
  joins the blur allow-list.
- **Baseline constraint — bug-1 is merged and is the starting state.** The progress dialog states
  `Completed` and dismisses itself after a second on the four analyses. Anyone reasoning from the
  pre-bug-1 product is reasoning about a state that no longer exists.
- **Baseline constraint — the four image analyses live in the row's overflow menu**, the image detail
  panel having been emptied of them. There is one entry point to fix, not two.
- **Repository constraint — the suite runs against the operator's own daemon**, so verification obeys
  the project's fixture rules, and each spec establishes its own starting state — including, for the
  reused-result case, creating that state itself within the test rather than inheriting it.
- **Verification constraint — the assertion must be able to fail.** The defect is a surface the
  operator passes through, so what is asserted is what is on screen *at the moment of the row action*
  and, for the reused case, what is *absent throughout*. An assertion that the tree eventually
  appears passes on the defective product.
- **Convention constraint — English only.**

## Market trends

Relevant and consulted, narrowly: this is a product with named competitors, and the design question
the fix turns on — when an interstitial confirmation earns its interruption — is settled in published
practice. The findings support the change and, more usefully, draw the line at exactly the place this
analysis draws it.

- **A confirmation the user cannot answer any other way is worse than no confirmation.** NN/g is
  explicit that confirmations belong before *"actions with serious consequences"* and that one should
  *"not use confirmation dialogs for routine actions"*, because when a dialog asks something the user
  has effectively already answered, *"the only sensible reaction is 'of course I want to do the thing
  I just told you to do', and hit Yes without further thinking"* — after which the mechanism *"will
  lose its power to prevent errors"*. That is a precise description of the removed screen, and it is
  also the argument for keeping the cost warning, which does present a real, quantified consequence
  the operator can decline.
  ([NN/g — Confirmation Dialogs Can Prevent User Errors](https://www.nngroup.com/articles/confirmation-dialog/))
- **An empty state is for a container whose content does not yet exist — not for one whose content
  was just requested.** NN/g's guidance frames empty states as communicating system status, teaching,
  and offering *"direct pathways … to getting started with key tasks related to populating the empty
  state"*. All three assume the user arrived without having asked for the content. Here the operator
  asked for it in the previous gesture, so the pattern's own preconditions are absent, and the
  "direct pathway" it offers is a second copy of the path already taken.
  ([NN/g — Designing Empty States in Complex Applications](https://www.nngroup.com/articles/empty-state-interface-design/))
- **The category treats filesystem browsing as a tab you open, not an operation you authorise.**
  Docker Desktop exposes a *Files* view that is entered and loads; nothing in its published
  documentation gates it behind a prompt to confirm the intention to browse. This product's warning
  remains justified where the competitor's is not needed — Docker Desktop reads a *running
  container*, whereas this reads an *image* by creating one, which genuinely costs time and disk —
  but the comparison sets the expectation the fix aligns to: entering is one gesture, and the second
  visit is instant.
  ([Docker Docs — Explore the Images view in Docker Desktop](https://docs.docker.com/desktop/use-desktop/images/))
- **Warning about a cost that is not incurred is the failure mode this fix must avoid creating.** The
  same "cried wolf" argument that condemns the removed screen condemns, one step later, a uniform
  warning shown on a reused result: it would be an interruption the operator learns is meaningless,
  attached to the very dialog whose credibility this fix exists to protect. This is the published
  basis for the two-shape behaviour rather than the simpler uniform one.

## Risks

- **The cached case is fixed by making it warn.** The likeliest wrong reading of this report:
  delete the empty state, send every entry to the cost warning, ship. The operator is then told an
  extraction will create a container and take five seconds, confirms it, and nothing of the kind
  happens — a false statement replacing a redundant one, on the dialog whose truthfulness matters
  most, and the reuse promise made invisible again.
- **The cached case is fixed by making it slow.** The mirror failure: forcing a real extraction on
  every entry so that the flow has one shape. That would make the warning true and the product
  worse, and would contradict the kept-result requirement outright.
- **A loading state becomes the new empty state.** If the "already extracted?" answer is waited for
  in a surface that shows a heading and a control, the reported defect is reproduced with different
  words. The wait must ask nothing and offer nothing.
- **bug-1's certification is quietly retired.** The existing cached filesystem run is where bug-1's
  hardest case — completion stated when no phase was ever reported — is verified. This fix removes
  that dialog from that path, and the tempting repair is deletion. The coverage must move to a
  surface that still raises the dialog, or the sibling fix ends up certified by nothing.
- **The reuse contract is weakened while its check is rewritten.** The existing check re-opens the
  browser and asks for the extraction again to prove the server answers from cache. After this fix it
  cannot ask, so the check has to prove reuse differently — and the lazy rewrite ("the tree appears")
  would pass on a product that silently re-extracted every time, at full cost, with nobody noticing
  for months.
- **Failure loses its way out.** The removed screen was the surface the flow fell back to when an
  extraction failed or was cancelled. If the fallback is removed without the replacement being
  deliberate, a failed extraction can leave the operator in a surface with nothing in it and no route
  onward — a worse dead end than the screen being deleted.
- **The kept result vanishes between the decision and the read.** Narrow, but real, since clearing is
  an operator-facing capability: the flow must fall back to the cost warning rather than surface an
  error the operator cannot act on.
- **Only the reported surface is fixed and the sibling is forgotten.** `Efficiency & signals…` has the
  same shape and will arrive as its own report. Recording it here is the mitigation; silently fixing
  it would be a different failure, making a regression on either surface unattributable.
- **The check certifies the wrong thing.** Asserting only that the tree eventually appears — or
  driving the flow programmatically — passes with the defect active. This project has already shipped
  one certified defect behind exactly that weaker form, which is why the obligation is written into
  the requirements rather than left to whoever writes the spec.
- **Keyboard operators lose their landing point.** The removed control is where a keyboard operator
  currently arrives; the warning must receive them, and the direct-to-tree case must not leave them
  on nothing.

## Scope

**In scope**

- Removing the `Filesystem not extracted yet` screen — heading, paragraph and `Browse filesystem…`
  control — from the image filesystem browser entirely.
- Making the cost warning the first surface the operator meets after choosing `Browse filesystem…`
  on an image whose filesystem has not been extracted, with its wording, its numbers and its
  never-started guarantee unchanged.
- Taking the operator straight to the tree, with no cost warning and no extraction dialog, when the
  image's filesystem has already been extracted and the result is still kept — including the brief,
  actionless loading indication if one is perceivable, and the preserved indication that the result
  was reused.
- Re-homing what the removed screen carried: declining the warning returns to the images list;
  cancelling an extraction returns to the images list; a failed extraction states its cause where it
  happens and may offer a retry there.
- Keeping `Re-extract…`, the extracted view and every capability inside it exactly as delivered.
- Falling back to the cost warning if a result believed to be kept turns out not to be readable.
- Rewriting the existing checks that drive the removed screen so that the reuse contract comes out
  stronger, and relocating bug-1's cached-run completion coverage to a surface that still raises that
  dialog — driven with a real pointer, asserting what is on screen immediately after the row action,
  in both shapes.

**Out of scope**

- Any change to what an extraction does, costs, creates, removes or keeps; to cancellation; to the
  cost warning's wording or its estimate; or to anything the server does.
- Any change to what the progress dialog says or how it leaves — that is bug-1, delivered and
  certified.
- Any redesign of the filesystem browser's layout, sizing, tree, search, preview or download
  affordances.
- The identically shaped `Not analyzed yet` screen on `Efficiency & signals…`, named here so it can
  be requested deliberately as its own report; and the `Explore layers…` and `Compare with…` flows,
  which are not instances of this defect.
- The images list, the row overflow menu, its entries, their order and their labels.
- The other reports in `bugs.md` — bug-3, bug-4 and bug-5 — each taken separately in its own
  analysis.
