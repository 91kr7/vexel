---
request_slug: docker_management_app-image_row_actions
date: 2026-08-12
type: evolution
reference: .sdd/analysis/docker_management_app.md
superseded_in_part_by: .sdd/analysis/docker_management_app-image_row_actions-panel_actions_to_menu.md
---

> **⚠ Partially superseded.** This file recorded, in four places, that the image detail panel's four
> action buttons — `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…`,
> `Compare with…` — stay where they are. **The human overrode that after seeing the delivered
> result**, and those four now move into the image row's overflow menu, leaving the panel's action
> bar empty. See
> [`docker_management_app-image_row_actions-panel_actions_to_menu.md`](docker_management_app-image_row_actions-panel_actions_to_menu.md).
> Everything else in this file stands, and the superseded passages are kept as written — they are
> the record of what was decided at the time and why, not an error to erase.

## Request

> - change-3
>     image: bugs-screen/change-3.png
>     all action must be moved in a submenù as done for the change-1

(Typos preserved as written and read as intended: "submenù" = the overflow menu introduced by
change-1; "action" = actions. The request arrived as one item in a list; the three that remain —
bug-1, bug-2, bug-3 — are being taken through the workflow separately and are not analysed here.)

The request names a screenshot, `bugs-screen/change-3.png`. Unlike its two predecessors' images,
this one shows the **current** state to be changed, not a target. What it shows, read directly:

- The end of an images list row, under an `ACTIONS` column header, holding six flat buttons in one
  strip: `run`, `tag`, `untag`, `push`, `save`, `remove` — the last outlined and lettered in the
  destructive tone, the other five uniform. The labels are lower case, the CLI vocabulary of the
  original mockups.
- Below it, the image detail panel's action bar: `Explore layers…`, `Efficiency & signals…`,
  `Browse filesystem…`, `Compare with…`, and set apart to their right a round `✕`.

There is no picture of the intended result. The arrangement is therefore decided by the request's
words, by the pattern change-1 established, and by the decisions recorded under Assumptions.

## Reference

Previous analysis: [`.sdd/analysis/docker_management_app.md`](docker_management_app.md).
Sibling evolutions of the same analysis:
[`docker_management_app-container_row_actions.md`](docker_management_app-container_row_actions.md)
(change-1, merged — the pattern this request invokes by name),
[`docker_management_app-container_detail_close.md`](docker_management_app-container_detail_close.md)
(change-2, merged — the panel-dismissal rule this change applies to a second screen),
[`docker_management_app-about_license_notice.md`](docker_management_app-about_license_notice.md),
[`docker_management_app-single_process_serving.md`](docker_management_app-single_process_serving.md).

**Starting point.** The reference analysis established Vexel as a single-operator, local-first client
exposing the full functional surface of a Docker installation behind a consistently applied "liquid
glass" interface, with layer-aware image inspection as a stated differentiator. Under image
management it required the complete set of operations — list, inspect, pull, push, tag, remove,
prune, save/load as tarballs, run a container from an image — as first-class capabilities, and said
nothing whatever about how they should be laid out on a row. It also required destructive operations
to be "confirmable and clearly distinguishable in the interface to prevent accidental data loss", and
the glass aesthetic to stay legible and usable under extended operational work. The delivered images
row follows the accompanying mockups' convention of putting every applicable action flat on the row
in CLI lettering.

Two merged predecessors bear directly on this change, and both deliberately excluded this screen:

- **change-1** reorganised the *containers* row: three lifecycle actions stayed, the rest moved
  behind a single trailing overflow control. It built the affordance as a generic, domain-agnostic
  part of the shared UI library precisely so that other object lists could reuse it unchanged, named
  the images screen as the one already queued, and recorded "the next screen re-implements it instead
  of reusing it" as a risk. It placed the same reorganisation on any other screen out of its own
  scope, images explicitly among them.
- **change-2** removed the `✕` from the *container* detail panel and, in doing so, gave the shared
  panel the ability to present with or without a close control, governed by a stated rule: **the
  close control is absent where the panel's opening gesture also closes it, and present where it is
  the only way out.** It left the images panel's `✕` standing, for one stated reason and no other —
  that the images screen was change-3's subject, and a regression there had to stay attributable to
  change-3 — recorded the resulting inconsistency as accepted and temporary, and named the removal as
  the follow-up owed once change-3 reached this screen.

**Changes:**

- **The images row's action area is emptied into a menu.** All six actions — `run`, `tag`, `untag`,
  `push`, `save`, `remove` — move behind a single overflow control at the end of the row. The row's
  action area then holds that control and nothing else. No operation is added and none is taken away.
- **"As done for the change-1" is read as the mechanism, not the ratio**, and that distinction is the
  sentence a later reader will need. What is reused is change-1's *apparatus*: the same trailing `…`
  control, the same menu, the same destructive tone and grouping, the same stable entry shape with
  inapplicable entries disabled rather than removed. What is **not** carried over is change-1's
  particular split between what stays and what moves — that is the part the two requests vary, and
  where a split was wanted it was specified. change-1 said "only the most used" and named what to
  move; change-3 says "all".
- **The product states, out loud, the rule that makes the two screens differ on purpose:** *a row
  carries a permanently visible action only when that action is taken on nearly every visit **and**
  completes without asking for anything.* Containers pass it — stop, pause and restart act at once.
  Images fail it, and both conditions do the work — no action passes both. `run` fails immediacy:
  it opens the full create-and-run form with the image pre-filled, so the click a permanent button
  would save is a click into another click. `save` fails frequency: it is the one action that does
  act at once (a download and a toast, no dialog), but exporting an image to a tarball is an
  occasional operation, not something done on nearly every visit to this list. The rest ask for
  something first. Written down so the difference between the two lists reads as a decision, not as
  drift.
- **The row's fixed-geometry argument does not transfer, and is not reproduced.** change-1 kept three
  slots in fixed positions substantially for a correctness reason: the containers list changes state
  beneath the pointer, so a slot had to mean the same thing at all times. An image has no state and
  no transitions; nothing about an images row changes under the operator except its tags. Remove that
  reason and no principled line divides `run` from `tag` from `save`.
- **The image detail panel loses its close control.** The round `✕` goes; the row that opened the
  panel closes it, and `Escape` closes it. This applies change-2's rule to the second and last
  consumer of the shared panel, which qualifies under it without fresh judgement. It is the follow-up
  change-2 named, arriving with the change that owns this screen.
- **The image detail panel keeps its four action buttons.** `Explore layers…`,
  `Efficiency & signals…`, `Browse filesystem…` and `Compare with…` are untouched. This is where the
  two panels visibly diverge, and it is intended: change-1 emptied the container panel's action area,
  whereas this panel loses only its close control and keeps a populated action bar.
  **⚠ Superseded.** The human overrode this after seeing the delivered result: the four move into the
  row's overflow menu and this panel's action bar is emptied too, so the two panels no longer diverge.
  See `docker_management_app-image_row_actions-panel_actions_to_menu.md`.
- **Nothing else changes.** No operation changes what it does, no confirmation is relaxed, no new
  Docker capability appears, no data or API behaviour is affected, and the reference analysis's scope,
  constraints and risks stand untouched.

## Summary

Move every action on the images list row — `run`, `tag`, `untag`, `push`, `save`, `remove` — into a
single overflow menu at the end of the row, reusing the affordance change-1 built, so the row's
action area holds only that control; and remove the `✕` from the image detail panel, which change-2's
rule already condemned and which this change owns.

## Business goal

**Six buttons on every row, and not one of them is a click away from anything.** The images row
presents the full set of image operations as equally urgent and equally immediate, and it is neither.
Every one of the six opens a form or asks for a confirmation before it does anything: `run` opens the
create-and-run form, `tag` asks for a name, `save` produces a tarball, `remove` confirms. A strip of
six controls that all lead somewhere else is not a control panel; it is a menu drawn flat across a
table row. Presenting it as a menu is not a loss of immediacy, because there was none to lose — which
is exactly why "all" is the right answer here and was not the right answer for containers.

**The images table is the wide one, and the actions are eating it.** The row carries repository and
tag, image id, platform, size and creation time — the widest data set of any list in the product —
and then six controls beside it. The screenshot shows the result: the data columns are compressed
against a strip of buttons that ends at the panel edge. Collapsing that strip to one control returns
the width to the information the operator opened the screen to read. On a product whose stated
differentiator is visual quality and layer-aware inspection, the screen where images are inspected
should not be the screen where the data is thinnest.

**Frequency is not the argument here — completion is.** change-1's split rested on how often an
operation is reached for, and the requester's judgement supplied the line. That evidence does not
exist for images and no telemetry will ever produce it, because the reference analysis rules
telemetry out. So this change rests on a property that can be checked instead of estimated: whether
an action finishes on the click. The one candidate for staying — `run`, the verb the whole screen
arguably exists to serve — was checked, and it opens a form. The click a permanently visible button
would have saved is a click into another click. With that gone there is no candidate at all, and the
row's action area has nothing left that earns permanent space.

**One place to look, applied to a second screen.** change-1's real gain was not five fewer buttons;
it was that after it there is exactly one place to look for everything that can be done to a
container. The same gain, delivered identically, is what makes the product feel like one application
rather than a set of screens that each solved the problem their own way. The affordance exists,
is certified, and is domain-agnostic by construction; reusing it is what turns a containers-screen
decision into a product-wide convention. Building a second one that behaves almost the same is the
precise divergence the project's single-visual-language rule exists to prevent, and change-1 named
that as the risk this change most has to avoid.

**Destructive protection, on the object where destruction is quietest.** `remove` sits at the end of
the strip in the destructive tone, one pointer-width from `save`, in a list that re-sorts and
re-populates as images are pulled, built and pruned elsewhere on the machine. Removing an image is
not like stopping a container: nothing announces it, the image may be the only local copy of
something not held in any registry, and the row simply disappears. Moving `remove` behind a
deliberate step, into a group visually set apart from the entries above it, is the "clearly
distinguishable" treatment the reference analysis demanded, delivered as position and grouping rather
than colour alone — and it removes nothing from behind it, since the confirmation stays exactly as it
is.

**And the `✕` is a decision already taken, coming due.** change-2 established that a detail panel
carries a close control exactly when it has no other way out, and built the shared panel's variant to
express it. The image panel is opened by a reversible row toggle, so the rule already answers it. The
control survived one change for a single procedural reason — that a regression on this screen had to
remain attributable to change-3 — and that reason expires the moment change-3 is the change working
on this screen. Applying it now costs one glyph and closes an inconsistency that change-2 itself
warned would start to look like a design decision the longer it stood. Deferring it costs a fourth
change to the same screen for the same glyph.

## Requirements

The two halves below are stated separately and are separately verifiable. A failure in one must be
identifiable as such: they touch different surfaces — the row's action area and the panel's close
control — and neither depends on the other to be correct.

### Functional — the row's actions (half one)

- **The images row's action area holds exactly one control: the overflow control.** No other
  action-bearing control belongs on the row, in any state of the image, and no action-bearing glyph
  is placed anywhere else on the row as a substitute.
- **The overflow control is present on every image row, in the same final position, always.** It is
  never conditional, never hidden until hover, and never the thing that moves. A row with no
  applicable action still carries it, with its entries disabled, because a row whose control
  disappears cannot be told from a row whose control failed to render.
- **The menu lists all six operations, in this order:** `Run…`, `Tag…`, `Untag`, `Push…`, `Save`,
  `Remove`. The first five are the ordinary group; `Remove` is the destructive one. The ellipsis
  follows what each operation actually does: `push` always opens a dialog collecting the reference,
  so it carries one; `save` opens nothing at all, so it does not.
- **`Remove` is visually marked as destructive and set apart from the entries above it**, in the same
  treatment change-1 established for `Kill` and `Remove` on the container menu, so the entry that
  cannot be undone is identifiable before it is read.
- **Entry labels are human-readable, and the ellipsis convention is applied consistently:** an entry
  that opens a form or asks for a value before it acts carries a trailing ellipsis; an entry that only
  asks for confirmation does not. `Run…` carries one — it opens the create-and-run form with the image
  pre-filled, and the current row label's lack of an ellipsis is a labelling inconsistency this change
  corrects rather than preserves. Which of the remaining operations ask for input is a property of the
  flows that already exist, not a decision of this analysis; the requirement is that the convention be
  applied to what they actually do.
- **An entry that does not apply to the image is shown in place and disabled, not removed.**
  `Untag` and `Push` are the standing case: an image with no tags cannot be untagged or pushed, and a
  dangling `<none>` image is a normal, common inhabitant of this list. The menu's shape must not
  change between openings, for the same reason change-1 gave: a menu whose items move cannot be used
  quickly, and an item that vanishes is indistinguishable from a capability the product does not have.
- **Why an entry is unavailable must be discoverable** rather than left as an unexplained grey line —
  the operator must be able to tell "not for this image, because it has no tags" from "broken".
- **Every operation reachable today stays reachable, and behaves identically.** Same effect, same
  form, same confirmation, same success and failure feedback, same live update of the list afterwards.
  Any observable difference in what an action *does* is a defect of this change, not a consequence of
  it.
- **Confirmation of `Remove` is unchanged.** Being behind a menu is an additional step, never a
  substitute for the confirmation the reference analysis requires.
- **At most one row's menu is open at a time**, it is unambiguously attached to the row it belongs
  to, and opening another row's menu closes the first.
- **The menu closes on dismissal** — choosing an entry, `Escape`, clicking away, or otherwise leaving
  it — and returns the operator where they were.
- **An open menu is always fully readable**, including for the last rows of a long list and inside a
  scrolled panel. A menu clipped by the edge of the table would hide the very entries this change
  moves into it, and after this change it hides *all* of them.
- **The menu is operable without a pointer**, in the conventional way for such a control, and every
  entry carries a real text label — no icon-only entries.
- **A menu must never act on the wrong image.** The images list is live: images appear when pulled or
  built, vanish when removed or pruned — by this application, by the operator's own CLI, or by a
  build running elsewhere on the machine — and the list re-sorts around them. The menu must remain
  bound to the image it was opened for, or close, and must never apply an operation to an image that
  has taken its place. `Remove` on the wrong image is irreversible and silent.
- **No second menu affordance is introduced.** The row's control and its menu are the ones change-1
  built and the product already ships; this screen consumes them. Adding a near-duplicate, or
  extending the existing one with an images-specific variant that another screen could not use, is a
  defect of this change.

### Functional — the panel's close control (half two)

- **The image detail panel presents no close control.** The round `✕` is removed, not hidden, not
  disabled, not moved elsewhere on the panel, and no replacement affordance is introduced in its
  place: the row is the affordance.
- **The panel keeps its four actions unchanged.** `Explore layers…`, `Efficiency & signals…`,
  `Browse filesystem…` and `Compare with…` stay exactly where they are, in the same order, with the
  same behaviour, including `Compare with…` being unavailable when there are not two images to
  compare. This half removes a control; it does not reorganise the action bar.
  **⚠ Superseded**, including the `Compare with…` clause: the four move into the row's overflow menu,
  and `Compare with…` started from a row takes that row's image as the left-hand side. See
  `docker_management_app-image_row_actions-panel_actions_to_menu.md`.
- **Selecting the already-selected image row closes the panel**, and selecting a different row
  re-points the open panel at that image. This behaviour exists and is unchanged; what changes is its
  standing — it becomes the only pointer-driven route out, so it must be covered by the product's
  automated verification rather than merely be true.
- **`Escape` closes the panel**, as the substitute for the removed control, exactly as change-2 added
  it for the container panel.
- **`Escape` is arbitrated innermost-first: the panel closes only when nothing inside or above it has
  claimed the key.** This screen now has more claimants than the container screen had when change-2
  was written, and this change adds one of them: **the row's overflow menu takes `Escape` before the
  panel does**, and any dialog or flow opened from the panel — the filesystem browser, the layer
  explorer, the comparison flow, the create-and-run form reached from the menu — takes it first. The
  panel is the outermost claimant and takes the key last.
- **`Escape` acts on the panel only while a panel is open**, and never otherwise changes what is
  selected or displayed.
- **Dismissal must not leave the operator's point of interaction on something that no longer
  exists.** It lands somewhere stable in the images list. As recorded by change-2, rows are not
  keyboard-operable, so the disclosure model's full behaviour — focus returning to the owning row —
  remains contingent on a separate change and is not required here.
- **The bond between an open panel and its row must be unmistakable.** With the `✕` gone, the visible
  open state of the owning row is the only remaining cue that the row is the way back, and it carries
  the whole discoverability burden of this half.
- **The panel must never outlive its row without a way out**, and on this screen that case is not
  hypothetical: `Remove` is reachable from the very row whose panel is open, and inspecting an image
  before deleting it is the ordinary reason to open the panel at all. When the image is removed,
  pruned, or filtered out of the list while its panel is open, the reciprocal gesture goes with it and
  the panel must resolve itself rather than remain open with no route out. Pulls, builds and prunes
  originating outside the application produce the same situation without any action by the operator.
- **The shared panel's existing presentation variant is used as-is.** change-2 built the ability to
  present with or without a close control; this change selects the second for the images panel. No
  new variant, and no images-specific panel.

### Non-functional

- **Discoverability must not regress on balance, and this is the half of the trade that must be
  earned.** Six operations move one step away and *nothing* is left in their place — a stronger
  version of the same trade change-1 made. The overflow control must read unmistakably as "there is
  more here"; an operator who cannot find `run` after this change has been handed a worse product,
  not a tidier one.
- **No regression in the list's live behaviour.** The reference analysis made near-real-time state a
  standing requirement. The list must keep updating at the same rate and fidelity while the new
  control exists and while a menu is open.
- **No regression in the list's responsiveness, at any list length.** The per-row control must cost as
  close to nothing as the six buttons it replaces — it should cost measurably less. The project's
  standing rule that the main view pays nothing for the glass material applies without exception.
- **No new overlay surface, and nothing joins the interface's blur allow-list.** The menu surface
  already exists and was admitted with change-1 on the stated grounds that at most one is open at a
  time; this change adds a consumer, not a surface. Removing the `✕` adds nothing. Any new entry on
  that allow-list would be a defect of this change.
- **Legibility over the glass material.** The menu opens over dense image data; its labels, its
  destructive tone and its disabled states must all remain readable in that condition.
- **This change must not worsen keyboard or assistive-technology reachability.** Six buttons that were
  trivially reachable become a menu, which is only as reachable as it is deliberately built to be —
  and the panel's labelled dismissal control is removed, with `Escape` as the guarantee that replaces
  it. Both halves are accessibility-neutral only if both are done properly.
- **Existing automated checks that drive these actions or close this panel are rewritten, not
  deleted.** Reaching an action through the menu, and closing the panel by re-selecting its row or by
  `Escape`, are the correct repairs. Dropping a check because its button no longer exists would hide
  precisely the loss of reachability and dismissability this change must not cause — invisibly, with
  the suite green.
- **The change is verified in the delivered product**, against the operator's real daemon, under the
  project's existing testing discipline: a test creates and destroys its own fixtures, asserts on what
  it created rather than on totals or emptiness, assumes nothing about the daemon's or the
  application's prior state, and passes when run on its own.
- **English only**, per the project's language convention.

## Assumptions

- **This is an evolution of the reference analysis, not a fix.** Stated by the human. Nothing is
  broken: the row does what its mockup specified and the `✕` does what it was built to do; this
  request restates how both should be presented. change-1 and change-2 both placed this screen out of
  their own scope, so this is a scheduled evolution rather than either one's unfinished business, and
  both their files are left untouched.
- **"All action" means all six of the row's actions, and the row is left with only the overflow
  control.** Decided by the human on this analysis's recommendation. The supporting reasons are
  recorded here because a later reader will otherwise re-open the question: the wording changed
  deliberately between two requests written a day apart by the same author about the same kind of
  change — change-1 said "only the most used" and named what to move, change-3 says "all"; change-1's
  survivors were kept substantially for a correctness reason that does not exist on a list whose rows
  have no state; and the one action that could have earned a permanent place, `run`, opens a form
  rather than acting.
- **"As done for the change-1" refers to the mechanism, not the split.** Reused: the trailing `…`
  control, the menu, the destructive tone and grouping, the stable entry shape with disabled entries
  in place. Not reused: the ratio of what stays to what moves, which is precisely what the two
  requests state differently.
- **The asymmetry of being wrong is recorded deliberately.** If an action turns out to be wanted
  permanently on the row, promoting one entry back out of the menu is trivial and disturbs nothing.
  Shipping a partial move against a request that said "all" re-opens the change. This is why the
  literal reading is the safe one, and it is the first thing to revisit if the menu is opened
  constantly for the same entry.
- **The screenshot shows the state to be changed, not the target.** Unlike change-1's, it is a
  photograph of today. It is used to identify the controls in question — the six-button strip and the
  panel's `✕` — and for nothing else. No arrangement is read off it.
- **The menu's order is the row's order.** `Run…`, `Tag…`, `Untag`, `Push…`, `Save` preserve the
  sequence the operator already reads left to right, with `Remove` last and set apart. Keeping the
  learned order costs nothing and removes one thing to relearn; no other ordering has evidence behind
  it.
- **Secondary hints are used only where they carry information the label does not.** change-1 kept
  `SIGKILL` and `rm` as secondary text because those labels had been rewritten into human-readable
  form and the CLI verb would otherwise be lost. Here the labels *are* the CLI verbs — `tag`, `push`,
  `save` — so a hint would merely repeat them. The single exception is `Remove`, whose command is
  `docker rmi` rather than `rm`; carrying that hint mirrors the container menu's destructive entries
  and distinguishes removing an image from removing a container. Default: `rmi` on `Remove`, no hint
  elsewhere.
- **The image detail panel's four buttons are not touched by this request.** They are *panel*
  actions — invoked in the context of an already-open panel, on the image it is showing — and
  `Compare with…` is inherently a two-object operation with its own selection semantics that a
  single row's menu cannot express. The tension is named rather than hidden: change-1 *did* move a
  panel action onto the row's menu, but only because the human named it explicitly, and nothing is
  named here. The visible consequence is that the two panels now differ — change-1 emptied the
  container panel's action area, whereas this panel keeps a populated one and loses only its close
  control — and that is intended.
  **⚠ Superseded.** "Nothing is named here" was true of the request as written; the human named them
  afterwards, on seeing the result. The four move, and the divergence this passage accepted is gone.
  See `docker_management_app-image_row_actions-panel_actions_to_menu.md`.
- **The `✕` removal belongs to this change, and it is the application of a decision already taken.**
  change-2 established the rule and built the variant; the images panel is opened by a reversible row
  toggle, so it qualifies with no fresh judgement. change-2 deferred it for exactly one stated
  reason — that a regression on the images screen had to stay attributable to change-3 — and that
  reason expires now that change-3 is the change working on this screen. The costs come with it and
  are written into the requirements rather than left for the planner: `Escape` on this screen is
  newly contested by the row menu this same change introduces, and the "panel outlives its row" case
  arrives with the removal. Both mechanisms exist and are certified, so the increment is small, but it
  is not nothing.
- **The two halves are separately verifiable on purpose.** If one fails, which one must be
  identifiable. They touch different surfaces and neither is a precondition of the other.
- **The preconditions were verified in the product by the requester, not by this analysis.** This
  analysis is written from the request and does not read the project's code. The facts it is built
  on: the row renders six flat actions labelled from their ids, with `untag` and `push` disabled when
  the image has no tags and `remove` in the destructive tone; the panel renders four buttons plus the
  `✕`, with `Compare with…` disabled below two images; `run` opens the full create-and-run form with
  the image pre-filled rather than acting immediately; the generic menu and the `ActionButtonGroup`
  overflow slot from change-1 and the panel's dismissal variant from change-2 are merged and
  available. The third of these is the fact that settled the scope question above.
- **Standard menu, disclosure and dismissal behaviour is assumed rather than invented.** Where a
  requirement states an obligation — keyboard operation, arbitration of a shared key, not stranding
  the point of interaction — the expectation is the established convention for controls of this kind,
  already implemented in the reused components.
- **No selection, no bulk actions.** Nothing in the request implies acting on several images at once,
  and introducing it would be a materially larger change with its own destructive-action questions.
- **Nothing about the product's data, API or Docker behaviour changes.** This is a presentation and
  interaction change to operations that already exist and already work.

## Constraints

- **Product constraint — reuse is mandatory, not preferred.** The project's non-negotiable rule
  (`CLAUDE.md`) is that every visual element comes from the internal UI library and that a component
  which almost fits is extended rather than duplicated. The menu, the overflow slot and the panel's
  dismissal variant all exist. change-1 named "the next screen re-implements it instead of reusing
  it" as a risk, and this is that screen: a second menu affordance, however small, is the divergence
  the rule exists to prevent.
- **Product constraint — the main view pays nothing for the glass.** The project holds a standing,
  enforced rule about runtime blur with a deliberately narrow allow-list and a single permitted blur
  value. The one surface involved here is already on that list, admitted with change-1 on the grounds
  that at most one is open at a time. Nothing about this change may widen that list, and no per-row
  element may acquire an overlay treatment.
- **Product constraint — destructive operations stay confirmable.** From the reference analysis.
  Moving `Remove` into a menu adds friction in front of it; it removes nothing from behind it.
- **Baseline constraint — change-1 and change-2 are merged and are the starting state.** The row
  reorganisation on containers has happened, the container panel has no `✕`, and `Escape` already
  closes a detail panel with arbitration. A downstream reader working from an older picture of the
  product will be working from a state that no longer exists.
- **Interaction constraint — `Escape` is contested on this screen, and this change adds a
  claimant.** The row menu, any dialog or flow opened from the panel or from the menu, and the panel
  itself all want the key; the panel takes it last. Both halves of this change touch that
  arbitration at once, which is why it is stated as a constraint rather than left as an
  implementation detail.
- **Pre-existing constraint — rows are not keyboard-operable.** Recorded by change-2 and unchanged
  here. The disclosure model this half rests on remains half-implemented in the product: the panel
  behaves like disclosed content, the row does not behave like the control that discloses it. This
  change must not make it worse, and repairing it is a separate request.
- **Domain constraint — image removal is irreversible in a way container removal is not.** An image
  that exists nowhere else — a local build, an image whose registry copy is gone — cannot be
  recovered, and removing it produces no visible event beyond a row disappearing. This is the reason
  the "wrong image" risk below is the sharpest one in this change.
- **Domain constraint — the images list is live and is changed from outside the application.** Pulls,
  builds, prunes and removals happen in the operator's own terminal and in any tooling running on the
  machine, so rows appear, vanish and re-sort under an open menu or an open panel without the
  operator doing anything.
- **Domain constraint — an image may have zero, one or many tags**, which is what makes `Untag` and
  `Push` conditional and makes dangling `<none>` rows a normal inhabitant of the list rather than an
  edge case.
- **Repository constraint — the suite runs against the operator's own daemon.** Verification obeys
  the project's test rules: own fixtures, full cleanup (`docker rm -fv`, ownership labels), no
  assumption of an empty daemon or an inherited application state, every spec passing on its own, and
  no test reaching Docker Hub.
- **Convention constraint — English only**, kebab-case package/folder naming, commands run from the
  repository root.

## Market trends

Relevant, and researched: the reference analysis positions this product against named competitors,
and "how many row actions stay visible" is a settled convention in that category with published
guidance on both sides — so the decision can be checked against prevailing practice instead of taste.
The finding is that the guidance leans against the literal reading, and that its stated criteria do
not apply here. That is worth recording precisely, because it is the strongest external argument
against what this change does.

- **Six actions is decisively past every published threshold for using an overflow at all.** Carbon
  puts the line at three — "when the overflow menu contains fewer than three options, keep the actions
  inline as icon buttons instead" — and PatternFly advises against more than three actions fully
  displayed. Both are satisfied several times over. Carbon also holds that the per-row overflow
  control should be **persistent rather than revealed on hover**, because its constant presence is
  what signals that rows can be acted on at all — which is the basis for requiring the control on
  every row in every state above.
  ([Carbon, data table usage](https://carbondesignsystem.com/components/data-table/usage/);
  [PatternFly, overflow menu](https://www.patternfly.org/components/overflow-menu/design-guidelines/))
- **The guidance to keep one action permanently visible is real, and its criteria are space and
  priority — neither of which decides this case.** SAP Fiori frames it as a space problem: actions
  move to the overflow "successively … depending on their priority" when there is not enough room for
  all of them. Cloudscape's framing is that commonly used actions are offered in context "to speed up
  task completion". Both criteria assume the visible action *completes* something. The images row has
  room for six buttons and none of them completes anything, so neither rule selects a survivor. This
  is the external evidence behind the product rule written above: permanent placement is earned by
  frequency **and** immediacy together.
  ([SAP Fiori, action placement](https://www.sap.com/design-system/fiori-design-web/v1-88/foundations/best-practices/global-patterns/action-placement?external);
  [Cloudscape, actions](https://cloudscape.design/patterns/general/actions/))
- **The documented pitfall of the pattern is discoverability, and this change takes the strongest
  form of it.** Where change-1 left three visible actions to signal that the row was actionable, this
  change leaves only the overflow control. The literature's warning — that when actions migrate into
  an overflow, users need an unmistakable cue that they went somewhere — therefore applies with more
  force here than it did there, and it is why the requirement above is written as an obligation on the
  control's legibility rather than as a preference.
  ([Eleken, table design UX](https://www.eleken.co/blog-posts/table-design-ux);
  [UX Design World, actions in data tables](https://uxdworld.com/best-practices-for-providing-actions-in-data-tables/))
- **The closest functional competitor offers no counter-example.** Portainer's published images
  documentation describes the operations available — pull, build, import, export, remove — without
  establishing a row-level convention for them, and its list views lean on checkbox selection with a
  toolbar above the table rather than on per-row action strips. There is therefore no established
  images-screen layout in the category that this change contradicts, and the selection-plus-toolbar
  alternative is a materially different design that this request does not ask for.
  ([Portainer, images](https://docs.portainer.io/user/docker/images))
- **Menus are an affordance browsers give nothing for free**, and the expectations are specific: the
  control announces that it opens a menu and whether it is open, the menu is a single stop in tab
  order with arrow keys between entries, and `Escape` closes it. This is the basis for assuming
  conventional behaviour from the reused component rather than re-specifying it, and for requiring
  labelled entries over icons.
  ([W3C WAI-ARIA APG, menu button](https://w3.org/WAI/ARIA/apg/patterns/menu-button))
- **For the panel half, the precedent is the one change-2 already weighed and is unchanged by this
  screen:** a disclosure — content revealed by a control and hidden by the same control — expects no
  separate close button, while a floating non-modal dialog does. The image panel is the first kind,
  opened by a reversible row toggle. change-2's cited counter-evidence (GitLab's users failing to
  find how to close a panel whose `✕` had been removed as redundant) applies here identically, and is
  carried into the risks below rather than restated as new research.
  ([W3C WAI-ARIA APG, disclosure](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/))

## Risks

- **The wrong image is removed.** The list changes from outside the application — pulls, builds and
  prunes in the operator's own terminal — and `Remove` now sits inside a menu that stays open across
  those updates. An entry chosen a moment after the underlying row changed identity would delete an
  image the operator never selected, with no undo and no event to notice. This is the sharpest risk
  in the change and the least likely to be caught in casual use.
- **Discoverability, in its strongest form.** Nothing remains on the row to say that images can be
  acted on except the overflow control itself. An operator who has learned six labelled buttons finds
  a single glyph, and the six labels are now revealed only on demand. This is the accepted trade, but
  it is a larger one than change-1 made and there is no migration hint. It is the first thing to
  revisit if anyone reports not finding an operation, and the reversal — promoting one entry back to
  the row — is cheap.
- **The panel's close control is missed.** The same risk change-2 accepted for the container panel,
  with the same documented precedent, now on the second screen. After this change nothing on the
  image panel states that it can be closed; the operator must infer that the row will un-click. The
  mitigations are the visible open state of the owning row and `Escape`, neither of which announces
  itself.
- **The panel outlives its row, and here the operator causes it themselves.** `Remove` is in the menu
  of the very row whose panel is open, and opening the panel to inspect an image before deleting it
  is the ordinary flow. Delete it and the only pointer route out goes with it. A prune elsewhere on
  the machine produces the same state without the operator touching anything. A panel that simply
  will not close is the exact outcome this half must not produce.
- **`Escape` is mis-arbitrated on a screen that now has more claimants.** The row menu is new here and
  takes the key before the panel; the layer explorer, filesystem browser and comparison flows take it
  before both. The rule is easy to state and easy to get wrong, and the failure is quiet — a flow that
  stops receiving a keystroke, or a panel that closes underneath one.
- **The overflow becomes a junk drawer.** This screen starts its menu with six entries where the
  containers screen started with four, and the images surface is the one the reference analysis
  expects to grow — layer tooling, registry operations, vulnerability signals. Each addition needs an
  argument of its own, or the menu becomes an unscannable list and reproduces at one remove the
  clutter this change removes from the row.
- **A second menu gets built.** The precise failure change-1 named when it deferred this screen. Two
  menus that look and behave 90% alike is the divergence the single-library rule exists to prevent,
  and it is far cheaper to avoid now than to reconcile later. Equally, bending the shared menu into an
  images-specific shape that no other screen can use is the same failure wearing a different hat.
- **The two screens read as inconsistent rather than as governed by a rule.** Containers rows show
  three buttons and an overflow; images rows show only an overflow. The stated rule — permanent
  placement is earned by frequency *and* immediacy — resolves it, but a rule that lives only in this
  file is one sentence away from being forgotten the next time a list screen is built.
- **Automated checks are dropped instead of rewritten.** Every existing check that clicks one of the
  six buttons, and every one that closes this panel with the `✕`, targets a control that will not
  exist. The tempting repair is deletion, which removes exactly the coverage proving the operations
  are still reachable and the panel still dismissable — and does it with the suite green.
- **Muscle memory, twice over.** The operator who has learned "far right of the row is `remove`" will
  find a menu there, with `Remove` a short distance further inside it; the one who has learned the
  panel's corner will find nothing. Short-lived, real, and concentrated in the period when the two
  discoverability risks above are at their highest.
- **Keyboard and assistive-technology regression.** Six trivially reachable buttons become a menu, and
  a labelled dismissal control becomes a key binding. Both are safe only if built deliberately;
  getting either wrong turns a tidier interface into an inaccessible one, against the reference
  analysis's requirement that the interface stay usable for extended operational work.
- **The menu is clipped or mispositioned.** In a scrolled table, at the bottom of a long list, or over
  the detail panel. After this change a clipped menu is not a partial loss of capability on this
  screen — it is all of it.

## Scope

**In scope:** the images list row's action area — the removal of all six flat actions (`run`, `tag`,
`untag`, `push`, `save`, `remove`) from the row surface and their relocation into a single overflow
menu at the end of the row, leaving that control as the only thing the action area holds; the menu's
contents, order, human-readable labels and ellipsis convention, with `Remove` marked destructive and
set apart and carrying its `rmi` hint, and with `Untag` and `Push` shown disabled with a discoverable
reason when the image has no tags; the stability of the menu's shape across openings and states; the
reuse — without duplication or images-specific divergence — of the menu affordance and overflow slot
built by change-1; correct behaviour of an open menu against a list that changes from inside and
outside the application, including never acting on an image that has taken another's place; the
removal of the `✕` close control from the image detail panel under change-2's rule, with row
re-selection confirmed and protected as the remaining pointer route out, `Escape` added and
arbitrated behind the row menu and any flow the panel or menu opens, the case where the image leaves
the list while its panel is open resolved, and the visible bond between an open panel and its row
required; and updating the product's automated verification so that every one of the six operations
stays demonstrably reachable through its new entry point and the panel stays demonstrably dismissable
by row and by `Escape`, rather than losing the checks whose controls disappeared.

**⚠ The first out-of-scope clause below is superseded — a future request did extend it.** The image
detail panel's four action buttons move into the row's overflow menu; see
[`docker_management_app-image_row_actions-panel_actions_to_menu.md`](docker_management_app-image_row_actions-panel_actions_to_menu.md).
The rest of this Scope section stands.

**Out of scope** (unless a future request extends it): the image detail panel's four action buttons —
`Explore layers…`, `Efficiency & signals…`, `Browse filesystem…` and `Compare with…` — which are
panel actions rather than row actions, one of them inherently a two-object operation, are named
nowhere in this request, and stay exactly where they are, so that this panel keeps a populated action
bar and loses only its close control; any change to what an action does, to its form, to its
confirmation, to its feedback or to the API behind it; any new image capability, including anything
read off a screenshot; the same reorganisation on any other screen — volumes, networks, Compose,
Swarm, registries, contexts, builders, plugins — which keep their current arrangement until asked for
separately, even though they are expected to reuse the same affordance; the images screen's columns,
sorting, filtering, expansion behaviour and top-level toolbar; multi-select, bulk actions or
selection-plus-toolbar designs of any kind; keyboard shortcuts other than `Escape` for dismissal;
making rows into keyboard-operable disclosure controls, which remains the separate request change-2
recommended; any redesign of the liquid-glass material or any addition to the blur allow-list; and
the three remaining items of `bugs.md` (bug-1, bug-2, bug-3), each being taken through the workflow
separately.
