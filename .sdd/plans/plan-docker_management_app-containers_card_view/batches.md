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
| 2 · containers-card-view | F1 — The containers list presents one card per container | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-26, REQ-27, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36, REQ-37, REQ-38, REQ-53 | 1 | implemented | Open Containers with a running container, a paused one and a stopped one of your own making. The table is **gone** — no header row, no hairline rules, no single surface around the list — and in its place a **grid of cards**, one per container, **three to a row** (two at ≤1200px, one below the phone breakpoint), evenly gapped, and **the same width whatever the state** (the mock's third card only *looks* narrower; check its right edge against the others). The cards of a row are all as tall as the tallest of them; **rows may differ from each other**, which is the arrangement decided and not a defect. Read one card against `.sdd/analysis/ui-mock/containers-refactor.png` band by band — **the mock draws one card at full width with the three metrics side by side, and on those two points the delivery deliberately departs from it** (see the amendment note at the end of this cell); everything else in the image is normative and is what you are checking: the accent bar down the left edge in the state's colour, following the corner; then dot · **name** · uppercase pill · short id in monospace, with `Stop` / `Resume` / `Start` at the right, a gap, then `Pause` · `Restart` · `…` joined into one cluster with dividers, ending flush at the inner right edge; then the `image` chip, the ports chip (**only** where ports are published; publish four and see four, publish seven and see **three chips and a `+4`**), then the status sentence; then `CPU`, `MEMORY` and `NET I/O` **stacked one per row**, each label small, uppercase and muted, each capacity note (`of 8 cores`, `of 31.0GB`) right-aligned to its own metric's right edge, a track under each of the first two, and under `NET I/O` an `in` and an `out` reading on the tracks' own line and **no bar**. Scroll the list: within a row the metrics are at the **same x on every card**, and down each column of the grid they line up too. Every value the old row showed is still there — put the two side by side against the previous build if in doubt. Watch a container you have just started: the numbers and the bars **step** in place, the card does not move, the list does not reorder, no other card flickers, and nothing is tweened. The stopped container reads `—`, its capacity note replaced by the *no sample* wording, its track empty — plainly different from the paused one sitting at `0.0%` with its capacity note intact. Pause a container: the bar fills amber, the pill, dot and accent all agree, and nothing shows two states. Click a card: the detail panel opens **beneath that card's row**, spanning the whole row, with its seven tabs unchanged; click again: it closes. The toolbar, the search, the state chips, the empty state, the rename, the overflow menu and its four entries, the confirmations and every string are exactly as before — a disabled `Pause` on the stopped card is **present and dimmed**, not missing, and still says why. Squeeze to 375×812: the grid drops to one card per row and the metrics are stacked as they already were, each keeping its label, value, capacity note and track; the action cluster drops to its own line keeping its order; nothing is clipped, nothing needs a sideways drag, and **no value is missing that the desktop shows**. Look at the card sitting over the lightest part of the background: the muted text, the ids, the dimmed controls and the tracks are all still readable. `npm run lint` (the widened guard admitting these two files and no other), `npm run test:typecheck -w client`, `npm run test -w client` and `npm run test -w server` pass; the batch's own e2e specs pass, and so do the restated `client/e2e/containers.spec.ts` and the amended `client/test/unit/containers-screen.test.tsx` and `images-containers-table-alignment.test.tsx`. **Amended 2026-08-25, after the human saw the batch running.** This cell described a stack of full-width cards; it now describes the grid that was delivered instead. **Three to a row, against the mock**, with the metrics stacked: the full-width card spread its three metric columns across roughly 1000px, a void through the middle with `NET I/O` against the right edge, so the human changed it on the running product and accepted the result. **Cards equal in height per row, rows unequal to each other**: a fixed height for every card on the screen was offered and refused, no minimum height is imposed. **The ports decision is reversed by the human who took it**: three chips and a `+n` instead of every mapping wrapping, because at a third of the page one container's port list set the height of every card beside it; the split is at four, so a `+1` is never drawn. **And one real defect was found and fixed at its source**: the daemon reports a port published on both IP stacks twice, identical once the host IP is dropped, which gave the card duplicate React keys and made the chips accumulate in the DOM on every poll (4 ports measured at 57 chips). `summaryPorts` in `server/src/containers/containers-service.ts` now reports each mapping once — so publish a port, leave the list open through several polls, and the chips must not multiply. Recorded in the analysis's *Amendment — 2026-08-25: three cards to a row, against the mock* and annotated on REQ-1, REQ-5, REQ-6, REQ-9, REQ-10, REQ-11, REQ-12, REQ-23, REQ-32 and REQ-34. |
| 3 · stats-sampling-gate | F2 — The per-container sampling runs at 10 seconds and only while somebody is consuming it | REQ-39, REQ-40, REQ-41, REQ-42, REQ-43, REQ-44, REQ-45, REQ-46, REQ-47, REQ-48, REQ-49, REQ-50, REQ-51, REQ-52, REQ-54, REQ-55, REQ-56, REQ-57, REQ-58 | 2 | todo | This one is verified at the daemon, not on the screen. Start the product, connect **no browser at all**, and watch what the daemon is asked (`docker events`, a daemon log, or the batch's own measured check): **nothing**. Zero stats requests, indefinitely. Now open the interface on Containers: sampling starts, and the cards get a figure **promptly** — not after ten seconds of dashes. Time two consecutive updates: **ten seconds**, not three. Move to Images: the daemon goes quiet within one interval. Go to the **Dashboard**: it starts again, and the Dashboard's CPU reading is alive — it did not lose its figure to this change, which is the regression to look for hardest. Switch to another tab in the browser: quiet. Come back: a figure promptly. Open a **second tab** on Containers: still one sampling cadence, not two. Close one: sampling continues for the other. Close both: quiet. Now the routes that send no notice — **kill the browser process**, and separately pull the network (turn Wi-Fi off with the tab open): within about a sampling interval the server discovers it and goes quiet on its own, having been told nothing. Do that whole cycle a dozen times and confirm the daemon goes quiet **every** time: a count that drifts upward is invisible from the interface and is the failure mode of this design. Leave the screen for several minutes and return: the cards show the *no sample* state for the gap, **not** the numbers from before you left presented as current, and no card anywhere shows how old a figure is. Confirm what did **not** change: the list still reflects a container started from a terminal within about three seconds (the list poll is untouched), and a container's detail panel → Stats tab still streams at its own rate with its own five readings, opening and closing with the panel. Search the client for `beforeunload`, `pagehide`, `unload` and `sendBeacon`: **none**, and the batch's own guard fails if one appears. `npm run lint`, `npm run test -w client`, `npm run test -w server` and the batch's own e2e and server checks pass. |

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
