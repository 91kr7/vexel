---
batch: 2
feature: F2 — a list row keeps its content below the desktop breakpoint
closed_req: [REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11]
depends: []
---

# Batch 2 — list-row-columns

At 375×812 the containers list renders a status dot and four buttons. The name, image, CPU, memory,
ports and uptime are in the DOM at zero width. Three library-level causes compound, and the third is
the one that removes the escape route:

- columns default to `1fr` (`client/src/ui/data/DataTable.tsx:88`), free to shrink to zero under
  width pressure;
- `.ui-data-table__cell { min-width: 0 }` (`client/src/ui/data/data-table.css:66`) removes the
  automatic minimum that would otherwise have forced an overflow;
- `.ui-data-table__row { overflow: hidden }` (`data-table.css:47`) clips that overflow *inside* the
  row, so the enclosing `ScrollArea` measures `scrollWidth === clientWidth` and never offers a
  scrollbar.

Delivered figure to be observed failing first: `grid-template-columns: 20px 0px 0px 0px 0px 0px 0px
296px` — six of eight tracks at zero, the action cluster holding 296px of a 375px viewport.

**This batch precedes batch 5 deliberately.** Batch 5 extends this component into the object list
every screen will use; a defect left here is inherited by the primitive and then by all thirteen
screens.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, containers and images areas | The check, written and run **first**. At 375×812, read the row's **computed `grid-template-columns`** and assert **no track measures 0px**; assert each named cell's content box is non-empty and reachable; assert the enclosing scroll area reports `scrollWidth > clientWidth` and that scrolling it brings each column fully into view. **A check that the row still contains its text is refused**: it contained every character throughout the defect. Report the computed grid before and after. | REQ-6, REQ-8, REQ-9 | — |
| INT-2 | create | client e2e suite, containers and images areas | The non-regression half, at 1440×1000 and 1280×800: the columns' computed widths, the row height, the header alignment and the inline expansion measured before and after the change and **identical**. This is what makes the repair a repair rather than a redesign. | REQ-11 | — |
| INT-3 | modify | `client/src/ui/data/DataTable.tsx:88` | The default column sizing stops permitting collapse: a track carries a minimum derived from its content rather than being free to reach zero. The column definition API gains whatever this needs; every existing caller keeps its delivered widths at desktop. | REQ-7, REQ-10, REQ-11 | INT-1 |
| INT-4 | modify | `client/src/ui/data/data-table.css` (`:47` row, `:66` cell) | The cell stops waiving its automatic minimum, and the row stops clipping its own overflow so the enclosing `ScrollArea` can see it and scroll it. Whatever `overflow: hidden` was protecting (a hover or selected background bleeding past the radius) is preserved by other means, not by clipping content. | REQ-7, REQ-8, REQ-10 | INT-3 |
| INT-5 | modify | `client/src/ui/tokens.css` (the two data-table action column widths) | The action cluster keeps its intrinsic width and stops consuming the row: its track is fixed to what it needs, not to a share that grows as the data columns shrink. Any value used here is a token, declared here. | REQ-9 | INT-3 |
| INT-6 | modify | `.sdd/modules/ui-library/specs/data-table.md`, `.sdd/modules/ui-library/specs/design-tokens.md` | Record the column contract — a track has a minimum, the row does not clip, the list scrolls horizontally when the minimums exceed the width — and any token whose meaning changed. English only. | REQ-7, REQ-8 | INT-3, INT-4, INT-5 |

## Constraints on this batch

- **The repair is made once and inherited by all four adopters** — containers, images, dashboard and
  the coverage matrix. No screen may carry a local override, a breakpoint-conditional column set or a
  hand-tuned width to compensate (REQ-10). A feature file in this diff is a signal the fix went into
  the wrong place.
- `plan-docker_management_app-detail_property_columns` (bug-4) governs the **detail panel's** property
  columns, not the table's; nothing here touches its rule, its property set or its content classes,
  and its column counts must be identical at the same measured section width afterwards.
- No blur, no `style`, no raw tag, no hard-coded length outside `tokens.css`.

## The expanded detail panel is pinned to the table's visible box — REQ-23 decided here

Recorded because it is a product decision, and because the first version of this record understated
how far it reached. **This section replaces that version**, which said the effect was at 375×812 and
that nothing changed at any desktop width: both true at their endpoints and wrong in between.

**What the first attempt actually did, and how far it reached.** Letting a row grow to the width its
columns need and letting the table pan made the expansion — `renderExpanded`'s content, part of that
scrollable content — lay out at the row's width. That width is a **floor**, so the panel stopped
tracking the window far above the phone: it was **907.2px** on containers and **723.2px** on images at
*every* window narrower than that, i.e. below ~940px and ~770px of viewport — around 550px of range,
not one viewport. The property section inside it went constant with it (859.2px on the Config split,
675.2px on images), and four steps of two certified predecessors failed on it, three of them at **700**
and **720**, not at 375: `container-detail-property-columns.spec.ts:216` (Config at 700×900: two
columns of 417.6px where the contract says stacked), `:285` (Inspect at 720×800: two columns over ten
bands), `property-columns-rule.spec.ts:224` (a calibration that bottomed out at 675.2px against a
600px target) and `:376` (a precondition below 560px made unreachable).

**The decision.** REQ-23 is settled here rather than in batch 5: **the expansion is pinned to the
table's own visible box — it keeps that box's width and stays in it while the grid pans underneath.**
A row is a grid to be scanned across; a panel is prose and values to be read, and two columns of
417.6px that require a horizontal pan to reach the second are worse than one column scrolled
vertically. `plan-docker_management_app-detail_property_columns` chose one column below 720px
deliberately; a side effect is not how a certified contract is overturned, and amending that
predecessor's expected appearance to match this change is the one edit that would let a product
change pass as a test detail.

**The objection it had to answer, and how the construction answers it.** A panel held at the window's
width while the table pans underneath does part company with its row — at any non-zero offset its left
edge would sit mid-row. So it is not merely sized: it is **held at the pan region's left edge**, moving
with the pan rather than being left behind by it. Measured on containers at 375×812, pan range 574px:
the panel's viewport x is 21 — the table's own left edge — at scroll offsets 0, 287 and 574, at a
constant 333px wide.

**Why the offset is written by the component and not declared as `position: sticky; left: 0`.**
Measured, not assumed: sticky does **not** pin here. The expansion's nearest scroll container is the
body's own scroll region, which never scrolls horizontally — the box that pans is one level further
out — so a sticky inset resolves against a scrollport that does not move: the panel measured **x
-379** at scroll offset 400, both with that region scrolling and with its inline axis clipped, against
**x 21** with the offset written. `transform` pins it and is refused: it would make the expansion the
containing block of every `position: fixed` descendant, and a dialog is rendered in place inside a
panel rather than portalled — a fixed probe measured at the panel's own box (21, 543, 907×355) instead
of the viewport (0, 0, 375×812). The element is therefore relatively positioned, and its `left` and
`width` are written by `DataTable` while — and only while — the table pans; where the columns fit it
carries no inline geometry at all.

**The repair itself is untouched, which is the thing to check first.** Pinning takes nothing back: the
row's tracks keep their minimums, the row keeps its own width, and the table keeps panning. Measured
with the pin in place — containers at 700×900: row grid `20px 129.594px 72px 43.1875px 86.3906px 72px
72px 296px`, row 907.2px wide, table `scrollWidth 907 / clientWidth 658`. Only the expansion stopped
riding the grid. Note the pan reaches further than the panel defect did — the containers table pans at
every viewport up to ~1230px, images up to ~1045px — because that is what "the columns do not fit"
means; REQ-11 pins 1440×1000 and 1280×800, and both are untouched.

**Measurements, panel width / property-section width, delivered against pinned:**

| viewport | delivered (pre-batch) | first attempt | pinned |
| --- | --- | --- | --- |
| 375 | 333 / 285 | 907.2 / 417.6 | **333 / 285** |
| 460 | 418 / 370 | 907.2 / 417.6 | **418 / 370** |
| 640 | 598 / 550 | 907.2 / 417.6 | **598 / 550** |
| 700 | 658 / 610 | 907.2 / 417.6 | **658 / 610** |
| 720 | 678 / 630 | 907.2 / 417.6 | **678 / 630** |
| 940 | 658 / 610 | 907.2 / 417.6 | **658 / 610** |
| 1280 | 958 / 443 | 958 / 443 | **958 / 443** |
| 1440 | 1118 / 523 | 1118 / 523 | **1118 / 523** |

(containers; images the same shape, its first-attempt constant being 723.2 / 675.2). Every pinned
figure equals the delivered one, so the four failing steps are measuring the geometry they were
written against, and the earlier bug-4 note — "a 375-wide check legitimately sees more bands" —
**is withdrawn**: no check sees more bands, at any width, because no section is wider than it was.

**What batch 5 inherits.** REQ-23's "always the full width of the screen's content column" now has one
reading and it is written into `data-table.md`: the panel is the width of the box its list is read in,
never of the grid that list pans. Batch 5 states it on `DetailPanel` rather than re-deciding it.

## Observation for a later batch — out of this batch's perimeter

`client/src/ui/tokens.css`, on `--data-table-action-column-width`, sizes the containers row's action
column at **296px**, for up to four dense controls on one line with slack for a wider label. Measured
on the delivered build, that row's cluster — its four controls and its menu trigger — **inks 189px**
of it, at 1440, at 1280 and at 375 alike. The 107px difference is real width, held in every row of the
table at every viewport.

**The consequence is now visible, which it was not before.** A table pans when its row's min-content
exceeds its box, and that min-content carries this track whole: containers' is **907.2px**, so the
table pans at every viewport up to about **1230px**. Were the track sized to what the cluster inks, the
row would want roughly 800px and the pan would begin around **1120px** instead — about 107px of window
in which the table would simply fit. Nothing is broken by this: the columns keep their minimums, the
pan works, and REQ-11's two pinned widths are untouched either way. But it will read as inexplicable to
whoever next wonders why a fairly wide window pans a table that looks as though it should fit.

**Why it was left alone here.** The track is fixed, so narrowing it hands its width back to the data
columns **at every width, desktop included** — it re-divides 1440×1000 and 1280×800, which is exactly
REQ-11's territory. That is a change to the delivered appearance and needs its own before/after
measurement and its own decision about how much slack a cluster keeps for labels it does not yet carry;
it is not a batch-2 aside made while repairing a collapse. **Batch 17 (containers detail) is the
natural place to pick it up**, that being where this row's action set is looked at on its own terms.
