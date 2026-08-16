---
batch: 10
feature: F10 — plugins
closed_req: [REQ-46, REQ-47, REQ-48]
depends: [5]
---

# Batch 10 — plugins

Two `CardList` call sites (`PluginsScreen.tsx:223` CLI plugins, `:245` daemon plugins). Two defects of
its own: the `enabled` pill is **not column-aligned** — it is positioned relative to the version
string, so a row with a longer version such as `v0.36.0-desktop.1` pushes its pill left of its
neighbours' and the column reads ragged; and `No daemon plugins` is **bare text on no surface**,
floating in the layout with no card, no title treatment and no suggested action.

## Recorded 2026-08-17 — the presentation this batch migrated onto was retired afterwards

**Nothing in this file is edited, and that is deliberate**: it is the record of what was built and
what it was accepted on. The **comfortable** variant `INT-2` and `INT-3` migrate the CLI and daemon
plugin lists onto — each row on a card of its own, under a floating column header — was **retired on
2026-08-16**, prop, carrier surface, stylesheet rules and header-inset compensation together, and both
lists were converted again, onto the one table presentation containers and images already shipped.
This screen carries the case the later analysis measured: the CLI plugins list's `WHY UNAVAILABLE`
column, whose run from its label to its last value was cut by 15 surfaces and 14 gaps on the build
this batch delivered. This batch's acceptance and its measured figures were taken against the card
row and are read as of their own date, not as a description of what ships. Where the decision is
written: `.sdd/plans/plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/`
(REQ-18, REQ-22, REQ-26, and that plan's amendment to its own REQ-18), on
`.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md`.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client e2e suite, plugins area | The check, written and run **first**: with plugins of differing version-string lengths present, assert **every `enabled` pill has the same left edge** — the measurement, not the impression. Then assert the empty result renders on a surface with a title and one line. Report the pills' left edges before and after. | REQ-47, REQ-48 | — |
| INT-2 | modify | `client/src/plugins/PluginsScreen.tsx` (:223, `cliRow` at :45) | Migrate the CLI plugin list to the object list's comfortable variant, deleting the row-content builder. Name, version and availability keep their values, and **the version and the state become columns**, which is what makes the pill align by construction rather than by luck. | REQ-46, REQ-47 | INT-1 |
| INT-3 | modify | `client/src/plugins/PluginsScreen.tsx` (:245, `daemonRow` at :190) | The same for the daemon plugin list: name, interface in words, enabled/disabled state, the enable/disable switch, the inline inspect and the destructive removal. | REQ-46, REQ-47 | INT-1 |
| INT-4 | modify | `client/src/plugins/PluginsScreen.tsx` | Express both empty results — `No daemon plugins`, and the **stated reason** each inventory degrades to when the installation or the daemon exposes none — through the empty-state primitive: a title, one line, and the resolving action where there is one. The stated reason is content, and it must survive the change of container. | REQ-48 | INT-2, INT-3 |
| INT-5 | modify | `.sdd/modules/plugins/specs/plugins-screen.md`, `.sdd/modules/plugins/index.md` | Record the screen's new shape. English only. | REQ-46, REQ-48 | INT-2 … INT-4 |
| INT-6 | modify | client unit and e2e suites covering this screen | Update the coverage the migration invalidates; keep every assertion about the privilege reading, the install that **runs only once exactly those privileges are granted**, enable, disable, inspect and remove — none of them forced. | REQ-46 | INT-2 … INT-4 |

## Measured at implementation — both of this batch's premises understated their defects

Figures taken on the delivered build and on this one, built and served side by side against the
operator's own installation (15 CLI plugins, version strings 6 to 17 characters, `v0.36.0-desktop.1`
among them; **0 daemon plugins**), at 1440×1000, 1280×800 and 375×812, each with a throwaway
`VEXEL_DATA_DIR`. Nothing was installed on the daemon: the daemon-plugin state this machine cannot
reach was measured with the reading **stubbed in the browser** (4 plugins, 2 of them described), so
the figures below are of the delivered code drawing that data, not of a fixture put on the host.

**1. The pill's rag has two causes, and the plan named the loud one.** Delivered, the availability
pill took **three distinct left edges** down a column of fifteen rows — `588.7 / 652.6 / 657.3` at
1440×1000 and `508.7 / 572.6 / 577.3` at 1280×800, a **spread of 68.6px**. The version string is the
68.6px cause (`v0.36.0-desktop.1` lays out at 132.6px against 64px). The quiet one is the **badge's
own width**: `available` is 63.4px against `enabled`'s 58.7px, and it moved its row's pill by 4.7px
on its own. So "the pill sits relative to the version string" understates the mechanism — the pill
sat at the end of a trailing group whose *entire* content decided its position, and any value in that
group moved it. Both die with the column: after the migration there is **one left edge per
viewport** — 819.6 / 753.8 / 358.8, spread **0**, header cell and every row cell on the same edge. At
375×812 the pill column is off-screen until the table pans (scrollWidth 615 against clientWidth 269,
which is batch 2's contract); after the pan all fifteen pills sit at x=12.8, wholly inside the
viewport.

**2. `No daemon plugins` was not bare text on no surface — batch 5 had already fixed that half.**
`.ui-empty-state` gained its own border, wash and radius in the foundation batch, so the delivered
build painted that empty state on a surface measuring 452×121.2 at 1440×1000. What was actually left
of the defect is the **bare title**: `description` and `action` both explicitly `null`, and **one
element carrying loading and empty at once**. Two call sites therefore became **four** — the fourth
consecutive batch to find that (6 found 4 were 8, 7 found 2 were 5, 9 found 1 was 2). The copy now
carried: the daemon list states what a daemon plugin is and offers `Install plugin…` (driven with a
real pointer at the control's own coordinates, the install dialog opens); the CLI list states that
those are executables the installation ships and offers **no** action, being read-only; and where
either reading came with a reason, that reason is the line — and on the daemon list the action is
then **withheld**, because a daemon that exposes no managed plugin at all is not a condition
installing one resolves.

**3. The `Grid` is deleted rather than collapsed, and the decisive reason is the second one.**
`columns="1fr 1fr"` — missed by batches 4 and 5, found by batch 7's sweep — gave each list **157.5px**
at 375×812, where every version cell painted **35.2px past its own card**, and **103.8px** on the
buildx row, 83.8px of that across into the other card. `arrangement="pair"` would have repaired
exactly that and nothing else. But the inspection is the row's own expansion, so **a list's width is
the panel's width**: the pair capped the daemon plugin's raw document at **442 / 362 / 49.5px**, and
at 375×812 drew the expansion at **x=−12.5, w=89.5** — off the left edge of the viewport, with one
property value painting 0px wide and 313px tall. Stacked, the lists measure **1120 / 960 / 335px**
and the document **1012 / 852 / 229px**, the same figures batches 6 and 9 recorded. This is batch 6's
argument, unchanged: side by side and a full-width reveal are incompatible, and this screen has a
reveal. **Remaining never-collapsing templates: `ComposeScreen.tsx:205` (batch 11) and
`SystemScreen.tsx:176` (batch 14).**

**4. The daemon list carried a defect nothing in the plan named**, and it was found because batch 7's
rule was *applied* rather than because it was scheduled: the plugin's description is a value whose
presence depends on the plugin, and as a card line it alternated the row height **117.1px against
95.7px at all three viewports**. As a column it costs an undescribed plugin nothing: **59.4px on
every row**. That is the **fourth screen** the rule has caught (registries 76px hiding a cut line,
builders 95.1/73.7 over 151 rows, contexts 95.1/73.7, plugins 117.1/95.7) — and four screens found by
one rule that no screen's own requirement stated is the argument for it living **in the library's
contract**, where a migration meets it, rather than in a checklist a migration may not read. The CLI
list had the same shape (the unavailable reason as a second line) and is uniform at **56px**.

**5. The order and the cap were examined, not defaulted.** The read-only inventory is 1038px of rows
on a stock installation, so stacking it first pushes the daemon list down by its own height; capped
at the 60vh containers and images already use, 438px of that comes back and the daemon card's heading
lands at **y=925 of a 1000px viewport** at 1440×1000, still below the fold at 1280×800 (y=805) and
375×812 (y=924). It stays first because the install moved into the screen's `ScreenToolbar`: **the
one thing an operator comes here to do is above the fold at every viewport whatever order the lists
take**, which makes the daemon list's position a question about reading — and leading a typical
machine's screen (fifteen CLI plugins, none of the daemon's) with an empty state would open it on
nothing.

**This migration changed no file under `client/src/ui/`** — no primitive, variant, prop or token —
the second in a row, which is what REQ-92 asks for evidence of. The `CardList` budget drops **10 → 8**.

### Left for batch 19, as a precedent rather than an observation

**Two screens have now arrived at the same answer from different directions.** Batch 7 recorded that
`StatusDotCell` renders its dot as an **empty element** whose tone reaches the DOM only as a class
name setting a `background` — no `aria-label`, no `role`, no `title`, no visually hidden text — so a
row whose state is carried by the dot alone says it in colour and says it to nobody else; and it left
batch 19 a choice between two answers: **the dot names its tone**, or **a cell carrying state alone
must state it in words**. This screen took the second **independently**, on REQ-27's own ground —
what states is drawn as a statement, and a coloured dot beside a toned, worded badge states the same
fact twice — and the result is strictly better than what it replaced: the badge column carries the
availability in colour **and** in words, on every row of both lists, at a fixed left edge. Batch 19
is therefore choosing between an answer two screens have already reached and a change to a component
containers, images and the dashboard also draw.

## Constraints on this batch

- **The privilege grant is a safety behaviour, not a form step.** The install must still refuse unless
  exactly the privileges asked for are granted, and nothing here may make the grant implicit, remembered
  or skippable.
- The two inventories degrade to a **stated reason** rather than to emptiness when they are not
  exposed. An empty state that replaces a reason with a generic "nothing here" has destroyed
  information (REQ-48 asks for the primitive, not for the loss of the sentence).
- **Lower the `CardList` call-site budget in `client/scripts/check-ui-conformance.mjs` by the two
  sites removed here.** The check fails if the count is higher **or** lower than expected, so the
  budget is lowered deliberately or the batch does not go green.
- Feature code composes library components and nothing else.
