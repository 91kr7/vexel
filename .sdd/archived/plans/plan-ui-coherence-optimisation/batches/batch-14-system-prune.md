---
batch: 14
feature: F17 — system and prune
closed_req: [REQ-73, REQ-74, REQ-75]
depends: [5]
---

# Batch 14 — system-prune

The screen that **keeps** the daemon properties: `SystemScreen` and `ContextsScreen` both consume
`useDaemonInfo` and both list the same eight, and the gate decided the properties describe the daemon
rather than a context. Batch 9 removes the block from Contexts; this batch changes nothing about the
properties themselves and verifies they are still here, in the same words.

Its own work is adoption, and it is a screen where **most of what is there is already right** and
must not be improved: the prune rows correctly distinguish actionable from inert, the destructive
actions are correctly red-tinted, and the callout is one style used twice, correctly.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, system area | The check, written and run **first**: the **eight** daemon properties are present with their delivered labels and values; every prune row is present, with the enabled ones enabled and the inert ones inert; the callout renders unchanged; and the `Unused volumes` row's text does not intersect its size or its `Prune` button. Report the property list and the row states before and after. | REQ-73, REQ-74, REQ-75 | — |
| INT-2 | modify | `client/src/system/SystemScreen.tsx` | Adopt the section header, the empty-state and the action-cluster primitives for this screen's sections, empty results and actions. **The prune rows keep their delivered behaviour, tint and enablement**, and the daemon properties keep their words and values. | REQ-73, REQ-75 | INT-1 |
| INT-3 | modify | `client/src/system/SystemScreen.tsx` | Present the daemon properties in the two-column property grid, so this screen states them the way every other property block in the product does. Nothing is added, removed, renamed or reordered. | REQ-75 | INT-2 |
| INT-4 | modify | `.sdd/modules/system/specs/system-screen.md`, `.sdd/modules/system/index.md` | Record the screen's new shape and, explicitly, **that this is the screen that carries the daemon properties**, with the reason — so that a later reader does not restore them to Contexts. English only. | REQ-75 | INT-2, INT-3 |
| INT-5 | modify | client unit and e2e suites covering this screen | Update the coverage the adoption invalidates; keep every assertion about the per-category prune, the scoped system prune, the shared-daemon warning, and the space actually reclaimed being reported. | REQ-73 | INT-2, INT-3 |

## Constraints on this batch

- **The callout is not touched** (REQ-74): not restyled, not replaced by the empty-state primitive,
  not absorbed into the section header. It is one style used twice, correctly, and the analysis names
  it as already right.
- **No prune changes what it prunes.** These operations act on the operator's own daemon; a
  presentation change that alters a scope, an enablement or a confirmation is a data-loss defect
  wearing a cosmetic diff.
- The destructive-by-nature coverage lives in the exclusive projects and stays there.
- Feature code composes library components and nothing else.
