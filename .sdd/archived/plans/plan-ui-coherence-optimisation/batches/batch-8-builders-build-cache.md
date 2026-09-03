---
batch: 8
feature: F8 — builders and build cache
closed_req: [REQ-39, REQ-40, REQ-41]
depends: [5]
---

# Batch 8 — builders-build-cache

Two `CardList` call sites (`BuildersScreen.tsx:229` builders, `:249` build cache). Two defects of its
own: a builder's name is printed as the row title **and again as a third line of the same row**, and
the row's trailing run — `running` · `cache 14.6MB` · `in use` · `Remove` — mixes a pill, a plain
string, a state and a button in one undifferentiated line, so a control's appearance no longer
predicts that it is a control. Its page-level actions live in a card header rather than in a toolbar.

## Recorded 2026-08-17 — the presentation this batch migrated onto was retired afterwards

**Nothing in this file is edited, and that is deliberate**: it is the record of what was built and
what it was accepted on. The **comfortable** variant `INT-2` and `INT-3` migrate the builders and
build-cache lists onto — each row on a card of its own, under a floating column header — was
**retired on 2026-08-16**, prop, carrier surface, stylesheet rules and header-inset compensation
together, and both lists were converted again, onto the one table presentation containers and images
already shipped. This batch's acceptance and its measured figures were taken against the card row and
are read as of their own date, not as a description of what ships. Where the decision is written:
`.sdd/plans/plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/` (REQ-16,
REQ-22, REQ-26), on
`.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, builders area | The check, written and run **first**: assert a builder's name appears **once** in its row; assert the status reading and the actions are separately addressable (a status is not clickable, an action is, and each action is hit-testable at its own centre with a **real pointer**); assert the page-level actions are in the screen toolbar. Report what the row contained before and after. | REQ-39, REQ-40, REQ-41 | — |
| INT-2 | modify | `client/src/builders/BuildersScreen.tsx` (:229, `builderRow` at :204) | Migrate the builder list to the object list's comfortable variant, deleting the row-content builder. **The duplicated name goes** — one of the two occurrences, and nothing else leaves with it. Name, driver, endpoint, platforms, status, cache size and the active-builder marker keep their values. | REQ-39, REQ-40 | INT-1 |
| INT-3 | modify | `client/src/builders/BuildersScreen.tsx` (:249, `cacheRow` at :74) | The same for the build-cache list: id, type, size, usage state and the recorded build step, in identifier order as delivered — **deliberately not ranked by size**, which is a decision of the service and is not this batch's to change. | REQ-39 | INT-1 |
| INT-4 | modify | `client/src/builders/BuildersScreen.tsx` | Express both rows' mixed trailing runs as a **status column plus an action cluster**, so `running`, `cache 14.6MB` and `in use` read as data and `Remove` reads as a control. Move the page-level actions (create a builder, prune the cache) into the screen toolbar under the header. | REQ-39, REQ-41 | INT-2, INT-3 |
| INT-5 | modify | `.sdd/modules/builders/specs/builders-screen.md`, `.sdd/modules/builders/index.md` | Record the screen's new shape. English only. | REQ-39, REQ-41 | INT-2 … INT-4 |
| INT-6 | modify | client unit and e2e suites covering this screen | Update the coverage the migration invalidates; keep every assertion about creating, removing and selecting the active builder, pruning the cache with the space reclaimed, and each cache record's related images and layers — **or the stated reason it has none**, which is a deliberate behaviour and must survive. | REQ-39, REQ-41 | INT-2 … INT-4 |

## Constraints on this batch

- The reverse lookup from a cache record to the images and layers it relates to keeps working,
  including its explicit, reasoned unavailability. A migration that turns a stated reason into an
  empty space has lost the point of it.
- **Lower the `CardList` call-site budget in `client/scripts/check-ui-conformance.mjs` by the two
  sites removed here.** The check fails if the count is higher **or** lower than expected, so the
  budget is lowered deliberately or the batch does not go green.
- Feature code composes library components and nothing else.
