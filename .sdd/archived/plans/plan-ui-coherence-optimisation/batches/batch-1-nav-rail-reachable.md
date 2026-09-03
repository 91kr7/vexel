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
| INT-7 | modify | `client/src/ui/navigation/navigation.css`, `client/src/ui/navigation/NavRail.tsx` | **Added during implementation, not present when the batch was planned** (see "Added during implementation" below). The entry region states where its content is cut and fades the entry meeting the cut, on whichever edge still holds entries beyond it. Without it this batch changes nothing an operator can see: the region already scrolled on the delivered build, and "the operator cannot tell there is more" *is* the defect. A mask over the region's own content — it reads nothing behind the rail, computes no filter, writes no blur value and adds no colour or token. | REQ-1 | INT-2 |

## Constraints on this batch

- **`.ui-nav-rail` and `.ui-frame__rail` are on the blur allow-list** at the phone breakpoint, valued
  `var(--blur-overlay)`, declared on the surface's own `::before`. None of that moves: no blur value
  is written, no selector joins or leaves `blurAllowedOverlaySelectors`, and
  `client/scripts/check-ui-conformance.mjs` is **not modified** and passes (REQ-5).
- A scrollbar appearing inside the rail must not change the docked rail's width at the desktop
  breakpoints, or every screen's content column shifts.
- No feature file is in this diff: the rail is library, and the navigation data is untouched.

## Added during implementation

**INT-7, the fold fade.** The delivered mechanism was not the planned one: `.ui-nav-rail__groups`
already carried `flex: 1 1 auto; overflow: auto`, so the region already clipped and already scrolled
(`scrollHeight 744 / clientHeight 555` at 1280×800, `scrollTop` reaching 189, a real wheel scrolling
it, and — on the delivered build — a real pointer click navigating once the entry was scrolled into
view). What was broken was that nothing said so: under overlay scrollbars the region reserves no
gutter and paints no thumb while idle, and the cut fell between two groups, so thirteen entries read
as a complete set of ten. Fitting all thirteen without a scroll is arithmetically impossible — the
rail needs 40 (padding) + 36 (brand) + 48 (gaps) + 74 (card) + 744 (entries) = **942px** against
**760px** available at 1280×800, and deleting every group label and gap still leaves it 26px short —
so the cut is permanent and the only thing that can change is whether the operator can see it. INT-7
is therefore what makes this batch a repair an operator can observe, rather than scope that drifted
in; it is recorded here because no planned intervention asked for it.

**INT-5 was not made.** The drawer's repair is one CSS declaration in INT-3 (`height: auto` at the
phone breakpoint, against a fixed box over-constrained by `height: 100%` dropping its bottom inset);
`client/src/ui/layout/Frame.tsx` is untouched, as INT-5's own condition provides for.

## REQ-2, restated in the form that can be written

REQ-2's literal form — *the entries' and the card's viewport boxes must not intersect* — is
**unsatisfiable on any construction** while the entries overflow, and could not be written as a
check: an un-scrolled scroll region necessarily lays its overflowing content out beyond its own box,
so the entries measure 131–849 against a card at 685–759 at 1280×800 while being clipped and never
painted there. Satisfying it literally would require all thirteen entries to fit, which the
arithmetic above rules out at every viewport this batch covers.

The form the check is written in, and the one this batch is verified against:

> **Each entry, scrolled into view, is hit-testable at its own centre, is inside the viewport, is
> clear of the card's box, and a real pointer click at those coordinates navigates** — at 1440×1000,
> 1440×900, 1280×800, 375×812 and 375×667.

Verified 13/13 at all five viewports (delivered build: 13, 11, 10, 11 and 8 of 13). The card is never
overlapped and never sat on: it keeps its size and its place at the bottom of the rail at every
viewport height.

## REQ-3 — satisfied by design

The rail's footer card stays anchored to the bottom of a full-height rail, and the space left over on
a tall window sits between the last entry and that card. That is **not** a defect and is not repaired
here: empty rail beneath a pinned footer is what every sidebar does, while the only alternatives —
the card floating mid-rail with empty space below it, or the rail card ceasing to be full height —
would look broken. REQ-3's "large dead gap" came from a weak observation, and REQ-2's anchored card
is the requirement that governs where the two disagree. The gap is bounded and behaves as intended:
**36px at 1440×1000**, reaching 436px at 1440×1400 by design.

## Observation for a later plan — out of this batch's perimeter

`client/src/ui/tokens.css`, on `--scrollbar-width`, states that styling `::-webkit-scrollbar` opts
out of the platform's overlay scrollbars and that the width is therefore real layout space. **That is
no longer true**: the standard `scrollbar-width: thin` wins in current Chromium and the measured
gutter is 0px everywhere, `.ui-frame__content` included — so Frame's runtime measurement
(`offsetWidth - clientWidth`, published as `--scrollbar-width`) now always publishes 0, and the
padding compensation it exists to drive compensates for nothing. Nothing in this batch depends on it
and nothing here was changed for it; recorded so it is picked up deliberately rather than
rediscovered.
