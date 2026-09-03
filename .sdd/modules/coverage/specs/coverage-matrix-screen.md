---
module: coverage
component: CoverageMatrixScreen
type: UI component
---

# CoverageMatrixScreen

**Purpose** → the statement of what this product covers of Docker and what it does not, area by
area, and the Docker baseline that statement holds against next to the daemon currently connected.
It is the coverage half of the screen the navigation labels "About"; the shell renders it under
that screen's own cards.

## Contract

Description:
- Two stacked cards. The first, "Coverage baseline", holds a state strip with the verdict of the
  comparison and the versions under it as a two-column label/value list. The second, "Docker
  capability coverage", holds the matrix itself: one content-sized table row per capability area.
Shows:
- The baseline strip: a state dot and the verdict in words — the connected daemon matches the
  declared baseline (success), is newer than it (warning), is older than it (warning), or could not
  be compared (neutral) — over a monospace facts line carrying both readings: the declared Engine
  API version and docker CLI release, and the daemon's Engine API version and Docker version, or
  the reason the daemon could not be read (REQ-106).
- Under it, the same four readings named one by one, plus the oldest Engine API the daemon accepts
  ("not reported" when it does not say). Every value the daemon did not give reads "unavailable".
- Before the first successful read: the strip states that the baseline is being read; if that read
  failed, the strip carries the shared "could not be loaded" wording and nothing else.
- The matrix, one row per capability area of the coverage map, in the map's own order, each row
  showing:
  - the area's name over what it covers, both in full (no truncation);
  - its coverage state as a badge: "Dedicated screen" (success), "Console only" (warning),
    "Not applicable" (neutral);
  - where it lives: a reference to the covering screen, named as the navigation names it; for a
    console-only area, a reference to the Raw console screen; for a not-applicable area, no
    reference but the stated "no screen, no command" in its place;
  - the command that reaches it and the reason it has no screen, both in full — nothing for an area
    that has its own screen.
- The header of the second card states the totals: how many capability areas there are, how many
  have a dedicated screen, how many are reachable only through the raw console, and how many are
  outside this product.
Actions:
- Following a row's reference makes the screen it names active, through the application's
  cross-navigation service — the same path the Dashboard's tiles take (REQ-105).
- "Re-read" on the baseline strip re-reads it; the strip carries it only beside a baseline that was
  read, so a failed read leaves the header's refresh as the way to ask again.
Navigation:
- The screen navigates away only through a row's reference; it reveals no object of its own and
  never consumes a cross-navigation request.

## Rules and invariants

- Every area of the coverage map is shown; the screen filters, hides and reorders nothing. A gap
  the product has is as visible as a capability it covers (REQ-105).
- No coverage knowledge lives here: the screen renders the map, it does not decide it. Adding,
  removing or moving a capability is an edit to the map alone.
- The declared baseline and the daemon's versions are always shown together, never one without the
  other, so a divergence is read off the screen rather than worked out (REQ-106).
- An unreachable daemon empties neither the matrix nor the declared half of the baseline: only the
  daemon's own readings are missing, and each says so.
- Every row's coverage state and its "where it lives" cell agree by construction: a dedicated-screen
  row always leads to a screen, a console-only row always leads to the Raw console, and a
  not-applicable row leads nowhere.
- The matrix always carries a heading of its own ("Docker capability coverage"): it shares its
  screen with content that is not about coverage, so it is named where it sits rather than relying
  on the screen's title to name it.
- Both of its cards are titled by a `SectionHeader` in its default treatment — the one section-header
  treatment the whole About screen carries, the shell's own cards included, and no title on this
  screen is styled locally (plan-ui-coherence-optimisation/REQ-70).
- The matrix's table states its columns through `DataTable`'s own closed width contract and
  overrides nothing of it: no local track, no intrinsic width, no per-screen rule. A column resolves
  to the same width in the header and in every row because the primitive guarantees it, not because
  this screen arranged for it (plan-ui-coherence-optimisation/REQ-9).
- Every screen a row names is named as the navigation names it at that moment, so relabelling a
  screen is one edit to the navigation data and never one here.
- **No failure panel** (plan-docker_management_app-inline_error_panels/REQ-1): a failed baseline
  read is reported as one toast through `useFailureReport`, and the strip in the baseline's place
  states the shared "could not be loaded" wording — no cause, no control (…/REQ-3, …/REQ-4). The
  coverage map itself is local data and is never affected.

## Dependencies

- ui-library: Badge, Button, Card, CrossReference, DataTable (`autoRowHeight`), DefinitionList,
  MetaCell, SectionHeader, Stack, StateSummaryBar, TwoLineCell (`wrap`)
- coverage: Coverage map, useCoverage
- app-shell: Navigation data (screen labels), CrossNavigationService, useFailureReport,
  FAILED_READ_TITLE

## Requirements served

- plan-docker_management_app/REQ-105
- plan-docker_management_app/REQ-106
- plan-docker_management_app-about_license_notice/REQ-4
- plan-ui-coherence-optimisation/REQ-70
- plan-docker_management_app-inline_error_panels/REQ-1
- plan-docker_management_app-inline_error_panels/REQ-3
- plan-docker_management_app-inline_error_panels/REQ-4
