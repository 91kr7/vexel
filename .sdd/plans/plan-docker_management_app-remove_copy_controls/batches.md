---
slug: docker_management_app-remove_copy_controls
date: 2026-08-14
spec: .sdd/analysis/docker_management_app-remove_copy_controls.md
requirements: .sdd/plans/plan-docker_management_app-remove_copy_controls/requirements.md
status: validated
---

# Batches — Every copy affordance leaves the client

Fix of the delivered product; bug-5, the last of a tranche of five worked one at a time. **One batch.**
Batch numbers and `REQ-n`/`INT-n` ids are local to this plan.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · copy-affordance-removed | F1–F8 — every copy affordance leaves the client: the controls on eight screens, the one component behind all of them, its export, the item field that switched it on, its confirmation state, the two containers it emptied, and every record and check written while it existed | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35 | — | implemented | **Start where the screenshot was, then refuse to stop there.** Images & layers → click an image row with the mouse → the panel shows **the same nine properties with the same values, and no `Copy` beside `Id`**. The `Id` band is now **the same height as every other band** — 33px against the 43px it was — so the property section reads as data, which is the whole visible gain. **Then check that nothing was bought with it**: the `Id` still reads `sha256:` plus twelve characters, unwidened; scroll to `Raw payload` below, where **no control sits above the block and no empty strip is left where one was**, and select the full id out of the JSON with the mouse — that is now the only route to it, and it must actually work. **Then the rest of that screen**: the layer explorer's `Build step`, and `Browse filesystem…` → select an entry → its `Path` — no control on either, and bug-3's metadata pane otherwise **visually unchanged**. **Then Containers**: `Inspect` → `Id` and `Image` bare; the health-log blocks bare; `Raw payload` bare; the logs view showing **`Download` and nothing else above the stream** — download a log and confirm the file holds the **whole** buffer, because putting a log on the clipboard is a capability that ends here and `Download` is what replaces it. **Then Compose with no project selected**: the stream's action row is **not there at all** — not an empty strip, not a gap, nothing — which is the one place where removing the only other child of a row leaves a row with no children. **Then Volumes & networks, Plugins, Registries** — mountpoint, plugin name, pull reference, every raw payload — and **Raw console**, where every entry keeps `Re-run` and its status badges and **only** the copy is gone, on every entry in the transcript and not merely the first. **Then Swarm, which is the one that costs something**: node, secret, config and service ids, a service image — all bare — and the two join tokens, **still masked, still revealed by `Show`, still rotatable, and no longer takeable without being shown on screen**. That is a real loss of the tranche and it is on the record as REQ-21; if it is unacceptable it is a new report, not a bug in this one. **Then the half a screenshot cannot show.** Open the devtools console on each screen and confirm **nothing reaches the clipboard**: not `navigator.clipboard`, not `writeText`, not `execCommand`. `grep` the client for those three and for `CopyButton`, `copyValue` and `Copied` and find **nothing at all** — in `client/src`, in `client/test` and in `client/e2e`. **`client/src/ui/controls/CopyButton.tsx` does not exist**, and neither does its line in `client/src/ui/index.ts`: a component left in the library unused is the product still shipping the thing he asked to remove, in the one place he cannot see it. **Thirteen `copyValue` props are gone, not twelve** — the analysis's total was short by one and its list was right; the enumeration in `requirements.md` is the checklist. **Then what must not have moved**: no server file in the diff; `check-ui-conformance.mjs` **unmodified** and passing; no blur value written; no `style`, no raw tag, no CSS in feature code; bug-4's column counts **identical at the same measured section width** — the section is shorter, and that is all — and bug-1's dialog, bug-2's route and bug-3's layout untouched. **Then the records**: `.sdd/modules/` names no `CopyButton` and describes no copy affordance anywhere it does not ship; `specs/copy-button.md` is **deleted**, not emptied; `plan-docker_management_app/REQ-26` carries a **dated amendment** narrowing "copyable" to "viewable and selectable" **beside** its delivered text, with the reason (the base analysis has no clipboard requirement at all), so the next reader sees a withdrawal and not a regression; and bug-4's REQ-32, the fence that reserved this control, carries its **discharge**. **Then the evidence the checks could have caught it**: INT-1, INT-2 and INT-3 were **run against the delivered build before INT-4 to INT-7 existed and observed failing, with their figures** — one clipboard implementation, five render sites, thirteen props, twenty-four sites, every instance labelled `Copy`, a 43px `Id` band against 33px neighbours — beside the same figures after. **A check that only searched for the string `Copy` is refused even if it is green**: the component's own `label` prop made an icon-only instance one edit away, and that check would have passed on a build still shipping one. **Test runs are batch-scoped**: `npm run lint`, `npm run test:typecheck -w client`, `npm run test -w client`, and this batch's e2e specs each on their own. The complete suites are the human's, at the end of the tranche. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases. On green tests a batch goes to `certified`.

Batch file: [`batches/batch-copy-affordance-removed.md`](batches/batch-copy-affordance-removed.md).

## Why one batch, written down because the instinct on a 24-site removal is to slice it

**The removal does not divide into halves that compile.** Deleting `CopyButton` breaks all five
library render sites in the same compile; removing `copyValue` from the definition-list item type
breaks all thirteen feature props in the same compile. A batch that did the library and left the
features, or did four screens and left four, would leave the tree failing `tsc` and would close **no
requirement** — every REQ in F1 is stated over the shipped client as a whole, and a client that does
not build ships nothing. That is the test the dogma actually asks: not "is this a lot of files" but
"does this batch close a requirement on its own".

**The tempting splits are all layer splits wearing a feature's clothes**, and each is refused for a
reason of its own:

- **"Product change, then records."** The records are not a follow-up: a spec describing a deleted
  component and a delivered requirement reading "copyable" are the same orphan as an unused file
  (REQ-22, REQ-23), and the analysis puts them in scope for exactly that reason. A second batch
  holding them would be a documentation batch closing nothing observable.
- **"Library, then feature call sites."** The canonical layer split, and here it does not even
  typecheck.
- **"One batch per screen."** Eight batches, seven of which close no requirement, because REQ-2 and
  REQ-25 are statements about the *client*, not about a screen: "nothing reaches the clipboard" is
  false until the last site is gone. It would also hand the report its own named risk — *only the
  screenshot's instance is done* — as a schedule.
- **"Checks first, removal second."** The checks are not a deliverable of their own; they are the
  evidence this batch is judged on, and they are ordered inside it (INT-1 to INT-3 written and run
  red before INT-4 to INT-7 exist).

**This is not a foundation batch and no enabling intervention is declared**: every intervention here
serves at least one requirement in its own right.

**The blast radius is wide but shallow, and the split that would have been justified does not exist
here.** bug-4 split into two because a shared component's default changed under twenty call sites
that state nothing, and a second, separable slice retired an API. Nothing here is separable in that
way: there is one component, one behaviour, and it goes.

## Assumptions and decisions

- **The corrected inventory governs: 13 `copyValue` props, 24 instance sites, 8 screens.** The
  analysis's lists were right throughout and three of its totals were not; the figures were checked
  against `client/src` at the requirements gate, the human's delegate confirmed the correction, and
  **the analysis has since been corrected in place** (commit `5f5aa2e`), so the two documents agree.
  The sentence *the enumeration governs, never the figure* stays in `requirements.md` because the
  next reader's temptation is to copy a total rather than recount.
- **INT-4 to INT-7 are one compile unit and land together.** The tree does not typecheck between
  them — removing `copyValue` from the item type invalidates thirteen call sites, deleting the
  component invalidates five render sites — so they are numbered for reading order, not for
  independent landing. An implementer who runs `tsc` between them will see red that means nothing.
- **The two emptied containers are resolved inside the library** (REQ-31), and the plan states the
  *outcome* rather than the mechanism: a row with no children draws nothing. Whether that is the
  element not being rendered at all (`LogStream`, which already renders `Download` conditionally) or
  a stylesheet rule that stops the row consuming its parent's gap (`.ui-code-viewer__actions`, whose
  only child the control was) is the implementer's call, recorded on the spot. A `:empty` rule and a
  conditional render are both acceptable; a strip of dead space above six raw payload blocks is not.
- **`RevealableValue` survives, and its stated purpose changes.** Its contract reads *"masked until
  an explicit reveal, copyable without ever being shown"* — the second clause is exactly what this
  report withdraws. The component keeps `Show`/`Hide`, its masked default, its disabled state and its
  action slot; its spec and its index row are rewritten to say what it now does (REQ-22), rather than
  the component being deleted for having lost half its reason to exist. Deleting it would remove a
  capability nobody asked to lose.
- **The `Copied` string and its 1.5-second timer leave with the component** (REQ-4): they live
  nowhere else, so no separate intervention is needed and none is declared.
- **The conformance check is not modified** (REQ-32). The removed control carried no selector, token,
  blur or z-index, so `blurAllowedOverlaySelectors` and every rule in
  `client/scripts/check-ui-conformance.mjs` stand. **An edit to that file during this batch is a
  signal that the removal went somewhere it should not have**, and is reported rather than made.
- **The records sweep is wider than the analysis's list of twelve, and is a sweep with judgement.**
  `.sdd/modules/` holds **28 files** matching `copy`/`clipboard`, against the twelve records the
  analysis enumerates. Most of the difference is other meanings — a *copy of* an image, copy-on-write
  layers, `docker cp` — which stay. So INT-11 is written as: the named records go, the remainder are
  swept, and **each mention kept is kept because it means something other than the removed
  affordance**. A fixed list of twelve would leave the rest describing a control that does not ship.
- **REQ-26 and bug-4's REQ-32 are amended in place, as dated amendments beside the delivered text**
  (INT-12), on the human's decision at the requirements gate and on bug-4's own precedent from this
  same day. Not an edit that hides what the requirement used to say: a reader of the delivered plan
  must find the narrowing on the page they are already reading, with its reason.
- **Coverage is removed only where the behaviour it covered is removed.** The copy assertions sit
  inside files that also check a panel's content, a revealable value's disabled state and a console
  entry's transcript; those survive, restated where they must be. Nothing is neutered to make a run
  go green, and the three `grantPermissions(['clipboard-read', 'clipboard-write'])` calls go with the
  assertions they served rather than staying as decoration.
- **The runtime half of REQ-25 is observed, not inferred.** A source-level grep (INT-1) cannot see a
  clipboard write that arrives through a bundled dependency or a dynamic property access, so INT-2
  instruments the page and asserts **no clipboard write occurs** while the eight screens are driven.
  The two halves are deliberately different mechanisms; either alone is the check this report warns
  about.
- **Swarm geometry is not assumable on a daemon that is not a swarm manager.** Nothing in this suite
  may initialise one; the swarm surfaces' checks skip with their reason stated (REQ-35), exactly as
  bug-4's did, and the join-token verification (REQ-21) is subject to the same condition.
- **No server change, and no `bugs.md` edit.** `bugs.md` is the human's own input file for the
  tranche; the plan folder and the commits are the record, as in the four sibling plans.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` and the rules in `CLAUDE.md`; the canonical commands come from `.archi`.

## Departures from the spec

**None.** Nothing in this plan contradicts the analysis, and the one factual disagreement was
resolved by correcting the analysis rather than by departing from it: its totals of "twelve props",
"twenty-two instance sites" and "nine screens" were each short against its own enumeration, the
corrected figures (13 / 24 / 8) were validated at the requirements gate, and the analysis was amended
in place before this file was written. **No spec correction remains outstanding.**

Two decisions were taken beyond the analysis's literal text, both recorded above with their reasons
and neither widening what is touched: `RevealableValue` is kept with a rewritten contract rather than
deleted, and the records sweep is defined as a sweep with judgement over `.sdd/modules/` rather than
as the analysis's fixed list of twelve.

## Coverage check

**Every REQ is served by at least one INT, and every INT serves at least one REQ.** No enabling
intervention is declared: there is none. **Every REQ closes in batch 1**, there being only one, so
no requirement is split across batches.

**One qualification, stated rather than buried.** REQ-19, REQ-20 and REQ-21 each have two halves: a
**verifiable** one — the fallback that remains is present and works — which INT-2 serves and
measures, and a **recorded** one, which no intervention can build because it is a consequence to be
read rather than a behaviour to be checked. That half is discharged by `requirements.md` F5, which
states each cost in the plan record where the human will find it, and by the implementer repeating
the three of them in the batch report. They are listed below against INT-2 on the strength of the
first half; the second half is why they are requirements at all.

**REQ → INT.**

| REQ | Interventions serving it | Closes in |
| --- | --- | --- |
| REQ-1 | INT-4, INT-5, INT-7 (verified by INT-2) | 1 |
| REQ-2 | INT-5 (verified by INT-1, INT-2) | 1 |
| REQ-3 | INT-4, INT-5, INT-6, INT-7 (verified by INT-2) | 1 |
| REQ-4 | INT-5 (verified by INT-1, INT-2) | 1 |
| REQ-5 | INT-10 (verified by INT-1) | 1 |
| REQ-6 | INT-5 (verified by INT-1) | 1 |
| REQ-7 | INT-4 (verified by INT-1, INT-2) | 1 |
| REQ-8 | INT-4 (verified by INT-1, INT-8) | 1 |
| REQ-9 | INT-7 (verified by INT-1, INT-2) | 1 |
| REQ-10 | INT-4, INT-5, INT-6, INT-7, INT-8, INT-10 (verified by INT-1) | 1 |
| REQ-11 | INT-4, INT-6 (verified by INT-3) | 1 |
| REQ-12 | INT-4, INT-6 (verified by INT-3) | 1 |
| REQ-13 | INT-4, INT-6 (verified by INT-3) | 1 |
| REQ-14 | INT-4, INT-6 (verified by INT-3, INT-9) | 1 |
| REQ-15 | INT-4, INT-6, INT-7 (verified by INT-3, INT-9) | 1 |
| REQ-16 | INT-4, INT-7 (verified by INT-2) | 1 |
| REQ-17 | INT-4, INT-6 (verified by INT-2) | 1 |
| REQ-18 | INT-4, INT-7 (verified by INT-2) | 1 |
| REQ-19 | INT-2 (+ `requirements.md` F5, see the qualification above) | 1 |
| REQ-20 | INT-2, INT-4 (+ `requirements.md` F5) | 1 |
| REQ-21 | INT-2, INT-4 (+ `requirements.md` F5) | 1 |
| REQ-22 | INT-11 | 1 |
| REQ-23 | INT-12 | 1 |
| REQ-24 | INT-9, INT-12 | 1 |
| REQ-25 | INT-1, INT-2 | 1 |
| REQ-26 | INT-2 | 1 |
| REQ-27 | INT-2, INT-3 | 1 |
| REQ-28 | INT-1, INT-2, INT-3 | 1 |
| REQ-29 | INT-2 | 1 |
| REQ-30 | INT-8, INT-9, INT-10 | 1 |
| REQ-31 | INT-4, INT-5, INT-6, INT-7 | 1 |
| REQ-32 | INT-4, INT-5, INT-6 | 1 |
| REQ-33 | INT-4, INT-5, INT-7 (verified by INT-2) | 1 |
| REQ-34 | INT-4, INT-5, INT-6, INT-7 (verified by INT-3) | 1 |
| REQ-35 | INT-2, INT-3, INT-9, INT-10 | 1 |

**INT → REQ.**

| INT | REQ served |
| --- | --- |
| INT-1 | REQ-2, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-25, REQ-28 |
| INT-2 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-7, REQ-9, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-33, REQ-35 |
| INT-3 | REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-27, REQ-28, REQ-34, REQ-35 |
| INT-4 | REQ-1, REQ-3, REQ-7, REQ-8, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-20, REQ-21, REQ-31, REQ-32, REQ-33, REQ-34 |
| INT-5 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-6, REQ-10, REQ-31, REQ-32, REQ-33, REQ-34 |
| INT-6 | REQ-3, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-17, REQ-31, REQ-32, REQ-34 |
| INT-7 | REQ-1, REQ-3, REQ-9, REQ-10, REQ-15, REQ-16, REQ-18, REQ-31, REQ-33, REQ-34 |
| INT-8 | REQ-8, REQ-10, REQ-30 |
| INT-9 | REQ-14, REQ-15, REQ-24, REQ-30, REQ-35 |
| INT-10 | REQ-5, REQ-10, REQ-30, REQ-35 |
| INT-11 | REQ-22 |
| INT-12 | REQ-23, REQ-24 |

**Three notes on the shape of that mapping**, all deliberate:

- **Three of the twelve interventions are checks, and they come first.** On a removal, the check is
  the deliverable at risk: the product will look right the moment the controls are gone, and the
  report's own first-named risk is a pass that closes it by label while an icon-only instance still
  ships. INT-1 and INT-2 are two different mechanisms answering the same question, and both are
  required (REQ-25).
- **REQ-31, REQ-32 and REQ-34 are served by interventions as constraints, not as work.** They build
  nothing: they are how the diff is judged — no raw markup, style or hard-coded value outside
  `client/src/ui/`, the conformance check unmodified, no server file in the diff, and bug-1 to bug-4
  undisturbed.
- **The two record interventions (INT-11, INT-12) are the only ones outside `client/`**, and they are
  what makes "removed" true rather than merely visible. A spec for a deleted component and a delivered
  requirement reading "copyable" would both survive every screenshot and every green run.

## Risks carried forward

- **Removed by label, not by behaviour.** A pass driven by searching for `Copy` finds every instance
  in *this* build and would still pass a build where one is icon-only or relabelled — the `label`
  prop made that one edit away. The single most likely way to close this report with the defect
  shipping. INT-1 and INT-2 are written so that the string never appears as the criterion.
- **The component is left in the library, unused.** The screens look right, the screenshot satisfies,
  and the product still contains the thing he asked to remove — plus a spec describing it and an
  export offering it to the next feature. INT-5 deletes the file; INT-1 fails if it returns.
- **Only some of the sites are done, and the total is trusted.** The analysis's own totals were short
  by one prop and by one screen; a checklist copied from a figure rather than from the enumeration
  leaves a control shipping and earns a bug-6 with the same one line. The enumeration in
  `requirements.md` is the checklist, and INT-2 covers every row of the three per-row sites, not the
  first row.
- **A replacement sneaks in.** Copy-on-click on the value, a context-menu entry, a keyboard shortcut,
  a `title` carrying the full id — each well meant, each the same affordance renamed, each a direct
  contradiction of an instruction that could not be plainer (REQ-3).
- **An empty action row or a stray gap is left behind.** The code viewer's row had no other child;
  the log stream's has none whenever no download is offered. A strip of dead space above six raw
  payload blocks is a cosmetic defect introduced by a cosmetic fix, and it is the most likely thing
  to be noticed by the human before the check notices it (INT-3).
- **A value becomes unselectable, truncated or ellipsised in the tidy-up.** Someone "finishes" a band
  by clamping the value to one line — turning a convenience loss into a data loss, on precisely the
  values the operator now has to select by hand (REQ-17).
- **bug-4 is disturbed.** Its 43px note, its `Id`-band assertion and its wrap heuristic were measured
  **with the control present**. The trap is re-tuning its column rule to "restore" a height that
  changed for this reason: the minimum band width derives from `Created`, not from the `Id` band, so
  **no column count moves** and any change to one is the signal that the fix went into the wrong
  component (REQ-15, INT-3).
- **Coverage is deleted wholesale.** The copy assertions sit inside files that also carry the panel's
  content, the revealable value's disabled state and bug-4's whole property-list contract. Deleting
  files takes unrelated coverage with them, invisibly (INT-8, INT-9, INT-10).
- **The join-token change goes unremarked** and returns as a security complaint from a human who was
  never told that `Show` is now the only route (REQ-21).
- **The log-buffer gap goes unremarked** — a whole log can no longer be put on the clipboard at all,
  and on Compose without a selected project there is no `Download` either (REQ-20).
- **Clipboard grants and stubs are left as decoration**, so the suite still asks a browser for
  permissions nothing uses: dead scaffolding that hides the removal's completeness from the next
  reader (REQ-5).
- **The report is closed on a screenshot.** "The `Copy` is gone from the `Id` band" is one instance of
  twenty-four, and it is the one instance the human already saw.
