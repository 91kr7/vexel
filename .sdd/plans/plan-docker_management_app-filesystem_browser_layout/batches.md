---
slug: docker_management_app-filesystem_browser_layout
date: 2026-08-14
spec: .sdd/analysis/docker_management_app-filesystem_browser_layout.md
requirements: .sdd/plans/plan-docker_management_app-filesystem_browser_layout/requirements.md
status: validated
---

# Batches — The filesystem browser gives its height to the filesystem

Fix of the delivered product; bug-3. **One feature, one batch, thirteen interventions: six checks
written and seen red first, five UI-library corrections, one feature component, one documentation
point.** Batch numbers and `REQ-n`/`INT-n` ids are local to this plan.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · filesystem-browser-layout | F1 — The dialog's interior distributes its height by intent | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36 | — | todo | **First, the report itself, at 1280 × 720, with the mouse.** Images & layers → the `…` on `alpine:3.20` → `Browse filesystem…` → through bug-2's flow to the tree. **Count the entries you can see without touching the tree's scrollbar: at least ten.** Then look for the two empty bands in the screenshot — between the scaffolding note and the search field, and between the search field and the tree: **there is no band, at either place**, only the same spacing that separates the status row from the note. **The dialog itself has no scrollbar** — one scrollbar in the body, the tree's own. **Then make the monitor the test.** Enlarge the window to about 1280 × 1000 and re-open: **strictly more entries than before**, and the tree-and-detail region visibly taller — on the delivered build it is 480px on both, which is the whole of what "the defect grows with the operator's monitor" means. **Then the idle column**: with nothing selected, `No entry selected` and its one line sit **compactly at the top** of the right-hand pane, not floating in the middle of a tall empty column. **Then the thing this project has already shipped once**: click a tree row with the mouse and watch the tree — **it does not move and it does not change width**, and the row you just clicked is still under the pointer. Open a long file's `Text` preview: it scrolls **inside the right pane**; the dialog does not grow and the tree does not move. Type in the search field and press `Next`: the match is revealed and highlighted, **the tree scrolls, the dialog does not**. **Then the short case**, which is where the natural over-correction shows: browse an image with only a handful of root entries — the card is **as short as its content**, with no band of empty glass under the tree. A dialog that is 85vh tall whatever it holds re-breaks `dialog_sizing` and the batch is refused. **Then narrow the window** below 720px: the two panes **stack**, tree first, and every control is still there, still labelled the same. **Then the screen nobody in this report was looking at**: a container's Logs tab — its search field is still full width in its row, still at least 240px, still exactly as tall as the control in it. **Then the three dialogs this report deliberately did not touch**: `Explore layers…`, `Efficiency & signals…`, `Compare with…` — they look and behave exactly as they did, and `git diff` shows **no change to their feature code**. They still state pixel heights; that is a recorded breach awaiting its own report, not an oversight, and re-pointing them at the new primitive inside this batch is a refusal. **Then the diff**: every correction is in `client/src/ui/` — the search band, the new bands-plus-filling-region primitive, `SplitPane`, `TreeView`, `EmptyState` — and `FilesystemBrowser.tsx` contains **no pixel height at all**; `grep` it for `480px`, `360px`, `maxHeight` and `px` and find nothing. No raw markup, no local style, no negative margin; `check-ui-conformance.mjs` is **unmodified** and passes; no selector joins or leaves the blur allow-list. **Then the evidence the checks could have caught it**: the implementer reports INT-1 to INT-6 **run against this build before INT-7 to INT-12 existed and observed failing, with the numbers** — the ~110px gaps, the 480px region measured identically at 720 and at 1000, the two scroll containers, the ~3 visible rows — beside the same measurements after the fix. A "before: failed" with no numbers is not evidence on a layout defect and the batch is refused for it. **Test runs are batch-scoped**: `npm run lint`, `npm run test:typecheck -w client`, `npm run test -w client`, and this batch's e2e specs each run on their own. The complete suites are the human's, at the end of the tranche. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases. On green tests the batch goes to `certified`.

Batch file:
[`batches/batch-filesystem-browser-layout.md`](batches/batch-filesystem-browser-layout.md).

## Assumptions and decisions

- **One batch, because this is one vertical slice.** The two library corrections and the feature
  composition are one change: the primitive exists to be composed here, and composed alone it closes
  no requirement while the band still claims 240px. Splitting "the library learns to size" from "the
  browser composes it" is a split by layer, which is refused, and would produce a first batch that
  closes no REQ — the tell. Splitting the checks off from the fix is the same refusal.
- **The geometry is checked in a real browser, never in jsdom.** Every layout assertion of this plan
  lands in the Playwright tree, because jsdom reports every box as zero: a "the region is at least
  half the dialog" assertion written as a unit test passes on any build, defect included, which is
  precisely the class of certification `CLAUDE.md` forbids. The component-level checks (INT-5, INT-6)
  are therefore about **contract and state** — every band present, every state renderable, no pixel
  height passed by feature code — and they are declared as standing *beside* the geometry, never
  instead of it (REQ-30).
- **The band is corrected so that a call-site wrapper would be the wrong fix — and INT-1 makes that
  wrong fix red.** The likeliest bad implementation is to wrap the band in a `Row` inside
  `FilesystemBrowser.tsx`: legal library composition, no conformance violation, the void gone, the
  logs view still fine, the shared rule still wrong and the next column use of the band still
  broken — every check green. INT-1 therefore asserts the band's own root element is a **direct
  child of the body's band stack** *and* that its measured height equals the height of the control it
  holds. Both halves are needed: the first fails on a wrapper, the second fails on the delivered
  build.
- **The band must not be "freed" into growing on the block axis either.** A naive
  `flex: 1 1 auto` keeps `flex-grow: 1`, which in a column means the band absorbs *all* the remaining
  height — the same defect, larger, and it would still pass a check that only looked for "240". The
  row contract (at least 240px wide, and grow) and the column contract (the height of its content)
  are both stated in `stream-search-field.md` after INT-7, and the library's own `Row`/`Stack` carry
  the classes that let the row-axis rule be scoped inside the library, with no axis prop offered at
  the call site. A prop asking the caller which axis they are on is this defect written down.
- **The elastic region is bounded, not stretched — which is how REQ-7 and REQ-25 hold together.**
  The primitive is given a **maximum** height (the one the shared dialog already imposes) rather than
  a height: with little content the container is content-sized, the filling region does not stretch,
  and the card is short; with much content the container is capped, the filling region shrinks against
  it and scrolls. That single decision answers the analysis's two opposite risks — the permanently
  85vh dialog, and the tree that "grows to fit" and loses its virtualisation — and it is why INT-10
  gives `TreeView` a mode bounded by the region it sits in rather than by a px string.
- **The narrow breakpoint is the delivered phone breakpoint, 720px**, and no new one is invented
  (REQ-9). It is where the product already collapses multi-column arrangements (`Frame` takes the rail
  off-canvas there), and it is where the analysis's own arithmetic bites: the large dialog is
  `min(1100px, 92vw)`, so below roughly 700px of viewport the 320px leading pane leaves the detail
  column unreadable. `QuadPanelLayout`'s tablet breakpoint (1024px) was considered and rejected —
  at 1024px the dialog is still ~940px wide and the two panes are comfortable; stacking there would
  take away a working layout.
- **`SplitPane`, `TreeView` and `EmptyState` gain modes; none loses one.** The delivered `maxHeight`
  and `startWidth` paths stay exactly as they are, because the image diff, the layer explorer and the
  efficiency view are on them and are deliberately out of scope. This is what keeps the sibling
  dialogs byte-identical in behaviour while the library grows underneath them.
- **The conformance check gains no new rule, deliberately.** A static guard against hard-coded pixel
  sizes in feature code is the obvious companion to REQ-21 and is **not** added here: it would go red
  on `ImageDiffView`, `LayerExplorer` and `LayerEfficiencyView` on the first run, forcing the three
  out-of-scope dialogs into this report through the back door — the exact unattributability the
  analysis refuses. It belongs to whichever report closes the last of them. REQ-23 keeps
  `check-ui-conformance.mjs` unmodified for the separate, blur-related reason the analysis gives.
- **The siblings are guarded against a quiet re-pointing** (INT-4), by an assertion that their inner
  region measures **the same height at two viewport heights** — still pinned, still theirs. No
  constant is written into the assertion; the delivered values (480px, 360px, 320px) are named only in
  a comment, with the note that these assertions are deleted by the report that re-lays each dialog
  out. This is how "deliberately out of scope" becomes fail-able instead of being a sentence in a
  plan.
- **The fixtures.** `alpine:3.20` from the run's own registry is the counting fixture — thirteen root
  entries, already used by this suite (REQ-33). The short-dialog case (REQ-7) uses the suite's own
  single-layer `vexel-test-tiny:1`, whose extracted root is Docker's scaffolding and one file; if it
  proves not to be extractable, the criterion, not the image, is what must hold — *a filesystem whose
  content is demonstrably shorter than the cap* — and any substitute carries the ownership labels and
  is removed in a `finally`.
- **The refused-entries band is put on screen by intercepting the response, not by crafting a
  daemon fixture** — `page.route`, already used by `local-persistence.spec.ts` and
  `about-notice.spec.ts`. Producing a genuinely refused entry needs an image built to defeat the
  extraction's containment rules, which is a fixture whose only purpose is a band's presence; and what
  REQ-13's floor of 8 measures is **two more intrinsic bands taking their own height out of the
  elastic region**, which is a geometric fact about the layout, not about the daemon. Only the data is
  simulated: the geometry, the surface and the pointer are all real. The truncated-matches band needs
  no such help — a search fragment matching more entries than the listing bound produces it.
- **`clickAndExpectSurfaceUnmoved` is reused, not reimplemented** (`client/e2e/support/surface-stability.ts`).
  It was written for bug-2's tranche against exactly this failure — a surface that moves during an
  interaction, measured by its viewport box, driven by a real pointer — and REQ-11 is that failure on
  a tree row. Its `SurfaceStabilityResult` already returns the control's box before and after, which
  is what "the row you clicked is still under the pointer" asserts.
- **`bugs.md` is left untouched**, as in the two sibling plans: it is the human's own input file for a
  tranche of five reports worked one at a time. The plan folder and the commits are the record.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` and the rules in `CLAUDE.md`; the canonical commands come from `.archi`.

## Departures from the spec

**None.** Nothing in this plan contradicts the analysis. The four decisions taken beyond its literal
text — the 720px breakpoint, the response interception for the refused-entries band, the sibling
still-pinned guard, and the deliberate refusal to add a pixel-size rule to the conformance check —
are recorded above with their reasons. None of them changes what the operator can do, and none widens
the scope of what is touched.

## Coverage check

Every REQ is served by at least one INT, and **every REQ closes inside batch 1** — there is one
batch, so nothing is split across batches.

| REQ | Interventions serving it |
| --- | --- |
| REQ-1 | INT-7, INT-8, INT-12 (verified by INT-1) |
| REQ-2 | INT-8, INT-12 (verified by INT-1, INT-6) |
| REQ-3 | INT-7 (verified by INT-1) |
| REQ-4 | INT-7 (verified by INT-2) |
| REQ-5 | INT-8 (verified by INT-6) |
| REQ-6 | INT-8, INT-9, INT-10, INT-12 (verified by INT-1) |
| REQ-7 | INT-8, INT-12 (verified by INT-3) |
| REQ-8 | INT-12 (verified by INT-5, INT-1) |
| REQ-9 | INT-9, INT-12 (verified by INT-1) |
| REQ-10 | INT-9, INT-11, INT-12 (verified by INT-1, INT-5) |
| REQ-11 | INT-9, INT-12 (verified by INT-1) |
| REQ-12 | INT-9, INT-12 (verified by INT-1) |
| REQ-13 | INT-7, INT-8, INT-9, INT-10, INT-12 (verified by INT-1) |
| REQ-14 | INT-8, INT-9, INT-12 (verified by INT-1) |
| REQ-15 | INT-8, INT-9, INT-10, INT-12 (verified by INT-1) |
| REQ-16 | INT-12 (verified by INT-5, and by the delivered specs run unchanged) |
| REQ-17 | INT-12 (verified by INT-5, and by the delivered specs run unchanged) |
| REQ-18 | INT-10, INT-12 (verified by INT-1) |
| REQ-19 | INT-12 |
| REQ-20 | INT-9, INT-10, INT-13 (verified by INT-4) |
| REQ-21 | INT-8, INT-12 (verified by INT-5) |
| REQ-22 | INT-7, INT-8, INT-9, INT-10, INT-11, INT-12 |
| REQ-23 | INT-8, INT-9, INT-11, INT-12 |
| REQ-24 | INT-8, INT-12 (verified by INT-3) |
| REQ-25 | INT-8, INT-10 (verified by INT-1) |
| REQ-26 | INT-10, INT-12 (verified by INT-1, INT-5) |
| REQ-27 | INT-9, INT-10 (verified by INT-2, INT-3, INT-4) |
| REQ-28 | INT-13 |
| REQ-29 | INT-1, INT-2, INT-3, INT-4 |
| REQ-30 | INT-1, INT-5 |
| REQ-31 | INT-1, INT-2, INT-3, INT-4 |
| REQ-32 | INT-1, INT-2, INT-3 |
| REQ-33 | INT-1 |
| REQ-34 | INT-1, INT-3, INT-5 |
| REQ-35 | INT-2 |
| REQ-36 | INT-1, INT-2, INT-3, INT-4 |

**Every INT serves at least one REQ.** No enabling intervention is declared: there is none — the new
library primitive (INT-8) is not enabling work, it closes REQ-5 in its own right and is what makes
REQ-2, REQ-7 and REQ-21 true.

| INT | REQ served |
| --- | --- |
| INT-1 | REQ-1, REQ-2, REQ-3, REQ-6, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-18, REQ-25, REQ-26, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-36 |
| INT-2 | REQ-4, REQ-27, REQ-29, REQ-31, REQ-32, REQ-35, REQ-36 |
| INT-3 | REQ-7, REQ-24, REQ-27, REQ-29, REQ-31, REQ-32, REQ-34, REQ-36 |
| INT-4 | REQ-20, REQ-27, REQ-29, REQ-31, REQ-36 |
| INT-5 | REQ-8, REQ-10, REQ-16, REQ-17, REQ-21, REQ-26, REQ-30, REQ-34 |
| INT-6 | REQ-2, REQ-5 |
| INT-7 | REQ-1, REQ-3, REQ-4, REQ-13, REQ-22 |
| INT-8 | REQ-1, REQ-2, REQ-5, REQ-6, REQ-7, REQ-13, REQ-14, REQ-15, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25 |
| INT-9 | REQ-6, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-20, REQ-22, REQ-23, REQ-27 |
| INT-10 | REQ-6, REQ-13, REQ-15, REQ-18, REQ-20, REQ-22, REQ-25, REQ-26, REQ-27 |
| INT-11 | REQ-10, REQ-22, REQ-23 |
| INT-12 | REQ-1, REQ-2, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-21, REQ-22, REQ-23, REQ-24, REQ-26 |
| INT-13 | REQ-20, REQ-28 |

**Three notes on the shape of that mapping**, all deliberate:

- **Six of thirteen interventions are checks, and five of the remaining seven are library
  corrections.** One file of feature code changes. That is the correct proportion for a defect whose
  cause is a shared rule: if the diff is mostly `FilesystemBrowser.tsx`, the fix went to the symptom.
- **REQ-19 and REQ-22 are served by interventions as constraints, not as work.** They build nothing:
  they are how the diff is judged — no server file in it, and no raw markup, style, or hard-coded
  value outside `client/src/ui/`.
- **REQ-20 is the only requirement served by an intervention whose job is to leave something alone**
  (INT-4). It is stated as an intervention rather than as a note because "we deliberately did not
  touch them" is exactly the kind of claim that quietly stops being true, and the guard it adds costs
  three assertions.

## Risks carried forward

- **The void is closed at the call site.** The band is wrapped in a `Row` in `FilesystemBrowser.tsx`,
  the screenshot looks right, the logs view still passes, and the shared rule is still wrong for the
  next surface. INT-1's direct-child assertion is the only thing standing between that and a green
  suite; if it is weakened to "the gap is small", this fix reduces to a workaround.
- **The band grows instead of shrinking.** `flex: 1 1 auto` on the block axis makes the band claim
  *all* the leftover height rather than 240px of it. It is the same class of defect, worse, and a
  check that only looked for the old number would not see it — INT-1 asserts the band's height
  against the control's height, not against 240.
- **The dialog becomes permanently 85vh tall.** The natural over-correction of "one region absorbs
  the remaining height", and `dialog_sizing`'s defect reintroduced one report later. INT-3's
  short-filesystem case is what fails it; a maximum, not a height, is what prevents it.
- **The tree loses its virtualisation.** It is virtualised only while it has a definite bounded
  height, and a filling region is exactly where that guarantee is easiest to lose. INT-10 keeps the
  bound and INT-1 observes it — the mounted row count stays bounded while a 522-entry tree scrolls.
- **The second scrollbar survives.** If the body stays a scroll container the surface looks fixed at
  one viewport and is broken at 720px, and a search hit can still scroll the dialog instead of the
  tree. INT-1 scans the body's descendants for scroll containers rather than looking at one element.
- **The conditional bands are forgotten.** A budget balanced against the screenshot's four bands goes
  wrong the first time an image has a refused entry or a search truncates. REQ-13's floor of 8 exists
  for that and is checked with both bands genuinely on screen.
- **The siblings are re-pointed "while we are in there".** Three dialogs would each be a two-line
  change once the primitive exists, and every one of them would make a regression on this batch
  unattributable. INT-4 guards it; the temptation is named here so it is refused knowingly.
- **The check certifies the wrong thing.** The delivered build renders a visible tree, thirteen
  entries and a `522 entries` caption. Any assertion built on presence, text or counts passes on the
  defect — this project has shipped that mistake twice. Every geometric assertion of INT-1 must be
  reported with its measured value before and after.
