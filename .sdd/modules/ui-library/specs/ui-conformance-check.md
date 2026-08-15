---
module: ui-library
component: UI conformance check
type: build check
---

# UI conformance check

**Purpose** → guards, at build time, the rules feature code and the UI library cannot be trusted
to keep on their own: the UI-library boundary (no raw DOM tag, no CSS, no `className`/`style` prop
outside `client/src/ui/`), the blur policy (a runtime blur only on the allow-listed overlay
surfaces, only with the bounded blur token), and the call-site budget of a list component being
retired.

## Contract

- runs as a Node script over every `.ts` / `.tsx` / `.css` file under `client/src/`, invoked by the
  client workspace's lint and test commands
  - no violation → exit code `0`, one line on stdout saying the check passed
  - one or more violations → exit code `1`, and on stderr one line per violation followed by their
    count and a pointer to `CLAUDE.md`
- every violation line names the file (relative to the client workspace) and the line number

### Boundary violations (feature code — everything under `client/src/` except `client/src/ui/`)

- a raw DOM tag in JSX → reported as `raw DOM tag "<tag>"`
- a `className` or a `style` prop on a JSX element → reported as `"className" prop` / `"style" prop`
- an `import` of a `.css` file whose specifier does not target the UI library → reported as
  `CSS import outside client/src/ui/`

### Retirement budget (feature code only)

- the number of `<CardList` call sites in feature code is **pinned**, not bounded: the script holds
  the expected count and reports a violation when the actual count differs **in either direction**
  - more than expected → a screen acquired a new call site while the component is still exported
  - fewer than expected → a migration landed without the budget being lowered on purpose
- the violation line states both counts, which direction they differ in, and what to do about it; it
  carries no file or line number, being a fact about the tree rather than about one file
- the expected count is **17** at the start of `plan-ui-coherence-optimisation`, lowered by each
  screen migration in its own commit, and **zero** at the deletion — at which point the check is
  removed together with the component

### Blur policy (every stylesheet under `client/src/`, the UI library's own included)

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
- The check reads text: it is a single pass with no dependency beyond TypeScript's own parser
  (already a client dependency) and never needs a CSS engine. Comments and quoted strings inside a
  stylesheet neither hide a declaration nor shift the line a violation is reported on.
- A violation of one rule never suppresses the reporting of another: every violation found in the
  pass is listed.
- **The retirement budget is pinned rather than a ceiling**, and that is the point: the migrations
  it runs alongside *remove* call sites, so a count that merely fell would look like progress and
  hide a new one appearing beside it. Requiring the number to be lowered deliberately is what makes
  each migration state how much it retired.
- The budget counts feature code only. The component's own definition, its spec and its export are
  not call sites, and the library removing it is what takes the count to zero — not the check.
- **The budget lives in the boundary half of the script and touches nothing in the blur half.**
  `blurAllowedOverlaySelectors` and every blur rule stay byte-identical across the plan that adds
  this budget and the batch that removes it; an edit to the blur half is a signal that something
  went wrong, to be reported rather than made.

## Requirements served

- plan-docker_management_app/REQ-5
- plan-docker_management_app/REQ-108
- plan-liquid_glass_overlays/REQ-8
- plan-liquid_glass_overlays/REQ-9
- plan-ui-coherence-optimisation/REQ-84
- plan-ui-coherence-optimisation/REQ-94
