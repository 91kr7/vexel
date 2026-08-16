---
batch: 3
feature: The lists inside a row of another list — compose projects with their services, swarm configs & stacks with their stacks — become classic tables whose nesting reads by indentation
closed_req: [REQ-6, REQ-7, REQ-19, REQ-20]
depends: [1, 2]
---

# Batch 3 — The nested lists

Requirements: [`../requirements.md`](../requirements.md). Ids are local to this plan.

**What this batch is for.** Two lists in the product render a list **inside a row of another list**:
compose's per-project services (`ComposeScreen.tsx:449`, a header-less list inside the projects
list's row content) and swarm's per-stack services (`SwarmConfigsStacksPanel.tsx:325`, the same
composition). Today the card is what separates the two levels. With one presentation the child level
has to be legible as a child **inside the same surface**, by indentation and adjacency — and the
move that would be easiest, giving the parent or the child a surface of its own, is the exact thing
being retired, under a new name.

This batch also completes REQ-6: with the stacks content and compose's nested list converted, all
four lists that carry content below their cells have been through the ungated slot.

**What "on the same tracks" does and does not mean.** The child keeps the columns it declares today
(REQ-13) — compose's services and swarm's stack services declare their own, and changing them would
be a redesign. What is shared is the **surface, the pan region and the ruled treatment**; what
signals the nesting is the indentation.

**And the parent row is the reference row** (REQ-39, REQ-40, added 2026-08-16 after batch 1 met every
geometric criterion and was still rejected on sight). A **parent** row states no row modifier and
resolves to the containers row's height and alignment, and both tables sit **edge to edge in an
unpadded card holding the table and nothing else**, section header and toolbar above it — the
composition of `ContainersScreen.tsx:399`. The **child** rows are the only rows in this plan allowed
to differ from the reference, and only by their **indentation**: not by height, not by alignment, and
never by a surface. Neither list asks for content-sized rows.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/data/DataTable.tsx` | Give the library one way to state that a list is nested inside a row of another — a single, named, typed addition to the object list, with no Docker vocabulary in it — so that a child list is drawn indented within its parent's surface. **No new component, no near-duplicate, no "list card"**: if an existing prop already carries it, it is extended rather than joined. | REQ-7 | — |
| INT-2 | modify | `client/src/ui/data/data-table.css` | The indentation rule itself: the child's rows inset from the parent's cell edge by one spacing step from the tokens, ruled like every other row, inside the same surface and the same pan region. No length written on the spot; no surface, radius, outline or shadow introduced anywhere — an indentation that reintroduces a boundary is the defect coming back with better manners. | REQ-7 | INT-1 |
| INT-3 | modify | `client/src/compose/ComposeScreen.tsx` (:434 projects, :449 the nested service list, row content at :447, and the surface the list sits in) | Stop asking for the card presentation on both lists, state the nesting instead, and **make the outer list the containers table**: no row modifier on the parent row, the reference's height and alignment, the table edge to edge in an unpadded card holding it and nothing else. **Every project row still carries every one of its services, opened or not** — the grouping is the object's own shape, not a detail of the selection. The project's expansion, its tabs, the compose file view and the aggregated logs view are unchanged; the service columns are unchanged. | REQ-2, REQ-3, REQ-4, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-19, REQ-33, REQ-39, REQ-40 | INT-1, INT-2 |
| INT-4 | modify | `client/src/swarm/SwarmConfigsStacksPanel.tsx` (:292 configs, :317 stacks, :325 the nested list, row content at :323, and the surfaces the lists sit in) | The same, to the same reference, for all three call sites in the file: the configs list is a plain list, the stacks list carries its nested services, and both are drawn in the one presentation with the reference's row and the reference's surface. Names, ages, the stack's services and every action with its weight are unchanged. | REQ-2, REQ-3, REQ-4, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-20, REQ-33, REQ-39, REQ-40 | INT-1, INT-2 |
| INT-5 | modify | `client/test/unit/compose-screen.test.tsx` | Restate the assertions naming the retired presentation, **contract and state only**: the nested list is stated for every project row, every service of a project is rendered, the nesting is declared through the library's own prop rather than through a wrapper, and the project's values and actions are unchanged. No geometry in jsdom. | REQ-6, REQ-13, REQ-19, REQ-28, REQ-31 | INT-3, INT-4 |
| INT-6 | modify | `client/test/unit/library-layer-adoption-perimeter.test.ts` | Narrow the pinned list again by the two files converted here, and restate the row-content pin's own wording: the four files still supply the slot, and the slot is no longer conditional on a presentation. | REQ-28 | INT-3, INT-4 |
| INT-7 | modify | `client/e2e/compose-row-geometry.spec.ts` (:604), `client/e2e/swarm-row-geometry.spec.ts` | Restate the assertions and stated premises naming the retired presentation for these two screens — including the passage that describes each project row as carrying its services "in the comfortable variant, and nothing beside it". The subjects survive; only the qualifier goes. Nothing is weakened into passing. | REQ-19, REQ-20, REQ-28 | INT-3, INT-4 |
| INT-8 | modify | the criteria check created by `b1/INT-8`, in the client e2e tree | Extend it to compose and to swarm configs & stacks with the four criteria at the three viewports — **and add the nesting case, which is this batch's own**: with a real pointer, every service of a project is present and counted against the daemon's own reading; the child rows' cells are measurably **inset** from the parent row's; parent and child are inside **one** enclosing surface, neither carrying a corner radius or an outline of its own; the child rows are separated by the same hairline as any other row; and at 375×812 the child pans with its parent, with no column at zero. **And the equality**: a **parent** row's height, `align-items` and modifier set equal a containers/images row's, read in the same run, and each table's edges lie within 1px of its own surface's; the **child** row's only permitted difference from its parent is its indentation. The delivered figures on record first. | REQ-2, REQ-3, REQ-4, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-19, REQ-20, REQ-29, REQ-30, REQ-32, REQ-36, REQ-39, REQ-40 | INT-3, INT-4 |
| INT-9 | modify | `.sdd/modules/compose/specs/compose-screen.md`, `.sdd/modules/swarm/specs/swarm-configs-stacks-panel.md`, `.sdd/modules/swarm/index.md` | Record the one presentation and how a nested list is stated and drawn: one surface, indentation, the child's own columns. Corrected, not annotated. | REQ-27 | INT-3, INT-4 |

## Constraints on this batch's diff

- The library changes **before** the feature code does, within this batch: `INT-1` and `INT-2` land
  and are exported before `INT-3` and `INT-4` ask for them.
- No new component and no near-duplicate (REQ-1's standing constraint): the nesting is a property of
  the one object list, not a second list primitive or a wrapper.
- The indentation introduces **no surface, radius, outline or shadow** — a nested card is the retired
  presentation with a different name (REQ-3, REQ-7).
- No feature file gains a raw tag, a stylesheet, a `className`, a `style` prop or a hard-coded visual
  value (REQ-33). `check-ui-conformance.mjs` is not touched (REQ-34).
- No column, value, wording, order or action changes on either screen (REQ-13); the child list keeps
  its own columns.
- **Neither list states content-sized rows**, and the parent row carries no modifier the reference
  row does not (REQ-39). The surface is the reference's unpadded-card composition, reused rather
  than invented (REQ-40).
- The retired presentation is not deleted here — layer efficiency still uses it (REQ-22 is batch 5's).
- No server file (REQ-37). English only; kebab-case (REQ-38).

## Verification for this batch — targeted, never the full suite

- `npm run lint -w client` and `npm run test:typecheck -w client`.
- `npm run test:unit -w client -- test/unit/compose-screen.test.tsx test/unit/library-layer-adoption-perimeter.test.ts`
  plus the object list's own unit file if `INT-1` added behaviour to it.
- The e2e specs this batch changed, **each also run on its own**: the criteria check,
  `compose-row-geometry.spec.ts`, `swarm-row-geometry.spec.ts`.
- **Enumerate for the locator class batches 1 and 2 uncovered, not only for the presentation's
  name**: a spec reaching a panel through its heading (`.ui-section-header__title →
  closest('.ui-surface')`, or a `.ui-surface` filtered by the heading it contains) assumes the table
  and its header share one surface, which REQ-40 ends, and breaks without ever naming the
  presentation. **Two are known in advance and are met again here when Configs & Stacks converts** —
  `client/e2e/property-columns-ordinary-widths.spec.ts` and
  `client/e2e/property-columns-derived-count.spec.ts`, both reaching the swarm panels that way. Grep
  the locator shape across compose and swarm for the rest before starting.
- **A pinned figure may be re-recorded; a pinned rule may not.** Batch 2 met this on the swarm detail
  panel, which widened by exactly 58px at every viewport once the list's card stopped padding what it
  holds, while the certified property-column rule's outcome was unchanged at every width. A moved
  **figure** is re-recorded here, with its new value, its reason and its date. A moved **rule** — an
  outcome, a count, a threshold, a behaviour — is **reported, not re-recorded**: it is either a defect
  of this batch or a decision for the human (REQ-36).
- Test discipline (REQ-32): the compose fixture is the suite's own project, torn down in a `finally`;
  swarm is stubbed in the browser and the daemon is not put into swarm mode.
- The complete runs are the programme's closing step, not this batch's.

## What is reported back

The service counts per project and per stack, before and after — the number that says nothing was
silently dropped. The measured indentation of a child row against its parent, and the count of
enclosing surfaces around the pair. The four criteria's figures at the three viewports, before and
after.
