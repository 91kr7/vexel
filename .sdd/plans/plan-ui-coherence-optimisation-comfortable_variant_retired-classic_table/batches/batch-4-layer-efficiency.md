---
batch: 4
feature: The last three call sites — the efficiency & signals dialog's three lists — become classic tables, and the claim goes product-wide
closed_req: [REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-21, REQ-29, REQ-30, REQ-32, REQ-36, REQ-39, REQ-40]
depends: [1, 2, 3]
---

# Batch 4 — Layer efficiency, and the product-wide sweep

Requirements: [`../requirements.md`](../requirements.md). Ids are local to this plan.

**What this batch is for.** Three call sites in one file — `LayerEfficiencyView.tsx:198`, `:220`,
`:243` — and the screen that has been nearly lost twice: excluded from the 2026-08-15 analysis
because its lists were still on the older list component, then migrated onto the presentation that
had been condemned in writing the previous day. It has a batch of its own so that no plan phrased as
"the screens the programme migrated" can exclude it a third time.

**Its slot is the other one.** These three lists carry **no** content below their cells: they carry
per-row **expansions** (`renderExpanded` at `:208`, `:227`, `:253`) — ungated, and shared with twelve
other lists including containers and images. The analysis's own enumeration is wrong on this point
and is corrected in this plan's `batches.md` under *Departures*. So the thing to protect here is not
a chip but the `View layer n` route out of each finding.

**And they live inside a dialog**, which no other converted list does. The efficiency view is a
`size="large"` modal that scrolls its own body; a list that pans horizontally inside a surface that
scrolls vertically is the one arrangement in this plan that can swallow the pan.

**It also carries the one spec no conversion batch could settle** (`INT-6`, added 2026-08-16). Batch
1's tester found `client/e2e/library-layer-screens-unmoved.spec.ts` red for a reason no locator repair
fixes: it asserts what the **previous** programme delivered on the volumes/networks and registries
panels, and REQ-40 changes what it delivered. It belongs here rather than in batch 1 or 3 — its
subjects are screens this plan converts across four batches, so restating it earlier means restating
it three times against a state still moving — and **not** in batch 6, whose one structural property is
that it touches no file any test reads, which is exactly what makes its two complete runs trustworthy
as this plan's closing evidence. Spending that property to save a schedule slot would be a poor trade.

**This batch closes the product-wide claims — both of them.** After it, no list anywhere draws a row
on a card **and every converted list is the same table containers and images are** (REQ-39, REQ-40,
added 2026-08-16 after batch 1 met every geometric criterion and was still rejected on sight). Both
are asserted as a sweep rather than inferred from four batches having passed. These three lists
therefore take the reference's row — no modifier, no content-sized rows — and sit edge to edge in an
unpadded surface holding the table and nothing else, inside the dialog.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/images/LayerEfficiencyView.tsx` (:198 wasted files, :220 duplicated content, :243 flagged paths, and the surfaces the three lists sit in) | Stop asking for the card presentation on all three lists and **make each one the containers table**: no row modifier, no content-sized rows, the reference's row height and alignment, and each table edge to edge in an unpadded surface holding it and nothing else, its section header above that surface — the composition of `ContainersScreen.tsx:399`, applied inside the dialog. **Every finding still navigates to its layer**: the wasted-file row's `View layer n`, the duplicate group's one button per path, the flagged path's introducing layer. The heuristic disclaimer, the three metric tiles, the empty states, the analysis warning dialog and the progress dialog are unchanged. | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-21, REQ-33, REQ-39, REQ-40 | — |
| INT-2 | modify | `client/test/unit/library-layer-adoption-perimeter.test.ts` (:82-:97, :183-:188) | Narrow the pin by the last file. The list of files allowed to state the retired presentation is now **empty** — and it is left asserting empty **only until batch 5**, which removes the expectation together with the prop it pinned, exactly as the same programme retired the previous list component's call-site budget. Any unit coverage of this view is restated in the same commit, contract and state only. | REQ-13, REQ-21, REQ-28, REQ-31 | INT-1 |
| INT-3 | modify | the criteria check created by `b1/INT-8`, in the client e2e tree | Extend it to the three lists, driven with a real pointer, at 1440×1000, 1280×800 and 375×812: the four criteria on each list; the **equality with the reference** — row height, alignment, modifier set, and the table edge to edge in its own surface, read against containers and images in the same run; **the expansion asserted as this screen's own slot** — clicking a finding opens its panel directly under its row inside the dialog, a second click on another row closes the first, and the button still navigates to the layer it names; and **the dialog case** — at 1280×800 and 375×812 the lists pan inside the dialog, nothing is clipped by the dialog's own edge, and no column resolves to zero. Delivered figures recorded failing first. | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-21, REQ-29, REQ-30, REQ-32, REQ-36 | INT-1 |
| INT-4 | create | client e2e tree, the object-list geometry area | **The sweep that makes both claims product-wide**: over every screen that had cards — volumes, networks, registries, builders & cache, contexts, plugins, compose, the four swarm panels and this dialog — assert that **no** list anywhere draws a row on a surface of its own, that every list has one enclosing boundary with its header inside it, that no two adjacent rows have a gap between them, **and that every one of those lists is the reference list**: its row's height, `align-items` and modifier set equal to a containers/images row's, and its table's left and right edges within 1px of its own surface's. **The reference side is read from containers and images in the same run**, never from a figure written into the check — if the reference legitimately changes, the sweep still asserts equality rather than an obsolete number. Written as a walk over the screens rather than as a list of hard-coded cases, so a screen added later is covered by it. Containers and images are included as the reference, and asserting they are unchanged is part of it. | REQ-2, REQ-3, REQ-4, REQ-5, REQ-28, REQ-30, REQ-32, REQ-39, REQ-40 | INT-1 |
| INT-5 | modify | `.sdd/modules/images/specs/layer-efficiency-view.md`, `.sdd/modules/images/index.md` | Record the one presentation for the three lists and that what each row carries is an expansion, not row content. Corrected, not annotated. | REQ-27 | INT-1 |
| INT-6 | modify | `client/e2e/library-layer-screens-unmoved.spec.ts` | **The one spec this plan supersedes rather than relocates**, restated **once, here, against the finished product**. It measures the volumes/networks and registries panels against the **previous** programme's delivered build, reaching them through `.ui-section-header__title → closest('.ui-surface')`; REQ-40 moves the section header out of the card, so that `closest` resolves to `null` and the spec is red from batch 1 onwards. It is **not a locator repair**: its declared per-screen delta — *"the pair of half-width cards became one stacked full-width column"* — is a claim about what the previous plan delivered, and this plan changes what it delivered, so what the spec should now claim is a judgement about the record. **Treatment, and it is the distinction this plan already draws for the reference plan's artefacts**: the **assertions** are normative — they govern what a later reader believes is true of these screens today — so they are **re-expressed against the composition REQ-40 mandates**, each carrying its date and its reason, and the spec keeps asserting that these screens did not move except where this plan moved them. The **recorded before/after figures of the previous programme** are historical — they were measured against a build that no longer exists — so they are **annotated, not overwritten**: the reading stays, with a note saying which plan superseded it and when. Any assertion whose subject this plan genuinely removes goes **with the claim it covered**, named in the report. Nothing is weakened into passing, and nothing is deleted for being red. | REQ-28, REQ-40 | INT-1 |

## Constraints on this batch's diff

- One feature file changes, by ceasing to ask for a presentation and by stating what the one
  presentation needs. No raw tag, stylesheet, `className`, `style` prop or hard-coded visual value
  (REQ-33); nothing in `client/src/ui/` changes.
- `check-ui-conformance.mjs` is not touched (REQ-34).
- No column, value, wording, order, action or empty state changes on this screen (REQ-13). The three
  lists' columns are as delivered.
- **None of the three states content-sized rows** (REQ-39), and their surfaces reuse the reference's
  unpadded-card composition rather than inventing one for the dialog (REQ-40). If the dialog's own
  padding genuinely prevents the edge-to-edge arrangement, that is reported with the measurement —
  it is the one place in the plan where the reference composition meets a surface it was not written
  for, and it is a decision to be taken in the open rather than worked around locally.
- The retired presentation is **still not deleted** — that is batch 5, and doing it here would put a
  public-API removal in a screen batch where a regression on it would be unattributable.
- No server file, and no change to the analysis the view reads (REQ-37). English only (REQ-38).

## Verification for this batch — targeted, never the full suite

- `npm run lint -w client` and `npm run test:typecheck -w client`.
- `npm run test:unit -w client -- test/unit/library-layer-adoption-perimeter.test.ts` plus any unit
  file this batch restated.
- The e2e specs this batch changed or added, **each also run on its own**: the criteria check, the
  new sweep, and `library-layer-screens-unmoved.spec.ts` (`INT-6`) — which has been red since batch 1
  by design and is green from here.
- **The locator class batch 1 uncovered is enumerated for on this screen too**: a spec reaching a
  panel through its heading, or otherwise assuming the table and its header share one surface, breaks
  on REQ-40 without ever naming the presentation. Grep for the locator shape as well as for the name.
- Test discipline (REQ-32): the efficiency analysis runs against an image the suite owns and labels —
  the mirrored multi-layer image the layer analyses already use, never a pull from Docker Hub — with
  the run's own data directory, so the analysis cache does not hand the check a result some earlier
  test produced. Cleanup in a `finally`; every spec passes on its own.
- The complete client unit run and the complete e2e run are the programme's closing step, after
  batch 6 — not this batch's, however tempting it is now that every screen is converted.

## What is reported back

The three lists' figures at the three viewports before and after, including the pan measured **inside
the dialog**; the expansion opened and closed with a real pointer at each of the three lists; and the
sweep's own output — every screen walked, every list found, the count of rows drawn on a surface of
their own (which must be zero), and **per list, its row height, alignment, modifier set and table
edges beside the reference's own, read in the same run**. That last table is what closes REQ-39 and
REQ-40, and it is the answer, in numbers, to the question that rejected batch 1: *is this the
containers table?*

And, separately, `INT-6`'s disposition of `library-layer-screens-unmoved.spec.ts`: each assertion
marked **re-expressed** (with its date and reason), **annotated** (the previous programme's own
readings, kept legible) or **removed with the claim it covered** — so that "the superseded spec was
restated" is a table rather than a claim, exactly as batch 5 reports its own coverage disposition.
