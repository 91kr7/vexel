---
batch: 2 · four-named-panels
feature: F2 — The four name-keyed panels: containers, networks, contexts, builders
closed_req: REQ-8, REQ-9, REQ-10, REQ-11, REQ-12
depends: 1
---

# Batch 2 — The four name-keyed panels

The four reported panels whose sort key is simply the name the row displays: nothing derived, no
group of unnamed rows. They are independent of each other and share one rule — the one batch 1
wrote. **Use it; do not write a comparison here.**

Requirements are in `../requirements.md` and are cited here by id only.

## The one thing that must not be got wrong

**Two of these four lists carry no identifier other than their own name**, and that is where the
final comparison gets deleted for looking redundant:

| List | Identity available |
| --- | --- |
| containers | `id` |
| networks | `id` |
| contexts | **the name, and nothing else** — `ContextSummary` has no id |
| builders | **the name, and nothing else** — `BuilderSummary` has no id |

Comparing the name again is **not** a no-op. The first comparison ignores case and reads digit runs
as numbers (REQ-2, REQ-3), so `Data` and `data` tie, and `app-1` and `app-01` tie; the final one
separates exactly those. Drop it and the two rows fall back to the order the daemon supplied — the
reported defect, in the lists where it is hardest to notice (REQ-5).

**Two rows must not move for the operator's own action.** The active context and the active builder
stay in their alphabetical place and are *marked*, not promoted (REQ-10, REQ-11). Promoting the
current one moves a row in response to the operator's own click, which undoes the stability this
whole item buys.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `server/src/containers/containers-service.ts` | `listContainers` returns its rows ordered by container name under batch 1's rule, with the container's `id` as the final comparison. Nothing else about the listing changes — the same rows, the same fields, the internal-container exclusion untouched. | REQ-8, REQ-12 | — |
| INT-2 | modify | `server/src/networks/networks-service.ts` | `listNetworks` returns its rows ordered by network name, with the network's `id` as the final comparison. The tie here is the documented one: Docker states network-name uniqueness is not guaranteed, so two rows with one name must be ordered rather than shuffled (REQ-9). | REQ-9, REQ-12 | — |
| INT-3 | modify | `server/src/contexts/contexts-service.ts` | `listContexts` returns its rows ordered by context name, with the **name compared exactly** as the final comparison, there being no other identity. The `active` flag is untouched and no row is promoted for carrying it. | REQ-10, REQ-12 | — |
| INT-4 | modify | `server/src/builders/builders-service.ts` | `listBuilders` returns its rows ordered by builder name, with the **name compared exactly** as the final comparison, there being no other identity. The `active` flag is untouched and no row is promoted for carrying it. | REQ-11, REQ-12 | — |
| INT-5 | create | server unit test tree, containers area | The unit file `ContainersService` has never had — the only one of the six services without one. It stubs the daemon's listing payload and asserts the order: names out of alphabetical order in the payload come back in order; a tie pair (case-only, and leading-zero) is separated by the id; and **the same payload supplied in both possible orders produces the same output** (REQ-6's shape, applied to this list). Without this file the containers tie cases would have to be attempted where a tie cannot be constructed. | REQ-8, REQ-12 | INT-1 |
| INT-6 | modify | `server/test/unit/networks-service.test.ts`, `server/test/unit/contexts-service.test.ts`, `server/test/unit/builders-service.test.ts` | Add the same three assertions to each: ordering from an out-of-order payload, a genuine tie separated by that list's own identity (two same-named networks with different ids; two contexts and two builders whose names differ only in case), and the payload supplied both ways round producing one result. Correct — never loosen — any existing assertion that only passed because the stubbed list came back in the order it was written in. | REQ-9, REQ-10, REQ-11, REQ-12 | INT-2, INT-3, INT-4 |

## Done when

- The four panels read in name order in the running application, `app-2` before `app-10`, and the
  active context and active builder are still in their alphabetical places.
- `npm run test:typecheck -w server` passes, and the four unit files pass, run narrowed: from
  `server/`, `node --experimental-test-module-mocks --import tsx --test-reporter=dot --test test/unit/<file>.test.ts`.
- Batch-scoped runs only. The full unit suite and the e2e suite are not this batch's business.
