---
batch: 6
feature: F6 — volumes and networks listed and revealed like every other object
closed_req: [REQ-31, REQ-32, REQ-33, REQ-34, REQ-35]
depends: [5]
---

# Batch 6 — volumes-networks

The screen that shows the detail defect at its worst: the expansion happens **inside the narrow card
column**, forced to one column, values wrapping mid-hash, and the `RAW PAYLOAD` JSON block rendered
into roughly 250px where it is unreadable. Two independent panels can also be open at once, giving
the screen two parallel long scrolls.

The lists are **not hand-built**: both panels consume `CardList` (`VolumesPanel.tsx:209`,
`NetworksPanel.tsx:265`), so this is a call-site migration.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, volumes-networks area | The check, written and run **first**. Open a volume's detail with a **real pointer click** and assert its box spans the screen's content column, not the card column; assert the raw payload block's width; assert every property value is left-aligned. Then open a network's detail while the volume's is open and assert **the volume's has closed**. At 1440×1000, 1280×800 and 375×812. Report the panel and payload widths before and after. | REQ-32, REQ-33, REQ-34 | — |
| INT-2 | modify | `client/src/volumes-networks/VolumesPanel.tsx` | Migrate the list from `CardList` to the object list's comfortable variant, deleting the row-content builder it replaces. Driver, mountpoint, size and mounting containers keep their values and their order; the mountpoint keeps batch 4's truncation contract. The panel's actions — create, remove, prune — go through the action cluster. | REQ-31, REQ-35 | INT-1 |
| INT-3 | modify | `client/src/volumes-networks/NetworksPanel.tsx` | The same migration for networks: driver, scope, subnet/gateway and attached containers as chips with their inline detach. **`+ Attach` becomes a control of the cluster**, not bare text, and still attaches the container it attaches today. | REQ-31, REQ-35 | INT-1 |
| INT-4 | modify | `client/src/volumes-networks/VolumesPanel.tsx`, `client/src/volumes-networks/NetworksPanel.tsx` | Move the inline inspect surfaces onto the detail-panel primitive: full content width, the two-column property grid, **left-aligned values including the network `Options`**, the raw payload getting the panel's full width. One open at a time, enforced by the primitive rather than by this screen. | REQ-32, REQ-33, REQ-34 | INT-2, INT-3 |
| INT-5 | modify | `client/src/volumes-networks/VolumesNetworksScreen.tsx` | Whatever the two-panel layout must give up so that a detail panel can be full-width: the list stays in its panel, the revealed detail is not confined to it. Page-level actions sit where page-level actions belong. | REQ-32, REQ-35 | INT-4 |
| INT-6 | modify | `.sdd/modules/volumes-networks/specs/*.md`, `.sdd/modules/volumes-networks/index.md` | Record the screen's new shape: which primitive lists, which reveals, where the actions live. English only. | REQ-31, REQ-32, REQ-35 | INT-2 … INT-5 |
| INT-7 | modify | client unit and e2e suites covering this screen | Update the coverage the migration invalidates, keeping every assertion about **what the screen does** — create, remove, prune, attach, detach, and the reclaimed space reported — and restating only those about how it was drawn. | REQ-31, REQ-35 | INT-2 … INT-5 |

## Constraints on this batch

- **Every operation still performs the same operation** (REQ-35): create, remove and prune through
  the confirmation service with the reclaimed space reported; attach and detach from the chip group.
  A migration that loses a capability has failed regardless of how it looks.
- Feature code composes library components and nothing else: no raw tag, no `style`, no CSS, no
  hard-coded value. Anything the migration needs that the library lacks is added to
  `client/src/ui/` and exported first.
- `CardList` remains exported (batch 13 removes it); this batch simply stops calling it. **Lower the
  call-site budget in `client/scripts/check-ui-conformance.mjs` by the two sites removed here** — the
  check fails if the actual count is higher **or** lower than expected, so the budget is lowered
  deliberately or the batch does not go green. It must reach zero in batch 13.
