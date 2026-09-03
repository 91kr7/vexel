---
slug: docker_management_app-image_row_actions
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-image_row_actions.md
requirements: .sdd/plans/plan-docker_management_app-image_row_actions/requirements.md
status: validated
---

# Batches — The images row's actions move into one menu, and the image panel closes by its row

Evolution of a certified product. One feature, one batch, ten interventions. Batch numbers and
`REQ-n`/`INT-n` ids are **local to this plan**: `REQ-1` here is not `plan-docker_management_app/REQ-1`.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · image-row-actions | F1 — The images row's actions move into one menu, and the image panel closes by its row | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36, REQ-37 | — | certified | **Half one — the row.** On Images & layers, the end of every image row carries one `…` control and nothing else, in the same place on every row, tagged or dangling; the data columns are visibly wider than before. Opening it gives six entries in this order: `Run…`, `Tag…`, `Untag`, `Push…`, `Save`, `Remove` — `Remove` last, in the destructive tone, separated from the five above it and carrying `rmi` beside its label. On a `<none>` image the same six entries appear, `Untag` and `Push…` greyed and saying why they are unavailable. Each entry does exactly what its button did: `Run…` opens the create-and-run form pre-filled, `Tag…` the reference dialog, `Untag` untags at once with one tag and asks which with several, `Push…` the reference dialog and its per-layer progress, `Save` starts the download and toasts, `Remove` asks the same confirmation and only then removes. Opening a second row's menu closes the first; `Escape`, a click away and choosing an entry all close it and hand the focus back to the `…`; the menu opens in full on the last row of a long list; it is fully usable from the keyboard. Pulling or removing an image from another terminal while a menu is open keeps the list updating, and the menu keeps acting on its own image or closes. The checkbox column and the bulk bar (`Save to tarball…`, `Compare filesystems…`) are exactly as they were. **Half two — the panel.** Selecting an image opens its panel below the row with **no `✕` anywhere on it**, and no gap or stray padding where it was; the four actions — `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…`, `Compare with…` — are unchanged, in the same order, `Compare with…` still unavailable below two images. Clicking that row again closes the panel; clicking another row re-points it. `Escape` closes it, including from focus inside its body. With that row's `…` menu open, `Escape` closes only the menu and the panel is still there; a second closes the panel. With the tag dialog, the remove confirmation, the layer explorer or the filesystem browser open, `Escape` leaves the panel alone. `Remove` on the row whose panel is open takes the row, the panel and the selection away together — and re-pulling the same image afterwards does **not** make the panel reappear by itself. A search that hides the row hides its panel too, and clearing the search brings both back unchanged. While a panel is open its row is visibly the selected one. On the Containers screen nothing has changed. `npm run lint`, `npm run test:typecheck -w client`, this batch's unit files and this batch's e2e specs (`images.spec.ts`, `image-transport.spec.ts`, `container-create-run.spec.ts`, `filesystem-browser.spec.ts`) pass, the UI conformance check included with `client/scripts/check-ui-conformance.mjs` unmodified. The full unit suite and the complete e2e suite are not this batch's business: they run once at the end, after every item of `bugs.md` is certified. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases.

## Assumptions and decisions

- **One batch, and the two halves stay attributable inside it.** The change is one screen's row
  actions and the same screen's panel control. Cutting it in two would split one feature by surface,
  and the second batch's acceptance would be unreadable without re-running the first's. Instead the
  attributability the spec asks for is carried by the structure: the requirements are in two declared
  blocks (REQ-1…REQ-19, REQ-20…REQ-31), the interventions never mix them — **INT-2 is the whole of
  half one's product change, INT-3 and INT-4 the whole of half two's** — and the acceptance criterion
  is written in two labelled halves. A failure names its half by naming the intervention it came from.
- **The selection-clearing is its own intervention (INT-4), deliberately not folded into INT-3.**
  Removing the `✕` and clearing a stale selection are independent behaviours that happen to arrive
  together; if the second regresses it must point at itself rather than at the missing glyph. It is
  also the one piece of half two that is genuinely new behaviour rather than a removal or a variant
  flag.
- **The hazard INT-4 answers was checked in the product, and is not the hazard the spec predicted.**
  The panel is the `DataTable`'s `renderExpanded` content keyed to `expandedRowKey`, over
  `rows={filtered}` — so an image that leaves the list renders no row and therefore no panel. Nothing
  is ever stranded on screen, and that half of REQ-29 holds today for free (it is stated anyway, so a
  later change cannot make it false in silence). What does not hold is the other half:
  `ImagesScreen` has **no** effect clearing `selectedId`, unlike `ContainersScreen.tsx:154-156` which
  has had one since it was written. An image id is a digest of the image's content, so removing an
  image and later pulling or building the same content reproduces the same id — and the stale
  selection makes the panel spring open unasked, for a reason the operator cannot see. INT-4 mirrors
  the containers effect, compared against the **unfiltered** list: an image hidden by a search has not
  left the list (REQ-30), and clearing that selection would throw away the same useful behaviour
  change-2 deliberately kept for containers.
- **No library component is modified, and that is a load-bearing instruction rather than an
  observation.** `Menu`, `ActionButtonGroup` (whose `overflow` slot already renders as the trailing
  slot and works with an empty `actions` array), `DetailPanel` (whose `dismissal="opening-gesture"`
  presentation was built and certified by change-2) and the escape arbitration are consumed exactly
  as they stand. The batch's one library edit is a design token (INT-1). **If the implementation
  finds itself changing `Menu.tsx`, `ActionButtonGroup.tsx` or `DetailPanel.tsx` to make this screen
  work, that is the failure change-1 named when it deferred this screen — a second menu, or the
  shared one bent into an images-specific shape — and it should stop and come back** rather than
  proceed. Anything genuinely missing from the library must be added generically, usable unchanged by
  volumes, networks or any other list.
- **The action column's width is a shared token, so it is handled in the library (INT-1).**
  `--data-table-action-column-width: 296px` is documented in `client/src/ui/tokens.css` as "sized for
  up to 6 dense action buttons" — that is the *images* row's six, and the containers screen uses the
  same token for its three buttons plus overflow. Leaving images on it would put one `…` in a 296px
  column and leave the spec's whole width argument unpaid; narrowing it in place would break the
  containers row. Hence a second token for an action column that holds the overflow control alone.
  Feature code may not write a length, so the value has to live there and nowhere else.
- **`Escape` needs no new mechanism on this screen.** Every dialog and flow reachable here is already
  a claimant: `LayerExplorer`, `LayerEfficiencyView`, `FilesystemBrowser` and `ImageDiffView` are
  `Modal`s, the six screen dialogs are `FormDialog`s, `ContainerCreateForm` is a `FormSheet`, and
  change-2 made `Modal`, `FormSheet` and `DetailPanel` claim the key through one registry. The only
  new claimant is the row menu, and it claims by being the shared `Menu`. Half two's arbitration is
  therefore preservation plus one consumer — nothing is built, and **a second document-level `Escape`
  listener anywhere in this batch is a defect**, not an implementation choice.
- **`remove` already confirms.** `ImagesScreen.handleRemove` goes through `useConfirmation().confirm()`
  with the image's display title and its consequence. REQ-11 is a preservation requirement; no
  confirmation is added, and none may be dropped on the grounds that a menu is already a deliberate
  step.
- **`save` acts immediately, and the label follows from that.** `startSave` calls `triggerDownload`
  and pushes a toast: no dialog, no confirmation. Hence `Save` without an ellipsis, and hence the
  correction recorded under Departures. Recorded here too so that nobody "fixes" the missing ellipsis
  later by reading the spec's old list.
- **`Untag` is conditional and takes one fixed label.** It untags at once when the image has a single
  tag and opens a choice dialog when it has several. REQ-8 forbids a label that changes between
  openings, the single-tag case is the common one, and the spec's own list says `Untag`: no ellipsis.
- **The menu trigger is named `More actions for <display title>`**, using the screen's existing
  `displayTitle` helper — the tags joined, or `<none> (shortId)` for a dangling image, which is what
  the confirmations and toasts already say and what keeps two dangling rows distinguishable. Same
  shape as change-1's `More actions for <container name>`, which is what the e2e suite already knows
  how to find.
- **The `ACTIONS` column header stays.** Nothing asked for a rename, the column still holds the row's
  actions, and two existing checks assert the full header list (`images-screen.test.tsx:143`,
  `images.spec.ts:126`) — leaving it is what keeps them passing honestly rather than rewritten for
  cosmetics.
- **A disabled entry states a reason, not a rule**: "this image has no tags to untag" / "…to push",
  phrased as the condition of *this* image, so a greyed line reads as "not for this image" rather
  than as a policy or a fault.
- **`client/e2e/exclusive/prune.spec.ts` is not in scope.** It drives the toolbar's "Prune dangling"
  and the confirmation, never a row action, so no exclusive pass is touched by this batch.
- **The test runs belong to this session and are batch-scoped**, as they were for change-1 and
  change-2: the human has delegated them and the machine is held. The tester runs `npm run lint`,
  `npm run test:typecheck -w client`, this batch's unit files and this batch's e2e specs
  (`images.spec.ts`, `image-transport.spec.ts`, `container-create-run.spec.ts`,
  `filesystem-browser.spec.ts`) — **not** the full unit suite and **not** the complete e2e suite,
  which run once at the very end, after all six items of `bugs.md` are certified. change-3 is the
  third of six. No server pass is in scope: nothing server-side is touched.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` (current) and `CLAUDE.md`: `client/src/ui/` is the only place allowed raw DOM tags
  and CSS; everything else under `client/src/` composes it.

## Departures from the spec

Two, both settled by the human at the requirements gate, and both requiring the **spec to be
corrected** rather than the plan to be re-read against it.

- **The entry labels are `Run…`, `Tag…`, `Untag`, `Push…`, `Save`, `Remove`** — the spec's list says
  `Push` and `Save…`. The spec also states that the ellipsis convention must be applied to what the
  operations actually do and that which of them ask for input "is a property of the flows that
  already exist, not a decision of this analysis". Checked in the product: `push` **always** opens a
  `FormDialog` collecting the reference (a `Select` with several tags, a `TextField` otherwise), so it
  carries the ellipsis; `save` opens nothing at all, so it does not. The order is untouched — the
  row's left-to-right sequence is preserved exactly, `Untag` before `Push…`.
- **The spec's sentence "not one of the six acts without either a form or a confirmation" is false for
  `save`**, and the correction must be written into the Business goal rather than the sentence
  deleted. The rule the human settled has **two** conditions: a row keeps a permanently visible action
  only when it is taken on nearly every visit **and** completes without asking for anything. `run`
  fails the immediacy condition — it opens the create-and-run form. `save` passes immediacy and fails
  frequency — exporting an image to a tarball is an occasional operation, not something done on nearly
  every visit. No action passes both, so **the decision to move all six is unchanged and better
  grounded**: the corrected statement shows both conditions doing work, where the old one rested on
  immediacy alone and was wrong about one of the six.

## Coverage check

**Every REQ is served by at least one INT**, and every REQ closes inside this batch — there is only
one batch, so nothing is split across batches.

| REQ | Half | Batch | Interventions serving it |
| --- | --- | --- | --- |
| REQ-1 | row | 1 | INT-2, INT-5, INT-7 |
| REQ-2 | row | 1 | INT-2, INT-5, INT-7 |
| REQ-3 | row | 1 | INT-2, INT-7 |
| REQ-4 | row | 1 | INT-2, INT-5, INT-7 |
| REQ-5 | row | 1 | INT-2, INT-5 |
| REQ-6 | row | 1 | INT-2, INT-5 |
| REQ-7 | row | 1 | INT-2, INT-5, INT-7 |
| REQ-8 | row | 1 | INT-2, INT-5, INT-7 |
| REQ-9 | row | 1 | INT-2, INT-5, INT-7 |
| REQ-10 | row | 1 | INT-2, INT-5, INT-6, INT-7, INT-8, INT-9 |
| REQ-11 | row | 1 | INT-2, INT-5, INT-7 |
| REQ-12 | row | 1 | INT-2, INT-7 |
| REQ-13 | row | 1 | INT-2, INT-7 |
| REQ-14 | row | 1 | INT-2, INT-7 |
| REQ-15 | row | 1 | INT-2, INT-7 |
| REQ-16 | row | 1 | INT-2, INT-7 |
| REQ-17 | row | 1 | INT-2, INT-5 |
| REQ-18 | row | 1 | INT-1, INT-2, INT-5 |
| REQ-19 | row | 1 | INT-2, INT-5, INT-7 |
| REQ-20 | panel | 1 | INT-3, INT-5, INT-7, INT-10 |
| REQ-21 | panel | 1 | INT-3, INT-5, INT-7 |
| REQ-22 | panel | 1 | INT-4, INT-5, INT-7, INT-10 |
| REQ-23 | panel | 1 | INT-4, INT-5, INT-7 |
| REQ-24 | panel | 1 | INT-3, INT-5, INT-7 |
| REQ-25 | panel | 1 | INT-2, INT-3, INT-7 |
| REQ-26 | panel | 1 | INT-3, INT-5 |
| REQ-27 | panel | 1 | INT-3, INT-5 |
| REQ-28 | panel | 1 | INT-4, INT-7 |
| REQ-29 | panel | 1 | INT-4, INT-5, INT-7 |
| REQ-30 | panel | 1 | INT-4, INT-5, INT-7 |
| REQ-31 | panel | 1 | INT-3, INT-5 |
| REQ-32 | both | 1 | INT-5, INT-6, INT-7, INT-8, INT-9, INT-10 |
| REQ-33 | both | 1 | INT-2, INT-7 |
| REQ-34 | both | 1 | INT-1, INT-2 |
| REQ-35 | both | 1 | INT-2, INT-3 |
| REQ-36 | both | 1 | INT-2 |
| REQ-37 | both | 1 | INT-2, INT-3, INT-4 |

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none. INT-1
would have been the candidate — it is a design token — but it carries REQ-18 and REQ-34 in its own
right, since the width the row gives back to the data is the change's own stated gain.

| INT | REQ served |
| --- | --- |
| INT-1 | REQ-18, REQ-34 |
| INT-2 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-25, REQ-33, REQ-34, REQ-35, REQ-36, REQ-37 |
| INT-3 | REQ-20, REQ-21, REQ-24, REQ-25, REQ-26, REQ-27, REQ-31, REQ-35, REQ-37 |
| INT-4 | REQ-22, REQ-23, REQ-28, REQ-29, REQ-30, REQ-37 |
| INT-5 | REQ-1, REQ-2, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-26, REQ-27, REQ-29, REQ-30, REQ-31, REQ-32 |
| INT-6 | REQ-10, REQ-32 |
| INT-7 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-28, REQ-29, REQ-30, REQ-32, REQ-33 |
| INT-8 | REQ-10, REQ-32 |
| INT-9 | REQ-10, REQ-32 |
| INT-10 | REQ-20, REQ-22, REQ-32 |

**Four notes on the shape of that mapping**, all deliberate:

- **INT-2 carries most of half one on its own, and that is the point of the change.** Moving six
  buttons into the shared menu is one edit to one file; the entries' order, labels, tone, hints,
  disabled states and reasons are all properties of the list the screen hands the library. What
  prevents that from being a lump is that the library is doing the work and is not being touched:
  REQ-12 to REQ-16 are honoured by consuming `Menu` unchanged, and every one of them is asserted
  against the real screen by INT-7.
- **REQ-22, REQ-23, REQ-28, REQ-30 and REQ-33 are preservation requirements.** They hold today and
  the change promotes them from convenience to guarantee, because it removes the alternative route
  (the `✕`) or adds a surface over the list (the menu). No intervention builds them; INT-4 is where
  they are kept true while it edits selection, and INT-5/INT-7 are where several of them are asserted
  for the first time.
- **REQ-35 is closed by files nobody edits.** `client/scripts/check-ui-conformance.mjs`,
  `blurAllowedOverlaySelectors` and the `CLAUDE.md` allow-list table gain nothing; INT-2 and INT-3
  close it precisely by adding no CSS, no overlay surface and no filter. The menu popup's overlay
  material was admitted with change-1 and this batch adds a consumer, not a surface.
- **REQ-37 hangs where the screen is edited and can only be failed.** "Nothing else about the images
  screen changes" is not something an intervention adds; it is contradicted by any observable
  difference the tester finds beyond the six actions moving and the `✕` leaving.

## Risks carried forward

- **Discoverability, in its strongest form.** Nothing remains on the row to say images can be acted
  on except the `…`. An operator who learned six labelled buttons finds one glyph. This is the
  accepted trade and it is larger than change-1's, which left three buttons behind. It is the first
  thing to revisit if anyone reports not finding an operation, and the reversal — promoting one entry
  back onto the row — is cheap and disturbs nothing.
- **The wrong image is removed.** The sharpest risk in the change: `Remove` now sits in a menu that
  stays open while the list re-reads from pulls, builds and prunes happening in the operator's own
  terminal. The mechanism is sound — handlers bound to the row's own image, the popup gone with its
  trigger when the row unmounts — and INT-7 asserts it, but the failure is irreversible and silent
  when it happens.
- **The panel's close control is missed**, with change-2's documented precedent (GitLab's users
  failing to find the way out of a panel whose `✕` had been removed). The mitigations are the row's
  visible open state and `Escape`, neither of which announces itself, and the row's selected
  treatment is deliberately **not** strengthened here — that would be a restyling of a settled screen
  in a change asked to remove a control.
- **The overflow becomes a junk drawer.** This menu starts at six entries where the containers menu
  started at four, and images is the surface the reference analysis expects to grow. Each future
  addition needs an argument of its own, or the menu reproduces at one remove the clutter this change
  removes from the row.
- **The two screens read as inconsistent rather than governed by a rule.** Containers rows show three
  buttons and an overflow; images rows show only an overflow. The rule that resolves it — permanent
  placement is earned by frequency **and** immediacy, `run` failing the first condition and `save` the
  second — lives in the spec and in this plan, and is one forgotten sentence away from looking like
  drift the next time a list screen is built.
- **Checks are dropped instead of rewritten.** Fourteen existing assertions across six files target
  controls that will not exist. Deleting them removes exactly the coverage proving the operations are
  still reachable and the panel still dismissable, and does it with the suite green. REQ-32 and
  INT-5 to INT-10 exist for that, and "delete nothing that is there" is written into each of them.
- **Muscle memory, twice over**: "far right of the row is `remove`" now opens a menu with `Remove` a
  short distance further in, and the panel's corner is empty. Short-lived, real, and concentrated in
  the period when the two discoverability risks above are at their highest.
