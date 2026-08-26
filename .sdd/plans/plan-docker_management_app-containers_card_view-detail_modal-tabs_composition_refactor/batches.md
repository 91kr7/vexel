---
slug: docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor
date: 2026-08-26
spec: .sdd/analysis/docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor.md
requirements: requirements.md
status: validated
---

# Batches — The seven tabs of the container detail, recomposed

Nine batches, one per change point of the mock's summary table, in build order. Requirement ids are
this plan's (`requirements.md`); intervention ids are local to each batch file.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| `stable-detail-height` | F0 — One height for the whole detail, and the tab's content scrolls inside it | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5 | — | certified | The dialog stays exactly where it is while the operator moves between tabs |
| `detail-identity-header` | F1 — The header carries the container's identity | REQ-6, REQ-7, REQ-8, REQ-9, REQ-10 | `stable-detail-height` | certified | The dialog's header says as much as the card the operator just left |
| `config-first-tab` | F1b — Config is the first tab and the one active on open | REQ-11, REQ-12 | `stable-detail-height`, `detail-identity-header` | implemented | The detail opens on the tab it draws first |
| `config-reading-layout` | F3 — Config in reading | REQ-18, REQ-19, REQ-20, REQ-21, REQ-22 | `stable-detail-height` | todo | The environment variables can be read down the keys |
| `config-editing-cards` | F4 — Config in editing | REQ-23, REQ-24, REQ-25, REQ-26 | `stable-detail-height`, `config-reading-layout` | todo | The edit form reads as groups instead of one long column |
| `stats-two-plus-three` | F2 — Stats is two metrics with a ceiling, then three without | REQ-13, REQ-14, REQ-15, REQ-16, REQ-17 | `stable-detail-height` | todo | The bars are only where a bar can mean something |
| `log-controls-and-levels` | F5 — The log controls in two groups, and the lines distinguished | REQ-27, REQ-28, REQ-29, REQ-30, REQ-31 | `stable-detail-height` | todo | The controls that reopen the stream are told from the ones that do not |
| `processes-fills-its-tab` | F6 — The process table takes the height it is offered | REQ-32, REQ-33 | `stable-detail-height` | todo | The process list uses the room the dialog gives it |
| `inspect-grouped` | F6b — Inspect grouped, and a bad exit code that reads as one | REQ-34, REQ-35, REQ-36, REQ-37, REQ-38, REQ-39, REQ-40, REQ-41, REQ-42, REQ-43, REQ-44, REQ-45 | `stable-detail-height` | todo | What the container is, and how it has gone, read as two questions |

**Why this order.** `stable-detail-height` is first because the mock says so and because the reason
is structural: Processes and the terminals cannot take the available height while the available
height is whatever they take. It is a dependency of all eight others for a second reason too — each
of them recomposes a tab body that has to fit the definite height F0 introduces, and each of their
checks asserts the dialog's box across the interaction it drives (REQ-44); a tab laid out against a
frame that still moves would be laid out twice. Beyond that the spec says the rest may follow in any
order, and the order in the table is the human's, chosen on 2026-08-26. The two dependencies inside
that order are real and not conventional: `config-first-tab` follows `detail-identity-header` because
both rewrite the same checks, and `config-editing-cards` follows `config-reading-layout` because the
latter moves the control that enters the former's mode.

**The two cheap, undebatable points are scheduled early**, as the spec asks: `detail-identity-header`
is a regression against a mockup already approved, and `processes-fills-its-tab` removes a measure
taken for a surface that no longer exists. The second is late in the table only because it cannot
precede F0.

## Departures from the spec

None. Every decision below is inside the spec's scope, and the four points put to the human at the
requirements validation were all answered with the default this plan proposed
(`requirements.md`, "Values and readings fixed in these requirements").

## What this plan supersedes, deliberately and by name

A certified requirement is not quietly dropped here. Five are affected, and each is written into the
batch that touches it so nobody has to find this list first.

1. **`plan-docker_management_app-containers_card_view-detail_modal/REQ-4` — content parity.** The
   whole reason this plan exists; already stated at the head of `requirements.md`. It is the only
   requirement of that plan this supersedes.
2. **`plan-ui-coherence-optimisation/REQ-64` — every metric tile carries a meter**, whose spec calls
   a tile without one *"a defect and not a variant"* (`ui-library/specs/metric-primitives.md`,
   `containers/specs/container-stats-view.md`). F2's REQ-15 removes the meter from the three metrics
   with no ceiling. The library rule it rests on — "a bar is never merely absent where a limit is
   unknown, so a caller with no maximum still asks for a `Meter` and gets the state that says so" —
   stays true of every caller that asks for a `Meter`; what changes is that these three stop asking,
   because a cumulative counter has no maximum *in principle* rather than *unknown at this moment*.
   Batch `stats-two-plus-three`.
3. **`plan-ui-coherence-optimisation/REQ-63` — five tiles in the `even-row` arrangement**, one track
   per tile so no metric is orphaned. F2's 2 + 3 replaces the means and keeps the end: neither row
   orphans anything. Batch `stats-two-plus-three`.
4. **`plan-ui-coherence-optimisation/REQ-78`, `REQ-79`, `REQ-81` — "a field group is not a card"**
   (`ui-library/specs/form-section.md`): no border, background, radius or inset, so that a dialog of
   groups reads as one form rather than as a stack of cards inside a card. F4's REQ-23 asks for
   exactly a container per group. **The collision is narrower than it looks and is not being widened**:
   the Config edit form does not use `FormSection` — it composes `SectionHeader` directly — so the
   component keeps its rule and its own consumers keep their treatment. What changes is one form's
   arrangement, on the one surface the mock draws. Batch `config-editing-cards`.
5. **`plan-ui-coherence-optimisation/REQ-62` — two control rows above the log region and no more.**
   F5 regroups the same controls by what they do and puts the download in the `Read` group, so the
   caller's controls and the download go on sharing one row — which is what REQ-62 asked for; it
   forbade a third row holding the download alone. Refined rather than superseded, and recorded here
   because the check that carries it will be rewritten. Batch `log-controls-and-levels`.

Two more are **preserved and re-asserted rather than superseded**, and are named because a reader
could reasonably expect them to be at risk:
`plan-ui-coherence-optimisation/REQ-65` (the panel must not lose the seven tabs, the two-column
property grid or the raw payload as real selectable text — collapsing the payload is not losing it),
and `plan-docker_management_app-containers_card_view-detail_modal/REQ-25`, whose narrowing this plan
does not reopen but satisfies more strictly: with a stable height the dialog's box is unchanged
across the health-check reveal, which is what the narrowing gave up.

## Assumptions and decisions

1. **F0 is a fourth opt-in on `Modal`, not a second dialog.** The spec's own risk — "a library
   component acquiring a mode for one consumer is how divergence starts" — is answered by the shape
   `fluidWidth` already took: a modifier of `size="large"`, one declaration, compounded with the
   large format's own class so it is inert and source-order-independent elsewhere. Three of the four
   opt-ins on this component are now asked for by this one surface, which is a fact worth noticing
   and not yet a problem: each is a separate decision, each is refused by default, and the four other
   large dialogs take none of them.
2. **The mechanism for "the content scrolls inside" already exists in the library and is not being
   invented.** `BandStack` is bands of chrome above one filling region, and `Modal` already hands a
   `'large'` dialog's bounded height down to a body that holds one. What was missing is that the
   bound is a *maximum*, so a short tab still made a short dialog. F0 turns the maximum into a
   height; the arrangement does the rest. A consequence documented in `modal.md` is now deliberately
   used rather than merely accepted: putting a `BandStack` in this body is what makes the dialog a
   column.
3. **`fill` is the library's established name for "bounded by the region I am placed in".**
   `TreeView` has carried it since `plan-docker_management_app-filesystem_browser_layout`, with
   virtualisation measured from the scroll container itself. `LogStream` (batch
   `stable-detail-height`) and `DataTable` (batch `processes-fills-its-tab`) take that same opt-in
   rather than a second idiom, and every caller that does not ask for it keeps the delivered
   `maxHeight` path exactly.
4. **This plan makes five library changes, where the spec's non-functional section names three.**
   The mock located `Modal`, `Sparkline` and `LogStream`; `DataTable` and `FormFooter` are added.
   Neither is a departure: the binding rule is "every visual element comes from the UI library,
   **extended first where it does not yet cover a point**", and both points are exactly that — a
   table that must fill its region while staying virtualised (F6 cannot be done in feature code
   without a pixel constant, which is what F6 exists to remove), and a form footer that must carry a
   standing note beside its buttons (F4b, which the mock draws inside the footer). Both are small,
   both follow a shape the library already has, and both leave every other caller untouched.
5. **The area fill F2 asks for is already drawn.** `client/src/ui/metrics/Sparkline.tsx` renders a
   tinted area under its line today (`ui-sparkline__area`), so the mock's reading of it as a bare
   polyline is the one finding that does not match the delivered component. The library change
   reduces to the marked final point. Should the area prove invisible in practice, that is a tuning
   of the material inside the library, not a new component.
6. **The header's values cost no new request** (REQ-9). The state and the health outcome are in the
   container data the screen already holds for the card — the daemon's status sentence carries
   `(healthy)` / `(unhealthy)`. If the outcome is not reachable from there, the fallback is the
   inspect data the detail already reads for its Config tab, shared upward rather than fetched a
   second time. Named because "the header shows health" is the one point in this plan that could
   quietly become a second read.
7. **The `ro` / `rw` distinction and the two labelled log-control groups are expected to need
   nothing new from the library.** `Chip` already has an accent tone that marks the salient chip
   among its neighbours, and `DefinitionList` is already label→value bands on aligned tracks. Where
   one of them turns out not to reach — a second chip tone, an inline label for a control group —
   the component is extended first (REQ-38) and nothing is written at the call site.
8. **No figure in the mock is adopted as a value.** `min(78vh, 860px)`, the `%CPU` threshold and the
   log-level thresholds are the mock's proposals; the requirements state the properties and the
   development phase sets the numbers, from tokens where a token exists. The mock's `:root` block is
   never reproduced.
9. **The test trees are not in the indexes**, which map components. The e2e and unit paths named in
   the coverage interventions were located directly; recorded so nobody reads them as an index
   reading that has since drifted. Same note as the predecessor plan's, and for the same reason.
10. **The e2e suite runs once, at the end of the plan**, not per batch — the human's standing
    instruction. Each batch is certified on its own unit and boundary checks plus the specs it
    rewrites; the closing pass is `inspect-grouped`'s INT-5.

## Carried risks

- **A log level deduced from text is a guess, and a wrong guess is worse than no colour** (REQ-29).
  The spec's own first risk. The mitigation is in the requirement — recognised markers only, neutral
  otherwise, the raw text unaltered — and it is the one point of this plan where being conservative
  is worth more than being complete.
- **A fixed height can be worse than a moving one on a short viewport** (REQ-4, REQ-40). Bounded by
  the viewport rather than by a constant, which is why the requirement states both halves; the
  375×812 pass is the check that decides it.
- **Nine points make the regression surface the whole dialog.** F0 first is the mock's own answer,
  and each batch rewrites the coverage it invalidates rather than leaving it to the last one.
- **`Modal` now carries four opt-ins, three of them asked for by one surface.** See assumption 1.
  The signal to watch for is a fifth: at that point the detail's dialog is a component of its own
  wearing another's name.

## Coverage check

**Every REQ is served by at least one INT.** The mapping, by batch:

| REQ | Batch | INT |
| --- | --- | --- |
| REQ-1 | `stable-detail-height` | INT-1, INT-2, INT-3, INT-7 |
| REQ-2 | `stable-detail-height` | INT-1, INT-7 |
| REQ-3 | `stable-detail-height` | INT-3, INT-4, INT-5, INT-6 |
| REQ-4 | `stable-detail-height` | INT-1, INT-2 |
| REQ-5 | `stable-detail-height` | INT-1, INT-7 |
| REQ-6 | `detail-identity-header` | INT-1, INT-2, INT-3 |
| REQ-7 | `detail-identity-header` | INT-2, INT-3, INT-4 |
| REQ-8 | `detail-identity-header` | INT-2, INT-3 |
| REQ-9 | `detail-identity-header` | INT-3 |
| REQ-10 | `detail-identity-header` | INT-1, INT-4 |
| REQ-11 | `config-first-tab` | INT-1 |
| REQ-12 | `config-first-tab` | INT-1, INT-2 |
| REQ-13, REQ-14 | `stats-two-plus-three` | INT-2 |
| REQ-15 | `stats-two-plus-three` | INT-3 |
| REQ-16 | `stats-two-plus-three` | INT-1 |
| REQ-17 | `stats-two-plus-three` | INT-4 |
| REQ-18, REQ-19 | `config-reading-layout` | INT-1 |
| REQ-20, REQ-21 | `config-reading-layout` | INT-2 |
| REQ-22 | `config-reading-layout` | INT-3 |
| REQ-23, REQ-24 | `config-editing-cards` | INT-2 |
| REQ-25 | `config-editing-cards` | INT-1, INT-3 |
| REQ-26 | `config-editing-cards` | INT-4 |
| REQ-27, REQ-28 | `log-controls-and-levels` | INT-2, INT-4 |
| REQ-29 | `log-controls-and-levels` | INT-1, INT-3, INT-4 |
| REQ-30, REQ-31 | `log-controls-and-levels` | INT-1 |
| REQ-32 | `processes-fills-its-tab` | INT-1, INT-2 |
| REQ-33 | `processes-fills-its-tab` | INT-3 |
| REQ-34 | `inspect-grouped` | INT-1 |
| REQ-35, REQ-36 | `inspect-grouped` | INT-2 |
| REQ-37 | `inspect-grouped` | INT-3 |
| REQ-38, REQ-40 | `inspect-grouped` | INT-5 |
| REQ-39 | `inspect-grouped` | INT-5 — also served by `log-controls-and-levels`/INT-5 |
| REQ-41 | `inspect-grouped` | INT-4 — also served by `stats-two-plus-three`/INT-5 and `processes-fills-its-tab`/INT-4 |
| REQ-42 | `inspect-grouped` | INT-4 — also served by `detail-identity-header`/INT-4 |
| REQ-43, REQ-44, REQ-45 | `inspect-grouped` | INT-4, INT-5 — also served by the coverage intervention of every other batch |

**Every INT serves at least one REQ.** No intervention in this plan is enabling-only; there is no
declared exception.

**Eight requirements are completed across several batches, and all eight close in `inspect-grouped`,
the last.** REQ-38 … REQ-45 are the cross-cutting section of `requirements.md`: they are standing
conditions on every intervention of every batch, not work of their own, and each batch's file
restates them by id under "Standing constraints". They are listed in the "REQ closed" column of
`inspect-grouped` alone, and that batch's INT-5 is the pass that closes them over all seven tabs at
once. Nothing about them is deferred: a batch that left the conformance pass red or the blur
allow-list changed could not be certified in the first place.

**Every other requirement closes in exactly one batch**, and the "REQ closed" column, this check and
each batch's frontmatter carry the same list. Two pairs look like they span batches and do not:

- **REQ-3 (the content scrolls inside) and REQ-32 (the process table takes the height offered)** are
  the same mechanism used twice, deliberately written as two requirements so neither batch has to
  half-close the other's. `stable-detail-height` gives the dialog a definite height and makes the log
  region and the terminals take it; `processes-fills-its-tab` is what removes `MAX_TABLE_HEIGHT` and
  makes the table take it. REQ-3 does not wait for F6, and REQ-32 does not begin before F0.
- **REQ-2 (the reveal moves no edge) and REQ-25 (the footer states the recreation cost)** both land
  on the Config edit form. REQ-2 closes in `stable-detail-height`, on the delivered form, and
  `config-editing-cards` re-asserts it on the rearranged one (its INT-4) without reopening it.
