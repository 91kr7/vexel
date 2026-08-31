---
module: ui-library
component: UI conformance check
type: build check
---

# UI conformance check

**Purpose** → guards, at build time, the rules feature code and the UI library cannot be trusted
to keep on their own: the UI-library boundary (no raw DOM tag, no CSS, no `className`/`style` prop
outside `client/src/ui/`), the blur policy (a runtime blur only on the allow-listed overlay
surfaces, only with the bounded blur token), and the retirement of the card-per-row presentation
(no surface per row, in the library or rebuilt by hand in a feature file).

## Contract

- runs as a Node script over every `.ts` / `.tsx` / `.css` file under the **tree it is given as its
  first argument**; with no argument that tree is `client/src/`, resolved from the script's own
  location, which is how the client workspace's lint and test commands invoke it
  - no violation → exit code `0`, one line on stdout saying the check passed
  - one or more violations → exit code `1`, and on stderr one line per violation followed by their
    count and a pointer to `CLAUDE.md`
- everything else is read off that tree, relative to **its parent**: the path each violation names,
  the `ui/` sub-tree treated as the UI library, and the `client/<path>` form the card-row admission
  below is matched against. With no argument the parent is the client workspace, so every message,
  every admission and every exit code is what it was before the argument existed
- every violation line names the file (relative to the scanned tree's parent) and the line number

### Boundary violations (feature code — the scanned tree except its own `ui/` sub-tree)

- a raw DOM tag in JSX → reported as `raw DOM tag "<tag>"`
- a `className` or a `style` prop on a JSX element → reported as `"className" prop` / `"style" prop`
- an `import` of a `.css` file whose specifier does not target the UI library → reported as
  `CSS import outside client/src/ui/`

### Blur policy (every stylesheet in the scanned tree, the UI library's own included)

- a declaration computes a runtime blur when it is a `backdrop-filter` (any vendor prefix) with a
  value other than `none`, or a `filter` whose value carries `blur(` or the blur token
- such a declaration is accepted only when **both** hold, otherwise it is a violation naming the
  selector of the rule that carries it:
  - the rule targets an allow-listed overlay surface — `.ui-overlay-glass`, `.ui-combobox__list`,
    `.ui-frame__rail`, `.ui-nav-rail`, `.ui-log-stream__jump` — otherwise →
    `runtime blur on "<selector>", which is not an allow-listed overlay surface`
  - its value is bound to the token: it references `var(--blur-overlay)`, and every `blur()` it
    contains has exactly `var(--blur-overlay)` as its argument — otherwise →
    `runtime blur on "<selector>" must be valued var(--blur-overlay), not a blur length of its own`
- a pseudo-element on an allow-listed selector (`.ui-overlay-glass::before`) is the surface itself,
  not a descendant of it, and is accepted: the material declares its blur on exactly that layer, so
  that no overlay surface becomes a backdrop root (`overlay-glass.md`)
- an allow-listed selector needs **no** exception comment: the allow-list is the rule, not a
  tolerated breach of it
- a `ui-blur-exception:` comment on the declaration's own line or on the line above it exempts that
  declaration from the whole policy — the residual escape hatch for a case outside the list

### The card row stays retired (every file in the scanned tree)

An object list is one table — one header, ruled rows beneath it, **no surface per row**. Both ways
back are refused, and every violation names the decision and points at the record that made it
(`.sdd/analysis/ui-coherence-optimisation-comfortable_variant_retired-classic_table.md`):

- **the library offering it again**
  - a retired name anywhere: the classes `ui-data-table--comfortable` /
    `ui-data-table__row--comfortable`, the type `DataTableVariant`, the carrier
    `ComfortableRowCarrier`, or the string `'comfortable'` — reported as
    `<what it is> ("<the name>")`
  - a rule whose target is a list row (`.ui-data-table__row`, any modifier of it, or
    `.ui-data-table__row-content`) declaring a `border-radius`, an `outline` or a `box-shadow` →
    `a list row given a surface of its own (<property>: <value>)`
  - a rule whose target is a list body (`.ui-data-table__body`) declaring a `gap` or a `row-gap` →
    `a gap between the rows of a list body (<property>: <value>)`
  - a value that switches one off (`none`, `0`, `initial`, …) is not drawing one and is accepted
- **a feature file rebuilding it by hand** — a `Surface` or a `Card` rendered inside the callback a
  collection is mapped through → `a list built as one <Surface> per row`. Read from the syntax
  tree, so a card standing on its own — a screen's own panel, which is what a card is for — is
  untouched; only a surface drawn once per item is reported. Its other form, a stylesheet or a
  visual prop in feature code, is already the boundary half's.
  - **One admission, from 2026-08-25, and it is two literal file paths**:
    `client/src/containers/ContainersScreen.tsx` and `client/src/containers/ContainerCard.tsx`, the
    containers list being drawn as one card per container from that date
    (`.sdd/analysis/docker_management_app-containers_card_view.md`, and the amendment of the same
    date in the record above, which is neither reversed nor re-argued). A surface drawn per item is
    accepted in those two files and reported in every other feature file — containers' own the day
    it moves. The admission is a **path list**, not a directory, a pattern or a component name, so
    widening it is an edit to the script, in the open.
  - The admission reaches **this form only**: in those two files the retired vocabulary is still
    refused by name, and the stylesheet rules above still hold.
- **there is no exception comment for this half**, deliberately: a comment written at the very call
  site that reintroduces the arrangement is how a decision becomes a formality. The blur half's
  `ui-blur-exception:` marker does not reach it, and the 2026-08-25 admission did not add one: an
  admitted path is named in the script, never claimed by the file that needs it.

## Rules and invariants

- The allow-list lives in exactly one place in code, as a named constant of the script; the same
  list is stated in prose in `CLAUDE.md` ("Performance — background and blur"), and the two are
  changed together.
- The blur policy fails **closed**: a declaration whose enclosing rule cannot be read as targeting
  an allow-listed surface is reported, never waved through. This covers a declaration outside any
  rule, one inside an at-rule prelude, one under a selector list of which a single member is not
  allow-listed, and one whose rightmost compound selector is not the allow-listed element itself
  (a descendant of an allow-listed surface is not allow-listed — `.ui-nav-rail .row::before` is
  reported, `.ui-nav-rail::before` is not).
- A class name that merely contains an allow-listed one as a substring (`.ui-nav-rail__brand`
  against `.ui-nav-rail`) is not allow-listed.
- `backdrop-filter: none` and `filter: none` are not runtime blurs: switching the material off — as
  a reduced-transparency rule does — is always permitted, anywhere.
- **The scanned tree is given, never written into.** A check that drives this script points it at a
  tree of its own, outside the repository's source trees: nothing a check creates ever appears inside
  a tree another check reads. That is the whole reason the argument exists, and the script's own
  header states it.
- **A file the scan listed is read with no catch around the read.** An unreadable file inside the
  scanned tree is a broken tree, and the check fails on it rather than stepping over it; no read is
  retried and no failure is swallowed.
- The check reads text: it is a single pass with no dependency beyond TypeScript's own parser
  (already a client dependency) and never needs a CSS engine. Comments and quoted strings inside a
  stylesheet neither hide a declaration nor shift the line a violation is reported on.
- A violation of one rule never suppresses the reporting of another: every violation found in the
  pass is listed.
- **The three passes are independent, and the blur half is untouchable.** The card-row half neither
  reads, shares nor restructures the blur half's state: `blurAllowedOverlaySelectors`, its token
  binding and the five declarations that decide on them are byte-identical to their certified state,
  asserted by name at every revision that has touched the file and in the working tree
  (`test/unit/programme-constraints.test.ts`, `plan-ui-coherence-optimisation/REQ-84`,
  `.../classic-table/REQ-34`). The one thing the two share is the collector every violation lands
  in, and the CSS reader that turns a stylesheet into declarations.
- **The script holds one addition beyond its two original rules, and it is the card row's.** It also
  carried, for the length of `plan-ui-coherence-optimisation`, a pinned call-site budget over the
  retiring second list component (`plan-ui-coherence-optimisation/REQ-94`), failing in either
  direction so that each migration had to lower it deliberately; that one reached zero when the last
  call site was migrated and was removed with the component itself
  (`plan-ui-coherence-optimisation/REQ-82`) — an assertion of zero against a name nothing declares is
  not a guard. The card-row half is not of that kind: the names it refuses can be written again at
  any time, by anyone, which is exactly why it stays. Anything **else** added to this file remains
  the signal that something went where it should not have, hunk by hunk.
- **A widening of the card-row half is a change to a list of paths, and to nothing else.** The
  2026-08-25 admission added a named constant holding two literal paths, the date, the reason and a
  pointer to both records, and one early return in the pass that reads it; it loosened no pattern,
  removed no case and left the blur half byte-identical. A guard widened until it stops catching
  anything is the failure that half exists to prevent, so the admission is stated as paths a reader
  can count.

## Requirements served

- plan-docker_management_app/REQ-5
- plan-docker_management_app/REQ-108
- plan-liquid_glass_overlays/REQ-8
- plan-liquid_glass_overlays/REQ-9
- plan-ui-coherence-optimisation/REQ-84
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-23
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-24
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-33
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-34
- plan-docker_management_app-containers_card_view/REQ-59
- plan-docker_management_app-containers_card_view/REQ-60
- plan-docker_management_app-containers_card_view/REQ-61
- plan-docker_management_app-containers_card_view/REQ-62
- plan-docker_management_app-containers_card_view/REQ-63
- plan-docker_management_app-containers_card_view/REQ-74
- plan-docker_management_app-containers_card_view/REQ-75
- plan-docker_management_app-containers_card_view/REQ-76
- plan-docker_management_app-containers_card_view/REQ-78
