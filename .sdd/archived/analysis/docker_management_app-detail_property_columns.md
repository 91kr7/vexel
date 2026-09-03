---
request_slug: docker_management_app-detail_property_columns
date: 2026-08-14
type: fix
reference: .sdd/analysis/docker_management_app.md
---

## Request

> too arious layout! actually there are section that contains the container/image configs, environment
> ecc.... these sections are not well structured because there is too much wasted space
> how to fix: analyse the screenshot! my propose is to subdivide these infos in columns (based on the
> device size!)

Reported as bug-4 in `bugs.md`, with `bugs-screen/bug-4.png`. "Too arious" is *troppo arioso* — too
airy. The text is two lines and the screenshot is the rest of the report, so it is transcribed here as
the requirement it is.

**What the screenshot shows.** The image detail panel, expanded under its row on the Images & layers
screen, captured at device-pixel ratio 2: 2916 × 790 device pixels, therefore **1458 × 395 CSS pixels**
of surface. (The ratio is not assumed — it is read back from the capture: the property bands repeat
every 74.4 device pixels, and the delivered band's own step computes to 37 CSS pixels from the
library's tokens. 74.4 / 37 = 2.01.) Reading it top to bottom:

- a band carrying a `linux/arm64/v8` chip on the left and `sha256:d9e853e87e55` with a `Copy` control
  on the right;
- then eight bands, each the full 1458px width, each holding a label hard against the left edge and
  its value hard against the right edge, with the whole middle of the band empty:
  `Tags` … `alpine:3.20`; `Digest` … `sha256:d9e853e87e55`; `Platform(s)` … `linux/arm64/v8`;
  `Size` … `3.9MB`; `Created` … `2026-04-16T23:53:24.896953537Z`; `Entrypoint` … `—`;
  `Command` … `/bin/sh`; `Exposed ports` … `—`;
- and the beginning of a further section, `Environment`, cut off by the bottom edge of the capture.

The panel as the code now stands opens with an `Id` property carrying exactly that shortened digest
and exactly that copy control, in exactly that band; whichever element the capture's top band is, it is
drawn in the same full-width idiom as the eight below it, and nothing in this report turns on which.

**The arithmetic of one band.** `Created` is the longest value on the surface at 30 characters. At the
library's 12px monospace it inks about 216px; its label inks about 47px; the band's own horizontal
padding takes 24px. On a 1458px band that leaves **roughly 1170px of empty middle**. On the
`Entrypoint` band, whose value is a single em dash, roughly 1370px is empty — **94% of the band**.
Across the whole section, labels and values together ink well under one part in fifteen of the surface
the section occupies. The operator scrolls through 330px of bands to read what would fit in a third of
it, and reads each property by travelling a metre of screen from its name to its value.

## Reference

Fix of the delivered product analysed in
[`.sdd/analysis/docker_management_app.md`](docker_management_app.md).

Three delivered siblings on this branch are the baseline and are not re-opened:

- [`docker_management_app-progress_completion_autoclose.md`](docker_management_app-progress_completion_autoclose.md)
  (bug-1) — the shared progress dialog states `Completed` and dismisses itself. Untouched.
- [`docker_management_app-filesystem_browse_direct.md`](docker_management_app-filesystem_browse_direct.md)
  (bug-2) — `Browse filesystem…` leads straight to the cost warning. Untouched.
- [`docker_management_app-filesystem_browser_layout.md`](docker_management_app-filesystem_browser_layout.md)
  (bug-3) — **the immediately preceding report, and the same complaint about a different axis.** It
  found that the filesystem browser's *height* was distributed by accident, and corrected the cause in
  the UI library: a new layout primitive, `BandStack` ("chrome bands above one region that takes the
  remaining height"), plus `fill` modes on `SplitPane` and `TreeView`.

**Does this report reuse that work? No — and the reason is the point.** bug-3 is about **height inside
a bounded surface**: a dialog capped at 85vh, in which some region must absorb what the chrome does not
use. This report is about **width in an unbounded flow**: the detail panel lives in the page's own
scroll, where there is no leftover height to absorb and no cap to press against — the section is
exactly as tall as the bands it draws, and the fix is to draw fewer, shorter lines of them. `BandStack`
answers "who takes the remaining height", a question this surface does not ask; adopting it here would
be a primitive used for a problem it was not written for, which is the mistake bug-3 itself diagnosed
(a row-axis sizing rule applied in a column). What *is* carried over from bug-3 is its discipline, and
this report follows it exactly: the cause is corrected in the shared library component rather than on
the screen that shows the symptom, and feature code ends up stating no layout constant of its own.

One concrete overlap must not be missed: **bug-3's own surface is a consumer of the component being
changed here** — the filesystem browser's entry-metadata pane is a `DefinitionList`. Its pane is narrow,
so it stays one column and must be verified visually unchanged.

**Starting point.** The reference analysis specifies inspect surfaces for images and containers —
config, entrypoint/command, environment, labels, exposed ports, digest, platform, size, history — and
stakes the product's market position on a visual language that must "remain usable (readable text,
discernible controls) for extended operational use, not purely decorative". Every property the
reference analysis asked for is present. What is missing is any relationship between the space a
property needs and the space it is given.

**Changes.** No property is added, removed, renamed or reworded. No value is reformatted, truncated
differently, or made to hide behind a disclosure. No control changes. What changes is that a section of
properties **arranges itself in as many columns as the width it is actually given can carry**, instead
of spending one full-width band per property at every width in existence.

## Established findings

Read from the delivered code before writing this analysis, because "there is too much wasted space"
names a symptom, and the human's proposed remedy — columns — is a remedy that can itself become a
second defect if applied naively. Recorded so a later reader can weigh the conclusions rather than take
them on trust.

| Question | What was found |
|---|---|
| **Which component draws these sections?** | **`DefinitionList`, a UI-library primitive** (`client/src/ui/data/DefinitionList.tsx`, styled in `client/src/ui/data/data-table.css`). Every band in the screenshot is one `.ui-definition-list__row`: a flex row with `justify-content: space-between`, a `flex: none` label and a right-aligned value. `space-between` on a full-width row **is** the empty middle: it is not spacing anybody chose, it is the consequence of two items being pushed to opposite ends of whatever width the row is handed. The feature file (`ImageDetailPanel.tsx`) states no layout at all — it passes a list of nine label/value pairs. **The defect is in the library, not on the screen.** |
| **How far does it reach?** | **The whole product.** `DefinitionList` is consumed by **16 feature files across 12 screens**, at roughly 25 call sites: images (image detail panel ×4, filesystem browser, image diff, layer explorer), containers (detail panel ×5), volumes & networks (×2), swarm (services ×2, secrets, configs & stacks ×2, nodes), plugins, registries, system & prune, contexts, and the coverage matrix. Every one of them draws label-left / value-right bands. This is the single most important finding: fixing the image panel alone would leave eleven screens with the same defect and the library still unable to express the right thing. |
| **Does the container detail panel have the same shape?** | **Yes, twice over, and differently each time.** Its **Inspect** tab draws ten properties (`Id`, `Name`, `Image`, `Command`, `Entrypoint`, `Created`, `State`, `Started at`, `Finished at`, `Exit code`) as one full-width `DefinitionList` — identical to the image panel, one band more. Its **Config** tab is better and still wrong: feature code wraps it in `Grid columns="1fr 1fr"`, so the six runtime properties sit in a band of about half the panel — the airiness is halved, not removed, and the `1fr 1fr` is a **fixed** split that does not collapse, so below ~720px each side is ~180px wide. The human's words, "container/image configs", name both panels correctly. |
| **What varies between the rows — and would a naive grid break it?** | **Yes, it would.** Three distinct content classes share one component today. **Short scalars**: `Size` (5 chars), `Platform(s)` (14), `Digest` (always 19 — the server shortens it to `sha256:` + 12 in `images-service.ts`), `Id` (19), `Created` (30, the longest), `State`, `Exit code`. **Long single-line text**: environment values (`PATH=/usr/local/sbin:…` runs past 60 characters), label values (URLs, licence strings), mount lines, health-check commands. **Unbounded free text**: the image panel's **History** section, whose value is the layer's `createdBy` — a whole Dockerfile instruction, routinely 100–400 characters — against a label that is a timestamp. And **list-valued properties** (`Tags`, `Exposed ports`, `Command`, `Networks`) are short in the screenshot and unbounded in general, since they are joined with `, `. A single column count applied to all of them is the "30-character timestamp beside a dash" defect the report warns against; the column count has to follow the content class, not the section. |
| **Does the library already have a column capability?** | **Yes, and it is part of the defect.** `DefinitionList` takes `columns?: 1 \| 2`, implemented as `grid-template-columns: 1fr 1fr` with **no minimum track width and no breakpoint**. Five call sites pass `columns={2}` (swarm services, secrets, configs & stacks, nodes; the coverage matrix), all inside half-width cards. So the product already contains, today, the failure mode a careless fix would introduce: at a narrow window those five surfaces hand each pair a ~150–180px cell, in which a 19-character digest wraps across three lines. **A number chosen by the caller, who cannot know the width the list will get, is the wrong shape** — that is the finding, and it is why the prop does not survive as a number. |
| **Must the column count follow the device, or the section's own width?** | **The section's own width — and this is a decision, not a preference.** The panel is not the viewport: a docked rail takes 260px (220px at ≤1024px), and the frame's padding, gaps and reserved scrollbar gutter take ~70px more, so roughly 330px of any viewport never belongs to the panel. Worse, **the same component appears at two very different widths on the same screen at the same instant**: full panel width in the container Inspect tab, half of it in the Config tab's `1fr 1fr`, and inside half-width cards on swarm, volumes & networks, plugins, registries, system and contexts (`1fr 1fr`, `1fr 1.2fr`, `1.2fr 1fr`, `2fr 1fr`). A viewport rule gives both instances the same count, so it is necessarily wrong for one of them. The human's "based on the device size" is satisfied *a fortiori* by the container rule: widen the device and every section widens with it. |
| **Can the library express "as many columns as fit"?** | **Yes, and it already does — three times, unnamed.** `.ui-dashboard-layout__tiles` uses `repeat(auto-fit, minmax(190px, 1fr))`; `Grid`'s own default is `repeat(auto-fill, minmax(220px, 1fr))`; and two feature files write the idiom out by hand (`LayerEfficiencyView`, `ContainerStatsView`). The capability is intrinsic and needs no viewport query — which matters, because the codebase contains **no container queries at all**, and its only breakpoints are the viewport ones at **720px** and **1024px** in `layout.css`, `split-pane.css`, `navigation.css` and `state-summary-bar.css`. Three ad-hoc copies of one idea, none of them named, is precisely the divergence the single-library rule exists to prevent. |
| **Do the mockups show an intended arrangement, and did the delivered layout ever match it?** | **Partly, and the divergence is instructive.** `containers_3.png` mocks the **Config** tab exactly as delivered — two columns, `RUNTIME CONFIGURATION` left, `ENVIRONMENT · MOUNTS` right — so that tab matches its mock, at the mock's own width. `containers_6.png` mocks the **Inspect** tab as **the raw JSON payload and nothing else**: the ten property bands the delivered build draws above it have no mock and were never asked for in that shape. `image_layers.png` expands an image row into a **layer stack**, not a property list: **there is no mock of the image detail panel at all.** What the mockups do establish, unambiguously, is the density: an image's identity is packed onto one line (`sha256:4c8f9a… · linux/amd64` beside three chips, an age and a size); the Stats tab lays five metrics across a single band; and every label→value band in the set is drawn inside a column of roughly half the content width — **never spanning the full width of a wide screen**. The delivered image panel and container Inspect tab are the two places that broke that rule. |
| **How tall is the section, and how does it respond to width today?** | 12px text, `--space-2` padding above and below, `--space-1` between bands: a band steps every **37px**. Nine properties = **~330px**; the container's ten = **~366px**. And the number that decides this report: **those figures are identical at 1280px and at 2560px.** The delivered section does not respond to width in any way whatsoever — there is no rule to soften, only one to add. |
| **What else sits in these sections?** | The `Environment`, `Labels`, `History`, `Networks` and `Health` sections are `CollapsibleSection`s, **closed by default**, each opening onto another `DefinitionList` of the same shape. The screenshot catches `Environment` closed at the bottom edge. So the reported defect is what the operator sees *before* opening anything, and it repeats inside each section they open. The Config tab's right-hand column is not a `DefinitionList` but a stack of one-per-row `MetaCell` pills carrying `NODE_ENV=production`-length strings at half the panel width — the same waste in a different component, and inside one of the two surfaces the human named. |

**Conclusion.** One cause, in one library component: a label/value pair is laid out against *the width
of the container* instead of against *the width the pair needs*, and nothing anywhere in the product can
say how many of them fit side by side. Everything else — the empty middles, the 330px of bands, the
five surfaces already wrapping digests at narrow widths — follows from that one sentence.

## Summary

Detail sections lay out every property as its own full-width band with the label at one edge and the
value at the other, so on a 1458px panel a 30-character timestamp is read across 1170px of emptiness
and nine short properties consume 330px of height — the same 330px at 1280px of screen as at 2560px.
The library's property list is made to arrange its pairs in as many columns as the width it is actually
given can carry, so no property is removed, renamed or reworded and every screen that shows properties
inherits the correction.

## Business goal

**The operator opened this panel to read eight facts, and the layout made it a scrolling exercise.**
Every property here is one short string; together they carry about a line and a half of text. Delivered,
they are spread over 330px of vertical travel and up to 1370px of horizontal travel each. That is not a
matter of taste: reading a value means finding its label, tracking a metre of empty glass, and holding
the label in memory until the value arrives — nine times, for facts that a `docker image inspect`
prints in eight lines the operator can take in at a glance. A graphical client that makes a
one-screen answer into a scrolled one is losing to the command it replaces, and losing it on the
product's most-visited surface: the detail panel behind every row of the two busiest screens.

**The defect grows with the operator's monitor, which inverts what a desktop application is for.** The
section is 330px tall on a laptop and 330px tall on a 27-inch display; the only thing the extra 1100px
of width buys is more emptiness per band. The operator who bought the bigger screen to see more of their
system sees exactly as much, more thinly spread. NN/g's phrasing of the same complaint — screen space
"shouldn't be hoarded, it should be spent" — is what the human arrived at independently, from a
screenshot, unprompted.

**It is the library, so it is twelve screens, and the next screen too.** `DefinitionList` is how this
product says "here are the facts about this object", and it says it the same wrong way on images,
containers, volumes, networks, swarm services, secrets, configs, nodes, plugins, registries, contexts
and the daemon. Correcting the image panel alone would leave eleven screens diverging from it and a
thirteenth about to be written against the old shape. The same rule that makes the defect this wide
makes the fix this cheap: one component, and every screen inherits it.

**Half the fix is already shipped as a latent failure.** The five surfaces that pass `columns={2}`
today are running an unbounded two-column grid inside half-width cards: at a narrow window they already
wrap a 19-character digest across three lines. Those are the same screens a naive "just add columns"
fix would multiply. The report is therefore not only about reclaiming space, it is about the product
gaining, once, a correct answer to "how many of these fit here" — instead of five callers guessing.

## Requirements

### Functional — how a property section arranges itself

- **A property pair is bounded, not stretched.** The band holding one label and its value is never
  wider than it needs to be to hold them comfortably — **at most ~500 CSS px**, at every window size,
  on every screen. This is the single statement that answers "too airy", and it is what makes the
  defect impossible to reintroduce at some width nobody tested: the label→value run is bounded by
  construction rather than by a breakpoint someone remembered to write.
- **The number of columns follows from that bound and from the width the section actually has.** A
  section fills its width with as many pairs as fit at a stated minimum band width, and the count rises
  as the section widens. It never falls as the section widens.
- **The minimum band width is stated, and derived from the content, not chosen.** For a section of
  short scalar values it is **~360px** — the longest single-line value in the product's property
  sections (`Created`, 30 characters, ~216px of monospace) plus the longest label (`Exposed ports`,
  ~85px), plus the band's own padding and the gap between label and value. A band narrower than that
  cannot hold its own worst case on one line, which is the defect this fix must not create.
- **The column count is a function of the section's own measured width, never of the viewport.** Two
  sections on the same screen at the same moment, one at full panel width and one inside a half-width
  card, must show different counts. This is a decision recorded with its reason in *Assumptions*; the
  human's "based on the device size" is satisfied by it, since a wider device gives every section a
  wider box.
- **Three content classes, declared by the section, not guessed by the layout.** A property list states
  which kind of values it holds, and the minimum band width follows:
  - **short scalars** (~360px minimum) — the image panel's nine properties, the container Inspect
    tab's ten, the container Config tab's six runtime properties, `Networks`, `Health`, and the
    equivalent lists on volumes, networks, swarm, plugins, registries, contexts and the daemon;
  - **long single-line text** (a wider minimum, ~560px) — `Environment` and `Labels` on both panels,
    where a value routinely passes 60 characters;
  - **unbounded free text** (**always one column**) — the image panel's `History`, whose value is a
    whole Dockerfile instruction against a timestamp label. A grid is the wrong shape for it and it
    keeps the full width it has today.
- **A value is never clipped, never truncated by the layout, and never overlaps its label.** A value
  longer than its band wraps inside it, as it does today; nothing gains an ellipsis, a tooltip-only
  presentation or a hidden overflow that it did not have before. Reformatting or shortening a value to
  make it fit a column is refused outright: this report moves space, it does not change what the panel
  says.
- **Bands on the same line are the same height.** A wrapped two-line value must not leave its
  neighbours as short pills floating against a tall one; a line of the grid reads as a line.
- **Reading order is preserved.** Properties keep the order they are declared in, filling left to right
  then down. `Id` is still first and `Exposed ports` still last, in every arrangement.
- **The section fills the width it is given.** After the columns are placed, the rightmost band's right
  edge is within one gap of the section's right edge — no dead margin re-appearing on the right as a
  quieter version of the same defect.
- **Below the library's existing narrow breakpoint (720px) every property section is one column**, and
  a one-column section is exactly what is delivered today: nothing about the phone-width presentation
  regresses. No new breakpoint is invented for this report; the product has one set.
- **The container Config tab's own two-column split becomes responsive.** The hard `1fr 1fr` written in
  feature code collapses to one column below the narrow breakpoint instead of handing each side ~180px,
  and the split comes from the library rather than from a template string in the panel. Its right-hand
  environment/mounts list — one of the sections the human named — arranges itself by its own width on
  the same rule as the rest.
- **The `columns` number disappears from the call sites.** The five surfaces that pass `columns={2}`
  stop stating a count, because a caller cannot know the width it will be given; they get the derived
  count instead. Their delivered narrow-width wrapping goes with it.

### Functional — a stated, verifiable outcome

"Less airy" cannot be checked and would let this report be closed on a screenshot. The outcome is
therefore stated as figures a check can be red against. **Column counts are asserted against the
section's own measured width** (not the viewport), at widths comfortably inside a band rather than on a
boundary — the transitions for a short-scalar section fall near 744px, 1128px and 1512px, and asserting
on a transition is asserting on a rounding rule:

| Measured width of the section | Columns, short-scalar section |
|---|---|
| 600px | exactly 1 |
| 900px | exactly 2 |
| 1300px | exactly 3 |
| 1700px | exactly 4 |

- **Height, image detail panel, nine properties.** Delivered: **~330px, one column, at every viewport**.
  Required: at **1280 × 720** the section measures **at most 65%** of the delivered build's height at
  the same viewport; at **1920 × 1080**, **at most 45%**; at **2560 × 1440**, **at most 35%**.
- **Height, container detail panel, Inspect tab, ten properties.** The same three ceilings against its
  own delivered ~366px.
- **The section responds to width at all.** Its measured height at 2560 × 1440 is **strictly less** than
  at 1280 × 720, and its column count strictly greater. On the delivered build both are **identical**,
  which is the cleanest red available and must be recorded as such.
- **Nothing is clipped or overlapped, at any of the widths checked** — 720px, 1280px, 1920px and 2560px
  of viewport, and additionally with the section constrained to ~400px (the half-width-card case that
  already misbehaves today): every value's rendered box lies inside its band, no label's box intersects
  its value's box, and the section's own box lies inside its container's.
- These figures are derived from the delivered 37px band step, the 12px monospace value and the
  ~360px minimum band. If any of those is deliberately changed later, the numbers are restated from the
  same reasoning: they exist to make the outcome fail-able, not as design constants.

### Functional — nothing else changes

- **Every property survives, in place, with its label, its value, its formatting and its controls**:
  the image panel's `Id`, `Tags`, `Digest`, `Platform(s)`, `Size`, `Created`, `Entrypoint`, `Command`,
  `Exposed ports`, and its `Environment`, `Labels` and `History` sections; the container panel's Config
  and Inspect tabs with everything on them. No section changes its default open/closed state.
- **The copy affordance beside a value is untouched by this report** — it keeps its position beside its
  value, its behaviour and its keyboard reachability. bug-5 concerns it and is a separate report, worked
  next; nothing here anticipates it either way.
- **No flow, no data, no daemon behaviour changes.** No new API call, no change to what the server
  returns, no change to how a value is computed or formatted.
- **The editing form on the Config tab is not touched.** This report is about the read view; the form is
  a different shape with a different problem and is not in it.

### Non-functional

- **The correction lives in the UI library.** The cause is a library component's own layout rule, and
  the outcome must be that feature code states **no column count, no track template and no width** for
  these sections — including the `1fr 1fr` and `columns={2}` constants it states today. An existing
  primitive that almost fits is extended, not duplicated: two property lists that look 90% alike are
  exactly the divergence the standing rule exists to prevent, and the product already has three
  unnamed copies of "as many as fit" to show what that looks like.
- **No raw markup, no CSS, no hard-coded spacing, size, radius, colour, breakpoint or z-index outside
  the library**, per the project's standing rule. A `style={{ … }}`, a local stylesheet or a media query
  written on the feature screen is not an acceptable outcome of this report under any schedule pressure.
- **The blur allow-list is untouched.** None of these surfaces is on it, none joins it, no blur value is
  written anywhere, and `check-ui-conformance.mjs` needs no change.
- **The main view keeps paying nothing.** These sections sit in the scrolled main view, on screens that
  list hundreds of objects. Nothing scroll-driven, animated, measured-per-frame or otherwise
  continuously computed may be introduced to make the columns respond; a detail panel opening must not
  make the list behind it stutter.
- **Keyboard and assistive-technology operation must not regress.** Each value stays associated with its
  own label; reading order stays the declared order; tab order through the copy controls is unchanged;
  and a screen reader must not be handed a grid that reads column-first.
- **All twelve consuming screens must be verified, and the outcome stated rather than assumed** —
  images (detail panel, filesystem browser, image diff, layer explorer), containers, volumes &
  networks, swarm (services, secrets, configs & stacks, nodes), plugins, registries, system & prune,
  contexts, coverage matrix. The three named surfaces (image detail panel, container Inspect, container
  Config) are checked geometrically; the rest are verified free of clipping and overlap at 1280 × 720
  and 1920 × 1080, and the filesystem browser's metadata pane — bug-3's delivered surface — is verified
  visually unchanged.
- **Verified against the real daemon** under the project's test discipline: own fixtures carrying the
  ownership labels, full cleanup in a `finally`, `docker rm -fv`, no assumption of an empty daemon or of
  inherited application state, its own data directory, no test reaching Docker Hub (the image comes from
  the run's own registry), and every spec passing on its own.
- **English only**, per the project's convention.

### Non-functional — how this must be checked, explicitly and for the record

This project has already shipped a certified defect behind coverage that counted characters and clicked
programmatically (`CLAUDE.md`, *"What a check drives, and what it measures"*). This report is squarely
in that class — it is about position and size, and every word of text on the surface is identical
before and after — so the obligation is written here rather than left to whoever writes the spec:

- **The check asserts measured geometry.** The number of columns at a stated, measured section width;
  the section's measured height against the delivered build's at the same viewport; every value's
  measured box inside its band; no label box intersecting a value box; the section's box inside its
  container's. Column count is deduced from measured band positions — bands sharing a top edge are one
  line — never from a class name or an attribute, which would certify the implementation instead of the
  result.
- **Counting properties or asserting their text certifies nothing here.** *"Nine properties are
  listed"*, *"`Exposed ports` is displayed"*, *"the panel contains 1154 characters"* are **all true of
  the screenshot in this bug report**, and the last one is quoted from the coverage that passed while a
  dialog sat 1044px above the top of the viewport. Content assertions may stand beside the geometric
  ones where they answer a different symptom — a section present and blank — never instead of them.
- **Every interaction is driven with a real pointer at the visible control's coordinates**: clicking the
  image row to expand the panel, clicking the container row, clicking the `Inspect` and `Config` tabs,
  clicking a `CollapsibleSection` header to open `Environment`. Never `element.click()`, never a
  dispatched event, never a visually hidden target.
- **The check must fail on the delivered build**, and whoever writes it records the measurement before
  and after. The delivered build's numbers are on record here: one column at every width; ~330px for
  the image panel's nine properties and ~366px for the container's ten, identical at 1280px and at
  2560px; ~1170px of empty middle on the `Created` band at a 1458px section; and a ~150–180px cell on
  the five `columns={2}` surfaces at narrow widths.
- **The fixtures are the suite's own**: the mirrored `alpine:3.20` for the image panel — nine
  properties, a 30-character `Created`, an em dash for `Entrypoint` — and a container created from the
  suite's own tiny image for the container panel, both labelled and removed with `docker rm -fv` in a
  `finally`.

## What the operator must observe, in order

1. On Images & layers, at a desktop width, the operator clicks an image row. The panel expands beneath
   it showing the same nine properties, in the same order, with the same values and the same copy
   control — **arranged across the width in three or four columns instead of nine stacked bands**, and
   occupying roughly a third of the height it did.
2. Each label sits beside its own value, within a band no wider than about 500px. There is no band in
   which the label and the value are at opposite ends of the screen.
3. Opening `Environment` and `Labels` shows their entries in columns too, fewer of them, because their
   values are longer. Opening `History` shows one entry per line, full width, exactly as today —
   because a Dockerfile instruction does not belong in a column.
4. Narrowing the window: the columns reduce in steps, and below the phone breakpoint the section is a
   single column that looks precisely like the delivered build. Nothing is ever clipped, and no digest
   wraps across three lines on the way.
5. On Containers, the `Inspect` tab shows its ten properties on the same rule. The `Config` tab keeps
   its two-column arrangement — matching its mockup — with the runtime properties and the
   environment/mounts entries each arranged by the width their own column has; and at a narrow window
   the two columns stack instead of being squeezed to ~180px each.
6. Widening the window to a large monitor adds columns and takes height away. The operator's bigger
   screen shows more, not the same thing more thinly spread.
7. Every other screen with a property list — volumes, networks, swarm, plugins, registries, contexts,
   the daemon summary — is denser in the same way, with nothing clipped and nothing missing.

## Assumptions

Every gap the report leaves is closed here with a default and its reason. None is returned as a
question: the human's instruction is deliberately open, the detail decisions are delegated, and none of
these is a scope change, a destructive action or a contradiction.

- **This is a fix, not an evolution.** The delivered surfaces have a layout rule that ignores the space
  it is given; the cause is identified, the corrected behaviour is stateable and measurable, and no
  capability is added or removed.
- **"Subdivide these infos in columns" is a restructuring, not a redesign.** No property disappears, is
  renamed, reordered, reformatted or moved behind a disclosure; no control is added or removed; no
  wording changes. Anything beyond that is a different request, and the human is away.
- **The count follows the section's own width, not the device's.** Taken as a decision, for the reason
  in the findings: the same component is drawn at full panel width and at half of it on one screen at
  one instant, so a viewport rule is necessarily wrong for one of the two, and the wrong one is the
  narrow one — which is where a too-high count clips. The human's "based on the device size" is
  honoured, since every section widens when the device does; this is strictly the stronger reading of
  his instruction, not a departure from it.
- **The library's existing breakpoints are reused where a breakpoint is needed** (720px, 1024px); no new
  one is invented. The product has one visual language and one set.
- **The minimum band width is content-derived and stated (~360px short scalars, ~560px long text, no
  columns at all for unbounded text).** These are defaults with a rationale, not design constants: they
  come from the longest value each class actually carries in this product. A later, measured adjustment
  restates them from the same reasoning.
- **The `columns: 1 | 2` prop does not survive as a caller-stated number**, and the five call sites that
  pass it change. That is five screens beyond the two the human named, and it is deliberate: leaving a
  hard `2` in place would leave the narrow-width wrapping armed on exactly the surfaces a denser layout
  makes more likely to be hit, and would leave the product with two competing answers to "how many
  columns" in the same component. Their visible outcome at ordinary widths is the same count or a
  better one.
- **The container Config tab's `1fr 1fr` is in scope**, because "container configs" is half of what the
  human reported and because a fixed split that cannot collapse is the same defect one level up. Its
  mocked two-column shape is preserved at desktop widths — the mock is the target and the delivered
  tab matches it.
- **The container Inspect tab keeps its property list**, even though `containers_6.png` mocks only the
  raw payload. Removing bands the mock does not show would be deleting a capability under cover of a
  layout report; the mock is treated as evidence about **density**, which is what it is being cited for,
  not as licence to drop content.
- **`BandStack` and the `fill` modes from bug-3 are not reused**, for the reason given in *Reference*:
  they distribute height in a bounded surface, and this is width in an unbounded flow. Reaching for
  them because they are recent and adjacent would be the near-duplicate trap inverted.
- **Row height, font sizes and the visual treatment of a band are unchanged.** The section owes its
  operator three times the density it has; taking that out of the type instead would change the mocked
  visual language to buy back space the layout already owes.
- **A tabular arrangement (a real two-column table of label/value across the whole width) was
  considered and rejected.** It reads well for a uniform list and breaks the moment one value wraps to
  four lines, which `Environment` and `History` do routinely; and it would put every label in one narrow
  left column with a very long value column beside it — the airiness moved, not removed.
- **Hiding the long values behind a disclosure was considered and rejected.** It would answer the height
  complaint at the cost of what the panel is for. The report says the space is wasted, not that the
  facts are unwanted.
- **The screenshot is a 2× capture**, so every figure in this analysis is stated in CSS pixels and the
  conversion is shown rather than assumed. A check written against device pixels would be off by a
  factor of two on this machine and correct on another.

## Constraints

- **Product constraint — every visual element comes from the UI library.** The library is the only place
  permitted to emit raw markup or contain styling, and no spacing, size, radius, colour, breakpoint or
  z-index may be hard-coded outside it. This report is exactly where that rule bites: the correction has
  one legitimate home, and the layout constants currently in feature code are part of what is corrected.
- **Product constraint — the library grows before the feature consumes it**, generic and
  domain-agnostic, with an existing primitive extended rather than duplicated.
- **Product constraint — the main view pays nothing for the glass.** No surface joins the blur
  allow-list, no blur value is written, the conformance check needs no change, and nothing continuously
  computed is added to a scrolled view.
- **Product constraint — the mockups are the visual target** for the surfaces they cover: the container
  Config tab's two columns (`containers_3.png`) are preserved, and the density the whole set establishes
  is the standard the corrected sections are held to.
- **Product constraint — bug-1, bug-2 and bug-3 are delivered and certified**, and none of them may be
  disturbed. The filesystem browser's metadata pane is a consumer of the component being changed and is
  verified unchanged.
- **Product constraint — nothing on the daemon side changes.** No new Docker operation, no change to
  inspect, formatting or caching.
- **Repository constraint — the suite runs against the operator's own daemon**, so verification obeys
  the fixture rules: ownership labels, full cleanup, `docker rm -fv`, its own data directory, no
  reliance on an empty daemon, no reach to Docker Hub, every spec passing on its own.
- **Verification constraint — the assertion must be geometric, pointer-driven, and able to fail on the
  delivered build**, for the reasons recorded above.
- **Convention constraint — English only**, kebab-case for any new file or folder name.

## Market trends

Relevant and consulted, narrowly. This is a product with named competitors, and the two questions the
report leaves open — whether a wide screen should be spent on more content, and how a layout should
decide how many columns to draw — are settled in published practice. The findings support the fix and,
more usefully, mark where it must stop.

- **Space is to be spent, not hoarded, and wide screens are the specific case.** NN/g is blunt:
  *"screen space shouldn't be hoarded, it should be spent"*, against designs that *"cram highly valuable
  content or action items into tiny spaces while wasting vast amounts of screen space"*, concluding
  *"let's stop cramming information into tiny peepholes"*. The same body of work names higher
  information density as *"less need to move around and higher likelihood that you see what you want"*,
  and reports **52% of screen space completely wasted** on filler and blank areas in its homepage
  study. A section whose height is identical on a laptop and on a 27-inch display is that finding
  stated as a defect. ([NN/g — Utilize Available Screen
  Space](https://www.nngroup.com/articles/utilize-available-screen-space/); [NN/g — Information
  Density](https://www.nngroup.com/topic/information-density/); [NN/g — Homepage Real Estate
  Allocation](https://www.nngroup.com/articles/homepage-real-estate-allocation/))
- **Using wide screens well is an acknowledged open problem, not a solved default.** NN/g describes the
  failure to make good use of ever-wider desktop screens as the field's biggest challenge of the past
  decade — which is why this fix is stated as measurable ratios at named widths rather than as a look:
  the surface has to be demonstrably denser at 2560px, not merely differently arranged.
  ([NN/g — Small Pictures on Big Screens](https://www.nngroup.com/articles/small-pictures-big-screens/))
- **Stepped width bands are the standard mechanism, and they are bands of the layout's own space.**
  Material's adaptive guidance classifies available width into compact / medium / expanded / large /
  extra-large (600 / 840 / 1200 / 1600 dp) and treats each step as the point at which a layout gains a
  pane or a column. The product's own 720px and 1024px breakpoints are its equivalent, and the report
  reuses them rather than inventing a third set. Material's classes are of the window; this report's
  finding is that a component appearing at two widths within one window has to key off its own box —
  which is the same principle applied one level down, and the reason the count is not written as a
  viewport rule. ([Material Design 3 — Window size
  classes](https://m3.material.io/foundations/layout/applying-layout/window-size-classes);
  [Android — Use window size classes](https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes))
- **Density is a named mode with a floor, not a slider.** Published data-table practice treats density as
  discrete modes with stated row heights and padding, compact being the power-user setting, and warns
  that density is not cramming. That is the boundary of this fix: the space is taken back from the empty
  middles, never from the type size or the band's own padding.
  ([Data table UI design reference guide](https://www.setproduct.com/blog/data-table-ui-design))
- **What the category does with the same information.** Portainer presents container and image inspect
  data as a tree of parameters with a raw-JSON view beside it; `docker image inspect` prints the same
  facts as eight compact lines. Neither spends a full-width row on a five-character value. The product's
  panel is legitimately richer than both, and it is judged against the same expectation: the facts, at a
  glance, in one screen. ([Portainer — Inspect a
  container](https://docs.portainer.io/user/docker/containers/inspect); [Docker Docs — docker image
  inspect](https://docs.docker.com/reference/cli/docker/image/inspect/))

## Risks

- **The column count is hard-coded and the report comes back at a different width.** The likeliest wrong
  fix: pass `columns={3}` on the image panel, ship the screenshot. It looks right on the developer's
  monitor, gives ~180px cells on a laptop, and leaves eleven screens untouched — the delivered
  `columns={2}` defect, multiplied.
- **The count is keyed to the viewport.** The second-likeliest, and it reads correct in review because
  the human said "device size". The image panel is fine and the half-width cards on swarm, volumes,
  registries and contexts get three columns in a 700px box, wrapping digests across three lines. A
  wasted-space report answered with a clipping defect.
- **A naive uniform grid ruins the long values.** A 400-character `createdBy` in a 360px column, or a
  60-character `PATH` beside a `3.9MB`, produces ragged lines of wildly unequal height that read worse
  than the bands they replaced. The content classes exist for this and are the part most likely to be
  skipped.
- **The check certifies the wrong thing.** Every character of text on this surface is identical before
  and after, so any assertion on presence, labels, values or counts passes on the defect. This project
  has already shipped exactly that mistake, twice, on a report whose coverage counted 1154 characters.
- **A stylesheet or an inline style appears in feature code.** The fastest route to a passing screenshot
  and a direct breach of the project's central rule — a library defect papered over on the twelve
  screens that show it.
- **Only the image panel is fixed.** The human named "container/image configs"; a fix that answers the
  screenshot alone leaves the container Inspect tab, the Config tab and ten further screens on the old
  shape, and guarantees a bug-6 with the same text.
- **The narrow end regresses unnoticed.** All attention goes to the wide case the screenshot shows,
  while ≤720px — where the section must simply stay as it is — is never opened. The five `columns={2}`
  surfaces are already broken there today, which is how easy that end is to miss.
- **Reading order or labelling breaks for assistive technology.** A grid that visually reads left-to-right
  while its markup or focus order reads column-first is a functional regression invisible in every
  screenshot.
- **bug-5 is folded in.** The copy control is visible in this screenshot and is the subject of the next
  report. Removing or moving it here would make both reports unattributable.
- **The report is closed on a screenshot.** "It looks better" is how this defect was found and is not how
  it is certified. Without the stated ratios and counts, at the stated widths, failing on the delivered
  build, the sections can drift back the next time a property is added.

## Scope

**In scope**

- The layout rule of the library's property list: a bounded label→value band, a column count derived
  from the section's own width and its content class, and the three content classes (short scalar, long
  single-line, unbounded free text).
- The two surfaces the human named: the **image detail panel** (its nine properties and its
  `Environment`, `Labels` and `History` sections) and the **container detail panel** (its `Inspect` tab
  with `Networks`, `Labels` and `Health`, and its `Config` tab read view including the
  environment/mounts list).
- The container Config tab's fixed two-column split: preserved at desktop widths as mocked, collapsing
  below the narrow breakpoint, and stated by the library rather than by feature code.
- The removal of caller-stated column counts from the five surfaces that pass them, and of the layout
  constants these sections state in feature code.
- The ten further screens that consume the same component — they inherit the correction and are verified
  free of clipping and overlap.
- The stated measurable outcomes: column counts at named section widths, height ratios at 1280 × 720,
  1920 × 1080 and 2560 × 1440, no clipping at 720px through 2560px and in a ~400px section — checked
  geometrically, driven with a real pointer, and demonstrated to fail on the delivered build.

**Out of scope**

- Any change to what these surfaces show or say: no property added, removed, renamed, reordered,
  reformatted, truncated or hidden behind a disclosure; no change to the raw payload views; nothing on
  the daemon side.
- **bug-5, the copy controls** — its own report, worked next. Nothing here anticipates it.
- bug-1's progress dialog, bug-2's flow into the filesystem browser, and bug-3's interior layout of it,
  all delivered; the filesystem browser's metadata pane is verified unchanged, not redesigned.
- The container Config tab's **editing** form, and every other form in the product.
- Row height, type, colour, the band's own padding and the surfaces' visual treatment: this report moves
  space, it does not restyle.
- The general question of the ad-hoc grid templates feature code writes for *screen-level* layout
  (`1fr 1.2fr`, `2fr 1fr`, the two hand-written `repeat(auto-fit, …)` strings). Named here so it can be
  requested deliberately rather than rediscovered; it is a wider clean-up than this report, and none of
  it is the reported symptom.
- The tables on these screens, their columns, widths and cells.
- The other reports in `bugs.md`.
