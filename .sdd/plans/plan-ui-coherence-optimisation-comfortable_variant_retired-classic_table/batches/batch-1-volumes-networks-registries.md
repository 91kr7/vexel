---
batch: 1
feature: The two-line lists that carry content below their cells — volumes, networks, registries — become the same table containers and images already are, and the library gains what their rows need
closed_req: [REQ-14, REQ-15]
depends: []
---

# Batch 1 — Volumes, networks and registries

Requirements: [`../requirements.md`](../requirements.md). Ids are local to this plan.

**What this batch is for.** Volumes is the list the human rejected on sight, and it is the two-line
case: a volume's name over its mount path. Networks and registries are the same shape and carry, in
addition, the content that lives **below** a row's cells — which today is drawn only when the
retired presentation is asked for. So this batch carries the two library changes the whole
conversion needs, and proves them on the screens where losing something would be most obvious.

> **Amended 2026-08-16, after this batch was implemented and rejected on sight.** The human's
> question was *"can't you use the same tables as images and containers?"* — and the four geometric
> criteria had all been met and measured (gap 0, radius 0, one hairline, column drift 0.00px). Two
> things the criteria never named had drifted: the **row** (`--auto-height`, 61.2px,
> `align-items: start`, against the reference's unmodified 56px `center` row — whose own two-line
> cell measures 36.2px and needs no extra room) and the **surface** (a padded card holding the table
> beside its header, against the reference's unpadded card holding the table and nothing else, edge
> to edge). **REQ-39 and REQ-40** now state the equality; `INT-3`, `INT-4`, `INT-5` and `INT-8`
> below carry it, and the fix to this batch is judged against them.

**The one thing that must be done before anything else** is `INT-1`. The slot that draws content
below a row's cells is gated on the retired presentation (`DataTable.tsx:382`,
`comfortable && renderRowContent`), while the expansion declared on the very next line is not.
Convert a list before removing that gate and its content disappears with no error, no type change
and no shorter list — only shorter rows.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/data/DataTable.tsx` (:382, and the prop's own documentation at :104-:111, :123-:129) | **Enabling.** Ungate the below-the-cells row-content slot from the presentation choice: it renders whenever the caller supplies it, exactly as the expansion beside it already does. Nothing else about the retired presentation changes here — it still draws, so the two lists that use the slot and are not converted in this batch keep their content until their own batch. | REQ-6 | — |
| INT-2 | modify | `client/src/ui/data/data-table.css` (`.ui-data-table__row-content` at :126-:132) | Give that slot the **ruled row's own inline inset**, so its content lines up with the cells above it in the one presentation. The retired presentation's wider inset (`--space-5`, matching its card padding) stays scoped to the retired presentation for as long as it exists. No new token, no length written on the spot. | REQ-5, REQ-6 | INT-1 |
| INT-3 | modify | `client/src/volumes-networks/VolumesPanel.tsx` (:258, and the surface the list sits in) | Stop asking for the card presentation, and **make the list the containers list**: the row states **no** row modifier and no content-sized rows — the reference's fixed-height, centre-aligned row carries a title over a monospace subtitle unclipped, and the volume name over its mount path is that same cell — and the table sits **edge to edge in an unpadded card holding it and nothing else**, with the section header and the toolbar above that card, as `ContainersScreen.tsx:399` composes it. Name over mountpoint, driver, size, mounting containers, the row actions and their weights, the inline inspect and the empty state are **unchanged**. | REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-33, REQ-39, REQ-40 | INT-1, INT-2 |
| INT-4 | modify | `client/src/volumes-networks/NetworksPanel.tsx` (:287, row content at :293, and the surface the list sits in) | The same, to the same reference. **The attached-container chips and their inline detach stay**, now drawn by the ungated slot; the detach still acts on the chip it is on. Driver, scope, subnet, attached containers and the actions are unchanged. | REQ-2, REQ-3, REQ-4, REQ-6, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-33, REQ-39, REQ-40 | INT-1, INT-2 |
| INT-5 | modify | `client/src/registries/RegistriesScreen.tsx` (:290 registries, :338 repositories, row content at :342, and the surfaces the two lists sit in) | The same, to the same reference, for both lists. The repositories list **keeps its per-repository content**; host, account, credential store, authentication state and the plain-http flag keep their values and their order; `Log in` / `Log out` stay the row actions they are, with their weights. | REQ-2, REQ-3, REQ-4, REQ-6, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-15, REQ-33, REQ-39, REQ-40 | INT-1, INT-2 |
| INT-6 | modify | `client/test/unit/library-layer-adoption-perimeter.test.ts` (:82-:97, :183-:188) | Narrow the pinned list of files allowed to state the retired presentation to the ones **not yet converted** — this file fails if a migration lands without it being narrowed in the same commit, which is the point of it. The row-content pin (:103-:110) keeps its four files and records that the slot is no longer conditional on a presentation. | REQ-28 | INT-3, INT-4, INT-5 |
| INT-7 | modify | `client/test/unit/volumes-panel.test.tsx`, `client/test/unit/networks-panel.test.tsx`, `client/test/unit/registries-screen.test.tsx`, `client/test/unit/data-table-comfortable-variant.test.tsx` (:210) | Restate the assertions that name the retired presentation against the one presentation. **Contract and state only** — which props each call site states, that the chips and the repository content are rendered, that every value still renders in its column and in order. No geometry here: jsdom reports every box as zero, so a "the rows are flush" unit assertion passes on any build. **One assertion in the library's own file inverts and must be done in this batch's commit**: `data-table-comfortable-variant.test.tsx:210` currently pins that the dense presentation *ignores* the row content, which is precisely the gate `INT-1` removes; it becomes "the slot renders whatever the presentation", and the file's remaining assertions are batch 5's to dispose of. | REQ-6, REQ-13, REQ-14, REQ-15, REQ-28, REQ-31 | INT-1, INT-3, INT-4, INT-5 |
| INT-8 | create | client e2e tree, the object-list geometry area | The **classic-table criteria check** for these three lists, at 1440×1000, 1280×800 and 375×812, driven with a real pointer at each control's own coordinates: the inter-row gap is 0; no row carries a corner radius, an outline or a surface of its own and adjacent rows are separated by one hairline; the list has one enclosing surface with its header inside it; every header cell's left edge equals its column's body cells', at rest **and** at several horizontal scroll offsets. Plus, on the same lists: both lines of a two-line row measured present and unclipped (the volume name **and** its mount path); the networks chips present, counted and their detach operable; the repository content present; one expansion open at a time and pinned to the pan region while it pans; at 375×812 the list pans and no column resolves to zero width. **And the equality with the reference, which is what this batch was rejected for the first time**: a body row of each converted list resolves to the **same height, the same `align-items` and the same modifier set** as a row of the containers and images lists — both read **from those lists in the same run**, never from a number written into the check — and each table's left and right edges lie within **1px** of its own surface's, with exactly one surface around it. Named certified predecessors asserted rather than assumed: no copy affordance anywhere on these rows, and the detail property column rule on the panels these rows expand into. **Run against the delivered build first and recorded failing, with its measurements.** | REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-14, REQ-15, REQ-29, REQ-30, REQ-32, REQ-36, REQ-39, REQ-40 | INT-3, INT-4, INT-5 |
| INT-9 | modify | `client/e2e/volumes.spec.ts` (:23), `client/e2e/networks.spec.ts` (:23), `client/e2e/registries.spec.ts` (:36), `client/e2e/copy-affordance-absence.spec.ts` (:451, :627), `client/e2e/list-order.spec.ts` (:306), `client/e2e/table-row-layout-uniform.spec.ts` (:303-:309, :406) | Restate every assertion and every stated premise that names the retired presentation **for these three screens only** — the other files' subjects belong to later batches and are left alone. In `table-row-layout-uniform.spec.ts`, volumes and networks stop being "the comfortable subjects measured against the dense control" and become subjects of the one presentation; build cache stays as it is until batch 2. Nothing is weakened into passing: an assertion whose subject survives is restated, never relaxed. | REQ-14, REQ-15, REQ-28, REQ-36 | INT-3, INT-4, INT-5 |
| INT-10 | modify | `.sdd/modules/volumes-networks/specs/volumes-panel.md`, `.sdd/modules/volumes-networks/specs/networks-panel.md`, `.sdd/modules/registries/specs/registries-screen.md`, `.sdd/modules/registries/index.md` | Record the one presentation for these lists: how the list is drawn, that the row content is unconditional, and that two-line rows are sized by their content. A spec is what the next implementer reads as current, so it is corrected, not annotated. | REQ-27 | INT-3, INT-4, INT-5 |

## Constraints on this batch's diff

- Nothing outside `client/src/ui/` gains a raw DOM tag, a stylesheet, a `className`, a `style` prop,
  or a hard-coded colour, radius, blur, spacing, shadow, font size or z-index. The three feature
  files change only by ceasing to ask for a presentation and by stating what the one presentation
  needs (REQ-33).
- `client/scripts/check-ui-conformance.mjs` is **not touched by this batch** — the blur half, the
  allow-list and the background asset least of all (REQ-34).
- No column, value, wording, order, action, sort, empty state or detail panel changes on any of the
  three screens (REQ-13). If something looks improvable, it is left alone: the result has to be
  comparable to the delivered build.
- **No converted list states content-sized rows** (REQ-39). If one of these three appears to need
  them, the measurement that proves it is reported and the exception recorded on the spot — the
  reference's own two-line cell fits its fixed-height row, so the burden of proof is on the
  exception, not on the equality.
- **The surface is composed, not invented** (REQ-40): reuse the unpadded-card pattern the reference
  already uses; extend the library only if a panel genuinely cannot be composed from what exists,
  recording the reason; never a local workaround in feature code.
- No server file, no API, no daemon behaviour (REQ-37). English only; kebab-case for any new file
  (REQ-38).
- The retired presentation is **not** deleted here. It still draws, and the screens not yet
  converted still use it; the tree compiles and the product works at this batch's boundary.

## Verification for this batch — targeted, never the full suite

- `npm run lint -w client` and `npm run test:typecheck -w client`.
- `npm run test:unit -w client -- test/unit/volumes-panel.test.tsx test/unit/networks-panel.test.tsx test/unit/registries-screen.test.tsx test/unit/library-layer-adoption-perimeter.test.ts`
- The e2e specs this batch changed or added, **and each of them also run on its own**: the new
  criteria check, `volumes.spec.ts`, `networks.spec.ts`, `registries.spec.ts`,
  `copy-affordance-absence.spec.ts`, `list-order.spec.ts`, `table-row-layout-uniform.spec.ts`.
- Test discipline (REQ-32): own labelled fixtures — a volume, a network with a container attached to
  it, a registry entry — removed in a `finally` with `docker rm -fv` for containers, no assumption of
  an empty daemon, no inherited application state, the run's own data directory, nothing reaching
  Docker Hub, every spec passing on its own.
- The complete client unit run and the complete e2e run are **not** this batch's: they are the
  closing step of the programme, once, after batch 6.

## What is reported back

The measurements, before and after, for each of the three lists at each of the three viewports: the
inter-row gap, the row's corner radius, the count of enclosing surfaces, and the header-to-body
column edge deltas. **And, beside each of them, the reference's own figure read in the same run** —
the containers row's height, alignment and modifier set, and the containers table's edges against
its card's — so that the equality is reported as a comparison rather than as a pair of numbers that
happen to look similar. Plus the count of networks chips and repository content rows before and
after. A "before: failed" with no numbers is not evidence on a layout defect.
