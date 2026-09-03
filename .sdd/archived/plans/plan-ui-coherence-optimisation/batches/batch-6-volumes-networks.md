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

## Recorded 2026-08-17 — the presentation this batch migrated onto was retired afterwards

**Nothing in this file is edited, and that is deliberate**: it is the record of what was built and
what it was accepted on. The **comfortable** variant `INT-2` and `INT-3` migrate these two lists onto
— each row on a card of its own, under a floating column header — was **retired on 2026-08-16**,
prop, carrier surface, stylesheet rules and header-inset compensation together, and both lists were
converted again, onto the one table presentation containers and images already shipped. Volumes is
the screen that triggered that decision: a volume's name over its mount path. This batch's acceptance
and the figures in its "Measured at implementation" section were taken against the card row and are
read as of their own date, not as a description of what ships. Where the decision is written:
`.sdd/plans/plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/` (REQ-14,
REQ-22, REQ-26), on
`.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, volumes-networks area | The check, written and run **first**. Open a volume's detail with a **real pointer click** and assert its box spans the screen's content column, not the card column; assert the raw payload block's width; assert every property value is left-aligned. Then open a network's detail while the volume's is open and assert **the volume's has closed**. At 1440×1000, 1280×800 and 375×812. Report the panel and payload widths before and after. | REQ-32, REQ-33, REQ-34 | — |
| INT-2 | modify | `client/src/volumes-networks/VolumesPanel.tsx` | Migrate the list from `CardList` to the object list's comfortable variant, deleting the row-content builder it replaces. Driver, mountpoint, size and mounting containers keep their values and their order; the mountpoint keeps batch 4's truncation contract. The panel's actions — create, remove, prune — go through the action cluster. | REQ-31, REQ-35 | INT-1 |
| INT-3 | modify | `client/src/volumes-networks/NetworksPanel.tsx` | The same migration for networks: driver, scope, subnet/gateway and attached containers as chips with their inline detach. **`+ Attach` becomes a control of the cluster**, not bare text, and still attaches the container it attaches today. | REQ-31, REQ-35 | INT-1 |
| INT-4 | modify | `client/src/volumes-networks/VolumesPanel.tsx`, `client/src/volumes-networks/NetworksPanel.tsx` | Move the inline inspect surfaces onto the detail-panel primitive: full content width, the two-column property grid, **left-aligned values including the network `Options`**, the raw payload getting the panel's full width. One open at a time, enforced by the primitive rather than by this screen. | REQ-32, REQ-33, REQ-34 | INT-2, INT-3 |
| INT-5 | modify | `client/src/volumes-networks/VolumesNetworksScreen.tsx` | Whatever the two-panel layout must give up so that a detail panel can be full-width: the list stays in its panel, the revealed detail is not confined to it. Page-level actions sit where page-level actions belong. | REQ-32, REQ-35 | INT-4 |
| INT-6 | modify | `.sdd/modules/volumes-networks/specs/*.md`, `.sdd/modules/volumes-networks/index.md` | Record the screen's new shape: which primitive lists, which reveals, where the actions live. English only. | REQ-31, REQ-32, REQ-35 | INT-2 … INT-5 |
| INT-7 | modify | client unit and e2e suites covering this screen | Update the coverage the migration invalidates, keeping every assertion about **what the screen does** — create, remove, prune, attach, detach, and the reclaimed space reported — and restating only those about how it was drawn. | REQ-31, REQ-35 | INT-2 … INT-5 |

## Measured at implementation — what this batch's premises were worth, and two orphans it leaves

Figures taken on the delivered build at `56b0c90` and on this one, built and served side by side
against the same daemon (2 volumes, 3 networks), at 1440×1000, 1280×800 and 375×812.

**1. The pair could not be repaired with a prop, so `Grid` left the screen.** Batches 4 and 5 both
pinned `VolumesNetworksScreen.tsx:17` (`columns="1fr 1fr"`, cards at 158px at 375×812) to this batch
as a one-prop fix — `Grid arrangement="pair"`, which collapses. It is not the fix here. The detail is
revealed as the row's own expansion, so a list's width **is** the panel's width, and a collapsing
pair still leaves the panel at 482px of a 1120px content column at 1440×1000 — REQ-32's own
constraint, less severe than the delivered one and the same one. Side by side and a full-width detail
are incompatible, so the screen is a `Stack` and the `Grid` call site is gone rather than corrected.
**The stronger reason, which neither the plan nor the implementer stated first**: containers and
images are already single full-width lists, so this was the last screen in the product answering
"how is a list laid out" differently. The cost is recorded in `volumes-networks-screen.md`: the two
lists no longer share a fold (pair ended at y=598, the stack runs to y=966, past the fold at
1280×800). **The pin still stands for `ContextsScreen.tsx:156` (batch 9) and `SystemScreen.tsx:176`
(batch 14)**, where no full-width reveal is at stake.

**2. "Roughly 250px" for the `RAW PAYLOAD` block is an eyeball, not a measurement, and the worst case
is five times worse.** Delivered, measured: **442px at 1440×1000, 362px at 1280×800, 50px at
375×812** (the volume panel itself 482 / 402 / **90px**, inside cards of 550 / 470 / **158px**). After:
**1012 / 852 / 229px**, the panel 1012 / 852 / 229px. At 375×812 the delivered `Mountpoint` and
`Options` values measured **0px wide** — 266 wrapped lines for `Options` — against 130px and 148px
(16 lines) now.

**3. The right-aligned value held everywhere and showed nowhere but here.** `.ui-definition-list__value`
computed `text-align: right` on **every** property value in the product, not only on networks: it is
inert for a value that fits on one line, because the box is sized to its content, and live only for
one that wraps. That is why one screen exhibited a rule that was everywhere. Removing the one
declaration leaves every value computing `start`; nothing else depended on it — no override, no other
rule, no assertion in either test tree.

**4. The one-open guarantee is the component's, and this is the first evidence of it.** Observed at
1440×1000 with a real pointer at each row's own coordinates: volumes open → `1 volume panel, 1
volume row aria-selected`; then a **networks** row → `0 volume panels, 0 volume rows aria-selected, 1
network panel`; then a volumes row again → the reverse, symmetrically. The falsification the
stacking hypothesis fails: the two panels are sibling components with independent state and the
screen holds none, so a click in the Networks card has **no route** to `VolumesPanel`'s
`selectedName` other than `DetailPanel`'s module-level singleton calling that panel's own `onClose` —
and `aria-selected` is rendered from that state, so it could not have flipped by layout. The
delivered build, with the same two independent states, measured **2 panels open**. Both halves are
therefore live: `DataTable`'s (one `expandedRowKey` per list — a second network row replaces the
first) and `DetailPanel`'s (across the two lists).

**5. Four `EmptyState` call sites became eight**, which is REQ-25's insistence doing its work: each of
the four carried a *loading* state and an *empty* state in one element, so filling in the description
and the resolving action forced them apart. Four now state an explanation (two with the action that
resolves them, `Create volume…` / `Create network…`); the four loading ones keep explicit `null`s.

### Two orphans left standing, deliberately, each with the batch that owns it

- **For batch 13** — `ChipGroup`'s `addLabel` / `onAdd` now have **no call site in the client**, this
  panel's `+ Attach` having been the only one, and the affordance they render is precisely the bare
  text REQ-27 forbids. Same situation as `KeyHint` in REQ-93, and batch 13 is already retiring a
  component with its coverage: going with them are `client/test/unit/chip.test.tsx` ("shows no add
  affordance when addLabel/onAdd are not both given", "shows the trailing add affordance and calls
  onAdd when used") and the three lines of `ui-library/specs/chip.md` that state them. Not done here:
  it is a library deletion with its own tests, outside this batch's interventions.
- **For batch 19** — this screen now carries **two `ScreenToolbar`s**, one per list, where every other
  screen carries one. Moving the actions out of the card headers was obligatory (that placement is
  one of the three REQ-81 must reduce to one), but a single screen-level toolbar would have to lift
  create and prune — their dialogs, the confirmation, the toast and the progress — out of both panels
  and through `Shell`, which is a rewrite this batch does not ask for. It is a legitimate consequence
  of two independent lists on one screen rather than a defect; REQ-81 should **judge it on that
  argument** rather than discover it as a count of two.

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
