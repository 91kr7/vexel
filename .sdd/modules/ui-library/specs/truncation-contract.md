---
module: ui-library
component: Truncation contract
type: configuration
---

# Truncation contract

**Purpose** → the one rule that decides which of two neighbours gives way when a row cannot hold
both: a flexible text run laid beside trailing metadata. Written once, in `client/src/ui/`, and
carried by every primitive that draws such a row.

## Contract

The stylesheet declares four classes and nothing else. A component that draws a "flexible text plus
trailing meta" row carries them; no other file expresses the rule, and no screen solves it locally.

- `.ui-truncating-row` → the row itself: when it cannot hold the floored run and the trailing group
  side by side, the trailing group takes a line of its own.
- `.ui-truncating-run` → the flexible text run: it may shrink, and it flexes from a zero basis so
  the line breaks on its floor rather than on its content's full length. It never resolves narrower
  than `--truncating-run-min-width`, nor wider than the row itself — on a row narrower than the
  floor the run takes the row's whole width and the trailing group wraps under it.
- `.ui-truncating-line` → one line of that run: a single line, truncated with an ellipsis at the
  run's edge.
- `.ui-truncating-meta` → the trailing metadata: its natural width, whatever the run does.

Guarantees, at any viewport and for an identifier of any length:

- the run's painted box and the trailing group's box **never intersect**;
- the trailing group is at its natural width, whole and hit-testable;
- the run is never reduced to an ellipsis alone, and never inks outside its own box.

## Rules and invariants

- **A list row truncates, a property band wraps.** This is the boundary a later reader gets wrong.
  The contract governs rows: a storage-usage row, a table cell. It does not reach the
  two-column property grid (`definition-list.md`), where a value continues to wrap and be readable
  in full — there a one-line clamp would turn a layout defect into a data loss.
- **The floor is explicit, never the automatic minimum.** Restoring `min-width: auto` would size a
  run to its longest single-line value — a 64-character digest asks ~500px — which is the ellipsis
  truncation the desktop layout is built on, ended. Same reasoning as the `DataTable` column
  minimum (`data-table.md`).
- **In a `DataTable` the floor is the column's, not the run's.** A table cell already sits in a grid
  whose tracks refuse to reach 0px (`--data-table-column-min-width`), so a cell takes the line and
  meta classes and not `.ui-truncating-run`: a second floor inside a 72px track would push the
  cell's inline action out of it.
- **A line that reads as a sentence and is expected in full does not take the line class**, rather
  than taking it and overriding it. That is how the wrapping variants of `TwoLineCell` and
  `MetaCell` stay wrapping: they withhold the class.
- **A truncated value stays obtainable in full**: wherever a list row truncates an identifier, that
  object's detail surface shows the same value wrapped and selectable. Truncation is a presentation
  of a list, never the only presentation of a value. No `title`-attribute tooltip is a substitute
  for that route, and nothing on either side gains `user-select: none`.
- The floor is the token `--truncating-run-min-width`; no length is written on the spot.

## Dependencies

- Design tokens (`--truncating-run-min-width`)

## Requirements served

- plan-ui-coherence-optimisation/REQ-17
- plan-ui-coherence-optimisation/REQ-18
- plan-ui-coherence-optimisation/REQ-19
- plan-ui-coherence-optimisation/REQ-20
- plan-ui-coherence-optimisation/REQ-21
