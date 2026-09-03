---
batch: 1 · about-screen-rename
feature: F1 — The application's own screen becomes "About"
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5]
depends: []
---

# Batch 1 — The application's own screen becomes "About"

The screen the application dedicates to itself takes the name of what it now is. Only what the
operator sees changes.

## The hard boundary

The screen id stays `coverage-matrix`. It is persisted as the last active screen
(`plan-docker_management_app/REQ-115`) and it is how the e2e helper `openApp` addresses the screen.
Changing it would silently strand every operator's preferences and rewrite the test suite for no
gain. Only `label`, `title`, `description` — and optionally `glyph` — move.

The second boundary is subtler and is REQ-4. Renaming the screen to "About" costs the coverage
matrix the one word that used to advertise it in the navigation; the reference analysis had made
that matrix a transparency commitment, so the screen's description has to do the advertising instead.
A description that only says "about this application" satisfies REQ-1 and quietly breaks REQ-4.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/shell/navigation.ts` | The entry whose `id` is `coverage-matrix`: `label` → "About", with `title` and `description` to match. The `id` is not touched, nor is the entry's group ("Full coverage") or its position as the last of that group. The `description` must name the functional coverage matrix as well as the product's identity and licence, since it is now the only place the navigation says the matrix is here (REQ-4). `glyph` may change to one that reads as identity if the existing sprite offers one; keeping the current glyph is equally acceptable — no requirement rests on it. | REQ-1, REQ-2, REQ-4 | — |
| INT-2 | modify | `client/test/unit/shell-connectivity.test.tsx` | Update the assertions that address the screen by its visible label. | REQ-5 | INT-1 |
| INT-3 | modify | `client/e2e/shell.spec.ts`, `client/e2e/coverage-matrix.spec.ts`, `client/e2e/event-feed-identity.spec.ts` | Same, for the three e2e specs that click or assert the visible label. The support helper that addresses the screen by its internal id (`openApp`) must come out of this batch **unmodified** — that it still works untouched is the evidence for REQ-2. | REQ-2, REQ-5 | INT-1 |
| INT-4 | modify | `client/e2e/coverage-matrix.spec.ts` | Add the regression check the rename needs: with the screen persisted as last active under its internal id by a previous version, the application reopens on it with no migration step; and once open, the screen still carries the three shell cards (CLI availability, daemon event stream, local storage) and the coverage matrix under its own heading. This is what closes REQ-3 — nothing in this batch adds content, so the guarantee is that nothing was taken away. | REQ-2, REQ-3, REQ-4 | INT-1 |
| INT-5 | modify | `.sdd/plans/plan-docker_management_app/requirements.md`, `.sdd/plans/plan-docker_management_app/batches.md` | Retitle the feature reported as F29 to the screen's new name, and extend it with a cross-reference to this plan's F2 for the notice the screen now also carries — a reference by id, not a copy, and no requirement renumbered: `plan-docker_management_app/REQ-105` and `/REQ-106` keep their text and their meaning. In `batches.md`, the batch-30 row's feature cell and the wording of its human-acceptance cell. | REQ-5 | INT-1 |
| INT-6 | modify | `client/src/coverage/coverage-map.ts`, plus any other operator-visible string in `client/src/` naming this screen | Sweep the operator-visible strings for the screen's old name and update them. The coverage map is the known candidate: its entries carry a `name`, a `summary` and a `reason` written for an operator to read. Row references to the screen are **not** part of this — they are resolved from the navigation data at render time and follow INT-1 on their own. | REQ-5 | INT-1 |

## Out of this batch

- No change to `client/src/shell/Shell.tsx`: it branches on the screen id, which is unchanged.
- No change to `client/src/coverage/CoverageMatrixScreen.tsx`, its module or its specs beyond the
  standing duty of keeping an index and a spec true to the code they describe. The component is
  still accurately named: it renders the coverage matrix, which is now one half of the About screen.
- No notice. That is batch 2.

## Human acceptance

The last entry of the "Full coverage" group reads "About"; opening it shows a header titled "About"
whose one-line description names the functional coverage matrix; the CLI availability, daemon event
stream and local storage cards are all still there, and so is the matrix under its own heading.
Starting the application over a preferences file written by the previous version, with this screen
persisted as last active, reopens it with nothing to redo. `npm run test -w client` and the e2e
suite pass, `openApp` untouched. Searching the client's operator-visible strings and the reference
plan's requirements for "Coverage matrix" *as the name of the screen* returns nothing.
