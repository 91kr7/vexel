---
request_slug: docker_management_app-toggle_focus_scroll
date: 2026-08-12
type: fix
reference: .sdd/analysis/docker_management_app.md
---

## Request

> containers > run container. selecting privileged the popup crashs!

Reported as bug-2 in `bugs.md`, with `bugs-screen/bug-2.png`. **Reopened**: the defect has since been
reproduced and its cause measured live. The earlier investigation of this same report concluded "not
reproducible" and delivered coverage only —
[`docker_management_app-privileged_toggle_verification.md`](docker_management_app-privileged_toggle_verification.md).
That conclusion is false. It is superseded, not withdrawn: it remains on disk as the record of what
was concluded and why, and is referenced below for the one thing it now proves — how a certified
product passed a green suite while carrying this defect.

## Reference

Fix of the delivered product analysed in
[`.sdd/analysis/docker_management_app.md`](docker_management_app.md).

**Starting point.** That analysis specified a Docker management client positioned on two things at
once: complete functional coverage of the daemon, and a "liquid glass" interface that must stay
*"usable (readable text, discernible controls) for extended operational use, not purely
decorative"*. It required every visual element to come from one internal UI library, which is where
the switch control lives and where this defect lives with it. The delivered product carries the
switch on four screens and it works — in the sense that its state changes and reaches the daemon.
What is broken is what happens to the surface around it at the moment it is operated.

**Changes.** This request adds no capability and removes none. It corrects delivered behaviour: a
switch, when operated with a real pointer, drags the surface it sits on out of the viewport, leaving
the operator looking at an empty pane of glass. It also corrects how that path is verified, because
the verification that exists cannot observe the failure.

## Summary

Operating any switch in the product scrolls its own surface off screen. In the "Run a container"
sheet the sheet is dragged 1044px above the top of the viewport, so the operator sees an empty pane
of glass and reports a crash. Nothing has crashed: the dialog is intact and has been scrolled away.
The defect is in the shared switch control of the UI library, so it is one defect on four screens,
not one bug in the privileged option.

## Business goal

**The operator is being told the truth about their most dangerous control, and cannot see it.**
Privileged mode hands a container substantially the host's own authority. Today the act of granting
it makes the form disappear. An operator in that position has three options, and all three are bad:
abandon the create, redo it without privileged, or scroll blindly back and submit a form they can no
longer see. This is the product failing at the exact instant the reference analysis says it must be
most trustworthy — and it is failing while doing the right thing internally, which is the worst
combination, because nothing anywhere reports an error.

**One control, four screens, and no reason the operator can see.** The switch is a single library
component consumed by the plugins screen, the container logs view, the container detail panel and
the container create form. Every one of them puts it inside something that scrolls, which is the
condition the defect needs. Fixing the privileged option alone would repair the one report and leave
the same failure standing in three other places — the exact divergence the project's
single-UI-library rule exists to prevent, and the reason this is a library fix rather than a
containers-screen fix.

**And the second deliverable is worth as much as the first: this shipped behind a green suite.** The
verification that existed tested the right requirement with the wrong instrument, twice over. It
compared the sheet's rendered *text length* before and after — 1154 characters both times, with the
defect active — when the property that moves is the sheet's *position*. And every one of the seven
attempts that failed to reproduce the defect activated the control programmatically, which does not
move focus, while focus is the entire trigger. **A check that never uses a real pointer cannot
detect a defect that only focus or hit-testing can cause.** That sentence is the most transferable
thing this investigation produced, it cost a full session and a false "not reproducible" verdict to
learn, and it is a deliverable of this fix in its own right — otherwise the next defect of this
class ships the same way, invisibly, behind the same green suite.

## Requirements

### Functional

- **Operating a switch must leave its surface exactly where it was.** After the operator flips a
  switch, the dialog, panel or page must be in the same position and at the same scroll offset as
  before, and the switch itself must still be visible and under the pointer. This is the defect
  stated as a checkable condition.
- **The correction is made once, in the shared switch control, and covers all four consumers** — the
  plugins screen, the container logs view, the container detail panel and the container create form.
  Each of these places the switch inside a scrolling region, so each is affected by construction;
  none is exempt because nobody has reported it yet.
- **The switch keeps everything else it does.** It shows the state selected, that state reaches the
  daemon unchanged, and its appearance, wording, size and placement are untouched. Any visible
  difference other than the surface no longer moving is a defect of this fix.
- **The switch must remain operable by keyboard and announced to assistive technology.** The failure
  is caused by the control taking focus, so the tempting cure is to stop it taking focus. That cure
  is forbidden: it would trade a visible defect for an invisible one, making the switch unusable
  without a pointer and unreadable to a screen reader, against the reference analysis's requirement
  that the interface stay usable for extended operational work.
- **Verification must measure position, not content.** A check that the surface is still present and
  still has its text passes with the defect active — this is established, not predicted. What must
  be asserted is that the surface has not moved and that the control operated is still within the
  viewport.
- **Verification must use real pointer interaction.** Programmatic activation does not move focus and
  therefore cannot trigger this class of defect. The checks covering this path must drive an actual
  pointer, and the existing bug-2 coverage is strengthened to do so rather than deleted — deleting it
  would remove the assertion that named the path while leaving the gap that hid the defect.
- **Coverage must include at least one switch inside a scrolling detail panel**, not only the
  reported dialog. The reported symptom is spectacular in a dialog and quieter in a panel; the
  quieter case is the one that will otherwise go unnoticed.
- **The two sibling elements are established by real-pointer measurement, and never by argument.**
  The file-picker's hidden control is focusable and has the same shape as the defective switch, so it
  is the serious candidate and is tested with a real pointer under the same conditions. The
  button-with-description's hidden text is not focusable and therefore cannot be triggered by focus,
  but is still checked for displacement by pointer hit-testing — *"spans do not take focus"* is a
  reason to expect it clean, not evidence that it is. Whichever proves defective is corrected the
  same way, in the same library, in this fix.
- **A sibling that measures clean is recorded as clean and left untouched.** No remedy is applied to
  something not shown to be broken: a change to a working control cannot be justified later, cannot
  be verified as having achieved anything, and would put the two siblings back into the same
  unexamined state this fix exists to leave behind. The deliverable for a clean sibling is the
  measurement, not an edit.
- **The general lesson is written into `CLAUDE.md`, alongside the project's existing non-negotiable
  rules**, in both its halves: *a check that does not use a real pointer cannot detect a defect that
  only focus or hit-testing can trigger*, and *a check that measures content cannot detect a defect
  that moves position*. Each half has its own evidence in this defect — seven programmatic
  activations found nothing where one real click found it immediately, and 1154 characters were
  counted before and after with the defect active. Left in an analysis it is a story about one bug;
  written where the rules live it constrains every check the project writes from now on. This is the
  only requirement here that outlives the switch.

### Non-functional

- **No change to any daemon-side behaviour.** Nothing about what a switch means, what is sent, or
  what the daemon does with it changes.
- **No new overlay surface and no new blurred surface.** This fix touches a control's placement
  behaviour; nothing may join the project's blur allow-list as a result.
- **The correction lives in the UI library and nowhere else.** No feature screen may carry a local
  workaround for it — a screen-level compensation would be a second definition of the same control's
  behaviour and would hide the defect in the remaining screens.
- **The correction must not disturb the layout around the switch.** Giving the hidden element a
  correct frame of reference changes what it is measured against; it must not change what anything
  overlaps, what sits above what, or how the switch sits among its neighbours. This is checked
  visually on each of the four consumers, not inferred.
- **Verified in the delivered product against the real daemon**, under the project's existing test
  discipline: own fixtures, full cleanup, no assumption of an empty daemon or an inherited
  application state, every spec passing on its own.
- **English only**, per the project's convention.

## Established findings

Measured live, and recorded with the measurement so a later reader can weigh them rather than take
them on trust.

| Observation | Measurement |
|---|---|
| The visible switch and its hidden control are far apart | switch at `y=390`, hidden control at `y=1736` — **1346px** |
| The surface after a real click | the sheet at `y=-1044` — above the top of the viewport |
| The surface's content after the click | 3 children, 1154 characters of text, 7633 of markup, all `visible`, `opacity: 1`, no console error |
| The proved remedy, injected live | the gap falls from 1346px to **9px**, and the same real click switches the toggle on with the sheet motionless |

- **Nothing crashes.** The interface is intact and the operator is looking at the wrong part of it.
  "Crash" is the operator's word for "everything vanished", and the screenshot supplied with the
  report shows exactly this: a surface present and empty.
- **The cause is standard browser behaviour, not an engine quirk.** A control that takes focus is
  scrolled into view by the browser; the hidden control is 1346px from where it appears to be, so
  scrolling it into view moves the surface by that much. This closes the earlier investigation's
  leading hypothesis — an engine- or driver-specific paint failure — and with it the case for
  cross-engine coverage that hypothesis was the only argument for.
- **The previous coverage cannot see this.** It asserts on rendered text length, which is identical
  with the defect active. The seven earlier attempts activated the control programmatically, which
  does not move focus. Both facts are the reason a certified product shipped this behind a green
  suite.

## Assumptions

- **This is a fix, not an evolution.** Stated by the human, and now supported: the delivered
  behaviour is wrong, the cause is identified, and the corrected behaviour is stateable and
  checkable — which is precisely what the earlier analysis said was unavailable to it.
- **All four consumers are affected, and none needs to be individually reproduced first.** The
  mechanism belongs to the control, not to the screen, and every consumer places it inside a
  scrolling region. Assumed affected and fixed together, rather than fixed where a human happened to
  notice.
- **Both siblings are in scope for this fix, and both are settled by measurement.** Decided by the
  human: the file picker is the same defect class, in the same library, with the same remedy, and
  splitting it out would mean shipping a fix while knowingly leaving its twin standing — least
  defensible now, when the reason this defect reached a certified product is that nobody looked hard
  enough at the shape. Being *in scope* means being **measured**, not being changed: a sibling is
  corrected only if a real pointer displaces its surface, and is otherwise recorded clean and left
  exactly as it is.
- **No visual or behavioural change is wanted anywhere.** Operators expect a switch to switch and
  nothing else to move. The correct outcome of this fix is that nothing looks different.
- **Cross-engine verification is not required by this fix**, because the cause is engine-independent.
  The earlier analysis declined it for cost reasons while leaving its case open; that case is now
  closed on the evidence rather than on cost.
- **The earlier analysis is superseded, not deleted.** Its verdict is wrong, but its record — what
  was attempted, in which arrangements, and why each attempt missed — is the evidence for the
  process lesson this fix carries. Deleting it would destroy the only proof that the failure mode was
  methodological.

## Constraints

- **One visual language, defined in exactly one place.** The switch is a library component; the fix
  is made there and nowhere else, and no screen may compensate locally.
- **The main view pays nothing for the glass.** The project's standing performance rule is untouched
  by this fix and must remain so: no surface joins the blur allow-list as a side effect.
- **Focus cannot be prevented from scrolling its target into view.** This is browser behaviour, not a
  setting; the correction has to be to where the hidden control sits, not to what the browser does
  with it (see Market trends).
- **Accessibility floor.** The hidden control exists to make the switch operable by keyboard and
  legible to assistive technology; whatever is done to it must preserve both.
- **The suite runs against the operator's own daemon**, so the verification obeys the project's
  fixture rules: it creates what it needs, removes it, assumes nothing about prior state, and passes
  on its own.
- **The reproduction requires a real pointer.** Any check written for this defect that does not drive
  one is, by construction, incapable of failing when the defect is present.

## Market trends

Relevant, and consulted narrowly — not on the market, but on the two standards questions this defect
turns on, both of which are settled in published practice. That matters here: it means the defect and
the reason it evaded verification are both known classes with documented guidance, not novel
discoveries, and the fix can be checked against prevailing practice rather than taste.

- **An off-screen hidden control is documented as requiring a positioned frame of reference, with
  scroll displacement named as the consequence of omitting it.** Adobe's React Aria states it
  directly for its own equivalent component: *"VisuallyHidden is positioned absolutely, so it must
  have a `position: relative` or `position: absolute` ancestor. Otherwise, undesired scrollbars may
  appear."* This product's switch omits exactly that, and the symptom is one severity up from
  scrollbars because the displacement is 1346px inside a dialog.
  ([React Aria — VisuallyHidden](https://react-aria.adobe.com/VisuallyHidden))
- **The browser's scroll-on-focus cannot be turned off**, which is why the correction has to be to
  the control's placement: *"There is no way to prevent the browser from scrolling elements into view
  upon receiving focus."* Practitioner guidance on hiding techniques makes the same point — a hidden
  region containing something focusable will jump the page when it is focused.
  ([ally.js — Focusing in animated UI](https://allyjs.io/tutorials/focusing-in-animated-ui.html);
  [Accessibility Developer Guide — hiding elements visually](https://www.accessibility-developer-guide.com/examples/hiding-elements/visually/))
- **The testing lesson is an established rule with tooling behind it, not an insight of this
  investigation.** The distinction between dispatching a click event and simulating a user's click —
  the latter carrying focus and the pointer sequence with it — is why the Testing Library ecosystem
  ships a lint rule that prefers the realistic form outright. This product's seven failed
  reproductions are a textbook instance, and the fact that the industry needed a lint rule to enforce
  it is the argument for writing the lesson into the project's own rules rather than trusting anyone
  to remember it.
  ([eslint-plugin-testing-library — prefer-user-event](https://github.com/testing-library/eslint-plugin-testing-library/blob/main/docs/rules/prefer-user-event.md))

## Risks

- **Only the privileged toggle is fixed.** The report names one screen; the defect has four. A fix
  scoped to what was reported closes the ticket and leaves the product broken in three places, each
  of which will arrive later as its own "crash" report.
- **The fix is made by taking focus away from the control.** The fastest way to stop the scroll, and
  it silently removes keyboard and assistive-technology operation of every switch in the product.
  This is the one repair that must not be shipped.
- **The verification is rewritten and still cannot fail.** The failure mode already happened once.
  If the new check asserts on presence or content instead of position, or activates the control
  programmatically, the suite goes green again over an unfixed defect — and this time with everyone
  believing the path is covered.
- **The siblings are assumed rather than measured.** Declaring the file picker clear without driving
  a real pointer at it repeats, on a smaller scale, the exact reasoning that produced the false "not
  reproducible" verdict.
- **The process lesson stays in this file.** If it is not written where the next person writing a
  check will read it, the next defect of this class is found the same way: by a human, in a
  screenshot, after certification.
- **The superseded analysis is cited later as evidence.** It is a well-argued document reaching a
  wrong conclusion, which is the most quotable kind. Without supersession notes at its own
  conclusions, someone will reach for "seven attempts, two builds, does not reproduce".
- **The correction disturbs the layout it fixes.** Changing what the hidden control is measured
  against is a small change with a wide blast radius across four screens; a switch that now overlaps
  its neighbour, or sits behind something, would be a regression introduced by the repair.

## Scope

**In scope**

- Correcting the shared switch control so that operating it never displaces the surface it lives on,
  across all four of its consumers — plugins, container logs, container detail, container create.
- Preserving the switch's appearance, behaviour, keyboard operation and assistive-technology
  legibility unchanged.
- Establishing by real-pointer measurement whether the file-picker's hidden control and the
  button-with-description's hidden text share the defect; correcting whichever does, and recording
  whichever does not as measured-clean and leaving it untouched.
- Replacing the bug-2 coverage with verification that measures the surface's position after a real
  pointer interaction, in the reported dialog and in at least one scrolling detail panel, and
  strengthening rather than deleting what is already there.
- Recording both halves of the testing lesson — real pointer, and measure what moves — in
  `CLAUDE.md` alongside the project's existing non-negotiable rules.
- Supersession notes on
  [`docker_management_app-privileged_toggle_verification.md`](docker_management_app-privileged_toggle_verification.md)
  at the points where it states its verdict, so it is not read as current. Applied by the human; the
  sites are recommended, and that file is not otherwise edited.

**Out of scope**

- Any redesign of privileged mode, of the container create form, or of the switch's appearance or
  placement.
- Cross-engine or cross-browser verification as a new standing capability — the cause is
  engine-independent, so the argument that previously justified considering it no longer holds.
- Error boundaries and failure reporting, raised as a separate item by the earlier analysis and still
  separate: they would not have prevented this defect, since nothing failed.
- Auditing the whole library for unrelated positioning defects. This fix covers the switch and the
  two named siblings; a wider sweep is a separate, separately justified piece of work.
- Rewriting the superseded analysis. It stands as the record of a wrong conclusion and the evidence
  for the process lesson.
- bug-3, which remains in `bugs.md` and is taken separately.
