---
request_slug: docker_management_app-image_row_actions-panel_actions_to_menu
date: 2026-08-12
type: evolution
reference: .sdd/analysis/docker_management_app-image_row_actions.md
---

## Request

> riapri la change 3 in quanto non hai spostato le azioni presenti nel pannello di dettaglio delle
> immagini

("reopen change-3, since you have not moved the actions present in the images detail panel.")

The request arrived with a screenshot of the delivered product: the image detail panel's action bar,
still carrying `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…` and `Compare with…`.
The screenshot shows the **current** state to be changed, not a target — there is no picture of the
intended result, exactly as in change-3.

change-3 was delivered, certified and merged with those four buttons recorded as **out of scope**, in
several places, on the grounds that they are *panel* actions rather than *row* actions. The human has
looked at the result and overridden that decision. **The decision is taken and is not re-argued
here.** change-3's reasons stay in change-3's file as the record of what was decided at the time;
this analysis specifies the change now required and says how that record is to be corrected.

## Reference

Previous analysis:
[`docker_management_app-image_row_actions.md`](./docker_management_app-image_row_actions.md)
(change-3, delivered, certified and merged — the analysis this one evolves).
Ancestor: [`.sdd/analysis/docker_management_app.md`](./docker_management_app.md).
Sibling evolutions of the same ancestor:
[`docker_management_app-container_row_actions.md`](./docker_management_app-container_row_actions.md)
(change-1, merged — the change that established both the overflow menu and the precedent this
request invokes, having moved `Export filesystem…` off the *container* detail panel and into the
row's menu),
[`docker_management_app-container_detail_close.md`](./docker_management_app-container_detail_close.md)
(change-2, merged),
[`docker_management_app-about_license_notice.md`](./docker_management_app-about_license_notice.md),
[`docker_management_app-single_process_serving.md`](./docker_management_app-single_process_serving.md).

**Starting point — the product as change-3 left it.** The images list row's action area holds exactly
one control, the trailing overflow `…`. Its menu holds six entries in the row's original
left-to-right order — `Run…`, `Tag…`, `Untag`, `Push…`, `Save`, `Remove` — with `Remove` last, set
apart, in the destructive tone and carrying the `rmi` hint, and with `Untag` and `Push` shown
disabled with a discoverable reason when the image has no tags. The image detail panel has lost its
round `✕`; it is opened and closed by its row, and by `Escape`. And its action bar still holds the
four buttons above, which change-3 deliberately left in place — the one visible divergence between
the two detail panels, since change-1 had emptied the container panel's action area entirely.

**Changes:**

- **The four panel actions move into the image row's overflow menu.** `Explore layers…`,
  `Efficiency & signals…`, `Browse filesystem…` and `Compare with…` stop being offered by the detail
  panel and become entries in the row's menu — the same destination, reached by the same gesture,
  that change-1 used when it moved `Export filesystem…` off the container detail panel. This reading
  of the human's instruction is stated by the requester and is the basis of this analysis; it is
  recorded here rather than inferred, because "moved" could otherwise be read as "moved elsewhere on
  the panel" and it is not.
- **The images panel's action bar is left empty**, exactly as the container panel's already is. That
  emptiness is the intended end state and not an omission — the same sentence change-1 and change-2
  both had to write about the container panel, needed again here for the same reason. The panel keeps
  everything else: it still opens from its row, still shows the image's data, still closes by its row
  and by `Escape`, and still carries no close control.
- **The row menu goes from six entries to ten, so grouping stops being optional.** change-3 flagged
  precisely this as its "junk drawer" risk when it declined the move. The risk is now realised by
  decision rather than by drift, and the answer is a stated grouping: three groups, ordered by
  consequence — inspect, operate, destroy — argued under Requirements.
- **The four flows must be reachable with no detail panel open.** This is the substantial technical
  consequence of the move and the part with real work behind it. Today all four are rendered by the
  detail panel, so all four presuppose one. Invoked from a row menu, they must open, run and close
  with no panel anywhere on screen, bound to the image whose menu was used. One of the four,
  `ImageDiffView`, is already hosted by the screen itself rather than by the panel; the change is that
  all four reach that same standing.
- **`Compare with…` acquires a stated meaning when started from a row.** It is the only two-object
  operation in the menu, and a row names one object. The row's image is the left-hand side; the second
  is chosen inside the comparison view; nothing on the list becomes a two-row selection gesture. Its
  entry is disabled, in place, when there is no second image to compare with.
- **change-3's out-of-scope statements are corrected rather than left standing.** They now assert the
  opposite of the delivered product. The correction is specified under Requirements as a deliverable
  of this change, with the exact sites named; it is applied by the human, not by this analysis.
- **Nothing else changes.** The six existing menu entries keep their order, labels, hints, tone,
  confirmations and behaviour; the `✕` stays removed; no operation changes what it does; no new Docker
  capability appears; no data or API behaviour is affected; and the ancestor analysis's scope,
  constraints and risks stand untouched.

## Summary

Move the image detail panel's four actions — `Explore layers…`, `Efficiency & signals…`,
`Browse filesystem…`, `Compare with…` — into the image row's overflow menu, leaving that panel's
action bar empty as the container panel's already is; group the resulting ten entries so the menu
stays scannable, and make all four flows work with no panel open, including a defined meaning for
`Compare with…` when it is started from a single row.

## Business goal

**One place to look, finished on this screen.** change-1's stated gain was not fewer buttons; it was
that afterwards there is exactly one place to look for everything that can be done to a container,
and it paid for that gain by taking a *panel* action — `Export filesystem…` — up onto the row's menu.
The images screen currently stops half-way: six things are done to an image from its row, four from a
panel that must be opened first. An operator who has learned "everything an image can do is behind
the `…`" is wrong four times out of ten, and the four they are wrong about are the ones this product
exists to be good at. Completing the move makes one sentence true of both screens instead of nearly
true of one.

**The four capabilities become one gesture nearer, not one further.** This is the direction of travel
that distinguishes this change from its predecessors. change-1 and change-3 both moved things *behind*
a click and had to argue that the trade was worth it; this move takes four capabilities that today
cost **two** gestures — select the row to open the panel, then click the button — and puts them at
**one**: open the menu, choose the entry. Layer-aware inspection is the differentiator the ancestor
analysis names, and it is currently the least directly reachable thing on the screen. That is worth
more than the tidiness.

**The panel stops being two things at once.** After change-2 the detail panel is a disclosure of its
row: it appears because a row was selected, shows that row's object, and disappears when the row is
deselected. An action bar on such an object is the vocabulary of a window — something summoned, that
offers you operations. The container panel already reads as what it is: the disclosed data of a row,
with the operations living on the row. The images panel does not, and it is the last place in the
product where the two vocabularies are mixed. Emptying its action bar makes the panel's job exactly
one thing: showing the image.

**Two detail panels, one behaviour.** change-3 recorded the divergence between the two panels as
intended, which made it a rule a reader had to learn. Removing it means there is nothing to learn:
both panels show data, neither offers actions, both close by their row and by `Escape`. A rule that
no longer needs stating is better than a rule that is stated well, and the product is one screen away
from not needing it.

**And the record has to match the product.** change-3 is a certified analysis that will be read by
whoever next touches this screen, and it currently asserts, in several places and with reasons
attached, that these four buttons stay on the panel. Left standing, it will be believed — and the
most likely outcome is that somebody "restores" them. Correcting it is not bookkeeping; it is the
part of this change that prevents the change from being undone.

## Requirements

The four parts below are separately verifiable and are stated separately on purpose. They fail
differently and independently: entries can be in the menu while a flow cannot open without a panel;
a flow can open correctly while `Compare with…` picks the wrong side; the record can be wrong while
everything works.

### Functional — the move (part one)

- **The image detail panel presents no actions.** All four buttons are removed from it, not hidden,
  not disabled, not relocated elsewhere on the panel. No replacement affordance appears in their
  place: the row's menu is the affordance.
- **The panel's action bar is empty and stays empty**, exactly as the container panel's is. Stated
  here so that no downstream reader treats an emptied region as a defect to fill, and so that the
  visual result — a panel that shows data and offers nothing — is recognised as the target rather
  than as an unfinished state.
- **The panel is otherwise untouched.** Everything it displays, its layout, its opening and closing
  by row re-selection and by `Escape`, and its lack of a close control all behave exactly as they do
  today. Any observable difference beyond the disappearance of the four buttons is a defect of this
  change, not a consequence of it.
- **Each of the four operations is initiated only from the row's overflow menu**, on every image row,
  and reaches exactly the flow it reaches today with exactly the behaviour it has today — same view,
  same data, same loading, same caching, same errors, same way out. This change relocates an entry
  point; it changes nothing about what is behind it.
- **No capability is lost.** With four buttons removed and four entries added, it is entirely
  possible to ship a version in which one of these is reachable from nowhere. Nothing would look
  wrong; the capability would simply be gone. Each of the four must be demonstrably reachable from
  its new entry point.

### Functional — the menu of ten (part two)

- **The menu holds exactly ten entries, in three groups, in this order:**

  1. `Explore layers…`
  2. `Efficiency & signals…`
  3. `Browse filesystem…`
  4. `Compare with…`
  — *separated* —
  5. `Run…`
  6. `Tag…`
  7. `Untag`
  8. `Push…`
  9. `Save`
  — *separated* —
  10. `Remove` (destructive tone, `rmi` hint)

- **The grouping axis is consequence, not provenance**, and this is the load-bearing argument. The
  product already draws one line on that axis and the operator already sees it: `Remove` is set apart
  because of what it does, not because of where it came from. Extending the same axis to a second
  boundary is one rule applied twice rather than two rules to learn. Grouping by provenance instead —
  "these four used to be on the panel" — would encode a history the operator never experienced as a
  category and which is meaningless a week after the change ships.
- **The order within the axis is increasing consequence: nothing changes → something changes →
  something is destroyed.** The first group is inert: exploring layers, reading efficiency signals,
  browsing a filesystem and comparing two images all read the image and leave the daemon exactly as
  they found it. The second group acts — creates a container, adds or removes a tag, contacts a
  registry, writes a tarball. The third destroys. The result is scannable without being read: distance
  from the top of the menu tracks how much an entry can cost.
- **The safest entries take the positions nearest the trigger**, which is the concrete safety gain
  and not merely a tidy ordering. A menu's topmost entries are the ones a fast pointer lands on. Today
  the first entry the pointer meets is `Run…`, which starts a container; after this change it meets
  four entries that cannot do anything at all. That is a real improvement in the failure mode of a
  mis-click, on a screen whose list changes underneath the operator.
- **Learned order is preserved inside each group.** `Run…`, `Tag…`, `Untag`, `Push…`, `Save`,
  `Remove` keep the relative sequence change-3 deliberately carried over from the row, and `Remove`
  stays last and set apart. The six entries move down by a fixed offset behind a visible separator;
  none is re-ordered, none changes label, tone or hint. That bounds the muscle-memory cost to "the
  block I know starts lower" rather than "the menu was reshuffled".
- **The four new entries keep the order and the labels they have on the panel today** —
  `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…`, `Compare with…` — for the same
  reason change-3 made the menu's order the row's order: the learned sequence is free to keep and
  costs a relearn to change. It also puts `Compare with…`, the one entry of the four whose
  availability is conditional, at the end of its group, where a greyed line is least disruptive to
  scanning.
- **Frequency is not used as an argument, here or anywhere on this screen.** The ancestor analysis
  rules out telemetry, and change-3 established the product's substitute — placement is argued from
  properties that can be checked, not from estimated usage. Consequence and reversibility are such
  properties; "which of these ten is used most" is not, and no ordering here rests on it.
- **Groups are expressed by separation and tone, not by section headings.** The shared `Menu` already
  supports separated groups and a destructive tone — change-1 built both and `Remove` already uses
  them — so this change consumes an existing capability and adds none. Three headings would add three
  unactionable lines to a ten-entry menu. If ten later prove unscannable, adding section labels is the
  named next step, not a new component.
- **The four new entries carry a trailing ellipsis and no secondary hint.** This refines change-3's
  convention rather than contradicting it: the ellipsis marks an entry that **does not complete on
  activation** — because it opens a form, asks for a value, or opens a view. All four open a view, so
  all four keep the ellipsis they already have, and `Save` (which completes at once) and `Remove`
  (which only confirms) keep having none. No hint is added, because change-3 restricts hints to cases
  where the CLI verb would otherwise be lost, and none of the four is a labelled CLI verb in this
  product's vocabulary.
- **Every existing menu requirement continues to hold, now over ten entries.** At most one row's menu
  is open at a time; the menu's shape is stable across openings, with inapplicable entries disabled in
  place rather than removed and with a discoverable reason; the menu is fully operable without a
  pointer with a real text label on every entry; it closes on dismissal; it never acts on an image that
  has taken another's place; and no second menu affordance or images-specific variant is introduced.
- **A ten-entry menu must still be fully readable wherever it opens** — for the last rows of a long
  list, inside a scrolled table, and over the detail panel. The menu is now nearly twice as tall as
  the one that was verified, so this is a re-verification rather than an inherited property, and a
  clipped menu now hides the screen's differentiating capabilities as well as its operations.
- **The menu's length is at its argued ceiling.** Ten is inside the published guidance for a menu of
  this kind (see Market trends) and leaves roughly two entries of headroom. Every further addition
  needs an argument of its own and a group to belong to; "it had nowhere else to go" is the failure
  mode change-3 named and this change consumes most of the remaining margin.

### Functional — reachable with no panel open (part three)

- **Each of the four is a view of an image that the screen can present, not a facility the panel
  lends.** Whether a detail panel is open must have no bearing on whether one of the four can be
  opened, on what it shows, or on whether it stays open. This is the central consequence of the move
  and the requirement the rest of this part elaborates.
- **A flow opened from a row menu acts on that row's image**, whatever is selected, whatever panel is
  open, and whatever the list does next. If a panel is open on a *different* image, the flow still
  belongs to the image whose menu was used. Acting on the selected image instead of the invoked one
  is the sharpest defect available in this part, and it is silent.
- **Opening one of the four opens no panel, and closing one closes no panel.** The entry does one
  thing. Opening the owning row's panel as a side effect would put a row into its open state without
  the operator having clicked it, contradicting the disclosure model change-2 established; closing a
  panel the operator had opened separately would destroy state they did not ask to lose.
- **At most one of the four is open at a time.** They are full views over the same screen; two at
  once has no meaning, and it would make the `Escape` chain ambiguous. Opening one from a menu closes
  any other that is open.
- **`Escape` arbitration holds in the new case: a flow open with no panel.** Any of the four takes
  `Escape` before the row menu and before the panel, and closing it must return the operator to the
  images list — never close a panel underneath it, and never change what is selected. change-3 wrote
  this chain for flows opened *from* a panel; it must now hold when there is no panel in the chain at
  all.
- **A flow must not outlive its image without a way out.** The images list is live and is changed
  from outside the application: an image can be removed, pruned or re-tagged while its layers are
  being explored or its filesystem browsed, and `Remove` for that very image sits in the same menu the
  flow was opened from. The flow must resolve itself rather than remain open showing an image that no
  longer exists. This is the same obligation change-3 wrote for the panel, now owed by four more
  surfaces which can be open with nothing else on screen.
- **Nothing about the four flows' own behaviour changes**, including whatever they cache. The
  analysis cache is keyed by content and is expected to be hit exactly as it is today; a flow that
  quietly stops reusing it, or starts re-extracting, is a defect of this change.
- **No new overlay surface is introduced and nothing joins the blur allow-list.** These four surfaces
  already exist in the product and already have whatever material they have. Being opened from a menu
  instead of from a panel changes their entry point, not their nature; any addition to that list would
  be a defect of this change.

### Functional — `Compare with…` from a row (part four)

- **The row's image is the left-hand side, always, and it is stated so on screen.** The operator chose
  it by opening its menu, and the operation is asymmetric — a comparison of A against B is not the
  same reading as B against A. Which image is theirs must be visible in the view rather than inferred.
- **The second image is chosen inside the comparison view**, from the images the product already
  lists. The menu entry supplies the left-hand side and nothing else.
- **No second selection gesture is introduced on the list.** No "pick two rows" mode, no multi-select,
  no modal "now choose the other one" state on the table. Multi-select is out of scope in change-3 and
  remains out of scope here; introducing it would be a materially larger change with destructive-action
  questions of its own.
- **The entry is disabled, in place, with a discoverable reason, when there is no second image to
  compare with** — the same treatment `Untag` and `Push` receive on an untagged image, and never
  removal. A menu whose shape changes between openings cannot be used quickly.
- **Its disabled state depends on the list, not on the row, and that must be discoverable.** This is
  the only entry in the menu whose availability is a property of something other than the image it
  acts on: it greys out because the *daemon* holds fewer than two images. A later reader — and an
  operator — will otherwise read it as a bug when deleting an unrelated image greys out an entry on a
  row they did not touch. The reason given must say so.
- **The state is live.** Images appear and vanish from outside the application; the entry's
  availability must follow, and a menu open across such a change must not offer an operation that has
  become impossible.
- **A comparison of an image with itself is not offered.** It carries no information. If the existing
  view's chooser already prevents it, nothing changes; if it does not, this is where it is prevented.
- **Everything else about the comparison is unchanged** — what it computes, how it displays, how it
  is closed. This part decides the entry point and the left-hand operand, and nothing beyond them.

### Functional — correcting the record (part five)

- **change-3's analysis must stop asserting that the four buttons stay on the panel**, and must keep
  its reasoning intact as the record of a decision taken at the time. Those two obligations are
  reconciled by **superseding, not rewriting**: at each affected site the original text stays, and a
  note is added immediately after it naming this analysis, the date, and the fact that the human
  overrode the decision after seeing the delivered result.
- **The affected sites in `docker_management_app-image_row_actions.md`**, as read on 2026-08-12:
  - lines 100–103 — the *Changes* bullet "**The image detail panel keeps its four action buttons.**"
  - lines 236–239 — the *Requirements → Functional, half two* bullet "**The panel keeps its four
    actions unchanged.**" (its clause about `Compare with…` being unavailable below two images is
    superseded by part four above, not merely relocated)
  - lines 347–350 — the *Assumptions* bullet "**The image detail panel's four buttons are not touched
    by this request.**"
  - lines 557–562 — the *Scope → Out of scope* clause naming the four buttons as panel actions that
    "stay exactly where they are, so that this panel keeps a populated action bar"
- **Four sites, not three.** The request named three; the *Scope* clause is the fourth and is the one
  a later reader is most likely to reach, since "what was out of scope" is what gets checked before
  work starts. All four must be treated.
- **One banner at the head of the file**, immediately under the frontmatter, pointing to this
  analysis. A reader who consults only the Summary or the Scope must be warned before reaching any of
  the four sites; per-site notes alone do not achieve that.
- **Two things must *not* be changed.** The *Assumptions* bullet at lines 364–369, which records the
  preconditions verified by the requester — including that the panel rendered four buttons and that
  `Compare with…` was disabled below two images — is a true statement about the product as it stood
  and is left exactly as it is. And the *Risks* bullet on the overflow becoming a junk drawer (lines
  509–513) is a prediction, not a false statement; it needs no correction, and this analysis cites it
  as realised.
- **No other analysis in `.sdd/analysis/` needs correcting.** change-1's statement that the container
  panel's action slot is empty is still true; change-2's statement that the images panel keeps its
  close control "until change-3 reaches it" was accurate when written and was honoured. Checked
  explicitly, so that nobody has to re-check.
- **A machine-readable marker in change-3's frontmatter is optional and is a convention decision**,
  not a requirement of this change. If one is wanted, it applies to every superseded analysis and
  should be introduced as such rather than invented for one file.

### Non-functional

- **Discoverability of the four must not regress, and this is the half of the trade to be earned.**
  Four labelled buttons on a visible bar become four entries revealed on demand. It is the same trade
  change-3 made for the row's six, one level in, and this time the capabilities concerned are the
  product's differentiator. The operator who knew where `Browse filesystem…` was must find it; the one
  who never opened a panel now can.
- **This is the second relocation of the same operations in two changes, and both shipped.** The
  operator learned the panel bar because it was delivered and certified. Nothing in the product will
  tell them it moved. That cost is accepted, and it is the reason the grouping above must make the
  four findable at a glance rather than merely present.
- **No regression in the list's live behaviour or responsiveness**, at any list length, with a
  ten-entry menu open or closed. The standing project rule that the main view pays nothing for the
  glass material applies without exception; the per-row control is unchanged and must stay unchanged.
- **Legibility over the glass material**, now across three groups, two separators, a destructive tone
  and disabled entries in two different groups for two different reasons.
- **No worsening of keyboard or assistive-technology reachability.** Four trivially reachable buttons
  become menu entries; four views become openable with no panel around them. Both halves are neutral
  only if built deliberately, including the focus behaviour on opening and closing a flow that has no
  panel to return to.
- **Existing automated checks are rewritten, not deleted.** Every check that opens one of the four by
  first opening the detail panel and clicking its button targets a control that will not exist.
  Rewriting it to go through the row menu is the correct repair; deleting it removes exactly the
  coverage proving these capabilities are still reachable, and does so with the suite green. New
  coverage is owed for the case that did not exist before: each of the four opened with no panel.
- **change-3's own coverage must survive.** This change re-opens merged, certified work. The six
  existing entries, the panel's dismissal by row and by `Escape`, and the disabled-with-reason
  behaviour are all already verified; none of that verification may be lost while the menu is
  reorganised around it.
- **The change is verified in the delivered product**, against the operator's real daemon, under the
  project's testing discipline: a test creates and destroys its own fixtures, asserts on what it
  created rather than on totals or emptiness, assumes nothing about the daemon's or the application's
  prior state, and passes when run on its own.
- **English only**, per the project's language convention.

## Assumptions

- **This is an evolution of change-3, not a fix of it.** Stated by the human. change-3 was delivered
  exactly as specified, certified and merged; what changed is the specification, not the workmanship.
  The file is therefore left standing as the record of what was decided at the time and why, and this
  change is a new file — which is also why the correction to it is a superseding note rather than a
  rewrite.
- **The destination is the image row's overflow menu.** Stated by the requester as the reading of the
  human's instruction, and recorded here as the basis of the analysis rather than inferred. The
  alternative readings — moving the four somewhere else on the panel, or into the panel's body as
  tabs — are not what is being asked for. The precedent named is change-1's move of
  `Export filesystem…` out of the container detail panel and into the row's menu.
- **The images detail panel stays, with an empty action bar.** Not questioned by this request, and it
  matches the container panel exactly. Whether a panel that shows only data still earns its place is a
  product question nobody has raised, and it is out of scope.
- **The decision is not re-argued.** change-3's reasons — that these are panel actions, that
  `Compare with…` is a two-object operation, that nothing was named in the original request — are
  superseded by the human's instruction, not rebutted. They are not restated as live objections
  anywhere in this file, and consequence 3 above is the answer to the one of them that was a genuine
  design problem.
- **Opening one of the four from the menu neither opens nor closes a detail panel.** Justified
  default, recorded because a later phase would otherwise have to guess: the entry does one thing, and
  after change-2 a row's panel opens because the operator clicked the row and for no other reason.
- **The comparison view supplies its own chooser for the second image.** Reported by the requester:
  `ImagesScreen` already hosts `ImageDiffView` at screen level, with the left-hand image identified
  and the view opened against it. So the row menu has only to supply the left-hand side, and part
  three's requirement is already satisfied by one of the four — which is also the evidence that the
  arrangement it asks for is achievable rather than speculative.
- **The preconditions were verified in the product by the requester, not by this analysis.** This
  analysis is written from the request and does not read the project's code. The facts it is built on:
  the four buttons are still on the panel and are rendered by it, together with `LayerExplorer`,
  `LayerEfficiencyView`, `FilesystemBrowser` and `ImageDiffView`; the row menu holds the six entries
  in the stated order with `Remove` last, set apart, destructive and carrying `rmi`; the shared `Menu`
  supports separated groups and a destructive tone; `Compare with…` is disabled today when fewer than
  two images exist; and `ImagesScreen` already hosts the comparison view itself.
- **Ten is the whole menu.** No entry is added, removed, renamed or re-toned beyond the four arrivals
  and the separators around them.
- **Standard menu, disclosure and dismissal behaviour is assumed rather than invented.** Where a
  requirement states an obligation — keyboard operation, arbitration of a shared key, not stranding
  the point of interaction — the expectation is the established convention for controls of this kind,
  already implemented in the reused components.
- **No selection and no bulk actions**, including for the comparison. Unchanged from change-3.
- **Nothing about the product's data, API or Docker behaviour changes.** This is a presentation and
  interaction change to capabilities that already exist and already work.

## Constraints

- **Product constraint — reuse is mandatory, not preferred.** Every visual element comes from the
  internal UI library, and a component that almost fits is extended rather than duplicated
  (`CLAUDE.md`). The menu, its separated groups and its destructive tone all exist; this change
  consumes them. A second menu, or an images-specific variant of the shared one, is the divergence the
  rule exists to prevent and was named as a risk by both change-1 and change-3.
- **Product constraint — the main view pays nothing for the glass.** The blur allow-list is narrow,
  enforced by an automated check, and admits the menu's popup on the stated grounds that at most one
  is open in the whole interface at a time. Making that menu twice as tall does not change its count.
  Nothing here may widen the list or introduce a per-row overlay treatment.
- **Product constraint — destructive operations stay confirmable.** `Remove` keeps its confirmation
  exactly as it is; moving four entries above it adds distance in front of it and removes nothing from
  behind it.
- **Baseline constraint — change-1, change-2 and change-3 are all merged and are the starting state.**
  The images row already has a single overflow control with six entries, the images panel already has
  no `✕`, and `Escape` already closes it with arbitration. A downstream reader working from the
  screenshots in `bugs-screen/`, or from change-3's out-of-scope statements, will be working from a
  state that no longer exists — which is precisely what part five exists to prevent.
- **Interaction constraint — `Escape` is contested on this screen and gains a new case.** The four
  flows, the row menu and the panel all want the key, in that order; the new case is a flow open with
  no panel beneath it. The rule is easy to state and easy to get wrong, and the failure is quiet.
- **Pre-existing constraint — rows are not keyboard-operable.** Recorded by change-2, unchanged by
  change-3, unchanged here. This change must not make it worse, and repairing it remains a separate
  request.
- **Domain constraint — the images list is live and is changed from outside the application.** Pulls,
  builds, prunes and removals happen in the operator's own terminal and in tooling running on the
  machine. Rows appear, vanish and re-sort under an open menu, an open panel and now an open
  inspection flow, and the second-image availability of `Compare with…` changes with them.
- **Domain constraint — image removal is irreversible in a way container removal is not**, and
  produces no visible event beyond a row disappearing. This is why the menu's order is argued from
  consequence and why `Remove` stays last, set apart and confirmed.
- **Domain constraint — comparison is inherently asymmetric.** Two images are not interchangeable
  operands; which one is the subject changes the reading. The interface must state which is which
  rather than leave it to be inferred.
- **Repository constraint — the suite runs against the operator's own daemon.** Verification obeys the
  project's test rules: own fixtures with ownership labels, full cleanup (`docker rm -fv`), no
  assumption of an empty daemon or an inherited application state, every spec passing on its own, and
  no test reaching Docker Hub.
- **Convention constraint — English only**, kebab-case package/folder naming, commands run from the
  repository root.

## Market trends

Relevant, and researched: the ancestor analysis positions this product against named competitors, and
both open questions in this change — how long a row menu may get before it must be grouped, and how a
two-object comparison is started from one object — are settled conventions in the category with
published guidance, so they can be checked rather than asserted.

- **Ten entries is inside the published ceiling, and grouping at that length is the stated
  expectation.** Carbon's menu guidance keeps a context or overflow menu to **no more than twelve
  items** so that it can be scanned without scrolling, and advises grouping into sections separated by
  dividers once there is a significant number of items. So the move does not breach the guidance — it
  consumes most of the remaining margin, which is the concrete form of change-3's junk-drawer warning
  and the reason every further entry now needs its own argument.
  ([Carbon, menu usage](https://carbondesignsystem.com/components/menu/usage/);
  [PatternFly, overflow menu](https://www.patternfly.org/components/overflow-menu/design-guidelines/))
- **Separating destructive entries below the ordinary ones, by a divider, is the documented practice**
  — Stack Overflow's design system splits destructive actions "into their own section using a divider"
  and gives them a distinct danger treatment, with standard actions first. That is exactly the shape
  change-1 built and `Remove` already has; this change adds a second divider on the same axis rather
  than a different mechanism.
  ([Stack Overflow Design System, menus](https://stackoverflow.design/system/components/menus))
- **The category reaches image inspection from the list, not from an inline action bar.** Docker
  Desktop's documented flow is "to inspect an image, select the image row", after which the image
  details view presents layers, packages and discovered vulnerabilities, with layer selection filtering
  what is shown. Layer, efficiency and filesystem inspection are therefore *views of an image reached
  from the list* in the nearest comparable product — which is the same standing part three requires
  these four to have, and is evidence that decoupling them from a detail panel matches the category
  rather than departing from it.
  ([Docker Docs, image details view](https://docs.docker.com/scout/explore/image-details-view/))
- **A two-image comparison in this exact domain is asymmetric and names its subject first.**
  `docker scout compare` takes the image under examination as its argument and the counterpart behind
  `--to` — `docker scout compare myapp:v2.0 --to myapp:v1.0` — with the documented intent of comparing
  a new build against the version already running. The operator's own CLI vocabulary therefore already
  says that one image is the subject and the other is chosen, which is precisely the semantics part
  four gives the row entry.
  ([docker scout compare](https://docs.docker.com/reference/cli/docker/scout/compare/))
- **"Compare with…" invoked on one selected object, with the second chosen from a picker, is the
  established interaction.** IntelliJ IDEA's instruction is to "select one file, choose Compare With…
  from its context menu, and select a file" — one object supplies the left side by having been the
  target of the gesture, the other is chosen in the flow that opens. This is the counter-evidence to
  the intuition that a comparison needs a two-object selection gesture on the list, and it is why no
  such gesture is introduced here.
  ([JetBrains, comparing files and folders](https://www.jetbrains.com/help/idea/comparing-files-and-folders.html))
- **The documented pitfall of overflow menus remains discoverability**, and it now applies to four
  capabilities that were labelled and permanently visible. change-3 cited this literature when it moved
  six operations; the same warning applies again, to the operations the product is differentiated by.
  ([Eleken, table design UX](https://www.eleken.co/blog-posts/table-design-ux);
  [UX Design World, actions in data tables](https://uxdworld.com/best-practices-for-providing-actions-in-data-tables/))
- **Menu behaviour is an affordance browsers give nothing for free**, and the expectations are
  specific: the control announces that it opens a menu and whether it is open, the menu is a single
  stop in tab order with arrow keys between entries, and `Escape` closes it. This is the basis for
  assuming conventional behaviour from the reused component rather than re-specifying it, and for
  requiring labelled entries over icons at ten entries as at six.
  ([W3C WAI-ARIA APG, menu button](https://w3.org/WAI/ARIA/apg/patterns/menu-button))

## Risks

- **The junk drawer, realised.** change-3 named this exact outcome as the reason it declined the move,
  and the menu now holds ten of a documented twelve. The grouping is the mitigation and it is a real
  one, but the margin is nearly spent: the images surface is the one the ancestor analysis expects to
  grow — registry operations, vulnerability signals, more layer tooling — and the next request will
  arrive with nowhere obvious to put its entry. This is the risk to re-read before adding an eleventh.
- **A flow acts on the wrong image.** The list changes from outside the application, and an inspection
  flow opened with no panel has no visible tie to a row at all. Bound to the selection rather than to
  the invoking row, or re-bound when the list re-sorts, it would silently show the operator a different
  image than the one they asked about — and the operator has no reason to doubt what they are reading.
  On `Compare with…` this compounds: the wrong left-hand side produces a comparison that is entirely
  plausible and entirely wrong.
- **A flow silently depends on something the panel used to do.** All four are rendered by the panel
  today, so any of them may lean on data the panel had already fetched or state it had already
  established. Opened cold from a row menu, such a flow does not fail loudly — it shows less, or shows
  it later, or shows an empty state that looks like a legitimate result. This is the least visible part
  of the change and the one with the most work behind it.
- **`Escape` is mis-arbitrated in the new case.** A flow open with no panel is a chain the product has
  not had before. The failure modes are quiet in both directions: a keystroke swallowed by nothing, or
  a panel closing underneath a flow the operator was still using.
- **A flow outlives its image.** `Remove` sits in the same menu, four entries below `Browse
  filesystem…`, and a prune elsewhere on the machine produces the same state with no action by the
  operator. A view of an image that no longer exists is worse than an error, because it looks correct.
- **`Compare with…` looks broken when it greys out.** Its availability depends on the whole list, so
  deleting an unrelated image disables an entry on a row the operator never touched. Without the
  reason being discoverable this reads as a defect, and the operator's most likely response is to stop
  trusting the disabled states everywhere else in the menu — including the ones that are protecting
  them.
- **Discoverability, for the second time on this screen.** The four were labelled and visible on a
  panel; now they are revealed on demand, below a separator, in a menu that also holds six things. The
  reversal is cheap — one entry promoted back — but there is no migration hint and nothing tells an
  operator where the buttons went.
- **Muscle memory, twice in two changes.** change-3 taught the operator that the panel keeps its
  actions while the row's move behind a menu. This change teaches the opposite. Short-lived, real, and
  concentrated in exactly the period when the discoverability risk above is highest.
- **Certified work is re-opened and something adjacent breaks.** change-3 is merged and verified; this
  change reorganises the menu it built and empties the panel it kept. The most likely collateral damage
  is a check quietly dropped rather than rewritten — the suite goes green and the lost coverage is
  invisible, which is exactly how a capability disappears without anyone noticing.
- **The record is not corrected, or is corrected by deletion.** Left as it is, a certified analysis
  asserts the opposite of the product and the four buttons get "restored" by the next reader. Fixed by
  rewriting change-3's reasoning instead of superseding it, the project loses the record of a decision
  that was taken deliberately and then overridden — which is the more useful half of the history.
- **The empty panel reads as unfinished.** Two detail panels now show data and offer nothing. It is
  the intended end state and has a precedent, but it is the kind of emptiness a later contributor
  fills in good faith, and nothing on screen says otherwise. The requirement above states it; the
  risk is that the requirement is the only place it is stated.
- **The ten-entry menu is clipped or mispositioned.** Nearly twice the height that was verified, over
  a scrolled table, at the bottom of a long list, and over a detail panel. A clipped menu now hides
  both the operations and the capabilities the product is differentiated by.

## Scope

**In scope:** the removal of `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…` and
`Compare with…` from the image detail panel's action bar and their addition to the image row's
overflow menu, leaving that action bar empty and intentionally so, exactly as the container panel's
is; the grouping and ordering of the resulting ten entries into three groups — inspection, operations,
destruction — separated by the shared menu's existing group separators, with the four arrivals first,
the six existing entries keeping their relative order behind a separator, `Remove` last, set apart,
destructive and carrying its `rmi` hint, and no section headings; the ellipsis convention applied to
the four arrivals and the convention itself refined to "does not complete on activation"; making all
four flows openable, usable and closable with no detail panel open, bound to the image whose menu was
used, at most one at a time, opening and closing no panel as a side effect, with `Escape` arbitrated
for the new case and with each flow resolving itself when its image leaves the list; the semantics of
`Compare with…` started from a row — the row's image as the stated left-hand side, the second image
chosen inside the comparison view, the entry disabled in place with a discoverable, list-dependent,
live reason when there is no second image, and no comparison of an image with itself; the
re-verification of a ten-entry menu's readability and positioning wherever it opens; updating the
product's automated verification so that all ten operations stay demonstrably reachable through the
menu, that each of the four is demonstrably usable with no panel open, and that change-3's existing
coverage survives; and the recommended corrections to
[`docker_management_app-image_row_actions.md`](./docker_management_app-image_row_actions.md) at the
four sites named under Requirements, as superseding notes plus a head-of-file banner, applied by the
human.

**Out of scope** (unless a future request extends it): any change to what the four flows do, compute,
display, cache or cost — only their entry point and their independence from the panel are decided
here; any change to the six existing menu entries' order relative to one another, labels, hints, tone,
confirmations, feedback or the API behind them; the image detail panel's contents, layout, data,
opening and closing behaviour and continued absence of a close control, all of which are unchanged;
whether a panel that shows only data still earns its place, which nobody has asked; section headings,
search, scrolling or any other new capability of the menu component, and any images-specific variant
of it; multi-select, bulk actions, a two-row comparison gesture or any selection-plus-toolbar design;
rewriting change-3's reasoning, changing its verified-preconditions record, or introducing a
frontmatter convention for superseded analyses; keyboard shortcuts other than `Escape` for dismissal;
making rows into keyboard-operable disclosure controls, which remains the separate request change-2
recommended; the same reorganisation on any other screen — containers aside, which is already done,
and volumes, networks, Compose, Swarm, registries, contexts, builders and plugins keep their current
arrangement until asked for separately; the images screen's columns, sorting, filtering and top-level
toolbar; any redesign of the liquid-glass material or any addition to the blur allow-list; and the
three remaining items of `bugs.md` (bug-1, bug-2, bug-3), each being taken through the workflow
separately.
