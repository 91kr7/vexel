---
batch: 9
feature: F9 — contexts
closed_req: [REQ-42, REQ-43, REQ-44, REQ-45]
depends: [5]
---

# Batch 9 — contexts

One `CardList` call site (`ContextsScreen.tsx:161`), in the "cards with inline trailing buttons"
shape — the fourth of the four list paradigms the analysis counts. Two defects of its own: **`use` is
bare text acting as a control**, and it is the most consequential click on the screen (it switches
the active Docker daemon for the whole application); and the endpoint runs under the `active` pill,
repaired in batch 4 and verified here in its migrated form.

**The daemon block leaves this screen.** `ContextsScreen` and `SystemScreen` both consume
`useDaemonInfo` and both list the same eight properties. Decided at the requirements gate: they
describe *the daemon*, not *a context* — they do not change as you look down this list, only when the
active context changes — so **System & prune keeps them** and this screen loses the full block.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, contexts area | The check, written and run **first**: `use` is hit-testable as a control at its own centre and a **real pointer click** switches the active context, with every cached view dropping the previous daemon's data; the endpoint's box does not intersect the `active` pill's at any of the three viewports; and **no eight-property daemon block is rendered on this screen**. Report what was on the screen before and after. | REQ-43, REQ-44, REQ-45 | — |
| INT-2 | modify | `client/src/contexts/ContextsScreen.tsx` (:161, `contextRow` at :144) | Migrate the list to the object list's comfortable variant — its **active-selection row** variant is exactly this case — deleting the row-content builder. Name, endpoint, kind, TLS and the active marker keep their values. | REQ-42, REQ-44 | INT-1 |
| INT-3 | modify | `client/src/contexts/ContextsScreen.tsx` | **`use` becomes a control of the action cluster**, performing exactly the switch it performs today, announcing it exactly as today through the active-context broadcast. Remove with confirmation and the create form (local socket / SSH) go through the same cluster. | REQ-43 | INT-2 |
| INT-4 | modify | `client/src/contexts/ContextsScreen.tsx` | Remove the full eight-property daemon panel and its `useDaemonInfo` consumption **if nothing else on the screen needs it**. A **short summary of two or three properties on the active context's row — version and endpoint, say — is permitted and is not the duplication returning**; the full block is what must not survive. Whichever is chosen, no import, hook call or type is left orphaned. | REQ-45 | INT-2 |
| INT-5 | modify | `.sdd/modules/contexts/specs/contexts-screen.md`, `.sdd/modules/contexts/index.md` | Record the screen's new shape **and the removal of the daemon panel with its reason**, so the next reader does not restore it as a missing feature. English only. | REQ-42, REQ-43, REQ-45 | INT-2 … INT-4 |
| INT-6 | modify | client unit and e2e suites covering this screen | Update the coverage the migration invalidates; keep every assertion about creating a context, removing one, switching the active one and the broadcast that follows. Coverage of the removed daemon panel is **removed, not neutered** — the behaviour it covered is gone from this screen and is covered on System & prune. | REQ-42, REQ-43, REQ-45 | INT-2 … INT-4 |

## Constraints on this batch

- **The properties are never absent from the product.** System & prune already displays them, so this
  batch may land before batch 14; batch 14 does not move them, it verifies they are still there.
- The active-context switch is the application's widest side effect: every cached view drops the
  previous daemon's data. Nothing in this migration may change when that broadcast fires or what it
  carries.
- **Lower the `CardList` call-site budget in `client/scripts/check-ui-conformance.mjs` by the one
  site removed here.** The check fails if the count is higher **or** lower than expected, so the
  budget is lowered deliberately or the batch does not go green.
- Feature code composes library components and nothing else.
