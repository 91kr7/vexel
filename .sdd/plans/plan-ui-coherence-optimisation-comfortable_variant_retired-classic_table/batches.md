---
slug: ui-coherence-optimisation-comfortable_variant_retired-classic_table
date: 2026-08-16
spec: .sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md
requirements: .sdd/plans/plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/requirements.md
status: validated
---

# Batches — Every object list is one classic table

**Six batches, split by the kind of risk a list carries, never by layer.** Four convert the 21 call
sites — grouped by what a row holds, because that is what can be silently lost — one removes the
presentation from the library and installs the guard that keeps it removed, and one brings the
written record into line with the product. Batch numbers and `REQ-n`/`INT-n` ids are local to this
plan.

> **Amendment, 2026-08-16 — equality with the reference lists.** Batch 1 was implemented and the
> human rejected the result on sight: *"can't you use the same tables as images and containers?"*
> The four geometric criteria were met and measured (gap 0, radius 0, one hairline, column drift
> 0.00px) and the lists were still not the containers table, because the plan specified the target
> **by its properties instead of by its reference**. Two things the criteria never named had drifted:
> the row (`--auto-height`, 61.2px, `align-items: start`, against the reference's unmodified 56px
> `center` row — whose own two-line cell measures 36.2px and does not need the room) and the surface
> (a padded card holding the table beside its header, against the reference's **unpadded card
> holding the table and nothing else**, edge to edge). **REQ-39 and REQ-40** are added for it,
> stated as measurements against the reference lists *as they stand in the tree*; REQ-4 keeps its
> text and gains a pointer to REQ-40. Every conversion batch below carries the equality in its own
> interventions and its own acceptance, and batch 4's sweep asserts it across every converted list —
> **which is the point of catching it now: batches 2, 3 and 4 have not started and are born with the
> reference as the target rather than converted twice.** Batch 1's own fix is with its developer.
> Recorded here, and in `requirements.md` under *Amendment*, rather than folded in silently.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · volumes-networks-registries | F3 — the two-line lists that carry content below their cells: volumes, networks, registries. Carries the two library changes their rows need | REQ-14, REQ-15 | — | certified | **The report itself, with the mouse, at 1440×1000.** Volumes & networks → the volumes list is **one table**: rows touching, no gap between them, no rounded corner on any row, a hairline between each pair, one header row on top of a continuous run of rows. **The row that caused this report**: a volume's name over its **mount path**, and *both lines are there* — read the path, do not take its presence on trust. Then the networks panel beside it: same table, and **the attached-container chips are still under their row, with their detach still on them** — click one and it still detaches. That content is drawn by a slot that was switched on by the presentation being retired; if the chips are gone the batch is refused, and nothing else needs checking. Then Registries: both lists are tables, the repository rows still carry their per-repository content, and `Log in`/`Log out` are still the row actions they were. **Then the two sizes that break it**: at 1280×800 nothing clips; at **375×812** the lists **pan sideways** — drag them — and every column can be reached, none collapsed to nothing. The rows no longer grow at phone width; that is the point, not a regression. **Then the comparison this batch failed the first time, and it is the acceptance now**: put Containers in one window and Volumes in the other. A row of one is the **same height** as a row of the other, aligned the same way, carrying the same modifiers — the two-line name does **not** buy a taller row, because containers' own two-line cell does not need one. And each table runs **edge to edge in its own card**, its header band cropped by the card's corners, not inset with glass either side. If you can tell the two arrangements apart, the batch is refused however well the geometry reads. **Then the diff**: the three files state no presentation and no style; the row-content slot in the library is no longer conditional on anything; `check-ui-conformance.mjs` untouched. **Then the evidence**: the geometry check ran against the delivered build **before** the conversion existed and is on record failing, with the numbers — the measured inter-row gap and the row's corner radius on the volumes list — beside the same numbers after. |
| 2 · plain-lists | F3 — the lists that carry nothing below their cells: contexts, plugins, builders & build cache, swarm nodes, services and secrets | REQ-16, REQ-17, REQ-18 | 1 | certified | **The case the first analysis measured, first.** Plugins → the **CLI plugins** list at 1440×1000: put a finger on the `WHY UNAVAILABLE` header and run it down the column — the `–` beneath it is **in that column**, and the run from the label to it is crossed by **no card edge, no gap and no rounded corner**. *(Corrected 2026-08-16, after this batch was certified: this cell first said "its left edge equal to the header's, not roughly 1100px adrift". The left edge is **0px on the rejected build too** — the retired presentation compensated for exactly that column — so it certifies nothing on its own. The 1037px the human was objecting to is the column's **run**, crossed by 15 surfaces and 14 gaps; see the amendment to REQ-18. The batch's coverage asserts both halves, so nothing was left unverified.)* The check asserts the boxes; the eye confirms it. Then the managed-plugin list beside it, then Contexts, then Builders & cache (both lists), then Swarm (nodes, services — both lists — and secrets, on the stubbed cluster the suite drives): **each one a single table**, rows flush, no card, one header. **Then what must not have moved on any of them**: every column, every value, the same order, the same row actions with the same weights; expanding a row still opens its panel under it and only one at a time; sorting and keyboard traversal as delivered. **Then 1280×800 and 375×812** on each: nothing clipped, every list pans, no column at zero. **Then the comparison, on every one of them**: beside Containers, a row is the same height and the same alignment, no list has bought itself a taller row, and each table runs **edge to edge in its own unpadded card** with its header band cropped by the card's corners. Four screen areas, checked one at a time, not "all fine". **Then the diff**: six feature files lighter by one prop each and nothing else; no raw tag, no class, no style, no length anywhere in them. **Then the evidence**: the Plugins measurement on record before and after, in px. |
| 3 · nested-lists | F2/F3 — the lists inside a row of another list: compose projects with their services, swarm configs & stacks with their stacks | REQ-6, REQ-7, REQ-19, REQ-20 | 1, 2 | certified | **The regression this batch exists to not ship, first.** Compose → a project row still carries its **services underneath it**, every one of them, opened or not. Count them against the delivered build. Swarm → a stack row still carries **its own services** the same way. If either list is shorter than it was, nothing else matters. **Then the thing that is easy to get wrong**: the services under a project must still read as *belonging to that project* — they are **indented** inside the same table, under their parent's row, with a hairline between them like any other row. They must **not** be on a card, and they must **not** read as more rows of the projects list. Stand back from the screen: you should still see two levels. **Then the parent's own row**: expanding a project still opens its detail panel below it, its tabs still work, and one panel at a time. **Then the three viewports**, the nested list included — at 375×812 the nested list pans with its parent and nothing collapses. **Then the comparison**: beside Containers, a **parent** row is the same height and alignment as a reference row, and the compose and stacks tables run edge to edge in their own unpadded cards. The **child** rows are the ones allowed to differ, and only by their indentation — not by height, not by alignment, not by a surface. **Then the diff**: two feature files, and whatever indentation was needed is a rule inside the library, expressed once, with no length written at a call site. |
| 4 · layer-efficiency | F3/F8 — images, the efficiency & signals dialog's three lists; the screen the last two analyses each nearly missed; and the product-wide sweep, equality with the reference included | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-21, REQ-29, REQ-30, REQ-32, REQ-36, REQ-39, REQ-40 | 1, 2, 3 | todo | **The screen that was excluded once and mis-migrated the next day.** Images & layers → an image → `Efficiency & signals…` → analyse → three lists: deleted-later/overwritten files, duplicated content, flagged paths. **Each is a table** inside the dialog — rows flush, no cards, one header each. **Then the slot that is theirs**: click a wasted-file row — `View layer n` still opens **under that row**, inside the dialog, and clicking another row closes the first. Duplicated content still lists every path with its own layer button; a flagged path still navigates to its introducing layer. **Then the dialog itself**: it is `size="large"` and it scrolls — at 1280×800 and at 375×812 the three lists **pan inside it** and nothing is clipped by the dialog's own edge, which is the one thing this screen can break that no other can. **Then the spec that has been red since batch 1 on purpose** (`INT-6`): `library-layer-screens-unmoved.spec.ts` measures these screens against what the *previous* programme delivered, and this plan changed what it delivered. Read what it now claims: the assertions re-expressed against the composition, dated and reasoned; the previous programme's own before/after readings **annotated and still legible**, not overwritten; anything genuinely removed named as removed with the claim it covered. If it went green by being weakened, the batch is refused. **Then the sweep this batch closes**: with these three converted, walk **every** screen that had cards — volumes, networks, registries, contexts, plugins, builders, compose, the four swarm panels — and confirm two things of each, not one: no list anywhere still draws a row on a card of its own, **and every one of them is the same table containers and images are** — the same row height, the same alignment, the same modifiers, and the table edge to edge in its own unpadded card. The equality is measured **against those two lists as they stand**, so it stays true if the reference ever legitimately changes. The check counts it; you are confirming the check looked everywhere. **Then the evidence for all four conversion batches together**: the delivered figures on record, failing, with numbers. |
| 5 · retirement-and-guard | F1/F4 — the presentation leaves the library's public interface, and a command the developer already runs refuses to let it back | REQ-1, REQ-5, REQ-22, REQ-23, REQ-24, REQ-28, REQ-31, REQ-33, REQ-34, REQ-35 | 1, 2, 3, 4 | todo | **This is the batch that makes the decision outlive the memory of it, so it is accepted on a demonstration, not on a diff.** Ask the implementer to **put the presentation back** — first by handing the object list the retired prop, then by giving a list's rows a card in a feature file — and to show you `npm run lint` **failing on each**, naming the file, the line and what is wrong. Then the same command green on the tree as delivered. A guard nobody has watched fail is not a guard. **Then the removal**: `grep` the client for the retired variant's name and its classes and find **nothing** — not in `src`, not in `scripts`, not in the tests except where a check names it precisely in order to assert its absence. The carrier surface, the body gap, the row padding, the expansion rule and — the one that matters most — **the header-inset compensation** are gone from the stylesheet, deleted rather than left unreferenced. **Then what must not have been quietly bought with it**: `blurAllowedOverlaySelectors` is byte-identical to what it has always been, no blur value moved, the background untouched. The conformance script gained a **separate** half and its blur half was not restructured to accommodate it. **Then the coverage**: the unit file dedicated to the retired presentation is **gone with what it covered**, and everything in it that covered behaviour which survives — the row-content slot, content-sized rows, the expansion — has been **restated** against the one presentation, not deleted for convenience. The certified guard that asserted the conformance script was never edited is **restated to protect the blur half specifically**, not weakened; read its new wording and satisfy yourself it still refuses a stray edit. **Then the one piece of the reference equality that could be guarded mechanically** (`INT-10`): the list of feature files allowed to ask for content-sized rows is pinned with a reason per entry, so no converted list can quietly buy itself a taller row again. Ask why the surface half is *not* guarded there — the answer must be that it is geometry and lives in batch 4's sweep, not that it was forgotten. **Then the two panels that were the reference all along**: containers and images look **exactly as they did** — this batch must not have touched them. |
| 6 · record-amendment | F5 — the written record stops mandating what the product no longer has | REQ-25, REQ-26, REQ-27, REQ-37, REQ-38 | 5 | todo | **Read the record as a stranger would.** Open `plan-ui-coherence-optimisation/requirements.md` at REQ-22: it must no longer require two variants, and it must say **when it was amended, why, and where the decision is written**. Same for REQ-29's coverage clause and REQ-81's parenthesis, and for the two passages of that plan's `batches.md` that name the retired presentation as the destination of the migrations. **Then the part that must *not* have been rewritten**: the certified batch files (5, 6–12, 13) still read exactly as they were delivered, each carrying **one dated note** saying the presentation they adopted was retired afterwards and pointing here. If an intervention's text has been edited to agree with today, the batch is refused — that destroys the record of what was actually built. **Then the specs a future implementer will actually read**: `.sdd/modules/ui-library/specs/data-table.md` describes **one** presentation, and no screen or panel spec anywhere under `.sdd/modules/` still describes a card row, a choice of surface or a slot available "in one variant only". Grep the whole of `.sdd/modules/` for the retired name and get nothing. **Then the closing step of the programme**: the complete client unit run and the complete e2e run, once, in full — the **only** place in this plan a full suite runs, and the last thing that happens. This batch touches no file any test reads, so it cannot change their outcome; it is **not certified until both are green**. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases. On green tests a batch goes to `certified`.

Batch files:
[`batches/batch-1-volumes-networks-registries.md`](batches/batch-1-volumes-networks-registries.md),
[`batches/batch-2-plain-lists.md`](batches/batch-2-plain-lists.md),
[`batches/batch-3-nested-lists.md`](batches/batch-3-nested-lists.md),
[`batches/batch-4-layer-efficiency.md`](batches/batch-4-layer-efficiency.md),
[`batches/batch-5-retirement-and-guard.md`](batches/batch-5-retirement-and-guard.md),
[`batches/batch-6-record-amendment.md`](batches/batch-6-record-amendment.md).

## Why these six, and why not others

**The split is by what a row holds, because that is what this change can silently destroy.** The
analysis names it as the most likely regression and the least visible one: the slot that draws
content below a row's cells is switched on by the presentation being retired
(`DataTable.tsx:382` — `comfortable && renderRowContent`), while the expansion declared on the next
line is not. Convert a list without ungating that slot first and nothing errors, no type changes,
the list keeps every row — the rows merely become shorter. So the batches are grouped by which slot
a list uses: **content below the cells** (batch 1 and batch 3), **a nested list in that slot**
(batch 3), **an expansion only** (batch 4), **neither** (batch 2). A batch's acceptance is then a
statement about a specific thing that could have gone missing, rather than "the screens look right".

**Batch 1 is volumes, networks *and* registries, which departs from grouping the plain lists
together, and here is the reason.** Volumes and networks are the two panels of **one screen**:
splitting them would leave that screen drawn two ways at a batch boundary, side by side, and would
make two shared e2e specs (`copy-affordance-absence.spec.ts`, `table-row-layout-uniform.spec.ts`)
restate half their subjects in one batch and half in another. Registries joins them because it is
the third of the three lists the analysis names as putting a title over a monospace subtitle, and
the second of the four that carry content below their cells: same risk, same two library changes,
one acceptance. And volumes is the list the human actually rejected, which belongs in the first
batch rather than the second.

**Batch 2 is deliberately the largest in call sites and the smallest in risk** — nine sites across
six files, none of them carrying anything below its cells. Its verification is one assertion
repeated across four screen areas, plus the one measurement that is not repeated: the Plugins
`WHY UNAVAILABLE` case, which is the reference analysis's own evidence and the closest thing this
work has to a named defect.

**Batch 5 cannot be merged into the conversions, and no conversion may anticipate it.** The prop
cannot leave the public interface until the last call site has stopped stating it, or the tree does
not compile; equally, a conversion batch that started deleting the retired stylesheet would break
the screens not yet converted. So every intermediate state compiles, runs, and shows a product where
some lists are tables and some are still cards — which is ugly for a few commits and is the price of
each regression staying attributable to the batch that caused it.

**Batch 6 is separate because it is the deliverable most likely to be dropped when the code is
green**, and the analysis says so in as many words: the plan it amends now reads as finished and
merged, so its requirements read as settled, and a later reader reinstating the variant on their
authority would be doing the correct thing by the record. Given its own batch, it is either done or
visibly not done.

**Splits that were considered and refused.** A batch per screen area (ten batches) — refused as
ceremony over homogeneous work, with each extra batch another place a run can stall. One conversion
batch for all 21 call sites — refused because a lost chip on networks and a flattened nesting on
compose would be one unattributable failure. Splitting the library work into a foundation batch of
its own — refused because it would close no requirement observable on any screen and would deliver
nothing a human could accept; the library changes travel in the batch whose screens need them, which
is what `CLAUDE.md` asks for anyway.

**One enabling intervention is declared, and only one**: `b1/INT-1`, the ungating of the row-content
slot. It serves REQ-6, which closes two batches later, and it is stated as work of batch 1 rather
than as scaffolding because batch 1's own networks and registries lists depend on it.

## Assumptions and decisions

- **The target presentation already exists and is not designed here.** It is the ruled, header-topped
  arrangement containers and images ship (`variant="dense"`), which the analysis puts out of scope
  and names as the reference. No new component, no new variant, no compatibility wrapper.
- **The enclosing surface of REQ-4 is the panel or card the list already sits in.** `DataTable` draws
  no boundary of its own today and does not start: giving it one would change containers and images,
  which is the redesign-under-cover the analysis forbids. What goes is the per-row surface; nothing
  new is drawn. Validated at the requirements gate.
- **And *which* surface it is, is the reference's composition** *(added 2026-08-16, REQ-40 — REQ-4
  bounded the count and not the shape, and batch 1 satisfied it with a result the human rejected)*.
  The screen composes as containers and images do: the section header and the screen toolbar
  **above** the surface, one **unpadded card** holding the table and nothing else, the table running
  edge to edge inside it. `ContainersScreen.tsx:399` and `ImagesScreen.tsx:610` are the only two
  unpadded cards in the client and are the pattern to reuse. **Order of preference, and it is part of
  the requirement**: reuse that pattern; extend the library only if a panel genuinely cannot be
  composed from what exists, recording the reason on the spot; never a local workaround in feature
  code. A card inside a card is two surfaces and is not the answer.
- **How far the mechanical guard reaches, answered honestly rather than optimistically.** Of the two
  halves of the equality, **one is cheap to guard and one is not**, and the plan does not pretend
  otherwise. **The row half is mechanical**: which feature files may state content-sized rows is a
  pinned perimeter over a prop, exactly the shape `library-layer-adoption-perimeter.test.ts` already
  uses, so `b5/INT-10` pins it in the **unit tree** — not in the conformance script, whose card-row
  half is about a surface being drawn and would have to grow an unrelated concern to carry this. It
  cannot be a blanket ban: the coverage matrix states the prop legitimately, for the wrapping-text
  case the library documents, so the guard is a pinned list with a recorded reason per entry, which
  fails both when a list acquires the prop and when the pin is not widened in the same commit. **The
  surface half is not mechanical and no guard is invented for it.** Asserting that every object
  list's nearest ancestor surface is an unpadded card holding nothing else is an AST question across
  files, defeated by a list rendered through a helper or composed in a parent, and a static check
  that passes on a screen it could not actually read is worse than no check: it is the failure this
  plan was opened over, in a new place. That half is **geometry** and stays where geometry belongs —
  `b4/INT-4` measures the table's edges against its surface's on every converted list, in the
  browser.
- **A two-line row keeps both lines in the reference's own fixed-height row — not by asking for
  content-sized rows.** *(Corrected 2026-08-16; the original wording of this assumption is what
  produced the rejected batch-1 result and is quoted here so the correction is legible: it read
  "a two-line row keeps both lines through content-sized rows, which the one presentation already
  offers (`autoRowHeight`)".)* **It does not need them.** Containers' own `NAME` cell is the same
  two-line component and measures 36.2px inside a 56px row, unclipped, and containers is the
  reference. So no converted list states `autoRowHeight`: REQ-8 is satisfied by the reference row,
  and REQ-39 requires the row to *be* the reference row — same height, same alignment, same
  modifiers. Each of the 21 sites is still *looked at* rather than assumed, and a site that
  genuinely cannot fit reports the measurement proving it rather than reaching for the modifier.
- **"On the same tracks" is the arrangement, not the columns** (REQ-7). A nested list keeps the
  columns it declares today — compose's services and swarm's stack services declare their own, and
  changing them would be the redesign REQ-13 forbids. What must be shared is the surface, the pan
  region and the ruled treatment; what signals the nesting is indentation and adjacency.
- **The guard of REQ-23 extends `client/scripts/check-ui-conformance.mjs` with a third, independent
  pass**, beside the boundary pass and the blur pass, over the collector both already share. It is
  already run by `npm run lint` and `npm run test -w client`; a second script would be a command
  nobody runs, which is how the 2026-08-15 decision died. Validated at the requirements gate, with
  two conditions: the new half neither reads, shares nor restructures the blur half's state — the
  allow-list and its token binding stay exactly as they are — and it names the file, the line and
  what is wrong rather than merely exiting non-zero.
- **Extending that script breaks a certified guard; the guard is restated, and comes out stronger on
  the half it exists to protect.** `client/test/unit/programme-constraints.test.ts:102-149` is three
  assertions: whole-file byte-identity against `4509b96`, the blur allow-list literal identical at
  every revision that touched the file, and a hunk-content rule. A card-row half fails the first and
  the third. The claim they exist to protect is the *blur half's* immutability, and whole-file
  identity was a **proxy** for it — one that forbids the file from ever growing for any reason,
  which is stricter than the thing it stands for. The restatement therefore drops the proxy and
  widens what is actually named: the allow-list literal **and the blur pass's own source**
  (`blurExceptionMarker`, `blurTokenReference`, `blurDeclarationValue`, `ruleTargetsAllowedOverlay`,
  `blurValueIsTokenBound`, `checkBlurPolicy`) byte-identical at every revision, this plan's included
  — those five functions being protected today only by the identity assertion that is going. The
  hunk rule admits this plan's half **by name** and nothing else. The reasoning is written into the
  test at the assertion, not only here. Net effect: what REQ-34 names is guarded more closely than
  before, and what it never named stops being frozen. Anything less is the weakening REQ-28 forbids.
  This is `b5/INT-5`, and it is the one place this plan edits certified work of the merged
  programme.
- **The four call sites that carry content below their cells are `NetworksPanel.tsx:293`,
  `RegistriesScreen.tsx:342`, `SwarmConfigsStacksPanel.tsx:323` and `ComposeScreen.tsx:447`** —
  verified against the source, and the same four the adoption-perimeter test already pins
  (`library-layer-adoption-perimeter.test.ts:103`). Layer efficiency carries none; it carries three
  expansions, which is a different slot and is ungated already.
- **`library-layer-adoption-perimeter.test.ts` is touched by every conversion batch**, by design: it
  pins the exact list of files allowed to state the retired presentation, so a batch that converts a
  file must narrow that list in the same commit. After batch 4 the list is empty, and batch 5 removes
  the expectation **with the prop it pinned** rather than leaving it asserting `[]` — the precedent
  the same programme set when it retired the previous list component's call-site budget
  (`card-list-deleted.test.ts`).
- **REQ-40 breaks a class of spec that never mentions the presentation, and every batch enumerates
  for it** *(added 2026-08-16, found by batch 1's tester; extended after batch 2)*. A spec that
  reaches a panel through its heading — `.ui-section-header__title → closest('.ui-surface')`, or a
  `.ui-surface` filtered by the heading it contains — assumes the table and its header share one
  surface, which REQ-40 ends: the `closest` resolves to `null` and the spec fails for a reason that
  has nothing to do with the row. Batch 1's own enumeration missed seven such specs because it was
  made by grepping the presentation's **name**, before REQ-40 existed; the tester restated them and
  five are green (38 tests), `exclusive/volumes-prune.spec.ts` being restated but outside that
  batch's run set. Batch 2 found **two more** of the same class —
  `property-columns-ordinary-widths.spec.ts` and `property-columns-derived-count.spec.ts`, both
  reaching the converted swarm panels that way — **and both are met again in batch 3**, when Configs
  & Stacks converts. **Batches 3 and 4 grep for the locator shape as well as for the name.**
  One member of the class is not a locator repair — `library-layer-screens-unmoved.spec.ts`, which
  asserts what the *previous* programme delivered — and is settled once, at the end, by `b4/INT-6`.
- **Re-recording a pinned *figure* is the tester's call; re-recording a pinned *rule* is not**
  *(added 2026-08-16 after batch 2, which met the case first)*. Batch 2 moved a certified
  predecessor's geometry pin: the swarm detail panel widened by exactly **58px at every viewport**,
  because the list's card no longer pads what it holds (REQ-40). The certified **rule** — the detail
  property column rule — is unchanged in outcome at every width (1070px → 1 column, 1550px → 2,
  2190px → 3); only the width the rule is read at moved. **That is the boundary of a tester's own
  authority.** A pinned **figure** whose rule still yields the same outcome is re-recorded with its
  new value, its reason and its date, in the batch that moved it. A pinned **rule** — an outcome, a
  count, a threshold, a behaviour — is **never** re-recorded to make a run green: it is reported,
  because a rule that has changed is either a defect of this plan or a decision for the human.
  Batches 3 and 4 meet the same case on their own screens, and REQ-36 keeps those predecessors named
  in the checks rather than assumed.
- **`b4/INT-6` is in batch 4 and not in 1, 3 or 6, deliberately.** Not 1 or 3: its subjects are
  screens this plan converts across four batches, so restating it earlier means restating it three
  times against a state that is still moving; batch 4 is where the last of the 21 call sites lands,
  so it can be restated once against the finished product, beside the sweep that already walks every
  converted screen. **Not 6**: batch 6's one structural property is that it touches no file any test
  reads, which is precisely what makes its two complete runs trustworthy as this plan's closing
  evidence — spending that to save a schedule slot is a bad trade. The spec is therefore **red from
  batch 1 to batch 4 by design**, and that is stated here so nobody repairs it out of turn.
- **Two e2e specs are touched by more than one batch**, and that is stated rather than discovered:
  `table-row-layout-uniform.spec.ts` measures volumes and networks (batch 1) against build cache
  (batch 2) with the images table as its dense control, and `list-order.spec.ts` names volumes
  (batch 1) and contexts (batch 2). Each batch restates only its own subjects; batch 5 settles what
  is left of the "comfortable against a dense control" framing, since after batch 4 there is no
  control to be measured against — every list is the control.
- **The e2e swarm coverage drives a stubbed cluster in the browser and initialises nothing on the
  daemon** (`e2e/support/swarm-reading.ts`, as `swarm-row-geometry.spec.ts` states at its head), so
  swarm's lists are geometrically measurable on any machine. No batch here initialises a swarm.
- **The three reference viewports are 1440×1000, 1280×800 and 375×812**, as the reference analysis
  used, so this work's figures can be read against its figures.
- **Test scheduling — one rule, and it holds for every batch.** **No batch runs a full suite.** Each
  runs `npm run lint -w client`, `npm run test:typecheck -w client`, the **named unit files** it
  changed and the **named e2e specs** it changed, each spec also run on its own. The complete client
  unit run and the complete e2e run happen **once, as the closing step of the programme**, after
  batch 6 — which touches only `.sdd/`, a tree no test reads, so it cannot change their outcome —
  and **batch 6 is not certified until both are green**. That is the only place in this plan where a
  full suite runs; a batch that runs one early has broken the rule, whatever it found.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself; placement follows
  `.sdd/modules/` and `CLAUDE.md`, and the canonical commands come from `.archi`.

## Departures from the spec

**Two, both narrowings of an enumeration the analysis itself asked to have re-verified, and both put
to the human's delegate at the requirements gate and accepted there:**

1. **Layer efficiency carries no content below its rows' cells.** The analysis lists "layer
   efficiency's per-layer content" among the five lists whose row content must survive. It does not
   exist: `LayerEfficiencyView` states `renderExpanded` at `:208`, `:227` and `:253` — the other
   slot, ungated, shared with twelve other lists including containers and images. Its obligation is
   REQ-10 (the expansion), not REQ-6 (the row content). The screen stays fully in scope.
2. **The nested lists are two, not three.** A list inside a row of another list is
   `ComposeScreen.tsx:449` and `SwarmConfigsStacksPanel.tsx:325`. Layer efficiency's three lists are
   siblings inside a dialog, so REQ-7 does not reach them.

**Neither narrows what is delivered** — all 21 call sites are converted and every slot is verified —
and both are recorded here so that a later reader comparing the analysis with this plan finds the
difference explained rather than assumed to be an oversight. **The analysis file itself is not
edited**: it is a dated record, and correcting the past to agree with the present is the practice
that analysis argues against.

## Coverage check

**Every REQ is served by at least one INT, and every INT serves at least one REQ.** One enabling
intervention is declared: `b1/INT-1`, which serves REQ-6 and closes it two batches later.

### REQs completed across several batches, with the batch they close in

- **REQ-2, REQ-3, REQ-4** (rows flush, rows not cards, one surface) — true of each list as its batch
  converts it, and true of *every object list in the product* only once the last one is converted.
  **Close in batch 4**, whose sweep is what makes the claim product-wide.
- **REQ-5** (columns do not drift, with no compensating inset anywhere) — its first half is satisfied
  by each conversion; its second half is a claim about the library's stylesheet and becomes true when
  the header-inset rule is deleted. **Closes in batch 5.**
- **REQ-6** (row content unconditional) — the gate is removed in `b1/INT-1` and evidenced on networks
  and registries in batch 1; the other two lists that supply the slot are converted in batch 3.
  **Closes in batch 3.**
- **REQ-8 … REQ-13** (two-line rows, room and uniformity, the expansion, behaviour, the phone pan,
  surface-only) — asserted on each batch's own lists. **Close in batch 4.**
- **REQ-20** (swarm) — nodes, services and secrets in batch 2; configs & stacks, which is the nested
  one, in batch 3. **Closes in batch 3.**
- **REQ-39, REQ-40** (the row is the reference row; the table is edge to edge in the reference's own
  surface composition) — added by the 2026-08-16 amendment and carried by every conversion batch,
  batch 1's retrofit included. **Close in batch 4**, whose sweep measures them across every converted
  list against containers and images as they stand in the tree.
- **REQ-1** (one component, one presentation, no second answer) — approached by every conversion,
  true only when the choice leaves the public interface. **Closes in batch 5.**
- **REQ-27** (module specs) — each batch records its own screens; the library's own spec is batch 5's;
  the sweep for anything left is batch 6's. **Closes in batch 6.**
- **REQ-28** (coverage restated, never neutered) — every batch restates its own; the variant's
  dedicated unit file and the perimeter's pin go with the prop. **Closes in batch 5.**
- **REQ-29, REQ-30, REQ-32, REQ-36** (delivered figures on record, geometry with a real pointer,
  daemon test discipline, certified predecessors named) — obligations of every check written in
  batches 1 to 4. **Close in batch 4.**
- **REQ-31, REQ-33, REQ-34, REQ-35** (no geometry in jsdom, the UI boundary, no blur, no added
  runtime cost) — hold over every code batch and are most at risk in the one that edits the
  conformance script. **Close in batch 5.**
- **REQ-37, REQ-38** (no server file, English and kebab-case) — hold over every batch. **Close in
  batch 6**, the last one.
- Every other REQ closes in the single batch that lists it.

### REQ → INT

Interventions are cited with their batch: `b1/INT-n` … `b6/INT-n`.

| REQ | Interventions serving it | Closes in |
| --- | --- | --- |
| REQ-1 | b5/INT-1, b5/INT-2, b5/INT-3 (verified by b5/INT-6, b5/INT-8) | **5** |
| REQ-2 | b1/INT-3, b1/INT-4, b1/INT-5, b2/INT-1 … b2/INT-6, b3/INT-3, b3/INT-4, b4/INT-1 (verified by b1/INT-8, b2/INT-8, b3/INT-8, b4/INT-3, b4/INT-4) | **4** |
| REQ-3 | as REQ-2 | **4** |
| REQ-4 | as REQ-2 | **4** |
| REQ-5 | b1/INT-2, b5/INT-2 (verified by b1/INT-8, b2/INT-8, b4/INT-4) | **5** |
| REQ-6 | b1/INT-1, b1/INT-2, b1/INT-4, b1/INT-5, b3/INT-3, b3/INT-4 (verified by b1/INT-7, b1/INT-8, b3/INT-5, b3/INT-8) | **3** |
| REQ-7 | b3/INT-1, b3/INT-2, b3/INT-3, b3/INT-4 (verified by b3/INT-8) | 3 |
| REQ-8 | b1/INT-3, b1/INT-4, b1/INT-5, b2/INT-1 … b2/INT-6, b3/INT-3, b3/INT-4, b4/INT-1 (verified by b1/INT-8, b2/INT-8, b3/INT-8, b4/INT-3) | **4** |
| REQ-9 | as REQ-8 | **4** |
| REQ-10 | b1/INT-3, b1/INT-4, b1/INT-5, b2/INT-1 … b2/INT-6, b3/INT-3, b3/INT-4, b4/INT-1 (verified by b1/INT-8, b3/INT-8, b4/INT-3) | **4** |
| REQ-11 | as REQ-10 | **4** |
| REQ-12 | as REQ-8 | **4** |
| REQ-13 | as REQ-8 (verified additionally by b1/INT-7, b2/INT-7, b3/INT-5, b4/INT-2) | **4** |
| REQ-14 | b1/INT-3, b1/INT-4 (verified by b1/INT-7, b1/INT-8, b1/INT-9) | 1 |
| REQ-15 | b1/INT-5 (verified by b1/INT-7, b1/INT-8, b1/INT-9) | 1 |
| REQ-16 | b2/INT-1 (verified by b2/INT-7, b2/INT-8, b2/INT-9) | 2 |
| REQ-17 | b2/INT-2 (verified by b2/INT-7, b2/INT-8, b2/INT-9) | 2 |
| REQ-18 | b2/INT-3 (verified by b2/INT-7, b2/INT-8, b2/INT-9) | 2 |
| REQ-19 | b3/INT-3 (verified by b3/INT-5, b3/INT-8) | 3 |
| REQ-20 | b2/INT-4, b2/INT-5, b2/INT-6, b3/INT-4 (verified by b2/INT-8, b3/INT-8) | **3** |
| REQ-21 | b4/INT-1 (verified by b4/INT-3, b4/INT-4) | 4 |
| REQ-22 | b5/INT-1, b5/INT-2 (verified by b5/INT-6, b5/INT-7) | 5 |
| REQ-23 | b5/INT-3, b5/INT-4 (verified by b5/INT-4, b5/INT-6) | 5 |
| REQ-24 | b5/INT-3, b5/INT-4 | 5 |
| REQ-25 | b6/INT-1, b6/INT-2 | 6 |
| REQ-26 | b6/INT-3 | 6 |
| REQ-27 | b1/INT-10, b2/INT-10, b3/INT-9, b4/INT-5, b5/INT-9, b6/INT-4 | **6** |
| REQ-28 | b1/INT-6, b1/INT-7, b1/INT-9, b2/INT-7, b2/INT-9, b3/INT-5, b3/INT-6, b3/INT-7, b4/INT-2, b4/INT-4, b4/INT-6, b5/INT-5, b5/INT-6, b5/INT-7, b5/INT-8 | **5** |
| REQ-29 | b1/INT-8, b2/INT-8, b3/INT-8, b4/INT-3 | **4** |
| REQ-30 | b1/INT-8, b2/INT-8, b3/INT-8, b4/INT-3, b4/INT-4 | **4** |
| REQ-31 | b1/INT-7, b2/INT-7, b3/INT-5, b4/INT-2, b5/INT-6, b5/INT-7, b5/INT-8 | **5** |
| REQ-32 | b1/INT-8, b2/INT-8, b3/INT-8, b4/INT-3, b4/INT-4 | **4** |
| REQ-33 | b1/INT-3 … b1/INT-5, b2/INT-1 … b2/INT-6, b3/INT-3, b3/INT-4, b4/INT-1, b5/INT-3 (verified by b5/INT-4) | **5** |
| REQ-34 | b5/INT-3, b5/INT-5 | **5** |
| REQ-35 | b5/INT-1, b5/INT-2 (verified by b5/INT-8) | **5** |
| REQ-36 | b1/INT-8, b1/INT-9, b2/INT-8, b3/INT-8, b4/INT-3 | **4** |
| REQ-37 | every INT of every batch, as a constraint on the diff | **6** |
| REQ-38 | every INT of every batch, as a constraint on the diff | **6** |
| REQ-39 | b1/INT-3, b1/INT-4, b1/INT-5, b2/INT-1 … b2/INT-6, b3/INT-3, b3/INT-4, b4/INT-1 (verified by b1/INT-8, b2/INT-8, b3/INT-8, b4/INT-3, b4/INT-4; guarded afterwards by b5/INT-10) | **4** |
| REQ-40 | b1/INT-3, b1/INT-4, b1/INT-5, b2/INT-1 … b2/INT-6, b3/INT-3, b3/INT-4, b4/INT-1 (verified by b1/INT-8, b2/INT-8, b3/INT-8, b4/INT-3, b4/INT-4, b4/INT-6) | **4** |

### INT → REQ

| INT | REQ served |
| --- | --- |
| b1/INT-1 | REQ-6 *(enabling — the gate that must go before any list that uses the slot is converted)* |
| b1/INT-2 | REQ-5, REQ-6 |
| b1/INT-3 | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-33, REQ-39, REQ-40 |
| b1/INT-4 | REQ-2, REQ-3, REQ-4, REQ-6, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-33, REQ-39, REQ-40 |
| b1/INT-5 | REQ-2, REQ-3, REQ-4, REQ-6, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-15, REQ-33, REQ-39, REQ-40 |
| b1/INT-6 | REQ-28 |
| b1/INT-7 | REQ-6, REQ-13, REQ-14, REQ-15, REQ-28, REQ-31 |
| b1/INT-8 | REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-14, REQ-15, REQ-29, REQ-30, REQ-32, REQ-36, REQ-39, REQ-40 |
| b1/INT-9 | REQ-14, REQ-15, REQ-28, REQ-36 |
| b1/INT-10 | REQ-27 |
| b2/INT-1 | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-16, REQ-33, REQ-39, REQ-40 |
| b2/INT-2 | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-17, REQ-33, REQ-39, REQ-40 |
| b2/INT-3 | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-18, REQ-33, REQ-39, REQ-40 |
| b2/INT-4 | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-20, REQ-33, REQ-39, REQ-40 |
| b2/INT-5 | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-20, REQ-33, REQ-39, REQ-40 |
| b2/INT-6 | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-20, REQ-33, REQ-39, REQ-40 |
| b2/INT-7 | REQ-13, REQ-16, REQ-17, REQ-18, REQ-28, REQ-31 |
| b2/INT-8 | REQ-2, REQ-3, REQ-4, REQ-5, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-16, REQ-17, REQ-18, REQ-20, REQ-29, REQ-30, REQ-32, REQ-36, REQ-39, REQ-40 |
| b2/INT-9 | REQ-16, REQ-17, REQ-18, REQ-28 |
| b2/INT-10 | REQ-27 |
| b3/INT-1 | REQ-7 |
| b3/INT-2 | REQ-7 |
| b3/INT-3 | REQ-2, REQ-3, REQ-4, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-19, REQ-33, REQ-39, REQ-40 |
| b3/INT-4 | REQ-2, REQ-3, REQ-4, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-20, REQ-33, REQ-39, REQ-40 |
| b3/INT-5 | REQ-6, REQ-13, REQ-19, REQ-28, REQ-31 |
| b3/INT-6 | REQ-28 |
| b3/INT-7 | REQ-19, REQ-20, REQ-28 |
| b3/INT-8 | REQ-2, REQ-3, REQ-4, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-19, REQ-20, REQ-29, REQ-30, REQ-32, REQ-36, REQ-39, REQ-40 |
| b3/INT-9 | REQ-27 |
| b4/INT-1 | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-21, REQ-33, REQ-39, REQ-40 |
| b4/INT-2 | REQ-13, REQ-21, REQ-28, REQ-31 |
| b4/INT-3 | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-21, REQ-29, REQ-30, REQ-32, REQ-36, REQ-39, REQ-40 |
| b4/INT-4 | REQ-2, REQ-3, REQ-4, REQ-5, REQ-28, REQ-30, REQ-32, REQ-39, REQ-40 |
| b4/INT-5 | REQ-27 |
| b4/INT-6 | REQ-28, REQ-40 |
| b5/INT-1 | REQ-1, REQ-22, REQ-35 |
| b5/INT-2 | REQ-1, REQ-5, REQ-22, REQ-35 |
| b5/INT-3 | REQ-1, REQ-23, REQ-24, REQ-33, REQ-34 |
| b5/INT-4 | REQ-23, REQ-24, REQ-33 |
| b5/INT-5 | REQ-28, REQ-34 |
| b5/INT-6 | REQ-1, REQ-22, REQ-23, REQ-28, REQ-31 |
| b5/INT-7 | REQ-22, REQ-28, REQ-31 |
| b5/INT-8 | REQ-1, REQ-28, REQ-35 |
| b5/INT-9 | REQ-27 |
| b5/INT-10 | REQ-23, REQ-39 |
| b6/INT-1 | REQ-25 |
| b6/INT-2 | REQ-25 |
| b6/INT-3 | REQ-26 |
| b6/INT-4 | REQ-27 |

**Three notes on the shape of that mapping**, all deliberate:

- **Every conversion batch's largest interventions are its checks and its coverage restatements, not
  its feature edits.** Six of batch 2's ten interventions exist to assert or to restate; the six
  feature files lose one prop each. That is the correct proportion for a change of surface whose
  every character of text is identical before and after — if the diff is mostly feature code,
  something was redesigned on the way past.
- **REQ-33, REQ-34, REQ-37 and REQ-38 are served by interventions as constraints, not as work.**
  They build nothing: they are how each diff is judged — no raw tag, class, style or hard-coded value
  outside the library, no blur moved, no server file, English throughout.
- **`b1/INT-1` is the only enabling intervention in the plan**, and it is stated as one because its
  requirement closes two batches later. It is not scaffolding: batch 1's own networks and registries
  lists stop working without it.

## Risks carried forward

- **The row content is dropped silently.** The single most likely regression and the least visible:
  nothing errors, the rows merely become shorter. `b1/INT-1` removes the gate before any list that
  uses the slot is converted, and `b1/INT-8` and `b3/INT-8` assert the chips, the repository content,
  the stacks content and compose's whole nested service list are present, counted, and still
  operable — before and after.
- **The nesting flattens.** With no card containing a project, its services can read as more rows of
  the projects list. `b3/INT-8` asserts the indentation as a measured inset and asserts two levels
  are still distinguishable, not merely that the services are on screen.
- **Two-line rows are clipped into data loss.** A title over a monospace subtitle that no longer fits
  does not overflow visibly — it disappears. The row that triggered the report is one of them.
  Checked at all three viewports on volumes, networks and registries, by measuring both lines' boxes.
- **Layer efficiency is missed a third time.** It was excluded in 2026-08-15, mis-migrated the next
  day, and its slot is the one this plan's own source analysis got wrong. It has a batch of its own,
  named in the plan, and batch 4's sweep is what closes the product-wide claim.
- **The coverage is neutered instead of restated.** Dozens of assertions name the retired
  presentation and the fastest route to green is to weaken them. Each batch restates its own; batch 5
  is accepted on a demonstration of the guard failing, not on a diff.
- **The certified conformance-script guard is silently disabled** to let the new half in. It is the
  most valuable check in the client tree and the easiest to delete. `b5/INT-5` restates it around the
  blur half specifically and is called out in batch 5's acceptance for the human to read.
- **A criterion derived from a symptom certifies the symptom's absence, not the defect's.** This has
  now happened **twice, at two altitudes**, and both times the check would have been green on the
  very thing the human was objecting to. **Batch 1**: the target was specified by its *properties*
  instead of by its *reference*, and the rejected result satisfied every property — gap 0, radius 0,
  one hairline, drift 0.00px. **Batch 2**: the named Plugins defect was specified by *one measurable
  consequence* — the header and its values sharing a left edge — and the delivered build satisfies it
  at 0px, because the retired presentation carried a compensating inset written for exactly that
  column. What was actually wrong was the column's 1037px run, crossed by 15 surfaces and 14 gaps.
  **The counter-practice is the one that worked both times, and it is already REQ-29**: measure the
  rejected build *first*, and require the check to be **red on it**. A criterion that cannot be
  observed failing on the build that caused the report is not yet a criterion, whatever it measures —
  and batches 3, 4 and 5 apply that test to every check they write before writing the fix.
- **The conversion is judged against its own criteria instead of against the reference — which has
  already happened once.** Batch 1 met every geometric criterion, measured, and was rejected on
  sight, because a list of properties leaves everything it does not name free to differ. REQ-39 and
  REQ-40 close the two that did; the standing lesson for batches 2 to 4 is that the acceptance
  question is *"is this the containers table?"* and not *"does this satisfy the four criteria?"*.
- **The retirement becomes a redesign.** Eight screen areas are redrawn at once, which is a standing
  invitation to improve a column or reorder a property on the way past. Every conversion batch's
  acceptance asks first what did *not* change.
- **The phone breakpoint regresses unnoticed.** These lists grow their rows at 375px today and will
  pan afterwards. Measured at 375×812 in every conversion batch, including inside the dialog in
  batch 4, which is the one place a pan can be swallowed by a surface that scrolls itself.
- **The amendment is skipped because the code is green.** Batch 6 exists so that it is either done or
  visibly not done.
