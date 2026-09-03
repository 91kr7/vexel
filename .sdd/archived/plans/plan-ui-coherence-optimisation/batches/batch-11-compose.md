---
batch: 11
feature: F11 — compose
closed_req: [REQ-49, REQ-50, REQ-51]
depends: [5]
---

# Batch 11 — compose

The screen the analysis counts as "no list at all". In fact it is the **only** consumer of
`GroupedRowsPanel` (`ComposeScreen.tsx:208`, groups built at `:147`) — the fourth answer to "how is an
object listed", and the one component batch 5 rebuilt on the object-list primitive or retired into a
grouped variant of it. Its empty result, `No compose projects`, is bare text on no surface.

The grouping is real and must survive: a project holds its services, each with its own state.

## Recorded 2026-08-17 — the presentation this batch migrated onto was retired afterwards

**Nothing in this file is edited, and that is deliberate**: it is the record of what was built and
what it was accepted on. The **comfortable** variant this batch migrates the projects list onto, and
that the nested `hideHeader` service list recorded further down was drawn in — each row on a card of
its own, under a floating column header — was **retired on 2026-08-16**, prop, carrier surface,
stylesheet rules and header-inset compensation together. Both levels were converted again, onto the
one table presentation containers and images already shipped: the grouping survives as row content
holding a nested list, and what says a service belongs to a project is now its **indentation inside
the projects list's own surface**, never a card. This batch's acceptance and its measured figures were
taken against the card row and are read as of their own date, not as a description of what ships.
Where the decision is written:
`.sdd/plans/plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/` (REQ-7, REQ-19,
REQ-22, REQ-26), on
`.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, compose area | The check, written and run **first**: each project is a row of the one list; **each of its services is still visible with its own state**; opening a project's detail with a **real pointer click** gives a full-width panel with the two-column grid; and with no project present the empty result renders on a surface with a title, one line and its action. Report what was drawn before and after. | REQ-49, REQ-50, REQ-51 | — |
| INT-2 | modify | `client/src/compose/ComposeScreen.tsx` (:147, :208) | Migrate off `GroupedRowsPanel` onto the one paradigm batch 5 delivered, deleting the group-building code it replaces. Projects in name order, services in name order, the overall and per-service states all still shown. | REQ-49 | INT-1 |
| INT-3 | modify | `client/src/compose/ComposeScreen.tsx` | Reveal a project's detail through the detail-panel primitive: full content width, two-column property grid, tabs where the screen needs them — the compose file editor and the aggregated logs being the obvious candidates rather than three stacked regions. The editor keeps its validation, its dirty state and its **confirmed** save. | REQ-50 | INT-2 |
| INT-4 | modify | `client/src/compose/ComposeScreen.tsx` | Express `No compose projects` through the empty-state primitive: title, one line of explanation, and the action that resolves it. | REQ-51 | INT-2 |
| INT-5 | modify | `.sdd/modules/compose/specs/compose-screen.md`, `.sdd/modules/compose/index.md` | Record the screen's new shape, and — if `GroupedRowsPanel` was retired in batch 5 — that this screen no longer names it. English only. | REQ-49, REQ-50, REQ-51 | INT-2 … INT-4 |
| INT-6 | modify | client unit and e2e suites covering this screen | Update the coverage the migration invalidates; keep every assertion about up, down, restart, per-service scaling, the compose file read/validate/save, and the aggregated per-service log stream. | REQ-49, REQ-50 | INT-2 … INT-4 |

## Pinned here from batch 5: the right column is 48px wide at 375×812

**Fix the container, not the two symptoms.** Measured on the delivered build at 375×812 during batch
5's verification (the delivered client at `17ed9af` built and served alongside the new one):

- `ComposeScreen.tsx:205` passes a **fixed template** to `Grid` — `columns="2fr 1fr"` — and it never
  collapses. At 375×812 the `1fr` column resolves **shrink-to-fit**.
- The two empty states in that column measure **48px wide**: `ComposeScreen.tsx:222` at `48×165.56`
  and `:237` at `48×142.38`.
- 48px is exactly `2 × --space-6` — the empty state's own horizontal padding around a content box of
  **zero** width. The visible symptom is that **the title wraps one character per line**, which is
  why one short line of copy occupies 165px and 142px of height.
- Batch 5's `EmptyState` surface adds 2px of border on top of this (`48 → 50`), which was
  **deliberately not chased**: narrowing a hairline to preserve a width claim about a 48px box would
  be cosmetics over a fracture. Expect the 2px to disappear with the container, not before it.

This is the **second independent observation of one cause**. Batch 4 recorded the first from the
other direction — `VolumesNetworksScreen.tsx:17` (`1fr 1fr`), `SystemScreen.tsx:176` (`1fr 1.2fr`),
`ContextsScreen.tsx:156` (`1.2fr 1fr`), cards at 89.5–160px, the daemon-info panel rendering its
values one character per line — and pinned it to batches 6, 9 and 14. `Grid` already ships
`arrangement="pair"`, which collapses to one column when its own box is too narrow; **none of these
four call sites uses it**, and no change inside the library can fix a template the call site states.
It is one prop at the call site, and for compose it is this batch's.

So INT-4's empty state is not finished when it has a title, a line and an action: at 375×812 it must
also be **read as words rather than as a column of single characters**, which requires the `Grid`
above it to collapse. Measure the column's width, not only the empty state's content.

## Measured at implementation — the pin's number held and its explanation did not

Figures taken on the delivered build (`19108a2`, built from a worktree) and on this one, served side
by side from the same server build on ports of their own, each with a throwaway `VEXEL_DATA_DIR` and
`DOCKER_CONFIG`, at 1440×1000, 1280×800 and 375×812. **This machine has no compose project**, so the
populated case was measured with the reading **stubbed in the browser** (3 projects — 3, 2 and 1
services, one `partial`, one `unknown` with no config file and one carrying the daemon's own error) —
the precedent batches 8 and 10 set. Nothing was created on the daemon and no lifecycle control was
ever clicked: the cluster was hit-tested at each control's own centre.

**1. The 48px was measured correctly and explained wrongly, which is the fourth time in this
programme.** The pin says the `1fr` column resolves **shrink-to-fit** at 375×812. It does not:
`Grid columns="2fr 1fr"` laid its tracks at **210px and 105px** of a 335px content column — a
definite width — and the 48px is the empty state's **own auto-width box inside that 105px card**,
`2 × --space-6` around a content box of zero width, its title painting **64.05px wide at x=276 while
the box sat at x=283**, overflowing itself on both sides. Delivered, in that column: `No project
selected` **50×167.56** with a title over **3 lines**, `No compose file discovered` **50×190.75**
over **4 lines**, `No log output.` 50×144.38 inside a **39px** `LogStream`, and the `CodeEditor`
**39px** wide. The number held, the mechanism did not — and the mechanism had been written into
`ui-library/specs/empty-state.md` as a standing exception, which is corrected there in place: the
case was inferred from these two boxes alone, exists nowhere else in the product, and has been
removed with the container rather than left as a rule to design around.

**2. The `Grid` is deleted, and batch 9's argument is the deciding one.** The right column's two
regions — the compose file and the aggregated logs — are now **views of the selected project inside
its own panel**, so the pair has one child and is not a pair; batch 10's argument holds beside it
(the reveal is the row's own expansion, so the list's width is the panel's width), and
`arrangement="pair"` would have repaired the phone while leaving the panel at a third of the screen.
After: list **1054 / 894 / 269px**, panel **1012 / 852 / 229px**, editor and log stream the same
1012 / 852 / 229 against the delivered 300.7 / 247.3 / **39**. The table pans at 375 (scrollWidth 785
against clientWidth 269), which is batch 2's contract. **`SystemScreen.tsx:176` (batch 14) is now the
only never-collapsing template left.**

**3. `No compose projects` was on a surface, and the fifth batch in a row found loading and empty in
one element.** Delivered it painted **701.3×121.2** on batch 5's `EmptyState` surface, so "bare text
on no surface" was already stale; what was left was the **bare title**, `description` and `action`
both explicitly `null`, and one element carrying the loading state and the empty state at once. Two
call sites became four. After, at 375×812: **237px wide** (against 178) with its title on **one
line** at all three viewports — words rather than a column of single characters — a line stating what
puts a project there, and `Check again`, which really re-reads the list. The 48px pair is gone
outright: one of them described a state (`No project selected`) that a panel belonging to a project
cannot be in. Batches 6, 7, 9, 10 and 11 have now each found this shape; that is the evidence REQ-25
should be judged on.

**4. `GroupedRowsPanel` leaves the product, and needed no new API to leave it**, exactly as batch 5
recorded: `renderRowContent` holding a nested `hideHeader` comfortable list. The component, its
stylesheet, its export, its spec and its index row are gone. Every project row carries its services
opened or not, so a service's state and its `Stepper` are reachable without selecting anything. Row
heights **59.39px on every project row and 56px on every service row** at all three viewports —
`Up` / `Partial` / `Unknown`, with and without discovered files, with and without the daemon's error
— because the file paths and that error, which shared one subtitle line, are columns now: batch 7's
rule catching a **fifth** screen. Zero cells paint past their row. The action cluster inks 109.38px
(`Restart` + `Down`; 94.03 with `Up`) in a 120px track, hit-testable at each control's own centre at
all three viewports, at 375 after the pan.

**5. The panel dismisses as every other panel does, and the editable buffer is guarded by a
confirmation.** The first implementation gave this one panel a close control, on the ground that
`Escape` discards an unsaved compose edit silently; that was **reversed on review** — a second answer
to "how is a panel dismissed", on one screen out of six, is the divergence this plan exists to
remove. `Escape` and the row now close it as everywhere else, and while the buffer is dirty every
route that would discard it asks first. **It needed nothing from the library**: `DetailPanel` never
closes itself, it calls `onClose` and the screen owns the state, so a panel that may refuse to close
is already expressible and `detail-panel.md` carries no exception. Measured at 1440×1000 and
375×812: clean buffer + `Escape` → closed; dirty + `Escape` → confirmation, panel still open; Cancel
→ panel open, edit intact; `Discard changes` → closed; same on the row that switches project and on
the row that closes the open one.

**6. The property grid carries two columns at desktop widths**, 494px bands at 1440×1000 and 414px at
1280×800, one 229px column at 375×812 — the primitive's own rule against the content class, no count
stated by the caller.

**7. The one certified behaviour this screen loses the site for.** With no project selected the
delivered build drew the log stream with no download filename and **no action row at all** (0 action
rows against 1 with a project selected — `plan-docker_management_app-remove_copy_controls/REQ-12`,
verified on the delivered build before the migration). The stream now exists only inside a project's
panel, so it always has a filename; `ContainerLogsView` always passes one too, so **the product no
longer holds a call site in that state**. The component's behaviour is unchanged.

**The `CardList` budget is unchanged at 8**, as this batch's constraint requires — the conformance
check fails on a count lower as well as higher, so the untouched budget is evidence rather than an
omission. This migration changed no primitive, variant, prop or token; its only library edit is the
deletion of the retired component.

## Constraints on this batch

- **The log stream offered with no download filename is this screen's case** — Compose with no
  project selected — and `plan-docker_management_app-remove_copy_controls/REQ-12` certified that its
  action row then renders **nothing at all**: not an empty strip, not a gap. Verify it still does.
- Compose is the sole consumer of host-path validation on a write; the validated write-back and its
  confirmation are untouched.
- This screen holds **no `CardList` call site** — its list is `GroupedRowsPanel` — so the call-site
  budget in `client/scripts/check-ui-conformance.mjs` is **unchanged** by this batch. A budget that
  moved here means a `CardList` was introduced during the migration, which is exactly what the guard
  exists to catch.
- Feature code composes library components and nothing else.
