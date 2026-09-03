---
batch: 9
feature: F9 — contexts
closed_req: [REQ-42, REQ-43, REQ-44, REQ-45]
depends: [5]
---

# Batch 9 — contexts

One `CardList` call site (`ContextsScreen.tsx:161`), in the "cards with inline trailing buttons"
shape — the fourth of the four list paradigms the analysis counts. Two defects of its own: **`use` is
bare text acting as a control**, and it is the most consequential click on the screen (it switches
the active Docker daemon for the whole application); and the endpoint runs under the `active` pill,
repaired in batch 4 and verified here in its migrated form.

**The daemon block leaves this screen.** `ContextsScreen` and `SystemScreen` both consume
`useDaemonInfo` and both list the same eight properties. Decided at the requirements gate: they
describe *the daemon*, not *a context* — they do not change as you look down this list, only when the
active context changes — so **System & prune keeps them** and this screen loses the full block.

## Recorded 2026-08-17 — the presentation this batch migrated onto was retired afterwards

**Nothing in this file is edited, and that is deliberate**: it is the record of what was built and
what it was accepted on. The **comfortable** variant `INT-2` migrates the contexts list onto —
including the active-selection row this screen was the case for, each row on a card of its own under
a floating column header — was **retired on 2026-08-16**, prop, carrier surface, stylesheet rules and
header-inset compensation together, and the list was converted again, onto the one table presentation
containers and images already shipped; the active marker and `use` as a control of the cluster
survived that conversion unchanged. This batch's acceptance and its measured figures were taken
against the card row and are read as of their own date, not as a description of what ships. Where the
decision is written:
`.sdd/plans/plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/` (REQ-17,
REQ-22, REQ-26), on
`.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, contexts area | The check, written and run **first**: `use` is hit-testable as a control at its own centre and a **real pointer click** switches the active context, with every cached view dropping the previous daemon's data; the endpoint's box does not intersect the `active` pill's at any of the three viewports; and **no eight-property daemon block is rendered on this screen**. Report what was on the screen before and after. | REQ-43, REQ-44, REQ-45 | — |
| INT-2 | modify | `client/src/contexts/ContextsScreen.tsx` (:161, `contextRow` at :144) | Migrate the list to the object list's comfortable variant — its **active-selection row** variant is exactly this case — deleting the row-content builder. Name, endpoint, kind, TLS and the active marker keep their values. | REQ-42, REQ-44 | INT-1 |
| INT-3 | modify | `client/src/contexts/ContextsScreen.tsx` | **`use` becomes a control of the action cluster**, performing exactly the switch it performs today, announcing it exactly as today through the active-context broadcast. Remove with confirmation and the create form (local socket / SSH) go through the same cluster. | REQ-43 | INT-2 |
| INT-4 | modify | `client/src/contexts/ContextsScreen.tsx` | Remove the full eight-property daemon panel and its `useDaemonInfo` consumption **if nothing else on the screen needs it**. A **short summary of two or three properties on the active context's row — version and endpoint, say — is permitted and is not the duplication returning**; the full block is what must not survive. Whichever is chosen, no import, hook call or type is left orphaned. | REQ-45 | INT-2 |
| INT-5 | modify | `.sdd/modules/contexts/specs/contexts-screen.md`, `.sdd/modules/contexts/index.md` | Record the screen's new shape **and the removal of the daemon panel with its reason**, so the next reader does not restore it as a missing feature. English only. | REQ-42, REQ-43, REQ-45 | INT-2 … INT-4 |
| INT-6 | modify | client unit and e2e suites covering this screen | Update the coverage the migration invalidates; keep every assertion about creating a context, removing one, switching the active one and the broadcast that follows. Coverage of the removed daemon panel is **removed, not neutered** — the behaviour it covered is gone from this screen and is covered on System & prune. | REQ-42, REQ-43, REQ-45 | INT-2 … INT-4 |

## Measured at implementation — the two defects were not the two defects

Figures taken on the delivered build and on this one, built and served side by side against the same
daemon, at 1440×1000, 1280×800 and 375×812. The fixture is the operator's own two contexts plus a
third created without a description and removed again, which is what makes the row-height figures
readable; the active context was switched only to one pointing at the endpoint already in use, and
put back.

**1. `use` was never bare text, and the truth is a better statement of REQ-43 than the requirement's
own.** It shipped as a real `<button>` — `Badge onClick` → `<button class="ui-badge
ui-badge--clickable">`, 38.6×24.3 — and a hit test at its own centre returned it on the delivered
build, at all three viewports. So the analysis's "bare text acting as a control", and the plan's
"different element types in the same slot", both invert what was there: `use` and `active` were **the
same element visually** — both `.ui-badge`, same box, same radius, same type scale, with
`.ui-badge--clickable` adding `border: none; font: inherit; cursor: pointer` plus a hover fill, and
**nothing else**. The screen's least consequential text and its most consequential click, the one
that re-points the whole application at another daemon, were drawn identically.

That is the form this defect takes on other screens too, and it is worth carrying forward as the
question to ask: **not "is this a button" but "does its weight say what it does"**. A check written
against the element type passes on it; a check written against appearance and weight does not.
After: `<button class="ui-button ui-button--primary ui-button--sm">`, 39.3×27.4, in the row's action
cluster — hit-testable at its own centre at 1440 and 1280, and at 375 after the pan the column is
reached by (x 753.6 → 150.6, hit = the button). The switch itself is untouched: `POST
/api/contexts/…/use` → 200, the toast, the marker, and the shell footer following it and following it
back.

**2. The collision REQ-18 named here was already cleared by batch 4; what REQ-21 names is the value
being cut, not overlapped.** Zero intersecting text rectangles on the **delivered** build, at all
three viewports, endpoint against `active` pill and every other pair (batch 4's clipped-rect
instrument, 32 painted texts). What batch 4 left is the truncation: the endpoint painted **328.6px at
1440, 241.4px at 1280 and 43.8px at 375** of an intrinsic **388.9px**, with the full value obtainable
**nowhere on the screen** — no `onSelect`, no `renderExpanded`, and the endpoint not among the eight
daemon properties beside the list. That is REQ-21's contexts half, and it is why this batch adds a
detail panel rather than only a table: the row still truncates (302.2 / 215.6 / **187.2px**), and the
panel below it holds the value in full — 388.9px on one line at desktop, wrapped to 136.8×48.8 at
375, selectable. A `title` tooltip would not have discharged it.

**3. Every other figure.** The `Grid` (`1.2fr 1fr`) is **deleted, not collapsed with
`arrangement="pair"`** — its second child, the daemon card, is gone, and one child is not a pair;
the pin batch 4 and batch 7 carried is discharged that way, leaving `PluginsScreen.tsx:218` (10),
`ComposeScreen.tsx:205` (11) and `SystemScreen.tsx:176` (14). At 375×812 that template had laid two
cards **171.8px and 143.2px** wide in a 335px content column, the list painting in 105.8px of it.
List width 534 → **1054** at 1440, 446.7 → **894** at 1280, **105.8 → 269** at 375, panning at 375
alone (scrollWidth 842 against clientWidth 269). Row heights **95.1 / 95.1 / 73.7 → 68.2 on every
row** at 1440 and 1280, **138.5 / 138.5 / 117.1 → 68.2** at 375: the description was a card line whose
presence depended on the context, and it is a column now, which is batch 7's rule catching a third
screen. Header template identical to every row template at all three viewports. Detail panel
1012 / 852 / 229px, one open anywhere. Zero colliding pairs after, panel open or closed. The action
cluster inks 106px in a 120px track — the same pair of controls, at the same width, as a builder's
row.

**4. The permitted daemon summary was declined, and the eight properties are gone from the screen**
(0 of 8 present at all three viewports). A two-or-three-property copy is the same duplication in a
smaller box, and a column populated on one row of N is not a column. `useDaemonInfo` is no longer
consumed here and is not orphaned — `SystemScreen.tsx:111` keeps it. The reasoning is in
`contexts-screen.md` under "Decisions recorded", written so the next reader does not restore the
block as a missing feature. Its one cost, stated: the endpoint paints ~26px less than the delivered
card did at desktop, the row now carrying six aligned values where the card stacked three lines —
paid back 143px at 375, and by the full value being reachable at all.

**5. One `EmptyState` was two**, as in batches 6 and 7: loading and empty were one element with both
`null`s. The empty one now carries its explanation and a `Create context…` action; the loading one
keeps its explicit `null`s.

**This migration changed no file under `client/src/ui/`** — no primitive, no variant, no prop, no
token: the first of the four to need nothing from the library, which is the measure REQ-92 is written
against.

### Left standing, with the batch that owns it

- **For batch 13** — `CardList`'s active-selection variant (`selection`, `onUse`, `activeLabel`,
  `useLabel`, `selectionControl`) lost its last consumer at this commit, and with it **`Badge`'s
  `onClick` prop**, whose only call site in the whole client is `CardList.tsx:116`. `CardList` goes in
  batch 13; **the prop survives that deletion unless named**, and what it renders is a badge that is
  a control — the affordance REQ-27 forbids and the one this batch just removed from this screen.
  Recorded there in full, with the files and the greps.

## Constraints on this batch

- **The properties are never absent from the product.** System & prune already displays them, so this
  batch may land before batch 14; batch 14 does not move them, it verifies they are still there.
- The active-context switch is the application's widest side effect: every cached view drops the
  previous daemon's data. Nothing in this migration may change when that broadcast fires or what it
  carries.
- **Lower the `CardList` call-site budget in `client/scripts/check-ui-conformance.mjs` by the one
  site removed here.** The check fails if the count is higher **or** lower than expected, so the
  budget is lowered deliberately or the batch does not go green.
- Feature code composes library components and nothing else.
