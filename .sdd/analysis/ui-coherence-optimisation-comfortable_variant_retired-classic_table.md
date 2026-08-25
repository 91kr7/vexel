---
request_slug: ui-coherence-optimisation-comfortable_variant_retired-classic_table
date: 2026-08-16
type: evolution
reference: .sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired.md
---

## Request

> Retire the card-per-row presentation of the object list and replace it with a classic table.
>
> **Context.** Every object list in the application is `DataTable`
> (`client/src/ui/data/DataTable.tsx` + `client/src/ui/data/data-table.css`), which has two variants:
> `dense` and `comfortable`. The `comfortable` variant puts **each row inside its own card** — a
> rounded, bordered, detached surface with a gap between rows — and the header floats above them on
> the same column tracks. The human has looked at the volumes list rendered this way and rejected it
> outright: he wants **classic tables**, i.e. one single table surface with a header row and rows
> separated by hairline rules, flush against each other, no per-row rounded card, no inter-row gap.
>
> **Scope to analyse.** The `comfortable` variant is consumed by feature code on essentially every
> screen — volumes, networks, registries, contexts, plugins, builders, swarm (nodes, services,
> secrets, configs/stacks), compose, images/layer efficiency — so this is a change to the shared
> visual language, not to one panel. CLAUDE.md's "one single homogeneous visual language" rule means
> the answer should be one presentation for object lists, decided once in the library, not a
> per-screen choice. Consider whether the classic-table presentation replaces the comfortable variant
> entirely (leaving one way to draw an object list), and what happens to what the card carried: the
> expandable row content / nested grouped lists (compose projects, swarm stacks, layer efficiency)
> that today live inside the card and are separated from the row by a rule.
>
> **Constraints that hold.** Feature code emits no raw DOM and no CSS — everything is library-side.
> The classic table must keep the existing column-track contract (header cells and body cells share
> the same tracks; no drift), keep row hover/selection affordances, keep the row-actions column, and
> keep working inside the app's liquid-glass material without introducing any blur (the table is main
> view: no `backdrop-filter`, no `filter: blur()`).

## Reference

Evolution of
[`.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired.md`](./ui-coherence-optimisation-comfortable_variant_retired.md)
(2026-08-15), itself a fix of
[`.sdd/analysis/ui-coherence-optimisation.md`](./ui-coherence-optimisation.md).

**Starting point.** That analysis records a decision the human had already taken, in his own words:
*"The comfortable variant is retired entirely, not merely avoided on Plugins."* Its argument was that
the variant is a table/card hybrid — a column header promising that every value below it is in a
column, over detached cards promising that every card is a self-contained object — and that shipping
both promises at once leaves the eye no rule. The evidence was geometric: on the Plugins "CLI
plugins" card the human read a lone `–` roughly 1100px from the `WHY UNAVAILABLE` header that names
it, and the library itself carried a header-inset rule whose own comment recorded that without it the
header labels drifted up to 5px from their columns. That analysis fixed the target look as *"like
Containers and Images"*, enumerated 18 call sites in 11 feature files, tabulated the downstream
artefacts to amend, and deliberately left `images/LayerEfficiencyView.tsx` out of scope because its
three lists were still on the older `CardList` component and belonged to a batch not yet executed.

**What has happened since, verified on the repository on 2026-08-16 and reported to this analysis.**
That decision was recorded and never delivered:

- the plan folder `.sdd/plans/plan-ui-coherence-optimisation-comfortable_variant_retired/` exists on
  disk and is **empty** — zero files, created 2026-08-15 23:08;
- `git log` over that path and the analysis file returns **exactly one commit**,
  `5ae04fb sdd-analyse: retire the object list's comfortable variant`. No planning commit and no
  implementation commit ever followed;
- the UI-coherence programme then ran to completion and merged
  (`d17e1df Merge feat/ui-coherence-optimisation: one visual language across the thirteen screens`)
  **with the condemned variant intact**;
- and the batch that was supposed to be redirected away from it instead migrated onto it: the
  variant's current consumers include `images/LayerEfficiencyView.tsx` (3 call sites), which the
  2026-08-15 analysis had explicitly excluded.

**Current consumers of the card-per-row presentation** — 21 call sites in 12 feature files across 8
screen areas, against 18 in 11 files a day earlier:

| Screen area | Files (call sites) |
| --- | --- |
| Volumes & networks | `volumes-networks/VolumesPanel.tsx` (1), `NetworksPanel.tsx` (1) |
| Registries | `registries/RegistriesScreen.tsx` (2) |
| Builders & build cache | `builders/BuildersScreen.tsx` (2) |
| Contexts | `contexts/ContextsScreen.tsx` (1) |
| Plugins | `plugins/PluginsScreen.tsx` (2) |
| Compose | `compose/ComposeScreen.tsx` (2) |
| Swarm | `swarm/SwarmNodesPanel.tsx` (1), `SwarmServicesPanel.tsx` (2), `SwarmSecretsPanel.tsx` (1), `SwarmConfigsStacksPanel.tsx` (3) |
| Images — layer efficiency | `images/LayerEfficiencyView.tsx` (3) |

**Changes.** Three, and each one changes what has to be delivered rather than merely how it is
described.

1. **The starting state moved.** The reference analysis was written against a mid-flight branch and
   argued its urgency from that — *correct the library before batch 13 so the remaining batches
   inherit the corrected look*. That window closed. The programme is merged, every screen has adopted
   the hybrid, and the work is now a conversion of what ships on `main`, not a course correction of
   something in flight. Its plan-amendment table (batches 13–19 "unwritten", batch 13's INT-7 to be
   retargeted, the `CardList` budget standing at 3) is history, not instruction.
2. **The scope grew, measurably, by the delay.** 18 call sites became 21, and the three added are
   exactly the ones the reference analysis warned were *"the single most likely thing in the plan to
   be forgotten"*. They were not forgotten; they were migrated onto the presentation that had already
   been condemned in writing the previous day.
3. **The sighting is new and independent of the first.** The reference analysis was argued from
   Plugins. This request is argued from **Volumes** — a row carrying a volume name over its mount
   path, i.e. the two-line case. Two unrelated screens, rejected on sight, a day apart, is evidence
   that the objection is to the presentation and not to one screen's columns.

Consequently this analysis adds one requirement the reference analysis did not carry: the retirement
must be **enforceable**, not merely performed. What stands between "decided" and "decided again next
month" today is nothing at all — no automated check knows the variant is not supposed to exist.

## Amendment — 2026-08-25: one named exception, the containers list

**What changed.** From 2026-08-25 the **containers list** is drawn as one card per container. Every
other object list in the product — images, volumes, networks, compose, swarm, registries, contexts,
plugins, builders, build cache, and the dashboard's own container list — is still the classic table
this analysis required, and the library still offers no way to ask for anything else.

The geometric acceptance criteria below (*"rows are flush… no row carries a rounded corner, an
outline or a detached surface of its own… one enclosing surface boundary"*) therefore hold on every
object list **except containers**, and are read that way from this date. Nothing else in this
analysis is withdrawn: the decision is not reversed and it is not re-argued here.

**Why.** The reason is this analysis's own. What it condemned is a **hybrid** — a column header
promising that every value beneath it is in a column, standing over detached cards promising that
each card is a self-contained object — and it recorded that where a row does legitimately become a
card it carries each column's label **inside the card**, the shared header having stopped being
reachable once the rows detach. The containers card does exactly that: no header row survives it,
and each value is written beside the label that names it, inside the card. That is the card this
analysis called legitimate, not the one it retired.

**Where the exception lives, so that it stays one screen wide.** The guard required above
(`client/scripts/check-ui-conformance.mjs`) is not switched off and grows no exception marker a call
site could write for itself. It admits **two literal file paths** —
`client/src/containers/ContainersScreen.tsx` and `client/src/containers/ContainerCard.tsx` — and
reports a surface drawn per row anywhere else, containers' own the day it moves. Widening the
admission is an edit to that list, in the open.

**Recorded in.** [`.sdd/analysis/docker_management_app-containers_card_view.md`](./docker_management_app-containers_card_view.md)
(2026-08-25), which states the change and the reason above in full, and
`.sdd/plans/plan-docker_management_app-containers_card_view/` (REQ-59 … REQ-63), which carries it.

## Summary

Every object list in the product is drawn as one classic table — a single surface, one header row on
top, rows flush against each other and separated by hairline rules — and the card-per-row
presentation is removed from the library so that no screen can ask for it again.

## Business goal

**A list whose job is comparison must read as a table.** Every one of these lists exists so the
operator can run an eye down a column: which volume is unused, which node is a manager, which layer
is wasting space, which plugin is unavailable and why. A detached card with a gap around it says the
opposite — that each object is read on its own — and the wider the window, the further a value drifts
from the header that names it. The reference analysis measured that drift at roughly 1100px on
Plugins. This request is the same objection reached independently on Volumes. The value here is not
tidiness: it is that the operator can read a value as belonging to a column, which is the only reason
a header row is drawn at all.

**One visual language is a rule of this codebase, and a surface variant breaks it.** CLAUDE.md
requires one homogeneous visual language defined in exactly one place. A variant that changes the
*material a row is drawn on* rather than the *room a row is given* is a second answer to "how is an
object listed" — precisely the answer the whole UI-coherence programme was run to eliminate, restored
as a prop. Left available, it is the next screen's choice, and the next screen will choose whatever
it was copied from.

**The decision has already been bought once and delivered nothing, and the bill grew.** It was taken,
argued, recorded and committed on 2026-08-15; the plan folder for it is empty; the programme then
merged around it and pulled three further lists onto it. That is the concrete cost of a decision that
stays on paper: the same work, one screen area wider, a day later. Doing it now is cheaper than doing
it after the next migration, and the difference is not one-off — it compounds with every screen added
to the product.

**The retirement must outlive the memory of it.** The lesson of the last twenty-four hours is not
that someone was careless; it is that the only guard on this decision was that a human would remember
it. Deleting the variant from the library's public surface makes it unaskable, and a machine check
makes a locally reproduced card-row fail a routine command instead of waiting to be noticed on a
screenshot. That is what turns this from the second statement of a decision into the last one.

## Requirements

### Functional

- **One presentation for every object list in the product.** After this work a list of objects is
  drawn one way: a single table surface, one header row at the top, body rows flush against one
  another and separated by hairline rules. No screen, card, panel or nested list draws its rows as
  detached surfaces, and the library offers no way to ask for one.

- **The acceptance criterion is geometric, so "it looks like a table" is checkable rather than
  argued.** All of the following hold on every object list, at 1440×1000, 1280×800 and 375×812:

  | Property | Criterion |
  | --- | --- |
  | Rows are flush | The vertical distance between the bottom edge of one row and the top edge of the next is zero; no inter-row gap |
  | Rows are not cards | No row carries a rounded corner, an outline or a detached surface of its own; the separation between two rows is a single hairline rule |
  | One surface | The list has exactly one enclosing surface boundary, with the header inside it and the rows continuous beneath it |
  | Columns do not drift | Every header cell's left edge equals its body cells' left edge, exactly, at every horizontal scroll offset and every viewport — with no compensating inset anywhere, the existence of such a compensation being the defect's own signature |

- **The card-per-row presentation is removed, not merely unused.** The choice is absent from the
  component's public interface. A variant left available and avoided by convention is the same defect
  with a shorter fuse.

- **The retirement is enforced automatically.** Reintroducing the card-per-row presentation — by
  asking the library for it, or by a feature file reproducing it with markup or styling of its own —
  fails a command the developer already runs (`npm run lint`, `npm run test`), naming what is wrong.
  A decision whose only guard is that someone remembers it is the exact failure this analysis is the
  second attempt at, and this requirement is what distinguishes the two attempts.

- **Every value now shown stays shown**, in the same column, with the same wording, the same order
  and the same actions. This is a change of surface only. A property that quietly leaves a row is a
  defect of this work, not a simplification.

- **The content a row carries below its cells survives.** Several lists render content under the row
  itself, and today it is drawn only in the presentation being retired — the networks list's attached
  container chips with their inline detach, the registries list's per-repository content, swarm's
  stacks content, compose's nested per-project service list and layer efficiency's per-layer content.
  Losing any of it is silent: nothing errors, the rows simply become shorter. This is verified first,
  on every list that carries such content, before and after.

- **Nested content stays readable as nested — by indentation, never by detachment.** Compose
  projects, swarm stacks and layer efficiency are lists inside a row of another list; today the card
  is what separates the two levels. With one presentation, the child level is distinguished **inside
  the same table surface and on the same column tracks**, by indentation and by its relationship to
  the parent row — not by putting the parent, or the child, on a surface of its own. Detaching a row
  to signal hierarchy is the very move being retired, and it would reintroduce it under a new name.
  The nesting must remain legible as nesting rather than flattening into one undifferentiated run of
  rows.

- **Two-line rows keep both lines.** Volumes, networks and registries put a title over a monospace
  subtitle, and the row that triggered this request is a volume's name over its mount path. Density
  is the height of a row, never a different kind of row: after the conversion those rows still show
  every line they show today, at all three viewports. A clipped second line is data lost, on exactly
  the identifiers the operator most needs to read exactly.

- **Rows are uniform down a list.** Row heights do not vary row to row within one list except where
  the row's own content genuinely requires it, and the header shares the body's column tracks
  structurally rather than by compensation.

- **Nothing about behaviour changes.** Hovering a row, selecting a row, expanding a row, the
  one-panel-at-a-time rule, the row-actions column and the weights of the actions in it, sorting,
  keyboard traversal, the truncation contract and the horizontal pan below the breakpoint all behave
  exactly as delivered.

- **The list stays usable below the desktop breakpoint.** These lists currently grow their rows at
  phone width because the card allows it; afterwards they pan horizontally as containers and images
  do. What must not happen is the failure the reference programme repaired in its first batches: a
  row whose columns collapse to zero width and cannot be scrolled to reveal them.

- **The downstream artefacts that mandate or describe two variants are amended in the open.** The
  reference analysis identified them — the plan's REQ-22, REQ-29 and REQ-81, the plan narrative, and
  37 statements across 17 module specs of which the library's own data-table spec holds 14 — and,
  that fix never having been executed, they stand as it described them. They are re-verified against
  the source during the later phases rather than trusted from here, and each is either amended in
  place with its reason and date (the normative ones, which still govern what a later reader
  believes) or annotated rather than rewritten (the historical record of certified batches). A
  validated requirement left asserting the opposite of the shipped product is how a removal gets
  reinstated on its own authority — and now that the plan reads as finished and merged, its
  requirements read as settled, which makes this worse than it was a day ago.

- **The coverage that asserts the retired presentation is restated, not neutered.** It is substantial
  and spread across certified work: a unit file dedicated to the variant, the adoption-perimeter test
  that pins which files may state it, screen unit tests asserting its class, and e2e specs that
  assert it or use it as a measured subject against the dense lists as a control. Each assertion is
  either restated against the one presentation or removed **together with the thing it covered**.
  What may not happen is an assertion weakened into passing while the behaviour it named goes
  unchecked.

- **The delivered figures are on record before the change**, so that "before: failed" is evidence
  rather than a claim — starting with the volumes list that triggered this request and the Plugins
  case the reference analysis measured.

### Non-functional

- **Every visual element still comes from the UI library.** The change is made inside
  `client/src/ui/`; no feature file gains a raw tag, a stylesheet, an inline style prop, a visual
  class or a hard-coded colour, radius, spacing, shadow, font size or z-index. Feature files change
  only by ceasing to ask for a presentation and by stating what the one presentation needs.
- **No new component and no near-duplicate.** The outcome is one component with one presentation. A
  second list primitive, a "list card" component or a compatibility wrapper for the screens that used
  to have cards would recreate the second answer under a new name.
- **No blur is added anywhere.** These lists are main view. The blur allow-list, the conformance
  check's blur half and the static pre-blurred background are untouched; an edit to them is a signal
  that something has gone wrong, to be reported rather than made.
- **The change must not cost more at runtime than what it replaces.** Removing a surface per row
  should reduce the layers painted on a long scrolled list, never increase them; no scrolled surface
  gains a filter, a transition or an animation.
- **Verified against the real daemon under the project's test discipline**: own labelled fixtures,
  cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon, no inherited application
  state, its own data directory, nothing reaching Docker Hub, and every spec passing on its own.
- **Every interaction is driven with a real pointer at the visible control's coordinates, and every
  check asserts geometry** — viewport boxes, row gaps, column left edges, row heights — with content
  assertions standing beside those and never instead of them.
- **No server file, no API and no daemon behaviour** is in scope.
- **English only** in source, identifiers, comments and amended artefacts; kebab-case for any new
  file.

## Assumptions

- **This is an evolution of the 2026-08-15 analysis, not a fix of it.** Decided at the orchestration
  step under the human's standing instruction to settle the workflow's gates rather than refer them
  back — a delegation, so the reasoning is recorded here in full rather than assumed. The record
  of that day stands untouched: it was correct when written, the diff to bring it to today would not
  be minimal, and rewriting a dated record to make the past agree with the present is the practice
  that analysis itself argues against.
- **The earlier retirement was never planned and never built.** Established, not assumed: an empty
  plan folder, a single commit for the whole decision, and the variant alive at 21 call sites today.
  Nothing regressed, because nothing was ever built — which is why the deliverable here needs an
  enforcement mechanism rather than a regression guard.
- **"Classic table" means the presentation containers and images already ship**, as the reference
  analysis fixed it: ruled rows under one header. The human named that reference then and rejected
  its opposite twice since. No new design work is implied and none should be introduced under cover
  of this change.
- **The card-per-row presentation is replaced entirely, leaving one way to draw an object list.** The
  request asks this to be considered; it is decided by the human's standing words of 2026-08-15
  (*"retired entirely, not merely avoided"*) and by CLAUDE.md's one-visual-language rule, which does
  not admit two answers to one question. Keeping it as an option would leave every future screen a
  decision to make, which is the outcome the programme was run to abolish.
- **A row still gets the vertical room its content needs.** One presentation is not one fixed height:
  content-sized rows already exist within the ruled arrangement, and they are how volumes, networks
  and registries keep their second line.
- **Below the breakpoint these lists pan horizontally**, as containers and images do. The card was
  the only arrangement in the product that let a row grow instead of pan; removing it makes these
  screens behave like the rest, which is the point of one presentation. Any other answer would be a
  new per-screen decision.
- **Layer efficiency's three lists are in scope.** They were excluded on 2026-08-15 because they were
  still on the older list component; they are now call sites of the presentation being retired, so
  excluding them today would leave the defect standing on the screen the reference programme already
  flagged as the easiest to overlook.
- **No second list component is reintroduced**, whatever the state of the one the programme retired.
- **No copy, wording, column, ordering or action changes anywhere.** Nothing in the request touches
  what the rows say, only how they are drawn — and keeping it that way is what makes the result
  comparable to the delivered build.
- **1440×1000, 1280×800 and 375×812 remain the reference viewports**, as used by the reference
  analysis, so that this work's figures can be read against its figures.

## Constraints

- **One visual language, defined in exactly one place.** The correction lives in the UI library. No
  screen may compensate locally, and a screen that reproduces the retired presentation with its own
  markup would hide the second answer where only a check can find it.
- **The library changes before the feature code does.** Whatever the one presentation needs exists
  and is exported before any call site asks for it; feature files are only ever consumers.
- **The blur allow-list, the conformance check's blur half and the static pre-blurred background are
  untouchable.**
- **The column-track contract is not renegotiated.** Header cells and body cells share the same
  tracks, with no drift and no compensating inset — the contract repaired earlier in the programme is
  inherited, not reimplemented.
- **The certified predecessors on these screens stay certified** — the detail property column rule,
  the absence of any copy affordance, the dialog sizing rules, the switch that must not drag its
  surface out of the viewport — and are named in the checks rather than assumed.
- **The programme is merged.** This is a conversion of what ships on `main`, so there is no "inherit
  the corrected look" argument left to lean on: every screen has already adopted the hybrid and every
  one of them is converted here.
- **The suite runs against the operator's own daemon**, so verification creates its own labelled
  fixtures, cleans up in a `finally`, and every spec passes on its own.
- **No server file, no API, no daemon behaviour** is in scope.

## Market trends

Relevant, and consulted narrowly. Not on the Docker-client market, which this change does not touch,
but on the two questions the decision turns on: whether a "density" setting is understood in
published practice as a surface change, and how a classic table is supposed to carry nested and
expandable content — the one genuinely open point in this request.

- **Density is the room a row is given, not the kind of surface it is drawn on.** PatternFly ships two
  table spacings — default and compact — described purely as how much data fits per page, with no
  change of row surface in either; Carbon ships five row heights for one data table and states that
  the table and header rows use the same one. The concession both make to two-line content is a
  taller row, which is exactly the remedy volumes, networks and registries need.
  ([PatternFly — Table design guidelines](https://www.patternfly.org/components/table/design-guidelines/);
  [Carbon Design System — Data table usage](https://carbondesignsystem.com/components/data-table/usage/))
- **Nested content belongs inside the table, indented, on the same column tracks.** Cloudscape's
  pattern for nested resources is explicit: use the table component itself, and an expanded row shows
  its children *indented*, occupying the same columns as their parent. Its stated escape when nesting
  grows unwieldy is to split the data across multiple tables or move it to a details page — never to
  detach a row onto a surface of its own. PatternFly's expandable rows likewise render a panel
  beneath the associated row, and its tree tables nest within the tabular structure. This settles the
  request's open question directly: compose projects, swarm stacks and layer efficiency keep their
  nesting through indentation and adjacency, not through a card.
  ([Cloudscape — Table with expandable rows](https://cloudscape.design/patterns/resource-management/view/table-with-expandable-rows/);
  [PatternFly — Table design guidelines](https://www.patternfly.org/components/table/design-guidelines/))
- **Tables and cards answer different questions, and comparison is a table's question.** Current
  practitioner guidance scores cross-item comparison, dense scanning and sorting/filtering as a
  table's strengths and a card grid's weaknesses, and reserves cards for items that are
  self-contained and visually browsable — media, catalogues, resource libraries. Docker objects
  listed by name, status, size, driver and usage are the first case, not the second.
  ([UX Patterns for Developers — Table vs list view vs card grid](https://uxpatterns.dev/pattern-guide/table-vs-list-vs-cards))
- **The hybrid itself is a named anti-pattern**, already established in the reference analysis and not
  re-argued here: column headers over detached cards leave the reader unsure which pattern they are
  in, and where a row does legitimately become a card it is a narrow-screen transformation that
  carries each column's label inside the card, because the shared header stops being reachable once
  rows detach. The delivered presentation took the card without the labels and kept the header, at
  desktop width.
  ([Smart Interface Design Patterns — Cards vs. lists vs. tables vs. data grids](https://smart-interface-design-patterns.com/articles/cards-vs-lists-vs-tables-vs-data-grids/);
  [NN/g — Mobile tables](https://www.nngroup.com/articles/mobile-tables/))

## Risks

- **The decision stays on paper a third time.** This has already happened once, verifiably, and the
  cost was measured: three more call sites, one more screen area, twenty-four hours. Nothing
  automated knows the presentation is condemned, so the only guard is memory. If this work ships the
  conversion but not the enforcement, the risk is not that the variant returns by accident — it is
  that nothing will notice when it does.
- **The row content is dropped silently.** Several lists render content below their cells and it is
  drawn only in the presentation being retired. Nothing errors when that gate is removed; the rows
  simply lose the attached-container chips, the repository content, the stacks content, the layer
  content and compose's entire nested service list. This is the most likely regression and the least
  visible one.
- **The nesting flattens.** With no card to contain a project or a stack, a nested list can read as
  more rows of the outer list. That undoes the grouped-list retirement the programme already paid
  for, in a new form.
- **Two-line rows are clipped into data loss.** A title over a monospace subtitle that no longer fits
  does not overflow visibly — it disappears. The row that triggered this request is one of them: a
  volume name over its mount path.
- **Layer efficiency is missed again.** It was called the single most likely thing in the programme to
  be forgotten, and it has already been mis-migrated once, onto the very presentation being retired.
  Any plan phrased as "the screens the programme migrated" excludes it a second time.
- **The work is scoped to Volumes.** It was reported there and it is visible across 8 screen areas and
  21 call sites. Repairing it where it was noticed leaves the hybrid standing everywhere else.
- **The retirement becomes a redesign.** Eight screen areas are redrawn at once, which is a standing
  invitation to improve columns, reorder properties or rename things on the way past. Any of it makes
  the result unverifiable against the delivered build, because nothing can then be compared before
  and after.
- **A screen keeps the look locally.** A feature file that reproduces the card row with its own markup
  or class satisfies the eye, violates the UI boundary, and puts the second answer back where only a
  check can see it — which is precisely why the check is a requirement here and not a nicety.
- **The coverage is neutered instead of restated.** Dozens of assertions name the retired
  presentation, and the fastest route to green is to weaken them. This codebase has already paid once
  for coverage that passed while the product was broken.
- **The amendment is skipped and only the code changes.** The plan's requirements still mandate two
  variants, and now that the plan reads as finished and merged they read as settled — so a later
  reader reinstating the variant on their authority would be doing the correct thing by the record.
- **The phone breakpoint regresses unnoticed.** These lists currently grow their rows at 375px and
  will pan afterwards. If that is not measured at 375×812, the first sign of trouble is an operator.

## Scope

**In scope**

- Replacing the card-per-row presentation with one classic table for every object list in the
  product: one surface, one header row, rows flush and separated by hairline rules.
- Removing that presentation from the UI library's public interface, so it cannot be asked for.
- Making the removal enforceable automatically, so that asking for it — or reproducing it in feature
  code with local markup or styling — fails a command the developer already runs.
- Converting all 21 call sites in the 12 feature files listed under Reference, across the 8 screen
  areas, including layer efficiency's three, preserving every value, column, action, expansion and
  piece of row content they show today.
- Keeping the content that lives below a row's cells, and keeping nested content legible as nested
  through indentation within the same table surface and the same column tracks.
- Giving the rows that need it the vertical room their content requires, so no two-line row is
  clipped at any of the three viewports.
- Amending the downstream artefacts that mandate or describe two variants — the plan's normative
  requirements and narrative, and the module specs — in the open, with reason and date; annotating
  rather than rewriting the historical record of certified batches.
- Correcting the unit and e2e coverage that names the retired presentation, so each assertion is
  restated against the one presentation or removed together with what it covered.
- Verifying the reported case on the volumes list, the Plugins case the reference analysis measured,
  and the eight screen areas generally, at 1440×1000, 1280×800 and 375×812, with a real pointer and
  on geometry, with the delivered figures recorded first.

**Out of scope**

- Any redesign of the affected screens beyond the row surface: columns, their order, their content,
  wording, actions, sorting, empty states and detail panels are as delivered.
- The ruled presentation itself as containers and images ship it, which is the reference and is not
  being changed.
- Introducing any second list component, or reinstating the one the programme retired.
- Re-certifying the batches of the merged programme.
- Server-side behaviour, the API and the daemon.
- The blur allow-list, the conformance check's blur half and the background asset.
- The remaining items of the original coherence analysis — duplication, image sizes, dashboard
  rhythm, dialogs — which are not touched by a change of row surface.
