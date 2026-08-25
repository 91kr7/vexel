---
batch: 2
feature: F1 — The containers list presents one card per container
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36, REQ-37, REQ-38, REQ-53]
depends: [1]
---

# Batch 2 — containers-card-view

The requirement texts live in [`requirements.md`](../requirements.md); they are cited here by id
only.

**The mock is normative for placement.** `.sdd/analysis/ui-mock/containers-refactor.png` decides
which band an element sits in, its order within that band, its alignment and what it is aligned to.
The element map in `requirements.md` is that image read out in words; **where they disagree, the
image wins** (REQ-11). Spacings, sizes, colours and weights come from the library's existing tokens —
the mock is not a pixel specification and nothing is copied out of it.

**This batch renders whatever it is given.** It changes no cadence and builds no lifecycle. Its one
server-side intervention (INT-1) widens a data shape using a daemon frame the sampler already
fetches; it makes **no new request to the daemon**. The gate and the interval are batch 3's, and
building any part of them here would be the mistake the spec names.

**Three standing rules bound every intervention below.**
- Nothing under `client/src/` outside `client/src/ui/` emits a raw DOM tag, imports a stylesheet,
  carries a `style` or visual `className` prop, or writes a colour, radius, spacing, shadow, font
  size or z-index (REQ-31). The library changes first, then the feature code consumes it.
- **The card's material is the table's, referenced and never restated** (REQ-28). Concretely, in this
  codebase: the box is `.ui-surface` (`--radius-xl`, hairline `--color-border-subtle`,
  `--color-surface-1`, its elevation shadow); the hover highlight is `var(--color-surface-2)` and the
  selected highlight `var(--color-accent-tint)` — the exact tokens `.ui-data-table__row:hover` and
  `.ui-data-table__row--selected` already carry; the state colours are `--color-success` /
  `--color-warning` / `--color-danger` / `--color-text-muted`. **No new value is written. A second
  rule referencing the same token is the reuse; a second declaration of the value is the defect.**
- **No blur, anywhere** (REQ-33). This screen is main view. `client/scripts/check-ui-conformance.mjs`
  is not opened by this batch at all — batch 1 finished with it — unless the exception at the end of
  this file applies.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `server/src/containers/containers-service.ts` | Carry out of the stats frame the sampler **already fetches** the two values the card needs and the code currently discards: the network in/out totals (summed across the frame's interfaces, the same reading `ContainerStatsService` normalises for the detail panel, so the two cannot disagree) and the online CPU count (`cpu_stats.online_cpus`, today computed inside `computeUsage` and thrown away). Both join `SampledUsage` and `ContainerSummary`, beside the memory limit that is already there. **No new daemon request, no new endpoint, no change to the sampling's rate or lifecycle.** | REQ-13 | — |
| INT-2 | modify | `.sdd/modules/containers/specs/containers-service.md`, and `specs/containers-endpoints.md` if it restates the summary shape | Record the widened `ContainerSummary` and where each new field comes from, so the next reader does not conclude a second daemon call was added. | REQ-13 | INT-1 |
| INT-3 | modify | `client/src/ui/glass/Surface.tsx` + `client/src/ui/glass/surface.css`, forwarded through `client/src/ui/glass/Card.tsx` | Extend `Surface` with (a) a **selectable/selected treatment** — hover and selected highlights referencing the two tokens the table row already uses — and (b) a **state accent edge**: a full-height bar on the left, following the surface's own left rounding, in a state colour token. `Card` forwards both as optional props. **Every existing `Surface`/`Card` call site renders exactly what it renders today**, and no `card.css` is created (`specs/card.md`'s "no card stylesheet" invariant stands). This is the ordering the spec fixes, at step 2: extend, do not duplicate. | REQ-2, REQ-18, REQ-28, REQ-29, REQ-30, REQ-31, REQ-33 | — |
| INT-4 | modify | `client/src/ui/metrics/Meter.tsx` + its stylesheet | Two additions to the delivered `label` (left) / `reading` (right) / track anatomy: a **prominent value beside the label**, so a column reads `CPU 0.4%` … `of 8 cores` with two typographic treatments and not one string; and an explicit ***no sample* state** — `—`, the stated wording in the reading's place, and an **empty** track. That state is **distinct from the existing "no measurable maximum" treatment**, which deliberately does not draw an empty track: an unlimited container must not look unmeasured. The fill takes a tone from the caller, so it can carry the container's state colour. Nothing is animated or transitioned. | REQ-7, REQ-13, REQ-16, REQ-17, REQ-30 | — |
| INT-5 | create | client UI library, metrics area (`client/src/ui/metrics/`) | The **metric strip**: a row of metric columns — two of equal width each carrying a reading with a track, then a narrower one carrying a **pair of readings and no track** — with the paired readings sitting on the **same baseline as the tracks beside them**, and the whole strip stacking to one full-width column below the phone breakpoint, each column keeping its label, value, capacity note and track. Domain-agnostic: it receives strings, and knows nothing of Docker. It exists as one component because the columns' alignment **across cards** (REQ-10) is a property of the arrangement, and three columns composed by hand on each card would drift with content. Exported from `client/src/ui/index.ts`. | REQ-6, REQ-7, REQ-8, REQ-10, REQ-17, REQ-30, REQ-31, REQ-33, REQ-34 | INT-4 |
| INT-6 | modify | `.sdd/modules/ui-library/index.md`, `specs/surface.md`, `specs/card.md`, `specs/metric-primitives.md`, and a new spec for INT-5's component | Record what the library gained and, above all, **where the card's material now lives** — the claim that exactly one place defines it is only checkable if the record says which place. *(Enabling: closes no behaviour of its own.)* | REQ-29, REQ-30 | INT-3, INT-4, INT-5 |
| INT-7 | create | client, containers area — **`client/src/containers/ContainerCard.tsx`** (this exact path: batch 1 admitted it by name in the conformance guard) | One container as one card, composed from library components only: the extended `Card` carrying the material and the state accent; band 1 — dot · name · uppercase state pill · short monospace id at the left, and at the right the primary lifecycle action, a gap, then the joined `Pause` · `Restart` · `…` cluster (the delivered `ActionButtonGroup` + `Menu`, contract untouched); band 2 — the `image` chip, the ports chip **only when ports are published and showing every mapping, wrapping, none summarised**, then the status sentence; band 3 — the metric strip with `CPU`, `MEMORY` and `NET I/O`, their capacity notes, and the *no sample* state where a figure is absent. Every displayable state gets a pill, an accent and a dot by one rule — `created`, `restarting`, `removing` and `dead` included, not only the mock's three — and the three always agree. No age is displayed. | REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-11, REQ-12, REQ-13, REQ-14, REQ-16, REQ-18, REQ-19, REQ-20, REQ-22, REQ-27, REQ-31, REQ-34, REQ-35, REQ-53 | INT-1, INT-3, INT-5 |
| INT-8 | modify | `client/src/containers/ContainersScreen.tsx` | Replace the `DataTable` with a `Stack` of one `ContainerCard` per matching container, at full width with a uniform token gap. **Everything else on this screen is preserved exactly**: the toolbar and its three actions, the search field, the state chips and their filtering (relative order preserved), the empty state, the server's ordering with no sort control and no selection, the inline rename, the per-container action lifecycle and its in-flight disabling, the confirmations, the toasts and every string. The `ContainerDetailPanel` now opens **beneath the selected card**, full width, closing on a second selection and on `Escape`, at most one at a time. Live updates land in place: no card moves, the list does not reorder, and nothing is tweened between samples. | REQ-1, REQ-15, REQ-17, REQ-21, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-31, REQ-32, REQ-33, REQ-36 | INT-7 |
| INT-9 | modify | `.sdd/modules/containers/index.md`, `.sdd/modules/containers/specs/containers-screen.md` | Record the card presentation and the new component, and remove the table-shaped claims (the row's cells, the row-height/header parity with the images table) rather than leaving them to contradict the screen. | REQ-38 | INT-7, INT-8 |
| INT-10 | modify | `client/e2e/containers.spec.ts`, and any sibling spec that reaches a container through a table row or asserts this screen's table geometry | **Restate, never weaken.** Every assertion that located a container by a row, or measured a column, asserts the same fact against the card: the four action slots and their fixed positions, the overflow menu's four entries and its behaviour, the detail panel opening and closing, the filtering and ordering, the rename. Interactions are driven with a **real pointer at each visible control's own coordinates** — never `element.click()`, never a dispatched event. An assertion that passes while what it named goes unchecked is a failure of this intervention. | REQ-12, REQ-20, REQ-21, REQ-23, REQ-24, REQ-26, REQ-37, REQ-38 | INT-8 |
| INT-11 | create | client e2e, containers area | The card's own check, and it asserts **geometry**: the element map as measured boxes and edges at the desktop viewport — the accent bar's edge, band order, the identity group, the action cluster flush at the inner right edge, the three metric columns' widths and the narrower third, the capacity notes right-aligned to their own column edges, the NET I/O readings on the tracks' baseline; the metric columns at the **same x on every card** down the list; the same card width in every state; a *no sample* card against a measured-zero one; and the whole map again at **375×812**, where the columns stack and the cluster wraps with nothing clipped and nothing missing that the desktop shows. Content assertions stand beside these, never instead of them. Includes the live-update check (numbers change, the card's box does not move, no neighbour is disturbed) and a measured scroll check at a realistic container count. Own labelled fixtures, cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon, its own data directory, `test` imported from `client/e2e/support/test.ts`, passing on its own. | REQ-10, REQ-11, REQ-15, REQ-16, REQ-22, REQ-32, REQ-34, REQ-35, REQ-36, REQ-37 | INT-8 |
| INT-12 | modify | `client/test/unit/containers-screen.test.tsx`, `client/test/unit/images-containers-table-alignment.test.tsx` | The two delivered unit checks that assert this screen's table. The first is restated against the card. The second asserts the containers table is laid out identically to the images table — a claim that stops applying to a screen with no table: its **images half stays exactly as it is**, its containers half is rewritten as the card's own geometry. Deleting either half is the way this intervention fails. | REQ-38 | INT-8 |

## Watch for

- **The bare status dot.** The mock draws a dot, then the name, then a separate pill. `StatusPill` is
  a dot *with* a label and `StatusDotCell` is a table cell. If neither composes, extend one under
  REQ-30 and record it — do not reach for a raw element.
- **Virtualisation does not come with.** `DataTable` mounts only the rows near the viewport; a
  `Stack` of cards mounts all of them, and a card's height is content-dependent (the ports chip
  wraps), which is the one mode `DataTable` itself refuses to virtualise. This is accepted and
  recorded in `batches.md`; REQ-32 is verified as measured smoothness at a realistic count.
- **The guard admits two paths and no third.** If a reason appears to introduce a **new**
  card-bearing component tag rather than using `Card`/`Surface`, `cardRowSurfacesPerItem` in
  `client/scripts/check-ui-conformance.mjs` must learn that tag **in this batch** — otherwise the
  exception becomes a bypass by accident. That is the only circumstance in which this batch opens
  that file, and the blur half stays byte-identical regardless.

## Out of this batch

- The sampling interval, the gate, any subscription, any connection, and `server/src/index.ts` — all
  batch 3's, and building any of them here would put the gate in the layer that makes no calls.
- The detail panel's contents and its own per-container stats stream.
- The dashboard's layout, list and content.
- Block I/O and PIDS on the card; any history, sparkline, chart, threshold or interval setting.
- Selection, bulk actions, a sort control, grouping, pagination, a density toggle or a card/table
  switch.
- Every other list in the product, the dashboard's container list included.
- Translating or rewording anything; the mock's Italian is the author's shorthand.
