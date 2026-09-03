---
request_slug: docker_management_app-privileged_toggle_verification
date: 2026-08-12
type: evolution
reference: .sdd/analysis/docker_management_app.md
superseded_by: .sdd/analysis/docker_management_app-toggle_focus_scroll.md
---

> **⚠ SUPERSEDED — the conclusion of this file is false.** It concluded that the reported crash does
> not reproduce, and delivered verification instead of a fix. **The defect is real, was reproduced
> with a real mouse click, and its cause is proved**: see
> [`docker_management_app-toggle_focus_scroll.md`](docker_management_app-toggle_focus_scroll.md).
>
> The axis that never varied across the seven attempts recorded below was **not the browser engine**,
> as this file concluded — it was the **instrument**. Every attempt used programmatic
> `HTMLElement.click()`, which does not move focus, and focus is what triggers the defect. The
> environmental hypothesis this file called untested is now **refuted**, and its Open thread is moot.
>
> The file is kept unedited below, as the record of what was concluded and on what evidence.

## Request

> - bug-2
>   image: bugs-screen/bug-2.png
>   containers > run container. selecting privileged the popup crashs!

(Scope is bug-2 only. bug-1 was analysed separately in
[`docker_management_app-dialog_sizing.md`](docker_management_app-dialog_sizing.md); bug-3 remains
in `bugs.md` and is taken separately.)

## Reference

Evolution of the delivered product analysed in
[`.sdd/analysis/docker_management_app.md`](docker_management_app.md).

**Starting point.** That analysis specified a Docker management client whose promise to the operator
is that the interface is a faithful and complete front end to the daemon: what the operator asks for
in the interface is what the daemon is told to do. The container create/run flow is one of its
delivered capabilities, and among the options it exposes is *privileged* mode — the single most
security-consequential switch in the whole form, since a privileged container is granted
substantially the host's own capabilities. The delivered product carries that option, and it works
as far as anyone has been able to observe.

**Changes.** This request **adds no capability, removes none, and corrects no delivered behaviour**,
because no delivered behaviour has been shown to be wrong. What it adds is a **standing guarantee**
over an existing path: that toggling *privileged* while creating a container neither breaks the form
nor is lost on the way to the daemon, and that this remains demonstrably true from now on rather
than being re-established by hand each time somebody doubts it. It also preserves the investigation
itself as evidence, including the baseline test that closed its last open branch.

**Why this is an evolution and not a fix — stated plainly, because it is the request's central
question.** A fix analysis asserts that delivered behaviour is wrong and specifies the corrected
behaviour. Neither is available here. Nobody has observed the defect; nobody has identified a cause;
and there is no line of the product anyone can name as wrong. A fix analysis would therefore have to
invent a corrected behaviour for a behaviour never seen, and the resulting change would be
unverifiable by construction — nobody could tell a successful fix from a no-op, because the failing
state cannot be produced. The honest classification of the work that *is* justified is an addition
to what the product guarantees and continuously proves about a path it already has. That is an
evolution.

**And if a reproduction arrives, this file is not the one to edit.** A reproduction turns bug-2 into
an observed defect with a cause, which is a fix analysis of its own, referencing this one for the
investigation already done. This analysis remains valid either way: the coverage it asks for is
justified on its own merits, and the record it preserves is what stops the whole investigation being
repeated.

## Summary

A reported crash — "selecting privileged the popup crashes" — does not reproduce, on the current
build or on the build the report was written against, after seven deliberate attempts across two
builds, both run arrangements, both entry paths into the form, a complete privileged create, and a
viewport matched to the screenshot. The justified work is not a fix: it is to place the privileged
path under permanent verification so the reported failure cannot exist unnoticed today or return
unnoticed tomorrow, and to record what was established — and what was not — so nobody investigates
it a third time.

**And the limit belongs here, not only further down.** Every attempt shared one browser engine, one
GPU path and one machine, and so does the verification this work delivers. The standing hypothesis —
an environment-, engine- or driver-specific paint failure — is therefore untested rather than
refuted. **This work cannot clear bug-2, and anyone citing it as having exonerated the privileged
path is citing it for something it was never able to do.** "Does not reproduce" is a description of
seven attempts, not a verdict on the report.

## Business goal

**The value on offer is not a repaired feature. It is the closing of a doubt, permanently, at the
one point in the product where doubt is most expensive.**

Three reasons this is worth spending on, and one reason it must not be spent on a fix:

- **The doubt sits on the product's most security-consequential control.** Privileged mode hands a
  container substantially the host's own authority. An operator who is unsure whether the switch
  they flipped survived the dialog has two bad options: create the container and hope, or verify by
  hand outside the product — which is the operator abandoning the interface at exactly the moment it
  was supposed to earn its place. The reference analysis positions this product as a complete and
  trustworthy front end to the daemon; a control the operator does not trust is worse than one the
  product does not offer, because it invites a false belief about the security posture of a running
  container.
- **An open, unreproducible report is a recurring cost, not a one-off one.** It has already consumed
  a full investigation — seven attempts across two builds and two run arrangements, both entry paths
  into the form, a real privileged container created and cleaned up, and a controlled rebuild of the
  commit the report was written against. What that bought is worth having, but all of it is
  *negative*: a list of explanations that are now excluded. Left undocumented, it will be reopened by
  the next person who reads `bugs.md`, and they will start from zero and exclude the same
  explanations again. The record is itself a deliverable, it is the cheapest one here, and it is the
  only one that stops the third investigation.
- **The coverage gap is real independently of whether the report is.** Exactly one assertion in the
  product touches this path, at unit level against a mocked client: it establishes that the form's
  internal state maps a toggle to a field. It does not establish that the daemon receives it, that
  the created container is actually privileged, or that the dialog survives the interaction. That
  gap would deserve closing on a day when nobody had reported anything, and it is the specific gap
  that made the report impossible to adjudicate: had the coverage existed, the answer would have
  been available in seconds instead of a session.
- **And the reason not to fix anything: a speculative correction is negative value.** A change aimed
  at an unidentified cause cannot be verified, cannot be shown to have worked, and cannot be shown
  not to have broken something. It would also close the report — the worst outcome, because it would
  retire the question while leaving whatever the human saw exactly as it is, and remove the incentive
  to look again.

## Requirements

### Functional

- **Verify that the privileged control survives its own use, as an operator uses it.** The interface
  must remain present and complete after the toggle is operated: the form still displayed, its own
  content still drawn — title, fields, the toggle itself, the actions — and the toggle showing the
  state that was selected. This is the reported symptom stated as a checkable condition, and it is
  the assertion the existing coverage lacks entirely.
- **Verify that privileged reaches the daemon and takes effect.** The guarantee is about the created
  container as the daemon holds it, not about the request the interface composed. A check that
  inspects what the product *sent* re-asserts what the unit-level assertion already covers and would
  pass through a defect in everything downstream of it.
- **Verify the path from both ways into the form.** The form is reached both from the containers
  screen and from an image, and the human's report names the first. Both were exercised by hand
  during the investigation and both must stay covered, because a defect that lives in one entry mode
  and not the other is precisely the kind that survives a spot check.
- **Detect the failure mode the screenshot actually depicts, not only an outright crash.** The
  artifact shows a surface that is present, correctly positioned, and drawing nothing of its own.
  Verification that only confirms the resulting container was created would pass straight through
  that symptom: the container in the investigation's own fourth attempt was created successfully.
  Presence of the surface is not evidence of its content.
- **Surface any uncaught application failure during the interaction as a failure of the check.** The
  investigation's most useful negative finding — no React error and no uncaught exception in any
  attempt, on either build — was obtained by a human watching a console. That observation must become
  automatic, or the next occurrence is again adjudicated by whoever happened to be looking.
- **Preserve the investigation as a durable record**, not as a scratch file: what was attempted, in
  which arrangements and on which builds, what was measured from the screenshot, which hypotheses
  the evidence rules out and which it leaves standing. An unreproducible report that is closed
  without a record is reopened; one that is closed with a record is answered.
- **The record must carry the baseline test together with its control**, not the result alone. The
  finding that the failure does not reproduce on the pre-work build is worth nothing to a later
  reader who cannot rule out that the baseline was accidentally the new build — the single most
  likely way that test goes wrong. The control measurement that proves otherwise is part of the
  finding, not a footnote to it.
- **The record must state, in its own words, that the new verification cannot clear bug-2.** It runs
  in one browser engine and cannot observe an engine-specific paint failure. This has to be written
  where a reader looking for the conclusion will find it, not buried, because the predictable misuse
  of this work is to cite it later as having exonerated the privileged path.

### Non-functional

- **No change to delivered behaviour.** No control, no wording, no layout, no interaction of the
  container create flow changes as a result of this request. If the work produces a behavioural
  change, the premise has failed and it must be re-examined rather than shipped.
- **The verification must be permanent and routine**, not a one-time confirmation. A check run once
  answers today's report; a check that runs with every change is what makes the guarantee stand.
- **It must not require an empty or prepared daemon**, and must remove everything it creates,
  including anything the daemon attaches on its own behalf. A privileged container is exactly the
  kind of fixture that must not be left behind on the operator's own machine, and this is an
  existing, enforced project rule rather than a new one.
- **It must hold at the viewport proportions the report was made at**, not only at a comfortable
  desktop width. The one thing the screenshot fixes with reasonable confidence is that the window was
  narrow.
- **The record must state its own limits.** Every claim in it is to be distinguishable as measured,
  inferred, or assumed. The value of this document is that a later reader can tell which is which; a
  confident summary that blurs them would be worse than no record.

## Established findings

Not assumptions. Each of these was measured, and each is recorded with the measurement that supports
it so a later reader can weigh it rather than take it on trust.

**The seven attempts, enumerated.** Stated one by one rather than in aggregate, so a later reader can
reconstruct any single one, check the numbering this file uses elsewhere, and see which axes were
genuinely varied and which were held constant throughout.

| # | Build | Arrangement | Entry path | Viewport | Action | Result |
|---|---|---|---|---|---|---|
| 1 | current `main` | dev (Vite 5173 + Express 3000) | Containers → `Run container…` | 1280 wide | toggle `Run privileged` | no crash; sheet intact, 1154 chars before and after |
| 2 | current `main` | dev | Containers → `Run container…` | 1280 wide | toggle off, then on again | no crash |
| 3 | current `main` | production (`npm run build` + `serve`) | Containers → `Run container…` | 1280 wide | toggle | no crash |
| 4 | current `main` | production | Containers → `Run container…` | 1280 wide | image `alpine:3.20`, name set, privileged on, **`Create only`** | container created, sheet closed normally; fixture removed with `docker rm -fv` |
| 5 | current `main` | production | Containers → `Create from image…` | 1280 wide | toggle | no crash |
| 6 | current `main` | production | Containers → `Run container…` | **813 × 905** | toggle | no crash |
| 7 | **pre-work `3725389`** | production, clean worktree | Containers → `Run container…` | **813 × 905** | toggle | no crash; 1154 chars before and after; control confirmed the old build |

What varied: the build (two), the run arrangement (two), the entry path within the containers screen
(two), the viewport (two), and the depth of the interaction (toggle only, versus a complete create).
**What never varied, and is the whole of the standing hypothesis: one browser engine, one GPU path,
one machine, one operator's daemon.** The image row's `Run…` entry was never exercised by hand at
all — it is covered only by the standing check this work delivers.

- **The failure does not reproduce on the build the report was written against.** The pre-work
  commit — `3725389 "First set of bugs"`, which was `main` at the moment `bugs.md` was written — was
  built and served from a clean worktree, and the reported steps were run against it at the same
  813px-wide viewport: Containers → *Run container…* → toggle *Run privileged*. No crash. The sheet
  stayed intact, 1154 characters of content before and after the toggle, no console error. This was
  the last open branch of the investigation, and it is now closed.
- **That baseline was genuinely the pre-work code, and here is the control that proves it.** The
  obvious way this test fails is by accidentally exercising the new build. On the baseline, the
  dialog's grid item still carries **no class at all**, and Create context measures **card 765 /
  content 480** — bug-1's defect, present and unfixed, exactly as
  [`docker_management_app-dialog_sizing.md`](docker_management_app-dialog_sizing.md) recorded it.
  A build carrying the merged work could not produce that measurement.
- **Incidental repair is therefore excluded.** The four merged items did not fix bug-2, because
  bug-2 did not reproduce before them either. This was the one live possibility that could have
  closed the report with an explanation, and it is now eliminated. Its elimination cuts the way the
  hypothesis predicted: with the code before and the code after behaving identically, the conclusion
  that **the trigger is not in the code, under this engine** is substantially stronger than it was,
  not weaker. What remains unexplained is unexplained by the code.
- **The React tree was not torn down at the moment the screenshot was captured.** The product
  contains no error boundary of any kind, so an exception thrown during render unmounts the whole
  tree and leaves an empty document. The screenshot shows the page header, the *Create from image…*
  and *Prune stopped* actions, the All/Running/Stopped/Paused filters, the table's column headers, a
  `postgres` row, and a green daemon-status indicator — all rendered. A render crash and this image
  are mutually exclusive at that instant.
- **The screenshot is a crop, so the viewport width is not measurable from it.** Text is cut mid-word
  at both edges of the image — "…rocesses and inspect" and "…e from image…" at the left, a clipped
  glyph at the right — which cannot happen at a real viewport boundary. The surface measures roughly
  756 CSS px wide and occupies about 93% of the *visible frame*, but the frame is not the window.
  This corrects an earlier reading of the artifact, made during this investigation, which took the
  frame for the window and concluded the surface was at exactly its designed width for that viewport;
  that inference was measuring a cropped image and does not hold.

## Assumptions

Each of these is a decision taken in the absence of an answer, with the reason it was taken that way.

- **"Crashes" is the operator's word for "went blank", not a diagnosis.** Taken as the primary
  reading because the human's own screenshot shows it: a surface that is open and empty, over an
  application that is intact. Users describe a broken-looking dialog as a crash; they are reporting a
  symptom, not classifying a fault. Every alternative reading has to explain why the artifact
  supplied with the report shows a *working page*.
- **The intact tree constrains the hypothesis; it does not refute the report.** Deliberately recorded
  as an assumption and not a conclusion, because the finding above is narrower than it looks. One
  frame says nothing about the frames before or after it, the human may have captured a moment other
  than the one they described, and a failure that is not a React render throw is still a failure.
  What is established is "not a render crash as photographed", which is a long way short of "nothing
  happened".
- **The surface in the screenshot was at its designed width rather than oversized.** Assumed, because
  the current build measures that way at a comparable viewport — but the crop means the artifact
  cannot carry the claim, so the competing reading is **weakened, not excluded**: that the surface
  was oversized relative to its content, which is precisely the defect bug-1 reported against the
  shared dialog surface this sheet is built on. Flagged because the assumption is load-bearing. The
  baseline test bears on this and does not settle it: bug-1's defect was measured *present* on that
  build, and the sheet still did not fail there.
- **The "unmodified file" argument was never sufficient on its own, and is now moot.** `bugs.md` was
  written in one sitting, bug-1 through bug-3, before any merged work existed. That the file
  containing the privileged control is unmodified is true and does **not** establish that nothing
  relevant changed, because the container form's sheet is built on the same dialog surface the bug-1
  correction was aimed at. Recorded here so the reasoning is not reused elsewhere as though it were
  conclusive; the possibility it failed to exclude has since been excluded properly, by measurement.
- **Seven clean attempts across two builds are strong evidence about this engine on this machine —
  and weak evidence about the human's.** Every attempt shared one browser engine, one GPU path and
  one operating system. Testing a second build removed the code as a variable; it did not touch the
  environment, which remains uncontrolled and is where the leading hypothesis lives. The failure
  class most consistent with the artifact — an overlay glass surface that paints its backdrop but not
  its content — is documented to be engine-, driver- and transition-dependent (see Market trends).
  Assumed, therefore, that "not reproduced" means exactly that, and is not upgraded to "does not
  exist".
- **The trigger, if there is one, is not in the privileged control's own logic.** The control is a
  plain boolean with no branch and nothing derived from it during render, and the assertion covering
  it passes. Assumed that any real defect lives in the surface, the interaction or the environment
  rather than in the option itself — which is why the work is aimed at the dialog's survival and not
  at the option's handling.
- **The human cannot be consulted before the work proceeds.** They are out of office and have
  delegated every decision except the one thing only they hold: the circumstances of the sighting.
  Assumed, therefore, that the work proceeds on the evidence available, and that the questions only
  they can answer are recorded as an open thread (below) rather than guessed at. This is chosen over
  waiting, because every deliverable here is justified without their answer; their answer changes
  what happens *next*, not whether this is worth doing. **This analysis is complete and actionable
  as it stands** — nothing in it is blocked on a reply.
- **No fix is specified, and that is a decision rather than an omission.** Chosen over the
  alternative of hardening something plausible "while we are here": a change against an unidentified
  cause cannot be verified, would close the report without answering it, and would put an unverified
  edit into the one path in the product where an unnoticed regression carries host-level
  consequences.

## Constraints

- **The reproduction itself cannot be obtained by this project.** It exists, if anywhere, on the
  human's machine, in their browser, at their build. Everything specified here is deliberately
  chosen to be worth doing *without* it.
- **The product is tested against a real daemon — the operator's own.** Anything created must be
  removed by whatever created it, including a privileged container and anything the daemon attaches
  alongside it, and nothing may assume a clean or empty daemon. These are existing, enforced rules of
  the project, and a privileged fixture is the least acceptable kind to leave standing.
- **No reliance on external image registries.** The verification must draw on the fixtures the
  project already prepares for itself rather than reaching the network, since an unreachable registry
  produces a failure that says nothing about privileged mode — the exact class of noise this work
  exists to remove.
- **Automated checks run in one browser engine.** Whatever is added therefore cannot, even in
  principle, detect an engine-specific rendering failure of the kind most consistent with the
  artifact. This is a known and accepted limit of the deliverable, stated here so it is not later
  mistaken for a guarantee it does not give.
- **A privileged container is a real privilege grant on the host it runs on.** The verification must
  keep it short-lived, minimal and labelled as the project's fixtures already are.
- **The interface is composed exclusively from the internal UI library**, which is where the sheet
  and the toggle both live. Nothing in this request needs a visual change; if one were proposed, it
  would belong to the library and not to the containers screen.

## Market trends

Relevant, and consulted — narrowly, on the one external question that bears on the decision: whether
"a translucent overlay surface renders its backdrop but not its own content, on one machine and not
another" is a recognised class of failure or an implausible excuse. It is recognised, and that is
what justifies refusing to convert a set of clean attempts, all made in one engine, into a verdict of
"no defect" — including now that a second build has been tested and behaved identically, since both
builds were exercised in that same one engine.

- **Glass-style surfaces are a documented source of engine-specific rendering failures.** Practitioner
  and vendor sources describe surfaces built on backdrop filtering failing to paint correctly
  depending on stacking context, clipping by an ancestor, vendor prefixing, and interaction with
  transforms — with the same markup rendering correctly in one engine and not another. A defect of
  this class is invisible to a reproduction attempt made in a different engine, which is exactly the
  shape of the investigation performed here.
  ([Josh W. Comeau — Next-level frosted glass with `backdrop-filter`](https://www.joshwcomeau.com/css/backdrop-filter/);
  [Mozilla bug 1808232 — 3D transform + `backface-visibility: hidden` breaks `backdrop-filter`](https://bugzilla.mozilla.org/show_bug.cgi?id=1808232))
- **The failure is also documented specifically around transitions and repaints**, which is the
  moment a toggle is operated. The Chromium tracker carries issues titled *"backdrop-filter blur
  disappears during transition/animation"* and *"Backdrop-filter blur does not work correctly with
  non-…"*. Their detail pages require sign-in and were **not** read, so nothing beyond the existence
  and titles of these reports is claimed here; that is enough for the only point being made, which is
  that the class is real and known.
  ([issue 40175472](https://issues.chromium.org/issues/40175472);
  [issue 380416865](https://issues.chromium.org/issues/380416865))
- **Comparable tools place privileged mode behind a deliberate, guarded control**, treating it as a
  security decision rather than an ordinary option — Portainer exposes it under advanced runtime
  settings and lets an administrator remove it from non-administrators entirely. This corroborates
  the weight put on the control by this analysis. It is cited as context for *why the path deserves
  standing verification*, not as a request to change the product's own treatment of it, which is out
  of scope.
  ([Portainer — Advanced container settings](https://docs.portainer.io/user/docker/containers/advanced);
  [Portainer — Security settings](https://documentation.portainer.io/v2.0/settings/security/))

## Risks

- **The report is closed on the strength of the clean attempts.** The dominant risk, and the baseline
  test makes it *more* tempting rather than less: two builds now behave identically, which reads like
  a verdict. It is not one. "Could not reproduce" is a statement about the attempts, not about the
  product: the artifact is real, the human is not mistaken about having seen something, and every
  attempt shared one engine on one machine. What was eliminated is a code-side explanation, which is
  not the same as eliminating the failure. Closing on this basis settles an open question without
  adding the information that would settle it, and guarantees the next occurrence starts from zero.
- **The opposite failure: a fix is manufactured to make the report closable.** Equally damaging and
  more likely under time pressure. It produces an unverifiable change in a security-sensitive path,
  and it retires the question while leaving the cause — if any — untouched.
- **The verification is written to the happy path and passes through the reported symptom.** If it
  asserts only that a privileged container was created, it would have passed during the very
  screenshot the human sent, had a container been created behind that empty surface. The symptom is
  *a surface that is present and empty*; absence of an exception is not evidence of content.
- **The verification is treated as proof the defect does not exist.** It cannot be: it runs in a
  single browser engine and cannot observe an engine-specific paint failure. If it is later cited as
  having cleared bug-2, it will have been used for something it was never able to do.
- **The baseline result is remembered without its control.** The finding "it did not reproduce on the
  old build either" is only worth something alongside the evidence that the old build was really the
  old build. Repeated without that — in a commit message, a status note, a later summary — it becomes
  an unfalsifiable claim, and the first sceptical reader will re-run the whole test.
- **The record is written as a summary rather than as evidence.** A confident paragraph saying "not
  reproducible, no defect found" is worse than nothing, because it transfers a weak conclusion to a
  reader who cannot see how weak it was. The distinction between measured, inferred and assumed is
  the whole value of the document.
- **The next occurrence again produces no evidence.** Nothing in the product captures a failure: with
  no error boundary anywhere, a render fault blanks the page silently, and the operator has nothing to
  hand over but a photograph. This is why bug-2 cost a session and yielded nothing, and it will
  recur identically for the next unexplained report. Deliberately not scoped into this request (see
  Scope), and recorded here as the standing risk it is.
- **A privileged fixture is left running on the operator's machine.** The routine risk of the
  deliverable itself, and the most consequential kind of leftover this project can produce.

## Scope

**In scope**

- Permanent, routine verification of the privileged path through the container create flow, exercised
  as an operator exercises it, against a real daemon: from both entry points into the form, at a
  narrow viewport, asserting that the form survives the toggle with its own content intact, that the
  toggle reflects the selected state, that the resulting container is privileged as the daemon holds
  it, and that no uncaught application failure occurred during the interaction.
- Removal of everything that verification creates, under the project's existing fixture rules.
- A durable record of the investigation — attempts, arrangements, both builds exercised, the baseline
  test and its control measurement, measurements taken from `bugs-screen/bug-2.png`, the hypotheses
  the evidence excludes and those it leaves standing, and the limits of the conclusion.
- An explicit statement of what the new verification does and does not guarantee, so it is not later
  mistaken for a clearance of bug-2.
- The open thread below, carried with the record so that a later answer from the human reopens the
  investigation instead of arriving nowhere.

**Out of scope**

- **Any fix.** No change to the privileged control, the container create form, the sheet it is drawn
  on, or the UI library. Nothing is known to be broken, and a change made anyway could be neither
  verified nor defended.
- **Any redesign or reconsideration of privileged mode itself** — its placement, its wording, whether
  it should carry a warning or be restricted. The comparison with other tools is context, not a
  request.
- **Introducing error boundaries or a failure-reporting capability — split off deliberately, and
  opened as a separate item rather than dropped.** The decision was taken explicitly, not by
  oversight, and the reasoning is recorded here so the split reads as a judgement a later reader can
  disagree with. It would neither have prevented nor fixed bug-2, and folding it in would turn a
  defect report into a feature request. But it *is* the reason this report produced no evidence: with
  no error boundary anywhere, a render fault blanks the page silently and the operator has nothing to
  hand over but a photograph — which is exactly what happened, and what cost a full session to
  adjudicate. It will pay for itself on the next unexplained report, and it is being raised on its
  own terms so that it is decided as a product question rather than smuggled in as a side effect of
  this one.
- **Cross-browser or cross-engine verification as a new standing capability — declined for this
  piece of work, with the cost of declining stated.** Establishing a multi-engine quality bar is a
  significant and permanent cost to the verification suite, and the case for it is currently a single
  hypothesis about a single unreproduced report; that is not enough to buy it. The consequence is
  accepted and written down rather than glossed: **the verification this request adds runs in one
  browser engine, therefore cannot observe an engine-specific paint failure, and therefore cannot
  clear bug-2.** A failure of this exact class could ship again unseen. Anyone later citing this work
  as having exonerated the privileged path is citing it for something it was never able to do.
- **Extending verification to the container create form's other options.** The gap is real across the
  form, but this request is scoped to the path that was reported; generalising it would be a separate
  and separately justified piece of work.
- **bug-1, already analysed, and bug-3, which remains in `bugs.md` and is taken separately.**

## Open thread — what would reopen this

These were put to the human and are unanswered; they are out of office. **Nothing here blocks the
work**: every point already has a decision recorded above, and this section exists so that a late
answer lands somewhere useful instead of arriving after the record has closed. Each item says what
it would change — an item that would change nothing does not belong on this list.

1. **What did "crashes" actually look like** — the popup went blank but stayed open (as the
   screenshot shows), the popup vanished, the whole page went white, the browser froze, or an error
   was displayed? These are four different defects. Currently assumed to be the first, on the
   strength of the artifact. Any other answer invalidates the leading hypothesis and restarts the
   investigation on a different footing.
2. **Which browser and version, on which operating system?** The closest thing to a decisive
   question. Every attempt across both builds shared one engine, and the leading hypothesis is
   engine-specific. A different engine from the one tested would make this immediately worth
   re-running there, and would also revive the case for cross-engine coverage declined above.
3. **The full, uncropped window**, and whether the capture was taken at the moment of failure or
   afterwards. The crop is what prevents the artifact from settling whether the surface was at its
   designed width or oversized — the one load-bearing assumption left in this analysis.
4. **Every time, or once?** A reliable trigger is reproducible by definition and would convert this
   into a fix analysis immediately. An isolated sighting supports the environmental reading.
5. **Which arrangement — the single-process product (`npm start`) or the two-process development
   setup — and roughly when.** Both arrangements were tested, but the timing would confirm the
   commit identified as the baseline was the right one.
6. **Anything in the browser console at the time.** A recorded exception would overturn the finding
   that the tree was intact and point straight at a cause. Its absence corroborates the paint-failure
   reading.

If any answer arrives, it belongs in a **new fix analysis referencing this one**, not in an edit of
this file: this analysis records an investigation that concluded, and a reproduction is a different
finding rather than a revision of this one.
