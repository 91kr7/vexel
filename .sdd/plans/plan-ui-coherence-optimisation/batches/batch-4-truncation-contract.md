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
