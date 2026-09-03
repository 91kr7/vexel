---
batch: 5
feature: The card-per-row presentation leaves the library's public interface, and a command the developer already runs refuses to let it back
closed_req: [REQ-1, REQ-5, REQ-22, REQ-23, REQ-24, REQ-28, REQ-31, REQ-33, REQ-34, REQ-35]
depends: [1, 2, 3, 4]
---

# Batch 5 — The retirement, and the guard that keeps it

Requirements: [`../requirements.md`](../requirements.md). Ids are local to this plan.

**What this batch is for.** By now no call site states the retired presentation, so it can leave the
public interface without breaking the build — and until it does, the decision is exactly as durable
as it was on 2026-08-15, when it was written down, committed, and then quietly migrated onto by the
next batch of work. **This batch is the difference between the second statement of that decision and
the last one.** It is accepted on a demonstration of the guard failing, not on a diff.

**The order matters and is not negotiable**: the removal (`INT-1`, `INT-2`) before the guard
(`INT-3`, `INT-4`), because a guard written against code that still exists cannot be observed
refusing it, and the coverage disposition (`INT-5` … `INT-8`) last, because what survives is only
knowable once the removal is complete.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/data/DataTable.tsx` (the `DataTableVariant` type at :67-:84, the `variant` prop at :123-:129 and :192, `ComfortableRowCarrier` at :158-:165, the `comfortable` flag at :261, the class at :295, the carrier at :348, and the two doc comments that argue from the variant at :16-:37 and :104-:111), and `client/src/ui/index.ts` (:96, the type's re-export) | Remove the choice from the component's public interface and every code path behind it. What stays is one presentation, content-sized rows where a caller asks for them, the ungated row-content slot, the expansion and the pan. The component must end up **smaller**, not with a flag renamed. | REQ-1, REQ-22, REQ-35 | — |
| INT-2 | modify | `client/src/ui/data/data-table.css` (:90-:141 — the body gap at :96-:100, the row's own padding at :105-:109, **the header inset at :122-:124**, the expansion rule at :137-:141 — and the row-content inset `b1/INT-2` scoped) | Delete the retired presentation's rules, the header-inset compensation first: it exists only to re-align a header with rows no longer in the same grid box as it, and REQ-5 names the existence of such a compensation as the defect's own signature. **It is also why a left-edge assertion reads green on the rejected build** — the finding that forced the amendment to REQ-18 — so deleting it is what finally makes the alignment structural rather than compensated, and any check still asserting alignment alone should be read in that light. The row-content inset stops being scoped and is simply the ruled row's. No rule is left behind unreferenced — a rule whose class nothing emits leaves the product one `className` away from drawing the arrangement again. | REQ-1, REQ-5, REQ-22, REQ-35 | INT-1 |
| INT-3 | modify | `client/scripts/check-ui-conformance.mjs` | Add a **third, independent pass** beside the boundary pass and the blur pass, over the collector they already share, which fails on a reintroduction of the card row in either of its two forms: the library offering a per-row surface again (the retired names and classes, a row rule carrying a `border-radius`, an `outline` or a `box-shadow`, a `gap` on a list body), and a feature file building a list by drawing its own row surfaces. It **names the file, the line and what is wrong** — a bare non-zero exit teaches the next developer nothing — and it names the decision and points at the record that made it. It **does not read, share or restructure the blur half's state**: `blurAllowedOverlaySelectors` and its token binding are untouched. The test fixture directory the other checks skip (`__conformance-fixture__`) is skipped here too. | REQ-1, REQ-23, REQ-24, REQ-33, REQ-34 | INT-1, INT-2 |
| INT-4 | modify | `client/test/unit/ui-conformance-check.test.ts` | Cover the new half the way the file already covers the others, using its own fixture directory: the check is **red on a deliberate reintroduction of each of the two forms** and green on the tree as delivered. This is the intervention that turns REQ-23 from a claim into a demonstration, and its output is what the human is shown at acceptance. An exception comment must not be able to satisfy it at the call site that violates it (REQ-24). | REQ-23, REQ-24, REQ-33 | INT-3 |
| INT-5 | modify | `client/test/unit/programme-constraints.test.ts` (:102-:149) | **Restate the certified guard that `INT-3` breaks, and come out stronger on the half it exists to protect.** It is three assertions today: whole-file byte-identity against `4509b96` (:105), the allow-list literal identical at **every** revision that touched the file (:114), and a hunk-content rule (:130). A third pass fails the first and the third. The requirement behind it names the **blur half**, and whole-file identity was a proxy for that — a proxy that forbids the file from ever growing for any reason, which is stricter than the thing it stands for and is what is being retired. **What replaces it must guard the named half more closely than before, not equally**: the per-revision assertion covers the allow-list literal **and the blur pass's own source** — `blurExceptionMarker`, `blurTokenReference`, `blurDeclarationValue`, `ruleTargetsAllowedOverlay`, `blurValueIsTokenBound`, `checkBlurPolicy` — **byte-identical at every revision that has touched the file, this plan's own revisions included**. Today those five functions are protected only by the whole-file identity being removed here; afterwards they are protected by name. The hunk rule widens to admit **this plan's half by name**, alongside the terms already there and nothing else; a hunk mentioning neither still fails. **And the same edit re-pins a premise that has silently gone unsatisfiable** (found by batch 3's run): the per-revision assertion (:118) requires `git log 4509b96..HEAD -- client/scripts/check-ui-conformance.mjs` to be non-empty, and **it is empty on this branch and on `main`** — the file's last commit predates the pinned base, most likely a rebase — so the test fails on its **premise** rather than on its claim, and has been doing so unnoticed because no full unit run has happened since. Re-pin the base to a revision the history actually supports, and make the restated form **fail loudly when it has nothing to check** rather than assert emptily: a guard whose premise can go empty is indistinguishable from a guard that passes, which is the defect worth naming here. This plan's own revisions are inside the re-pinned range, so the blur half is guarded across them too. **The reasoning goes into the test itself**, at the assertion, in the form its current comments already use — a future reader must find why the proxy changed shape, and why the base moved, where the assertion is rather than only in a plan file — citing the reference plan's REQ-84 beside this plan's REQ-34. Anything less than the above is the weakening REQ-28 forbids, whatever the intent, and is a refusal of this batch. | REQ-28, REQ-34 | INT-3 |
| INT-6 | create | client unit test tree, the UI library area | **The retirement's closing statement**, in the shape this repository already uses for the previously retired list component: no source file of the client — `src` and `scripts` — names the retired presentation, its prop value, its type or its classes; the library's public entry point exports nothing named after it; no stylesheet of the library carries its rules. A check naming it precisely in order to assert its absence is the product's tree, not the checks'. | REQ-1, REQ-22, REQ-23, REQ-28, REQ-31 | INT-1, INT-2 |
| INT-7 | modify | `client/test/unit/data-table-comfortable-variant.test.tsx`, `client/test/unit/library-layer-adoption-perimeter.test.ts` (:82-:97, :183-:188), `client/test/unit/data-table.test.tsx` | Dispose of the coverage that named the presentation, assertion by assertion, and record the disposition. **Removed with the thing it covered**: the tracks resolving identically in both variants, the card each row was drawn on, the cursor it did not have, the expansion living inside that card. **Restated against the one presentation, in the object list's own unit file**: the same cells in the same order, the empty state instead of rows, one expansion per list, and a content-sized list mounting every row while `maxHeight` still scrolls it — behaviours that survive the presentation and would otherwise lose their only coverage. The perimeter's pin over the retired prop goes **with the prop**, not left asserting an empty list; its other pins stay. | REQ-22, REQ-28, REQ-31 | INT-1, INT-2 |
| INT-8 | modify | `client/e2e/closing-invariants.spec.ts`, `client/e2e/table-row-layout-uniform.spec.ts` | The closing e2e claims. In the invariants spec, which already counts one object list per screen for the reference plan's REQ-81, add that there is now **one presentation** as well as one primitive. In the uniform-row spec, retire what is left of the "comfortable subjects against a dense control" framing — after batch 4 there is no control to measure against, because every list is the control — keeping every measurement it makes. And assert this plan's performance claim while a long list is scrolled: no scrolled surface carries a filter, a transition or an animation it did not have, and the layers painted per row did not grow. | REQ-1, REQ-28, REQ-35 | INT-1, INT-2 |
| INT-10 | modify | `client/test/unit/library-layer-adoption-perimeter.test.ts` | **The half of the reference equality that can be guarded mechanically, and only that half** (added by the 2026-08-16 amendment; REQ-39). Pin, in the perimeter test's own shape, the exact list of feature files allowed to state **content-sized rows** on an object list, with the reason recorded per entry. It cannot be a blanket ban: `CoverageMatrixScreen.tsx:166` states the prop legitimately, for the wrapping-text case the library documents. The pin fails both when a list acquires the prop and when it is not widened in the same commit — which is what stops a converted list quietly buying itself a taller row again. **It goes in the unit tree, not in the conformance script**: that script's new half is about a surface being drawn, and stretching it to carry a prop-perimeter would mix two unrelated concerns in the file this plan has just had to fight to extend at all. **The surface half of the equality gets no mechanical guard**, deliberately: asserting that every list's nearest ancestor surface is an unpadded card holding nothing else is an AST question across files, defeated by a list rendered through a helper or composed in a parent, and a static check that silently passes on a screen it could not read is the failure this plan exists to close, in a new place. That half is geometry and stays in `b4/INT-4`, in the browser. | REQ-23, REQ-39 | INT-1 |
| INT-9 | modify | `.sdd/modules/ui-library/specs/data-table.md` (14 statements, including the variant's own section, the two-variant argument, the header-inset paragraph and the "Depends on" line naming the card's carrier), `.sdd/modules/ui-library/index.md` (:71), `.sdd/modules/ui-library/specs/ui-conformance-check.md` | Record the one presentation in the library's own spec — the component's props, what the row-content slot is now unconditional on, how a nested list is drawn, and the column contract stated **structurally** rather than through a compensation — and record the conformance check's new half beside its two existing ones. Corrected, not annotated: this is what the next implementer reads as current. | REQ-27 | INT-1, INT-2, INT-3 |

## Constraints on this batch's diff

- **The blur half is untouchable** (REQ-34). The allow-list, its token binding and the blur pass's own
  logic are not read by the new half, not shared with it and not restructured for it; the background
  asset is not touched; no `backdrop-filter` or `filter: blur(...)` is added, moved or removed
  anywhere. An edit to any of that is a signal that something has gone wrong, to be reported rather
  than made.
- **No new component, no near-duplicate, no compatibility wrapper** for the screens that used to have
  cards (REQ-1). The outcome is one component with one presentation and a smaller public interface
  than it had.
- **Nothing on a scrolled surface gains a filter, a transition or an animation**, and the change must
  reduce the layers painted on a long list rather than increase them (REQ-35).
- **No feature file changes in this batch at all.** If one has to, a conversion batch missed
  something — report it rather than fold it in here.
- Containers and images are the reference presentation and must be untouched (REQ-13's spirit, and
  the analysis's scope).
- No server file (REQ-37). English only; kebab-case for any new file (REQ-38).

## Departure recorded 2026-08-17 — two feature files changed, against this batch's own constraint

**The constraint above reads "no feature file changes in this batch at all", and two feature files
were changed**: `client/src/volumes-networks/VolumesPanel.tsx:126` and
`NetworksPanel.tsx:118`. Both changes are **comment-only** — a doc comment on each panel that
described its list as *"listed with the object list's comfortable variant"*, now *"listed in the
object list"*. No statement, no prop, no markup and no style moved; the compiled output is identical.

**Who decided, when, and why.** The human's delegate authorised it at this batch's dispatch, on
2026-08-16, under the human's standing delegation — not taken by the developer on the spot. Batch 4's
developer had found the two comments and deliberately left them, the constraint being what it is.
The judgement that put them here: the prose names the very thing this batch **deletes**, so leaving
two feature files explaining a variant no longer in the library would be this plan's own record
problem one altitude lower — the failure the whole plan exists to close, on the screens the plan
opened with. The constraint's purpose is served either way: it exists so that a conversion batch's
omission is reported rather than folded in, and nothing was converted here.

**The interventions above are not edited**, and this note is not an amendment of them: it records a
departure from a constraint, at the date it was taken, with the authority that took it.

## Verification for this batch — targeted, never the full suite

- `npm run lint -w client` (which runs the conformance script, new half included) and
  `npm run test:typecheck -w client`.
- `npm run test:unit -w client -- test/unit/ui-conformance-check.test.ts test/unit/programme-constraints.test.ts test/unit/blur-policy.test.ts test/unit/data-table.test.tsx test/unit/data-table-column-minimums.test.tsx test/unit/data-table-column-width-refusal.test.tsx test/unit/library-layer-adoption-perimeter.test.ts`
  plus the new closing-statement file. The perimeter run covers `INT-10`'s pin as well as the
  retired prop's removal.
- The e2e specs this batch changed, **each also run on its own**: `closing-invariants.spec.ts`,
  `table-row-layout-uniform.spec.ts`, and the criteria check and sweep from batches 1 and 4 — those
  two are the proof that removing the code changed nothing on screen.
- **The demonstration, recorded**: the guard observed failing on a deliberate reintroduction of each
  of the two forms, with the message it printed, and green afterwards. Without that output this batch
  is not accepted.
- The complete client unit run and the complete e2e run are the programme's closing step, after
  batch 6.

## What is reported back

The guard's two failure messages verbatim. The list of every assertion disposed of in `INT-7`, each
marked *restated* or *removed with what it covered*, so that "the coverage was corrected" is a table
rather than a claim. The restated conformance-script guard from `INT-5` quoted in full — the human
reads its new wording and satisfies himself that the blur half is guarded **more** closely than
before, by name rather than by proxy — **and, stated plainly, which of the two the re-pinned premise
now is**: how many revisions the assertion actually walks, and what the guard does when that number
is zero. "It passes" is the answer that is not acceptable. And confirmation, measured, that containers and images are
unchanged.
