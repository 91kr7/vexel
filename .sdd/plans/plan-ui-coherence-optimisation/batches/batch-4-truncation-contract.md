---
batch: 4
feature: F4 — a long identifier never collides with the value beside it
closed_req: [REQ-17, REQ-18, REQ-19, REQ-20, REQ-21]
depends: []
---

# Batch 4 — truncation-contract

Long identifiers are laid beside trailing metadata with no truncation contract, so they overlap. One
shared cause: a flexible text next to trailing meta without `min-width: 0` and `text-overflow:
ellipsis` on the text, and without `flex-shrink: 0` on the meta. Docker identifiers are 64-character
hashes — the normal case, not an edge case.

The three observed sites, and where each is drawn:

- **Volumes** — the mount path runs under the size, rendering as `…c758d3…0B_2b`. Drawn by
  `CardList` (`client/src/volumes-networks/VolumesPanel.tsx:209`).
- **System & prune** — the `Unused volumes` hash runs under both the size and the `Prune` button.
  Drawn by `StorageUsageRow`.
- **Contexts** — the endpoint `unix:///Users/…/.docker/run/docker.sock` runs under the `active`
  pill. Drawn by `CardList` (`client/src/contexts/ContextsScreen.tsx:161`).

**This batch precedes batch 5 deliberately.** The contract must exist before the object list absorbs
`CardList`'s presentation, or the primitive inherits the defect and hands it to every migrated
screen. The work here is not thrown away by that absorption: it is the contract the comfortable
variant carries.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, volumes-networks / system / contexts areas | The check, written and run **first**, on all three sites at 1440×1000, 1280×800 and 375×812: the bounding box of the flexible text and the bounding box of each trailing value **do not intersect**, the trailing value is at its natural width, and the `Prune` button is whole and hit-testable at its own centre. Then the same with a **synthetic 64-character name** to prove the contract holds at arbitrary length. Report the intersections measured before and after. | REQ-18, REQ-19 | — |
| INT-2 | create | client e2e suite, containers or images detail area, and the volumes-networks area | The half that must **not** change: a property value in the two-column grid still **wraps** and is wholly readable, with no ellipsis and no one-line clamp. This is the assertion that stops the fix being applied where it would destroy data. **And the route out of a truncation**: for the volume mount path and the context endpoint — the two values this batch ellipsises — assert the object's detail panel shows the **same value in full**, wrapped and selectable, so that truncating a list row never becomes the only presentation of a value. | REQ-20, REQ-21 | — |
| INT-3 | modify | `client/src/ui/data/CardList.tsx` and its stylesheet | Write the contract once, in the row's title/subtitle-versus-meta layout: the flexible run may shrink and ellipsises; the trailing badge group and meta values do not shrink. This is the single change that repairs volumes and contexts, and — through the seventeen call sites it serves — the same class of collision on every other screen using it. | REQ-17, REQ-18, REQ-19 | INT-1 |
| INT-4 | modify | `client/src/ui/controls/StorageUsageRow.tsx` and its stylesheet | The same contract for the label/description/size row with its trailing action: the description ellipsises, the size and the action keep their width. | REQ-17, REQ-18, REQ-19 | INT-1 |
| INT-5 | modify | `client/src/ui/data/TableCells.tsx` (`IdentifierCell`, `TwoLineCell`, `MetaCell`) and its stylesheet | Bring the table's own cells under the same contract, so the rule is one rule rather than two implementations of one idea — and so that the object list inherits it in batch 5 whichever cell a column uses. Do not disturb the wrapping variant of `TwoLineCell`, which exists on purpose. | REQ-17, REQ-19 | INT-1 |
| INT-6 | modify | `.sdd/modules/ui-library/specs/card-list.md`, `specs/storage-usage-row.md`, `specs/table-cells.md`, `specs/definition-list.md` | State the contract in each spec, and state its boundary in the property-band one: **a list row truncates, a property band wraps**. The boundary is the part a later reader gets wrong. English only. | REQ-17, REQ-20 | INT-3, INT-4, INT-5 |

## Constraints on this batch

- **A property band still wraps** (REQ-20). The delivered arrangement of
  `plan-docker_management_app-detail_property_columns` (bug-4) is untouched: same column rule, same
  property set, same content classes, same column counts at the same measured section width. A value
  clamped to one line there turns a layout defect into a data loss on exactly the values the operator
  most needs to read exactly.
- **A truncated value stays obtainable in full** (REQ-21): the object's detail panel shows the same
  value wrapped and selectable. Verify it for the volume mount path and the context endpoint.
- No `title`-attribute tooltip is introduced as a substitute for that route, and nothing gains
  `user-select: none`.
- No feature file in this diff: all four sites are drawn by library components.

## Record of the delivery (2026-08-15)

Measured on two genuinely rebuilt states, at 1440×1000, 1280×800 and 375×812, read-only against the
running product. Colliding card rows **3 → 0**, **8 → 0**, **17 → 0** over the 111 rows the product
renders; colliding storage rows **0 / 1 / 3 → 0** over 6; every `DataTable` row, track and cell
byte-identical at 1440×1000 and 1280×800.

**A note on the instrument, because it very nearly hid the result.** The first pass measured text
extent with `Range.getClientRects()` and reported the three overlaps unchanged after the fix. That is
wrong by construction: an ellipsised line is still *laid out* at its full length and only painted
clipped, so the instrument measures the string, not the rectangle the eye sees. The correct measure —
used for every figure recorded here — clips the text's rects by every ancestor that is not
`overflow: visible`, the element itself included. Anyone re-measuring this batch must do the same, or
they will conclude the contract does nothing.

### REQ-21 is split, and half of it is outstanding

- **The volume half closed here.** `VolumeDetail`'s `Mountpoint` band shows
  `/var/lib/docker/volumes/fc95…450b/_data` in full, wrapped over two lines (34.8px), `user-select:
  auto`, `scrollWidth === clientWidth` — unclipped and selectable, which is exactly what the
  requirement asks for a value the list row truncates.
- **The contexts half did not, and is a known open defect as of this batch.** `ContextsScreen`
  (`:161`) passes no `onSelect` and no `renderExpanded`, so there is no per-context detail surface;
  the card beside the list carries the eight *daemon* properties and the endpoint is not one of them.
  Measured after this batch: `unix:///Users/christianmariani/.docker/run/docker.sock` is **truncated
  at all three viewports** (the run is offered 337px at 1440×1000 against 388.9px of text) and **its
  full value is nowhere on the screen**. This is a regression in reach traded for the collision
  repair, taken deliberately and recorded rather than left to be discovered.
- **Batch 9 must therefore _require_ a route to the full endpoint value, not permit one, and closes
  REQ-21 by doing so.** Its INT-4 as written only permits a two-or-three-property summary on the
  active context's row; a permission closes nothing, and on that wording REQ-21 would expire in
  silence. The plan's coverage table records the split as `4 (REQ-21's contexts half in 9)`.
- Option "add the expansion here" was refused deliberately: it is feature code this batch excludes,
  in a screen batch 9 rebuilds, and it would leave the intervening batches carrying a half-migrated
  screen.

### The 375×812 target is dominated by a different defect

At that viewport the truncation contract is not what is wrong with these screens. All three pass a
**fixed template to `Grid` at the call site** — `VolumesNetworksScreen.tsx:17` (`1fr 1fr`),
`SystemScreen.tsx:176` (`1fr 1.2fr`), `ContextsScreen.tsx:156` (`1.2fr 1fr`) — and none of those
templates collapses. Measured at 375×812: a volumes card is **89.5px** wide, a networks card 89.5px,
a contexts card ~160px, a storage row **116px**, and the daemon-info panel renders its values **one
character per line**. That is why the flexible runs measured 0px wide before this batch, not the
missing floor alone.

The contract clears every overlap there regardless — 17 → 0 card rows, 3 → 0 storage rows, the
trailing group taking its own line — but **the screens remain unusable at that width**, and no change
inside the library can fix it. `Grid` already ships `arrangement="pair"`, which collapses to one
column when its own box is too narrow; these three call sites do not use it. Feature-code work this
batch excludes, pinned to **batches 6, 9 and 14**.

### INT-5's premise was half wrong

`TwoLineCell`, `MetaCell` and `IdentifierCell` **already had the geometry right** before this batch:
`min-width: 0` with `overflow: hidden` / `text-overflow: ellipsis` / `white-space: nowrap` on the
lines, and `flex: none` on `TwoLineCell`'s inline action. Nothing was colliding in a table and nothing
needed repairing. What was true was the *other* half of the intervention — "one rule rather than two
implementations of one idea" — so the work delivered was to make those cells **consume the shared
contract classes**, and to make the wrapping variants *withhold* the line class rather than override
it. Consequence, and it is the expected one: **zero geometric change in any `DataTable` at any
viewport**, with the boundary now expressed as a class a cell does or does not carry.

### Not a divergence: the `CardList` call-site budget

The budget in `check-ui-conformance.mjs` that batch 9 lowers does not exist yet because **batch 5
introduces it** (its INT-12), with batches 6–12 each carrying their own decrement and batch 13
requiring zero. Noted only so the next reader does not re-report its absence as a defect.
