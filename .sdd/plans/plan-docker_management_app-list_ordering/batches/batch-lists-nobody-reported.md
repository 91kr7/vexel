---
batch: 7 · lists-nobody-reported
feature: F7 — The lists nobody reported
closed_req: REQ-35, REQ-36, REQ-37, REQ-38, REQ-39, REQ-40, REQ-41, REQ-42, REQ-43
depends: 1
---

# Batch 7 — The lists nobody reported

Three further operator-facing lists carry the same defect and were **found rather than reported**.
They are in scope by human decision, taken at the requirements gate: the request says "the order of
the elements of **the panels** is not set", which is a statement about the product rather than an
enumeration of six services, and leaving three lists shuffling would be a partial answer to a request
that was not partial.

**This batch is the droppable one.** It is last, it depends only on batch 1, and nothing in batches 2
to 6 depends on it. If any of it proves harder than it looks, it is dropped whole and the six
reported panels are unaffected.

Requirements are in `../requirements.md` and are cited here by id only.

## Two of these three resist the rule, and the answers are decisions, not oversights

**A build-cache record has no name.** `BuildCacheRecord` is `{ id, type, sizeBytes, usageState,
description? }` — no operator-assigned name, and no creation time in the shape the panel is built
from. It is ordered by **identifier ascending**: arbitrary, but stable, which is the requirement, and
it is the spec's own stated fallback for a class of object with neither a name nor a creation time.
**No ranking is invented** (REQ-38): ordering by size or by usage state would be a product decision
about a panel nobody complained about, and ordering by recency would need a field the service does
not return. Both are evolutions with their own reasoning. The panel should look the same afterwards —
it just stops reshuffling.

**Docker Hub's repository search already has an order that means something.** It is a relevance
ranking for the term the operator typed. Alphabetising it would stop `nginx` being the first result
of a search for `nginx` — worse, not more consistent. It is **left exactly as it is** (REQ-40). Every
other registry's catalog is listed and substring-filtered with no ranking at all, and is ordered
(REQ-39). The split is deliberate and is the same principle that leaves logs and layer stacks alone.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `server/src/compose/compose-discovery-service.ts` | `listComposeProjects` orders projects by name under batch 1's rule; the `services` nested inside each project order by service name under the same rule. Neither carries an identity other than its name, so the final comparison is the name compared exactly — the same shape `swarm-stacks-service.ts` applies to its own nested services. Nothing about project or service state, config files or error reporting changes. | REQ-35, REQ-36, REQ-43 | — |
| INT-2 | modify | `server/src/builders/build-cache-service.ts` | `listBuildCache` orders its records by `id`, ascending. No other ordering is introduced: not by size, not by usage state, not by the recorded build step (REQ-38). | REQ-37, REQ-38, REQ-43 | — |
| INT-3 | modify | `server/src/registries/registry-catalog-service.ts` | `searchRepositories` orders by repository name under the rule **for every registry other than Docker Hub**, whose result set keeps the order Hub returned it in (REQ-40) — the branch is already there, since Hub is searched and the others have their catalog listed and filtered. `listRepositoryTags` orders by tag name under the rule for every registry, so `1.25` precedes `1.26` precedes `latest`. Both take the name compared exactly as the final comparison. The `limit` is applied as it is today, and a tag whose manifest could not be read still keeps its place with no size. | REQ-39, REQ-40, REQ-41, REQ-43 | — |
| INT-4 | create | server unit test tree, compose area | The unit file `ComposeDiscoveryService` has never had. From a stubbed CLI payload deliberately out of order: projects ordered, the services inside a project ordered, a digit-suffixed pair read numerically, a tie separated deterministically, and **the same payload supplied both ways round producing one result** (REQ-6's shape, applied to this list). | REQ-35, REQ-36, REQ-43 | INT-1 |
| INT-5 | modify | `server/test/unit/build-cache-service.test.ts`, `server/test/unit/registry-catalog-service.test.ts` | Build cache: records ordered by id from an out-of-order payload, the same payload both ways round producing one result, and an assertion pinning that the order is **not** by size — so that a later "improvement" to size-descending is a deliberate decision rather than a silent one (REQ-38). Catalog: a non-Hub catalog ordered by repository name; **a Hub search result asserted to come back in the order Hub returned it** (REQ-40); tags ordered with `1.25` before `1.26` before `latest`. Correct — never loosen — any existing assertion that only passed because the stubbed list arrived in the order it was written in. | REQ-37, REQ-38, REQ-39, REQ-40, REQ-41, REQ-43 | INT-2, INT-3 |
| INT-6 | modify | `client/src/dashboard/DashboardScreen.tsx` — expected to be **no change at all** | The guard rail, verified rather than assumed. The Dashboard's container activity list sorts client-side — state first, then name — and it stays exactly as it is (REQ-42). It reads like the client-side ordering REQ-28 forbids, and it is not: it is a deliberate grouping (the point of an activity panel) and, decisively, **it is already a total order** — Docker keeps container names unique on a daemon, so no two rows can tie on (state, name) and it cannot reshuffle between reads. It does not have the defect this plan fixes. Its residual is a host-locale-dependent name comparison, which moves the order between *machines*, never between two reads on one machine; that is out of this fix's scope and is recorded, not repaired — and repairing it here would mean a second copy of the rule in the client, which REQ-1 forbids. Confirm by `git diff` that the file is untouched, and that the activity list still puts running containers first in the running application. | REQ-42 | — |

## Done when

- Compose projects and their services read in name order; the build-cache panel is stable and
  otherwise unchanged; a non-Hub registry's repositories read in name order while a Hub search for
  `nginx` still returns `nginx` first; tags read `1.25`, `1.26`, `latest`.
- The Dashboard's activity list still groups by state.
- `npm run test:typecheck -w server` passes and the three unit files pass, run narrowed: from
  `server/`, `node --experimental-test-module-mocks --import tsx --test-reporter=dot --test test/unit/<file>.test.ts`.
- Batch-scoped runs only. The full unit suite and the e2e suite are not this batch's business: they
  run once, at the very end, and they are the human's to run.
