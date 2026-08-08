---
module: ui-library
component: Callout
type: UI component
---

# Callout

**Purpose** → a persistent, non-dismissible explanatory banner (e.g. the heuristic-signal
disclaimer next to a findings list), distinct from ErrorBanner which only reports a failure.

## Contract

- `<Callout tone? title? children />`
  - `tone` — `'info'` (default) or `'warning'`; drives the accent color and glyph.
  - `title` — optional short heading, bold.
  - `children` — the explanatory body text.

## Rules and invariants

- Never carries a dismiss or retry action: it states a standing fact about the screen, not a
  transient event.

## Dependencies

- Surface, Row

## Requirements served

- plan-docker_management_app/REQ-67
