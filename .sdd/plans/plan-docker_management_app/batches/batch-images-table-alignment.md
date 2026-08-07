---
batch: 31 · images-table-alignment
feature: F10 — Image list and registry-facing actions (remediation)
closed_req: [REQ-3, REQ-37, REQ-41]
depends: [4, 9]
---

# Batch 31 — Align the images list with the containers table

Remediation batch, opened after human review of the delivered UI. Batch 9 rendered the images
list with `CardList` (stacked cards: title, monospace subtitle, a two-line meta block on the
right, actions only once a row is expanded), while batch 4 rendered the containers list with
`DataTable` (header row, status dot, aligned columns, per-row action group). The two core
screens of the product therefore present the same kind of object — a list of Docker resources —
with two different visual languages, which REQ-3 forbids.

**Decision taken by the human on review**: the containers table is the reference. The images list
adopts it. This supersedes the "card rows" reading of `.sdd/analysis/ui-mock/lmages-layers.png`
that batch 9 followed — the mockup stays the reference for *which* data is shown, not for the row
shape.

## Baseline (what exists)

- `client/src/ui/data/DataTable.tsx` — column-defined table, hover/selected rows, virtualised
  scrolling, per-row expansion slot. Already used by `ContainersScreen`.
- `client/src/ui/data/TableCells.tsx` — `StatusDotCell`, `TwoLineCell`, `MetaCell`.
- `client/src/ui/controls/ActionButtonGroup.tsx` — dense row actions with a destructive variant.
- `client/src/containers/ContainersScreen.tsx` — the reference column layout, including the
  `var(--data-table-action-column-width)` action column.
- `client/src/images/ImagesScreen.tsx` — currently on `CardList`; `renderRow` builds the card
  content, `actionsFor(image)` already produces the per-image action list (tag, untag, push,
  remove) but only inside the expanded region.

The UI library already carries the needed primitives. This batch extends it only where the
containers layout has no equivalent for an image-specific column, and does **not** introduce a
second table component.

## Interventions

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | client, UI library (`client/src/ui/data/TableCells.tsx`) | Add the cell contents the images columns need and the containers columns can reuse: a monospace digest/identifier cell that truncates from the tail and keeps the full value available on hover, and a tag-list cell rendering N `Badge`s with an overflow indicator when they exceed the column. Generic, no Docker vocabulary in the API. Extend `TableCells`, do not create a near-duplicate module. | REQ-3, REQ-37 | — |
| INT-2 | modify | client, UI library (`client/src/ui/data/DataTable.tsx`) | Only if the images columns reveal a genuine gap against the containers layout (e.g. a column needing a different alignment or a wider action column). Any change must keep `ContainersScreen` rendering identically — the containers table is the reference, it does not move. If no gap is found, record the intervention as not needed. | REQ-3 | — |
| INT-3 | modify | client, images feature area (`client/src/images/ImagesScreen.tsx`) | Replace `CardList` with `DataTable`, with a column set mirroring the containers layout: leading status dot (tagged vs dangling), repository/tag as the primary two-line cell, short digest, platform(s), size and creation age as meta columns, and a trailing `LIFECYCLE`-equivalent action column carrying `actionsFor(image)` always visible on the row — not only when expanded. Keep the existing expansion behaviour (`ImageDetailPanel` in the expanded slot), selection, search and the `Card padding="none"` wrapper. Column headers uppercase, same `maxHeight` policy as containers. | REQ-3, REQ-37, REQ-41 | INT-1, INT-2 |
| INT-4 | modify | client, images feature area | Move the per-image actions out of the expanded region now that they live on the row, keeping destructive confirmation on remove/untag unchanged. The expanded region keeps `ImageDetailPanel` alone. | REQ-37 | INT-3 |

## Constraints

- No raw DOM tag, no CSS, no `className`/`style` prop, no hard-coded visual value in
  `client/src/images/` — the `CLAUDE.md` boundary is unchanged and the lint rule enforces it.
- No new `backdrop-filter` / `filter: blur()`.
- `CardList` stays in the library: it is still the declared shape for builders, contexts,
  registries and plugins. This batch does not delete it, it stops images from using it.
- `ContainersScreen` must render byte-identically after the batch. It is the reference, not a
  participant.

## Human acceptance

The Images & layers screen shows a header row and aligned columns exactly like Containers: a
leading status dot, repository:tag, short digest, platform(s), size and age each in their own
column, and the tag/untag/push/remove actions visible on every row without expanding it; a
dangling image is marked as such by its status dot and badge; clicking a row still opens the
image detail panel underneath it; search by reference or digest still filters; switching between
the Containers and Images screens shows no difference in row height, column typography, header
style, hover or selected treatment; the Containers screen is unchanged.
