---
slug: docker_management_app-containers_card_view
date: 2026-08-25
spec: .sdd/analysis/docker_management_app-containers_card_view.md
status: validated
---

# Requirements — The containers list becomes a card view, and the metrics behind it are sampled only while somebody is watching

Evolution of the delivered product. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md); the sibling plans on
this same screen ([`container_row_actions`](../plan-docker_management_app-container_row_actions/requirements.md),
[`container_detail_close`](../plan-docker_management_app-container_detail_close/requirements.md),
[`list_ordering`](../plan-docker_management_app-list_ordering/requirements.md)) stay certified and
are preserved by name below.

Requirements are observable, individually verifiable behaviours. Ids are local to this plan: `REQ-1`
below is *not* `plan-docker_management_app/REQ-1`. Requirements of other plans are always cited with
their path prefix.

**Three features, because the spec argues for three and they fail independently.** The spec states
it outright — *"the two halves are separable and should be recognisable as such in the plan: a card
view that renders whatever it is given, and a sampler that is asked for less, less often"* — and the
third is neither: the 2026-08-16 retirement of the card row is machine-enforced today, so the
exception has to be opened, by name, before a card list can compile at all. Each of the three can be
accepted or rejected on its own: cards can be right while the sampler still runs at boot; the
sampler can be gated while the list is still a table; the guard can admit containers while nothing
else has changed.

**F1 is presentation only.** Nothing in F1 asks the daemon for anything new. NET I/O, the host's
capacity and the sampled figures already exist where the list is built; F1 displays them. If a
later phase establishes that one of them genuinely is not available there, that is a finding to
report — not a licence to drop a value the mock draws.

**F2 is server-side, and that is the whole of its point.** The sampler runs today in a loop started
at process boot, every 3 seconds, one daemon call per running container, on every screen and with no
browser connected at all. A gate built in the client would satisfy the words of "stop it when the
section changes" and would not remove one single request. Every requirement of F2 is stated as
traffic that reaches the daemon, never as what the interface draws.

**The mock is normative for arrangement, not for pixels.** `.sdd/analysis/ui-mock/containers-refactor.png`
decides which band an element sits in, its order within that band, its alignment and what it is
aligned to. Spacings, sizes, colours and weights come from the library's existing design tokens.
Where the words of the element map and the image disagree, the image wins (REQ-11). The mock's
Italian strings are the author's shorthand: no string is translated or newly authored (REQ-27).

**Amended 2026-08-25 — the mock is departed from on two positions, deliberately and by name.** The
delivered list lays its cards **three to a row** and each card stacks its metrics **one per row**;
the mock draws one card at full width with the three metrics side by side. The human decided this on
the running product, which showed what a static mock could not: at full width the metric columns
spread across roughly 1000px, a void through the middle with `NET I/O` against the right edge. The
two departures are annotated on REQ-1, REQ-6 and REQ-11, and consequences on REQ-10, REQ-23, REQ-32
and REQ-34; the reasoning is in the analysis's *Amendment — 2026-08-25: three cards to a row,
against the mock*. **The mock remains normative everywhere else**, including for the bands, their
contents and their order, the accent bar, the action arrangement and the *no sample* state.

**Amended 2026-08-25 (second) — a second mock governs the card's internal arrangement.**
`.sdd/analysis/ui-mock/containers-refactor-b3.png` decides, from that date, **where every element
sits inside a card**, and supersedes `containers-refactor.png` on that point alone;
`containers-refactor.png` is not deleted and stands as the record of what was originally asked,
remaining normative for everything the newer image does not redraw. It was chosen by the human from
generated working mocks — `containers-card-layout-variants.png` (whole-card arrangements A/B/C) and
`containers-card-ports-variants.png` (port placements B1/B2/B3 on B) — after the delivered card was
judged *"disposti un po' a caso"*, and the delivered arrangement is **B3**. What moved and why is in
the analysis's *Amendment — 2026-08-25 (second): the card's internal arrangement, chosen on generated
mocks*; the annotations are on REQ-3, REQ-4, REQ-5, REQ-6, REQ-9, REQ-11, REQ-12, REQ-20, REQ-22,
REQ-23, REQ-27, REQ-28, REQ-30, REQ-31 and REQ-34. The two departures of the first amendment stand
unaffected.

## F1 — The containers list presents one card per container

| ID | Requirement |
| --- | --- |
| REQ-1 | The containers screen renders one card per container, stacked vertically at full width, each detached from its neighbours by a uniform gap. On this screen the table presentation is gone: no header row, no hairline rules between rows, no single enclosing surface around the list. | **Amended 2026-08-25 — arrangement**: the cards are laid **three to a row**, not one per row at full width (two at ≤1200px, one below the phone breakpoint), each still detached by the same uniform gap and the table presentation still gone. Decided by the human on the running product and against the mock; the reason, the evidence and what remains normative are in the analysis's *Amendment — 2026-08-25: three cards to a row, against the mock*. |
| REQ-2 | Each card carries a state accent bar down its left edge, running its full height and following the card's left rounding, coloured by the container's state — green running, amber paused, neutral exited. |
| REQ-3 | Band 1 carries, at the left in this reading order: the status dot, the container name as the most prominent text on the card, the state pill in uppercase (`RUNNING` / `PAUSED` / `EXITED`), and the short container id in muted monospace. | **Amended 2026-08-25 (second) — the identity band is split, and the id is anchored.** The dot and the name stay at the left, the name being the card's most prominent text and now **truncating with an ellipsis** when the row cannot hold everything; the **short id moves to the right edge of that same row**, where it is anchored and **never truncates** — it no longer floats on the most prominent line, which was one of the four faults the human named. The **state pill moves to a line of its own** directly under the name, beside the status sentence (REQ-5, REQ-9). Also new on this row, at the top right: a small square control that will open the container's detail **in a modal**. It is **built and deliberately inert** — chosen by the human on 2026-08-25 over wiring it to today's inline panel or shipping it disabled: it renders with an accessible name, it is **not** disabled, clicking it does nothing, and it fires no card selection. Its click arrives with the intervention that removes the inline panel. |
| REQ-4 | Band 1 carries, at the right and vertically centred with the identity group: the primary lifecycle action (`Stop` / `Resume` / `Start`), then a gap, then a segmented cluster of `Pause` · `Restart` · `…` in that order sharing one boundary with internal dividers between them, the cluster ending flush at the card's inner right edge. | **Amended 2026-08-25 (second) — the actions leave band 1 for a footer of their own.** Everything this requirement fixes about them holds unchanged: the primary lifecycle action (`Stop` / `Resume` / `Start`), a gap, then a segmented cluster of `Pause` · `Restart` · `…` in that order sharing one boundary with internal dividers, the cluster ending flush at the card's inner right edge. What changes is **where that band is**: at the **bottom** of the card, below a hairline and on a slightly distinct ground, the primary action at the left of it and the cluster at the right. The reason is the first of the human's four faults — the actions stood between identity and provenance and interrupted the description; read and act are now two gestures. **Calibrated and one bug fixed, 2026-08-25, on the running product.** The bug: the overflow trigger came out **3px shorter** than the two segments welded to it (24px against 27px), because each member derived its own height — so the cluster's rounded end read as a bulge escaping a boundary it was not sharing, and a segmented cluster of unequal heights has no shared boundary at all. The **group** now owns the height and every slot takes it, which also holds for a member added later. The calibration: the footer's controls are at the library's **ordinary** button size rather than a list row's `sm`, and the card takes the library's **medium** inset rather than its largest — both existing steps of the scale, no length written for this card, with the residue against the mock's own figures recorded in `container-card.md`. |
| REQ-5 | Band 2 carries, at the left in this reading order: the `image <reference>` chip (label muted, value monospace), the ports chip (monospace, accented) — present only when the container publishes ports — and the status sentence in muted plain text (`Up 44 seconds`, `Paused 12 minutes ago`, `Exited (0) 2 hours ago`). **Every** published mapping is shown in the ports chip's place — none truncated, summarised or replaced by a `+N more` affordance — so a container publishing many ports wraps onto further lines and makes a taller card. **Annotated 2026-08-25**: the chip carries **exposed-but-unpublished ports as well as published mappings**, and is present when the container reports at least one port of either kind. The delivered row's `formatPorts` rendered every entry — `publicPort→privatePort` when published, the bare `privatePort` when not — and REQ-12 governs here: no value the delivered row showed may disappear from the card. The wording of a published mapping is unchanged, and the "every mapping, wrapping, none truncated and none summarised" rule applies to the whole set. | **Amended 2026-08-25 — the "every mapping, none summarised" decision is reversed, by the human who took it.** The card draws **at most three port chips and then a single `+n`** carrying the remainder, splitting at four rather than three so a degenerate `+1` is never drawn; the full set stays in the detail panel. The reversed decision was taken for a card at **full width**; with three cards to a row (REQ-1) one container's port list set the height of every card standing beside it, and the human reversed it on seeing that. The annotation above is **not** withdrawn: its ruling — that exposed-but-unpublished ports count as ports here and that the chips are present when the container reports at least one of either kind — still stands, and so does the wording of every chip that is drawn. What is withdrawn is only "none summarised". **Amended 2026-08-25 (second) — band 2 is dissolved and its three elements go three ways.** The **image reference takes a full-width line of its own**, as a bordered field with a muted `image` label, and **truncates at the front** (`…r.io/acme-platform/payments-service:2.14.0-rc3`) so the registry host is what is lost and `name:tag` survives — the fault the human raised by name, a long reference wrecking the line it shared. The **ports move out of provenance entirely** and become a `PORTS` **row of the metric strip** (REQ-6), label at the left, chips right-aligned: the image says what the container is made of, the ports say how it is reached, which is operational and of a kind with the metrics. That withdraws *"present only when the container publishes ports"*: the row is **always drawn**, labelled, and reads `none` where the container reports no port — the label is what anchors the row's shape between one port and four. The **status/uptime sentence moves beside the state pill** (REQ-3, REQ-9). Unchanged: the wording of every chip and the exposed-vs-published ruling above. **The cap is lowered from three chips to two** (splitting at three, so a `+1` is still never drawn): measured against the running product, three chips plus the `+n` overflowed the row onto a second line at the delivered track width (379px at a 1480px viewport), and a row that grows a line is the anchored shape this move exists for, lost — and, cards being as tall as their row's tallest, a line every card beside it pays for. |
| REQ-6 | Band 3 is three columns spanning the card's inner width: `CPU` and `MEMORY` of equal width side by side, then a narrower `NET I/O`. | **Amended 2026-08-25 — arrangement**: band 3 is **three full-width rows**, `CPU` over `MEMORY` over `NET I/O`, not three columns side by side. The consequence of REQ-1: at a third of the page three columns leave no width to read a value in. `CPU` and `MEMORY` remain equal to each other and `NET I/O` remains the untracked one; the order is unchanged. REQ-7's right-aligned capacity note and REQ-8's untracked pair are unaffected — each is now aligned to a full-width metric's own right edge rather than to a third of one. **Annotated 2026-08-25 (second)**: the strip gains a **fourth row, `PORTS`**, after `NET I/O` — same rhythm, label at the left, content right-aligned, no track (REQ-5). `CPU`, `MEMORY` and `NET I/O` keep their order, their contents and their treatments; stacked, `NET I/O` reads on **one line** (label left, `in`/`out` right) rather than two, which is the rhythm every row of a stacked strip reads in. |
| REQ-7 | In the `CPU` and `MEMORY` columns the first line carries the small uppercase muted label followed by the value at the left, with the capacity note (`of 8 cores`, `of 31.0GB`) right-aligned to that column's own right edge; the second line is a thin track spanning the column's full width, carrying a fill. |
| REQ-8 | The `NET I/O` column's first line carries the label alone; its second line, aligned with the tracks beside it, carries `in <value>` and `out <value>` with muted labels and prominent values. It carries no bar. |
| REQ-9 | The three bands appear in that order — identity and actions, then provenance, then metrics — on every card and in every state. | **Unaffected by the 2026-08-25 amendment**, and stated so because REQ-6 beside it was amended: the *band* order is untouched. What changed is the arrangement **inside** band 3, not which band comes where. **Superseded 2026-08-25 (second) — this is the requirement the rearrangement changes.** The bands are now **five and a footer**, in this order on every card and in every state: **identity → state and uptime → image → metrics (`CPU`, `MEMORY`, `NET I/O`, `PORTS`) → footer actions**. The principle is untouched — one order, every card, every state, ordered by decreasing prominence — and what changes is that the actions no longer interrupt the description and that provenance is no longer one band. The note beside this row, written when only REQ-6 had been amended and the band order was still the delivered one, is what is superseded. |
| REQ-10 | The metric columns occupy the same horizontal positions on every card of the list, so that the values line up vertically down the list whatever each card's content. A card whose metric columns drift with its content fails this requirement. | **Restated 2026-08-25 — the same property, read on the arrangement that now exists.** With a grid (REQ-1) and a stacked strip (REQ-6) there is no longer one column of cards for values to line up down, so the original sentence would be read as true while meaning nothing. What is required now: **within a row**, every card is the same width and every strip places its metrics at the same x, so the values line up **across** the row; and **down each column of the grid**, the cards being of equal width, the metrics of the same rank line up too. The prohibition is unchanged and is the point of the requirement: a card whose metrics drift with its own content fails it. |
| REQ-11 | Every element's position is derived from the mock, not from the current table's column order and not from the implementer's judgement. Where the element map above and the mock image disagree about a position, the delivered arrangement matches the image. | **Amended 2026-08-25 — two named departures, and no others.** The mock stays normative exactly as written, with two positions **deliberately departed from** by the human's decision on the running product: cards three to a row against the mock's one at full width (REQ-1), and the metrics stacked against the mock's row of three (REQ-6). Every other position in the map remains the mock's, and the rule that the image beats the words still governs everywhere else — a third departure is a defect, not a precedent. **Amended 2026-08-25 (second) — a second mock, for the inside of the card.** `containers-refactor-b3.png` decides where every element sits **inside a card** from 2026-08-25 and supersedes `containers-refactor.png` on that point alone; the earlier image stands as the record of what was originally asked and is still normative for everything the newer one does not redraw. The rule is unchanged in kind: positions are derived from the governing image, not from the table's old column order and not from the implementer's judgement, and where these words and that image disagree the image wins. The two named departures above are unaffected, and the working mocks the choice was made on (`containers-card-layout-variants.png`, `containers-card-ports-variants.png`) are the record of that choice, not further norms. |
| REQ-12 | Every value the delivered row shows, the card shows: state, name, image reference, published ports, the status/uptime sentence, CPU and memory. Verified value by value against the delivered list rather than by inspection of the card alone. | **Annotated 2026-08-25**: past the cap the card shows the first chips and a `+n` (REQ-5, as reversed — **three then `+n` as first delivered, two then `+n` from the measured correction of 2026-08-25**), so the *presence* of the value is what this requirement demands of the ports and not the enumeration of every one of them — the full set is one click away in the detail panel. No other value is affected: every one of them is on the card in full. **Annotated 2026-08-25 (second)**: the rearrangement removed no value and reworded none. Every one of them is still on the card, in a new position: the id at the right of the name row, the uptime beside the state pill, the image on a line of its own (front-truncated in the display, whole in its `title` and in the detail panel), the ports in the `PORTS` row — which now also **states the absence**, reading `none` instead of silently omitting the chips. |
| REQ-13 | The card adds NET I/O `in` and `out`, the CPU capacity (`of <n> cores`), the memory capacity (`of <total>`), and a fill on the CPU and memory tracks proportional to the value against that stated capacity — with a non-zero measurement staying visible rather than rounding away to nothing. |
| REQ-14 | Block I/O and PIDS do not appear on the card; they stay in the detail panel. |
| REQ-15 | The metrics are live: a card updates its numbers and its fills in place, without the card moving, without the list reordering, and without any other card being disturbed. | **Annotated 2026-08-25 (second)**: it governs the ports too, and caught a defect there. The daemon's port order is not stable across reads, so a card drawing **a subset** of a container's mappings (REQ-5's cap) drew a different subset on many polls — two chips swapping identity while the container had not changed, which is the class of movement this requirement refuses. Fixed at the source, in the list summary, by imposing a total order on the mappings (private port, then public, then protocol) rather than in the card: every consumer of the shape inherits the stability, and the detail panel agrees with the card by construction. |
| REQ-16 | A metric with no sample is stated as one: the value reads `—`, the capacity note is replaced by the explicit *no sample* wording, and the track is drawn empty. It is visibly distinguishable from a measured zero, which shows its number and keeps its capacity note. "No measurement" and "measured zero" are never rendered alike. |
| REQ-17 | Values step from one sample to the next. Nothing on the card is tweened, animated or transitioned between samples, and no animation or transition is introduced on this scrolled surface. |
| REQ-18 | The accent bar, the dot and the pill derive from the same container state and always agree, and the metric fills take that same state colour. No card shows two states at once. |
| REQ-19 | Every container state the product can display gets a pill, an accent and a dot by the same rule — created, restarting, removing and dead included, not only the three the mock happened to draw. |
| REQ-20 | The four action slots keep their delivered contract: fixed number, fixed order, the same position on every card whatever the state; the first slot carries the state-appropriate lifecycle action; an action not legal in the current state is shown in place and disabled rather than removed; `…` is always last and never moves. | **Annotated 2026-08-25 (second)**: the four slots keep this contract exactly, and now hold it in the card's **footer** (REQ-4). "The same position on every card whatever the state" is read against that band: the primary slot at its left, `Pause` · `Restart` · `…` at its right, `…` always last. |
| REQ-21 | The overflow menu behaves exactly as delivered: same entries, order, wording, destructive marking, hints, disabled entries, one-menu-at-a-time rule, keyboard operation, and binding to its own container. |
| REQ-22 | Beyond the elements the mock itself varies — the ports chip, the primary action's label and tone, the disabled states and the *no sample* metrics — a card in one state is laid out identically to a card in another, and every card in the list is the same width. | **Annotated 2026-08-25 (second)**: the arrangement is the same for every card, the `PORTS` row included — it is drawn on every card, only its content varying (chips, a `+n`, or `none`), which is one element fewer that appears or disappears with the container. |
| REQ-23 | Selecting a card opens that container's tabbed detail (Logs, Stats, Config, Processes, Inspect, Exec, Attach) with its delivered content, at full width, directly beneath the selected card; selecting the same card again closes it; at most one is open at a time. | **Amended 2026-08-25 — arrangement**: the panel spans the **whole row** of the grid and opens beneath the row that holds the selected card, the cards below moving down. "Full width, directly beneath the selected card" is what that reads as when a row holds one card; with three to a row it is the row, not the card, the panel sits under. Everything else — the tabs, the content, the second-selection close, the `Escape` close, one at a time — is unchanged. **Annotated 2026-08-25 (second)**: unchanged, and now guarded on a second front. The card's new top-right control is **inert and swallows its own click**, so it neither opens this panel nor closes it, and clicking the card anywhere else still opens the inline detail exactly as delivered. That control's click arrives with the future intervention that moves the detail into a modal and removes this inline panel; until then, the panel described here is the only detail there is. **Annotated 2026-08-25 — the delivered behaviour does not satisfy the amendment above, and it is not being fixed.** The panel spans the whole row of the grid and opens beneath the **selected card**, not beneath the **row** that holds it: selecting the first card of a three-card row pushes its two row-mates below the panel. Measured at 1440×1000 with four fixtures — the row-mates go from y=367.8 to y=954.8, the panel sitting at y=623.6 — so a row of three becomes a row of one with the other two carried under the panel. The cause is the placement: the row-spanning child is emitted immediately after the owning card, and the grid's auto-flow sends the rest of that row past it. The human's decision of 2026-08-25: **not fixed**, because the intervention that moves the detail into a modal removes this inline panel altogether and its placement with it — paying for the fix, and for the coverage of it, buys nothing. The e2e check that asserted "beneath the row" was **removed for that reason and not because it failed**; everything else about the panel is still checked — that it opens, that it spans the grid's width, that it opens below the card that owns it, that the cards after it move down, that a second selection closes it, its tabs and its `Escape`. |
| REQ-24 | The list order is unchanged and is still the server's — alphabetical by name, total, stable across re-reads — and the client derives none of its own. No sort control is added. |
| REQ-25 | No selection and no bulk actions appear on this screen. |
| REQ-26 | The screen's toolbar, filters and empty state behave exactly as delivered, and filtering still preserves relative order. |
| REQ-27 | Every string is unchanged and stays in the product's current language; the only new strings are the labels the new metrics genuinely require (`NET I/O`, `in`, `out`, the capacity notes and the *no sample* wording), authored in English. No Italian from the mock reaches the product. | **Annotated 2026-08-25 (second)**: three new strings, all English and all genuinely required by the arrangement — the `PORTS` label, `none` for a container reporting no port, and the detail control's accessible name (`Open <name> details`). Nothing existing was reworded: the daemon's own status sentence is passed through untouched, and the mock's lower-cased rendering of it (`up 3 hours`) is the mock's shorthand, not a wording change. |
| REQ-28 | The card's material — surface treatment, hover highlight, selected highlight, shadow, border, radius, typography scale, muted and monospace text treatments, and state colours — is the object table's, taken **by reference**. When this change is done, exactly one declaration of each of those values exists in the product: none is re-declared, not even to an identical value, not "just this once", and not inside the library either. | **Annotated 2026-08-25 (second)**: the rearrangement declared no new value, and neither did the calibration that followed it — the card's inset and its footer controls moved to **existing steps** of the library's scale rather than to the mock's own figures, the difference being recorded instead of a new value being invented for one card. The footer's ground and its hairline reference tokens the library already carries (`--color-wash-1`, `--color-border-subtle`), the image field's rounding is `--radius-md`, and the front ellipsis is written once beside the library's truncation contract. One declaration each, as before. |
| REQ-29 | The card's background, highlight, shadow, border, radius and hover/selected treatment are owned by a UI-library component acting as the card's container. The containers screen supplies content and callbacks to it and owns none of that material. |
| REQ-30 | No near-duplicate component is created: an existing library component is used as it stands, or extended with a prop or a variant, and a new component exists only where neither of those could carry the material. | **Annotated 2026-08-25 (second)**: the rearrangement created **no new component**. `Surface` gained the footer band and `Card` forwards it; `Chip` gained a full-width field form and front truncation; `SectionHeader` gained a truncating title; `Row` gained the truncation contract read positionally; `MetricStrip` gained its track-less labelled rows; and the new detail control **is** the delivered `IconButton`. Every call site that does not ask for one of these renders exactly what it rendered before it existed. |
| REQ-31 | Nothing under `client/src/` outside `client/src/ui/` acquires, as a result of this change, a raw DOM tag, a `.css` file, a CSS module, an inline `style` prop, a `className` carrying visual utilities, or a hard-coded colour, radius, blur, spacing, shadow, font size or z-index. Nothing is copied out of the mock image into the product. | **Annotated 2026-08-25 (second)**: still holds through the rearrangement — the footer's ground and hairline, the block field, the front ellipsis and the ports row's rhythm are all library declarations, and `client/src/containers/` gained no tag, no stylesheet, no `style` and no length. The conformance pass runs unchanged and passes. |
| REQ-32 | Scrolling and resizing the containers list stay smooth whatever the number of containers: no new per-card cost that scales with the length of the list, and no new compositing layer per card beyond what the table's own material already cost. | **Annotated 2026-08-25**: unchanged as a requirement, and the grid (REQ-1) makes it **easier** rather than harder to hold — the same container count now occupies a third as many rows, so the same number of unvirtualised cards spans a third of the scroll length. The carried risk in `batches.md` is amended accordingly, not withdrawn: nothing is virtualised and a card's height still follows its content. |
| REQ-33 | No blur is introduced anywhere by this change: `client/scripts/check-ui-conformance.mjs`'s blur half and its `blurAllowedOverlaySelectors` gain and lose nothing, no new blurring selector or blur value appears, no `ui-blur-exception:` comment is added, and the pre-blurred background asset is untouched. |
| REQ-34 | At 375×812 the card reflows and stays usable, carrying the **same values as at desktop width** — no reduced metric set on the phone. The three metric columns stack vertically at full width, each keeping its own label, value, capacity note and track; the action cluster wraps onto its own line beneath the identity group, keeping its fixed order and its segmented geometry; the provenance chips wrap. No value is clipped to nothing, none is hidden with no route to it, and nothing requires horizontal scrolling. | **Annotated 2026-08-25**: the metrics now stack at **every** width (REQ-6), so at 375×812 they are in the arrangement they were already in rather than falling into a second one; the grid is one card to a row there. Everything this requirement demands is unchanged, including that no value the desktop shows is missing. **Annotated 2026-08-25 (second)**: unchanged in what it demands. The cluster now wraps **within the footer** rather than under the identity group, keeping its order and its segmented geometry; the image line, being a line of its own, needs no reflow; the `PORTS` chips wrap where the port chips used to. |
| REQ-35 | Muted text, monospace identifiers, disabled controls, the metric tracks and their fills stay readable on the translucent surface, including over the lightest region of the background — the low-contrast case the mock's own third card demonstrates. |
| REQ-36 | Adding NET I/O, the two bars and the capacity denominators does not make the screen stutter, does not delay the daemon event stream, and does not make an action feel slower to acknowledge, on a list that already re-reads on every daemon event. |
| REQ-37 | The card's arrangement is verified with a **real pointer at each visible control's own coordinates** and on **measured geometry** — the card's viewport box, the action cluster's position and the three metric columns' boxes and edges — never by `element.click()`, never by a dispatched event, and never aimed at a visually hidden element. Content assertions stand beside the geometric ones and never instead of them. |
| REQ-38 | The delivered containers coverage is restated against the card: every assertion that reached a container through a table row, or asserted the table's geometry on this screen, asserts the same fact against the card instead, and none is weakened into passing while what it named goes unchecked. |

## F2 — The per-container sampling runs at 10 seconds and only while somebody is consuming it

These requirements govern the **shared per-container stats sampling that feeds the containers list
and the dashboard**. They do not govern the detail panel's Stats tab (REQ-56).

| ID | Requirement |
| --- | --- |
| REQ-39 | While sampling is active, the daemon is asked for per-container stats every 10 seconds, replacing the delivered 3. |
| REQ-40 | Sampling passes never overlap or queue behind one another: a pass that takes longer than the interval does not cause a second one to start beside it, and no backlog of passes accumulates. |
| REQ-41 | The daemon is asked for per-container stats **only while at least one consumer is actually being shown those figures**. With no consumer, the number of stats requests reaching the daemon over any window is zero. |
| REQ-42 | The gate closes when the operator moves to a section that does not display these figures. |
| REQ-43 | The gate closes when the browser tab holding the interface is hidden or backgrounded. |
| REQ-44 | The gate closes when no client is connected at all: a server left running with no browser attached asks the daemon for nothing. |
| REQ-45 | The gate is expressed in terms of consumers of the figures, not of one named screen. Both the containers list and the dashboard are consumers, sampling is active while **either** is being consumed, and the dashboard's CPU figure keeps working across every state of the gate. |
| REQ-46 | A consumer proves it exists by **holding a connection open, which the server observes**. It does not announce itself with a call that switches sampling on, and it never announces that it is leaving; the sampling stops on its own when the proof stops. |
| REQ-47 | Sampling is gated on a **count** of live subscriptions — more than zero means sampling, zero means stopped — not on a flag or on the last event seen. With two tabs or two windows open, one of them going away does not stop the sampling the other is reading, and both going away does stop it. |
| REQ-48 | A subscription is held only while a screen that displays the figures is actually being shown, and is released on leaving that section and on the tab being hidden. A client that is connected but showing an unrelated section is not a consumer. |
| REQ-49 | Nothing is signalled at unload: no `beforeunload`, no `pagehide`, no `unload` and no beacon is used for this anywhere in the client, and the correct outcome never depends on one of them firing. |
| REQ-50 | A connection whose other end has gone without closing is not counted as a live consumer: the server writes to each held connection periodically so that such a connection fails and is closed, and it is discovered within a time comparable to the sampling interval rather than lingering indefinitely. |
| REQ-51 | When the gate reopens — the consuming screen is selected, the tab comes back, a client connects — a sample is taken promptly rather than after a full interval. |
| REQ-52 | A figure too old to stand behind is presented as *no sample* (REQ-16), never as a current measurement. A number measured before the gate closed is never redisplayed on return as though it had just been measured. The staleness bound is a small multiple of the sampling interval, stated in exactly one place. |
| REQ-53 | No card displays the age of a sample. |
| REQ-54 | The gate neither leaks, drifts nor wedges. Across repeated section changes, tab switches, reloads, crashes, killed browsers and pulled networks, the count of live consumers returns to zero when the last one has gone — from every route out, including the ones that send no notice at all — the daemon goes quiet each time, sampling restarts when a consumer returns, and nothing accumulates per cycle. |
| REQ-55 | The list poll keeps its delivered cadence: this change touches only the per-container stats sampling, and a container still appears, disappears and changes state as promptly as it does today. |
| REQ-56 | The detail panel's Stats tab and its separate per-container stream (`/api/containers/:id/stats/stream`) are unchanged in cadence, lifecycle, content and consumers. |
| REQ-57 | The reduction is verified as a **measured count of stats requests reaching the daemon** over a fixed window, in four states: the containers screen open, another section open, the tab hidden, and no client connected. The last must be zero, and the first must be materially below the delivered rate. |
| REQ-58 | What stops is the traffic to the daemon, not merely the interface's updates: an arrangement that keeps the requests flowing while the cards stop redrawing does not satisfy F2, however the screen behaves. |

## F3 — The card row stays retired everywhere else, and the containers exception is recorded

| ID | Requirement |
| --- | --- |
| REQ-59 | The card-row pass of `client/scripts/check-ui-conformance.mjs` is widened to admit the containers card presentation **by name** and by nothing wider: the admission names the containers screen's own file(s) and the library component that carries the card, and admits no pattern that would let any other list through. **Annotated 2026-08-25**: what the delivery admits is **two feature paths** — `client/src/containers/ContainersScreen.tsx` and `client/src/containers/ContainerCard.tsx` — and no library component, because the surface-per-item form this admission concerns is read in feature files alone (the pass runs under `if (!inUi)`), so naming a library component would name a file that pass never examines. What is demanded is unchanged: by name, two literal paths, no directory, no pattern and nothing wider. |
| REQ-60 | The check still fails for every other list. A card-per-row presentation reproduced in any other feature file still fails the build; a surface property re-declared on a data-table row, and a gap declared between the rows of a data-table body, still fail; the retired vocabulary is still refused by name. |
| REQ-61 | The check is not silenced, deleted, or exempted with a blanket comment, and its card-row pass acquires no per-call-site exception marker. It keeps running under `npm run lint` and `npm run test -w client`, and both pass. |
| REQ-62 | The 2026-08-16 record `.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md` and the downstream artefacts that carry it are amended in the open, each stating **what changed, why, and on 2026-08-25**, so that a later reader finds a recorded and bounded exception rather than a contradiction between the record and the product. |
| REQ-63 | The exception is a screen, not a licence: when this change is done, the containers screen is the only place in the product where an object list draws a surface per object, and every other object list — images, volumes, networks, compose, swarm, registries, contexts, plugins, builders, build cache, and the dashboard's own container list — is still a classic table. |

## Values fixed in these requirements, and why

No placeholder is left above; three figures the spec deliberately deferred are fixed here so that the
requirements are testable, each with the reason and each cheap to retune in one place:

- **10 seconds** is the human's own decision and is not a plan choice (REQ-39).
- **The staleness bound is 3 × the interval (30 seconds)** (REQ-52). The spec asks for "a small
  multiple of the interval rather than a magic number": two would flip to *no sample* on a single
  late pass and read as a broken daemon, four is half a minute of trusting an unmeasured number.
  Three is the smallest multiple that tolerates one missed pass.
- **The liveness write is every 10 seconds** (REQ-50), the same as the sampling interval — the spec's
  own bound is "a time comparable to the sampling interval", and a dead connection is then discovered
  before the sampler has run twice for a reader who has gone.

## Appended on 2026-08-31 — a check that declares a patience it cannot spend

> Appended after `client/e2e/containers-card-geometry.spec.ts` died on `Test timeout of 30000ms
> exceeded` in the run of 2026-08-31. The case is *"a live update changes the numbers, moves nothing,
> and leaves the ports exactly as they were"* (line 915). **The defect is in the check, not in the
> product.**
>
> The count, read from the source. `client/playwright.config.ts` sets no `timeout`, so every test gets
> Playwright's default of 30 seconds. Before it reaches the assertion it exists for, the test creates
> three fixtures with four published ports; calls `openNarrowedTo`, which loads the application and
> declares two waits of 20 seconds each; waits for a first sample, 25 seconds declared; and measures
> the list. Then it waits for a reading to change with a poll that declares **40 seconds inside a test
> that has 30**. Those 40 seconds can never be spent: the poll gets whatever is left of the 30, about
> fifteen. After it the test spends another 6 to 8 seconds on three port re-reads.
>
> **The slowness is not the defect.** The sampler reads every 10 seconds
> (`STATS_SAMPLE_INTERVAL_MS`, `server/src/containers/containers-service.ts:179`), a cadence batch 3
> of this plan decided and certified (REQ-39). Waiting for a reading to change therefore costs one
> sampling interval, sometimes two. The test needs about 35 to 45 seconds and declares 30. It was
> passing by luck.
>
> **The class is wider than the case that died.** A search of `client/e2e/` found seven files in which
> a step declares a longer patience than the test that runs it — 23 tests in all, from a 40-second
> poll to a 300-second `docker build`. The list is in the batch. The cure is the same for all of them:
> the count is made honest and derived, never generous.
>
> Per [[every-change-updates-spec-requirements-plan]] this is appended as a further batch. **Nothing
> above this line was changed**: no certified batch is reopened, and batches 1, 2 and 3 keep their
> requirements word for word.

## F4 — Every check declares a budget it can spend

| ID | Requirement |
| --- | --- |
| REQ-64 | No test under `client/e2e/` declares a step budget larger than the budget of the test that runs it. This counts the steps written in the test and the steps written in the helper functions of its own file. |
| REQ-65 | Every budget this change writes or moves carries, beside it, the arithmetic it comes from: the parts the number is made of, and where each part comes from. A reader redoes the count from the comment alone. |
| REQ-66 | A step that waits for a sampled figure to arrive, or to change, derives its budget from the sampling cadence the product declares and from the list poll that carries a sample to the screen. It is written as a number of sampling intervals and a stated slack, not as a round figure. |
| REQ-67 | Each repaired check asserts exactly what it asserted before. For the case that died: a reading changes, no card moves, the metric rows keep their horizontal position, the chip count does not grow, the port chips stay identical across three re-reads, and no card carries a transition or an animation. No assertion is removed, softened or replaced, no retry is added, and no wait is put in front of an assertion. |
| REQ-68 | The change touches no product source. Nothing under `client/src/` or `server/src/` moves, and the per-container sampling keeps the 10-second cadence certified by batch 3. |
| REQ-69 | A step budget larger than the budget of the test that runs it fails the build, naming the file, the test, the step's budget and the test's. |
| REQ-70 | The default test budget is declared in `client/playwright.config.ts`, and the guard reads it from there. A guard that cannot read it fails instead of assuming a value. |
| REQ-71 | The guard runs under `npm run lint` and under `npm run test` in the client workspace. It carries no skip and no exception marker, and both commands pass. |
| REQ-72 | The guard is driven by a check of its own, over sources written for that check: it refuses a test whose step declares more than the test has, and it accepts one whose steps fit. It writes no spec file into `client/e2e/`. |

> **Two of these requirements move budgets upward, and that is not the forbidden move.** The standing
> rule is that no check gets a longer budget in order to pass ([[a-check-is-never-weakened-to-pass]]).
> Every test in the perimeter passes today. What is wrong is that each declares, in one of its steps,
> a patience the test cannot give it — so the step's own failure message can never be printed, and the
> test dies at an arbitrary place instead. REQ-64 repairs that declaration. Where a step budget comes
> **down** (REQ-66), it comes down to what the product's cadence requires. Where a test budget goes
> **up**, it goes up to the sum REQ-65 writes out. No number is chosen by running the suite until it
> is green.
>
> **REQ-69 is deliberately the weakest useful rule, and REQ-65 is what covers the rest.** A guard that
> added budgets up would have to decide which worst cases can happen in the same run, and it would
> refuse code that is correct — the daily nuisance that turns a guard into a formality. So the guard
> refuses only a declaration that is impossible on its face. A test whose steps sum to more than it
> has still passes the guard; the arithmetic written beside each budget is what a human reads instead.

## Appended on 2026-08-31 (second) — a check that writes inside the tree the other checks read

> Appended after `npm run test -w client` failed on its **first** run and passed on the second, with
> `ENOENT: no such file or directory … client/src/__conformance-fixture__/body-row-gap.css` raised in
> `client/test/unit/no-unload-signalling.test.ts`. **The defect is in the checks, not in the product.**
>
> The mechanism. `client/test/unit/ui-conformance-check.test.ts` drives
> `client/scripts/check-ui-conformance.mjs` over bait sources, and the script scans `client/src` and
> nothing else — it takes no root — so the baits are written **into `client/src`**, in a directory
> created and removed around each case. Vitest runs test files in parallel. Other checks walk that
> same tree, listing every file and then reading each one; between the listing and the read the
> directory can be gone.
>
> **It is a class, and the count was verified in the tree rather than grepped.** Seventeen unit checks
> touch `client/src`. Eight defend themselves by skipping the directory **by name**, plus the file
> that owns it. **Nine scans, in nine files, do not** — `no-unload-signalling` (the one that failed),
> `card-list-deleted`, `card-row-presentation-retired`, `copy-affordance-absence`,
> `empty-state-action-names`, `filesystem-browser`, `library-layer-adoption-perimeter`,
> `modal-composed-title`, and the **second scan of `modal-close-control`**, a file that defends one of
> its two scans and leaves the other open. Two files that look exposed are not: `dialog-one-form` and
> `section-header-one-treatment` walk `client/src/ui/` only, which the bait directory is not inside.
>
> **The defence by name is the wrong cure, applied eight times.** The cause is not that a scan forgets
> a directory: it is that a temporary directory is created inside the tree every scan reads, so every
> scan written from now on must remember it for ever. `client/vitest.config.ts` says in its own header
> that the tests live outside `client/src` *"so the UI-boundary conformance check never scans test
> code"* — the bait directory is the one thing that crosses that line. And it breaks the rule
> `CLAUDE.md` opens its testing section with: a test leaves the machine exactly as it found it, and
> depends on nothing another test did.
>
> Per [[every-change-updates-spec-requirements-plan]] this is appended as a further batch. **Nothing
> above this line was changed**: batches 1, 2 and 3 stay certified, and batch 4 keeps its requirements
> word for word.

## F5 — A check writes nothing inside the tree the other checks read

| ID | Requirement |
| --- | --- |
| REQ-73 | No check under `client/test/` creates, writes or removes a path inside `client/src/` or `server/src/` at any moment of a run. The check that drives the UI conformance script writes its bait sources in a throwaway directory outside the repository's source trees and removes it when the case ends. |
| REQ-74 | `client/scripts/check-ui-conformance.mjs` takes the tree to scan as an argument. Invoked with no argument it scans `client/src/`, exactly as it does today. |
| REQ-75 | The paths the script reports, the sub-tree it treats as the UI library, and the paths it matches its admissions against are all derived from the tree it was given, read relative to that tree's parent. With no argument every message, every admission and every exit code is what it is today. |
| REQ-76 | The rule the script enforces is unchanged: the same violations are refused with the same wording, the blur allow-list holds the same five selectors, and the card-row admission holds the same two containers paths and no third. Its own check drives it over the same cases as before, none removed and none softened. |
| REQ-77 | No scan of the source tree skips a directory by name in order to avoid a file another check wrote. Every scan covers exactly the files it covered. |
| REQ-78 | No read failure is swallowed anywhere: no scan catches an error from reading a file it has just listed, no scan is retried, no assertion is softened and no wait is added. |
| REQ-79 | The change touches no product source. Nothing under `client/src/` or `server/src/` moves. |

> **REQ-77 widens no scan and narrows none.** Removing a skip adds the skipped directory to what a
> scan walks — and after REQ-73 that directory never exists, in any run, so the set of files each scan
> reads is identical. The skip is removed because a defence against something that cannot happen is
> read as permission for it to happen again, which is how the eighth copy of it was written.
>
> **REQ-79 is the same absence REQ-68 states, for the same reason.** The conformance script is a
> build check, not product: it lives outside `client/src/`, ships in nothing, and REQ-76 is what holds
> its behaviour still while REQ-74 changes how it is invoked.
