---
slug: ui-coherence-optimisation-comfortable_variant_retired-classic_table
date: 2026-08-16
spec: .sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md
status: validated
---

# Requirements — Every object list is one classic table

Evolution of
[`.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired.md`](../../analysis/ui-coherence-optimisation-comfortable_variant_retired.md)
(2026-08-15), whose decision was recorded and never delivered: its plan folder
`.sdd/plans/plan-ui-coherence-optimisation-comfortable_variant_retired/` is empty, and the programme
it belonged to — [`plan-ui-coherence-optimisation`](../plan-ui-coherence-optimisation/requirements.md)
— then merged (`d17e1df`) with the condemned presentation intact and three further lists migrated
onto it. That plan is **the reference plan and is amended by this one**, not re-opened: its batches
stay certified. Ids are local to this plan: `REQ-1` here is *not*
`plan-ui-coherence-optimisation/REQ-1`.

**One change, in one library component.** Every object list in the product is `DataTable`
(`client/src/ui/data/`), which offers two variants. The `comfortable` variant draws each row on a
card of its own under a floating column header; the `dense` variant draws ruled rows under one
header, as containers and images ship. This plan retires the first, converts its 21 call sites, and
makes the retirement enforceable so that it does not have to be decided a third time.

**The outcome is measured geometry, not appearance.** Every character on these screens is identical
before and after, so *"the volumes list shows eleven volumes"* and *"`WHY UNAVAILABLE` is
displayed"* are true of the rejected build itself. What changes is the boxes: the gap between two
rows, the corners a row carries, the number of enclosing surfaces, and the distance between a
header cell's left edge and its column's. Those are what the checks assert, and they are recorded
failing on the delivered build first.

**Three figures of the analysis were re-verified against the source on 2026-08-16 and two of them
are corrected here**, since the analysis itself asks for exactly that. They are corrected in this
plan rather than left for the implementer to discover, because a downstream artefact that repeats a
mis-enumeration is how the next reader inherits it — which is the failure mode this whole plan
exists to close, one level down:

- **21 call sites in 12 feature files across 8 screen areas — confirmed exactly**, at
  `VolumesPanel.tsx:258`, `NetworksPanel.tsx:287`, `RegistriesScreen.tsx:290,:338`,
  `BuildersScreen.tsx:362,:389`, `ContextsScreen.tsx:260`, `PluginsScreen.tsx:318,:356`,
  `ComposeScreen.tsx:434,:449`, `SwarmNodesPanel.tsx:210`, `SwarmServicesPanel.tsx:335,:364`,
  `SwarmSecretsPanel.tsx:189`, `SwarmConfigsStacksPanel.tsx:292,:317,:325`,
  `LayerEfficiencyView.tsx:198,:220,:243`.
- **The content below a row's cells is carried by four lists, not five.** `renderRowContent` is
  stated at `NetworksPanel.tsx:293`, `RegistriesScreen.tsx:342`, `SwarmConfigsStacksPanel.tsx:323`
  and `ComposeScreen.tsx:447`, and nowhere else. The analysis's fifth item, *"layer efficiency's
  per-layer content"*, does not exist: its three lists carry per-row **expansions**
  (`renderExpanded`), which is a different slot with a different gate. Both are in scope; REQ-6 and
  REQ-10 name them separately, because conflating them is how one of the two gets missed.
- **The nested lists are two, not three.** A list inside a row of another list is
  `ComposeScreen.tsx:449` (`hideHeader`, inside the projects list's row content) and
  `SwarmConfigsStacksPanel.tsx:325` (`hideHeader`, inside the stacks list's row content). Layer
  efficiency's three lists are **siblings inside a dialog**, not nested, so REQ-7 does not reach
  them and REQ-20 does not ask them to indent anything.

## F1 — One presentation, and it is a table

| ID | Requirement |
| --- | --- |
| REQ-1 | **An object list is drawn one way, by one component, in one presentation**: a single table surface, one header row at the top, body rows beneath it. There is no second list primitive, no "list card" component, no compatibility wrapper for the screens that used to have cards, and no per-screen choice of surface. |
| REQ-2 | **Rows are flush.** On every object list, the vertical distance between the bottom edge of one row and the top edge of the next is **zero** — no inter-row gap — at 1440×1000, 1280×800 and 375×812. |
| REQ-3 | **Rows are not cards.** No row carries a rounded corner, an outline, a shadow or a detached surface of its own; the separation between two adjacent rows is a **single hairline rule**. |
| REQ-4 | **One surface.** A list has exactly **one** enclosing surface boundary, with the header inside it and the rows continuous beneath it — not a header floating above a stack of surfaces. |
| REQ-5 | **Columns do not drift, and nothing compensates for it.** Every header cell's left edge equals its body cells' left edge **exactly**, at every horizontal scroll offset and at each of the three viewports. The header and the rows are inset identically by construction: **no compensating inset rule exists anywhere in the library**, the existence of such a compensation being the retired presentation's own signature. |

## F2 — Nothing the card carried is lost

| ID | Requirement |
| --- | --- |
| REQ-6 | **Content below a row's cells is drawn unconditionally.** The slot that renders content inside a row, below its cells and outside the selectable row itself, is **not gated on any presentation choice**: a list that supplies it gets it. The four lists that supply it today — the networks list's attached-container chips with their inline detach, the registries list's per-repository content, the swarm configs & stacks list's stacks content, and the compose projects list's nested per-project service list — still show it, with the same content and the same controls. **The gate goes in the same change that stops the flag being set, never after it**: today `DataTable.tsx:382` reads the slot only when the retired presentation is asked for, while the expansion declared beside it is ungated, so those four lists lose their content the moment the flag stops being true — with no error, no type change and no shorter list, only shorter rows. |
| REQ-7 | **Nested content reads as nested, by indentation, never by detachment.** Compose's per-project service list and swarm's per-stack list stay inside the **same table surface** as the row they belong to, laid out in the same pan region, ruled like it, and distinguished from it by **indentation and adjacency**. Neither the parent row nor the child list is put on a surface of its own. The nesting does not flatten into one undifferentiated run of rows, and no new arrangement is invented for it. **"On the same tracks" is the arrangement, not the columns**: a nested list keeps the columns it declares today (REQ-13), since giving a child list its parent's columns would be the redesign REQ-13 forbids. |
| REQ-8 | **Two-line rows keep both lines.** Every row that shows a title over a subtitle — volumes (the name over its mount path, the row that triggered this request), networks and registries among them — shows **every line it shows today**, unclipped and not hidden by overflow, at all three viewports. |
| REQ-9 | **A row gets the vertical room its content needs, and rows are otherwise uniform down a list.** Row heights do not vary row to row within one list except where the row's own content genuinely requires it; one presentation is not one fixed height. |
| REQ-10 | **The expansion still opens, in place, under its row.** The per-row expanded panel — including the three on layer efficiency, whose lists carry no row content but do carry expansions — opens directly below its own row, inside the same table surface, with the content, controls and pinning-to-the-pan-region behaviour it has today, and the one-expansion-per-list guarantee is unchanged. |
| REQ-11 | **Nothing about behaviour changes.** Hovering a row, selecting a row, the one-panel-at-a-time rule across lists, the row-actions column and the weights of the actions in it, sorting, keyboard traversal, focus return on dismissal, the truncation contract and the horizontal pan below the breakpoint all behave exactly as delivered. |
| REQ-12 | **The list stays usable below the desktop breakpoint.** At 375×812 every converted list **pans horizontally**, as containers and images do: no column resolves to zero width, and every column can be brought into view by panning. The failure the reference programme repaired in its first batches — columns collapsed to nothing and unreachable — does not return. |
| REQ-13 | **This is a change of surface only.** No column, value, wording, order, action, sort, filter, empty state or detail panel changes on any converted screen. A property that quietly leaves a row is a defect of this work, not a simplification. |

## F3 — The eight screen areas, converted

Each requirement below is the same claim about its own screens: their lists are drawn in the one
presentation of F1, satisfy REQ-2 to REQ-5 and REQ-11 to REQ-13, and keep every value, column,
action, expansion and piece of row content they show today, at 1440×1000, 1280×800 and 375×812.

| ID | Requirement |
| --- | --- |
| REQ-14 | **Volumes & networks** — the volumes list (the reported case: a volume's name over its mount path, both lines readable) and the networks list, whose attached-container chips and their inline detach survive per REQ-6. |
| REQ-15 | **Registries** — the registries list and the repositories list, whose per-repository row content survives per REQ-6. |
| REQ-16 | **Builders & build cache** — both lists. |
| REQ-17 | **Contexts** — the contexts list. |
| REQ-18 | **Plugins** — both lists, including the case the reference analysis measured: on the CLI plugins list, the `WHY UNAVAILABLE` value and the header naming it share one left edge, **measured as boxes**, against the roughly 1100px of drift the human read on the delivered build. |
| REQ-19 | **Compose** — the projects list and its nested per-project service list, whose nesting stays legible per REQ-7. |
| REQ-20 | **Swarm** — nodes, services (two lists), secrets and configs & stacks (three lists, one of them the nested stacks list of REQ-7 with its row content of REQ-6). |
| REQ-21 | **Images — layer efficiency** — the three lists (deleted-later/overwritten files, duplicated content, flagged paths), each keeping the per-row expansion of REQ-10 while drawn inside the dialog that holds them. This screen was excluded on 2026-08-15 and migrated onto the condemned presentation the next day; it is in scope and is named, not implied. |

## F4 — The retirement is enforced, not remembered

| ID | Requirement |
| --- | --- |
| REQ-22 | **The card-per-row presentation is removed, not merely unused.** The choice is absent from the component's **public interface** — no screen can ask for it — and no code path in the library draws it: the carrier surface, its stylesheet block, its body gap, its row padding, its expansion rule and its header-inset compensation are gone, not left behind unreferenced. |
| REQ-23 | **Reintroducing it fails a command the developer already runs.** `npm run lint` and `npm run test` fail, **naming what is wrong and where**, when the presentation is reintroduced either by asking the library for it or by a feature file reproducing it with markup or styling of its own (a per-row surface, a per-row border-radius or outline, an inter-row gap on a list body). The check is demonstrated red against a deliberate reintroduction of each of those two forms, and green on the converted tree. |
| REQ-24 | **The guard does not become a formality.** It names the decision and points at the record that made it, and it is not satisfiable by an exception comment added at the call site that violates it. |

## F5 — The record agrees with the product

| ID | Requirement |
| --- | --- |
| REQ-25 | **The normative artefacts that mandate or describe two variants are amended in place**, each amendment carrying **its reason, its date and a pointer to this analysis**: `plan-ui-coherence-optimisation`'s REQ-22, REQ-29 and REQ-81, and the passages of its `batches.md` naming the retired presentation as the destination of the migrations. The enumeration is **re-verified against those files** during implementation rather than trusted from the reference analysis, and anything it missed is amended too. A validated requirement left asserting the opposite of the shipped product is how a removal gets reinstated on its own authority. |
| REQ-26 | **The historical record of certified work is annotated, not rewritten.** The batch files of the certified batches that introduced or adopted the retired presentation gain a dated note stating that it was retired and pointing here, in the form those files already use for corrections; their interventions and their acceptance text stay as written. |
| REQ-27 | **Every module spec and index under `.sdd/modules/` states the one presentation.** No spec a later implementer reads describes two variants, a card-per-row row, a choice of surface, or a slot available only in one presentation — the library's own data-table spec first, and every screen and panel spec that names it. Specs are what the next implementer reads as current, so they are corrected rather than annotated. |

## F6 — The coverage, and the evidence

| ID | Requirement |
| --- | --- |
| REQ-28 | **Every assertion that names the retired presentation is restated or removed with what it covered.** It is spread across certified work: a unit file dedicated to the variant, the adoption-perimeter test that pins which files may state it, the screen unit tests asserting its class, and the e2e specs that assert it or use those lists as measured subjects against a ruled control. Each is either **restated against the one presentation** or **removed together with the thing it covered**. What may not happen is an assertion weakened into passing while the behaviour it named goes unchecked. |
| REQ-29 | **The delivered figures are on record before the change.** Each geometric check is observed **failing on the delivered build, with its measurements** — beginning with the volumes list that triggered this request and the Plugins `WHY UNAVAILABLE` case the reference analysis measured — and the same measurements are reported after. A "before: failed" with no numbers is not evidence on a layout defect. |
| REQ-30 | **The checks assert geometry, driven with a real pointer.** Inter-row gaps, row corner radii, the count of enclosing surface boundaries, header and body column left edges, row heights and viewport boxes are what is asserted; every interaction is driven with a **real pointer at the visible control's coordinates**, never `element.click()`, never a dispatched event, never a visually hidden target. Content assertions stand **beside** the geometric ones and never instead of them. |
| REQ-31 | **Geometry is never asserted in jsdom.** Every box is zero there, so a "the rows are flush" unit test passes on any build, defect included. Every geometric assertion lands in the Playwright tree; unit-level checks are **contract and state only** — which props a call site states, that no feature file states a surface, that every value still renders in order — and say so on the spot. |
| REQ-32 | **The verification obeys the project's test discipline against the real daemon**: its own labelled fixtures, full cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon, no inherited application state, its own data directory, no test reaching Docker Hub, and **every spec passing on its own**. |

## F7 — The boundaries that hold

| ID | Requirement |
| --- | --- |
| REQ-33 | **Every visual element still comes from the UI library.** No feature file gains a raw DOM tag, a stylesheet, a CSS module, an inline style prop, a visual class, or a hard-coded colour, radius, blur, spacing, shadow, font size or z-index. Feature files change only by **ceasing to ask for a presentation** and by stating what the one presentation needs. |
| REQ-34 | **No blur is added, moved or removed anywhere.** These lists are main view. The blur allow-list, the conformance check's blur half and the static pre-blurred background asset are untouched; an edit to them is a signal that something has gone wrong, to be reported rather than made. |
| REQ-35 | **The change costs no more at runtime than what it replaces.** Removing a surface per row **reduces** the layers painted on a long scrolled list and never increases them; no scrolled surface gains a filter, a transition or an animation, and no virtualisation or scrolling behaviour of the list regresses. |
| REQ-36 | **The certified predecessors on these screens stay certified**, and are **named in the checks rather than assumed**: the detail property column rule, the absence of any copy affordance, the dialog sizing rules, and the switch that must not drag its surface out of the viewport. |
| REQ-37 | **No server file, no API and no daemon behaviour is in the diff.** |
| REQ-38 | **English only** in source, identifiers, comments and every amended artefact; **kebab-case** for any new file. |
