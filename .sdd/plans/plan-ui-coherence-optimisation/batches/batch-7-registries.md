---
batch: 7
feature: F7 — registries
closed_req: [REQ-36, REQ-37, REQ-38]
depends: [5]
---

# Batch 7 — registries

Two `CardList` call sites (`RegistriesScreen.tsx:229` registries, `:261` repositories). The screen's
own defects are small and specific: each row carries a trailing one-off `Log in` / `Log out` button
rather than a row action, and the rows alternate in height because `authenticated · credential store:
desktop` wraps to two lines while `not authenticated` occupies one.

**This screen holds the empty state the analysis calls correct** — `Search Docker Hub` with its
explanatory line. It is preserved, in the primitive's form, and is the model for the ones repaired
elsewhere.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, registries area | The check, written and run **first**: with an authenticated and an unauthenticated registry both present, assert their **row boxes are equal in height** at 1440×1000 and 1280×800; assert the empty state renders a title, one line and its action; drive `Log in` / `Log out` with a **real pointer click**. Report the row heights before and after. | REQ-36, REQ-37, REQ-38 | — |
| INT-2 | modify | `client/src/registries/RegistriesScreen.tsx` (:229) | Migrate the registry list to the object list's comfortable variant, deleting the row-content builder. Host, account, credential store, authentication state and the plain-http flag keep their values and their order; the authentication line stops wrapping and stops dragging its row's height with it. `Log in` / `Log out` become row actions of the cluster. | REQ-36, REQ-37 | INT-1 |
| INT-3 | modify | `client/src/registries/RegistriesScreen.tsx` (:261) | The same for the repository/tag browser list, keeping the per-tag sizes, the search and the pull of a selected tag exactly as delivered. | REQ-36 | INT-1 |
| INT-4 | modify | `client/src/registries/RegistriesScreen.tsx` | Express the delivered empty state through the primitive — same words, `Search Docker Hub` plus its explanatory line, plus the action that resolves it. | REQ-38 | INT-2, INT-3 |
| INT-5 | modify | `.sdd/modules/registries/specs/registries-screen.md`, `.sdd/modules/registries/index.md` | Record the screen's new shape. English only. | REQ-36, REQ-38 | INT-2 … INT-4 |
| INT-6 | modify | client unit and e2e suites covering this screen | Update the coverage the migration invalidates; keep every assertion about logging in, logging out, searching, listing tags with their sizes and pulling one. | REQ-36 | INT-2 … INT-4 |

## Constraints on this batch

- **No secret is ever held by the application** — login and logout are delegated to the host
  credential store, and nothing in this migration may cache, echo or log a credential.
- Nothing about the search, the tag sizes or the pull changes; this batch changes how the screen is
  drawn, not what it reaches.
- **Lower the `CardList` call-site budget in `client/scripts/check-ui-conformance.mjs` by the two
  sites removed here.** The check fails if the count is higher **or** lower than expected, so the
  budget is lowered deliberately or the batch does not go green.
- Feature code composes library components and nothing else.
