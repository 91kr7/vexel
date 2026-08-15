---
request_slug: ui-coherence-optimisation-comfortable_variant_retired
date: 2026-08-15
type: fix
reference: .sdd/analysis/ui-coherence-optimisation.md
---

## Request

> Retire the DataTable "comfortable" variant: every object list is drawn as a plain ruled table, like
> Containers and Images.
>
> **WHAT IS WRONG** (observed by the human on the Plugins screen, "CLI plugins" card, at desktop
> width, on the delivered build). The comfortable variant draws a column-header row AND puts every row
> on a separate rounded card with a gap between rows. The two readings contradict each other: the
> header says "table", the detached cards say "list of cards", and the columns stop reading as columns
> — the WHY UNAVAILABLE cell shows a lone "–" floating roughly 1100px from the label that names it,
> with nothing tying the two together. It is a table/card hybrid. The human's judgement, stated
> directly: render it as a normal table, like Containers.
>
> **THE DECISION** (the human's, already taken — the analysis records it and its consequences, it does
> not re-open it). The comfortable variant is retired entirely, not merely avoided on Plugins. Keeping
> two list looks — one of them a hybrid — is exactly the extra "answer" that
> plan-ui-coherence-optimisation exists to remove (its REQ-81: one way an object is listed). After
> this, DataTable has one look: dense, ruled rows, like the containers and images tables.
>
> **SCOPE**, counted against the source rather than estimated: 18 `variant="comfortable"` call sites
> across 9 screens — client/src/volumes-networks/VolumesPanel.tsx, NetworksPanel.tsx,
> client/src/registries/RegistriesScreen.tsx (x2), client/src/builders/BuildersScreen.tsx (x2),
> client/src/contexts/ContextsScreen.tsx, client/src/plugins/PluginsScreen.tsx (x2),
> client/src/compose/ComposeScreen.tsx (x2), client/src/swarm/SwarmNodesPanel.tsx,
> SwarmServicesPanel.tsx (x2), SwarmSecretsPanel.tsx, SwarmConfigsStacksPanel.tsx (x3). Plus
> client/src/images/LayerEfficiencyView.tsx (3 sites) which plan-ui-coherence-optimisation batch 13 has
> NOT yet migrated and which must not be sent to a variant that is being retired. Verify this
> enumeration yourself against the source rather than trusting the figure.
>
> **TWO TECHNICAL FACTS THE CONVERSION MUST NOT LOSE**, both read in client/src/ui/data/DataTable.tsx:
> 1. `renderRowContent` is rendered only when the variant is comfortable (DataTable.tsx:382). It
>    carries swarm's per-row chips and compose's nested grouped list. Converting those screens to dense
>    without first ungating it silently deletes that content. It must be ungated from the variant, not
>    worked around at the call sites.
> 2. A comfortable row grows to fit its content (DataTable.tsx:261-262) whereas a dense row clips to
>    `rowHeight`. Rows carrying a title over a monospace subtitle (volumes, networks, registries) need
>    `autoRowHeight`, which dense already offers.
>
> Everything else — the column tracks and their minimums, the horizontal pan, the cells, the truncation
> contract, the expansion slot — is shared between the two variants already, so what actually goes is
> the per-row card surface: the `ComfortableRowCarrier` in DataTable.tsx and the comfortable block of
> client/src/ui/data/data-table.css (roughly lines 90-141, including the header inset rule at :122 that
> exists only to align the header with the cards).
>
> **WHY NOW, AND WHERE IT LANDS.** plan-ui-coherence-optimisation is mid-flight: batches 1-12 are
> certified, batches 13-19 are still todo. The library must be corrected before batch 13, so the
> remaining batches inherit the corrected look instead of adopting the hybrid and being reconverted
> afterwards. This contradicts a validated requirement of that plan — REQ-22
> (.sdd/plans/plan-ui-coherence-optimisation/requirements.md:140) currently REQUIRES the two variants
> ("One object-list primitive, with a dense and a comfortable variant") — so REQ-22 must be amended in
> place, with the reason recorded, rather than quietly violated. Also examine REQ-81, batch 5's INT-1
> and INT-9 (its unit tests cover "dense and comfortable"), and batch 13's INT-7, which currently
> instructs migrating LayerEfficiencyView's three CardList sites to the comfortable variant. State
> explicitly which artefacts of that plan this analysis obliges to change and how.
>
> **CONSTRAINTS.** CLAUDE.md's UI rule stands: nothing outside client/src/ui/ may gain raw tags, CSS
> or style props, the blur allow-list and client/scripts/check-ui-conformance.mjs are untouched, and
> the CardList call-site budget that batch 5 seeded stays correct. No server file is in scope. Checks
> are driven with a real pointer at the visible control's coordinates and assert viewport boxes, not
> just content, per CLAUDE.md.

## Reference

Fix of the work analysed in
[`.sdd/analysis/ui-coherence-optimisation.md`](./ui-coherence-optimisation.md) and being delivered by
`plan-ui-coherence-optimisation`, batches 1–12 of which are certified on this branch.

**Starting point.** That analysis's governing observation is that *a list has two library answers, not
one*: `DataTable` served containers, images, dashboard and coverage; `CardList` served seventeen call
sites across eleven files; `GroupedRowsPanel` served compose. Its Direction §7.2 chose to end that by
**"one list, by extending `DataTable` with a comfortable variant"**, so that the column contract and
the truncation contract repaired in batches 2 and 4 would be inherited by the migrated screens rather
than reimplemented. The plan turned that sentence into REQ-22 and delivered it in batch 5; batches
6–12 then migrated volumes, networks, registries, builders, contexts, plugins, compose and the four
swarm panels onto it. Fourteen of the seventeen `CardList` sites are gone; three remain, in
`images/LayerEfficiencyView.tsx`, and batch 13 is to migrate them and delete the component.

**Changes.** The mechanism chosen to deliver "one list" did not deliver one *look*. The comfortable
variant kept the column header of a table and gave every row the detached card of a card list, so the
seven migrated screens now show a third arrangement that is neither. This fix removes that variant
altogether, leaving `DataTable` with the single ruled-row look containers and images already have. It
adds no capability and removes no function: the same objects, columns, values, actions, expansions and
row content stay, drawn one way instead of two. It also amends the requirement that mandated the
variant, rather than shipping in contradiction with it.

## Summary

`DataTable`'s comfortable variant is retired, and the seven screens migrated onto it — 18 call sites in
11 files — are drawn as plain ruled tables like containers and images. `DataTable` is left with one
look, so the six batches still to come inherit the corrected one.

## Business goal

**The hybrid destroys the one thing a table is for: reading a value as belonging to a column.** On the
Plugins screen the human read a lone `–` roughly 1100px from the `WHY UNAVAILABLE` header that names
it, with the row's own card boundary — a gap and two rounded corners — cutting the line of sight
between them. A header row promises that every value below it is in a column; detached cards promise
that every card is a self-contained object read on its own. Shipping both promises at once means the
operator's eye is given no rule at all, and the wider a screen gets the further the value drifts from
its label. The programme's own REQ-89 says a layout defect is a fact about geometry; this one is
1100px of it.

**A hybrid is exactly the extra answer the programme exists to remove.** The reference analysis counts
four answers to "how is an object listed" and calls reducing them to one the measure of success
(REQ-81, REQ-92: *a screen not yet written has no design decisions left to make*). A variant prop that
changes the look rather than only the density restores the choice the consolidation removed: the next
screen must again decide whether its objects are rows or cards, and the answer will again be whichever
screen it was copied from. Retiring the variant is not a preference about rounded corners; it is the
difference between the programme having reduced the answers to one and having renamed two of them.

**Now, not after batch 13, and that is the whole reason this is urgent.** Six batches remain (13–19),
including the one that migrates the last three `CardList` sites onto the object list. Left alone, they
adopt the hybrid, are certified against it, and are then reconverted — a second migration of screens
that were just migrated, plus a second round of coverage rewrites. The cost of correcting the library
is roughly the same today as tomorrow; the cost of everything downstream is not.

**And the requirement that mandated it must be corrected in the open.** REQ-22 is a validated
requirement of a plan in flight and it currently *requires* the two variants. Implementing this fix
silently would leave the plan's own record asserting the opposite of the shipped product — the exact
condition that makes a later reader reinstate what was deliberately removed. The amendment, with its
reason and its date, is a deliverable of this fix and not paperwork around it.

## Requirements

### Functional

- **One look for every object list in the product.** After this fix, a list of objects is drawn one
  way: ruled rows under one header row, as containers and images are drawn today. No screen, card,
  panel or nested list is drawn as a stack of detached row cards, and the library offers no way to ask
  for one.
- **The variant is removed, not merely unused.** A variant left available is the next screen's second
  answer — the same argument REQ-82 makes about a list component left exported. The choice must be
  absent from the component's public API, not present and avoided by convention.
- **Every value now shown stays shown, in the same column, with the same wording and the same order.**
  This is a change of surface only. A property that disappears from a row in the conversion is a defect
  of this fix, not a simplification.
- **The content a row carries below its cells survives the conversion.** Four lists render content
  under the row itself and it is currently drawn only in the retired variant: the networks list's
  attached-container chips with their inline detach, the registries list's per-repository content,
  swarm's stacks content and compose's nested per-project service list. Losing any of it would be
  silent — nothing errors, the rows simply become shorter — so this is the first thing verified, on all
  four, before and after.
- **Compose's nested list still reads as nested.** Its per-project services are a list inside a row of
  another list; today the outer card is what separates the two. With one look, the nesting must remain
  legible as nesting rather than flattening into one undifferentiated run of rows — and it must remain
  the composition that retired `GroupedRowsPanel` (REQ-49), not a fourth arrangement invented here.
- **Rows that carry two lines still show both.** Volumes, networks and registries put a title over a
  monospace subtitle; their rows currently grow to fit. After the conversion those rows must still show
  every line they show today, at 1440×1000, 1280×800 and 375×812. A row that clips its second line is a
  data loss, which is what REQ-20 forbids.
- **Row heights stay uniform down a list, and columns stay aligned.** The header's labels and the
  values beneath them share one left edge at every scroll offset — the property the retired variant
  needed a dedicated header inset to approximate, and which a single arrangement makes structural.
- **Nothing about behaviour changes.** Selecting a row, expanding it, the one-panel-at-a-time rule, the
  actions in a row and their weights, sorting, keyboard traversal, the horizontal pan below the
  breakpoint and the truncation contract all behave exactly as delivered.
- **The plan's artefacts are amended in the open, and this analysis states which and how.** The
  obligation is the following, and nothing broader:

  | Artefact | What changes | Why this treatment |
  | --- | --- | --- |
  | `requirements.md` REQ-22 (`:140`) | Amended **in place**: one object-list primitive with **one** look; the "dense and comfortable variant" clause and "both variants are available to any screen" go; the reason, the date and a pointer to this analysis are recorded with it | It is normative and still governs six unwritten batches. A requirement that contradicts the shipped product is how the removal gets reinstated |
  | `requirements.md` REQ-29 (`:147`) | The variant coverage clause "(dense and comfortable; …)" loses its second half | It obliges coverage of a variant that will not exist |
  | `requirements.md` REQ-81 (`:281`) | "One way an object is listed **(the primitive, in two variants)**" → one way, one look. The counts it states — four list paradigms become one — are unaffected and stand | It is the requirement this fix is argued from; leaving the parenthesis is leaving the hybrid licensed by the very requirement that forbids it |
  | `batches.md` (`:75`, `:141`) | The plan narrative naming the comfortable variant as the destination of the migrations | Same reason, one level up |
  | Batch 5, INT-1 and INT-9 (`:38`, `:46`) | **Not rewritten.** They record work that was delivered and certified; they gain a dated correction note, in the form batch 5 already uses for its "Measured at implementation" corrections, stating that the variant they introduced was retired and pointing here | Rewriting a certified batch destroys the record of what was actually built and why — the same reason the reference analysis carries "Corrected after planning" notes instead of edits |
  | Batches 6–12 | **Not rewritten.** One note, recording that the look their migrations adopted was retired after batch 12, and that their acceptance figures were measured against it | Historical record of certified work |
  | Batch 13, INT-7 (`:32`) | **Rewritten**: `LayerEfficiencyView`'s three call sites migrate onto the one look, not onto a retired variant. Its dependency on INT-1, its deletion of the three row builders, INT-8's `CardList` deletion and the zero-budget precondition are untouched | It is an instruction not yet executed. This is the only place where amending the plan prevents work rather than records it |
  | Module specs under `.sdd/modules/` — 37 statements across 17 files, of which `ui-library/specs/data-table.md` holds 14 | Record the one look, in the library's spec and in the eleven screen and panel specs that name the variant | The specs are what the next implementer reads as current; a spec is not a historical record |

- **The coverage that asserts the hybrid is corrected, not deleted wholesale.** It is substantial and
  it is spread across certified batches: a whole unit file dedicated to the variant
  (`data-table-comfortable-variant.test.tsx`), the adoption-perimeter test that pins the exact list of
  files allowed to state it (`library-layer-adoption-perimeter.test.ts:76`, `:172`), eight screen unit
  tests asserting the variant's class, and e2e specs that assert it
  (`contexts-row-geometry.spec.ts:356`, `plugins-row-geometry.spec.ts:462`) or measure the comfortable
  lists against the dense one as a control (`table-row-layout-uniform.spec.ts`). Each assertion is
  either restated against the one look or removed **with the thing it covered** — what may not happen
  is an assertion neutered into passing while the behaviour it named goes unchecked.
- **The defect is verified where it was reported, and generally.** The Plugins "CLI plugins" card at
  desktop width is the named case: the `WHY UNAVAILABLE` value and the header that names it must share
  a column edge, measured as boxes. The general case is the seven screens at the three viewports.
- **The delivered figures are on record before the change.** Per REQ-90, each check is observed failing
  on the delivered build with its measurements — starting with the ~1100px the human read — so that
  "before: failed" is evidence rather than an assertion.

### Non-functional

- **Every visual element still comes from the UI library.** The correction is made inside
  `client/src/ui/`; no feature file gains a raw tag, a stylesheet, a `style={{…}}`, a visual class or a
  hard-coded colour, radius, spacing, shadow, font size or z-index. Feature files change only by
  ceasing to ask for a variant and by stating what the one look needs.
- **No new component and no near-duplicate.** The outcome is one component with one look. A second
  list, a "list card" primitive or a compatibility wrapper for the screens that used to have cards
  would recreate the second answer under a new name.
- **The blur allow-list and the conformance check's blur half are untouched** (REQ-84). Nothing here is
  an overlay surface; no `backdrop-filter` or `filter: blur(...)` is added, moved or removed.
- **The `CardList` call-site budget stays correct and keeps its meaning.** It reads 3 today, matching
  `LayerEfficiencyView`'s three sites; this fix neither lowers it nor raises it, and batch 13 still
  finds it at 3 and takes it to zero before deleting the component.
- **No server file is in scope**, and no daemon-facing behaviour changes.
- **Verified against the real daemon under the project's test discipline**: own labelled fixtures, full
  cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon, no inherited application
  state, its own data directory, no test reaching Docker Hub, every spec passing on its own.
- **Every interaction is driven with a real pointer at the visible control's coordinates, and every
  check asserts geometry** — viewport boxes, column left edges, row heights, box intersections —
  content assertions standing beside those and never instead of them (REQ-88, REQ-89).
- **Performance is not paid for by this change**: nothing on a scrolled surface gains a filter, a
  transition or an animation, and the background stays static and pre-blurred (REQ-85).
- **English only** in source, identifiers, comments and the amended artefacts; kebab-case for any new
  file.

## Established findings

Verified against the source on 2026-08-15, on branch `feat/ui-coherence-optimisation`, because the
request asked for the enumeration to be checked rather than taken on trust. Two of its figures needed
correction, and one of them changes what the work must cover.

**The count of 18 is exact. The shape around it is not "9 screens".** `variant="comfortable"` appears
at 18 call sites in **11 feature files**, across **7 screen areas** — the plan's batches 6 to 12:

| Screen area | Files and sites |
| --- | --- |
| Volumes & networks | `VolumesPanel.tsx:258`, `NetworksPanel.tsx:287` |
| Registries | `RegistriesScreen.tsx:290`, `:338` |
| Builders & build cache | `BuildersScreen.tsx:362`, `:387` |
| Contexts | `ContextsScreen.tsx:260` |
| Plugins | `PluginsScreen.tsx:318`, `:356` |
| Compose | `ComposeScreen.tsx:434`, and `:449` — the nested per-project list |
| Swarm | `SwarmNodesPanel.tsx:210`; `SwarmServicesPanel.tsx:335`, `:364`; `SwarmSecretsPanel.tsx:189`; `SwarmConfigsStacksPanel.tsx:292`, `:315`, `:323` |

**The row content is carried by four lists, not two.** The request names swarm's chips and compose's
nested list; `renderRowContent` is in fact stated at `NetworksPanel.tsx:293` (the attached-container
chips), `RegistriesScreen.tsx:342`, `SwarmConfigsStacksPanel.tsx:321` and `ComposeScreen.tsx:447`. All
four are gated on the retired variant at `DataTable.tsx:382`, so all four lose their content silently
if the gate is not removed first — and `library-layer-adoption-perimeter.test.ts:95` pins exactly this
list of four, which is the check that will notice if one is missed.

**Only one feature list asks for content-sized rows today**, `CoverageMatrixScreen.tsx:166`. Every
other row that currently grows does so because the variant makes it grow
(`DataTable.tsx:261-262`), so each of the 18 sites has to be looked at rather than assumed to fit a
fixed row height — the two-line rows on volumes, networks and registries being the certain cases.

**What is genuinely shared already, and therefore not at risk.** `data-table.css:90-95` states it in
the code's own words: the tracks, their minimums, the pan when they no longer fit, the cells and their
truncation are the dense variant's, unchanged. What differs is the room a row is given and the surface
it is drawn on — the carrier card (`DataTable.tsx:158`, `:348`), the body's gap
(`data-table.css:96-100`), the row's own padding (`:105-109`), the expansion's hairline (`:137-141`)
and the header inset at `:122`.

**The header inset is the hybrid's own confession.** Its comment records that the header had to be
padded to match the row cards or the labels drifted up to 5px from their columns — measured at
1440×1000, header cells at 349/449/652.5/808.1/987.6/1119.3/1251 against row cells at
354/454/654.9/808.6/985.9/1115.9/1246. A rule that exists to re-align a header with rows that are no
longer in the same grid box as it is the structural version of the defect the human read at 1100px.

**The blast radius in coverage is real and is spread across certified batches**: `comfortable` is
stated in 8 screen unit test files, in a unit file dedicated to the variant, in the adoption-perimeter
test that pins the 11-file list and the new-prop perimeter, and in 12 e2e specs — two of which assert
the class outright and one of which uses the comfortable lists as measured subjects against the dense
images table as a control.

**The plan's artefacts are as the request describes**, and one more requirement is implicated than it
names: REQ-29 obliges unit coverage of "dense and comfortable" and is amended with REQ-22 and REQ-81.
The conformance script mentions the variant only in the comment explaining the `CardList` budget
(`:29`); the budget itself (`:40`, expected 3) is unaffected.

## Assumptions

- **This is a fix, not an evolution.** Stated by the human, and consistent with the evidence: no
  capability is added or removed, the delivered look is wrong against the programme's own REQ-81, and
  the corrected look already exists and ships on four screens.
- **"Like Containers and Images" is the specification of the target look.** The human named it, it is
  the majority of the product's lists, and it is the arrangement batches 2 and 4 repaired. No new
  design work is implied and none should be introduced under cover of this fix.
- **`LayerEfficiencyView`'s three lists are not migrated by this fix.** They stay on `CardList`, where
  batch 13 will find them, and what this fix changes is the destination batch 13 sends them to. Doing
  it here would move a migration out of the batch that owns it, drag that screen's other obligations
  (its empty states, its detail panel) with it, and require the `CardList` budget to be taken to zero
  by a piece of work that does not delete the component. The risk this fix must close is that batch 13
  migrates onto something retired — an instruction, not a line of code.
- **The certified batches 6–12 are not re-certified as a consequence.** Their interventions landed and
  their acceptance was measured against the look of the day; this fix carries its own verification of
  the same screens at the same three viewports. Re-running twelve acceptances would be a second
  programme, and the human runs the suite on their own daemon.
- **Behaviour at the phone breakpoint follows containers, deliberately.** Retiring the row card removes
  the one arrangement in the product that let a row grow vertically instead of panning horizontally, so
  below the breakpoint these seven screens will pan as containers and images do. That is the point of
  "one look", the human named containers as the reference, and any other answer would be a new
  screen-level decision — the thing REQ-92 exists to abolish.
- **A row still gets the vertical room its content needs.** "Dense" here means one arrangement, not a
  fixed height that clips two-line rows; the product already offers content-sized rows within that one
  look.
- **No copy, no wording and no ordering changes anywhere.** Nothing in the request touches what the
  rows say, only how they are drawn.
- **The plan's numbering is stable.** REQ-22, REQ-29 and REQ-81 keep their ids and are amended in
  place; no requirement is renumbered, deleted or added, following the precedent set when REQ-94 was
  inserted with a note rather than by renumbering.

## Constraints

- **One visual language, defined in exactly one place.** The correction lives in the UI library; no
  screen may compensate locally, and a screen that reproduces the retired look with its own markup
  would put the second answer back where nothing can see it.
- **The library grows — or shrinks — before the feature code changes.** Whatever the one look needs
  must exist and be exported before a call site asks for it; feature files are only ever consumers.
- **The blur allow-list, `check-ui-conformance.mjs`'s blur half and the static pre-blurred background
  are untouchable.** An edit to the blur half is a signal that something went wrong, to be reported
  rather than made (REQ-84).
- **The `CardList` retirement guard keeps working through this fix**, at 3, so batch 13's deletion
  stays the formality it was designed to be.
- **The certified predecessors on these screens stay certified** — the detail property column rule, the
  absence of any copy affordance, the dialog sizing rules and the switch that must not drag its surface
  out of the viewport — and are named in the checks rather than assumed (REQ-87).
- **Mid-flight plan.** Batches 13–19 are unwritten and must be written against the corrected library;
  batches 1–12 are certified and their record is not rewritten to make the past agree with the present.
- **The suite runs against the operator's own daemon**, so the verification creates its own labelled
  fixtures, cleans up in a `finally`, and every spec passes on its own.
- **No server file, no API, no daemon behaviour** is in scope.

## Market trends

Relevant, and consulted narrowly — not on the Docker-client market, which this fix does not touch, but
on the one question the decision turns on: whether "density variant" is understood in published
practice as a row-height setting or as licence to change the row's surface. It is settled, and it
settles it against the delivered variant.

- **Density is row height and padding, not a different kind of row.** Carbon ships five row sizes for
  one data table and states the rule that matters here: *use the same row height for the table and the
  header rows*. Every size is the same ruled table with more or less room — none of them detaches a row
  onto a surface of its own, and the guidance's only concession to two-line content is a taller row,
  which is exactly the remedy this fix needs for volumes, networks and registries.
  ([Carbon Design System — Data table usage](https://carbondesignsystem.com/components/data-table/usage/);
  [Material Design — Data tables](https://m2.material.io/components/data-tables/web))
- **Cards and tables are two patterns answering two different questions, and mixing them is a named
  anti-pattern.** A table is for comparing an attribute down a column; a card grid is for browsing
  self-contained items. Practitioner guidance on data-table anti-patterns calls out replicating
  table-like column structure inside cards, and observes that column headers over cards confuse which
  pattern the reader is in — which is the human's report, in the general form.
  ([Smart Interface Design Patterns — Cards vs. Lists vs. Tables vs. Data Grids](https://smart-interface-design-patterns.com/articles/cards-vs-lists-vs-tables-vs-data-grids/);
  [NN/g — Data Tables: Four Major User Tasks](https://www.nngroup.com/articles/data-tables/))
- **Where a row does legitimately become a card, it is a narrow-screen transformation and it carries
  its labels with it.** The published pattern replaces the table below a breakpoint and prints each
  column's header *beside its value* inside the card, precisely because the shared header stops being
  reachable once rows are detached; the alternative, kept for comparison tasks, is horizontal scrolling
  with the identifying column pinned. The delivered variant took the card without the labels and kept
  the header, at desktop width — the one combination neither branch of the guidance produces — which is
  why a `–` could end up 1100px from the word that names it. It also supports the assumption above:
  panning, like containers, is the standard answer for a list whose job is comparison.
  ([NN/g — Mobile Tables: Comparisons and Other Data Tables](https://www.nngroup.com/articles/mobile-tables/);
  [Morningstar Design System — Responsive data tables](https://designsystem.morningstar.com/legacy/v/2.29.0/ux-patterns/responsive-data-tables.html))

## Risks

- **The row content is dropped silently.** Four lists render content below their cells and it is drawn
  only in the retired variant. Nothing errors when the gate goes: the rows simply lose the
  attached-container chips, the repository content, the stacks content and compose's entire nested
  service list. This is the single most likely way for this fix to ship a regression, and the least
  visible.
- **Compose's nesting flattens.** With no card to contain a project, a nested list of services can read
  as more rows of the outer list. That would undo REQ-49 and reintroduce, in a new form, the grouped
  arrangement `GroupedRowsPanel` was retired to remove.
- **Two-line rows are clipped into data loss.** A title over a monospace subtitle that no longer fits
  its row does not overflow visibly; it disappears, on exactly the identifiers REQ-21 says the list
  must still show.
- **The coverage is neutered instead of restated.** Dozens of assertions name the retired variant, and
  the fastest way to green is to delete or weaken them. The programme has already paid once for a check
  that passed while the product was broken; a suite that stops asserting how a list is drawn is that
  failure again, one layer up.
- **The amendment is skipped and only the code changes.** REQ-22 then stands as a validated requirement
  contradicting the shipped product, and the next reader — quite reasonably — reinstates the variant on
  its authority.
- **The fix is scoped to Plugins.** It was reported there and it is visible on seven screens. A repair
  where it was noticed leaves the hybrid standing everywhere else and leaves the variant available to
  batches 13–19.
- **The retirement becomes a redesign.** Seven screens are being redrawn at once, which is a standing
  invitation to improve columns, reorder properties or rename things along the way. Any of it makes the
  change unverifiable against the delivered build, because nothing can then be compared before and
  after.
- **A screen keeps the look locally.** A feature file that reproduces the card row with its own markup
  or class satisfies the eye, violates the UI boundary, and hides the second answer where the
  conformance check and the perimeter test were built to catch it.
- **The phone breakpoint regresses unnoticed.** These seven screens currently grow their rows at 375px;
  after the fix they pan. If that is not measured at 375×812, the first sign of trouble will be an
  operator, not a check.
- **`LayerEfficiencyView` is forgotten.** Batch 13 already carries the plan's own warning that it is
  *"the single most likely thing in the plan to be forgotten"*; leaving its INT-7 pointed at a retired
  variant sets that trap a second time.

## Scope

**In scope**

- Retiring the object list's comfortable variant from the UI library, so that the component offers one
  look: the ruled rows containers and images already use.
- Converting all 18 call sites in the 11 feature files listed under Established findings, preserving
  every value, column, action, expansion and piece of row content they show today.
- Ungating the below-the-cells row content from the retired variant, so the networks, registries,
  swarm-stacks and compose lists keep it, and compose's nesting stays legible as nesting.
- Giving the rows that need it the vertical room their content requires, so no two-line row is clipped.
- Amending `plan-ui-coherence-optimisation` exactly as tabulated above: REQ-22, REQ-29, REQ-81 and the
  plan narrative in place, with the reason and the date; batch 13's INT-7 retargeted; batch 5's INT-1
  and INT-9 and batches 6–12 annotated rather than rewritten.
- Updating the library's and the screens' module specs so that what a later implementer reads is the
  one look.
- Correcting the unit and e2e coverage that names the retired variant, so each assertion is restated
  against the one look or removed with the thing it covered.
- Verifying the reported case on the Plugins "CLI plugins" card — the `WHY UNAVAILABLE` value sharing a
  column edge with its header — and the seven screens generally, at 1440×1000, 1280×800 and 375×812,
  with a real pointer and on geometry, with the delivered figures recorded first.

**Out of scope**

- Migrating `images/LayerEfficiencyView.tsx`'s three `CardList` sites, deleting `CardList`, or moving
  the retirement budget: all of it stays batch 13's.
- Any other work of batches 13–19, which are simply written against the corrected library.
- Re-certifying batches 6–12.
- Any redesign of the seven screens beyond the row surface: columns, their order, their content,
  wording, actions, sorting and detail panels are as delivered.
- The dense look itself, which is the reference and is not being changed.
- Server-side behaviour, the API and the daemon, none of which this fix touches.
- The blur allow-list and the conformance check's blur half.
- The remaining items of the reference analysis — duplication, image sizes, dashboard rhythm, dialogs —
  which stay with the batches that own them.
