---
request_slug: docker_management_app-container_detail_close
date: 2026-08-12
type: evolution
reference: .sdd/analysis/docker_management_app.md
---

## Request

> - change-2
>     image: bugs-screen/change-2.png
>     in the panel that show the container details remove the "X" button that is used to clone the
>     container panel!
>     the container panel can be closed by clicking on the container row!!!

("clone" is a typo for "close", read as intended. The request arrived as one item among five
remaining in `bugs.md`; the other four — change-3, bug-1, bug-2, bug-3 — are being taken through the
workflow separately, one at a time, and are not analysed here.)

The request names a screenshot, `bugs-screen/change-2.png`, as its reference. What it shows, read
directly: two bands of the containers screen. The upper band is the end of a container row, holding
`restart`, `kill` and `rm`. The lower band is the container detail panel's action area, holding
`Export filesystem…` and, set to its right, a round `✕` control.

**The screenshot documents a state that no longer exists.** Its row band shows the flat five-button
layout that change-1 replaced, and its panel band shows `Export filesystem…`, which change-1 moved
out of this panel and into the row's overflow menu. The image is therefore read for **which control
is meant** — the round `✕` on the detail panel, unambiguously — and not as a description of what the
panel contains today. Today that area holds the `✕` and nothing else, so removing it empties the
area entirely.

## Reference

Previous analysis: [`.sdd/analysis/docker_management_app.md`](docker_management_app.md).
Sibling evolutions of the same analysis:
[`docker_management_app-container_row_actions.md`](docker_management_app-container_row_actions.md)
(change-1, merged, the immediate predecessor of this change),
[`docker_management_app-about_license_notice.md`](docker_management_app-about_license_notice.md),
[`docker_management_app-single_process_serving.md`](docker_management_app-single_process_serving.md).

**Starting point.** The reference analysis established Vexel as a single-operator, local-first client
exposing the full functional surface of a Docker installation behind a consistently applied "liquid
glass" interface. It said nothing whatever about how a detail panel is dismissed — panels, rows and
their relationship were below the level it worked at. Two of its statements nonetheless bear on this
change: it required the glass aesthetic to stay **usable and legible for extended operational use**
rather than be merely decorative, and it required container state to be shown **live**, since the
daemon changes it independently of the application. The second one matters more here than it looks,
and is picked up under Requirements and Risks.

Change-1 is the direct predecessor and is merged. It moved `Export filesystem…` off this panel and
into the container row's new overflow menu, recorded that "the panel's action slot is left empty —
intended, and stated here so nobody downstream reads the emptiness as an omission", and placed
"anything else about the container detail panel, **including its close affordance**" out of its own
scope, as belonging to a separate request. This is that separate request. It is an evolution being
honoured on schedule, not change-1's unfinished business — which is why this analysis is a new file
and change-1's is left untouched.

**Changes:**

- **The container detail panel loses its close control.** The round `✕` goes. With
  `Export filesystem…` already relocated by change-1, this leaves the panel's action area empty and
  the panel with no control of its own for dismissing itself.
- **The row becomes the sole pointer route in and out.** Selecting a container row opens its panel;
  selecting the same row again closes it. This behaviour exists already and is unchanged by this
  request; what changes is its standing — it stops being one of two routes and becomes the only one,
  which promotes it from a convenience to a guarantee that must be verified and protected.
- **`Escape` becomes a dismissal route, and is new.** It is not in the request. It is added because
  removing the only labelled, reachable dismissal control without providing a substitute is where
  accessibility regressions come from, and because the panel's contents can be reached by tabbing
  even though its owning row cannot. Its arbitration against the other consumers of that key on this
  screen is specified under Requirements.
- **The shared panel gains the ability to present either with or without a close control**, governed
  by a stated rule: the control is absent where the panel's opening gesture also closes it, and
  present where it is the only way out. The interface acquires a variant, not a container-specific
  copy of the panel.
- **The rule is applied, in this change, to the container panel alone.** The images screen uses the
  same shared panel and keeps its close control for now — a deliberate, temporary inconsistency,
  accepted for the procedural reason given under Assumptions and recorded under Risks.
- **A pre-existing limitation is written down rather than absorbed:** container rows are not operable
  by keyboard at all. This change neither introduces it nor repairs it, and it is named here because
  the dismissal model this change rests on is only half-implemented in the product without it.
- **Nothing else changes.** The panel's contents, the data it shows, every operation reachable from
  it or from the row, the confirmations, the live updates and the API behind them are all untouched.

## Summary

Remove the `✕` close control from the container detail panel, leaving the row that opened the panel
as the way to close it again, and add `Escape` as the keyboard route out so that removing the only
labelled dismissal control does not strand anyone inside the panel.

## Business goal

**The `✕` is a second route to something the row already does, and after change-1 it is the last
thing standing in an area that has been emptied.** Change-1 moved `Export filesystem…` — the panel's
only action — up onto the row's overflow menu, on the principle that there should be exactly one
place to look for everything that can be done to a container. What that left behind is a single
round glyph alone in an action area that otherwise holds nothing. On a product whose stated
differentiator is visual quality, a control sitting by itself in an emptied region does not read as a
considered decision; it reads as residue of the control that moved out. Removing it finishes the
move rather than starting a new one.

**The deeper point is what this panel *is*.** A `✕` in the corner is the vocabulary of a dialog or a
floating window — an object with an existence of its own, which the operator summoned and must
therefore dismiss. This panel is not that. It is the expansion of a row: it appears because a row was
selected, it belongs to that row, it shows that row's container, and it disappears when the row is
deselected. For an object of that kind the established model is a **disclosure**, where the control
that reveals the content is the same control that hides it, and where a separate close button is not
expected because the reciprocal gesture already exists. The request is, in effect, a statement that
the panel should stop presenting itself as a window and present itself as what it is. That is worth
more than the redundancy argument, and it is the reason to make the change rather than merely a
reason it is harmless.

**One gesture, reciprocal, is a smaller thing to learn than two.** The operator who has learned that
clicking a row opens its detail has, without being told, already learned how to close it — provided
the interface makes the row's open state visible enough to invite the second click. That is a real
condition and not a rhetorical one; it is the risk this change carries, and it is why the visible
bond between an open panel and its row is written into the requirements rather than assumed.

**And it is a rule, not a deletion.** The value is not in one glyph fewer. It is in the interface
acquiring a stated principle — *a panel carries a close control exactly when it has no other way
out* — held in the one place the project allows visual elements to be defined. That principle
survives this change, applies to the images panel when change-3 reaches it, and answers the question
in advance for every detail panel the product grows later. A one-off removal in the containers screen
would have answered nothing and would have produced precisely the near-duplicate divergence the
project's single-visual-language rule exists to prevent.

## Requirements

### Functional

- **The container detail panel presents no close control.** The `✕` is removed, not hidden, not
  disabled, not moved elsewhere on the panel. No replacement affordance — no "collapse" link, no
  chevron, no keyboard hint rendered on the panel — is introduced in its place: the row is the
  affordance.
- **The panel's action area is empty and stays empty.** This continues the state change-1
  deliberately created. It is intended, and stated again here so that no downstream reader treats an
  empty region as a defect to fill.
- **Selecting the already-selected container row closes the panel.** This is the behaviour the
  request rests on. It exists today and this change does not alter it; it changes its status. From
  this change onward it is the panel's only pointer-driven dismissal route, so it must be covered by
  the product's automated verification rather than merely be true — a silent regression in it would
  now leave the panel unclosable by pointer.
- **Selecting a *different* container row keeps a panel open and re-points it at the newly selected
  container.** Unchanged behaviour, restated because it is the third possible outcome of a row click
  and must not be disturbed by the removal.
- **`Escape` closes the panel.** New behaviour, added as the substitute for the removed control.
- **`Escape` is arbitrated innermost-first: the panel closes only when nothing inside it has claimed
  the key.** The containers screen now has several legitimate consumers of `Escape` — the row
  overflow menu introduced by change-1, and, wherever the panel hosts one, an interactive session, an
  exec terminal, a log-stream control or an inline editor. Whichever of these is active takes the
  keystroke; the panel closes only when none did. **An interactive session must never lose an
  `Escape` keystroke to the panel** — `Escape` is a character a terminal session legitimately
  receives, and swallowing it would be a worse defect than the redundant control this change removes.
- **`Escape` acts on the panel only while a panel is open**, and never otherwise changes what is
  selected or displayed.
- **When `Escape` closes the panel, the operator's point of interaction must not be left on something
  that no longer exists.** The intent is that it returns to the container row the panel belonged to,
  which is the disclosure model's normal behaviour and the same place a pointer user's attention
  already is. **That intent cannot fully land while the pre-existing limitation below holds**, since
  there is no focusable row to return to. What is required now, and is achievable now, is that
  dismissal never leaves the point of interaction on a removed element or lost to the document as a
  whole: it lands somewhere stable and sensible in the containers list. The full behaviour is
  contingent on rows becoming operable controls, which is a separate request.
- **The bond between an open panel and its row must be unmistakable.** The operator must be able to
  see, without acting, which row the panel belongs to and that that row is in an open state. With the
  `✕` gone this is the only remaining cue that the row is the way back, so it carries the whole
  discoverability burden of the change and is a requirement rather than a styling detail.
- **The panel must never outlive its row without a way out.** The containers list is live: rows
  change state, appear, disappear and re-sort from daemon events, and the operator can also filter or
  scroll them away. If the row that owns an open panel leaves the list — the container is removed, or
  it drops out of the current filter — the reciprocal gesture goes with it, and the `✕` that used to
  cover that case is gone. The panel must resolve itself in that situation rather than remain open
  with no route out.
- **The shared detail panel can present with or without a close control**, and which applies is
  decided by a stated rule: **absent where the panel's opening gesture also closes it, present where
  the close control is the only way out.** This is a variant of the one shared panel, not a second
  panel that looks like it.
- **In this change the rule is applied to the container detail panel only.** The images screen uses
  the same shared panel through the same reversible row-selection gesture, and therefore qualifies
  under the rule — but it keeps its close control until change-3 reaches it. This is deliberate; see
  Assumptions.
- **No capability is lost and nothing else about the panel changes.** Everything the panel shows,
  every operation reachable from it or from its row, every confirmation and every live update behaves
  exactly as before. Any observable difference beyond the disappearance of the `✕` and the addition of
  `Escape` is a defect of this change, not a consequence of it.

### Non-functional

- **This change must not worsen keyboard or assistive-technology reachability, and `Escape` is what
  guarantees that.** A keyboard user who has reached the panel's contents by tabbing had, before this
  change, a reachable and labelled control to dismiss it with. After it, they must have `Escape`.
  Shipping the removal without the substitute would convert a tidier interface into an inaccessible
  one, against the reference analysis's requirement that the interface stay usable for extended
  operational work.
- **A pre-existing limitation is recorded, and this change neither creates nor fixes it: container
  rows cannot be operated by keyboard at all.** A row cannot be focused or activated without a
  pointer, and it does not announce whether its panel is open. Verified by the requester. This means
  the disclosure model this analysis rests on is only half-present in the product: the panel behaves
  like disclosed content, but the row does not behave like the control that discloses it. The
  consequence for this change is bounded and must be stated exactly — a keyboard user could not open
  this panel before the change and still cannot after it, so no route is being taken away from them;
  what they gain is a way out of a panel they may have entered by tabbing. Making rows into operable
  disclosure controls is the correct eventual fix, touches the shared list used by more than one
  screen, and is materially larger than this request. It is recommended as its own request and is out
  of scope here.
- **No new overlay surface, and nothing joins the interface's blur allow-list.** This change removes a
  control and adds a key binding; it introduces no surface that could incur the runtime cost the
  project's standing performance rule exists to refuse.
- **Existing automated checks that dismiss this panel by clicking the `✕` are rewritten, not
  deleted.** Rewriting a check to close the panel by re-selecting its row, or by `Escape`, is
  correct; dropping a check because the control it clicked no longer exists would hide exactly the
  loss of dismissability this change must not cause.
- **The change is verified in the delivered product**, against the operator's real daemon, under the
  project's existing testing discipline: a test creates and destroys its own fixtures, asserts on
  what it created rather than on totals or emptiness, assumes nothing about the daemon's or the
  application's prior state, and passes when run on its own.
- **English only**, per the project's language convention.

## Assumptions

- **This is an evolution of the reference analysis, not a fix.** Stated by the human. Nothing is
  broken: the `✕` does exactly what it was built to do, and this request restates how the panel
  should be dismissed. It follows the precedent of change-1 and the other sibling evolutions. It is
  specifically *not* a fix to change-1's analysis, because change-1 explicitly deferred the close
  affordance to a separate request — so this is that request being honoured, not that request's
  unfinished business.
- **"clone" means "close".** The request's own next line — "the container panel can be closed by
  clicking on the container row" — settles it, and no cloning capability exists anywhere in the
  product.
- **The screenshot is normative for *which* control, and for nothing else.** It predates change-1 and
  shows both a row layout and a panel action item that no longer exist. It identifies the round `✕`
  on the detail panel and that is all it is used for here.
- **The preconditions were verified in the product by the requester, not by this analysis.** This
  analysis is written from the request and may not read the project's code. Three facts were checked
  and reported back, and this analysis is built on them: (1) re-selecting a selected container row
  does close the panel, for the pointer; (2) the shared detail panel has exactly two consumers, the
  containers and images screens, both opening it through a reversible row selection, so no panel
  anywhere in the product would be stranded by the rule; (3) container rows are not keyboard-operable
  at all. Fact 1 is the change's load-bearing precondition and Fact 3 is its main caveat; both are
  reflected in the requirements above rather than assumed away.
- **The panel is a disclosure of its row, not a floating dialog.** This is the model the whole change
  rests on, and it is a reading rather than a given: the panel is opened by selecting a row, shows
  that row's object, is bound to it, and closes when the row is deselected. It is assumed because the
  request itself asserts the reciprocal gesture, and because the alternative reading — a non-modal
  dialog the operator summoned — is what would make a close control obligatory (see Market trends).
- **The container panel only, deliberately, for a procedural reason and not a design one.** The
  images panel qualifies under the same rule and would be consistent to change now. It is left alone
  because the request names one panel, because the images screen is the subject of change-3 which is
  queued next, and because altering it inside this change would make it impossible to attribute a
  regression there to the right change. The resulting inconsistency is temporary, has exactly one
  visible instance, and applying the rule to the images panel is named as the follow-up. The variant
  existing is what makes that follow-up an application of a decision already taken rather than a
  second decision.
- **No replacement affordance is added, and the cheapest reversal is reinstating the control.** If
  discoverability turns out to be worse than judged — the risk below is not theoretical — the way
  back is to present the container panel with its close control again, which the variant makes a
  matter of choosing the other presentation. Recorded so that a future reader facing complaints
  reaches for that rather than inventing a third affordance.
- **`Escape` is added by this change and closes nothing else.** It is not in the request; it is the
  accessibility substitute for the removed control and is scoped to dismissing an open detail panel.
  It introduces no other shortcut and changes no existing one.
- **Standard disclosure and dismissal behaviour is assumed rather than invented.** Where the
  requirements above state an obligation — arbitration of a shared key, not stranding the point of
  interaction — the expectation is the established convention for controls of this kind, not a
  bespoke interaction model.
- **Nothing about the product's data, API or Docker behaviour changes.** This is a presentation and
  interaction change to a panel whose contents and operations are untouched.

## Constraints

- **Product constraint — one visual language, defined in exactly one place.** The project's
  non-negotiable rule (`CLAUDE.md`) is that every visual element comes from the internal UI library
  and that a component which almost fits is extended with a variant rather than duplicated. The
  detail panel is shared, so this change cannot be a container-specific panel that happens to lack a
  `✕`: the shared panel must be able to present either way, and the containers screen chooses. Two
  panels that look 90% alike is the precise divergence the rule exists to prevent.
- **Product constraint — the main view pays nothing for the glass.** The project holds a standing,
  enforced rule about runtime blur and a deliberately narrow allow-list of overlay surfaces. This
  change adds no surface and must not cause anything to join that list.
- **Baseline constraint — change-1 is merged and is the starting state.** `Export filesystem…` is
  already gone from this panel. Any downstream reader who assumes the panel's action area still holds
  it — as the reference screenshot shows — will be working from a state that no longer exists.
- **Interaction constraint — `Escape` is a contested key on this screen.** It is already claimed by
  change-1's row overflow menu, and by any interactive session, terminal, log control or inline
  editor the panel hosts. The panel is the outermost claimant and takes the key last. This is a
  constraint on the change, not a preference: a terminal that stops receiving `Escape` is a broken
  terminal.
- **Pre-existing constraint — rows are not operable controls.** The disclosure model cannot be fully
  honoured, including the return of focus to the row on dismissal, until that changes. This change is
  bounded to what is achievable without it and must not make it worse.
- **Domain constraint — the containers list is live.** The daemon changes container state
  independently, so rows can appear, vanish and re-sort under an open panel. The dismissal route this
  change leaves in place lives on the row, which means the route can disappear while the panel is
  open — a condition the removed control used to cover.
- **Repository constraint — the suite runs against the operator's own daemon.** Verification obeys
  the project's test rules: own fixtures, full cleanup, no assumption of an empty daemon or an
  inherited application state, every spec passing on its own.
- **Convention constraint — English only**, kebab-case package/folder naming, commands run from the
  repository root.

## Market trends

Relevant, and researched: the reference analysis positions this product against named competitors,
and "does a detail panel need its own close button" is a settled question in interface practice with
guidance on both sides and at least one closely comparable public failure — so the request can be
checked against prevailing practice rather than taste.

- **The nearest documented precedent is a removal made for exactly this reason, and it went badly.**
  GitLab removed the `✕` from its file-tree browser because it was judged redundant with the toggle
  that opened it. Users reported back: "It took me a while to find out how to close the side bar,
  there was no clear indication how to do that" and "I couldn't figure out how to close it at
  first!", with requests to add an `x` or dismiss button. The issue proposes either reinstating the
  control or making the open/close function more apparent, and is unresolved. This does not make the
  request wrong — it identifies precisely which risk it carries, and it is why the visible bond
  between an open panel and its row is a requirement above rather than a nicety.
  ([GitLab issue 592519](https://gitlab.com/gitlab-org/gitlab/-/issues/592519))
- **Design-system guidance says a dismissible non-modal panel should carry a close control — but it
  is describing a different object.** Twilio Paste, Salesforce Lightning and Clarity all specify a
  close button on side panels, Paste giving the accessibility reason directly: so that assistive
  technology has a specific close action to target. Read carefully, all three describe a **non-modal
  dialog floating over the canvas**, summoned by the user and existing in its own right. The
  container detail panel is not that object, which is why this guidance is cited here as the
  strongest argument against the change and then set aside on stated grounds rather than ignored.
  ([Twilio Paste, Side Modal](https://paste.twilio.design/components/side-modal);
  [Salesforce Lightning, Panels](https://www.lightningdesignsystem.com/2e1ef8501/p/19ef57-panels);
  [Clarity, Side Panel guidance](https://guidance.clarity.design/1026))
- **For a disclosure — content revealed by a control and hidden by the same control — no separate
  close button is expected.** The W3C's authoring practices define the pattern as a control that
  toggles the content's visibility and announces its expanded state; the reciprocal gesture *is* the
  dismissal. This is the model the request describes in its own words, and it is the basis for
  treating the `✕` as redundant rather than as a required affordance.
  ([W3C WAI-ARIA APG, Disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/))
- **`Escape` is a deliberate addition here, not a conformance obligation.** The disclosure pattern
  specifies activation keys and expanded state and says nothing about `Escape`; native disclosures do
  not close on it either, so where it is wanted it has to be added on purpose. It is added here for a
  product reason — the panel's contents are reachable by tabbing while its row is not, so without it
  a keyboard user who entered the panel has no exit once the `✕` is gone.
  ([Make Things Accessible, disclosure widgets](https://www.makethingsaccessible.com/guides/accessible-basic-disclosure-widgets/))
- **Portainer, the closest functional competitor named in the reference analysis, avoids the question
  entirely** by making container details a view of their own, reached by selecting the container and
  left by navigating away — so there is no panel to close and no close control to argue about. The
  category therefore offers no counter-example of a row-bound detail panel that must carry a `✕`;
  this product's inline panel is the design choice that raises the question in the first place.
  ([Portainer docs, view a container's details](https://docs.portainer.io/user/docker/containers/view))

## Risks

- **Discoverability — the sharpest risk, and it has a documented precedent.** After this change
  nothing on screen states that the panel can be closed. The operator must infer that the row they
  clicked will un-click. GitLab shipped the same inference and users could not make it. The
  mitigations are the visible open state of the owning row and `Escape`; neither announces itself,
  and there is no migration hint for an operator who learned the `✕`. This is the first thing to
  revisit if anyone reports not being able to close the panel, and the reversal is cheap.
- **A keyboard user is stranded inside the panel.** They cannot reach the row — it is not operable —
  so if `Escape` is not delivered, or is silently eaten by something inside the panel, the panel
  cannot be dismissed without a pointer at all. `Escape` is not a refinement of this change; it is
  the condition under which the removal is safe.
- **`Escape` is stolen from a terminal or interactive session.** The arbitration is stated, but it is
  the kind of rule that is easy to state and easy to get wrong, and the failure is silent: a session
  that quietly stops receiving a keystroke looks like a working session. This is the one way this
  change can damage something unrelated to it.
- **The panel outlives its row.** The list is live and filterable. A container removed while its
  panel is open, or filtered out of view, takes the only pointer dismissal route with it. The `✕`
  used to cover that case for free; now it has to be handled deliberately, and the failure — a panel
  that simply will not close — is the exact outcome the change must not produce.
- **The inconsistency with the images panel becomes permanent.** It is accepted as temporary on the
  understanding that change-3 applies the rule there. If change-3 is deferred, re-scoped or dropped,
  the product is left with two detail panels dismissed differently for no reason a user can see —
  and the longer it stands, the more it looks like a decision rather than an interval.
- **The variant becomes a general licence to drop close controls.** Once a panel can present without
  one, the rule that governs it ("absent only where the opening gesture reverses it") is one sentence
  standing between this change and panels that genuinely have no way out. Each future use of the
  variant needs the same check the container panel got.
- **Automated checks are dropped instead of rewritten.** Every existing check that closes this panel
  does so by clicking a control that will no longer exist. The tempting repair is deletion, which
  would remove precisely the coverage that proves the panel is still dismissable — and would do it
  invisibly, since the suite would go green.
- **Muscle memory.** An operator who has learned to reach for the corner of the panel will find
  nothing there, and the replacement gesture is in a different place — back on the row, above the
  panel. Short-lived, but real, and it is the period during which the discoverability risk above is
  at its highest.
- **The disclosure model stays half-implemented.** This analysis argues the `✕` is unnecessary
  *because* the panel is a disclosure — but the product does not yet implement the control half of
  that pattern: the row is not focusable, not activatable by keyboard, and does not announce its
  expanded state. The argument for the change is therefore sound about the design and ahead of the
  product. Left unaddressed indefinitely, this change is the point at which that gap started to
  matter, and the follow-up request that closes it should cite this one.

## Scope

**In scope:** removal of the `✕` close control from the container detail panel, leaving that panel's
action area — already emptied by change-1 — empty and intentionally so; the confirmation and
protection of row re-selection as the panel's remaining pointer dismissal route, including the case
where the owning row leaves the live list while the panel is open; the addition of `Escape` as a
dismissal route, arbitrated so that any inner consumer of that key — the row overflow menu, an
interactive session, a terminal, a log control, an inline editor — takes it first, and so that
dismissal never leaves the operator's point of interaction on something that no longer exists; the
requirement that an open panel's bond to its row remain unmistakable, since it now carries the whole
discoverability burden; the addition to the shared UI library of the ability for a detail panel to
present with or without a close control, governed by the rule that it is absent where the opening
gesture reverses it and present where it is the only way out; and updating the product's automated
verification so that the panel is demonstrably still dismissable, by row and by `Escape`, rather than
losing the checks whose control disappeared.

**Out of scope** (unless a future request extends it): the images detail panel, which qualifies under
the same rule and is deliberately left with its close control until change-3 reaches it; making
container rows into keyboard-operable disclosure controls — focusable, activatable and announcing
their expanded state — which is the correct eventual repair of the limitation recorded above, touches
a shared element used by more than one screen, and is recommended as its own request; any other
change to the container detail panel, its contents, its layout or what it can do; any replacement
dismissal affordance on the panel; keyboard shortcuts other than `Escape` for dismissal; any change
to what selecting a row does beyond what is stated here, and any change to the containers list's
columns, sorting, filtering or toolbar; any change to an operation, its confirmation, its feedback or
the API behind it; and the four remaining items of `bugs.md` (change-3, bug-1, bug-2, bug-3), each
being taken through the workflow separately.
