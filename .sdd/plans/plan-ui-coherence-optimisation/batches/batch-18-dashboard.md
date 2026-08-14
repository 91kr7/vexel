---
batch: 18
feature: F15 — dashboard
closed_req: [REQ-66, REQ-67, REQ-68, REQ-69]
depends: [5]
---

# Batch 18 — dashboard

Section 5 of the analysis, kept by the gate's decision and droppable as a whole batch.

Three measured defects, one of which destroys information:

- the two cards of the middle row (`Container activity`, `Disk usage`) have **unequal heights**,
  leaving a ragged bottom edge;
- the disk-usage bars use **two hues with no legend**;
- a row whose value is `0B` **shows no bar at all**, so the reader cannot tell "zero" from "not
  measured" — the one item here that is a loss of meaning rather than of rhythm.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, dashboard area | The check, written and run **first**: assert the two middle-row cards' **heights are equal** at 1440×1000 and 1280×800; assert a legend names what each hue means; assert a `0B` row renders a distinguishable zero rather than nothing. Report the two heights before and after. | REQ-66, REQ-67, REQ-68 | — |
| INT-2 | modify | `client/src/dashboard/DashboardScreen.tsx` | Make the middle row's two cards share a bottom edge, through the layout primitive that already exists for equal panels rather than through a height written on the spot. | REQ-66 | INT-1 |
| INT-3 | modify | `client/src/ui/metrics/UsageBreakdown.tsx` and its stylesheet | Give the breakdown a legend naming each category's hue, and make a zero row render a zero — a zero-length bar with its track, or an explicit marker — so that zero is distinguishable from unmeasured. Made in the library, since the component is the library's and the meaning is generic. | REQ-67, REQ-68 | INT-1 |
| INT-4 | modify | `client/src/dashboard/DashboardScreen.tsx` | Adopt the section-header and empty-state primitives for the screen's own sections and empty results, and let its `DataTable` usage inherit batch 2's column contract with **no local override**. | REQ-69 | INT-2 |
| INT-5 | modify | `.sdd/modules/dashboard/specs/dashboard-screen.md`, `.sdd/modules/ui-library/specs/usage-breakdown.md` | Record the legend, the zero presentation and the screen's new shape. English only. | REQ-67, REQ-68, REQ-69 | INT-2 … INT-4 |
| INT-6 | modify | client unit and e2e suites covering the dashboard | Update the coverage the change invalidates; keep every assertion about the five summary tiles, the live container activity, the disk-usage figures and the recent daemon events. | REQ-66, REQ-69 | INT-2 … INT-4 |

## Constraints on this batch

- **The cross-navigation must keep landing**: from any tile and from any activity row to the screen
  owning that object, which then reveals the object and acknowledges. It is a service contract, not a
  link.
- The Dashboard is the screen that **keeps** the daemon event stream (batch 15 removes About's copy);
  its stream, its connection handling and its one-entry-per-event behaviour are untouched.
- Nothing on this screen may animate the backdrop or introduce a filter; the sparklines redraw only
  on new samples and that stays true.
- Feature code composes library components and nothing else.
