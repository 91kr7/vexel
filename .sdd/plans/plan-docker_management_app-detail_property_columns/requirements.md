---
slug: docker_management_app-detail_property_columns
date: 2026-08-14
spec: .sdd/analysis/docker_management_app-detail_property_columns.md
status: validated
---

# Requirements — A property section arranges itself in the width it is actually given

Fix of the delivered product; bug-4 of the human's `bugs.md`. The reference plan is
[`plan-docker_management_app`](../plan-docker_management_app/requirements.md). Three delivered,
certified siblings on this branch are **baseline and are not re-opened**:
[`plan-docker_management_app-progress_completion_autoclose`](../plan-docker_management_app-progress_completion_autoclose/requirements.md)
(bug-1),
[`plan-docker_management_app-filesystem_browse_direct`](../plan-docker_management_app-filesystem_browse_direct/requirements.md)
(bug-2) and
[`plan-docker_management_app-filesystem_browser_layout`](../plan-docker_management_app-filesystem_browser_layout/requirements.md)
(bug-3 — whose delivered surface, the filesystem browser's metadata pane, is a **consumer of the
component corrected here** and must come out unchanged). Ids are local to this plan: `REQ-1` here is
*not* `plan-docker_management_app/REQ-1`.

**One cause, in one library component.** A label/value pair is laid out against the width of its
container instead of against the width the pair needs, and nothing in the product can say how many
pairs fit side by side. `DefinitionList` is consumed by 16 feature files across 12 screens at roughly
25 call sites; five of them already guess a count (`columns={2}`) and already wrap a 19-character
digest across three lines in a half-width card. The correction is to the shared component, and every
screen inherits it.

**The outcome is measured geometry, not appearance.** Every character of text on these surfaces is
identical before and after, so *"nine properties are listed"*, *"`Exposed ports` is displayed"* and
*"the panel contains 1154 characters"* are all true of the bug screenshot itself — the last one quoted
from coverage that passed while a dialog sat 1044px above the viewport. The figures in F2 are stated
so the checks can be red on the delivered build, where the section's column count and height are
**identical at 1280px and at 2560px**. They are derived from the delivered 37px band step, the 12px
monospace value and the content-derived minimum band widths; if any of those is deliberately changed
by a later report, the numbers are restated from the same reasoning — they exist to make the outcome
fail-able, not as design constants.

**Two inconsistencies in the analysis are closed here rather than left to the implementer**, and both
are flagged as decisions in `batches.md`: the ~500px band bound against the ~560px minimum for long
text (REQ-1, REQ-3), and what "fills its width" means when one column is narrower than the section
(REQ-1, REQ-11).

## F1 — The property list arranges itself by its own width

### The rule

| ID | Requirement |
| --- | --- |
| REQ-1 | **A label→value pair is bounded, not stretched.** The run from a label to its own value is never longer than its content class needs: **~500 CSS px for short scalars**, at every window size, on every screen. There is no band anywhere in the product in which a label and its value sit at opposite ends of a wide surface. Where the band's own track is wider than that bound — the single-column case between the bound and two minimum bands — the surplus sits at the band's **trailing edge**, outside the label→value run, and never inside it. |
| REQ-2 | **The number of columns follows from that bound and from the width the section actually has.** A section fills its width with as many pairs as fit at its stated minimum band width; the count **rises as the section widens and never falls as it widens**. |
| REQ-3 | **The minimum band width is stated and derived from the content, not chosen**, and each class carries a **maximum** as well as a minimum: short scalars **~360px minimum** (the 30-character `Created` at ~216px of 12px monospace, plus the ~85px `Exposed ports` label, plus the band's padding and its label→value gap) with the ~500px maximum of REQ-1; long single-line text **~560px minimum**, with a maximum carrying the **same headroom** as the short class (~140px, so ~700px) — the headroom exists to absorb the surplus of a fractional column and is therefore additive, not proportional to the content; unbounded free text has **no columns at all** and keeps the full width it has today. A 560px minimum under a 500px maximum is unsatisfiable, which is why the bound of REQ-1 is per class and not one figure for the component. |
| REQ-4 | **The count is a function of the section's own measured width, never of the viewport.** Two sections on the same screen at the same instant — one at full panel width, one inside a half-width card — must show **different counts**. A viewport rule is necessarily wrong for one of the two, and wrong on the narrow one, which is where a too-high count clips. |
| REQ-5 | **The mechanism is stated and it is intrinsic.** The count is computed by the layout engine against the section's own box — the product's existing unnamed idiom, `repeat(auto-fit, minmax(…, 1fr))`, now named and owned by the component. **No JavaScript measurement, no `ResizeObserver`, no scroll or frame-driven computation, and nothing recomputed per frame**: these sections sit in the scrolled main view of screens listing hundreds of objects, and a detail panel opening must not make the list behind it stutter. A native CSS container query is permitted **only** if intrinsic sizing genuinely cannot express the rule, and the reason is recorded on the spot. |
| REQ-6 | **Three content classes, declared by the section, not guessed by the layout.** A property list states which kind of values it holds — short scalar, long single-line, unbounded free text — and the minimum and maximum band widths follow from that. The **default is short scalar**. **Every one of the ~25 call sites is classified deliberately**, and the classification is recorded rather than left to whichever default the file happened to inherit: `Environment` and `Labels` on both panels are long single-line; the image panel's `History` is unbounded free text; the rest are short scalars unless the implementer records a reason. |
| REQ-7 | **A minimum band wider than the section never overflows it.** In a ~400px card a long-single-line section whose minimum is 560px degrades to one column of the section's own width; it does not push a 560px track through a 400px box. This is the case the delivered `columns={2}` surfaces already fail, and it must not be recreated by the fix. |
| REQ-8 | **A value is never clipped, never truncated by the layout, and never overlaps its label.** A value longer than its band wraps inside it, as it does today; nothing gains an ellipsis, a tooltip-only presentation or a hidden overflow it did not have before. Reformatting or shortening a value to make it fit a column is refused: this report moves space, it does not change what the panel says. |
| REQ-9 | **Bands on the same line are the same height.** A wrapped two-line value must not leave its neighbours as short pills floating against a tall one; a line of the grid reads as a line. |
| REQ-10 | **Reading order is preserved.** Properties keep their declared order, filling left to right then down. `Id` is still first and `Exposed ports` still last, in every arrangement. |
| REQ-11 | **The section fills the width it is given.** The rightmost band's right edge lies within one gap of the section's right edge — no dead margin re-appearing on the right as a quieter version of the same defect. The bound of REQ-1 is a bound on the **label→value run inside the band**, not a licence to leave the section's trailing space empty. |
| REQ-12 | **Below the library's existing narrow breakpoint (720px) every property section is one column**, and a one-column section is exactly what is delivered today: nothing about the phone-width presentation regresses. **No new breakpoint is invented**; the product has one set (720px, 1024px). If the minimum-band arithmetic already guarantees this at every panel width available below 720px of viewport, that is the preferred way to satisfy it. |
| REQ-13 | **The correction lives in the UI library**, in the component that draws these bands. An existing primitive that almost fits is **extended, not duplicated**: two property lists that look 90% alike are exactly the divergence the standing rule exists to prevent. |
| REQ-14 | **Keyboard and assistive-technology operation must not regress.** Each value stays associated with its own label in the markup; the accessible reading order stays the declared order and is never column-first; tab order through the values and their copy controls is unchanged. A grid that reads left-to-right visually while its markup or focus order reads column-first is a functional regression invisible in every screenshot. |

## F2 — The two reported surfaces, and the figures that make the outcome fail-able

### The surfaces

| ID | Requirement |
| --- | --- |
| REQ-15 | **The image detail panel** shows its nine properties — `Id`, `Tags`, `Digest`, `Platform(s)`, `Size`, `Created`, `Entrypoint`, `Command`, `Exposed ports` — in the same order, with the same values, the same formatting and the same controls, **arranged across the width in columns instead of nine stacked full-width bands**. |
| REQ-16 | **Its collapsible sections follow the same rule, by their own class**: `Environment` and `Labels` arrange themselves in columns, fewer of them because their values are longer; **`History` shows one entry per line at full width, exactly as today**, because a Dockerfile instruction against a timestamp label does not belong in a column. **No section changes its default open/closed state.** |
| REQ-17 | **The container detail panel's `Inspect` tab** shows its ten properties on the same rule, and its `Networks`, `Labels` and `Health` sections likewise, by their own content class. |
| REQ-18 | **The container `Config` tab's two-column split becomes responsive and comes from the library.** Its mocked two-column shape (`containers_3.png`) is preserved at desktop widths; below the narrow breakpoint the two columns **stack** instead of each being squeezed to ~180px; and the split is stated by a library primitive rather than by a `1fr 1fr` template string in feature code. |
| REQ-19 | **The `Config` tab's environment/mounts list arranges itself by the width its own column has**, on the same rule as the rest — it is one of the two sections the human named. Its entries keep their wording, their values and their own visual treatment; what changes is that one entry per row at half the panel width stops being the arrangement. |

### The stated, verifiable outcome

Column counts are asserted against the **section's own measured width**, never the viewport, and at
widths comfortably inside a band rather than on a transition — the short-scalar transitions fall near
744px, 1128px and 1512px, and asserting on a transition is asserting on a rounding rule.

| ID | Requirement |
| --- | --- |
| REQ-20 | **Column counts of a short-scalar section, by measured section width**: **600px → exactly 1**; **900px → exactly 2**; **1300px → exactly 3**; **1700px → exactly 4**. |
| REQ-21 | **Height, image detail panel, nine properties.** Delivered: ~330px, one column, at every viewport. Required: at **1280 × 720** the section measures **at most 65%** of the delivered build's height at the same viewport; at **1920 × 1080**, **at most 45%**; at **2560 × 1440**, **at most 35%**. |
| REQ-22 | **Height, container detail panel, `Inspect` tab, ten properties.** The same three ceilings against its own delivered ~366px, at the same three viewports. |
| REQ-23 | **The section responds to width at all.** Its measured height at 2560 × 1440 is **strictly less** than at 1280 × 720, and its column count **strictly greater**. On the delivered build both are **identical** — the cleanest red available, and it is recorded as such with its measurements. |
| REQ-24 | **Nothing is clipped or overlapped, at any width checked**: 720px, 1280px, 1920px and 2560px of viewport, **and** with the section constrained to ~400px (the half-width-card case that already misbehaves today). Every value's rendered box lies inside its band; no label's box intersects its value's box; the section's own box lies inside its container's. |

## F3 — No caller states a column count

| ID | Requirement |
| --- | --- |
| REQ-25 | **The `columns: 1 \| 2` number disappears** — from the component's public API and from the five call sites that pass it (swarm services, secrets, configs & stacks, nodes; the coverage matrix). A caller cannot know the width it will be given, so a caller-stated count is the wrong shape; leaving it would also leave the component with two competing answers to "how many columns". |
| REQ-26 | **Those five sections get the derived count, and their delivered narrow-width wrapping goes with it.** With the section measured at ~400px, each is one column and **no 19-character digest wraps across three lines**; at ordinary widths their visible outcome is the same count or a better one, **except on a half-width card between roughly 1920px and 2100px of viewport, where the four swarm sections show one column against the two their retired count stated** — see the amendment below. The delivered ~150–180px cell is on record as the red. |

### Amendment to REQ-26, 2026-08-14 — the half-width card between ~1920px and ~2100px

Measured during this batch's test phase: at 1920×1080 a swarm quadrant's card gives its property section
**682.0px**, and two short-scalar bands need **744px** (2 × 360 + 24). So those four sections show **one**
column where the retired `columns={2}` showed two, at a width where the delivered build was not defective —
its 329px cells did not wrap on that content. Two columns return at ~2560, where the section measures 1002px.

REQ-26's second clause and REQ-3's certified 360px minimum are **jointly unsatisfiable** there. No content
class restores two columns at 682px: that needs a minimum of 329px or less, and 360px was derived from
content and certified in batch 1. This is a conflict between two requirements, not an implementation slip.

**The arithmetic yields; REQ-26 takes the exception.** Three reasons, in the order they weighed:

1. **The exception is the plan working, not failing.** The identical 682px half-width panel on volumes and
   networks shows one column and was certified correct by batch 1's own sweep. Before this batch the swarm
   cards were the special case — the only half-width panels in the product stating their own count. They are
   now consistent with every other one. Restoring two columns for them alone would re-create, by a different
   mechanism, exactly the caller-stated exception this batch exists to retire.
2. **The alternative moves a certified figure with a product-wide blast radius.** Lowering the short-scalar
   minimum below 329px to buy this one width band would put every short-scalar band in the product under the
   width its content was measured to need — which is the wrapping defect this plan was opened to fix, bought
   back at a different size. A 25-screen change to improve one card at one viewport is the wrong trade.
3. **REQ-26's second clause was written before the measurement existed.** It expressed an expectation that
   the retirement would cost no density anywhere. That expectation is false in one narrow band, and the
   honest correction is to record where, not to bend the rule until the sentence comes true.

**What the operator actually loses**: on a swarm card at a viewport between roughly 1920px and 2100px, a
services section's eight properties occupy eight lines instead of about four. Nothing is clipped, nothing
wraps, nothing is unreachable; the card is taller. Below that band the delivered build wrapped values over
four to six line boxes, which was worse, and above it two columns return.

**Consequence for the checks**: the measurement stays in the suite as a **recorded measurement of the
accepted outcome**, not as a failing assertion — it pins the figures so that a later change to the minimum,
to the card, or to the quadrant layout is noticed. The four swarm sections remain geometrically unmeasured
on a daemon that is not a swarm manager; nothing in this suite may initialise one, and the check written for
them skips with its reason stated.

**Decided by the orchestrating session** under the human's standing delegation for this tranche, and
**flagged to him explicitly** in the tranche report: it is the one decision here that trades a visible
property of the product for consistency, and it is his to reverse.
| REQ-27 | **Feature code states no column count, no track template and no width for these sections, anywhere in the product**, once this is done — including the `columns={2}` constants and the `Config` tab's `1fr 1fr`. This is grep-able and is checked as such. |

## F4 — Every consuming screen is accounted for, unaffected or correctly affected

| ID | Requirement |
| --- | --- |
| REQ-28 | **The ten further screens that consume the component inherit the correction and are verified**, screen by screen, with the outcome **stated rather than assumed**: images (filesystem browser, image diff, layer explorer), volumes & networks, swarm, plugins, registries, system & prune, contexts, coverage matrix. Free of clipping and overlap at **1280 × 720** and **1920 × 1080**; every property still present with its label and its value. |
| REQ-29 | **The filesystem browser's entry-metadata pane — bug-3's delivered, certified surface — is verified visually unchanged.** Its pane is narrow, so it stays one column; bug-3 is baseline and is not disturbed. |
| REQ-30 | **A surface that still states its own count is not changed by the correction itself.** Until the count is retired (REQ-25), each of the five caller-stated sections renders exactly as delivered, and this is **guarded by an assertion rather than asserted in prose** — so that a change to any of them is attributable to the work that asked for it, not to the shared correction. The guard is deleted by the work that retires the count, which replaces it with REQ-26's measurement. |

## F5 — Nothing else changes

| ID | Requirement |
| --- | --- |
| REQ-31 | **Every property survives, in place, with its label, its value, its formatting and its controls** — the image panel's nine and its `Environment`, `Labels` and `History`; the container panel's `Config` and `Inspect` tabs with everything on them; and the equivalent lists on the ten other screens. Nothing is added, removed, renamed, reworded, reordered, reformatted, truncated or moved behind a disclosure. |
| REQ-32 | **The copy affordance beside a value is untouched** — its position beside its value, its behaviour and its keyboard reachability. **bug-5 concerns it, is worked next, and nothing here anticipates it either way**: a `Copy` visible in this report's screenshot is not licence to move or remove one. |
| REQ-33 | **No flow, no data and no daemon behaviour changes**: no new Docker operation, no change to inspect, formatting or caching, no change to any server response, **no server file in the diff**. |
| REQ-34 | **Row height, type, colour, the band's own padding and the surfaces' visual treatment are unchanged**, and the `Config` tab's **editing form is not touched**. This report moves space; it does not restyle, and it does not buy density out of the type. |
| REQ-35 | **bug-1, bug-2 and bug-3 are undisturbed** — the progress dialog and its self-dismissal, the direct route into the filesystem browser, and the browser's interior layout including `BandStack`, the `SplitPane` fill mode and the `TreeView` fill mode. **None of bug-3's primitives is reused here**: they distribute height in a bounded surface, and this is width in an unbounded flow. |
| REQ-36 | **No raw markup, no CSS and no hard-coded spacing, size, radius, colour, breakpoint or z-index outside the library.** A `style={{ … }}`, a local stylesheet or a media query written on a feature screen is not an acceptable outcome under any schedule pressure. Gaps, minimum widths and maximum widths are library tokens or library-internal constants, not lengths written at a call site. |
| REQ-37 | **The blur allow-list is untouched.** None of these surfaces is on it, none joins it, no blur value is written anywhere, and `client/scripts/check-ui-conformance.mjs` is **not modified** and passes. |
| REQ-38 | The module indexes and component specs under `.sdd/modules/` are brought into line with what this fix changes: the property list's derived column rule, its three content classes with their stated minima and maxima, the retirement of the caller-stated count, the `Config` tab's library-stated responsive split, and the classification recorded for every call site. **English only**; kebab-case for any new file or folder name. |

## F6 — How this is checked

| ID | Requirement |
| --- | --- |
| REQ-39 | **The checks assert measured geometry**: the column count at a stated, measured section width; the section's measured height against the delivered build's at the same viewport; every value's measured box inside its band; no label box intersecting a value box; the section's box inside its container's. **The column count is deduced from measured band positions** — bands sharing a top edge are one line — **never from a class name, an attribute or a prop**, which would certify the implementation instead of the result. |
| REQ-40 | **Content assertions certify nothing here and must not stand alone.** *"Nine properties are listed"*, *"`Exposed ports` is displayed"*, *"the panel contains 1154 characters"* are all true of the screenshot in this bug report. They may stand **beside** the geometric assertions where they answer a different symptom — a section present and blank — never instead of them. |
| REQ-41 | **Every interaction is driven with a real pointer at the visible control's coordinates**: clicking the image row to expand the panel, clicking the container row, clicking the `Inspect` and `Config` tabs, clicking a `CollapsibleSection` header to open `Environment`. Never `element.click()`, never a dispatched event, never a visually hidden target. |
| REQ-42 | **The checks are observed failing on the delivered build**, before the correction exists, and the implementer reports **the measurement produced before the fix and after it**. The delivered build's numbers are on record: one column at every width; ~330px for the image panel's nine properties and ~366px for the container's ten, **identical at 1280px and at 2560px**; ~1170px of empty middle on the `Created` band at a 1458px section; a ~150–180px cell on the five caller-stated surfaces at narrow widths. A "before: failed" with no numbers is not evidence on a layout defect. |
| REQ-43 | **Geometry is never asserted in jsdom.** jsdom has no layout and reports every box as zero, so a column-count or height assertion written as a unit test passes on any build, defect included. **Every geometric assertion lands in the Playwright tree**; component-level checks are about **contract and state only** — the content class a call site declares, no count or length passed by feature code, every property rendered in order, the markup association of label to value — and each says so on the spot. |
| REQ-44 | **The verification obeys the project's test discipline against the real daemon**: its own fixtures carrying the ownership labels — the mirrored `alpine:3.20` for the image panel (nine properties, a 30-character `Created`, an em dash for `Entrypoint`) and a container created from the suite's own tiny image — removed in full in a `finally` with `docker rm -fv`, no assumption of an empty daemon, no inherited application state, its own data directory, **no test reaching Docker Hub**, and **every spec passing on its own**. |
