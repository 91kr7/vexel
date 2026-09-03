---
batch: 13
feature: F13 — images and layers: one fact, one place; two sizes, two names
closed_req: [REQ-57, REQ-58, REQ-59, REQ-60, REQ-61, REQ-82, REQ-94]
depends: [5, 6, 7, 8, 9, 10, 11, 12]
---

# Batch 13 — images-layers

The screen where the product repeats itself and, once, contradicts itself:

- the `REPOSITORY:TAG` column and the `TAGS` column carry the **identical string on every row**
  (`alpine:3.20` beside a pill reading `alpine:3.20`);
- the detail panel's `Id` and `Digest` display the **same value**;
- the row's `SIZE` reads `13.0MB` where the panel's `Size` reads `3.9MB` — **two numbers under one
  word**, with nothing distinguishing them;
- the panel renders a collapsible `Labels` section with a count of `0`.

**And it is the batch that closes the migration.** `LayerEfficiencyView` holds the last three
`CardList` call sites (`:175`, `:193`, `:215`) — on a `DataTable` screen, which is why a programme
that migrates "the nine screens" and stops leaves the component alive. Once they are gone, `CardList`
is deleted (REQ-82). **This is the single most likely thing in the plan to be forgotten.**

## Recorded 2026-08-17 — the presentation this batch migrated onto was retired afterwards

**Nothing in this file is edited, and that is deliberate**: it is the record of what was built and
what it was accepted on. The **comfortable** variant `INT-7` migrates layer efficiency's last three
`CardList` call sites onto — each row on a card of its own, under a floating column header — was
**retired on 2026-08-16**, prop, carrier surface, stylesheet rules and header-inset compensation
together, and those three lists were converted again, onto the one table presentation containers and
images already shipped, each keeping its per-row expansion inside the dialog that holds them. The
deletion of `CardList` that this batch closes stands: it was not reversed, and nothing was moved back
onto it.

**`INT-7` is annotated rather than retargeted, on purpose.** By the time the retirement was planned
this batch had already run, so its intervention is a record of work done and not an instruction to
anyone; editing it to name today's destination would rewrite what was actually built, which is the
practice the amending plan exists to correct. Where the decision is written:
`.sdd/plans/plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/` (REQ-21,
REQ-22, REQ-26), on
`.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, images area | The check, written and run **first**: a row prints its reference **once**, and an image with several tags still shows all of them; the panel's `Id` and `Digest` **differ**, or the one with nothing of its own is absent; the row's size label and the panel's size label are **different words**; no `Labels` section is rendered when its count is `0`. Report each pair of values before and after. | REQ-57, REQ-58, REQ-59, REQ-60 | — |
| INT-2 | modify | `client/src/images/ImagesScreen.tsx` | Remove the duplicated reference from the row — the `TAGS` pill repeating the `REPOSITORY:TAG` column — keeping every tag visible for a multi-tagged image. The ten-entry overflow menu, its three groups, the pull/push dialogs, the analyses and the bulk selection are untouched. | REQ-57 | INT-1 |
| INT-3 | modify | `client/src/images/ImageDetailPanel.tsx` | `Id` and `Digest` each display the value they name — the image id and the repository digest being different things — or the field with nothing of its own is **not rendered**. **If the payload itself carries one value twice, stop and report**: that is a server matter and this plan puts no server file in scope. | REQ-58 | INT-1 |
| INT-4 | modify | `client/src/images/ImagesScreen.tsx`, `client/src/images/ImageDetailPanel.tsx` | Name the two sizes for what each measures, so that no single word carries two values. The defect was never that two numbers exist. Derive the names from the Engine fields actually behind them and record which is which on the spot. | REQ-59 | INT-1 |
| INT-5 | modify | `client/src/images/ImageDetailPanel.tsx`, `client/src/containers/ContainerDetailPanel.tsx` | A collapsible section with a count of `0` is **absent**, not present and empty — on both panels, the rule being one rule. A section with content is unchanged. | REQ-60 | INT-1 |
| INT-6 | modify | `client/src/images/ImageDetailPanel.tsx` | Adopt the detail-panel primitive, keeping the delivered content exactly: the same properties in the same order, the two-column grid, the collapsible sections that have content, the raw payload as selectable text, no actions and no close control. | REQ-61 | INT-3, INT-5 |
| INT-7 | modify | `client/src/images/LayerEfficiencyView.tsx` (:175, :193, :215) | Migrate the last three `CardList` call sites — wasted files, duplicated content, secret findings — to the object list's comfortable variant, deleting the three row builders (`:65`, `:74`, `:83`). Each finding still navigates to its layer, and the heuristic disclaimer stays exactly where it is. | REQ-82 | INT-1 |
| INT-8 | modify | `client/src/ui/data/CardList.tsx`, `client/src/ui/index.ts`, `client/scripts/check-ui-conformance.mjs` | **Delete the component, its props and row types, its stylesheet and its export.** Its last call site left in INT-7. A second list component left exported is the next screen's fifth answer. The call-site budget seeded in batch 5 must read **zero** before the deletion — that is the evidence no screen acquired a new site during the eight batches in which the component stayed exported — and the budget check is then **removed with the component**, not left asserting zero against a name that no longer exists. `grep CardList` across `client/` must return nothing. | REQ-82, REQ-94 | INT-7, and batches 6–12 |
| INT-9 | modify | `.sdd/modules/ui-library/index.md` (the `CardList` row), `.sdd/modules/ui-library/specs/card-list.md`, `.sdd/modules/images/specs/*.md` | Delete the index row and the spec of the removed component, and record the images screen's and panel's new shape, the naming of the two sizes included. English only. | REQ-57, REQ-59, REQ-82 | INT-2 … INT-8 |
| INT-10 | modify | client unit and e2e suites covering images and layers | Update the coverage the change invalidates. **`plan-docker_management_app-detail_property_columns`' contract test governs this panel**: its column counts must be identical at the same measured section width, and a change to one is the signal the fix went into the wrong component. Coverage of the removed `TAGS` pill and of the empty `Labels` section is removed, not neutered. | REQ-57, REQ-60, REQ-61 | INT-2 … INT-8 |

## Constraints on this batch

- **Three certified predecessors meet here and none may move**:
  `detail_property_columns` (bug-4 — the column rule, property set, ordering and content classes),
  `remove_copy_controls` (bug-5 — no copy affordance, nothing reaching the clipboard),
  `filesystem_browse_direct` and `filesystem_browser_layout` (bug-2, bug-3 — the route into the
  browser and its interior, reached from this screen).
- The image's four analyses keep their behaviour: openable with no panel open, bound to the invoking
  row's image, one at a time, resolved when that image leaves the list.
- Feature code composes library components and nothing else.

## Recorded from batch 8 — a latent defect in a component this batch owns

**`BadgeListCell` paints its badges over one another under width pressure**, and images is where it
lives (`ImagesScreen.tsx:506`, the `TAGS` column; also `VolumesPanel`'s `MOUNTED BY`). The cell's
`__item` wrapper is `flex: 0 1 auto` and shrinks; the `.ui-badge` inside it does not, and it carries
no truncation of its own, so the pill simply overflows its wrapper and is drawn across the next
badge.

Measured at 1440×1000 with seven platform strings in a 165px column (the shape batch 8 first gave the
builders row): item boxes **65.1 / 67.4 / 24.8px** against badge boxes **78 / 80.7 / 29.7px** —
`linux/arm64` ending **9px inside** `linux/amd64`'s box, and `linux/amd64` the same distance inside
`+5`'s — twice per row, at all three viewports. `REQ-18`'s "no text rectangle overlaps another" and
`REQ-89`'s geometry rule both bite on it.

**It shows nowhere today, and only because of the data**: on this daemon the images `TAGS` column
holds one short tag per row and `MOUNTED BY` is usually empty — 0 overlapping pairs on both screens
at 1440×1000 and 375×812. A defect that is invisible only because of the data is the kind that ships,
and the first screen with several long labels in a narrow column meets it.

Batch 8 did **not** fix it: changing a shared cell mid-migration was outside its interventions, and
it used `MetaCell` with the delivered joined list instead — which is also what the delivered builder
row carried. The repair is this batch's (the badge must shrink and ellipsise inside its wrapper,
with the label's full text staying in the wrapper's tooltip), and it needs its own unit coverage.

## Recorded from batch 9 — `Badge.onClick` survives INT-8 unless it is named

**Deleting `CardList` does not delete the affordance it was the last consumer of.** With the contexts
migration, `CardList`'s active-selection variant lost its last call site in the whole client, and with
it a **library prop** whose only call site anywhere is inside the component this batch removes:

| what | where | goes with |
| --- | --- | --- |
| `Badge`'s `onClick` prop | `client/src/ui/controls/Badge.tsx` — sole call site in the client: `client/src/ui/data/CardList.tsx:116` | **nothing** — it outlives INT-8 unless removed by name |
| `CardListRowSelection` (`active`, `onUse`, `activeLabel`, `useLabel`) and `selectionControl` | `client/src/ui/data/CardList.tsx:9`, `:114` | `CardList`, at INT-8 |
| their coverage | `client/test/unit/card-list-selection.test.tsx` (whole file) | `CardList`, at INT-8 |
| the lines stating the selection variant | `.sdd/modules/ui-library/specs/card-list.md:39-42`, `:55`, `:57-58` | `CardList`, at INT-9 |

**Why this orphan is worse than `KeyHint` (REQ-93) or `ChipGroup.addLabel` (batch 6's pin), which are
merely dead.** `Badge onClick` renders `<button class="ui-badge ui-badge--clickable">`: a badge that
is a control, told from a badge that is a statement by a hover fill and nothing else. That is
precisely the affordance REQ-27 forbids and precisely the defect batch 9 removed from Contexts — so
leaving the prop exported is leaving the library able to manufacture, in one line and with no
reviewer's objection, the thing three batches have been removing. A dead prop is untidy; a dead prop
that manufactures a banned affordance is a trap.

So **INT-8 removes the prop, not only the component**: `Badge`'s `onClick`, its `<button>` branch,
`.ui-badge--clickable` and its `:hover` rule in `client/src/ui/controls/controls.css:223-231`, and the
lines of `ui-library/specs/badge.md` that offer it (`:15` in the signature, `:23` "renders the badge
as a click target … e.g. a selection", `:29` the propagation rule that only a clickable one has). After
that, `Badge` renders a `<span>` and only a `<span>`, and a caller that wants a clickable pill has to
ask `ActionButtonGroup` for an action with a weight — which is the whole point of REQ-27. `grep -n
"onClick" client/src/ui/controls/Badge.tsx` must return nothing, alongside INT-8's `grep CardList`.
