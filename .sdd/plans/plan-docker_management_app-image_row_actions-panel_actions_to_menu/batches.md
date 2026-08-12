---
slug: docker_management_app-image_row_actions-panel_actions_to_menu
date: 2026-08-12
spec: .sdd/analysis/docker_management_app-image_row_actions-panel_actions_to_menu.md
requirements: .sdd/plans/plan-docker_management_app-image_row_actions-panel_actions_to_menu/requirements.md
status: validated
---

# Batches — The image panel's four actions become row-menu entries, and their four views become the screen's

Evolution of certified work, re-opened by the human. One feature, one batch, thirteen interventions.
Batch numbers and `REQ-n`/`INT-n` ids are **local to this plan**: `REQ-1` here is not
`plan-docker_management_app/REQ-1` and not `plan-docker_management_app-image_row_actions/REQ-1`.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · panel-actions-to-menu | F1 — The image panel's four actions become row-menu entries, and their four views become the screen's | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35 | — | todo | **The panel.** On Images & layers, selecting an image opens its detail panel and **there is no action bar on it at all** — no `Explore layers…`, no `Efficiency & signals…`, no `Browse filesystem…`, no `Compare with…`, nothing in their place, and no gap or stray padding where the strip was; the header reads like the container panel's. Everything else about the panel is as it was: the same data, sections and raw payload, still opened by its row, still closed by re-selecting that row and by `Escape`, still with no `✕`, still gone when its image leaves the list and back when a search that hid it is cleared. **The menu of ten.** The row's `…` now opens ten entries in three groups: `Explore layers…`, `Efficiency & signals…`, `Browse filesystem…`, `Compare with…` — separator — `Run…`, `Tag…`, `Untag`, `Push…`, `Save` — separator — `Remove`, still destructive, still carrying `rmi`, still confirming. No headings, no icons; the four newcomers keep their ellipses and carry no hint. The six older entries do exactly what they did. On a `<none>` image, `Untag` and `Push…` are still greyed with their reason. The menu opens in full on the last row of a long list and over an open panel, one at a time, fully from the keyboard. **The four with no panel open.** From a row's `…` on a screen with **no panel open anywhere**, each of the four opens on that row's image and works exactly as it did from the panel — the same layer stack, the same cost warnings and cancels, the same efficiency findings, the same filesystem tree, the same comparison, and the same reuse of the analysis cache (nothing re-extracts what was already extracted). Opening one opens no panel and closing one closes no panel: if a panel was open on a *different* image, the flow is still the invoked row's image and the panel is untouched when the flow closes; if none was open, none appears. Opening a second of the four closes the first. With a flow open, `Escape` dismisses nothing behind it — a panel open underneath is still there afterwards and the selection is unchanged. From the efficiency view, a finding still closes it and opens the layer explorer at that layer with the analysis already primed, and the explorer still marks the layers carrying findings; from Builders & cache, following a record's related image still lands on Images & layers with that image selected and its layer explorer open at the named layer. `docker rmi` of the image in another terminal, while one of the four is open on it, resolves the flow rather than leaving it showing an image that is gone. **`Compare with…`.** Started from a row, the comparison opens with that row's image as the left-hand side, **named in the view** so it is read rather than inferred, and the right side unchosen; picking the second image and comparing works as before. With only one image in the list the entry is greyed and its reason says the *list* has no second image, not that anything is wrong with this one; pulling a second image makes it available. Comparing an image with itself still cannot be started. The bulk two-checkbox `Compare filesystems…` is exactly as it was, with both sides pre-picked. **Nothing else.** The toolbar, columns, search, empty state, checkbox column, bulk bar, dialogs, progress, toasts and errors are unchanged, and the Containers screen and every other screen are untouched. `npm run lint`, `npm run test:typecheck -w client`, this batch's unit file and this batch's e2e specs (`images.spec.ts`, `layer-explorer.spec.ts`, `layer-efficiency-signals.spec.ts`, `filesystem-browser.spec.ts`, `image-diff.spec.ts`, `layer-build-cache.spec.ts`) pass, with `client/scripts/check-ui-conformance.mjs` unmodified. The full unit suite and the complete e2e suite are not this batch's business: the human runs them at the end. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases.

## Assumptions and decisions

- **One batch, and the parts stay attributable inside it.** The spec's four parts are one change to
  one screen: a menu entry that opens a flow is worthless until the flow can open without a panel,
  and a flow lifted to the screen is unreachable until the entry exists. Cutting them apart would
  produce a batch whose acceptance cannot be read without re-running the other's. The attributability
  is carried by the structure instead: the requirements are in declared blocks, and the interventions
  never mix them — **INT-1, INT-2 and INT-3 are part three**, **INT-4 is part two**, **INT-5 is part
  four**, **INT-6 is part one**, and INT-7…INT-13 are the verification. A failure names its part by
  naming the intervention it came from.
- **The spec's part five is already done, by the human, before this plan existed.**
  `.sdd/analysis/docker_management_app-image_row_actions.md` carries the head-of-file banner, a
  `superseded_in_part_by` key in its frontmatter, and a superseding note at each of the four named
  sites (the *Changes* bullet, the *Requirements* bullet including its `Compare with…` clause, the
  *Assumptions* bullet, and the *Scope* out-of-scope clause), each keeping the original passage rather
  than rewriting it. The spec assigns that work to the human explicitly. It carries no REQ and no INT,
  and **nothing in this batch may edit that file**; the two passages the spec protects — the
  verified-preconditions record and the junk-drawer risk — are untouched and stay untouched.
- **The one thing genuinely being built is that a flow can now be orphaned, and INT-3 is it.** All
  four flows are rendered by `ImageDetailPanel`, which is the `DataTable`'s `renderExpanded` keyed to
  `expandedRowKey={selectedId}` over `rows={filtered}`. An image that leaves the list renders no row,
  so no panel, so the four unmount with it — **for free, today**. Hosted by the screen they no longer
  do, and nothing appears broken until an image is removed while one of its views is open, at which
  point the view keeps showing an image that no longer exists. REQ-20 is therefore the requirement
  most likely to be skipped without anything failing, and it is a separate intervention so that a
  regression in it points at itself.
- **The screen already hosts one of the four, and that is the pattern to follow, not a coincidence.**
  `ImagesScreen` renders `ImageDiffView` at screen level for the bulk `Compare filesystems…`
  (`diffOpen`, `diffImageAId`, `diffImageBId`), while `ImageDetailPanel` renders a **second**
  `ImageDiffView` of its own for the panel's `Compare with…` (`initialImageAId={image.id}`, no B).
  After this batch there is **one** instance, and REQ-35 makes serving both shapes a constraint on it
  rather than a note about the past.
- **The panel supplies three things the four flows would otherwise silently lose**, and they are the
  spec's "flow silently depends on something the panel used to do" risk made concrete. Checked in
  `ImageDetailPanel.tsx`: (1) `navigateToLayer` — a finding closes the signals view and opens the
  explorer at that layer with `autoAnalyze` set, i.e. past the cost warning; (2) `onFindingsChange` →
  `layersWithFindings`, the map the explorer draws its SIGNALS markers from; (3) the `layerFocus`
  prop, by which a build-cache cross-reference (`plan-docker_management_app/REQ-69`) opens the
  explorer at a named layer. All three move to the screen as state, and all three are INT-2 —
  deliberately not folded into INT-1, because none of them fails loudly.
- **The build-cache cross-navigation keeps today's observable behaviour exactly**, settled by the
  human at the requirements gate: it still selects the image, its panel still opens, and the layer
  explorer still opens at the named layer. It is a different entry point from the row menu — part
  three's "opening one of the four opens no panel" is written about the menu entry — and
  `plan-docker_management_app/REQ-69` is a certified requirement of another plan that nobody asked to
  change. `client/e2e/layer-build-cache.spec.ts`'s third test is the guard, and it must pass
  untouched.
- **`Escape` needs no new mechanism, and this is the sharpest correction the plan makes to a natural
  misreading of the spec.** All four flows are `Modal`s, and in this product **`Escape` closes no
  dialog** (`.sdd/modules/ui-library/specs/modal.md`): an open `Modal` holds the innermost claim
  through the arbitration registry and *consumes the key doing nothing with it*, precisely so that
  nothing underneath is dismissed behind it. The spec's "any of the four takes `Escape` before the row
  menu and before the panel" is therefore about **arbitration**, not about a new close route, and
  REQ-18 says so in as many words. Making `Escape` close these four would be a product-wide change to
  every dialog in the application, out of this change's scope and contradicting REQ-34. **A second
  document-level `Escape` listener anywhere in this batch is a defect**, not an implementation choice.
- **`DetailPanel.actions` is optional** (`.sdd/modules/ui-library/specs/detail-panel.md`, established
  by change-2), so REQ-1 and REQ-2 are satisfied by **omitting the prop**, not by passing an empty
  node. An empty fragment would keep whatever spacing the header reserves for the slot and produce
  exactly the gap REQ-2 forbids.
- **`ImageDetailPanel` loses two props with the four flows, and they are removed rather than left
  dead.** `images: ImageSummary[]` exists only to feed the comparison and its below-two-images check,
  and `layerFocus` exists only to reach the layer explorer; both move to the screen, which is the
  component's only consumer. A prop kept "in case" is a contract asserting a capability the component
  no longer has.
- **No library component is modified, and that is a load-bearing instruction.** `Menu`,
  `ActionButtonGroup`, `DetailPanel`, `Modal` and the escape arbitration are consumed exactly as they
  stand. `MenuEntry` already carries `label`, `hint`, `destructive`, `separated`, `disabled`,
  `disabledReason` and `onSelect`, so a second separator is data, not a component change. **If the
  implementation finds itself editing `client/src/ui/controls/Menu.tsx` or `ActionButtonGroup.tsx`,
  that is the "second affordance" failure change-1 named — stop and ask**, as the spec instructs.
  Anything genuinely missing must be added generically, usable unchanged by another object list.
- **The action column keeps its width.** `--data-table-menu-action-column-width` sizes a column
  holding the overflow trigger alone; four more *entries* make the popup taller, not the trigger
  wider. No token changes, and no length is written on the screen.
- **The four new entries' disabled behaviour is only `Compare with…`.** `Explore layers…`,
  `Efficiency & signals…` and `Browse filesystem…` apply to every image and are never disabled — they
  are not conditional today on the panel either. Only `Compare with…` is, and its condition is
  `images.length < 2` against the **unfiltered** list, exactly as the panel computes it today: an
  image hidden by a search is still an image the daemon holds, and making the entry depend on the
  search would make it flicker for a reason the operator would read as a fault.
- **The disabled reason names the list, not the image**, per REQ-25: phrased as the condition of the
  *list* ("there is no second image in the list to compare with"), deliberately unlike `Untag` and
  `Push…`, whose reasons are phrased as the condition of *this* image. That difference is the whole
  point of REQ-25 and must survive review.
- **The comparison's left-hand side is stated, not pinned**, settled by the human at the requirements
  gate: locking the operand would change the comparison view's own behaviour, which the spec puts out
  of scope, and would make the row entry a worse door into the same view than the bulk one — an
  operator who opened the wrong row's menu would have to close and start again instead of correcting
  a `Select`.
- **Self-comparison is already prevented and is preservation, not new work.** `ImageDiffView`'s
  Compare button is `disabled={!imageA || !imageB || imageAId === imageBId}`. REQ-27 is stated so a
  later change cannot make it false in silence.
- **The `Compare filesystems` modal title does not change.** Six e2e locators find that view by the
  heading `Compare filesystems`; renaming it to state the left-hand image would be a rewrite of
  working checks for cosmetics. REQ-23 is met by a stated line **inside** the view, not by the title.
- **The point of interaction is expected to hold for free, and is verified rather than assumed.**
  Choosing a menu entry closes the `Menu`, which returns the focus to its trigger — the row's `…`,
  which is in the images list and outlives the flow. If measurement shows the focus is instead lost to
  the document when a flow closes with no panel around it, **stop and come back with what was
  measured**. Settled at the coverage gate, and deliberately *not* pre-authorised: a generic focus
  restore in `Modal` would change the behaviour of every dialog in the product, which is a decision
  to be taken on its own evidence and recorded where someone can find it — the same objection that
  keeps `Escape`-to-close out of this change, one component along. An images-specific fix is not an
  option in either direction.
- **The human's list of affected checks was illustrative, not exhaustive**, and the difference
  matters because REQ-28 forbids losing coverage. Named in the request:
  `client/e2e/images.spec.ts`, `client/test/unit/images-screen.test.tsx`,
  `client/e2e/filesystem-browser.spec.ts`. Found by following the four flows through the module index
  and reading the specs: **`client/e2e/layer-explorer.spec.ts`** (three tests, each `selectRow(row)`
  then `getByRole('button', { name: 'Explore layers…' })`), **`client/e2e/image-diff.spec.ts`** (two
  of its three tests open `Compare with…` from the panel; the third is the bulk path and is
  untouched), **`client/e2e/layer-efficiency-signals.spec.ts`**, and
  **`client/e2e/layer-build-cache.spec.ts`** (its `openLayerExplorer` helper, used by two of its three
  tests). Seven files, not three.
- **`client/e2e/exclusive/prune.spec.ts` is not in scope**: it drives the toolbar's prune and its
  confirmation, never a row action and never one of the four. No exclusive pass is touched.
- **The test runs are batch-scoped**, as the human stated: `npm run lint`,
  `npm run test:typecheck -w client`, this batch's unit file and this batch's e2e specs. The complete
  unit and e2e suites are the human's to run at the end, as they were for the six items already
  certified. No server pass is in scope — nothing server-side is touched, and no endpoint, service or
  Docker call changes.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` and `CLAUDE.md`: `client/src/ui/` is the only place allowed raw DOM tags and CSS,
  and everything else under `client/src/` composes it.

## Departures from the spec

**One, and it is a clarification the spec should carry rather than a decision taken against it.**

- **The spec's part three sentence "Any of the four takes `Escape` before the row menu and before the
  panel, and closing it must return the operator to the images list" reads, on a first pass, as
  requiring `Escape` to close these four views. It does not, and must not.** In this product `Escape`
  closes **no** dialog: `Modal` claims the key and deliberately does nothing with it, so that a
  surface underneath is not dismissed out from under an open dialog
  (`.sdd/modules/ui-library/specs/modal.md`, `escape-arbitration.md`). change-3 recorded
  `Escape`-to-close on `Modal`/`FormDialog`/`FormSheet` as explicitly out of its scope for the same
  reason. Read as arbitration — which is what the surrounding sentences argue and what the *Risks*
  section means by "a keystroke swallowed by nothing" — the requirement is already satisfiable and
  REQ-18 states it precisely. Read as a new close route, it is a product-wide change to every dialog
  in the application and contradicts the spec's own "nothing else changes". **The spec's sentence
  should be corrected to say arbitration explicitly.** If the human instead wants `Escape` to close
  these four, that is a different and larger change and this plan does not cover it — it was returned
  as a question, not assumed.

  **Settled at the coverage gate: the reading is confirmed and the departure is accepted.** REQ-18
  stands as rewritten, and **the human corrects the spec's sentence himself**, as he did with
  change-3's record. This entry is left standing as the traceable origin of that correction, not as
  an open question.

## Coverage check

**Every REQ is served by at least one INT**, and every REQ closes inside this batch — there is only
one batch, so nothing is split across batches and nothing is deferred.

| REQ | Part | Batch | Interventions serving it |
| --- | --- | --- | --- |
| REQ-1 | one | 1 | INT-6, INT-7, INT-8 |
| REQ-2 | one | 1 | INT-6, INT-7, INT-8 |
| REQ-3 | one | 1 | INT-6, INT-7, INT-8 |
| REQ-4 | one | 1 | INT-1, INT-4, INT-8, INT-9, INT-10, INT-11, INT-12, INT-13 |
| REQ-5 | two | 1 | INT-4, INT-7, INT-8 |
| REQ-6 | two | 1 | INT-4, INT-7, INT-8 |
| REQ-7 | two | 1 | INT-4, INT-7, INT-8 |
| REQ-8 | two | 1 | INT-4, INT-7, INT-8 |
| REQ-9 | two | 1 | INT-4, INT-7, INT-8 |
| REQ-10 | two | 1 | INT-4, INT-8 |
| REQ-11 | two | 1 | INT-4, INT-8 |
| REQ-12 | two | 1 | INT-4 |
| REQ-13 | three | 1 | INT-1, INT-7, INT-8, INT-9, INT-10, INT-11, INT-12 |
| REQ-14 | three | 1 | INT-1, INT-7, INT-8 |
| REQ-15 | three | 1 | INT-1, INT-7, INT-8 |
| REQ-16 | three | 1 | INT-1, INT-7 |
| REQ-17 | three | 1 | INT-2, INT-10, INT-13 |
| REQ-18 | three | 1 | INT-1, INT-8 |
| REQ-19 | three | 1 | INT-1, INT-8 |
| REQ-20 | three | 1 | INT-3, INT-7, INT-8 |
| REQ-21 | three | 1 | INT-1, INT-11 |
| REQ-22 | three | 1 | INT-1, INT-4, INT-6 |
| REQ-23 | four | 1 | INT-5, INT-12 |
| REQ-24 | four | 1 | INT-4, INT-5, INT-12 |
| REQ-25 | four | 1 | INT-4, INT-7, INT-8 |
| REQ-26 | four | 1 | INT-4, INT-8 |
| REQ-27 | four | 1 | INT-5, INT-12 |
| REQ-28 | verification | 1 | INT-7, INT-8, INT-9, INT-10, INT-11, INT-12, INT-13 |
| REQ-29 | verification | 1 | INT-7, INT-8 |
| REQ-30 | verification | 1 | INT-8, INT-9, INT-10, INT-11, INT-12 |
| REQ-31 | verification | 1 | INT-4, INT-8 |
| REQ-32 | verification | 1 | INT-4 |
| REQ-33 | verification | 1 | INT-1, INT-4, INT-8 |
| REQ-34 | verification | 1 | INT-1, INT-4, INT-5, INT-6 |
| REQ-35 | four | 1 | INT-1, INT-5, INT-12 |

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none. INT-1
would have been the candidate — lifting the four flows to the screen is the change's plumbing — but
it carries REQ-13 to REQ-16 in its own right, since "reachable with no panel open" *is* the
observable behaviour the plumbing exists to produce.

| INT | REQ served |
| --- | --- |
| INT-1 | REQ-4, REQ-13, REQ-14, REQ-15, REQ-16, REQ-18, REQ-19, REQ-21, REQ-22, REQ-33, REQ-34, REQ-35 |
| INT-2 | REQ-17 |
| INT-3 | REQ-20 |
| INT-4 | REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-22, REQ-24, REQ-25, REQ-26, REQ-31, REQ-32, REQ-33, REQ-34 |
| INT-5 | REQ-23, REQ-24, REQ-27, REQ-34, REQ-35 |
| INT-6 | REQ-1, REQ-2, REQ-3, REQ-22, REQ-34 |
| INT-7 | REQ-1, REQ-2, REQ-3, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-13, REQ-14, REQ-15, REQ-16, REQ-20, REQ-25, REQ-28, REQ-29 |
| INT-8 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-13, REQ-14, REQ-15, REQ-18, REQ-19, REQ-20, REQ-25, REQ-26, REQ-28, REQ-29, REQ-30, REQ-31, REQ-33 |
| INT-9 | REQ-4, REQ-13, REQ-28, REQ-30 |
| INT-10 | REQ-4, REQ-13, REQ-17, REQ-28, REQ-30 |
| INT-11 | REQ-4, REQ-13, REQ-21, REQ-28, REQ-30 |
| INT-12 | REQ-4, REQ-13, REQ-23, REQ-24, REQ-27, REQ-28, REQ-30, REQ-35 |
| INT-13 | REQ-4, REQ-17, REQ-28 |

**Five notes on the shape of that mapping**, all deliberate:

- **INT-2 and INT-3 each serve exactly one REQ, and that is why they exist.** Folded into INT-1 they
  would be two lines inside the batch's largest edit, and both fail silently: a dropped
  `onFindingsChange` shows an explorer with no markers, which looks like an image with no findings,
  and a missing orphan check shows a view of a deleted image, which looks correct. Each points at
  itself.
- **REQ-12, REQ-32 are closed by INT-4 alone, and partly by files nobody edits.** `Menu.tsx`,
  `ActionButtonGroup.tsx`, `client/scripts/check-ui-conformance.mjs` and the `CLAUDE.md` allow-list
  table gain nothing. INT-4 closes them precisely by adding two `MenuEntry` flags and no markup, no
  CSS, no tone and no surface.
- **REQ-18 and REQ-19 are preservation requirements with no builder.** They hold by `Modal` claiming
  the key through the one arbitration registry and by `Menu` returning the focus to its trigger.
  INT-1 keeps them true while it moves the flows; INT-8 asserts them against the real screen for the
  first time in the case that did not exist before.
- **REQ-29 is the anti-regression requirement of a re-opened change**, and it is served by the two
  files that hold change-3's own coverage. Nothing in the batch *builds* it; INT-7 and INT-8 are
  where it is kept, and "delete nothing that is there" is written into both.
- **REQ-34 hangs where the screen is edited and can only be failed.** "Nothing else changes" is not
  something an intervention adds; it is contradicted by any observable difference the tester finds
  beyond the four buttons leaving, the four entries arriving, and the four flows opening without a
  panel.

## Risks carried forward

- **A flow silently depends on something the panel used to do.** The spec names this as the least
  visible part of the change and it is correct: three concrete dependencies were found by reading the
  panel (`navigateToLayer`, `onFindingsChange`, `layerFocus`), and none of them fails loudly. INT-2
  carries all three and INT-10 and INT-13 assert them, but a fourth dependency nobody spotted would
  surface as "shows less, or later, or an empty state that looks like a legitimate result".
- **A flow outlives its image.** Free today, new work now, and invisible until it happens — the
  single most skippable requirement in the plan (REQ-20, INT-3). `Remove` sits four entries below
  `Browse filesystem…` in the same menu, and a prune elsewhere on the machine produces the same state
  with no action by the operator.
- **A flow acts on the wrong image.** With no panel open there is no visible tie between a flow and a
  row at all. Bound to `selectedId` rather than to the invoking image — the easy mistake, since
  `selectedId` is right there and is what the panel used — it would show a plausible, wrong image, and
  on `Compare with…` it would produce an entirely plausible and entirely wrong comparison.
- **The bulk comparison breaks and nobody notices.** Collapsing two `ImageDiffView` instances into one
  makes the bulk path share an interface shaped mostly by the row path. It is the shape exercised
  least and the first to break, which is why REQ-35 is a constraint and REQ-30 demands both shapes be
  driven; `image-diff.spec.ts` already has the bulk test and it must stay untouched and passing.
- **A check is dropped instead of rewritten.** Seven files target controls that will not exist; the
  suite goes green either way and the lost coverage is invisible. REQ-28 and INT-7…INT-13 exist for
  that, and "delete nothing that is there" is written into each of them.
- **The junk drawer, realised.** Ten entries of a documented twelve, on the surface the ancestor
  analysis expects to grow. The grouping is a real mitigation and the margin is nearly spent: the next
  request will arrive with nowhere obvious to put its entry. Re-read this before adding an eleventh.
- **Discoverability, for the second time on this screen**, and this time for the capabilities the
  product is differentiated by. Four labelled, permanently visible buttons become four entries
  revealed on demand. Nothing tells an operator where they went; the reversal is cheap (one entry
  promoted back) and this is the first thing to revisit if anyone reports not finding one.
- **The empty panel reads as unfinished.** Two detail panels now show data and offer nothing. It is
  the intended end state, it has a precedent, and it is exactly the kind of emptiness a later
  contributor fills in good faith. REQ-2 states it; the risk is that the requirement is the only place
  it is stated.
- **The ten-entry menu is clipped or mispositioned**, at nearly twice the verified height, over a
  scrolled table, at the bottom of a long list, and over an open detail panel. A clipped menu now
  hides the operations *and* the capabilities the product is differentiated by.
