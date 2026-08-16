---
batch: 2
feature: The lists that carry nothing below their cells — builders & build cache, contexts, plugins, swarm nodes, services and secrets — become the same table containers and images already are
closed_req: [REQ-16, REQ-17, REQ-18]
depends: [1]
---

# Batch 2 — The plain lists

Requirements: [`../requirements.md`](../requirements.md). Ids are local to this plan.

**What this batch is for.** Nine call sites across six files and four screen areas, none of which
carries content below its cells and none of which nests a list inside a row. Their risk is identical
and their verification is one assertion repeated — which is exactly why they are one batch and not
four. The one measurement that is *not* repeated is the Plugins case: the reference analysis's own
evidence, a lone `–` read roughly 1100px from the `WHY UNAVAILABLE` header that names it.

**The target is not a description, it is two lists that ship** (REQ-39, REQ-40, added 2026-08-16
after batch 1 met every geometric criterion and was still rejected on sight). Each of these lists
must end up **the containers table**: a row with **no modifier**, the reference's height and vertical
alignment, and the table **edge to edge in an unpadded card holding it and nothing else**, section
header and toolbar above that card — the composition of `ContainersScreen.tsx:399` and
`ImagesScreen.tsx:610`, the only two unpadded cards in the client. Batch 1 drifted on exactly these
two points; this batch is written so it starts where batch 1 finished.

**The library is not changed by this batch.** Everything these lists need already exists — and in
particular **none of them asks for content-sized rows**: containers' own two-line cell measures
36.2px inside its 56px row, so a second line is not a reason for a taller row. If an implementer
finds themselves adding a prop, a variant or a rule to `client/src/ui/` here, something has been
misread — report it rather than build it.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/builders/BuildersScreen.tsx` (:362 builders, :389 build cache, and the surfaces the two lists sit in) | Stop asking for the card presentation on both lists and **make each one the containers table**: no row modifier, the reference's row height and alignment, the table edge to edge in an unpadded card holding it and nothing else, the section header and toolbar above that card. Name, driver, endpoint, platforms, status, cache size, the active-builder marker, the cache records and every row action with its weight are unchanged. | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-16, REQ-33, REQ-39, REQ-40 | — |
| INT-2 | modify | `client/src/contexts/ContextsScreen.tsx` (:260, and the surface the list sits in) | The same, to the same reference, for the contexts list, whose row carries the active-selection state and the endpoint the row truncates. Name, endpoint, kind, TLS and the active marker keep their values; the switch action keeps its weight and its place. | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-17, REQ-33, REQ-39, REQ-40 | — |
| INT-3 | modify | `client/src/plugins/PluginsScreen.tsx` (:318 CLI plugins, :356 managed plugins, and the surfaces the two lists sit in) | The same, to the same reference, for both lists. **This is the named case**: the `WHY UNAVAILABLE` column and its values must share one left edge afterwards. Name, version, availability and the reason keep their values and their columns; no column is added, renamed or reordered to make the point. | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-18, REQ-33, REQ-39, REQ-40 | — |
| INT-4 | modify | `client/src/swarm/SwarmNodesPanel.tsx` (:210, and the surface the list sits in) | The same, to the same reference, for the nodes list: managers first then hostname order, role, availability, state and the removal action unchanged. | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-20, REQ-33, REQ-39, REQ-40 | — |
| INT-5 | modify | `client/src/swarm/SwarmServicesPanel.tsx` (:335, :364, and the surfaces the two lists sit in) | The same, to the same reference, for both service lists: name order, image, mode, replicas, ports, the scaling control and the actions unchanged. | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-20, REQ-33, REQ-39, REQ-40 | — |
| INT-6 | modify | `client/src/swarm/SwarmSecretsPanel.tsx` (:189, and the surface the list sits in) | The same, to the same reference, for the secrets list: name order, age, and the write-once treatment of a value that is never read back, unchanged. | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-20, REQ-33, REQ-39, REQ-40 | — |
| INT-7 | modify | `client/test/unit/builders-screen.test.tsx`, `client/test/unit/contexts-screen.test.tsx`, `client/test/unit/plugins-screen.test.tsx` | Restate the assertions naming the retired presentation against the one presentation, **contract and state only** — which props each call site states, every value rendered in its column and in order, the action weights. No geometry in jsdom. There is no swarm unit file naming the presentation; none is created for that purpose. | REQ-13, REQ-16, REQ-17, REQ-18, REQ-28, REQ-31 | INT-1 … INT-6 |
| INT-8 | modify | the criteria check created by `b1/INT-8`, in the client e2e tree | Extend it to these lists — the four screen areas, at the three viewports, with a real pointer — asserting the same four criteria, both lines of any two-line row, one expansion at a time, and the pan at 375×812 with no column at zero. **Plus the equality with the reference on every one of these lists**: the row's height, `align-items` and modifier set equal to a containers/images row's, and the table's left and right edges within 1px of its own surface's — both sides read **in the same run** from the reference lists as they stand, never from a number written into the check. **Plus the named case, asserted as boxes**: on the CLI plugins list at 1440×1000, the `WHY UNAVAILABLE` header's left edge equals its cells', and the delivered drift is on record beside it. Swarm is driven against the stubbed cluster the suite already uses; nothing initialises a swarm on the daemon. | REQ-2, REQ-3, REQ-4, REQ-5, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-16, REQ-17, REQ-18, REQ-20, REQ-29, REQ-30, REQ-32, REQ-36, REQ-39, REQ-40 | INT-1 … INT-6 |
| INT-9 | modify | `client/e2e/contexts-row-geometry.spec.ts` (:356), `client/e2e/plugins-row-geometry.spec.ts` (:462), `client/e2e/builders-row-geometry.spec.ts` (:712), `client/e2e/swarm-row-geometry.spec.ts` (:350), `client/e2e/contexts.spec.ts` (:61), `client/e2e/exclusive/plugins.spec.ts` (:39), `client/e2e/list-order.spec.ts` (:373), `client/e2e/table-row-layout-uniform.spec.ts` (build cache, :406) | Restate every assertion and stated premise naming the retired presentation for **these** screens. The two that assert its class outright (`contexts-row-geometry:356`, `plugins-row-geometry:462`) become assertions about the one presentation — they counted how many lists were drawn that way, and the restated form counts the lists and asserts none of them is a card. The measurements that used the retired presentation as their subject keep their subject and lose the qualifier. Nothing is weakened into passing. | REQ-16, REQ-17, REQ-18, REQ-28 | INT-1 … INT-6 |
| INT-10 | modify | `.sdd/modules/builders/specs/builders-screen.md`, `.sdd/modules/contexts/specs/contexts-screen.md`, `.sdd/modules/contexts/index.md`, `.sdd/modules/plugins/specs/plugins-screen.md`, `.sdd/modules/swarm/specs/swarm-nodes-panel.md`, `.sdd/modules/swarm/specs/swarm-services-panel.md`, `.sdd/modules/swarm/specs/swarm-secrets-panel.md`, `.sdd/modules/swarm/index.md` | Record the one presentation for these lists. Corrected, not annotated: a spec is what the next implementer reads as current. | REQ-27 | INT-1 … INT-6 |

**Note on `b1/INT-6`.** The adoption-perimeter pin
(`client/test/unit/library-layer-adoption-perimeter.test.ts`) must be narrowed again in this batch's
own commit, by the six files converted here. It is not listed as an intervention of its own because
it is the same edit `b1/INT-6` describes, repeated; it is listed here so it is not forgotten — the
test is written to fail if a migration lands without it.

## Constraints on this batch's diff

- No feature file gains a raw DOM tag, a stylesheet, a `className`, a `style` prop or a hard-coded
  visual value (REQ-33); nothing in `client/src/ui/` changes at all.
- `client/scripts/check-ui-conformance.mjs` is not touched (REQ-34).
- No column, value, wording, order, action, sort, empty state or detail panel changes (REQ-13). The
  Plugins case is fixed by the rows ceasing to be cards, **not** by moving a column.
- **No list here states content-sized rows** (REQ-39), and the surface is composed by reusing the
  reference's unpadded-card pattern rather than invented locally (REQ-40). A list that appears to
  need either reports the measurement proving it instead of taking the exception silently.
- The retired presentation is not deleted here; compose, swarm configs & stacks and layer efficiency
  still use it and still draw correctly.
- No server file (REQ-37). English only; kebab-case (REQ-38).

## Verification for this batch — targeted, never the full suite

- `npm run lint -w client` and `npm run test:typecheck -w client`.
- `npm run test:unit -w client -- test/unit/builders-screen.test.tsx test/unit/contexts-screen.test.tsx test/unit/plugins-screen.test.tsx test/unit/library-layer-adoption-perimeter.test.ts`
- The e2e specs this batch changed, **each also run on its own**: the criteria check,
  `contexts-row-geometry.spec.ts`, `plugins-row-geometry.spec.ts`, `builders-row-geometry.spec.ts`,
  `swarm-row-geometry.spec.ts`, `contexts.spec.ts`, `list-order.spec.ts`,
  `table-row-layout-uniform.spec.ts`, and `exclusive/plugins.spec.ts` in the exclusive project.
- Test discipline (REQ-32) as batch 1; the swarm coverage stubs its cluster in the browser and
  initialises nothing on the daemon.
- The complete runs are the programme's closing step, not this batch's.

## What is reported back

Per screen area and per viewport: the inter-row gap, the row corner radius, the count of enclosing
surfaces and the header-to-body column edge deltas, before and after — **each beside the reference's
own figure read in the same run**, so the equality is reported as a comparison. And, separately, the
Plugins `WHY UNAVAILABLE` figure — the delivered distance between the value and its header, and the
value after — in px.
