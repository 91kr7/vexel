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

## The expanded detail panel pans with the row — decided here, confirmed or overturned in batch 5

Recorded because it is a product decision, not a side effect, and because the second half of it will
look like a regression to whoever measures the panel at 375px without having read this.

**What changed, and only at 375×812.** The repair makes a row grow to the width its columns need and
lets the table pan; the expansion (`renderExpanded`) is part of that scrollable content, so it is laid
out at the row's width. Measured on containers: the panel was **333px** wide on the delivered build
and is **907px** now — the row's own width — and it pans with the table rather than sitting still
inside it. Its height fell from 635px to 355px, having width to lay out in at last. **Nothing about it
changes at any desktop width**: `{x:301, y:319, w:958, h:355}` at 1280×800 and `{x:301, y:319, w:1118,
h:355}` at 1440×1000, before and after, identical. The cost is real and it is the operator's: on a
phone, reading a detail panel now means panning horizontally.

**Why alignment with the row rather than pinning to the viewport.** A panel held at the viewport's
width while the table pans underneath it parts company with the row that opened it: the row's cells
slide, the panel does not, and at any non-zero scroll offset the panel's left edge is somewhere in the
middle of the row above it, with blank space beside it. The panel is an expansion *of a row*, so it
keeps the row's box. The alternative — treating the panel as an expansion of the **viewport**, pinned
and full-width against the visible region, with the table panning behind it — is coherent too, and it
is the one that would spare the operator the pan.

**Batch 5 is where that choice is made or unmade.** REQ-23 has `DetailPanel` "always the full width of
the screen's content column"; at 375px, with the table panning, "full width" has two readings — the
row's width (this batch's) and the viewport's (the pinned one). Batch 5 writes that contract for the
primitive every migrated screen will use, so it must state which one it means rather than inherit this
one silently. Whatever it decides is expressed on the component, never at a call site.

**The bug-4 note, so it is not read as a regression.**
`plan-docker_management_app-detail_property_columns`' rule is untouched — same rule, same property
set, same content classes, and the same column count at the same measured section width. What moved at
375px is the **section's width**, from 333px to 907px, and that rule is width-driven by design: more
width, more bands. A 375-wide check of the property columns therefore legitimately sees more bands than
the delivered build did, and a check that pins the delivered count at 375px is asserting the old
section width, not bug-4's rule. At 1440×1000 and 1280×800 the counts are unchanged, because the
section width is unchanged.
