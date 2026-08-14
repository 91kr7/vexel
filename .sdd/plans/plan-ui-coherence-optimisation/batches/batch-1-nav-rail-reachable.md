---
batch: 1
feature: F1 — every navigation destination is reachable, at every viewport
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5]
depends: []
---

# Batch 1 — nav-rail-reachable

The rail renders thirteen entries into a space that fits ten and nothing scrolls, nothing clips, so
the bottom-anchored footer card and the top-anchored list paint over each other. Three destinations
are unreachable at 1280×800 — **System & prune, Raw console, About** — with no error and no other
route. Above ~1000px of viewport the same construction opens a large dead gap instead.

Delivered figures, to be observed failing before anything is changed: the nav list has an intrinsic
height of ~849px regardless of viewport; the overlap begins below ~964px of viewport height; the
phone drawer's list measures 810px against an 812px viewport, so it fits the test device by two
pixels; `System & prune` occupies y 674–716 with `ui-footer-status` painted at its centre, `Raw
console` y 761–803 over a clipped `ui-frame`, `About` y 807–849 below the viewport entirely.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, navigation area | The check, written and run **first**, against the delivered build. For each of the **thirteen** entries: `elementFromPoint` at the entry's own centre returns that entry, and a **real pointer click** at those coordinates changes the active screen. Run at 1440×1000, 1440×900, 1280×800, 375×812 and 375×667. Assert the entry-list box and the footer-card box **do not intersect** at any of them, and that at 1440×1000 the gap between the last entry and the card is bounded. Never `element.click()`, never a dispatched event. Report the measurements before and after. | REQ-1, REQ-2, REQ-3, REQ-4 | — |
| INT-2 | modify | `client/src/ui/navigation/navigation.css` (`.ui-nav-rail` at :1, `.ui-nav-rail__groups` at :44) | Give the entry region the scroll-and-clip contract: the rail bounds its own content instead of overflowing it, and the region holding the groups is what scrolls when the entries do not fit. The rail's own box stops growing to its intrinsic ~849px. **Do not touch the phone-breakpoint block at :181–:203**, which carries the allow-listed `::before` blur. | REQ-1, REQ-2, REQ-4, REQ-5 | INT-1 |
| INT-3 | modify | `client/src/ui/layout/layout.css` (`.ui-frame__rail` at :12, phone blocks at :216, :231, :241) | The sizing wrapper bounds the rail to the viewport so the scroll region inside it has a height to resolve against, at the docked breakpoints and in the open drawer alike. The drawer keeps its open/closed behaviour and its blur exactly as delivered. | REQ-2, REQ-3, REQ-4, REQ-5 | INT-2 |
| INT-4 | modify | `client/src/ui/navigation/NavRail.tsx` | Only if the scroll contract needs a structural region of its own — the groups region scrolling while the brand and the footer slot stay put. No new prop is exposed to feature code, and the footer keeps its anchoring. If INT-2 and INT-3 suffice, this intervention is not made and the batch reports that it was not needed. | REQ-2, REQ-3 | INT-2 |
| INT-5 | modify | `client/src/ui/layout/Frame.tsx` | Same condition as INT-4, for the drawer side: the phone drawer's card scrolls its entries instead of overflowing the viewport. Nothing about the off-canvas transition, the scrim (which never blurs) or the breakpoints changes. | REQ-4, REQ-5 | INT-3 |
| INT-6 | modify | `.sdd/modules/ui-library/specs/navigation-primitives.md`, `.sdd/modules/ui-library/specs/frame.md` | Record the scroll-and-clip contract in the two specs that describe the rail and the frame, so the next reader learns that the rail is bounded by the viewport and that its entry region scrolls. English only. | REQ-2, REQ-4 | INT-2, INT-3 |

## Constraints on this batch

- **`.ui-nav-rail` and `.ui-frame__rail` are on the blur allow-list** at the phone breakpoint, valued
  `var(--blur-overlay)`, declared on the surface's own `::before`. None of that moves: no blur value
  is written, no selector joins or leaves `blurAllowedOverlaySelectors`, and
  `client/scripts/check-ui-conformance.mjs` is **not modified** and passes (REQ-5).
- A scrollbar appearing inside the rail must not change the docked rail's width at the desktop
  breakpoints, or every screen's content column shifts.
- No feature file is in this diff: the rail is library, and the navigation data is untouched.
