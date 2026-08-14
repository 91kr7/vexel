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
