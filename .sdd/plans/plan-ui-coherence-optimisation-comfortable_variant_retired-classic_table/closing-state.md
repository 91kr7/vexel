# Closing state — what is left before batch 6 can be certified

Written 2026-08-17, at the point the run was suspended for the human to close it himself.

Branch `feat/ui-coherence-optimisation-comfortable_variant_retired-classic_table`, head `e705f06`,
**not merged**. `main` is untouched.

## Amendment — 2026-08-25: the containers list is one named exception

The state below is as it stood on 2026-08-17 and is not rewritten. Since **2026-08-25** the
**containers list** is drawn as one card per container — one screen, named — while every other object
list this plan converted is still the classic table it delivered. The reason is this plan's own
record: what it retired was a hybrid, a column header over detached cards, and a row that does
legitimately become a card carries each column's label inside it, which is what the containers card
does.

The guard batch 5 installed is **not** switched off: it admits **two literal file paths** —
`client/src/containers/ContainersScreen.tsx` and `client/src/containers/ContainerCard.tsx` — reports
a surface per row in every other feature file, and still carries no exception marker a call site can
write for itself. So the sentence below — *"a third pass … that refuses both routes back"* — is read
from this date as refusing them everywhere but there.

Recorded in `requirements.md` and `batches.md` under the amendment of the same date, in
`.sdd/analysis/docker_management_app-containers_card_view.md`, and carried by
`.sdd/plans/plan-docker_management_app-containers_card_view/` (REQ-59 … REQ-63).

## Where the plan stands

| Batch | Status |
| --- | --- |
| 1 · volumes, networks, registries | certified |
| 2 · the plain lists | certified |
| 3 · the nested lists | certified |
| 4 · layer efficiency and the product-wide sweep | certified |
| 5 · the retirement and its guard | certified |
| 6 · the record amendment | **implemented, not certified** |

The product is finished. 21 of 21 call sites converted, the card-per-row presentation deleted from
the library, and a third pass in `client/scripts/check-ui-conformance.mjs` that refuses both routes
back — demonstrated failing, not asserted (37 violations when run against `d17e1df`). Batch 6's
record work is done and committed (`8722f99`): the reference plan's normative artefacts amended in
place with their dates and reasons, its ten certified batch files annotated and not rewritten, one
spec corrected under `.sdd/modules/`, and batch 5's authorised departure recorded.

**What is missing is only the closing evidence.** Batch 6's own rule is that it is not certified
until the complete unit run and the complete e2e run are both green.

## The runs

- **Complete client unit run — green.** `npm run test -w client` → 159 files, 2135 tests, ~32s.
  `programme-constraints.test.ts` is green on a **non-empty** premise: its range walks 2 revisions
  and throws rather than passes when it walks none, so green there means it checked something.
- **Complete e2e run — 2 red.** `npm run test:e2e -w client` → 571 tests, 556 passed, 2 failed,
  2 skipped (environment-conditional), 11 did not run, ~20m.

Run it **without a pipe**: a pipeline reports the exit status of the last command, not the suite's.

## The two failures — one cause, and it predates this plan

`client/e2e/container-create-privileged.spec.ts:388` and `client/e2e/dialog-sizing.spec.ts:474`.
Two more specs share the cause and fail intermittently on the same gesture:
`filesystem-browser-layout.spec.ts:645` and `layer-build-cache.spec.ts:135`. All four open an image
row's overflow menu inside a `toPass` and then click the item outside the retry — which is itself
the workaround this defect forced on them.

**Observed, not deduced**, by instrumenting the e2e fixture (instrumentation since removed):

```
230ms  a menu entered the DOM
231ms  scroll on DIV.ui-data-table      ← the table's own pan region
232ms  a menu left the DOM
```

The same sequence, at 267 / 269 / 270ms, reproduces in a worktree at **`d17e1df`** — the build this
plan started from. `client/src/ui/controls/Menu.tsx` is **byte-identical to `main`** and was last
touched 2026-08-12, before this programme began. The only path that closes a menu on a scroll is the
capture-phase listener at `Menu.tsx:138`, `window.addEventListener('scroll', dismiss, true)`.

For the operator this reads as: the first click on a row's `…` opens the menu and closes it again,
and a second click is needed.

**A lead for whoever fixes it, measured as a hypothesis and not as a fact**: the scroll may be caused
by the opening itself — `Menu.tsx:73` calls `itemRefs.current[index]?.focus()` without
`{ preventScroll: true }`, and the browser scrolls a focused element into view while the popup lives
inside the table's pan region. It could not be reproduced on demand on a clean daemon, where the
table does not pan at all.

## The `exclusive` project has never run in this plan

11 tests, 7 files. The project declares `dependencies: ['chromium']`, so it is gated out for as long
as chromium has a red. It was run once on its own during batch 6 —
`npm run test:e2e -s -w client -- --project=exclusive --no-deps` → 11 passed, 35.9s — which is
evidence that it passes, but not evidence about the ordering. It includes
`exclusive/volumes-prune.spec.ts`, which batch 1 restated for REQ-40 and which has never run inside
a closing run.

## The two ways to close it

**A — fix the `Menu` defect in a cycle of its own, then re-close.** Its own analysis, plan and dev;
then `npm run test -w client` and `npm run test:e2e -w client`, both complete, both green, with the
`exclusive` project running inside the second. Batch 6 then certifies against its own rule, and four
e2e specs can eventually drop the `toPass` workaround the defect forced on them.

**B — certify batch 6 with the red named and attributed.** 556 of 571 green, the two failures
recorded with their evidence and their provenance. Honest, and incomplete in one stated way: the
`exclusive` project remains never run inside a closing run.

## What must not be done

Weakening the four specs to manufacture the green. It is the one outcome this plan forbids from end
to end — REQ-28's *restated, not neutered* — and it would spend the credibility of the closing
evidence to save a defect report.

## Two probe repairs already made, for context (`e705f06`)

Both change **when** a box is read, never what is demanded of it, and both were demonstrated red
again by restoring the condition they catch:

- `property-columns-rule.spec.ts` — the probe measured a section two frames before the
  `ResizeObserver` re-anchored it (634.4px against the 370px actually painted, a state never
  painted at all). The same figures measure identical at `d17e1df`, so this plan was not the cause,
  and the class's 560px minimum the spec asserts is untouched.
- `classic-table-sweep.spec.ts` — the list count could not distinguish *not yet started* from
  *settled*, and counted one table while the processes view was still reading the daemon. The
  `matched === 1` assertion is unchanged.
