---
slug: docker_management_app-containers_card_view
date: 2026-08-25
spec: .sdd/analysis/docker_management_app-containers_card_view.md
requirements: .sdd/plans/plan-docker_management_app-containers_card_view/requirements.md
status: validated
---

# Batches — The containers list becomes a card view, and the metrics behind it are sampled only while somebody is watching

Evolution of a certified product. **Three features, three batches, in a forced order.** Batch numbers
and `REQ-n` / `INT-n` ids are **local to this plan**: `REQ-1` here is not
`plan-docker_management_app/REQ-1`.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · card-row-exception | F3 — The card row stays retired everywhere else, and the containers exception is recorded | REQ-59, REQ-60, REQ-61, REQ-62, REQ-63 | — | certified | Nothing in the interface changes: the containers list is still a table, every screen looks exactly as it did. What changed is the guard and the record. Open `client/scripts/check-ui-conformance.mjs`: the card-row pass now holds **one named admission** — the two file paths `client/src/containers/ContainersScreen.tsx` and `client/src/containers/ContainerCard.tsx`, written out as literal paths with the date, the reason and a pointer to both records beside them — and **nothing else changed in that file**; the blur half's `blurAllowedOverlaySelectors` and its five declarations are byte-identical, and the pass carries **no `ui-blur-exception:`-style marker of its own**. Paste a `<Card>` inside a `.map()` into any other screen (volumes, images, swarm — pick one) and run `npm run lint`: it **fails**, naming the decision and the record. Undo it, put the same thing into `ContainerCard.tsx` (create it empty for the test, then delete it): it **passes**. Re-declare a `border-radius` on `.ui-data-table__row` or a `gap` on `.ui-data-table__body`: still fails. Write `'comfortable'` or `DataTableVariant` anywhere: still fails. `npm run lint` and `npm run test -w client` are green, `card-row-presentation-retired.test.ts` and `ui-conformance-check.test.ts` included, both of which now state the exception rather than contradicting it. And the record agrees with the code: `.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md`, its plan folder, `specs/ui-conformance-check.md` and `specs/data-table.md` each carry an amendment block saying **what changed, why, and on 2026-08-25**, bounded to containers, so a reader arriving cold finds one exception and not a contradiction. |
| 2 · containers-card-view | F1 — The containers list presents one card per container | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36, REQ-37, REQ-38, REQ-53 | 1 | certified | Open Containers with a running container, a paused one and a stopped one of your own making. The table is **gone** — no header row, no hairline rules, no single surface around the list — and in its place a **grid of cards**, one per container, **three to a row** (two at ≤1200px, one below the phone breakpoint), evenly gapped, and **the same width whatever the state** (the mock's third card only *looks* narrower; check its right edge against the others). The cards of a row are all as tall as the tallest of them; **rows may differ from each other**, which is the arrangement decided and not a defect. Read one card against `.sdd/analysis/ui-mock/containers-refactor-b3.png` band by band — **that image governs the inside of a card from 2026-08-25**, `containers-refactor.png` standing as the record of what was first asked and still governing everything the newer one does not redraw; both draw one card at full width with the metrics side by side, and on those two points the delivery deliberately departs from them (see the two amendment notes at the end of this cell). What you are checking: the accent bar down the left edge in the state's colour, following the corner and running through the footer too; then dot · **name** at the left — give a container a very long name and watch the name ellipsise — with the **short id anchored at the right edge of that same row**, never truncated, and beside it a small square control that will open the container's detail in a modal: **click it and nothing happens, which is the decision and not a bug** — it is deliberately not disabled either, and it must not open or close the detail panel by accident; then, on a line of its own under the name, the uppercase state pill beside the uptime sentence (`RUNNING` then `Up 3 hours`); then the `image` reference on a **full-width line of its own**, sharing it with nothing — run a container from a long reference (`ghcr.io/some-org/some-service:1.2.3-rc1`) and check it ellipsises **at the front**, keeping `name:tag` and losing the registry host, and that it pushes nothing out of place; then `CPU`, `MEMORY`, `NET I/O` and `PORTS` **stacked one per row**, each label small, uppercase and muted, each capacity note (`of 8 cores`, `of 31.0GB`) right-aligned to its own metric's right edge, a track under each of the first two, `NET I/O` reading `in` and `out` right-aligned **on one line** with **no bar**, and `PORTS` on that same rhythm — label at the left, chips right-aligned **on one line, always** (publish three and see three, publish seven and see **two chips and a `+5`** — never a second line), reading `none` for a container that publishes nothing rather than dropping the row; then, below a hairline and on its own slightly distinct ground, the **footer**: `Stop` / `Resume` / `Start` at its left and, at its right, `Pause` · `Restart` · `…` joined into one cluster with dividers, ending flush at the card's inner right edge. Scroll the list: within a row the metrics are at the **same x on every card**, and down each column of the grid they line up too. Every value the old row showed is still there — put the two side by side against the previous build if in doubt. Watch a container you have just started: the numbers and the bars **step** in place, the card does not move, the list does not reorder, no other card flickers, and nothing is tweened. The stopped container reads `—`, its capacity note replaced by the *no sample* wording, its track empty — plainly different from the paused one sitting at `0.0%` with its capacity note intact. Pause a container: the bar fills amber, the pill, dot and accent all agree, and nothing shows two states. Click a card: the detail panel opens **beneath that card**, spanning the whole width of the grid, with its seven tabs unchanged; click again: it closes. **Annotated 2026-08-25**: it opens beneath the *card*, not beneath the *row* — the cards sharing the selected one's row are carried below the panel (measured: y=367.8 → y=954.8 with the panel at y=623.6). Known, and deliberately not fixed: the intervention that moves the detail into a modal removes this inline panel altogether. The check that asserted "beneath the row" was removed for that reason and not because it failed (REQ-23). The toolbar, the search, the state chips, the empty state, the rename, the overflow menu and its four entries, the confirmations and every string are exactly as before — a disabled `Pause` on the stopped card is **present and dimmed**, not missing, and still says why. Squeeze to 375×812: the grid drops to one card per row and the metrics are stacked as they already were, each keeping its label, value, capacity note and track; the footer's cluster wraps within the footer keeping its order and its segmented geometry; nothing is clipped, nothing needs a sideways drag, and **no value is missing that the desktop shows**. Look at the card sitting over the lightest part of the background: the muted text, the ids, the dimmed controls and the tracks are all still readable. `npm run lint` (the widened guard admitting these two files and no other), `npm run test:typecheck -w client`, `npm run test -w client` and `npm run test -w server` pass; the batch's own e2e specs pass, and so do the restated `client/e2e/containers.spec.ts` and the amended `client/test/unit/containers-screen.test.tsx` and `images-containers-table-alignment.test.tsx`. **Amended 2026-08-25, after the human saw the batch running.** This cell described a stack of full-width cards; it now describes the grid that was delivered instead. **Three to a row, against the mock**, with the metrics stacked: the full-width card spread its three metric columns across roughly 1000px, a void through the middle with `NET I/O` against the right edge, so the human changed it on the running product and accepted the result. **Cards equal in height per row, rows unequal to each other**: a fixed height for every card on the screen was offered and refused, no minimum height is imposed. **The ports decision is reversed by the human who took it**: three chips and a `+n` instead of every mapping wrapping, because at a third of the page one container's port list set the height of every card beside it; the split is at four, so a `+1` is never drawn. **And one real defect was found and fixed at its source**: the daemon reports a port published on both IP stacks twice, identical once the host IP is dropped, which gave the card duplicate React keys and made the chips accumulate in the DOM on every poll (4 ports measured at 57 chips). `summaryPorts` in `server/src/containers/containers-service.ts` now reports each mapping once — so publish a port, leave the list open through several polls, and the chips must not multiply. Recorded in the analysis's *Amendment — 2026-08-25: three cards to a row, against the mock* and annotated on REQ-1, REQ-5, REQ-6, REQ-9, REQ-10, REQ-11, REQ-12, REQ-23, REQ-32 and REQ-34. **Amended a second time, 2026-08-25, after the human reworked the card's internal arrangement with generated mocks and chose one.** The delivered card's elements were *"disposti un po' a caso"*, and a long image reference wrecked the line it shared. Three whole-card arrangements were put to the human (`containers-card-layout-variants.png`, A/B/C) and then three port placements on the chosen one (`containers-card-ports-variants.png`, B1/B2/B3); the delivery is **B3**, drawn in `containers-refactor-b3.png`, which governs the inside of a card from this date. Four faults were named and each is fixed: **the actions interrupted the description** — they are now a footer, below a hairline and on their own ground, so read and act are two gestures; **the id floated on the most prominent line** — it is anchored to the right of the name row, and the name is what gives way; **the uptime was stranded among the provenance chips** — it now sits beside the state pill, `RUNNING` and `Up 3 hours` reading as one sentence; **the capacity note sat far from its value** — resolved by the card being a third of the page, the note staying right-aligned in its own metric's row. Two further moves: **the image reference has a full-width line of its own and truncates at the front**, because the registry host is the sacrificial half and an end-ellipsis throws the tag away (the ellipsis is a library declaration, not feature CSS); and **the ports left provenance for a `PORTS` metric row** — the image says what the container is made of, the ports say how you reach it — labelled, so the row keeps its shape whatever the container publishes, and reading `none` instead of disappearing. **And one control was built inert on purpose**: the square button at the card's top right will open the detail in a modal in a later intervention; the human was offered wiring it to today's inline panel or shipping it disabled and chose **present and inert**, so it renders with an accessible name, is not disabled, does nothing when clicked, and does not select the card. It is recorded as a decision at the call site and in `container-card.md` so it is not "fixed" by someone acting in good faith. Recorded in the analysis's *Amendment — 2026-08-25 (second): the card's internal arrangement, chosen on generated mocks* and annotated on REQ-3, REQ-4, REQ-5, REQ-6, REQ-9, REQ-11, REQ-12, REQ-20, REQ-22, REQ-23, REQ-27, REQ-28, REQ-30, REQ-31 and REQ-34. **Two defects of that rearrangement were then measured against the running product and fixed, same date.** **The footer was not pinned to the card's bottom edge**: a card standing in a row is stretched to the tallest card of that row, and the slack was landing *after* the footer — measured at **32px of bare surface below the footer** on the two shorter cards of a row, with their footers 32px above the tallest card's. A parted surface is now a full-height column whose content band absorbs the slack, so the footer is the last band and sits on the bottom edge, its ground and hairline still reaching the surface's edges and its corners still inheriting the radius. Check it: the footers of a row line up, and the extra space opens **between the last metric row and the footer's rule**, never under it. **And the ports row wrapped to two lines**: three chips plus the `+n` did not fit the delivered track (379px at a 1480px viewport), so the cap is **two chips then a `+n`**, splitting at three so a `+1` is still never drawn. The row is one line at every port count, which is what it was moved among the metrics for. **A third defect, found by the second and fixed at the same source**: the daemon's port order is not stable across reads, so once the card drew only two chips it drew a *different* two on many polls — chips swapping identity under a container that had not changed. `summaryPorts` now imposes a total order (private port, then public, then protocol). Check it: read `/api/containers` three times in a row and the port sequence is identical each time, and the two chips on a many-ported card stay the same two while you watch it. **A fourth defect and a calibration, both from the human looking at the running card**: the overflow `…` came out **3px shorter** than the `Pause` / `Restart` segments welded to it, so the cluster's rounded end read as a bulge escaping the group — a segmented cluster of unequal heights shares no boundary at all. The **group** now owns the height; check that all four footer controls have one top and one bottom edge. And the card was proportioned unlike the mock — the library's largest inset (32px, 8.4% of the card's width against the mock's 4.9%) around list-density controls, reading as controls adrift in space. The card now takes the library's **medium** inset and the footer its **ordinary** button size; both are existing steps of the scale, nothing was invented for this card, and where the mock's own figures differ (22px inset, ~31px controls, a 26×26 opener at 8px) the scale wins and the difference is recorded in `container-card.md`. **One thing that looks wrong and is not**: `containers-refactor-b3.png` draws the primary lifecycle action accented in **every** state, `Stop` included. The delivered split — `Start` and `Resume` affirmative, `Stop` quiet — is the decision the analysis read out of the original mock and it stands; the mock is normative for arrangement, not for that tone. Do not correct the code to the picture. |
| 3 · stats-sampling-gate | F2 — The per-container sampling runs at 10 seconds and only while somebody is consuming it | REQ-39, REQ-40, REQ-41, REQ-42, REQ-43, REQ-44, REQ-45, REQ-46, REQ-47, REQ-48, REQ-49, REQ-50, REQ-51, REQ-52, REQ-54, REQ-55, REQ-56, REQ-57, REQ-58 | 2 | certified | This one is verified at the daemon, not on the screen. Start the product, connect **no browser at all**, and watch what the daemon is asked (`docker events`, a daemon log, or the batch's own measured check): **nothing**. Zero stats requests, indefinitely. Now open the interface on Containers: sampling starts, and the cards get a figure **promptly** — not after ten seconds of dashes. Time two consecutive updates: **ten seconds**, not three. Move to Images: the daemon goes quiet within one interval. Go to the **Dashboard**: it starts again, and the Dashboard's CPU reading is alive — it did not lose its figure to this change, which is the regression to look for hardest. Switch to another tab in the browser: quiet. Come back: a figure promptly. Open a **second tab** on Containers: still one sampling cadence, not two. Close one: sampling continues for the other. Close both: quiet. Now the routes that send no notice — **kill the browser process**, and separately pull the network (turn Wi-Fi off with the tab open): within about a sampling interval the server discovers it and goes quiet on its own, having been told nothing. Do that whole cycle a dozen times and confirm the daemon goes quiet **every** time: a count that drifts upward is invisible from the interface and is the failure mode of this design. Leave the screen for several minutes and return: the cards show the *no sample* state for the gap, **not** the numbers from before you left presented as current, and no card anywhere shows how old a figure is. Confirm what did **not** change: the list still reflects a container started from a terminal within about three seconds (the list poll is untouched), and a container's detail panel → Stats tab still streams at its own rate with its own five readings, opening and closing with the panel. Search the client for `beforeunload`, `pagehide`, `unload` and `sendBeacon`: **none**, and the batch's own guard fails if one appears. `npm run lint`, `npm run test -w client`, `npm run test -w server` and the batch's own e2e and server checks pass. |

| 4 · check-budgets-fit-the-test | F4 — Every check declares a budget it can spend | REQ-64, REQ-65, REQ-66, REQ-67, REQ-68, REQ-69, REQ-70, REQ-71, REQ-72 | 3 | certified | The check that died reports its own step instead of dying somewhere else |
| 5 · checks-do-not-write-in-the-tree-they-read | F5 — A check writes nothing inside the tree the other checks read | REQ-73, REQ-74, REQ-75, REQ-76, REQ-77, REQ-78, REQ-79 | 4 | certified | Nothing appears inside the sources while the checks run |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases.

## The order is forced, and this is why

**1 before 2, mechanically.** The card-row pass of `client/scripts/check-ui-conformance.mjs` reports
*"a list built as one `<Card>` per row"* for any `Surface`/`Card` rendered inside a mapper in a
feature file, and that is exactly what batch 2 writes. Until batch 1 lands, batch 2 cannot pass
`npm run lint` — which `npm run test -w client` also runs. Batch 1 is deliberately **not** folded
into batch 2: the spec requires the exception to be a decision taken in the open, and a guard
widened in the same commit that needs it widened is indistinguishable from a guard got out of the
way.

**2 before 3, by content.** Batch 3's staleness requirement (REQ-52) is expressed as *the card shows
the no-sample state instead of an old number*, and that presentation is built in batch 2 (REQ-16).
Batch 3 also gates a sampler whose figures batch 2 taught the card to display; gating first would
mean verifying a gate against two thin table columns.

**The two halves stay recognisable, as the spec demands.** Batch 2 is a card view that renders
whatever it is given; batch 3 is a sampler asked for less, less often. Batch 2 contains exactly one
server-side intervention (INT-1) and it is a data-shape widening with no lifecycle in it; batch 3
contains no card-arrangement work at all. Neither batch can be delivered by editing the other's
layer.

## Assumptions and decisions

### The card's material, and the component that carries it

- **`Surface` is extended, and `Card` forwards it. Nothing new is created for the material, and
  nothing is re-declared.** The reuse ordering the spec fixes was walked against the library as it
  is: **(1) an existing component as it stands** — none carries both the box and a selection
  treatment: `Card` is *"a padded Surface, and nothing more"* (`specs/card.md`), and the hover and
  selected highlights live on `.ui-data-table__row`, which is a class of the table, not a component.
  **(2) extend** — this is the answer. `.ui-surface` already declares exactly the box the card
  needs (`--radius-xl`, a hairline `--color-border-subtle`, `--color-surface-1`, the elevation
  shadow); what it lacks is the hover/selected treatment and the state accent edge. Both are added
  to `Surface` — where the material already is, in a stylesheet that already exists — and forwarded
  by `Card` as optional props, so **every existing `Card` and `Surface` call site renders exactly
  what it renders today**. **(3) a new component** is therefore not reached, which is the outcome
  `CLAUDE.md` prefers and REQ-30 requires.
- **"Referenced, not restated" is literal here, and cheaper than feared.** The table's hover is
  `background: var(--color-surface-2)` and its selected state `background: var(--color-accent-tint)`
  — single declarations, already bound to tokens. The card's treatment references **those same two
  tokens**, and its state colours the same `--color-success` / `--color-warning` /
  `--color-danger` / `--color-text-muted` the status dot already uses. No value is written twice
  anywhere, which is what REQ-28 asks for. **The prohibition is on a second definition of a value,
  not on a second rule referencing it**: `.ui-surface--selectable:hover { background:
  var(--color-surface-2) }` beside `.ui-data-table__row:hover { background: var(--color-surface-2) }`
  is one value in one place, read from two selectors, and the two cannot diverge. Recorded because
  the alternative readings — sharing a class between a table row and a card, or aliasing the token
  under a card-specific name — both create the divergence the constraint exists to prevent.
- **A `card.css` is not created.** `specs/card.md` states as an invariant that there is no card
  stylesheet; putting the treatment on `Surface` keeps that true and keeps one stylesheet for one
  material.
- **The card's *arrangement* is feature composition, not a library component.** The three bands are
  the library's `Stack` / `Row` / `Spacer` primitives holding library components; the vertical stack
  of cards with its uniform gap is a `Stack` with a token gap. Nothing under `client/src/containers/`
  emits a tag or a length of its own (REQ-31). Only the *material* and the *metric strip* are
  library additions.
- **Amended 2026-08-25 (second): the rearrangement stayed inside that rule, and it cost six
  extensions and no new component.** The bands the card composes changed (five and a footer, see the
  batch's acceptance cell), and every treatment they needed went into the library first: `Surface`
  gained the **footer band** — the padding moving onto the two bands so the ground and the hairline
  reach the surface's edges — and `Card` forwards it; `Chip` gained a **full-width field form** and
  **front truncation**; `SectionHeader` gained a **truncating title**; `Row` gained the truncation
  contract **read positionally** (the trailing group keeps its width, everything before it gives
  way); `MetricStrip` gained **track-less labelled rows** after its metrics, which is what the
  `PORTS` row is; and the front ellipsis itself is one rule beside the library's truncation
  contract. The new detail control is the delivered `IconButton`, unchanged. Every one of those is
  additive: a call site that does not ask renders exactly what it rendered (REQ-30).

### The metric strip

- **`Meter` is extended, not duplicated.** Its delivered anatomy is already the mock's:
  `label` at the left, `reading` at the right, a track below (`specs/metric-primitives.md`). Two
  things are added: a **prominent value beside the label** (today the prominent reading sits on the
  right, and the mock puts `0.4%` next to `CPU` with `of 8 cores` right-aligned), and an explicit
  ***no sample* state** — `—`, the stated wording, an **empty** track.
- **The *no sample* state is a third state, not the existing one reused.** `Meter` already draws a
  deliberate "no measurable maximum" treatment instead of an empty track, precisely so an absent
  ceiling cannot read as a broken bar (`plan-ui-coherence-optimisation/REQ-64`). *No sample* is a
  different fact — the ceiling is known, the measurement is missing — and REQ-16 requires the track
  **empty**. Collapsing the two would make an unlimited container look unmeasured.
- **The three-column strip is the one new library component, and it is domain-agnostic.** No
  existing primitive arranges two equal metric columns beside a narrower one, holds the tracks and a
  bar-less column's readings on **one shared baseline**, and stacks to a single column below the
  phone breakpoint. `Grid`'s named arrangements are `pair` and `even-row`, neither of which is this;
  `ContentColumns` answers "how many of these fit", which is a different question. It is created
  under `client/src/ui/metrics/`, knows nothing of Docker, and receives `CPU`, `MEMORY`, `NET I/O`,
  the capacity notes and `in`/`out` as strings from the feature layer. **The alignment down the list
  (REQ-10) is why it must be one component**: it is a property of the arrangement, and a screen
  composing three columns by hand would let them drift with content.

### The values the card shows, and where they come from

- **NET I/O and the CPU capacity are obtainable where the list is built, and cost the daemon
  nothing new.** Established in the source: `sampleOnce` already fetches
  `GET /containers/{id}/stats?stream=false` per running container, and `computeUsage` already reads
  `cpu_stats.online_cpus` — then **discards it** — while the frame's `networks` block is simply not
  read. `memoryLimitBytes` (the mock's `of 31.0GB`) is already carried. So the mock's three new
  values need the **existing frame parsed further**, not a new request, a new endpoint or a new
  daemon capability. The spec's "report before touching anything server-side" clause is therefore
  answered rather than triggered: **nothing new is asked of the daemon**, and the change is confined
  to `SampledUsage` and `ContainerSummary`.
- **Network in/out is a total, summed across interfaces**, which is what `docker stats` shows and
  what `ContainerStatsService` already normalises for the detail panel's Stats tab — the same
  reading, from the same field, so the list and the panel cannot disagree.
- **`sampledAt` belongs to batch 3, not batch 2.** It exists only to answer "is this too old to
  stand behind" (REQ-52), so it arrives with the requirement that reads it rather than as an unused
  field two batches early.

### The gate's mechanism

- **A dedicated held connection, not the existing event stream. This is the decision the spec left
  to the plan, and it went against reuse for a stated reason.** The candidate was
  `GET /api/events/stream` with `subscribeToDaemonEvents`, and it was rejected on its lifecycle:
  that client is **one shared `EventSource` per page, opened on first use and held for the
  application's whole life** (`specs/event-stream-client.md`), because it is the app-wide
  invalidation channel every screen depends on. Counting *it* would make the gate mean **"a browser
  is open"** — which the spec rules out by name (*"A client that is present but showing an unrelated
  section is not a consumer"*, REQ-48), and which is most of the working day. Making it open and
  close per section instead would tear down and rebuild the invalidation channel on **every**
  navigation, with its backlog and `Last-Event-ID` resume, to signal something unrelated to it —
  a regression risk on a certified mechanism this change is not supposed to touch. A second
  connection with a lifecycle of its own is the honest shape.
- **It is nonetheless not new infrastructure, which is what the spec actually asked.**
  `server/src/events/events-routes.ts` is a working, certified demonstration of exactly the property
  needed — a connection held open, per-connection resources released when the socket closes, without
  being told and without the page's cooperation. The new endpoint is a **second instance of that
  pattern** in the module that owns the sampler, not an invention.
- **It lives in the containers module** (`server/src/containers/containers-routes.ts` and a small
  demand registry beside `containers-service.ts`), because the thing being gated is that module's
  sampler. It is named a *subscription to the sampled figures*, not "a containers-screen ping": the
  Dashboard holds one too (REQ-45).
- **The subscription is held by the two consuming screens, and by nothing above them.** Verified in
  `client/src/shell/Shell.tsx`: `DashboardScreen` and `ContainersScreen` are rendered conditionally
  on the active screen id, so a hook called **inside** them mounts and unmounts exactly on a section
  change — the gate's first closing case costs no navigation plumbing. It must **not** be hoisted
  into the Shell beside `useContainers()`, which is called unconditionally and would make the
  subscription mean "the app is open".
- **The tab-hidden case is `visibilitychange`, and that is not the prohibited signal.** REQ-49
  forbids **unload-time** signalling — `beforeunload`, `pagehide`, `unload`, a beacon — because the
  correct outcome must not depend on a page getting a chance to speak. `visibilitychange` is not on
  that path: if it never fires, the connection is simply still held and the keep-alive still governs;
  if the page dies, the socket closes or the keep-alive write fails. It is an optimisation on top of
  a mechanism that is correct without it, which is the opposite of the arrangement the spec bans.
- **The keep-alive write is the server's, every 10 seconds.** A comment frame on each held
  connection, so a socket whose reader has vanished fails and is released rather than lingering
  (REQ-50). Server-side because a client-driven heartbeat is a client-driven stop signal wearing a
  different hat: it stops arriving for the same reasons and the server would still have to notice.

### Staleness, decided once and on the server

- **The staleness bound is applied where the summary is built, not in each consumer.** A sample older
  than **30 seconds** (3 × the interval, REQ-52) is simply **not carried into `ContainerSummary`**,
  so an absent figure reaches both the containers list and the Dashboard by the same route the
  stopped-container case already uses. One place, one rule, and the Dashboard is correct for free
  rather than by remembering to be — which is exactly the regression the spec's "the dashboard loses
  its CPU figure" risk describes.
- **This makes the *no sample* presentation do double duty deliberately.** A stopped container and a
  gate that has been shut for a minute produce the same absence, and the card says the same honest
  thing about both. The card is never asked to distinguish them, and it never shows an age (REQ-53).

### The exception, and how narrow it is made

- **The admission is two literal file paths**, not a directory and not a pattern:
  `client/src/containers/ContainersScreen.tsx` and `client/src/containers/ContainerCard.tsx`. A
  directory-wide admission would silently cover the create form and the detail panel; a pattern would
  admit whatever matched it next. **This pins batch 2's file naming**, deliberately: the exception's
  boundary is a decision taken in batch 1, in the open, not a consequence of where a file later
  happened to land. Batch 1 therefore names a file that does not exist yet, which admits nothing
  until it does.
- **Batch 2 introduces no new component tag for the guard to miss.** Because the material is carried
  by the existing `Card` / `Surface` — tags the pass already refuses — reproducing the containers
  presentation on another screen still fails on sight. Had a new `ObjectCard` tag been created
  instead, the guard would have had to be taught it in the same breath, and forgetting would have
  turned the exception into a bypass by accident. Recorded as a **constraint on batch 2**: if the
  implementer finds a reason to introduce a new card-bearing tag, the guard's `cardRowSurfacesPerItem`
  pass gains that tag name in the same batch.
- **Nothing is silenced.** No exception comment, no marker, no skip. The pass keeps running under
  `npm run lint` and `npm run test -w client`, and the two tests that drive it
  (`client/test/unit/card-row-presentation-retired.test.ts`,
  `client/test/unit/ui-conformance-check.test.ts`) are **extended** to assert that the admission
  fires for the two named files and for nothing else — so the exception is itself guarded.

### Placement, and the artefacts that carry the old decision

- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  the module indexes and `CLAUDE.md`: `client/src/ui/` is the only place in the client allowed CSS
  and raw DOM tags; the containers feature and its data hooks live under `client/src/containers/`
  and `client/src/data/`; the sampler and its endpoint under `server/src/containers/`.
- **Four artefacts carry the 2026-08-16 decision and disagree with the product after batch 2**, and
  all four are amended in batch 1: the analysis itself, its plan folder (requirements, batches,
  closing state), `specs/ui-conformance-check.md`, and `specs/data-table.md` — the last of which
  opens with *"the object list of the whole product, in one presentation"* and names containers as
  one of its lists.
- **Two delivered unit tests assert the containers table by name** and are restated in batch 2, not
  weakened: `client/test/unit/containers-screen.test.tsx`, and
  `client/test/unit/images-containers-table-alignment.test.tsx` — which asserts the containers table
  is laid out identically to the images table, a claim that becomes meaningless for a screen that no
  longer has a table. Its images half stays; its containers half is rewritten as the card's own
  geometry rather than deleted.
- **`client/test/unit/programme-constraints.test.ts` pins the blur half byte-identical** across any
  revision touching the conformance script. Batch 1 edits the card-row half of that file, so the pin
  is checked first: if it is keyed to the whole file rather than to the blur constants it exists to
  protect, it is narrowed to those constants and the narrowing is recorded. REQ-33 is what it is
  guarding, and it must keep guarding it.

## Departures from the spec

**None.** Three points were settled at the requirements gate, all confirmed by the human as
proposed and all narrowing towards the spec rather than away from it:

- **Every published port mapping is shown**, wrapping, none summarised and no `+N more` affordance —
  the spec left "how many fit before the chip must summarise" to this phase, and the answer is
  "all of them", because a cap introduces an element the mock does not draw and hides an identifier
  an operator may be looking for.
- **The 375×812 reflow** stacks the three metric columns at full width and drops the action cluster
  to its own line, each keeping everything it carries. A reduced metric set on the phone was put and
  explicitly rejected.
- **The staleness bound is 30 seconds and the liveness write is every 10** — both inside the spec's
  own stated bounds ("a small multiple of the interval", "a time comparable to the sampling
  interval"), and the 30s was chosen over a more permissive 60s with the reasoning read.

One reading of the spec is recorded rather than acted on, because it could otherwise be mistaken for
a contradiction: the spec calls NET I/O and the capacity denominators *"re-presentations, not new
capability"* and puts server-side change out of scope. They are re-presentations of a **frame the
sampler already fetches**, but they are not present in `ContainerSummary` today, so batch 2 carries
one server-side intervention to widen that shape. No new request is made to the daemon, which is
what the scope boundary was protecting.

## Coverage check

**Every REQ is served by at least one INT, and every INT serves at least one REQ.** Two enabling
interventions are declared as such below; there are no others.

### Every requirement, and where it closes

| REQ | Closes in | Interventions serving it |
| --- | --- | --- |
| REQ-1 | 2 | INT-8 |
| REQ-2 | 2 | INT-3, INT-7 |
| REQ-3 | 2 | INT-7 |
| REQ-4 | 2 | INT-7 |
| REQ-5 | 2 | INT-7 |
| REQ-6 | 2 | INT-5, INT-7 |
| REQ-7 | 2 | INT-4, INT-5, INT-7 |
| REQ-8 | 2 | INT-5, INT-7 |
| REQ-9 | 2 | INT-7 |
| REQ-10 | 2 | INT-5, INT-11 |
| REQ-11 | 2 | INT-7, INT-11 |
| REQ-12 | 2 | INT-7, INT-10 |
| REQ-13 | 2 | INT-1, INT-2, INT-4, INT-7 |
| REQ-14 | 2 | INT-7 |
| REQ-15 | 2 | INT-8, INT-11 |
| REQ-16 | 2 | INT-4, INT-7, INT-11 |
| REQ-17 | 2 | INT-4, INT-5, INT-8 |
| REQ-18 | 2 | INT-3, INT-7 |
| REQ-19 | 2 | INT-7 |
| REQ-20 | 2 | INT-7, INT-10 |
| REQ-21 | 2 | INT-8, INT-10 |
| REQ-22 | 2 | INT-7, INT-11 |
| REQ-23 | 2 | INT-8, INT-10 |
| REQ-24 | 2 | INT-8, INT-10 |
| REQ-25 | 2 | INT-8 |
| REQ-26 | 2 | INT-8, INT-10 |
| REQ-27 | 2 | INT-7, INT-8 |
| REQ-28 | 2 | INT-3 |
| REQ-29 | 2 | INT-3, INT-6 |
| REQ-30 | 2 | INT-3, INT-4, INT-5, INT-6 |
| REQ-31 | 2 | INT-3, INT-5, INT-7, INT-8 |
| REQ-32 | 2 | INT-8, INT-11 |
| REQ-33 | 2 | INT-3, INT-5, INT-8 |
| REQ-34 | 2 | INT-5, INT-7, INT-11 |
| REQ-35 | 2 | INT-7, INT-11 |
| REQ-36 | 2 | INT-8, INT-11 |
| REQ-37 | 2 | INT-10, INT-11 |
| REQ-38 | 2 | INT-9, INT-10, INT-12 |
| REQ-39 | 3 | INT-2, INT-9 |
| REQ-40 | 3 | INT-1, INT-2 |
| REQ-41 | 3 | INT-1, INT-4, INT-9 |
| REQ-42 | 3 | INT-5, INT-6, INT-10 |
| REQ-43 | 3 | INT-5, INT-10 |
| REQ-44 | 3 | INT-1, INT-4, INT-9 |
| REQ-45 | 3 | INT-5, INT-6, INT-7, INT-10 |
| REQ-46 | 3 | INT-1, INT-3 |
| REQ-47 | 3 | INT-1, INT-3, INT-9, INT-10 |
| REQ-48 | 3 | INT-5, INT-6, INT-10 |
| REQ-49 | 3 | INT-5, INT-12 |
| REQ-50 | 3 | INT-3, INT-9 |
| REQ-51 | 3 | INT-1, INT-5, INT-10 |
| REQ-52 | 3 | INT-2, INT-7 |
| REQ-53 | 2 | INT-7 |
| REQ-54 | 3 | INT-1, INT-3, INT-9, INT-10 |
| REQ-55 | 3 | INT-2, INT-10 |
| REQ-56 | 3 | INT-11 |
| REQ-57 | 3 | INT-9 |
| REQ-58 | 3 | INT-1, INT-2, INT-9 |
| REQ-59 | 1 | INT-1, INT-2, INT-3 |
| REQ-60 | 1 | INT-1, INT-2, INT-3 |
| REQ-61 | 1 | INT-1, INT-3, INT-4 |
| REQ-62 | 1 | INT-5, INT-6, INT-7 |
| REQ-63 | 1 | INT-1, INT-2, INT-7 |
| REQ-64 | 4 | INT-2, INT-3, INT-4, INT-5, INT-6, INT-7, INT-8, INT-9, INT-13 |
| REQ-65 | 4 | INT-2, INT-3, INT-4, INT-5, INT-6, INT-7, INT-8, INT-13 |
| REQ-66 | 4 | INT-2, INT-3 |
| REQ-67 | 4 | INT-3, INT-5 |
| REQ-68 | 4 | INT-14 |
| REQ-69 | 4 | INT-9, INT-11 |
| REQ-70 | 4 | INT-1, INT-9, INT-11 |
| REQ-71 | 4 | INT-10 |
| REQ-72 | 4 | INT-11 |
| REQ-73 | 5 | INT-2, INT-3, INT-6 |
| REQ-74 | 5 | INT-1, INT-5 |
| REQ-75 | 5 | INT-1 |
| REQ-76 | 5 | INT-1, INT-2 |
| REQ-77 | 5 | INT-4 |
| REQ-78 | 5 | INT-4, INT-6 |
| REQ-79 | 5 | INT-6 |

**One requirement is completed across two batches and it is declared here.** **REQ-52** (a figure too
old is presented as *no sample*, never as current) **closes in batch 3**: the presentation it falls
back to is built in batch 2 under REQ-16, and batch 3 adds the sample's instant, the 30-second bound
and the decision to withhold the figure. Batch 2 does not close it, and batch 2's card can display an
absent figure honestly without it.

**One requirement moved feature for its batch.** **REQ-53** (no card displays a sample's age) is
written under F2 because it is a decision about the sampling's presentation, but it is observable the
moment the card exists and nothing in batch 3 could make it true or false. It closes in **batch 2**.

### Every intervention, and the requirements it serves

| Batch | INT | REQ served |
| --- | --- | --- |
| 1 | INT-1 | REQ-59, REQ-60, REQ-61, REQ-63 |
| 1 | INT-2 | REQ-59, REQ-60, REQ-63 |
| 1 | INT-3 | REQ-59, REQ-60, REQ-61 |
| 1 | INT-4 | REQ-61 |
| 1 | INT-5 | REQ-62 |
| 1 | INT-6 | REQ-62 |
| 1 | INT-7 | REQ-62, REQ-63 |
| 2 | INT-1 | REQ-13 |
| 2 | INT-2 | REQ-13 |
| 2 | INT-3 | REQ-2, REQ-18, REQ-28, REQ-29, REQ-30, REQ-31, REQ-33 |
| 2 | INT-4 | REQ-7, REQ-13, REQ-16, REQ-17, REQ-30 |
| 2 | INT-5 | REQ-6, REQ-7, REQ-8, REQ-10, REQ-17, REQ-30, REQ-31, REQ-33, REQ-34 |
| 2 | INT-6 | REQ-29, REQ-30 |
| 2 | INT-7 | REQ-2 … REQ-9, REQ-11, REQ-12, REQ-13, REQ-14, REQ-16, REQ-18, REQ-19, REQ-20, REQ-22, REQ-27, REQ-31, REQ-34, REQ-35, REQ-53 |
| 2 | INT-8 | REQ-1, REQ-15, REQ-17, REQ-21, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-31, REQ-32, REQ-33, REQ-36 |
| 2 | INT-9 | REQ-38 |
| 2 | INT-10 | REQ-12, REQ-20, REQ-21, REQ-23, REQ-24, REQ-26, REQ-37, REQ-38 |
| 2 | INT-11 | REQ-10, REQ-11, REQ-15, REQ-16, REQ-22, REQ-32, REQ-34, REQ-35, REQ-36, REQ-37 |
| 2 | INT-12 | REQ-38 |
| 3 | INT-1 | REQ-40, REQ-41, REQ-44, REQ-46, REQ-47, REQ-51, REQ-54, REQ-58 |
| 3 | INT-2 | REQ-39, REQ-40, REQ-52, REQ-55, REQ-58 |
| 3 | INT-3 | REQ-46, REQ-47, REQ-50, REQ-54 |
| 3 | INT-4 | REQ-41, REQ-44 |
| 3 | INT-5 | REQ-42, REQ-43, REQ-45, REQ-48, REQ-49, REQ-51 |
| 3 | INT-6 | REQ-42, REQ-45, REQ-48 |
| 3 | INT-7 | REQ-45, REQ-52 |
| 3 | INT-8 | *(enabling — see below)* |
| 3 | INT-9 | REQ-39, REQ-41, REQ-44, REQ-47, REQ-50, REQ-54, REQ-57, REQ-58 |
| 3 | INT-10 | REQ-42, REQ-43, REQ-45, REQ-47, REQ-48, REQ-51, REQ-54, REQ-55 |
| 3 | INT-11 | REQ-56 |
| 3 | INT-12 | REQ-49 |
| 4 | INT-1 | REQ-70 |
| 4 | INT-2 | REQ-64, REQ-65, REQ-66 |
| 4 | INT-3 | REQ-64, REQ-65, REQ-66, REQ-67 |
| 4 | INT-4 | REQ-64, REQ-65 |
| 4 | INT-5 | REQ-64, REQ-65, REQ-67 |
| 4 | INT-6 | REQ-64, REQ-65 |
| 4 | INT-7 | REQ-64, REQ-65 |
| 4 | INT-8 | REQ-64, REQ-65 |
| 4 | INT-9 | REQ-69, REQ-70 |
| 4 | INT-10 | REQ-71 |
| 4 | INT-11 | REQ-69, REQ-70, REQ-72 |
| 4 | INT-12 | *(enabling — see below)* |
| 4 | INT-13 | REQ-64, REQ-65 |
| 4 | INT-14 | REQ-66, REQ-68 |
| 5 | INT-1 | REQ-74, REQ-75, REQ-76 |
| 5 | INT-2 | REQ-73, REQ-76 |
| 5 | INT-3 | REQ-73 |
| 5 | INT-4 | REQ-77, REQ-78 |
| 5 | INT-5 | REQ-74 |
| 5 | INT-6 | REQ-73, REQ-78, REQ-79 |
| 5 | INT-7 | *(enabling — see below)* |

**Two enabling interventions, declared as such**, and no others:

- **Batch 2 / INT-6** and **batch 3 / INT-8** are the module-index and component-spec updates for
  what their batches add. They close no behaviour of their own; they are what keeps the next reader
  of `.sdd/modules/` from being lied to. INT-6 is credited against REQ-29/REQ-30 because the "one
  place in the library defines the card's material" claim is only checkable if the record says where
  that place is; INT-8 is credited against nothing and is declared enabling.

**Notes on the shape of the mapping**, all deliberate:

- **Batch 2's INT-7 is dense on purpose.** One component renders the mock, so most of the element-map
  requirements land on it. A mapping that spread them across files would mean the card had been built
  out of pieces each owning part of its arrangement — which is exactly how REQ-10's alignment down
  the list gets lost.
- **REQ-55 and REQ-56 are requirements batch 3 can only fail.** Nothing is built for them: they hold
  because INT-2 changes one constant and one loop's ownership and touches neither
  `use-containers.ts` nor `container-stats-service.ts`. Each still gets a check (INT-10, INT-11)
  because "we did not touch it" is not an observation anyone can make in six months.
- **REQ-57 hangs on INT-9 alone, and that is the spec's central demand.** The reduction is a
  **measured count of requests reaching the daemon**, not an observation of the screen — the spec's
  most-probable-failure risk is a gate built in the client that looks right and removes no call.
- **REQ-37's two rules are written into INT-10 and INT-11 because coverage that ignored them passed
  a shipped defect twice**: a real pointer at the visible control's own coordinates, and assertions
  on measured viewport boxes rather than on text.

## Risks carried forward

- **The card list gives up `DataTable`'s virtualisation, and this is the largest technical
  consequence of batch 2.** The table mounts only the rows in and around the visible window
  (`plan-docker_management_app/REQ-109`); a `Stack` of cards mounts every card. Fixed-height
  virtualisation is **not available** here: a card's height depends on its content — the ports chip
  wraps to as many lines as the container publishes mappings, and the whole card reflows at narrow
  widths — and `DataTable` itself refuses to virtualise in exactly that mode (`autoRowHeight`).
  Accepted, because the alternative is a measured-height virtualiser that does not exist in this
  library and would be a far larger change than the one asked for. REQ-32 is therefore verified as
  **measured scroll smoothness at a realistic container count**, not as an unbounded promise, and
  the spec has already named the remedy if the screen proves unworkable at scale: a density decision
  on this presentation, never a return to the table. **This is the first thing to re-open if a host
  with dozens of containers scrolls badly.** Put to the human at the coverage gate on 2026-08-25 —
  including that the "show every published mapping, wrapping, none summarised" decision they took at
  the requirements gate is what makes a card's height content-dependent and therefore rules out
  fixed-height virtualisation — and **accepted as this batch's carried risk**, rather than revisiting
  the ports cap or the card's density.

  **Re-read 2026-08-25, after the delivered list became a grid of three cards to a row: the risk
  stands, and it is smaller than it was.** It was written about a vertical stack, and two of the
  three things that made it worrying have changed. The list is now **a third as many rows** for the
  same container count, so the same number of unvirtualised cards spans a third of the scroll length
  — the exposure is divided by the track count, and at ≤1200px by two. And the human **did** revisit
  the ports cap, in the other direction from the one this paragraph anticipated: three chips and a
  `+n` (REQ-5, as reversed) removes the unbounded contribution to a card's height, which is exactly
  the input the paragraph named as ruling out fixed-height virtualisation.

  What has **not** changed, and is why nothing is withdrawn: a card's height still follows its
  content (a long name, a long status sentence, a card with no sample against one with three
  readings), nothing is virtualised, and every card is still mounted. Fixed-height virtualisation
  remains unavailable — the cap narrows the spread of heights, it does not make them one value — and
  the grid adds a small cost of its own that the stack did not have: **every card of a row is laid
  out to the height of the tallest of them**, so one card's content still sizes its two neighbours.
  REQ-32 is verified the same way, as measured smoothness at a realistic container count, and the
  named remedy is unchanged: a density decision on this presentation, never a return to the table.
- **The consumer count drifts upward and nothing on screen says so.** The spec names it as the most
  likely single defect of the whole change, and it is invisible: the interface looks perfect while
  the daemon is sampled for ever. INT-9's up-and-down cycling with a daemon-side count is the only
  thing that can see it, and it must include the routes that send no notice — a destroyed connection,
  not only a closed one.
- **`visibilitychange` will look like a place to add a `pagehide` beside it.** It is the same shape
  of event and the same file, and adding one would move the correct outcome onto the path the spec
  forbids. INT-12 is a text-level guard, which is a weak defence against someone who means it; the
  reason is recorded in the requirement, not only in the code.
- **The keep-alive interval and the staleness bound interact.** A connection discovered dead after
  ~10s, plus a 30s staleness bound, means a card can go to *no sample* while sampling has in fact
  been running for another consumer. That is honest — the figure genuinely was not refreshed for
  that container — but it is the kind of thing that reads as a bug during a demonstration. Both are
  single constants and retunable in one place each.
- **The mock is a desktop image, and the phone arrangement is a decision rather than a reading.**
  The 375×812 reflow was settled at the requirements gate, not derived from the image, so it is the
  part of REQ-11 that the image cannot adjudicate. If the human dislikes it on sight, it is a change
  to the strip's stacking and the band's wrapping, both in one place each.
- **The bare status dot may have no library affordance.** The mock draws a dot, then the name, then a
  separate pill; the library's `StatusPill` is a dot **with** a label and `StatusDotCell` is a table
  cell. Batch 2's implementer may find that composing the identity band needs one of them extended.
  Named here so it is a recorded extension under REQ-30 rather than a raw element in feature code.
- **`images-containers-table-alignment.test.tsx` is a certified check whose subject half disappears.**
  Rewriting it is the moment the "restated, not neutered" rule (REQ-38) is most likely to be broken,
  because deleting the containers half would make it pass immediately.
- **Ten seconds will be reported as "the metrics froze"** before it is reported as a cadence, on a
  screen whose most eye-catching band is now the metrics. The prompt sample on re-entry (REQ-51) and
  the honest *no sample* state are the whole defence; if either is skipped, the interval will be
  blamed for a defect that is not in it.
- **The exception's two admitted paths are a string list in a build script.** Renaming or moving
  either file silently removes the admission — the build then fails loudly, which is the good
  direction, but the fix will look like "add the new path" rather than "decide the exception again".

## Appended on 2026-08-31 — batch 4, a check that declares a patience it cannot spend

**Why there is a fourth batch.** `client/e2e/containers-card-geometry.spec.ts` — batch 2's own
coverage — died on `Test timeout of 30000ms exceeded` in the run of 2026-08-31. The defect is in the
check: one of its steps declares 40 seconds inside a test that has 30. Six more files in
`client/e2e/` declare the same kind of impossible patience. The reason, the count and the perimeter
are in `requirements.md` under *Appended on 2026-08-31*, and the batch is
`batches/batch-check-budgets-fit-the-test.md`.

**Nothing above this line was changed**, beyond the one row added to the batch table and the coverage
rows for REQ-64 to REQ-72 and for batch 4's interventions. Batches 1, 2 and 3 stay certified and keep
their requirements word for word.

**Execution order: after 3, and the dependency is real.** The step budgets batch 4 writes are derived
from the 10-second sampling cadence and the *no sample* presentation that batches 2 and 3 established
(REQ-16, REQ-39, REQ-52). Derived from a 3-second sampler they would be different numbers. Batch 4
does not touch what those batches built.

**No product source changes** (REQ-68). Nothing under `client/src/` or `server/src/` moves. The
sampling interval is a certified decision and stays as it is. If a later phase concludes the product
should change, that is a finding to report, not something to fold in here.

### Assumptions and decisions of batch 4

- **The class is repaired, not only the case that died.** The dead test is not special among its
  siblings: `openNarrowedTo` declares 40 seconds of patience in every one of the file's twelve tests.
  Only the live-update poll happened to be large enough to run out first.
- **A guard is built, and it refuses one thing only** — a step budget strictly greater than its
  test's. It does not add budgets up: deciding which worst cases can occur together is beyond it, and
  a guard that refuses correct code becomes a formality. Its three limits are written in the batch and
  in its own header.
- **`openApp` (`client/e2e/support/fixtures.ts:81`) declares 30 seconds — the default budget itself —
  and is deliberately left alone.** It is the widest instance of the class: every test in the suite
  calls it. 562 tests would have to move, or one shared helper would have to be given a smaller
  patience that nobody has measured. The guard's rule admits it, and it is on the tech-debt register
  as `open-app-retries-for-a-whole-test-budget` rather than hidden in an allow-list. **This is the
  first thing to re-open if the human wants the class closed completely.**
- **A ceiling nobody measured is not lowered.** For a `docker build`, a filesystem extraction or a
  compose project brought up, the step keeps the patience it has and the test declares a budget that
  can hold it. Lowering those to look tidy would be the tuning this batch exists to refuse — at the
  price of one test that declares 360 seconds, which is what the file already permits itself.
- **The guard and its rule get a module of their own.** The rule belongs to no product area.
  `list-order` is the exact precedent: a rule that is a rule, indexed together with the build check
  that keeps it true.

### Coverage check for batch 4

Every one of REQ-64 to REQ-72 is served by at least one intervention, and every intervention of batch
4 serves at least one requirement, except the one declared enabling below. Each of the nine closes in
batch 4; none is spread across batches.

**REQ-68 is an absence, and what serves it is a record rather than a mechanism.** Nothing can be
built to make an absence true. What is checkable is `git diff` over `client/src/` and `server/src/`
at the end of the batch — empty, and stated in the report
([[a-neutralisation-is-undone-before-delivery]]). INT-14 is what carries the prohibition forward: it
writes the reason into the header of the file whose reader is the one who will be tempted to change
the cadence.

**A third enabling intervention, and the paragraph above did not know about it.** *"Two enabling
interventions, declared as such, and no others"* was written for batches 1 to 3 and still describes
them. Batch 4 adds a third: **INT-12**, the module index row and the guard's component spec. It
closes no behaviour of its own; it is what keeps the next reader of `.sdd/modules/` from meeting a
build check that no index names.

### Risks carried forward by batch 4

- **A guard that refuses only what is impossible on its face will be mistaken for one that checks the
  arithmetic.** It does not. A test whose steps sum to more than it has passes it. The written count
  beside each budget is the only thing that catches that, and a count nobody reads decays.
- **The budgets that go up make a hung test slower to report.** A test that hangs in
  `filesystem-browser.spec.ts` now takes six minutes to say so instead of thirty seconds. Accepted:
  the alternative is a declaration that lies about what the test allows.
- **`openApp` stays on the line.** Anything that makes the default budget smaller, or that makes
  `openApp` slower, turns 562 passing tests into the same defect at once.

## Appended on 2026-08-31 (second) — batch 5, a check that writes inside the tree the others read

**Why there is a fifth batch.** `npm run test -w client` failed on its first run and passed on its
second, with `ENOENT … client/src/__conformance-fixture__/body-row-gap.css` in
`no-unload-signalling.test.ts`. The conformance check writes its bait sources **inside `client/src`**
while other checks walk that tree. The census, the roads and the reproduction are in
`batches/batch-checks-do-not-write-in-the-tree-they-read.md`; the requirements are in
`requirements.md` under *Appended on 2026-08-31 (second)*.

**Nothing above this line was changed**, beyond the one row added to the batch table and the coverage
rows for REQ-73 to REQ-79 and for batch 5's interventions. Batches 1, 2 and 3 stay certified; batch 4
keeps its requirements, its interventions and its acceptance word for word.

**Execution order: after 4, and the dependency is one of sequence, not of content.** The two batches
touch different trees — batch 4 `client/e2e/`, batch 5 `client/scripts/` and `client/test/unit/` —
and neither needs the other to be correct. Batch 5 is placed after it because batch 4 is already
written and appended, and because both give a check the tree to scan as an argument: doing them in
this order means batch 5 adopts a form batch 4 has already established rather than inventing a second
one.

### Assumptions and decisions of batch 5

- **The cause is removed, not defended against.** A temporary directory created inside the tree every
  check reads is the defect; skipping it by name is a cure each new scan must copy for ever, and the
  copies have already decayed twice (`modal-close-control.test.tsx` defends one of its two scans;
  `programme-constraints.test.ts` still calls itself one of *"the three other scans"* when there are
  eight).
- **The census was verified file by file, and it corrects the grep.** Nine exposed scans in nine
  files, not ten: `dialog-one-form` and `section-header-one-treatment` walk `client/src/ui/` only, and
  the ninth exposed scan is the *second* scan of a file that was counted among the defenders.
- **No new build check is added, unlike batch 4, and that is a decision.** Batch 4 built a guard
  because it repaired 23 instances written over months and had to catch the twenty-fourth. Here there
  is exactly one writer, and after the change nothing has a reason to write inside a scanned tree: the
  script takes the tree to scan as an argument, so a check needing a tree of its own asks for one. A
  static guard would have to decide, from the text of a call, whether a written path resolves inside
  `client/src` — and it would fire on the batch's own throwaway root, whose path also ends in `src`. A
  guard that reports the correct code is the guard batch 4 refused to build.
- **The eight name-skips are removed rather than left standing.** They become useless, not wrong. They
  are removed because a defence against something that cannot happen reads as permission for it to
  happen again — and because the set of files each scan covers is unchanged, the skipped directory
  never existing in any run.
- **The blur half of the conformance script is not touched, and the variable `clientRoot` keeps its
  name.** `programme-constraints.test.ts` pins six declarations of that script byte-identical at every
  revision, and one of them reads `clientRoot`. INT-1 changes what that name resolves to, never the
  name, so the pin passes untouched — the strongest available evidence that the blur policy did not
  move.

### Coverage check for batch 5

Every one of REQ-73 to REQ-79 is served by at least one intervention, and every intervention of batch
5 serves at least one requirement, except the one declared enabling below. All seven close in batch 5;
none is spread across batches.

**REQ-78 and REQ-79 are absences, and what serves them is a record.** Nothing can be built to make an
absence true: the checks are `git diff` over the two source trees, and a search for a `catch` around a
scan's read. INT-4 is where the absence is observable (the eight files are edited, and the edit is a
removal), and INT-6 is what carries the prohibition forward, in the header of the file whose reader is
the one who will be tempted to make a scan tolerant instead.

**A fourth enabling intervention.** **Batch 5 / INT-7** amends the conformance check's component spec
with the scanned root and its default. It closes no behaviour of its own; without it the spec would
describe an invocation the script no longer has.

### Risks carried forward by batch 5

- **The check that fails after the commit, not before it.** `programme-constraints.test.ts`'s hunk
  rule reads committed revisions, so INT-1's edit passes locally and fails on the next run. INT-5 is
  what prevents it, and it must land in the same commit as INT-1.
- **The bait directory keeps its name, inside the throwaway root**, so that the messages the check's
  own cases match stay as they are — which is what makes *"it protects exactly what it protected"*
  legible in the diff. The cost: a reader grepping the name still finds it, and has to notice it is no
  longer under `client/src`.
- **`client/.card-row-sandbox` disappears with the fixture directory.** It never sat inside a scanned
  tree, so it caused nothing; it is folded in because it is the same mechanism, and it needed the
  script copied only because the script had no root argument. Two mechanisms become one, and a diff
  that leaves the sandbox standing has done half the batch.
- **The nine exposed scans are repaired by nothing being done to them.** That is the point, and it is
  also what makes the batch easy to under-deliver: if the baits are merely moved to another directory
  inside `client/src`, every observation still passes for a while and the class is intact.
