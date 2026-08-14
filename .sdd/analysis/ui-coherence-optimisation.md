# UI coherence and usability optimisation

Business analysis of a single request: make the application's screens visually better, mutually
coherent, and more usable.

The findings below come from driving the running product (single-process build, `localhost:3000`)
screen by screen at 1440×1000, 1280×800 and 375×812, opening every row-level detail panel, and
measuring the DOM where the eye is not a reliable instrument. Every defect states how it was
observed. Where a root cause was traced to a file, the file is named.

The mockups under `.sdd/analysis/ui-mock/` were **not** used as the reference: they are a generated
visual sketch, not a specification. The judgement below is made against the product itself.

---

## 1. The governing observation

> **Corrected after planning.** This section first said the library lacked the layer above the
> material, and that the nine non-`DataTable` screens hand-built their lists out of raw surfaces.
> Both were wrong, and verified so against the source. The observations in sections 2–5 stand
> unchanged; the diagnosis below replaces the original. The correction matters because the original
> wording would send an implementer to *build* four components that already exist.

The application has **thirteen screens and no shared rule about which library component answers
which question**.

The material layer is consistent — one background, one radius family, one type scale, one set of
colours. The layer above it is not missing either: `SectionHeader` (47 feature call sites),
`EmptyState` (49), `ActionButtonGroup` (10), `DetailPanel` (2) and `ScreenToolbar` (2) all exist and
are exported. What is absent is any decision about *when* each is used, and how completely.

The incoherence therefore has two sources, and neither is a missing component.

**A list has two library answers, not one.** `DataTable` serves containers, images, dashboard and
coverage. `CardList` serves the rest — 17 call sites across 11 files (volumes, networks, registries,
builders, build cache, contexts, plugins, all four swarm panels) — and `GroupedRowsPanel` serves
compose (`ComposeScreen.tsx:208`). Two list components with different capabilities: column
alignment, selection and truncation discipline exist on the first and not the second. Note also that
`images/LayerEfficiencyView.tsx` is a `CardList` call site *on a `DataTable` screen* — so the split
does not even follow screen boundaries.

**The shared components have no opinion, so their appearance varies with how completely each caller
fills them in.** `EmptyState` is the clearest case: compose passes only a `title`
(`ComposeScreen.tsx:212`), plugins passes `title` plus a `description` that is usually absent
(`PluginsScreen.tsx:259`), and the component renders whatever subset it is given, on no surface of
its own. That is why the same component reads as bare floating text on one screen and as a composed
empty state on another. The screens did not improvise; the component declined to insist.

That is the whole of the incoherence. It cannot be fixed by restyling screens one at a time — that
would produce thirteen new answers — and it must not be fixed by adding new primitives beside the
existing ones, which would produce a fifth answer per question. It is fixed by giving the components
that already exist an opinion, retiring the duplicate list component, and migrating the call sites.

---

## 2. Blocking defects

These are not matters of taste. Each one denies the operator a function of the product.

### 2.1 Three navigation destinations are unreachable on a standard laptop

At a 1280×800 viewport — the most common laptop size there is — the navigation rail renders
thirteen entries into a space that fits ten, and the active-context card is painted over the
remainder.

Measured, with the entries' own viewport boxes and a hit test at each entry's centre:

| Entry | Box (y) | Reachable | What is actually painted there |
|---|---|---|---|
| System & prune | 674–716 | no | `ui-footer-status` |
| Raw console | 761–803 | no | `ui-frame` (clipped) |
| About | 807–849 | no | nothing — below the viewport |

Confirmed by interaction, not only by measurement: a **real pointer click at the About entry's own
coordinates** (1440×900, where About is also covered) left the application on the screen it was
already showing. The click does not reach the control.

Root cause, and it is one line's worth: `.ui-nav-rail` is `overflow-y: visible` and does not scroll.
The nav list is top-anchored with an intrinsic height of ~849px regardless of viewport, while the
footer card is bottom-anchored. Below roughly 964px of viewport height the two overlap, and because
nothing scrolls and nothing clips, they simply paint over each other. Above ~1000px the opposite
symptom appears: a large dead gap opens between the last entry and the footer card.

The same construction is used by the phone drawer, where the list measures 810px against an 812px
viewport — it fits on the test device by two pixels and fails on anything shorter.

**Severity: highest.** Two whole screens (Raw console, About) are unreachable on a common window
size, with no error and no other route to them.

### 2.2 List rows collapse to nothing below the desktop breakpoint

At 375×812 the containers list renders a row containing a status dot and four buttons. The container
name, image, CPU, memory, ports and uptime are absent from the picture — they are in the DOM, at zero
width.

The row's computed grid, measured:

```
grid-template-columns: 20px 0px 0px 0px 0px 0px 0px 296px
```

Six of eight tracks are zero. The dot keeps 20px; the action cluster keeps 296px and consumes the
row.

Three library-level causes compound:

- columns default to `1fr` ([`DataTable.tsx:88`](../../client/src/ui/data/DataTable.tsx)), which under
  width pressure is free to shrink to zero;
- `.ui-data-table__cell { min-width: 0 }`
  ([`data-table.css:66`](../../client/src/ui/data/data-table.css)) removes the automatic minimum that
  would otherwise have forced an overflow;
- `.ui-data-table__row { overflow: hidden }`
  ([`data-table.css:47`](../../client/src/ui/data/data-table.css)) then clips the overflow *inside*
  the row, so the enclosing `ScrollArea` — which is `overflow-x: auto` and exists precisely to scroll
  it — measures `scrollWidth === clientWidth` and never offers a scrollbar.

The row therefore cannot show its content, and cannot be scrolled to reveal it. Every `DataTable`
screen inherits this.

**Severity: highest.** The primary list of the product is unreadable below the breakpoint.

### 2.3 The header Search control does nothing

Every screen's header carries a `⌘K Search` button. It is an enabled `ui-button--ghost` with **no
`onClick`** ([`Shell.tsx:218`](../../client/src/shell/Shell.tsx)), and there is no keyboard handler
for `⌘K` — or for any key — anywhere in the client. Verified by real pointer clicks on two different
screens, by the keystroke itself, and then in source.

So the control is inert and the `⌘K` badge advertises a shortcut that was never built. It is
displayed on all thirteen screens.

**Severity: high.** A dead control in the permanent header teaches the operator to distrust the
interface, and a keyboard hint that does nothing is worse than no hint.

### 2.4 Text collides with adjacent values in three screens

Long identifiers are laid beside trailing metadata with no truncation contract, so they overlap:

- **Volumes** — the volume's mount path runs under the size, rendering as
  `…c758d3…0B_2b`;
- **System & prune** — the "Unused volumes" hash runs under both the size and the Prune button;
- **Contexts** — the endpoint `unix:///Users/…/.docker/run/docker.sock` runs under the `active` pill.

One shared cause: a flexible text placed next to trailing meta without `min-width: 0` and
`text-overflow: ellipsis` on the text, and without `flex-shrink: 0` on the meta. Docker identifiers
are 64-character hashes; this is the normal case, not an edge case.

**Severity: high.** Illegible output, on the values the operator most needs to read exactly.

---

## 3. Incoherence between screens

Each row below is a question every screen had to answer, and the number of different answers now
shipping.

### 3.1 How an object is listed — 4 answers

| Pattern | Component | Screens |
|---|---|---|
| Aligned columns, header row, inline expansion | `DataTable` | containers, images, dashboard, coverage |
| Stacked cards, per-call-site internal layout | `CardList` | volumes, networks, registries, builders, build cache, contexts, plugins, all four swarm panels — and `LayerEfficiencyView` on images |
| Grouped rows with a selected group | `GroupedRowsPanel` | compose |

Corrected after planning: these are three library components, not four hand-built layouts. The
consequence is unchanged and is not merely visual — column alignment, sorting, keyboard traversal,
selection and truncation discipline exist on `DataTable` and on neither of the others. What varies
between `CardList` screens is what each call site passes it, since it fixes little about its rows.

### 3.2 Where actions live — 6 answers

- inline button group in the row (containers: `Stop Pause Restart …`)
- overflow menu only (images: `…`)
- action buttons in the *card header*, page-level actions absent (volumes, networks, builders)
- one trailing button per row (registries: `Log in` / `Log out`)
- bare text acting as a control (`use` on contexts, `+ Attach` on networks, `Add variable` and
  `Add port mapping` in dialogs)
- a mixed cluster of pill + plain text + button in one line (builders:
  `running` · `cache 14.6MB` · `in use` · `Remove`)

A control's appearance no longer predicts that it is a control.

### 3.3 Where the screen's toolbar lives — 3 answers

Page-level toolbar under the header (containers, images); per-card header actions (volumes, networks,
builders, contexts); nothing at all (compose, swarm, plugins).

### 3.4 How detail is revealed — 3 answers

- **containers**: full-width inline expansion, tabbed (Logs, Stats, Config, Processes, Inspect, Exec,
  Attach), two-column property grid
- **images**: full-width inline expansion, untabbed, two-column property grid, collapsible sections
- **volumes / networks**: expansion *inside the narrow card column*, forced to one column. Values wrap
  mid-hash, and the `RAW PAYLOAD` JSON block is rendered into roughly 250px, where it is unreadable.

Two independent panels can also be open at once on volumes & networks, giving the screen two parallel
long scrolls.

Property alignment is inconsistent within the pattern too: on networks, the `Options` value is
right-aligned while every other value in the product is left-aligned.

### 3.5 What "nothing here" looks like — 3 appearances of one component

Corrected after planning: all three are `EmptyState`. It renders whatever subset of title,
description and action the caller supplies, on no surface of its own, so its appearance tracks how
completely each call site fills it in rather than any decision made per screen.

- **bare text on no surface**: compose (`No compose projects`) and plugins (`No daemon plugins`) —
  floating in the layout with no card, no title treatment, no suggested action
- **a proper empty state**: registries (`Search Docker Hub` + an explanatory line)
- **the same paragraph five times**: swarm shows `No cluster to read — This daemon is not part of a
  swarm. Initialise a swarm or join an existing one to see its nodes, services, stacks, secrets and
  configs.` in four cards simultaneously, above which a banner already says `Swarm inactive · not part
  of a swarm` with the two actions. Five statements of one fact, and the actions that would resolve it
  are in the banner, not in the empty states.

Swarm additionally misaligns its bottom row: `Configs & stacks` carries a `CONFIGS` sublabel that
`Secrets` does not, so the two empty states in that row sit at different heights.

### 3.6 How a section is titled — 4 answers

Uppercase micro-caps *outside* a card (`IDENTITY AND LICENSE`); sentence case *inside* a card
(`CLI availability`); uppercase *inside* a card (`DAEMON EVENT STREAM`) — all three on the About
screen alone. Plus uppercase micro-caps field labels in dialogs (`IMAGE`, `ENTRYPOINT`, `COMMAND`).

### 3.7 Selection

A checkbox column with bulk selection exists on **images only**. Containers — where bulk stop, bulk
remove and bulk restart are the obvious operations — has none.

---

## 4. Information hygiene

The screens show the same fact more than once, and occasionally contradict themselves.

- **Images list**: the `REPOSITORY:TAG` column and the `TAGS` column carry the identical string on
  every row (`alpine:3.20` beside a pill reading `alpine:3.20`).
- **Image detail**: `Id` and `Digest` display the same value.
- **Image size contradiction**: the row's `SIZE` column reads `13.0MB` where the panel's `Size` field
  reads `3.9MB`. Two numbers under one word, with nothing distinguishing them.
- **Builders**: the builder's name appears as the row title *and* again as a third line of the same
  row.
- **Daemon properties duplicated across screens**: `Daemon info` (System & prune) and `Daemon of
  active context` (Contexts) list the same eight properties.
- **Event stream duplicated across screens**: the `DAEMON EVENT STREAM` on About repeats the
  Dashboard's stream verbatim.
- **Two controls, one destination**: the header `Console` button calls `selectScreen('raw-console')`
  ([`Shell.tsx:221`](../../client/src/shell/Shell.tsx)) — the same destination as the `Raw console`
  nav entry, presented as a different kind of thing.
- **Empty sections still drawn**: image and container panels render a collapsible `Labels` section
  with a count of `0`.

---

## 5. Density, rhythm and alignment

- **Container logs toolbar** — three stacked control rows (stdout/stderr, timestamps, line count,
  since, until; then filter with previous/next; then `Download` alone on a third row, right-aligned).
  The heaviest toolbar in the product sits inside an expanded row, and one row of it holds a single
  button.
- **Container stats** — five metric tiles in a four-column grid, leaving `PIDS` orphaned on a second
  row. The first two tiles carry a progress bar; the others do not.
- **Plugins** — the `enabled` pill is not column-aligned. It is positioned relative to the version
  string, so a longer version (`v0.36.0-desktop.1`) pushes that row's pill left of its neighbours.
  The column reads as ragged.
- **Dashboard** — the two cards of the middle row (`Container activity`, `Disk usage`) have unequal
  heights, leaving a ragged bottom edge. The disk-usage bars use two hues with no legend, and rows
  whose value is `0B` show no bar at all, so the reader cannot tell "zero" from "not measured".
- **Registries** — `authenticated · credential store: desktop` wraps to two lines while
  `not authenticated` occupies one, so card heights alternate down the column.
- **Raw console** — the daemon payload renders as an unwrapped wall of JSON that breaks mid-token.
- **Dialogs** — each field group is its own nested sub-card, which in a narrow dialog produces a long
  vertical scroll of boxes inside boxes.

---

## 6. What is already right, and must not be lost

Worth stating so that the work does not regress it:

- The glass material, the background treatment and the token discipline are consistent everywhere.
- The blur rules are respected: dialog and drawer scrims dim without blurring, and the surfaces that
  blur are the ones on the allow-list.
- The two-column property grid used by container and image detail is a good pattern — the problem is
  that it is not used everywhere.
- Destructive actions are consistently red-tinted, and the prune rows correctly distinguish
  actionable from inert.
- The callout style (System & prune, Raw console) is one style used twice, correctly.

---

## 7. Direction

The fixes belong in the library, in this order.

1. **Repair the three blocking defects** — rail scrolling, the `DataTable` column contract, and the
   text/meta truncation contract. These are bugs, they are cheap, and two of them are one-file
   changes. The dead Search control is decided here too: build the palette or remove the control and
   its `⌘K` badge. Shipping neither is not an option.

2. **Give the existing components an opinion — do not add new ones.** Corrected after planning: this
   step was written as "add the five primitives the screens each improvised", and four of the five
   already exist with 108 feature call sites between them. Building them again would double the
   incoherence rather than end it. The work is consolidation, and mostly modification:

   - **one list**, by extending `DataTable` with a comfortable variant, so that the column and
     truncation contracts repaired in step 1 are inherited rather than reimplemented;
   - **`EmptyState` insists** — its own surface, and a shape that makes the explanation and the
     resolving action part of the component rather than optional decoration;
   - **`DetailPanel` is always full-width and always the two-column grid**, tabs optional, so it
     cannot be rendered into a narrow column;
   - **one `SectionHeader` treatment**, replacing the four now shipping;
   - **one action rule** across `ActionButtonGroup`, `Menu` and `ScreenToolbar` — what is a button,
     what is a menu item, and what may be text.

3. **Migrate the call sites, family by family**, then **delete `CardList`**. Retiring it is what makes
   the consolidation real: left exported, it remains available as the next screen's second answer.
   The deletion must also cover `images/LayerEfficiencyView.tsx`, which is a `CardList` call site on a
   `DataTable` screen and is missed by any plan phrased as "the nine screens".

4. **Remove the duplication** listed in section 4 as each screen is migrated, and resolve the image
   size contradiction by naming the two numbers.

The measure of success is that a screen not yet written has no design decisions left to make.
