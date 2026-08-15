---
batch: 5
feature: F5 — the library gains the missing layer (declared foundation batch)
closed_req: [REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-94]
depends: [2, 4]
---

# Batch 5 — library-layer

**Declared foundation batch — the only non-feature batch in this plan.** Nothing on screen changes.
It exists because the analysis's governing observation is that restyling screens one at a time
produces thirteen new answers: the five questions are answered **once**, here, and every batch after
this one is a screen adopting the answer and deleting what it had.

## Read this before writing any code

**The analysis says "add the five primitives". Four of the five already exist and are widely
adopted.** `SectionHeader`, `EmptyState`, `DetailPanel`, and the `ActionButtonGroup` / `Menu` /
`ScreenToolbar` family are live across 37 files. What is missing is not components but **rules**:
`Card`'s eyebrow title competes with `SectionHeader`; `EmptyState` is used on some empty results and
not others; and **three list components ship** — `DataTable`, `CardList`, `GroupedRowsPanel` — with
nothing to choose between them.

So this batch is **consolidation, not construction**. An implementer who builds five new components
has produced exactly the near-duplicates `CLAUDE.md` forbids and has doubled the incoherence.

**`CardList` is not deleted here.** It has **seventeen live call sites across eleven files** and it
goes in batch 13, once the last of them is migrated. Deleting it now does not compile — so INT-12
seeds a call-site budget instead, which is what catches an eighteenth being added during the eight
batches in which the component is still exported.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | modify | `client/src/ui/data/DataTable.tsx` and `data-table.css` | Extend it with a **comfortable** variant beside its dense one, absorbing what `CardList` presents today so that seventeen call sites lose nothing in the swap: title, monospace subtitle, trailing badge group, meta values, optional leading state dot, active-selection row (active marker plus a "use" action), and the expansion slot inside the row. One component, one variant prop — not a second list. It carries batch 2's column contract and batch 4's truncation contract by construction. | REQ-22, REQ-28 | — |
| INT-2 | modify | `client/src/ui/glass/DetailPanel.tsx` and its stylesheet | Fix the panel's shape as a contract rather than a convention: **always** the full width of the content column it is placed in — never nested in a narrow card column — **always** the two-column property grid (`DefinitionList`) for its properties, **always** left-aligned values, tabs optional. A raw payload block inside it gets the panel's full width. | REQ-23, REQ-28 | — |
| INT-3 | modify | `client/src/ui/data/DataTable.tsx` (expansion) and `client/src/ui/glass/DetailPanel.tsx` | **At most one panel open at a time within one list**: opening a second closes the first. Enforced by the component, not by each screen remembering to — that is why two panels can be open at once on volumes and networks today. `Escape` and the owning row keep closing it, through the existing escape arbitration. | REQ-24 | INT-1, INT-2 |
| INT-4 | modify | `client/src/ui/feedback/EmptyState.tsx` and its stylesheet | **Make the component insist.** The three empty-state treatments the analysis counts are this one component rendering whatever subset it was handed — compose passes a `title` alone (`ComposeScreen.tsx:212`), plugins a `title` plus a usually-absent `description` (`PluginsScreen.tsx:259`), registries the full form. So: it **always renders on a surface of its own**, whatever the caller passes, and its **explanation and resolving action become structural rather than optional** — a bare title is not obtainable, and omitting an action that would resolve the condition is a visible decision in the API rather than a default. Keep the full-height centred and compact in-pane presentations. | REQ-25, REQ-28 | — |
| INT-5 | modify | `client/src/ui/glass/SectionHeader.tsx`, `client/src/ui/glass/Card.tsx`, `client/src/ui/controls/FormSection.tsx` and their stylesheets | **One treatment.** `SectionHeader` becomes the one way a section is titled, absorbing `Card`'s eyebrow title and the micro-caps field-label treatment used in dialogs, and gaining an optional **sublabel that does not shift a neighbouring header's baseline** — the swarm bottom-row defect. Callers that titled a section any other way have one way left. | REQ-26, REQ-28 | — |
| INT-6 | modify | `client/src/ui/controls/ActionButtonGroup.tsx`, `client/src/ui/controls/Menu.tsx` and their stylesheets | **One rule, expressed in the API**: a caller declares its actions and their weight — primary, secondary, overflow, destructive — and the cluster decides what is a button and what becomes a menu entry. **Bare text is never a control**, so there is no weight that renders as unadorned text. The rule must be un-re-answerable by a screen; that is the whole point. | REQ-27, REQ-28 | — |
| INT-7 | modify | `client/src/ui/data/GroupedRowsPanel.tsx` | Rebuild it on the object-list primitive, or retire it into a grouped variant of it. One grouped list, sharing the row rendering, the action cluster and the truncation contract rather than duplicating them. It has a single call site (`ComposeScreen:208`), migrated in batch 11. **The outcome is stated; the mechanism is yours, recorded on the spot.** | REQ-22, REQ-28 | INT-1, INT-6 |
| INT-8 | modify | `client/src/ui/index.ts` | Export every new variant, prop and type from the public entry point, **before** any feature consumes them. The library grows first; that is not negotiable. | REQ-28 | INT-1 … INT-7 |
| INT-9 | create | client unit test tree, UI library area | Cover every variant and state the batch delivers: dense and comfortable; tabbed and untabbed panels; one-open-at-a-time; empty state with and without an action; a header with and without a sublabel and the neighbour's baseline unmoved; each action weight, and the absence of a text weight. The eight migrations that follow rest on this rather than on their own first use. | REQ-29 | INT-1 … INT-8 |
| INT-10 | create | client e2e suite, cross-screen | The foundation batch's own acceptance: **all thirteen screens render identically to the delivered build** at 1440×1000, 1280×800 and 375×812 — viewport boxes of the principal surfaces measured before and after. A screen that moved means the work leaked into the feature layer. | REQ-30 | INT-1 … INT-8 |
| INT-12 | modify | `client/scripts/check-ui-conformance.mjs` | **The retirement guard**, and the one planned edit this plan makes to this file. Hold the **expected number of `CardList` call sites in feature code**, seeded with the count measured at the start of the programme, and fail when the actual count differs **in either direction** — higher means a screen acquired a new call site during the window in which the component is still exported, lower means a migration landed without the budget being lowered deliberately. Batches 6 to 12 each lower it; batch 13 requires **zero** and removes the check with the component. Touch **nothing** in the file's blur half: `blurAllowedOverlaySelectors` and every blur rule stay byte-identical. | REQ-94 | INT-1 |
| INT-11 | modify | `.sdd/modules/ui-library/index.md` and the specs of every component touched | Record what each component now guarantees, and — the part that makes the programme stick — **which question each is the one answer to**. A later reader must be able to see that there is one list, one panel shape, one empty state, one section header and one action rule, and that choosing otherwise is not an option the library offers. English only. | REQ-22 … REQ-28 | INT-1 … INT-8 |

## Measured at implementation — three of this batch's premises did not survive the code

Recorded here, with figures, so that the batches downstream are scoped from a measurement rather
than from a sentence written before the call sites were counted.

**1. `EmptyState`'s incompleteness is an order of magnitude larger than INT-4 states.** INT-4 names
compose and plugins. Counted over the tree: **49 call sites — 45 in feature code, 4 in the library —
of which 26 pass no `description` and 42 pass no `action`.** The 26 without an explanation, by file:

| Screen | Files |
| --- | --- |
| Volumes & networks | `VolumesPanel.tsx` ×2, `NetworksPanel.tsx` ×2 |
| Images & layers | `LayerEfficiencyView.tsx` ×3, `LayerExplorer.tsx` ×2, `ImageDetailPanel.tsx`, `FilesystemBrowser.tsx` |
| Compose | `ComposeScreen.tsx` ×3 |
| Containers | `ContainerStatsView.tsx`, `ContainerProcessesView.tsx`, `ContainerDetailPanel.tsx` |
| Contexts | `ContextsScreen.tsx` ×2 |
| Builders & cache | `BuildersScreen.tsx` ×2 |
| System & prune | `SystemScreen.tsx` ×2 |
| Dashboard | `DashboardScreen.tsx` ×2 |
| Registries | `RegistriesScreen.tsx` |

So **REQ-48 and REQ-51 are not "fix two screens' empty states"**: they are the visible part of
supplying copy nobody ever wrote. Every omission is now an explicit `null` in the source — `grep -rn
"description={null}" client/src` finds all 26, and `action={null}` all 42 — so each batch scopes its
share by grep rather than by a screen-by-screen audit.

**2. The micro-caps treatment INT-5 attributes to `FormSection` is `FormField`'s.** `FormField`'s
label is 12px / 600 / `0.04em` / uppercase / `--color-text-muted`; `SectionHeader`'s eyebrow is 12px
/ 600 / `0.06em` / uppercase / `--color-text-secondary`. `FormSection`'s own title is 14px / 600 /
sentence case / `--color-text-primary` — a *fifth* treatment, not the fourth. Unifying either with
the eyebrow changes letter-spacing and colour in every dialog, which is REQ-79's work in F19; both
are left as delivered here.

**3. The right-aligned value REQ-34 reports on networks has a single source**, found here and left
for batch 6 to remove: `.ui-definition-list__value { text-align: right }` in
`client/src/ui/data/data-table.css`. It is inert for a value that fits and live for one that wraps.
Batch 6 does not need to go looking for it.

Two further corrections, without consequence for a later batch: INT-3's "within one list" would not
have closed the case it names — volumes and networks are **two** lists in two cards, so the guarantee
is enforced in `DetailPanel` (cross-list, cross-screen) instead; and neither of those panels uses
`DetailPanel` today, so it is inert until batch 6 migrates them.

## Constraints on this batch

- **One screen change, and exactly one** (REQ-30, amended at implementation — see the acceptance in
  `batches.md`): `EmptyState` gains the surface REQ-25 requires of it, which is visible in all 49
  places at once because it is one component. Measured, in every container the product places it in,
  at all three viewports: **width unchanged** (`box-sizing: border-box` is global), **height +2px**
  (the hairline), **title +1px y**. The single `compact` call site
  (`images/FilesystemBrowser.tsx:331`) additionally gains a `--space-4` horizontal inset: **+10px
  height, +17px title x, +5px title y**, and **+28.85px height at 375×812**, where the inset costs
  the description a line. Nothing else on any screen moves.
- **Every other feature-layer change is compile-forced**, which this batch's own wording admits: the
  `EmptyState` API tightening puts 24 feature files in the diff, each edit adding an explicit `null`
  where a prop was absent, and each therefore render-identical.
- **Domain-agnostic** (REQ-28): no Docker vocabulary in a name, prop or string; no fetching; data and
  callbacks arrive as props. `grep` the five components for `container`, `image`, `volume`,
  `network`, `daemon`, `swarm` and find nothing.
- **`CardList` stays, exported and working**, until batch 13.
- Every value is a token in `client/src/ui/tokens.css`. No blur is written anywhere;
  `check-ui-conformance.mjs` is not modified and passes.
