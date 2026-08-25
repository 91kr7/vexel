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

## F1 — The containers list presents one card per container

| ID | Requirement |
| --- | --- |
| REQ-1 | The containers screen renders one card per container, stacked vertically at full width, each detached from its neighbours by a uniform gap. On this screen the table presentation is gone: no header row, no hairline rules between rows, no single enclosing surface around the list. | **Amended 2026-08-25 — arrangement**: the cards are laid **three to a row**, not one per row at full width (two at ≤1200px, one below the phone breakpoint), each still detached by the same uniform gap and the table presentation still gone. Decided by the human on the running product and against the mock; the reason, the evidence and what remains normative are in the analysis's *Amendment — 2026-08-25: three cards to a row, against the mock*. |
| REQ-2 | Each card carries a state accent bar down its left edge, running its full height and following the card's left rounding, coloured by the container's state — green running, amber paused, neutral exited. |
| REQ-3 | Band 1 carries, at the left in this reading order: the status dot, the container name as the most prominent text on the card, the state pill in uppercase (`RUNNING` / `PAUSED` / `EXITED`), and the short container id in muted monospace. |
| REQ-4 | Band 1 carries, at the right and vertically centred with the identity group: the primary lifecycle action (`Stop` / `Resume` / `Start`), then a gap, then a segmented cluster of `Pause` · `Restart` · `…` in that order sharing one boundary with internal dividers between them, the cluster ending flush at the card's inner right edge. |
| REQ-5 | Band 2 carries, at the left in this reading order: the `image <reference>` chip (label muted, value monospace), the ports chip (monospace, accented) — present only when the container publishes ports — and the status sentence in muted plain text (`Up 44 seconds`, `Paused 12 minutes ago`, `Exited (0) 2 hours ago`). **Every** published mapping is shown in the ports chip's place — none truncated, summarised or replaced by a `+N more` affordance — so a container publishing many ports wraps onto further lines and makes a taller card. **Annotated 2026-08-25**: the chip carries **exposed-but-unpublished ports as well as published mappings**, and is present when the container reports at least one port of either kind. The delivered row's `formatPorts` rendered every entry — `publicPort→privatePort` when published, the bare `privatePort` when not — and REQ-12 governs here: no value the delivered row showed may disappear from the card. The wording of a published mapping is unchanged, and the "every mapping, wrapping, none truncated and none summarised" rule applies to the whole set. | **Amended 2026-08-25 — the "every mapping, none summarised" decision is reversed, by the human who took it.** The card draws **at most three port chips and then a single `+n`** carrying the remainder, splitting at four rather than three so a degenerate `+1` is never drawn; the full set stays in the detail panel. The reversed decision was taken for a card at **full width**; with three cards to a row (REQ-1) one container's port list set the height of every card standing beside it, and the human reversed it on seeing that. The annotation above is **not** withdrawn: its ruling — that exposed-but-unpublished ports count as ports here and that the chips are present when the container reports at least one of either kind — still stands, and so does the wording of every chip that is drawn. What is withdrawn is only "none summarised". |
| REQ-6 | Band 3 is three columns spanning the card's inner width: `CPU` and `MEMORY` of equal width side by side, then a narrower `NET I/O`. | **Amended 2026-08-25 — arrangement**: band 3 is **three full-width rows**, `CPU` over `MEMORY` over `NET I/O`, not three columns side by side. The consequence of REQ-1: at a third of the page three columns leave no width to read a value in. `CPU` and `MEMORY` remain equal to each other and `NET I/O` remains the untracked one; the order is unchanged. REQ-7's right-aligned capacity note and REQ-8's untracked pair are unaffected — each is now aligned to a full-width metric's own right edge rather than to a third of one. |
| REQ-7 | In the `CPU` and `MEMORY` columns the first line carries the small uppercase muted label followed by the value at the left, with the capacity note (`of 8 cores`, `of 31.0GB`) right-aligned to that column's own right edge; the second line is a thin track spanning the column's full width, carrying a fill. |
| REQ-8 | The `NET I/O` column's first line carries the label alone; its second line, aligned with the tracks beside it, carries `in <value>` and `out <value>` with muted labels and prominent values. It carries no bar. |
| REQ-9 | The three bands appear in that order — identity and actions, then provenance, then metrics — on every card and in every state. | **Unaffected by the 2026-08-25 amendment**, and stated so because REQ-6 beside it was amended: the *band* order is untouched. What changed is the arrangement **inside** band 3, not which band comes where. |
| REQ-10 | The metric columns occupy the same horizontal positions on every card of the list, so that the values line up vertically down the list whatever each card's content. A card whose metric columns drift with its content fails this requirement. | **Restated 2026-08-25 — the same property, read on the arrangement that now exists.** With a grid (REQ-1) and a stacked strip (REQ-6) there is no longer one column of cards for values to line up down, so the original sentence would be read as true while meaning nothing. What is required now: **within a row**, every card is the same width and every strip places its metrics at the same x, so the values line up **across** the row; and **down each column of the grid**, the cards being of equal width, the metrics of the same rank line up too. The prohibition is unchanged and is the point of the requirement: a card whose metrics drift with its own content fails it. |
| REQ-11 | Every element's position is derived from the mock, not from the current table's column order and not from the implementer's judgement. Where the element map above and the mock image disagree about a position, the delivered arrangement matches the image. | **Amended 2026-08-25 — two named departures, and no others.** The mock stays normative exactly as written, with two positions **deliberately departed from** by the human's decision on the running product: cards three to a row against the mock's one at full width (REQ-1), and the metrics stacked against the mock's row of three (REQ-6). Every other position in the map remains the mock's, and the rule that the image beats the words still governs everywhere else — a third departure is a defect, not a precedent. |
| REQ-12 | Every value the delivered row shows, the card shows: state, name, image reference, published ports, the status/uptime sentence, CPU and memory. Verified value by value against the delivered list rather than by inspection of the card alone. | **Annotated 2026-08-25**: past four ports the card shows three and a `+n` (REQ-5, as reversed), so the *presence* of the value is what this requirement demands of the ports and not the enumeration of every one of them — the full set is one click away in the detail panel. No other value is affected: every one of them is on the card in full. |
| REQ-13 | The card adds NET I/O `in` and `out`, the CPU capacity (`of <n> cores`), the memory capacity (`of <total>`), and a fill on the CPU and memory tracks proportional to the value against that stated capacity — with a non-zero measurement staying visible rather than rounding away to nothing. |
| REQ-14 | Block I/O and PIDS do not appear on the card; they stay in the detail panel. |
| REQ-15 | The metrics are live: a card updates its numbers and its fills in place, without the card moving, without the list reordering, and without any other card being disturbed. |
| REQ-16 | A metric with no sample is stated as one: the value reads `—`, the capacity note is replaced by the explicit *no sample* wording, and the track is drawn empty. It is visibly distinguishable from a measured zero, which shows its number and keeps its capacity note. "No measurement" and "measured zero" are never rendered alike. |
| REQ-17 | Values step from one sample to the next. Nothing on the card is tweened, animated or transitioned between samples, and no animation or transition is introduced on this scrolled surface. |
| REQ-18 | The accent bar, the dot and the pill derive from the same container state and always agree, and the metric fills take that same state colour. No card shows two states at once. |
| REQ-19 | Every container state the product can display gets a pill, an accent and a dot by the same rule — created, restarting, removing and dead included, not only the three the mock happened to draw. |
| REQ-20 | The four action slots keep their delivered contract: fixed number, fixed order, the same position on every card whatever the state; the first slot carries the state-appropriate lifecycle action; an action not legal in the current state is shown in place and disabled rather than removed; `…` is always last and never moves. |
| REQ-21 | The overflow menu behaves exactly as delivered: same entries, order, wording, destructive marking, hints, disabled entries, one-menu-at-a-time rule, keyboard operation, and binding to its own container. |
| REQ-22 | Beyond the elements the mock itself varies — the ports chip, the primary action's label and tone, the disabled states and the *no sample* metrics — a card in one state is laid out identically to a card in another, and every card in the list is the same width. |
| REQ-23 | Selecting a card opens that container's tabbed detail (Logs, Stats, Config, Processes, Inspect, Exec, Attach) with its delivered content, at full width, directly beneath the selected card; selecting the same card again closes it; at most one is open at a time. | **Amended 2026-08-25 — arrangement**: the panel spans the **whole row** of the grid and opens beneath the row that holds the selected card, the cards below moving down. "Full width, directly beneath the selected card" is what that reads as when a row holds one card; with three to a row it is the row, not the card, the panel sits under. Everything else — the tabs, the content, the second-selection close, the `Escape` close, one at a time — is unchanged. |
| REQ-24 | The list order is unchanged and is still the server's — alphabetical by name, total, stable across re-reads — and the client derives none of its own. No sort control is added. |
| REQ-25 | No selection and no bulk actions appear on this screen. |
| REQ-26 | The screen's toolbar, filters and empty state behave exactly as delivered, and filtering still preserves relative order. |
| REQ-27 | Every string is unchanged and stays in the product's current language; the only new strings are the labels the new metrics genuinely require (`NET I/O`, `in`, `out`, the capacity notes and the *no sample* wording), authored in English. No Italian from the mock reaches the product. |
| REQ-28 | The card's material — surface treatment, hover highlight, selected highlight, shadow, border, radius, typography scale, muted and monospace text treatments, and state colours — is the object table's, taken **by reference**. When this change is done, exactly one declaration of each of those values exists in the product: none is re-declared, not even to an identical value, not "just this once", and not inside the library either. |
| REQ-29 | The card's background, highlight, shadow, border, radius and hover/selected treatment are owned by a UI-library component acting as the card's container. The containers screen supplies content and callbacks to it and owns none of that material. |
| REQ-30 | No near-duplicate component is created: an existing library component is used as it stands, or extended with a prop or a variant, and a new component exists only where neither of those could carry the material. |
| REQ-31 | Nothing under `client/src/` outside `client/src/ui/` acquires, as a result of this change, a raw DOM tag, a `.css` file, a CSS module, an inline `style` prop, a `className` carrying visual utilities, or a hard-coded colour, radius, blur, spacing, shadow, font size or z-index. Nothing is copied out of the mock image into the product. |
| REQ-32 | Scrolling and resizing the containers list stay smooth whatever the number of containers: no new per-card cost that scales with the length of the list, and no new compositing layer per card beyond what the table's own material already cost. | **Annotated 2026-08-25**: unchanged as a requirement, and the grid (REQ-1) makes it **easier** rather than harder to hold — the same container count now occupies a third as many rows, so the same number of unvirtualised cards spans a third of the scroll length. The carried risk in `batches.md` is amended accordingly, not withdrawn: nothing is virtualised and a card's height still follows its content. |
| REQ-33 | No blur is introduced anywhere by this change: `client/scripts/check-ui-conformance.mjs`'s blur half and its `blurAllowedOverlaySelectors` gain and lose nothing, no new blurring selector or blur value appears, no `ui-blur-exception:` comment is added, and the pre-blurred background asset is untouched. |
| REQ-34 | At 375×812 the card reflows and stays usable, carrying the **same values as at desktop width** — no reduced metric set on the phone. The three metric columns stack vertically at full width, each keeping its own label, value, capacity note and track; the action cluster wraps onto its own line beneath the identity group, keeping its fixed order and its segmented geometry; the provenance chips wrap. No value is clipped to nothing, none is hidden with no route to it, and nothing requires horizontal scrolling. | **Annotated 2026-08-25**: the metrics now stack at **every** width (REQ-6), so at 375×812 they are in the arrangement they were already in rather than falling into a second one; the grid is one card to a row there. Everything this requirement demands is unchanged, including that no value the desktop shows is missing. |
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
