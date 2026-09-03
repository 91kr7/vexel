---
request_slug: docker_management_app-containers_card_view
date: 2026-08-25
type: evolution
reference: .sdd/analysis/docker_management_app.md
---

## Request

> voglio rivedere la grafica della sezione containers. a tal proposito o realizzato un mock
> .sdd/analysis/ui-mock/containers-refactor.png ti chiedo di analizzarlo nel dettaglio in quanto
> voglio utilizzare una vista a card anzichè l'attuale tabella in quanto la card rappresenta meglio
> il ftto che un container sia un entità.
> è fondamentale che si dia indicazione al dev che deve seguire il mock per determinare dove
> risporre gli elementi.
> è fondamentale utilizzare gli stessi stili css, higlighr e shadow della tabella e non riscriverli!

Three statements, and all three are requirements rather than context: the containers list becomes a
card view because **a container is an entity, not a row**; the mock decides **where every element
goes**; and the card is made of the **table's existing material**, not of new material that
resembles it.

Answered by the human during this analysis, and binding:

- **Containers only.** *"solo containers ma predisponi un componente di UI nuovo (se non puoi
  riutilizzarne nessuno) che deve fungere da contenitore e gestirmi le grafica della card (sfondo,
  highlight, shadow ecc)"* — with the added requirement that the card's material is owned by a
  **UI-library component acting as the card's container**: an existing one if one can carry it, a
  new one only if none can.
- **The metrics are live**, as drawn: *"Sì, live come oggi"*.
- **But the sampling that feeds them is not to run unconditionally**, raised by the human after the
  first draft of this analysis: *"non mi hai chiesto ogni quanto aggiornare le metriche! ti direi che
  l'aggiornamento delle metriche deve essere attivo solo nel momento in cui si apre 'containers' e
  quando si cambia sezione va disabilitato al fine di evitare chiamate massive a docker. io
  campionerei ogni 20 secondi, che dici?"* — settled at **10 seconds**, and at a gate that closes on
  more than a section change (see Requirements).
- **How the gate is signalled**, raised by the human in the same exchange: *"nel momento in cui apro
  il client parte una chiamata http che attiva il sampling lato backend. nel momento in cui viene
  distrutto il frontend, o per chiusura del browser o per qualsiasi altro motivo stoppi il sampling.
  non ricordo, è possibile intercettare la chiusura del browser da chrome, giusto?"* — the answer to
  the closing question is *not reliably*, and the design was settled on **liveness** instead of an
  explicit start/stop pair for that reason (see Requirements).

## Reference

Evolution of [`.sdd/analysis/docker_management_app.md`](docker_management_app.md), the product
analysis that specifies Vexel as a complete, faithful front end to the Docker daemon presented
through one coherent visual language, with containers as the screen the operator spends the most
time on.

**Starting point — what the containers list is today.** One classic table: a header row over rows
flush against each other, separated by hairline rules, on a single surface. Each row carries a
status dot, the container's name, its image, CPU, memory, ports and uptime, and a fixed cluster of
four controls — the state-appropriate lifecycle action (`Stop` / `Start` / `Resume`), then `Pause`,
then `Restart`, then a `…` overflow menu holding `Rename…`, `Export filesystem…`, `Kill`, `Remove`
([`container_row_actions`](docker_management_app-container_row_actions.md)). Selecting a row opens
a full-width inline detail expansion, tabbed — Logs, Stats, Config, Processes, Inspect, Exec, Attach
— and selecting the same row again closes it
([`container_detail_close`](docker_management_app-container_detail_close.md)). The list has **no
operator-facing sort control** and **no selection or bulk actions**: ordering is decided server-side,
alphabetically by name and totally ([`list_ordering`](docker_management_app-list_ordering.md)), and
a checkbox column exists on images only.

**The record this evolution amends.**
[`ui-coherence-optimisation-comfortable_variant_retired-classic_table`](ui-coherence-optimisation-comfortable_variant_retired-classic_table.md)
(2026-08-16) retired the card-per-row presentation across the whole product, removed it from the UI
library's public interface, and required an **automated check** that fails when feature code
reproduces a detached card row. Its acceptance criteria are geometric and are contradicted by this
mock: *"rows are flush… no row carries a rounded corner, an outline or a detached surface of its
own… one enclosing surface boundary"*. That decision is not being reversed, and this analysis does
not re-argue it. It is being given **one named exception, on one screen**, for a reason that
analysis itself supplies: what it condemned was a **hybrid** — a column header promising columns,
over detached cards promising self-contained objects, with the labels left up in the header — and it
recorded that *"where a row does legitimately become a card it… carries each column's label inside
the card, because the shared header stops being reachable once rows detach."* The mock does exactly
that: no header row survives, and `CPU`, `MEMORY`, `NET I/O` and `image` are written inside the card
beside their values. This is the card the retirement described as legitimate, not the one it
retired.

**Changes with respect to the reference.**

1. The containers list changes presentation: one card per container, replacing the table. Every
   other object list in the product stays a classic table.
2. The card carries three values the list does not show today — **NET I/O (in/out)**, the **capacity
   each metric is a share of** (`of 8 cores`, `of 31.0GB`) and a **usage bar per metric** — plus an
   explicit *no sample* state. These are re-presentations of data the product already obtains for
   the detail panel's Stats tab, not new daemon capabilities.
3. The state is stated twice and explicitly: a coloured pill (`RUNNING` / `PAUSED` / `EXITED`) beside
   the name, and a full-height accent bar on the card's left edge, in addition to the dot the row
   already carries.
4. The product will ship **two list presentations**, deliberately: cards on containers, tables
   everywhere else. The 2026-08-16 decision and its automated guard are amended in the open to say
   so.
5. **The per-container sampling that feeds those metrics changes cadence and gains a gate.** It moves
   from every 3 seconds to every 10, and from always-on to demand-driven. This is the one part of
   this change that is not a rendering concern, and it is described in its own right below.

Nothing about what the actions do, what the detail panel contains, or how the list is ordered
changes. What *is* asked of the daemon changes, and only in one direction — less often, and only
while somebody is looking.

**What the sampling does today, established in the source on 2026-08-25 and reported to this
analysis.** It matters because it is not what the first draft of this file assumed, and the
requirements below hang on the difference:

- The sampling is **server-side and starts at process boot**, in a loop that never ends. Every 3
  seconds it lists the containers **and asks the daemon for a stats frame per running container** —
  one call, plus **N** — writing the results into an in-process cache.
- The client **drives none of it**. The containers list polls the server every 3 seconds for the
  list and simply reads the already-cached figures off each container. The dashboard reads the same
  cached figures for its own CPU display.
- So the loop runs **whatever screen is open, and whether or not any browser is connected at all**.
  The *"chiamate massive"* the human wants to avoid are already being made; in the worst case — the
  server up with nobody connected — they are made for no consumer whatsoever.
- **Therefore a gate in the client alone would change nothing**, and this is the single most
  important consequence to carry forward: hiding the cards does not stop the calls. The sampler
  itself has to become demand-driven.
- The two costs are **separable and different in kind**: the list poll is one call regardless of how
  many containers exist; the stats sampling is one call per running container. Slowing the second
  does not require slowing the first.
- **A longer interval does not make a sample less accurate.** Each CPU percentage is derived from a
  delta carried *within a single frame*, so every sample stands on its own and a longer gap between
  samples degrades nothing. The cost of a long interval is purely perceptual.
- **The product already holds a connection open per client, and the server already notices when one
  goes away.** The daemon event stream the client opens is exactly that: a connection held for as
  long as the client is there, whose per-connection resources the server releases when the socket
  closes — without being told, and without the page's cooperation. This matters to the requirements
  below because the gate's mechanism is a property this product already demonstrates in working code,
  not infrastructure to be invented for it.
- **A different mechanism, not governed here:** the detail panel's Stats tab uses a separate
  per-container stream (`/api/containers/:id/stats/stream`) carrying the daemon's own native frames,
  opened for one container while its panel is open. Different lifecycle, different consumer,
  untouched by this change. Named explicitly so the two are not conflated in the plan.

## Amendment — 2026-08-25: three cards to a row, against the mock

*(The first of two amendments taken on the same day. This one is about the **list**: how many cards
stand on a row, and how the metrics are laid inside one. The second, below, is about the **inside of
a card** and brings a mock of its own.)*

**What changed, and it is a departure from the mock.** The delivered containers list lays its cards
**three to a row** (two at ≤1200px, one below the phone breakpoint), and each card stacks its three
metrics **one per row**. The mock, `.sdd/analysis/ui-mock/containers-refactor.png`, draws **one card
at full width** with `CPU`, `MEMORY` and `NET I/O` **side by side**. This analysis declares the mock
normative for placement and says that where the words and the image disagree the image wins; on
these two points the image has been **deliberately departed from**, and the paragraphs below are
read subject to this amendment: *"one card per container, stacked vertically, full width"*, the
element map's *"three columns spanning the card's inner width"* row, and the Summary's *"vertical
stack"*. Everything else in the map stands unchanged and normative — the bands, their contents,
their order, the accent bar, the action arrangement, the capacity notes, the untracked `NET I/O`
column and the *no sample* state.

**Who decided it, and on what evidence.** The human, looking at the delivered build running with
their own containers. The full-width card was built as this file specified it, and in practice the
three metric columns were stretched across roughly 1000px: a void through the middle of the card
with `NET I/O` squashed against the right edge. That is evidence a static mock cannot supply — it
draws one card at one width, and does not show what the arrangement does to a real window. The
change was tried with the human at the keyboard and accepted on sight. It is not a re-reading of the
mock and not an implementer's judgement: it is a decision taken on the running product, recorded
here so the mock is never used to argue the delivery back.

**Cards are equal in height within a row; rows are not equal to each other.** A row's cards all take
the height of the tallest of them; two rows may differ (387 / 417 / 352px, measured). One fixed
height for every card on the screen was offered and refused: it would match the rows at the cost of
empty space inside most of the cards, since a card's height follows its content. No minimum height
is imposed.

**The ports decision is reversed, and it was the human's own.** At the requirements gate the human
chose *"every mapping, wrapping onto further lines, never truncated and never summarised"* (REQ-5).
That choice was made for a card at full width. At a third of the page it made one container's port
list set the height of every card standing beside it, and the human reversed it themselves on seeing
that. The card now draws **at most three port chips and then a single `+n`**, splitting at four so a
`+1` is never drawn; the full set remains in the detail panel. The earlier decision is not deleted
anywhere — it is annotated as reversed, with this reason. Note that this returns to what this
analysis originally left open: its own assumption said *"how many fit before the chip must summarise
is a presentation detail for the later phases"*, and it was the requirements gate that closed it.

**What is not amended.** The sampling half of this analysis is untouched — the cadence, the gate, the
consumer liveness, the interval. So is everything the card *contains*: no metric was added, removed
or reworded, no value the delivered row showed has left the card, and the *no sample* state is what
it was. The 2026-08-16 card-row exception is unaffected: this is still one screen, still two named
file paths, still every other object list a classic table.

**A defect found while consolidating this, and fixed at its source.** The daemon reports one port
entry per host binding, so a port published on both IP stacks arrives **twice** — identical once the
host IP, which the summary shape does not carry, is dropped. The card draws one chip per entry and
keys it by the mapping, so the pair produced duplicate keys and the chips accumulated in the DOM on
every poll (a container reporting 4 ports was measured at 57 chips). The list summary now reports
each mapping once. This is pre-existing daemon behaviour the delivered **table** received too; it
was invisible there only because the table joined the entries into a single line.

## Amendment — 2026-08-25 (second): the card's internal arrangement, chosen on generated mocks

**A second mock governs the inside of the card, and it says which.**
`.sdd/analysis/ui-mock/containers-refactor-b3.png` is normative for the **card's internal
arrangement** from 2026-08-25 and supersedes `containers-refactor.png` on that point alone.
`containers-refactor.png` is **not deleted and not wrong**: it stands as the record of what was
originally asked, and it remains the reference for everything the newer image does not redraw — the
accent bar, what a card contains, the metric anatomy (label and value at the left, capacity note
right-aligned, a track under each), the untracked `NET I/O`, the *no sample* state and the segmented
action cluster. Where the two disagree about **where an element sits inside a card**, the newer image
wins; the two departures of the first amendment (three cards to a row, metrics stacked) are
unaffected and still stand.

**And it is normative for arrangement, not for pixels — the rule this analysis states everywhere
else, restated here because a redrawn mock invites measuring it.** Its inset (22px), its footer
control heights (~31px) and its detail control (26×26 at an 8px radius) are **not** matched exactly:
spacings, sizes and radii come from the library's existing scale, and the nearest steps of it are
used — a 20px inset, the ordinary button size, the compact icon button at the tighter radius of the
scale. Matching the picture would mean inventing a third button size, a fourth icon-button size and
a radius token for one card. **The detail control's difference is a decision rather than a
leftover**, taken by the human on 2026-08-25 on a measurement: the container's name is 23.2px tall,
so a 24px control is already taller than what it stands beside, and the ordinary radius on that box
— 42% of its own side — read as a soft blob; the box stays and the rounding drops a step, in the
library and on the size, so no new value exists and no call site overrides one. The rest of the
residue is written down in `container-card.md` rather than left for someone to rediscover as a
defect. What the mock **did** decide, and what was corrected against it on 2026-08-25, is the
proportion: at the library's largest inset with list-density controls the card read as controls
adrift in space (8.4% of the card's width against the mock's 4.9%).

**And it is normative for arrangement, not for tone.** One known error in it, found against the
running product on 2026-08-25: it draws the primary lifecycle action **accented in every state**,
`Stop` included. The delivered tone split — `Start` and `Resume` affirmative, `Stop` quiet — is a
decision this analysis read out of the *original* mock and it stands: halting a running container is
not the card's suggestion, while starting or resuming a stopped one is what the operator came for.
The code is right and the picture is wrong; it is written down here because the natural correction,
on seeing the two side by side, is to change the code.

**Why it was redrawn.** The human's complaint about the delivered card, in their own words, was that
the elements were *"disposti un po' a caso"* — and, specifically, that a **long image reference**
wrecked the card. Neither is a disagreement with the first mock's *contents*: every value stayed, and
none was reworded. What was wrong was the placement.

**How the arrangement was chosen.** Three whole-card arrangements were generated and put to the human
(`containers-card-layout-variants.png`: **A** identity / facts / metrics / actions, **B** name, then
the state with its own duration, **C** metrics paired two-up for a shorter card). The human chose
**B**. Three placements of the ports were then generated on B
(`containers-card-ports-variants.png`: **B1** image on its own line with the ports under it, **B2**
the ports on the state line, **B3** the ports as a metric row with a label of their own). The human
chose **B3**, which is what `containers-refactor-b3.png` draws and what was delivered.

**The four faults, and what each one is fixed by.**

1. **The actions interrupted the description.** They stood between identity and provenance, so
   reading a card meant reading past a row of buttons. They are now a **footer**: below a hairline,
   on a slightly distinct ground, primary lifecycle action at the left and the segmented
   `Pause | Restart | …` cluster at the right. Read and act become two gestures instead of one
   continuous list.
2. **The short id floated on the most prominent line.** It sat among the identity group, competing
   with the name. It is now **anchored to the right edge** of the name row: *name → state* at the
   left, *identifier* at the right. The name truncates with an ellipsis; the id never does.
3. **The uptime was stranded among the provenance chips**, where a duration does not belong. It now
   has **its own line directly under the name, beside the state pill**: `RUNNING · up 3 hours` reads
   as one sentence — the state, and how long it has held.
4. **The capacity note sat far from the value it qualifies.** With the card at a third of the page
   this resolves itself; the note stays right-aligned within its own metric's row, which is what the
   original mock already asked for.

**The long image reference, which is the fault the human raised by name.** The image reference now
has **a full-width line of its own** — a bordered field with a muted `image` label — and it
**truncates at the front**: `…r.io/acme-platform/payments-service:2.14.0-rc3`. The registry host is
the sacrificial half; the name and the tag are what identify the image, and a default end-ellipsis
throws the tag away. Sharing its line with nothing, a reference of any length pushes nothing out of
place. The front ellipsis is a **library** concern, written once beside the truncation contract, not
a style in feature code.

**The ports left provenance altogether.** They now sit **below `NET I/O`**, as a `PORTS` row taking
the same rhythm as the metric rows: small uppercase muted label at the left, chips right-aligned.
The reasoning, worth recording because it is the reason B3 was chosen over B1 and B2: *the image says
what the container is made of, the ports say how you reach it* — that is operational information, of
a kind with the metrics, and not provenance. The label also **anchors the row**, so a container with
one port and one with four keep the same shape; a container with none says `none` rather than
dropping the row, which the first mock's "present only when the container publishes ports" would
have done. The `+n` cap (three chips, splitting at four) is unchanged from the first amendment.

**Final band order: identity → state and uptime → image → CPU → MEMORY → NET I/O → PORTS → footer
actions.** This supersedes the earlier "three bands" reading of the element map, which is amended
below rather than rewritten.

**A new control, and a decision recorded on it.** The card's top-right corner carries a small square
button that will open the container's detail **in a modal**, in a future intervention that removes
the inline detail panel altogether. **It is built and its click is deliberately not implemented.**
The alternatives were put to the human — wiring it to today's inline detail, or shipping it visibly
disabled — and they chose **present and inert**: it renders with a proper accessible name, it is not
disabled, and clicking it does nothing. That inertness is recorded at the call site and in
`container-card.md` precisely because it is indistinguishable from a defect to anyone who did not
take the decision. It swallows its own click, so the card's selection gesture is not fired by a
control that will soon mean something else; clicking the card anywhere else still opens the inline
detail exactly as before.

**What is not amended.** Nothing about the sampling half. No value was added to or removed from the
card, and none was reworded: the new strings are the `PORTS` label, the `none` reading of an empty
port set and the detail control's accessible name. The three-cards-to-a-row and stacked-metrics
departures stand. The card-row exception is untouched — still one screen, still two named file
paths.

## Summary

The containers list stops being a table and becomes a list of one card per container — a vertical
stack as first written, **three cards to a row as delivered** (see *Amendment — 2026-08-25*) — laid
out as `.sdd/analysis/ui-mock/containers-refactor.png` arranges it and, **for the inside of a card,
as `containers-refactor-b3.png` rearranged it on 2026-08-25** (see *Amendment — 2026-08-25
(second)*), built from the material
the object table already ships — its surface, highlight, shadow, border, radius and state colours —
carried by a UI-library component that owns that material so no feature file ever re-authors it.

And the per-container sampling those cards display stops running unconditionally: it samples every
10 seconds while a screen that shows the figures is actually being watched, and idles the rest of
the time.

## Business goal

**A container is an entity, and the presentation should say so.** This is the human's stated reason
and it is the whole of the value: a container has a name, an identity, a state, a lifecycle, an
image it came from, ports it publishes and resources it is consuming *right now*. A table row says
"one of many things to be compared down a column"; a card says "this thing, with everything true
about it gathered in one place". Containers are the objects in this product the operator works
**one at a time** — start it, watch it, read its logs, restart it — far more often than they compare
twenty of them by a column. The presentation should match the task, and on this screen it currently
does not.

**The card lets the screen answer "how is this container doing?" without a click.** Today CPU and
memory are two narrow numbers in two columns, with nothing to read them against: `6.1MB` means
nothing until you know the host has 31.0GB. The mock states each metric as a share of a stated
capacity, with a bar, and adds the third number an operator actually watches — network in/out. That
turns the list from an inventory into a status board, which is what the operator has it open for.
This is also where the nearest competitor is visibly weaker: Portainer shows per-container stats only
after you click into a container, and "show stats of all containers on one page" is a standing open
request against it.

**The values are already paid for; only the presentation was withholding them.** NET I/O, the host's
capacity and the sampling that produces them already exist. The table had no room for them; the card
does. Delivering them costs the surface, not new capability.

**But making the numbers prominent makes what they cost worth looking at, and it does not survive
the look.** The product asks the daemon for a stats frame per running container every 3 seconds,
from the moment the server starts, for as long as it runs — on every screen, and with no browser
connected at all. Nobody chose that: it is what "start a sampler at boot" quietly means. On the
operator's own daemon — the same one their work runs on — that is a permanent background load
proportional to how many containers they happen to have running, bought for a figure nobody may be
looking at. The card view is what makes it urgent rather than what makes it wrong: the numbers move
from two thin columns to the most eye-catching band of the card, so the honest response is to make
them **worth their cost** — sampled when they are being read, at a rate a human can actually follow,
and not at all when they are not. Ten seconds is that rate: it is a status board, not a monitoring
tool, and the tool for watching one container closely already exists one click away in the detail
panel's Stats tab.

**One screen, one exception, stated once.** The product's rule is one visual language, and its
2026-08-16 decision is one presentation for every object list. Both stay in force. What this change
buys is worth an exception on exactly one screen — the most used one, whose objects are the least
table-like in the product — and the exception is worth having **only if it is named, bounded and
enforced as an exception**. An unrecorded exception is how a rule quietly stops being one; a recorded
one is how a rule survives a legitimate special case.

## Requirements

### Functional

#### The presentation

- **The containers screen lists one card per container.** The table presentation on this screen —
  its header row, its hairline row rules, its single enclosing surface — is gone. Cards are detached
  from one another with a uniform gap between them. Written here as *stacked vertically, full
  width*, as the mock draws them; **amended 2026-08-25 to three cards to a row** (two at ≤1200px,
  one below the phone breakpoint) — see *Amendment — 2026-08-25: three cards to a row, against the
  mock*.

- **The mock is normative for placement.** `.sdd/analysis/ui-mock/containers-refactor.png` decides
  **where every element sits** — **amended 2026-08-25: for the card's *internal* arrangement it is
  superseded by `.sdd/analysis/ui-mock/containers-refactor-b3.png`**, the earlier image standing as
  the record of what was originally asked and remaining normative for everything the newer one does
  not redraw (see *Amendment — 2026-08-25 (second)*, including its one known error: b3 draws the
  primary lifecycle action accented in every state, and the delivered quiet `Stop` is correct — the
  mock governs arrangement, not that tone). The map below is amended to the newer image
  band by band; what the mock decides is unchanged in kind: which band of the card it belongs to, its order within that band, its
  alignment, and what it is aligned to. A developer deciding an element's position must derive that
  position from the mock, not from the current table's column order and not from their own judgement.
  What the mock does *not* decide is pixels: exact spacings, sizes, colours and weights come from the
  library's existing design tokens, as in every previous mock-driven change in this product. **The
  element map below is the mock read out in words; where it and the image disagree, the image
  wins.**

  **Amended 2026-08-25 (second) — the map below is `containers-refactor-b3.png` read out in words.**
  The bands are now five plus a footer, and each row says what moved and why. Where these words and
  that image disagree, the image wins, exactly as before.

  | Band | Position | Element |
  | --- | --- | --- |
  | Card edge | Left edge, full height, following the card's left rounding, and running through the footer too | State accent bar — green running, amber paused, neutral exited |
  | 1 — identity | Left, in reading order | Status dot · container **name** (most prominent text on the card), which **truncates with an ellipsis** |
  | 1 — identity | Right, anchored to the card's inner right edge | Short container id, monospace, muted — **which never truncates** — then the square control that will open the detail in a modal (**present and inert by decision**). *Moved 2026-08-25: the id used to float in the identity group at the left, competing with the name* |
  | 2 — state & duration | Left, in reading order, on its own line under the name | State pill, uppercase (`RUNNING` / `PAUSED` / `EXITED`) · the daemon's own status sentence in muted plain text (`Up 44 seconds`, `Paused 12 minutes ago`, `Exited (0) 2 hours ago`). *Moved 2026-08-25: the uptime used to sit among the provenance chips, where a duration does not belong* |
  | 3 — image | A full-width line of its own, sharing it with nothing | `image <reference>` field (label muted, value monospace), **truncating at the front** so `name:tag` survives and the registry host is what is lost. *Moved 2026-08-25: it used to share a line with the ports and the uptime, and a long reference wrecked that line* |
  | 4 — metrics | Full-width rows, `CPU` over `MEMORY` over `NET I/O` over `PORTS` | see the three rows below |
  | 4 — `CPU` / `MEMORY` | First line: label (small, uppercase, muted) then value, left; capacity note right-aligned to that row's right edge (`of 8 cores`, `of 31.0GB`). Second line: a thin track spanning the full width, with a fill | |
  | 4 — `NET I/O` | One line: the label at the left, `in <value>` and `out <value>` right-aligned, label muted, value prominent. **No bar.** | |
  | 4 — `PORTS` | One line, on the metric rows' own rhythm: the label at the left anchoring the row, the chips right-aligned (monospace, accented; at most three, then one `+n`; `none` where the container reports no port). *Moved 2026-08-25 out of provenance: the image says what it is made of, the ports say how you reach it* | |
  | Footer | Below a hairline, on its own slightly distinct ground, spanning the card's full width | Primary lifecycle action (`Stop` / `Resume` / `Start`) at the **left**; at the **right**, flush to the inner right edge, the segmented cluster `Pause` · `Restart` · `…`, in that order, sharing one boundary with internal dividers. *Moved 2026-08-25: the actions used to stand between identity and provenance, interrupting the description* |

- **The card's bands are ordered by decreasing prominence** — identity and actions first, provenance
  second, live metrics third — and that order is the same on every card, in every state. **Amended
  2026-08-25 (second)**: the order is now identity → state and uptime → image → `CPU` → `MEMORY` →
  `NET I/O` → `PORTS` → footer actions, with the actions no longer interrupting the description; it
  is still the same order on every card and in every state.

- **Everything the row shows today, the card still shows.** Status, name, image, ports, uptime, CPU
  and memory all survive the change, and so does every one of the four action slots. A value that
  quietly leaves the list is a defect of this work, not a simplification of it.

- **The card adds NET I/O, the capacity each metric is a share of, and a bar per metric**, exactly as
  the mock draws them: `in` and `out` for the network, `of <n> cores` for CPU, `of <total>` for
  memory, and a proportional fill for CPU and memory. Block I/O and PIDS are **not** on the card —
  the mock omits them and they stay where they are, in the detail panel.

- **The metrics are live.** Confirmed by the human. A card updates its numbers and its bars in place,
  without the card moving, without the list reordering and without any other card being disturbed.
  *How often* and *when at all* are the two requirements below, and they are a change to delivered
  behaviour rather than a restatement of it.

- **The absence of a sample is a stated state, not a blank or a zero.** As the exited card in the
  mock shows: the value reads `—`, the capacity note is replaced by the *no sample* wording, and the
  track is drawn empty. "No measurement" and "measured zero" must be distinguishable, because a
  running container genuinely idling at 0.0% is a different fact from a stopped one that reports
  nothing — and the mock draws both.

- **The state is legible three ways and they always agree**: the accent bar, the dot and the pill all
  derive from the same container state, and the metric bars' fill takes the same state colour (the
  mock's paused card fills its bars amber, its running card blue). No card may show two states at
  once.

#### How often the metrics are sampled, and when they are sampled at all

These requirements govern the **shared per-container sampling that feeds the containers list and the
dashboard**. They do not govern the detail panel's Stats tab, which is a separate per-container
stream with its own lifecycle and is untouched.

- **The sampling interval is 10 seconds**, replacing the delivered 3. Decided by the human, who
  proposed 20 and chose 10 when the trade was put to them. It is a deliberate midpoint: long enough
  that the per-container cost falls by more than two thirds, short enough that a bar visibly moves
  while an operator watches a container start up. Accuracy is not traded away — each sample carries
  its own delta and is self-contained, so a longer gap between samples costs nothing but immediacy.

- **The sampling runs only while somebody is consuming it, and idles otherwise.** This is the
  requirement, and it is about the **server's sampling**, not about what the client draws: today the
  loop is started at boot and never stops, so gating the interface alone would leave every call
  exactly where it is and satisfy nothing the human asked for. After this change, the daemon is asked
  for per-container stats **only while at least one consumer is actually being shown those figures**.

- **The gate closes in all three of these cases**, and the third is the worst of today's behaviour
  and must be named rather than left to follow:
  1. the operator moves to a section that does not display these figures;
  2. the browser tab holding the interface is hidden or backgrounded;
  3. **no client is connected at all** — the server running with nobody watching must ask the daemon
     for nothing.

- **The gate is on the consumers of the figures, not on one named screen.** Two screens read them
  today: the containers list and the dashboard. The sampling is active while **either** is being
  consumed. Gating on the containers screen by name would silently break the dashboard's CPU figure,
  which is a regression on a screen nobody asked to change — and it would be the kind that shows as a
  dash rather than as an error.

- **A consumer proves it exists by holding a connection open, and the server observes that the
  connection is there. It does not announce itself, and it never announces that it is leaving.** This
  is the mechanism, and it is a requirement rather than an implementation detail, because the obvious
  alternative is unsound. The human's first proposal was the obvious one — *"nel momento in cui apro
  il client parte una chiamata http che attiva il sampling lato backend. nel momento in cui viene
  distrutto il frontend… stoppi il sampling"* — and it was refined for this reason: a start signal
  plus a stop signal is only as good as the stop signal, and the stop signal cannot be made reliable.
  A browser close or a navigation can be caught; **a crash, a force-quit, an OS shutdown, a sleeping
  or closed laptop, a dropped network, or a tab Chrome discards to reclaim memory cannot**, and a
  request issued as the page goes away may never leave. So a missed stop leaves the sampler running
  for ever, with nothing on screen to show for it — which is today's defect exactly, with more
  machinery on top and a new way to believe it was fixed. Liveness inverts that: the sampling exists
  only while something keeps proving a consumer does, and it stops **on its own** when the proof
  stops. Every failure mode above then converges on the correct outcome **without having to be
  detected**.

- **Sampling is counted against live subscriptions, not switched by the last event seen.** More than
  zero live subscriptions means sampling; zero means stopped. Counting is what makes two windows or
  two tabs behave correctly — one of them closing must not stop the sampling the other is still
  reading, and both closing must stop it.

- **A subscription is held only while a screen that displays the figures is actually being shown**,
  and is released on leaving that section or on the tab being hidden. This is how the three closing
  cases required above are all carried by this one mechanism.

- **"The browser was closed" therefore needs no handling of its own.** It is the subscription going
  away, indistinguishable from a section change or a hidden tab. One mechanism, three cases, nothing
  to detect — and that, not economy of code, is the point: the case that cannot be detected is the
  case that no longer has to be.

- **Nothing is signalled at unload. No `beforeunload`, no `pagehide`, no `unload`, no beacon.**
  Recorded as a prohibition with its reason, because it will otherwise be reintroduced as an
  improvement — it looks like a tidy way to release the subscription sooner, and it is: on the
  occasions it fires. Building on it makes the correct outcome depend on the browser's cooperation in
  precisely the circumstances where there is none, and it makes the unreliable path the normal one
  and the reliable path the fallback nobody tests.

- **A connection that has died without closing must not be mistaken for a live one.** A network
  yanked rather than a page closed leaves a socket that looks open and never delivers anything; if
  that counts as a consumer, the sampler runs on for a reader who has gone. So the liveness must be
  actively maintained — the server writing to the connection periodically, so that a connection with
  nobody at the other end fails and is closed rather than lingering. Without this, the one gap in the
  mechanism is the same silent-overrun failure it was chosen to avoid.

- **This is not novel infrastructure, and the plan should not treat it as such.** The product already
  holds exactly this kind of connection for its daemon event stream, and the server already notices
  when one closes and tears down what belonged to it. **Whether that existing stream is extended to
  carry this subscription or a dedicated one is added is the technical plan's decision**, to be made
  against the code and recorded there; what this analysis fixes is the property — liveness observed
  by the server, counted, self-terminating — and not the route to it.

- **Re-entering costs no wait.** When the gate opens — the screen is selected, the tab comes back,
  a client connects — a sample is taken promptly rather than after a full interval. With a 10-second
  cadence, an operator who returns to the screen and is shown nothing for ten seconds will read the
  product as broken, and this is the single most likely way this change is felt as a regression.

- **A figure that is not current is not shown as if it were.** The *no sample* presentation already
  required above — `—`, the explicit wording, an empty track — is also what a card shows when the
  last sample is too old to stand behind, which includes the moment after the gate has been shut for
  a while. What must never happen is a number from before the gate closed, redisplayed on return as
  though it had just been measured. Where the staleness bound sits is for the later phases, expressed
  as a small multiple of the interval rather than as a magic number.

- **The card does not display the age of a sample, and this is a decision rather than an omission.**
  At 10 seconds a figure is current by any operator's reading, and a per-card timestamp would add a
  changing value to every card — on the most numerous surface in the product — to answer a question
  nobody is asking, while the mock draws no such element. Freshness is expressed the honest way
  instead: a current figure, or the *no sample* state. If the interval ever grows to where "when was
  this measured?" becomes a real question, that is the point at which the card owes an answer, and it
  would be a change to this decision rather than a gap in it.

- **The value steps; it is not animated between samples.** A bar tweened smoothly across a 10-second
  gap claims a resolution the data does not have, and it would put an animation on the product's
  longest scrolled surface, which the project's performance rule forbids outright.

- **This is server-side work, and it does not follow from the card view.** Recorded plainly for the
  plan: the cadence and the gate are a change to how the product samples the daemon, not to how it
  renders. The card view is what makes them urgent — it puts the figures where they cannot be
  ignored — but the two are separable, and treating the gate as a rendering detail is how it ends up
  implemented in the client, where it would do nothing at all.

- **The list poll is a different thing from the stats sampling and does not have to follow it.**
  Whatever keeps the list itself current — one request, whose cost does not grow with the number of
  containers — is what makes a container appear, disappear or change state promptly, and that
  responsiveness is not what the human objected to. Slowing it would degrade the screen without
  reducing the load that was complained about. (Assumption, with the reasoning recorded below.)

#### Behaviour that must not change

- **The four action slots keep their contract exactly.** Fixed number, fixed order, fixed position in
  every state; the first slot carries the state-appropriate lifecycle action; an action that is not
  legal for the current state is **shown in place and disabled, not removed** (the mock's exited card
  shows `Pause` and `Restart` dimmed, which means present and inert); the `…` control is always
  last and never moves; the menu's entries, order, wording, destructive marking, hints, disabled
  entries, one-menu-at-a-time rule, keyboard operation and binding-to-its-own-container all behave
  as delivered.
- **The action cluster's geometry is fixed down the list.** The reason the row's slots were fixed was
  so that a given position always means the same thing; cards do not relax that. The cluster occupies
  the same place on every card, and a card in one state is not laid out differently from a card in
  another beyond the elements the mock itself varies (the ports chip, the primary action's label and
  tone, the disabled states, the *no sample* metrics).
- **Selecting a card opens that container's detail; selecting it again closes it.** The tabbed detail
  expansion — Logs, Stats, Config, Processes, Inspect, Exec, Attach — keeps its current content and
  behaviour, at full width, opening directly beneath the selected card, and at most one is open at a
  time. **Amended 2026-08-25**: with three cards to a row, "full width, directly beneath the selected
  card" is delivered as the panel spanning the **whole row** and opening beneath the row that holds
  that card. Nothing else about it changes.
- **Order is unchanged and is still the server's.** Alphabetical by name, total, stable across
  re-reads; the client presents the order it receives and derives none of its own. There is no sort
  control on this screen today and this change adds none — which is why removing the table's header
  row costs the operator no affordance, only labels, and the card carries its labels inside itself.
- **No selection and no bulk actions are introduced.** The containers list has neither today; the
  mock shows neither; a card view is not a reason to add them.
- **The screen's toolbar, filters and empty state are untouched**, and filtering still preserves
  relative order.
- **The copy is unchanged and stays in the product's current language.** The mock's Italian strings
  (`Up 44 secondi`, `In pausa da 12 minuti`, `di 8 core`, `nessun campione`) are the author's
  shorthand for values the product already renders in English. No string in this product is
  translated, reworded or newly authored by this change, beyond the labels the new metrics genuinely
  require.

#### The material, and who owns it

- **The card is made of the table's existing material, and that material is not rewritten.** The
  human's words: *"è fondamentale utilizzare gli stessi stili css, higlighr e shadow della tabella e
  non riscriverli!"*. Concretely, the card takes the object table's **surface treatment, hover
  highlight, selected highlight, shadow, border, radius, typography scale, muted/monospace text
  treatments and state colours** by **referencing where they already live**. Re-declaring a value
  that already exists — even to an identical value, even "just this once", even inside the library —
  is the defect this requirement exists to prevent, because two declarations of one look diverge the
  first time either is touched.

- **The card's graphics are owned by a UI-library component that acts as the card's container.**
  Stated by the human as a requirement. That component holds the background, the highlight, the
  shadow, the border, the radius and the selected/hover treatment; the containers screen supplies
  content and callbacks to it and owns none of that material.

- **Reuse first; a new component only if nothing can carry it.** In this order: (1) an existing
  library component that already carries this material, used as it stands; (2) that component
  extended with a prop or a variant, which CLAUDE.md explicitly prefers over a near-duplicate; (3) a
  new library component, only if neither of the first two can carry it. **Which of the three applies
  is a decision for the technical plan**, taken against the library as it actually is, and recorded
  there with its reason. What is fixed here is the ordering and the outcome: exactly one place in the
  library defines the card's material.

- **No visual asset of this change lives in feature code.** No raw tag, no stylesheet, no CSS module,
  no inline style prop, no visual utility class, no hard-coded colour, radius, blur, spacing, shadow,
  font size or z-index anywhere under `client/src/` outside `client/src/ui/`. This is a standing rule
  of the project and it is restated because a card is precisely the kind of thing that gets
  hand-built in a screen file.

- **Nothing is copied out of the mock into the product.** The image is the visual target; it is not
  source.

#### The exception is recorded and enforced as an exception

- **The 2026-08-16 decision is amended in the open, not bypassed.** That analysis's requirements, the
  downstream artefacts that carry them and the automated check that guards them are updated
  deliberately, each stating **what changed, why, and on 2026-08-25**, so that a later reader finds
  a recorded exception rather than a contradiction between the record and the product.

- **The check must keep failing everywhere else.** The guard that fails when a list draws its rows as
  detached surfaces stays in force for every other list in the product. It is widened to admit the
  containers card presentation **by name**, and by nothing wider than that. Silencing the check,
  deleting it, or exempting it with a blanket comment would trade a one-screen exception for the loss
  of the rule — and this codebase has already paid once for a decision whose only guard was that
  someone remembered it.

- **Reproducing the card presentation outside the containers screen still fails.** The exception is a
  screen, not a licence.

### Non-functional

- **The list stays cheap to scroll.** Cards are taller than rows, so a viewport holds fewer of them
  and a long list scrolls further. Whatever the count of containers, scrolling and resizing must stay
  smooth: no new per-card cost that scales with the list, no animation or transition on a scrolled
  surface, and no new compositing layer per card beyond what the table's own material already costs.
- **No blur is introduced anywhere.** The containers list is main view. The allow-list, the
  conformance check's blur half and the static pre-blurred background are untouched; an edit to any
  of them is a signal that something has gone wrong and is reported rather than made.
- **Live metrics on every card must not degrade the screen.** The list already re-reads on every
  daemon event and already displays CPU and memory; adding NET I/O, two bars and a capacity
  denominator must not make the screen stutter, must not delay the daemon event stream, and must not
  make an action feel slower to acknowledge.
- **The load on the daemon must come down, measurably, and be shown to have come down.** This is the
  human's actual objection — *"evitare chiamate massive a docker"* — so it is verified as a figure
  rather than asserted: the number of stats requests made to the daemon over a fixed window, with the
  containers screen open, with another section open, with the tab hidden, and with no client
  connected. The last of those must be zero. A change that reorganises the sampling without reducing
  the calls has not been made.
- **The daemon is the operator's own machine.** This sampling is not a synthetic load in a lab: it is
  requests against the daemon the operator's real work depends on, made continuously, in proportion
  to how many containers they are running. That is the reason a gate is worth building at all, and
  the reason "it is only a few requests" is not an argument — it is a few requests forever, times the
  number of running containers, for a figure that may have no reader.
- **Idling must be genuine.** A gate that stops updating the interface while the requests continue
  satisfies nothing. What must stop is the traffic to the daemon.
- **No leak, no drift and no wedge.** The gate opens and closes many times in a session — every
  section change, every tab switch, every client that connects or drops, every reload. It must not
  accumulate anything per cycle, must not leave sampling running after the last consumer has gone,
  and must not fail to restart when a consumer returns. The count of live consumers must **return to
  zero** when the last one goes, from every route out: a clean close, a reload, a crash, a killed
  browser, a pulled network. A count that drifts upward is the failure mode of this design, it is
  invisible from the interface, and its symptom is the original defect — so it is checked directly by
  bringing consumers up and down repeatedly and confirming the daemon goes quiet each time.
- **The correct outcome must not depend on the browser's cooperation.** Every way a client can
  disappear — including the ones that fire no event at all — must end the sampling by the same route
  as an orderly departure. A design that is correct only when the page gets a chance to say goodbye
  has not met this requirement, however well it behaves in a demonstration.
- **The card must remain readable below the desktop breakpoint.** The mock is a desktop arrangement.
  At narrow widths the card reflows — this is the one thing a card does better than a row, and it is
  the failure mode the product has already been bitten by, where the containers row collapsed six of
  eight columns to zero width and could not be scrolled to reveal them. No value may be clipped to
  nothing or hidden without a route to it at 375×812.
- **Legibility over the glass material.** Muted text, monospace identifiers, disabled controls, the
  metric tracks and their fills must all stay readable on the translucent surface, including the
  low-contrast case the mock itself demonstrates — its third card sits where the background is
  lightest and its accent bar and surface nearly vanish.
- **Verified in the delivered product against the real daemon**, under the project's test discipline:
  own labelled fixtures, cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon or
  of another test's state, its own data directory, nothing reaching Docker Hub, every spec passing on
  its own.
- **Interactions are driven with a real pointer at the visible control's coordinates, and the checks
  assert geometry.** This screen's whole change is geometry, and this project has already shipped a
  defect that content-counting coverage passed on twice: the card's element arrangement, the action
  cluster's position, the three metric columns and the card's own viewport box are asserted as boxes
  and edges, with content assertions standing beside them and never instead of them.
- **The existing coverage of the containers list is restated, not neutered.** Assertions that reach a
  container through a table row, or that assert the table's geometry on this screen, are rewritten
  against the card — never weakened into passing while what they named goes unchecked.
- **English only** in source, identifiers, comments and amended artefacts; kebab-case for any new
  file.

## Assumptions

- **This is an evolution of `docker_management_app.md`, not a fix.** Decided by the human. Nothing is
  broken: the table does what it was specified to do. This restates how containers are presented, as
  the sibling evolutions on this screen did.
- **The mock is normative for arrangement, not for pixels.** The precedent is this screen's own
  `container_row_actions` analysis, which took its screenshot as deciding which actions are primary,
  their order, wording and tone, and left measurements and colours to the later phases within the
  existing tokens. The human's insistence here strengthens the first half — placement is mandatory —
  and leaves the second half unchanged. **Amended 2026-08-25**: the mock is normative for arrangement
  with **two named exceptions**, and no others — three cards to a row and the metrics stacked, both
  decided by the human on the running product. See *Amendment — 2026-08-25: three cards to a row,
  against the mock*.
- **The mock's bars are indicative, not measured.** Its memory bar shows a visible fill for `6.1MB`
  against `31.0GB`, which is not proportional. The intent is a fill proportional to the value against
  the stated capacity, with a non-zero measurement remaining visible rather than disappearing; the
  mock's own fills are a sketch of the element, not a specification of its arithmetic.
- **The third card is the same width as the other two.** In the image it appears to end earlier; it
  does not — its translucent surface simply loses contrast over the lighter region of the background,
  and its action cluster sits at the same horizontal position as the other two cards'. Recorded so
  nobody implements a narrower card for stopped containers.
- **`RUNNING` / `PAUSED` / `EXITED` in the mock are examples of the container's state, not the whole
  set.** The daemon also reports created, restarting, removing and dead. Every state the product can
  display gets a pill, an accent and a dot, following the same rule; the three drawn are the three
  the mock happened to need.
- **The ports chip appears only when there is something to show.** The mock draws it on the running
  card and on neither other. A container publishing several ports shows them in that chip's place;
  how many fit before the chip must summarise is a presentation detail for the later phases, bounded
  by the rule that no identifier is silently clipped into illegibility. **Settled 2026-08-25**: the
  requirements gate closed this to "every mapping, none summarised" (REQ-5); the human reversed that
  on the running product once the cards were three to a row, and the answer to "how many fit" is
  **three, then one `+n`**.
- **NET I/O, the capacity denominators and the bars are re-presentations, not new capability.** The
  product already samples per-container CPU, memory and network for the list, and already knows the
  host's capacity. If a later phase finds any of these genuinely unavailable where the list is built,
  that is a finding to report — not a licence to drop a value the mock draws.
- **The list poll keeps its current cadence; only the per-container stats sampling moves to 10
  seconds.** The human's decision named the metrics, and the two costs are different in kind: the
  list is one request whose cost does not grow with the number of containers, and it is what makes a
  container appear, disappear or change state promptly — the responsiveness the product is sold on.
  The stats sampling is one request per running container, and it is the *"chiamate massive"* the
  human objected to. Slowing the first would cost the screen its liveness while saving almost
  nothing. Recorded as an assumption because it is an inference from the request rather than a
  sentence in it, and it is cheap to reverse if the human disagrees.
- **10 seconds is the interval while sampling is active**, not an average and not a target. Whether
  the clock runs from the start or the end of a sampling pass, and how a pass slower than the
  interval is handled, are later-phase concerns — bounded by the rule that passes must not overlap or
  queue up behind each other, since that would reproduce the massed calls at a different rhythm.
- **The gate is about the daemon's load, not about correctness of the display.** No figure becomes
  wrong because sampling paused; it becomes *old*, which the *no sample* state already exists to say.
- **More than one client at a time is a normal state, not an edge case.** A second tab, a second
  window, a second browser on another machine pointed at the same server: all ordinary. It is why the
  gate counts consumers instead of holding a single on/off flag, and why "the last one leaves" rather
  than "one leaves" is the condition that stops the sampling.
- **A client that is present but showing an unrelated section is not a consumer.** Being connected is
  not the same as being shown the figures; the subscription is taken by the screens that display them
  and released by everything else. Otherwise the gate would reduce to "is a browser open", which is
  most of the day.
- **The interval between liveness checks on a held connection is a later-phase decision**, bounded by
  the requirement that a connection whose other end has vanished is discovered in a time comparable
  to the sampling interval — discovering it in an hour would leave the sampler running for an hour.
- **The dashboard is a consumer and is otherwise untouched.** Its container list stays a table and
  its layout does not change; it appears in these requirements only because it reads the same sampled
  figures, and so must keep them.
- **Nothing about the detail panel's Stats tab changes.** It is a separate per-container stream,
  opened while a panel is open and closed with it, already demand-driven by construction. It is named
  in these requirements only to keep it out of them.
- **The short container id on the card is the identifier the product already shows for a container**,
  in its existing short form. The mock shows twelve hexadecimal characters, which is the daemon's own
  convention.
- **The tabbed detail expansion opens beneath the selected card**, full width, with its current
  content and its current close behaviour. The mock does not draw it; this is the smallest change
  from delivered behaviour, and this analysis says nothing else about that panel.
- **The dashboard's container list is not in scope.** It is a different screen with a different
  purpose (an overview), it was not named in the request, and the human confirmed *"solo
  containers"*.
- **The primary action's tone follows the direction of the action.** The mock draws `Resume` and
  `Start` accented and `Stop` neutral-filled, all three more prominent than `Pause` and `Restart`.
  Read as: the first slot is always the most prominent control of the cluster, and bringing a
  container up is accented while halting one is not. Recorded as a reading of the image rather than
  as a new rule; the exact tones come from existing tokens.
- **No usage data decides any of this.** The product collects no telemetry; the arrangement is the
  requester's operational judgement, and it is accepted as given.

## Constraints

- **One visual language, defined in exactly one place.** `client/src/ui/` is the only place in the
  client allowed to emit raw DOM or contain CSS. This change is made there and consumed from the
  containers screen.
- **The library changes before the feature code does.** Whatever carries the card's material exists
  and is exported before the containers screen asks for it.
- **The material is the table's, referenced and not restated.** This is the human's explicit
  constraint and it bounds the whole change: no second definition of the surface, the highlight, the
  shadow, the border, the radius or the state colours may exist when this is done.
- **No near-duplicate component.** If an existing component almost fits, it is extended. Two
  components that look ninety per cent alike are the divergence the project's rules exist to prevent.
- **The blur allow-list, the conformance check's blur half and the pre-blurred background asset are
  untouchable.** The only legal blur value in the codebase is the single overlay token, and this
  screen is not entitled to it.
- **The 2026-08-16 one-presentation decision stands everywhere except the containers screen**, and
  the exception is recorded and machine-enforced rather than assumed.
- **The certified predecessors on this screen stay certified** and are named in the checks rather
  than assumed: the four-slot action contract and its overflow menu, the detail panel's close
  behaviour, the server-side total ordering, the dialog sizing rules, and the switch that must not
  drag its surface out of the viewport.
- **The list re-reads on every daemon event**, so whatever the card does per update it does
  constantly, under concurrent change, while the operator watches.
- **The daemon is the operator's own.** Their containers are in this list; verification creates its
  own labelled fixtures, cleans up in a `finally`, and asserts on what it created rather than on
  totals or emptiness.
- **The sampling change is server-side, and it is the only part of this work that is.** Everything
  else here is the interface. The two halves are separable and should be recognisable as such in the
  plan: a card view that renders whatever it is given, and a sampler that is asked for less, less
  often. Building the gate in the client would satisfy the letter of "disable it when the section
  changes" and none of its purpose, since the calls are not made by the client.
- **The sampled figures are shared, not owned by the containers screen.** The dashboard reads them
  too. Any gate, cadence or cache decision is a decision about a shared resource with more than one
  consumer, and must be expressed in terms of consumers rather than of one screen.
- **The interface is served by the same single process that serves the API**, so "no client
  connected" is a state that process can and must recognise: it is the normal state of a server left
  running, and today it is indistinguishable from a busy one as far as the daemon is concerned.
- **No other API and no daemon behaviour is in scope** — and if a later phase establishes that a
  value the mock draws is genuinely not obtainable where the list is built, that is a finding to be
  reported before anything further server-side is touched.

## Market trends

Relevant, and consulted on the two points the decision turns on: whether a card view is a defensible
choice for a resource list, and whether per-container metrics belong on the list at all.

- **The published trade-off is density against self-containment, and the test is the task, not
  taste.** Current guidance is explicit — a table wins on information density and cross-record
  comparison and pays for it on narrow screens; a card grid trades density for scannability and wins
  when each item should feel *self-contained*. The stated rule of thumb is close to the human's own
  wording: *if you would naturally describe the data as "rows", it wants a table; if you would
  describe it as "items", it probably wants cards*. A container — named, stateful, with a lifecycle
  and live telemetry of its own — is an item. This is the same body of guidance the 2026-08-16
  analysis cited against the hybrid, applied to a genuine card, and it does not contradict that
  decision: what it condemns is column headers over detached cards, and this presentation has no
  header.
  ([UX Patterns for Developers — Table vs list view vs card grid](https://uxpatterns.dev/pattern-guide/table-vs-list-vs-cards);
  [Smart Interface Design Patterns — Cards vs. lists vs. tables vs. data grids](https://smart-interface-design-patterns.com/articles/cards-vs-lists-vs-tables-vs-data-grids/))
- **The cost of cards is the one this change must watch: fewer objects per screen.** The same
  guidance scores a card grid as medium density against a table's high, which on a host with dozens
  of containers is the real price of this change and is recorded under Risks rather than waved away.
  ([UX Patterns for Developers — Card grid pattern](https://uxpatterns.dev/patterns/data-display/card-grid))
- **Per-container stats on the list page is a known gap in the nearest competitor, not an
  indulgence.** Portainer shows CPU and memory only after clicking into a container and opening its
  Stats view; "show statistics about memory and CPU usage of all containers" is an open request
  against it. The mock puts on the list precisely what that request asks for.
  ([portainer#8144 — show statistics about memory and CPU usage of all containers](https://github.com/portainer/portainer/issues/8144);
  [Viewing container resource usage in Portainer](https://oneuptime.com/blog/post/2026-03-20-view-container-resource-usage-portainer/view))
- **The same comparison supports the gate, from the other side.** Portainer asks the daemon for a
  container's stats when the operator opens that container's stats view — one container, while it is
  being looked at. Vexel's advantage is that it shows the figures for every container without a
  click; what it should not inherit from that advantage is asking for all of them forever. Sampling
  while the figures are on screen keeps the advantage and drops the cost, which is what the human's
  decision amounts to.
- **The mock's metric set is the CLI's own, minus two.** `docker stats` reports CPU %, memory
  usage/limit, net I/O, block I/O and PIDS. The card takes the first three — including the *usage
  against limit* framing that the mock's `of 8 cores` / `of 31.0GB` reproduces — and leaves block I/O
  and PIDS to the detail panel. An operator who knows `docker stats` will recognise the card's
  numbers, which matters for a product whose promise is a faithful front end to the daemon.
- **Card presentations are established in this exact product category.** Dockge, one of the two most
  cited Docker web UIs alongside Portainer, presents each stack as a card. So a card view here is
  within the vocabulary of the category rather than a departure from it.
  ([Portainer vs Dockge comparison](https://homelabcompass.com/compare/dockge-vs-portainer))

## Risks

- **Fewer containers fit on screen, and that is the price of the change.** A card is several times
  the height of a row, so a host with thirty containers goes from a screenful to a long scroll. The
  human has weighed this and chosen the card; the mitigation is that the card carries its own labels
  and its own status, so a single card answers questions the row could not — but if the screen proves
  unworkable at scale, the remedy is a density decision on this presentation, not a return to the
  table.
- **Comparison across containers gets harder.** Without a header and shared column tracks, "which of
  these is eating the CPU" is a scan rather than a glance. The mock mitigates it — the metric columns
  sit at the same position on every card, so the numbers still line up vertically down the list — and
  that alignment is therefore load-bearing, not decorative. A card whose metric columns drift with
  its content would lose the last of the table's advantage.
- **The live metrics cost more than the screen can pay.** Re-rendering CPU, memory and network for
  every card, on a list that also re-reads on every daemon event, is a likely source of a regression
  in a product whose main view is required to pay nothing for its material. It will not announce
  itself as a bug; it will show up as a list that stutters when scrolled.
- **The gate is built in the wrong layer and changes nothing.** The most probable way this request is
  answered wrongly. "Disable the metrics when you leave the section" describes an interface, and the
  interface is not what calls the daemon — so a client-side gate would look right on review, pass a
  test that watches the cards, and leave every request exactly where it is. This risk is why the
  verification is a count of requests reaching the daemon and not an observation of the screen.
- **The gate never closes in the case that matters most.** A server left running with no browser
  attached is the state a developer never looks at and the state the product spends most of its life
  in. It is also the one where the calls buy literally nothing. If any of the three cases is quietly
  dropped during implementation, it will be this one.
- **The sampler is left wedged.** Gating something that has never been stopped introduces a lifecycle
  where there was none: sampling that does not resume when the operator comes back (a screen of
  dashes that looks like a broken daemon), or does not stop when they leave (the defect reinstated,
  invisibly, while the code reads as though it were fixed). The second is worse because nothing on
  screen betrays it.
- **The consumer count drifts upward and never returns to zero.** The specific form the risk above
  takes in a counted design, and the most likely single defect in this whole change: one route out —
  a reload, a crash, a duplicated subscription on remount, a connection closed twice or not at all —
  that adds without subtracting. After a day's work the count is never zero, the daemon is sampled
  for ever, and the interface looks perfect. Only a check that drives consumers up and down and then
  watches the daemon go quiet can see it.
- **A half-open connection counts as a reader who has gone.** A network pulled rather than a page
  closed leaves a socket that looks alive indefinitely. Without something periodically proving the
  connection still works, this is a leak that no amount of correct close-handling catches, because
  nothing ever closes.
- **Unload-time signalling comes back as an improvement.** `beforeunload` and a beacon look like a
  tidy way to release the subscription immediately, and they work most of the time — which is exactly
  what makes them dangerous here: they move the correct outcome onto a path that is absent in every
  case that matters, and they make the reliable path the one nobody exercises. It is prohibited in the
  requirements for this reason, and the prohibition is the kind that gets reversed by someone acting
  in good faith.
- **Ten seconds reads as frozen.** The metrics become the most prominent band of the card, and a bar
  that steps every ten seconds on a container the operator has just started may read as a product
  that has stopped updating rather than as one that samples. The prompt sample on re-entry and the
  honest *no sample* state are what stand between the decision and that impression; if either is
  skipped, the cadence will be blamed for a defect that is not in it.
- **A stale figure is redisplayed as current.** After the gate has been shut for a while, the cached
  numbers are still there and showing them costs nothing — which is exactly why it will happen. A
  number that has not been measured for ten minutes, presented identically to one measured a second
  ago, is worse than a dash: it is trusted.
- **The dashboard loses its CPU figure.** It reads the same sampled data and nobody asked for it to
  change. A gate written around the containers screen by name breaks it, and the symptom is a dash on
  a screen not under review.
- **The material gets re-authored instead of reused.** The most likely way this request is answered
  wrongly, and the one the human pre-empted in writing: a new card stylesheet that *looks* like the
  table's surface. It passes the eye on day one and diverges on the first day either is touched. Two
  weaker forms of the same failure are copying the mock's markup into the screen, and adding a
  "temporary" local style with a promise to extract it.
- **The exception becomes the rule's undoing.** The guard against detached card rows must be widened
  by name and by nothing more. Disabling it, or exempting the containers screen with a blanket
  comment, would leave the product with no defence anywhere — and this codebase has already recorded
  a decision that was taken, written down, never enforced, and silently reversed by the next batch
  of work.
- **The record and the product end up disagreeing.** The 2026-08-16 requirements and the artefacts
  carrying them still assert that no object list draws a detached row. Left unamended while the code
  changes, a later reader would be doing the correct thing by the record if they converted containers
  back to a table.
- **A value is dropped silently in the conversion.** Ports, uptime, the image reference and the short
  id are easy to lose when a row becomes a card, and nothing errors when they go — the card simply
  gets shorter. The before/after comparison must be against the delivered list, value by value.
- **"No sample" reads as zero.** If the empty state is drawn as `0` or as a blank rather than as the
  mock's `—` plus its explicit wording, the operator cannot tell a stopped container from an idle
  one, and will eventually trust a stale number.
- **The redesign widens.** Redrawing this screen is a standing invitation to reorder the actions,
  reword the labels, add a sort control or add selection. Any of it makes the result impossible to
  compare against what shipped, and every one of those was deliberately excluded by an earlier
  analysis on this very screen.
- **The narrow breakpoint regresses unnoticed.** This screen has already shipped a row that collapsed
  its columns to zero width with no way to scroll to them. A card is more forgiving, which is exactly
  why nobody will think to measure it.
- **The mock is read as a specification of capability.** It draws three states, one ports chip and one
  set of numbers. Building only what the image contains — three states, one port, one bar arithmetic
  — reproduces the sketch rather than the screen.

## Scope

**In scope**

- Replacing the containers screen's table with a list of one card per container, arranged as
  `.sdd/analysis/ui-mock/containers-refactor.png` arranges it, element by element, per the map under
  Requirements — **except on the two positions the 2026-08-25 amendment departs from**: the cards
  are laid three to a row, not one at full width, and each card's metrics are stacked one per row,
  not side by side — and **except on the card's internal arrangement, which is
  `containers-refactor-b3.png`'s from 2026-08-25** (*Amendment — 2026-08-25 (second)*): the actions
  in a footer, the id anchored right, the uptime beside the state, the image on a front-truncating
  line of its own, the ports as a metric row, and the inert detail control at the top right.
- The card's bands and everything in them (three as first written, five and a footer as rearranged
  on 2026-08-25): the state accent bar, dot, name, state pill, short
  id, the primary action and the `Pause` / `Restart` / `…` cluster, the image chip, the
  ports chip, the status sentence, and the `CPU` / `MEMORY` / `NET I/O` metric strip with its
  capacity notes, its bars and its explicit *no sample* state.
- Adding NET I/O, the capacity denominators and the per-metric bars to the list, live.
- Changing the shared per-container stats sampling from every 3 seconds to **every 10**, and from
  always-on to **demand-driven**: active while the containers screen or the dashboard is being
  consumed, idle on a section change, idle when the tab is hidden, and idle — asking the daemon for
  nothing at all — when no client is connected.
- Carrying that gate on a **consumer's liveness** — a connection held open while a consuming screen
  is shown, whose disappearance the server observes rather than is told about — counted, so that
  several tabs behave correctly, and kept honest by a periodic write so a dead-but-unclosed
  connection cannot pass for a live one. Whether the product's existing held-open stream carries this
  or a dedicated one is added is the technical plan's decision.
- Sampling promptly when the gate reopens, and falling back to the *no sample* presentation rather
  than redisplaying a figure that is too old to stand behind.
- Verifying the reduction as a count of stats requests reaching the daemon in each of those states,
  the connected-to-nobody case included; that the gate neither wedges open nor wedges shut across
  repeated section changes, tab switches and reloads; that two tabs behave correctly, one closing
  while the other reads; and that the consumer count returns to zero by every route out, including
  the ones that send no notice at all.
- Keeping the dashboard's CPU figure working across all of it.
- Providing the card's material through a UI-library component that acts as the card's container and
  owns its background, highlight, shadow, border and radius — reusing or extending an existing
  component where one can carry it, and creating a new library component only if none can, with the
  choice made and justified in the technical plan.
- Reusing the object table's existing surface, highlight, shadow, border, radius, typography and
  state colours by reference, leaving exactly one definition of that material in the product.
- Preserving, unchanged: the four action slots and their contract, the overflow menu, the detail
  panel and its open/close behaviour, the server-side ordering, filtering, the toolbar, the empty
  state, and every string.
- Amending the 2026-08-16 one-presentation decision, the downstream artefacts that carry it and the
  automated check that guards it, in the open and by name, so the containers screen is a recorded
  exception and every other list is still guarded.
- Restating the existing containers coverage against the card, and verifying the result with a real
  pointer and on geometry, at the project's reference viewports including 375×812, against the real
  daemon under the project's test discipline.

**Out of scope**

- **Every other list in the product** — images, volumes, networks, compose, swarm, registries,
  contexts, plugins, builders, build cache — and **the dashboard's container list**. All stay classic
  tables. The human's answer was *"solo containers"*.
- Any change to what a container action does, to its confirmation, to its feedback, or to the API
  behind it.
- New per-container capabilities of any kind, including anything that merely appears in the mock and
  does not exist today.
- Selection, bulk actions, an operator-facing sort control, grouping, pagination, a density toggle,
  or a card/table switch on this screen.
- The contents of the container detail panel and its tabs, beyond where it opens — **including its
  Stats tab's own per-container stream**, which is a separate mechanism, already opened and closed
  with the panel, and is not what the cadence and the gate govern.
- The cadence of the list poll itself, which stays as delivered: it is one request whose cost does
  not grow with the number of containers, and it is what keeps state changes prompt.
- Any per-metric history, sparkline, chart, alerting or threshold on the card, and any operator
  setting for the sampling interval.
- Any explicit start/stop signalling of the sampler by the client, and any unload-time signal —
  ruled out in the requirements rather than merely left undone.
- What the product's existing held-open stream carries for its own purposes, and the lifecycle of
  anything else that rides on it.
- The dashboard's layout, list presentation or content — it appears here only as a consumer of the
  sampled figures.
- Block I/O and PIDS on the card.
- Translating or rewording any part of the interface.
- The blur allow-list, the conformance check's blur half, and the background asset.
- Server-side behaviour, the API and the daemon — unless a value the mock draws proves genuinely
  unavailable where the list is built, which is reported before anything is changed.
- Re-arguing the 2026-08-16 retirement itself, which stands for the rest of the product.
