---
slug: docker_management_app-detail_property_columns
date: 2026-08-14
spec: .sdd/analysis/docker_management_app-detail_property_columns.md
requirements: .sdd/plans/plan-docker_management_app-detail_property_columns/requirements.md
status: validated
---

# Batches — A property section arranges itself in the width it is actually given

Fix of the delivered product; bug-4. **Two batches, split by vertical slice, not by layer.** Batch 1
corrects the shared component and delivers the report on the two surfaces the human named, carrying
the twelve-screen sweep with it because it has to. Batch 2 retires the caller-stated column count on
the five surfaces that pass one, and deletes batch 1's guard as its own deliverable. Batch numbers
and `REQ-n`/`INT-n` ids are local to this plan.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · property-section-columns | F1 + F2 — the property list arranges itself by its own width, on the two reported surfaces, with every consuming screen accounted for | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17, REQ-18, REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-28, REQ-29, REQ-30, REQ-31, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36, REQ-37, REQ-39, REQ-40, REQ-41, REQ-42, REQ-43, REQ-44 | — | certified | **First, the report itself, with the mouse, at 1920 × 1080.** Images & layers → click an image row → the panel expands with **the same nine properties, in the same order, with the same values and the same `Copy` beside `Id`** — arranged **across the width in four columns**, not nine stacked bands, and about a third of the height it was. **Look for the empty middle: there is none.** No band anywhere has its label at one edge and its value a metre away; the run from a label to its value is a hand's width. **Then make the monitor the test**, which is the whole of the business complaint: narrow the window to 1280 and the panel goes to **two columns and gets taller**; widen to 2560 and it goes to **five and gets shorter**. On the delivered build all three are **the same one column and the same ~330px**, which is the red these checks must have been seen against. **Then the sections underneath**: open `Environment` and `Labels` — in columns too, **fewer of them**, because their values are longer. Open `History` — **one entry per line, full width, exactly as today**, because a Dockerfile instruction is not a column. Nothing you had to open was open already, and nothing that was open closed. **Then the other half of what he reported**: Containers → a row → `Inspect`: its ten properties on the same rule, `Networks`, `Labels` and `Health` likewise. `Config`: **still the two columns of its mockup**, runtime configuration left, environment · mounts right — and at 2560 the environment entries themselves sit **two per line** instead of one pill per row. **Then the narrow end, which is where a columns fix breaks and nobody looks**: below 720px both panels are **a single column that looks precisely like the delivered build**, the `Config` tab's two columns **stack** instead of being squeezed to ~180px each, and **no digest wraps across three lines** on the way down. Watch the whole way from 2560 to 720: the count only ever falls as you narrow, never rises. **Then the ten screens nobody in this report was looking at** — volumes & networks, swarm, plugins, registries, system & prune, contexts, the coverage matrix, the layer explorer, the image diff: each is denser in the same way, **nothing clipped, nothing overlapping, nothing missing**, and the implementer reports the outcome **screen by screen**, not "all fine". **Then bug-3's surface**: `Browse filesystem…`, select an entry — its metadata pane is **visually unchanged**, one column, as delivered. **Then the four swarm panels and the coverage matrix**, which state `columns={2}` and are **not touched by this batch**: they must look **exactly as they do today**, and a guard asserts it. Improving them here is a refusal — batch 2 owns them, and that is what keeps a regression on them attributable. **Then the diff**: every layout rule is in `client/src/ui/`; `ImageDetailPanel.tsx` and `ContainerDetailPanel.tsx` state **no column count, no track template and no width** — `grep` them for `1fr`, `columns=`, `style=`, `px` and find nothing; no `.css` outside the library, no `ResizeObserver` and nothing measured in JavaScript anywhere; `check-ui-conformance.mjs` **unmodified** and passing; no selector joins the blur allow-list; **no server file in the diff**; and **every `Copy` control is exactly where it was** — bug-5 is the next report and nothing here anticipates it. **Then the evidence the checks could have caught it**: INT-1 to INT-5 **run against this build before INT-6 to INT-11 existed and observed failing, with the numbers** — one column at 1280, 1920 and 2560; ~330px and ~366px measured identically at 1280 and 2560; the measured width of the `Created` band's empty middle — beside the same measurements after. A "before: failed" with no numbers is not evidence on a layout defect and the batch is refused for it. **Test runs are batch-scoped**: `npm run lint`, `npm run test:typecheck -w client`, `npm run test -w client`, and this batch's e2e specs each run on their own. The complete suites are the human's, at the end of the tranche. |
| 2 · derived-count-everywhere | F3 — no caller states a column count | REQ-25, REQ-26, REQ-27, REQ-38 | 1 | certified | **The half of the defect that is already shipped and armed.** Swarm → the services panel → expand a service: its property card sits in half a screen. **Narrow the window until that card is about 400px wide.** On the delivered build the card is **two hard columns of ~150–180px** and a `sha256:` digest **wraps across three lines**; after this batch it is **one column, one line per value, nothing wrapped and nothing clipped**. Do the same on **secrets, configs & stacks, nodes, and the coverage matrix on the About screen** — five surfaces, each one checked at that width, not four and a shrug. **Then widen back to a normal window**: each of them shows **the same two columns as before or more**, never fewer — the operator loses nothing by the count stopping being guessed. **Then the diff**: `columns` is **gone from the component's API**, not deprecated — `grep` the whole of `client/src` for `columns={2}` and for the `--columns-2` class and find **nothing**; and with the `Config` tab's `1fr 1fr` already gone in batch 1, **no feature file anywhere in the product states a column count, a track template or a width for one of these sections**. **Then what must not have moved**: the image detail panel and the container `Inspect`/`Config` tabs are **exactly as batch 1 left them** — same counts at the same widths — and batch 1's guard on these five surfaces is **deleted**, not commented out, replaced by the measurement above. **Then the record**: `.sdd/modules/` states the rule, the three content classes with their stated minima and maxima, and **the class chosen for every one of the ~25 call sites**, so the next screen is written against the rule instead of against a guess. **Then the evidence**: INT-1 run before INT-2 and INT-3 existed and **observed failing with the measured cell width and the wrapped digest's line count** on the delivered build, beside the same measurements after. Batch-scoped runs, as batch 1. |

Batch statuses (`todo | in progress | implemented | certified`) are advanced only by the
orchestrators of the later phases. On green tests a batch goes to `certified`.

Batch files: [`batches/batch-property-section-columns.md`](batches/batch-property-section-columns.md),
[`batches/batch-derived-count-everywhere.md`](batches/batch-derived-count-everywhere.md).

## Why two batches, and why not one — and why not three

**This plan's defining problem is blast radius**, and the split is the answer to it rather than a
tidiness. The delivered `DefinitionList` has 16 feature consumers across 12 screens at ~25 call
sites, and five of them pass a count the fix retires.

**Batch 1 must carry the twelve-screen sweep — it is not deferrable.** The moment the component's
default arrangement changes, it changes under **every** call site that states nothing, which is
twenty of the twenty-five. "Verify every consuming screen unaffected or correctly affected" is
therefore work that belongs to the batch that changes the default, and REQ-28/REQ-29 sit in batch 1
for that reason. A plan that put the sweep in a later batch would be certifying batch 1 on two
screens while ten changed silently.

**Batch 2 is honest because the five caller-stated surfaces are the exact complement of that.** They
pass `columns={2}`, so batch 1's new default **does not reach them at all**: they render byte-identical
before and after, which is why REQ-30 states it as a guarded fact rather than as a hope. Retiring the
count is then a slice with its own observable outcome on its own five screens — a ~400px card that
stops wrapping a 19-character digest across three lines, measured (REQ-26) — and its own deliverable
against the API (REQ-25, REQ-27). It is not three files and no outcome; it is five screens, a public
prop deleted, and a check that is red on the delivered build today and still red after batch 1.

**The price of the split is stated rather than hidden**: batch 1 deliberately preserves a code path
it knows batch 2 deletes — the delivered `columns` prop and its `--columns-2` rule, left untouched
while the derived arrangement becomes the default for callers that state nothing. That is two lines
of preserved CSS in exchange for five screens whose regressions stay attributable to the batch that
asked for them, which is the same trade bug-3 made with its three sibling dialogs and the same guard
shape (its INT-4).

**One batch was considered and refused** because it merges a correction with an API retirement: a
regression on the swarm panels would then be unattributable between "the shared rule changed" and
"this screen stopped stating its count", and those are two different failures with two different
fixes. **Three batches were also refused** — splitting the image panel from the container panel would
put the corrected primitive in a batch and its second consumer in another, which is a layer split
wearing a feature's clothes, and the second batch would close nothing the first had not already made
true.

**Neither batch is a foundation batch**, and no enabling intervention is declared. The library work
in batch 1 (INT-6, INT-7, INT-8) closes REQ-1 to REQ-13 in its own right; it is not scaffolding for a
later batch.

## Assumptions and decisions

- **The mechanism is intrinsic CSS grid against the section's own box** — `repeat(auto-fit,
  minmax(<class minimum>, 1fr))` — which is a container-relative rule that needs no container query,
  no viewport query and no JavaScript. The codebase has no container queries and this fix introduces
  none; it also introduces **no `ResizeObserver` and nothing measured per frame** (REQ-5), which on
  this project's own performance rules would be a defect in itself on a scrolled main view. The
  product already writes this idiom three times unnamed (`.ui-dashboard-layout__tiles`, `Grid`'s
  default, and two feature files); this plan names it once, inside the library, and does **not**
  refactor the three ad-hoc copies — that clean-up is out of scope per the analysis, and pulling it
  in would make a regression on the dashboard unattributable to this report.
- **The gap is `--space-6` (24px), and that is what makes the analysis's figures mutually true.**
  With a 360px minimum and a 24px gap the count is `floor((W + 24) / 384)`: **600 → 1, 900 → 2,
  1300 → 3, 1700 → 4** (REQ-20) and the transitions fall at **744, 1128 and 1512** — exactly the
  three the analysis states. This is recorded as a check that the stated figures are satisfiable
  together, not as a licence to write `24px` anywhere: the value is the token, and if a later report
  changes the token the figures are restated from the same arithmetic. For long single-line text
  (560px minimum) the second column arrives at 1144px of section.
- **The height ceilings are reachable without touching type, padding or row height** (REQ-34), and
  the arithmetic is recorded so that nobody buys them out of the type under pressure. At the delivered
  37px band step, with a 260px docked rail and ~70px of frame: at **1280** the panel measures ~950px →
  2 columns → 5 lines → ~185px against a ceiling of 214px (65% of 330); at **1920**, ~1590px →
  4 columns → 3 lines → ~111px against 148px; at **2560**, ~2230px → 5 columns → 2 lines → ~74px
  against 115px. The container's ten properties clear their own ceilings on the same counts
  (~185/~111/~74 against 238/165/128). Every ceiling clears with margin. **If an implementer finds
  themselves shrinking the type to reach one, the arrangement is wrong, not the type.**
- **The per-class bound and the trailing surplus** (validated at the requirements gate): ~500px is the
  short-scalar maximum, the long-text maximum carries the same **additive** ~140px of headroom
  (~700px), and where a track is wider than its class's maximum the surplus sits at the band's
  **trailing edge**, outside the label→value run. The track still fills the section (REQ-11), so no
  dead margin re-appears on the right.
- **The pair is never split into separate grid items.** The delivered markup is one
  `.ui-definition-list__row` element holding a label span and a value span, and **that element becomes
  the grid item**. A `display: contents` or subgrid arrangement that placed labels in one track and
  values in another would read column-first to a screen reader and would be the "tabular arrangement"
  the analysis explicitly rejected; it is refused here on both grounds (REQ-10, REQ-14). This is the
  most likely wrong implementation of "columns" and INT-5 is written to be red on it.
- **The three content classes are three minima and three maxima, not three components.** One
  library-internal rule expresses "as many bands of at least X as fit", parameterised by the class;
  `DefinitionList` consumes it for label→value pairs and the `Config` tab's environment · mounts list
  consumes it for a list of single values (REQ-19). Two components that look 90% alike is the
  divergence the standing rule exists to prevent, so the rule has one home.
- **`REQ-19`'s visible outcome is a wide-screen one, and that is honest, not a shortfall.** The
  environment · mounts column is half a panel: ~750px at 1920, which is one column at a 560px
  minimum, and ~1100px at 2560, which is two. The delivered one-pill-per-row is therefore corrected
  where the report says the defect lives — on the operator's bigger screen — and the check for it is
  written at a width where the count actually changes, not at 1280 where it legitimately does not.
- **The `Config` tab's split is corrected by extending `Grid`, not by adding a primitive** (INT-8): a
  named, library-owned two-column arrangement that collapses below 720px, alongside the delivered
  free-form `columns` template string, which stays for the screen-level layouts this report leaves
  alone. If the implementer establishes that `Grid` cannot carry it without the caller writing a
  template, a named primitive is created instead and **the reason is recorded on the spot** — an
  extension is preferred, a duplicate is refused.
- **The existing breakpoints are reused; none is invented** (REQ-12). Below 720px of viewport the
  panel is at most ~700px, which is under the 744px two-column threshold, so the one-column
  presentation **falls out of the arithmetic** rather than needing a media query. That is the
  preferred way to satisfy REQ-12, and the check asserts the outcome, not the mechanism.
- **`BandStack` and bug-3's `fill` modes are not reused**, for the analysis's own reason: they
  distribute height in a bounded surface, and this is width in an unbounded flow. Reaching for them
  because they are recent and adjacent is the near-duplicate trap inverted (REQ-35).
- **The filesystem browser is expected to need no edit at all** (REQ-29): its metadata pane holds
  short scalars in a narrow pane, so it takes the default class and stays one column. It is bug-3's
  delivered, certified surface; if it turns out to need an edit, that edit is **reported with its
  reason** rather than made quietly.
- **Every geometric assertion lands in the Playwright tree; jsdom has no layout** (REQ-43). This is
  bug-3's hard-won lesson and it is worth more here than there: a "the section has three columns"
  assertion written as a unit test passes on any build, defect included, because jsdom reports every
  box as zero. INT-5 is therefore **contract and state only** — which class each call site declares,
  that no feature file passes a count or a length, that the pair stays one element, that every
  property still renders in order — and it says so on the spot, standing beside the geometry and
  never instead of it (REQ-40).
- **Column count is deduced from measured band positions**, bands sharing a top edge being one line —
  never from a class name, an attribute or a prop (REQ-39). Asserting on the class the component
  emits would certify the implementation and would have passed on the delivered `columns={2}`
  surfaces too.
- **The column-count checks are asserted inside a band, never on a transition.** The bands are 384px
  wide for short scalars, so the check chooses viewports that land the **measured** section width
  comfortably inside a band, **reports that measured width**, and fails the run if it lands within
  40px of a transition — asserting on a transition is asserting on a rounding rule, which the
  analysis warns against.
- **The fixtures are the suite's own**: the mirrored `alpine:3.20` for the image panel (nine
  properties, a 30-character `Created`, an em dash for `Entrypoint`) and a container created from
  `vexel-test-tiny:1` for the container panel, both labelled, both removed with `docker rm -fv` in a
  `finally`, no reach to Docker Hub, own data directory, every spec passing on its own (REQ-44).
- **`bugs.md` is left untouched**, as in the three sibling plans: it is the human's own input file for
  a tranche of five reports worked one at a time. The plan folder and the commits are the record.
- **`.sdd/.archi` still describes the init-time scaffold**, as it says of itself. Placement follows
  `.sdd/modules/` and the rules in `CLAUDE.md`; the canonical commands come from `.archi`.

## Departures from the spec

**None.** Nothing in this plan contradicts the analysis. Four decisions were taken beyond its literal
text and every one of them is recorded above with its reason: the per-class band bound with additive
headroom (the analysis's ~500px maximum and ~560px long-text minimum are unsatisfiable as one
figure), the reading of "fills its width" as a property of the track with the bound applying to the
label→value run, the 24px gap taken from `--space-6` (which reproduces the analysis's own stated
transitions), and the extension of `Grid` rather than a new primitive for the `Config` tab's split.
All four were put to the human's delegate at the requirements gate and validated there. None changes
what the operator can do, and none widens what is touched.

## Coverage check

**Every REQ is served by at least one INT, and every INT serves at least one REQ.** No enabling
intervention is declared: there is none.

**REQs completed across both batches, with the batch they close in declared:**

- **REQ-27** — *no feature code states a count, a template or a width* — is served in batch 1 (the
  `Config` tab's `1fr 1fr` goes, the two reported panels state nothing) and **closes in batch 2**,
  because it cannot be true product-wide while five call sites still pass `columns={2}`.
- **REQ-38** — *the module indexes and specs are brought into line* — is served by batch 1's INT-13
  and **closes in batch 2**'s INT-5, which removes the retired prop from the component's spec and
  completes the recorded classification of every call site.
- **REQ-30** is the mirror image and closes in **batch 1**: the guard that the five caller-stated
  surfaces are unchanged is batch 1's deliverable; batch 2 deleting it is that requirement being
  retired by the work it was written to attribute, not that requirement being re-opened.
- Every other REQ closes in the single batch that lists it.

**REQ → INT.** Interventions are cited with their batch: `b1/INT-n`, `b2/INT-n`.

| REQ | Interventions serving it | Closes in |
| --- | --- | --- |
| REQ-1 | b1/INT-6, b1/INT-7 (verified by b1/INT-1, b1/INT-2) | 1 |
| REQ-2 | b1/INT-6, b1/INT-7 (verified by b1/INT-1) | 1 |
| REQ-3 | b1/INT-7 (verified by b1/INT-1, b1/INT-5) | 1 |
| REQ-4 | b1/INT-6, b1/INT-7 (verified by b1/INT-2) | 1 |
| REQ-5 | b1/INT-7 (verified by b1/INT-5) | 1 |
| REQ-6 | b1/INT-6, b1/INT-7, b1/INT-9, b1/INT-10, b1/INT-11, b1/INT-12 (verified by b1/INT-5) | 1 |
| REQ-7 | b1/INT-6, b1/INT-7 (verified by b1/INT-1, b1/INT-2) | 1 |
| REQ-8 | b1/INT-6, b1/INT-7 (verified by b1/INT-1, b1/INT-2, b1/INT-3) | 1 |
| REQ-9 | b1/INT-6 (verified by b1/INT-1) | 1 |
| REQ-10 | b1/INT-6 (verified by b1/INT-1, b1/INT-5) | 1 |
| REQ-11 | b1/INT-6, b1/INT-7 (verified by b1/INT-1) | 1 |
| REQ-12 | b1/INT-6, b1/INT-7, b1/INT-8 (verified by b1/INT-1, b1/INT-2) | 1 |
| REQ-13 | b1/INT-6, b1/INT-7, b1/INT-8 | 1 |
| REQ-14 | b1/INT-6 (verified by b1/INT-1, b1/INT-5) | 1 |
| REQ-15 | b1/INT-9 (verified by b1/INT-1) | 1 |
| REQ-16 | b1/INT-9 (verified by b1/INT-1, b1/INT-5) | 1 |
| REQ-17 | b1/INT-10 (verified by b1/INT-2) | 1 |
| REQ-18 | b1/INT-8, b1/INT-10 (verified by b1/INT-2) | 1 |
| REQ-19 | b1/INT-7, b1/INT-10 (verified by b1/INT-2) | 1 |
| REQ-20 | b1/INT-6, b1/INT-7 (verified by b1/INT-1) | 1 |
| REQ-21 | b1/INT-6, b1/INT-9 (verified by b1/INT-1) | 1 |
| REQ-22 | b1/INT-6, b1/INT-10 (verified by b1/INT-2) | 1 |
| REQ-23 | b1/INT-6 (verified by b1/INT-1, b1/INT-2) | 1 |
| REQ-24 | b1/INT-6, b1/INT-7 (verified by b1/INT-1, b1/INT-2, b1/INT-3) | 1 |
| REQ-25 | b2/INT-2, b2/INT-3 (verified by b2/INT-4) | 2 |
| REQ-26 | b2/INT-2, b2/INT-3 (verified by b2/INT-1) | 2 |
| REQ-27 | b1/INT-9, b1/INT-10, b2/INT-3 (verified by b1/INT-5, b2/INT-4) | **2** |
| REQ-28 | b1/INT-11 (verified by b1/INT-3) | 1 |
| REQ-29 | b1/INT-11 (verified by b1/INT-3) | 1 |
| REQ-30 | b1/INT-4 | 1 |
| REQ-31 | b1/INT-9, b1/INT-10, b1/INT-11 (verified by b1/INT-1, b1/INT-2, b1/INT-3, b1/INT-5) | 1 |
| REQ-32 | b1/INT-6, b1/INT-9, b1/INT-10 (verified by b1/INT-1, b1/INT-5) | 1 |
| REQ-33 | b1/INT-6, b1/INT-7, b1/INT-8, b1/INT-9, b1/INT-10, b1/INT-11 | 1 |
| REQ-34 | b1/INT-6, b1/INT-10 (verified by b1/INT-1, b1/INT-2) | 1 |
| REQ-35 | b1/INT-6, b1/INT-7, b1/INT-11 (verified by b1/INT-3) | 1 |
| REQ-36 | b1/INT-6, b1/INT-7, b1/INT-8, b1/INT-9, b1/INT-10, b1/INT-11 (verified by b1/INT-5) | 1 |
| REQ-37 | b1/INT-6, b1/INT-7, b1/INT-8 | 1 |
| REQ-38 | b1/INT-12, b2/INT-5 | **2** |
| REQ-39 | b1/INT-1, b1/INT-2, b1/INT-3, b1/INT-4 | 1 |
| REQ-40 | b1/INT-1, b1/INT-2, b1/INT-5 | 1 |
| REQ-41 | b1/INT-1, b1/INT-2, b1/INT-3, b1/INT-4 | 1 |
| REQ-42 | b1/INT-1, b1/INT-2, b1/INT-3, b1/INT-4 | 1 |
| REQ-43 | b1/INT-5 | 1 |
| REQ-44 | b1/INT-1, b1/INT-2, b1/INT-3 | 1 |

**INT → REQ.**

| INT | REQ served |
| --- | --- |
| b1/INT-1 | REQ-1, REQ-2, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-14, REQ-15, REQ-16, REQ-20, REQ-21, REQ-23, REQ-24, REQ-31, REQ-32, REQ-34, REQ-39, REQ-40, REQ-41, REQ-42, REQ-44 |
| b1/INT-2 | REQ-1, REQ-4, REQ-7, REQ-8, REQ-12, REQ-17, REQ-18, REQ-19, REQ-22, REQ-23, REQ-24, REQ-31, REQ-34, REQ-39, REQ-40, REQ-41, REQ-42, REQ-44 |
| b1/INT-3 | REQ-8, REQ-24, REQ-28, REQ-29, REQ-31, REQ-35, REQ-39, REQ-41, REQ-42, REQ-44 |
| b1/INT-4 | REQ-30, REQ-39, REQ-41, REQ-42 |
| b1/INT-5 | REQ-3, REQ-5, REQ-6, REQ-10, REQ-14, REQ-16, REQ-27, REQ-31, REQ-32, REQ-36, REQ-40, REQ-43 |
| b1/INT-6 | REQ-1, REQ-2, REQ-4, REQ-6, REQ-7, REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-32, REQ-33, REQ-34, REQ-35, REQ-36, REQ-37 |
| b1/INT-7 | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-11, REQ-12, REQ-13, REQ-19, REQ-20, REQ-24, REQ-33, REQ-35, REQ-36, REQ-37 |
| b1/INT-8 | REQ-12, REQ-13, REQ-18, REQ-33, REQ-36, REQ-37 |
| b1/INT-9 | REQ-6, REQ-15, REQ-16, REQ-21, REQ-27, REQ-31, REQ-32, REQ-33, REQ-36 |
| b1/INT-10 | REQ-6, REQ-17, REQ-18, REQ-19, REQ-22, REQ-27, REQ-31, REQ-32, REQ-33, REQ-34, REQ-36 |
| b1/INT-11 | REQ-6, REQ-28, REQ-29, REQ-31, REQ-33, REQ-35, REQ-36 |
| b1/INT-12 | REQ-6, REQ-38 |
| b2/INT-1 | REQ-26 |
| b2/INT-2 | REQ-25, REQ-26 |
| b2/INT-3 | REQ-25, REQ-26, REQ-27 |
| b2/INT-4 | REQ-25, REQ-27 |
| b2/INT-5 | REQ-38 |

**Three notes on the shape of that mapping**, all deliberate:

- **Five of batch 1's twelve interventions are checks, and three of the remaining seven are library
  corrections against three feature files.** That is the correct proportion for a defect whose cause
  is a shared rule: if the diff is mostly `ImageDetailPanel.tsx`, the fix went to the symptom, and
  the analysis names that as the likeliest wrong fix.
- **REQ-33, REQ-36 and REQ-37 are served by interventions as constraints, not as work.** They build
  nothing: they are how the diff is judged — no server file in it, no raw markup, style or hard-coded
  value outside `client/src/ui/`, and no selector added to the blur allow-list.
- **REQ-30 is the only requirement served by an intervention whose job is to leave something alone**
  (b1/INT-4), and it is deliberately stated as an intervention rather than as a sentence, because
  "we did not touch those five screens" is exactly the kind of claim that quietly stops being true.
  Batch 2 deletes it as its own deliverable.

## Risks carried forward

- **A count is hard-coded and the report comes back at a different width.** The likeliest wrong fix,
  named by the analysis: three columns on the image panel, a screenshot, ~180px cells on a laptop and
  eleven screens untouched. b1/INT-1 asserts counts against the **measured section width** at four
  separated widths, so a constant fails three of them.
- **The count is keyed to the viewport.** The second-likeliest, and it reads correct in review because
  the human said "device size". b1/INT-2's `Config`-tab case is what fails it: two sections on **one
  screen at one instant**, at full panel width and at half of it, must show different counts.
- **The pair is split into label and value tracks.** A `display: contents` or subgrid arrangement
  looks like the neatest possible grid and is the analysis's rejected "tabular arrangement": it reads
  column-first to a screen reader and breaks the moment one value wraps. b1/INT-5 asserts the pair is
  one element; b1/INT-1 asserts the reading order.
- **A single minimum is applied to all three content classes.** The part most likely to be skipped,
  and it produces a 400-character `createdBy` in a 360px column — a wasted-space report answered with
  a ragged one. b1/INT-1's `History` and `Environment` cases are what fail it.
- **The narrow end regresses unnoticed.** All attention goes to the wide case the screenshot shows,
  while ≤720px — where the section must simply stay as delivered — is never opened, and the ~400px
  card is where the product is **already** broken. Both are checked, in both batches.
- **The check certifies the wrong thing.** Every character on these surfaces is identical before and
  after, so any assertion on presence, labels, values or counts passes on the defect. This project has
  shipped exactly that mistake, on coverage that counted 1154 characters while the surface sat 1044px
  off screen. Every geometric assertion is reported with its measured value before and after.
- **A geometric assertion is written in jsdom and passes on everything.** Every box is zero there.
  b1/INT-5 is contract-and-state only and says so on the spot.
- **The five caller-stated surfaces are "improved while we are in there" during batch 1.** Each is a
  one-line deletion once the derived arrangement exists, and every one of them would make a regression
  on batch 1 unattributable — and would empty batch 2 of its content. b1/INT-4 guards it; the
  temptation is named here so it is refused knowingly.
- **bug-3's surface is disturbed.** The filesystem browser's metadata pane is a consumer of the
  component being changed, and bug-3 is delivered and certified. It is expected to need no edit; an
  edit it turns out to need is reported with its reason, never made quietly.
- **bug-5 is folded in.** A `Copy` control sits in this report's screenshot and is the subject of the
  next report. Moving or removing one here would make both reports unattributable. The acceptance
  checks for it explicitly.
- **The report is closed on a screenshot.** "It looks better" is how this defect was found and is not
  how it is certified. Without the stated counts and ratios, at the stated widths, failing on the
  delivered build, the sections drift back the next time a property is added.
