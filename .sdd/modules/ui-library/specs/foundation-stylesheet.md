---
module: ui-library
component: Foundation stylesheet
type: configuration
---

# Foundation stylesheet

**Purpose** → the UI library's single style entry point: the only stylesheet the application
bootstrap imports directly.

## Contract

- Imports the design tokens.
- Applies the base reset: `box-sizing: border-box` everywhere, full-height `html`/`body`/`#root`,
  body typography and background from tokens, form-control font inheritance.
- Applies one themed, thin scrollbar treatment (`scrollbar-width`/`scrollbar-color` and the
  `::-webkit-scrollbar*` pseudo-elements, sized from `--scrollbar-width`) to every scrollable
  element in the app, so no component restyles its own scrollbar.

## Rules and invariants

- Every other stylesheet in the library is imported by the component that owns it, not by this
  file: this file only carries global, cross-cutting rules — the scrollbar treatment is the one
  deliberate exception, kept here as a single source of truth instead of repeated per scrollable
  component.
- Styling `::-webkit-scrollbar` opts the app out of the platform's overlay scrollbars, so from here
  on every scrollbar occupies real layout space inside its scroll container. Any layout that must
  stay aligned with a non-scrolling sibling has to account for that width — and cannot read it from
  `--scrollbar-width` alone, since `scrollbar-width: thin` makes the engine substitute its own
  value (see `frame.md`, which measures the real gutter at runtime).
- `body` is `overflow: hidden`: the page itself never scrolls. Frame is the only component that
  establishes its own fixed-height, independently-scrolling regions (see `frame.md`).

## Dependencies

- Design tokens

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-5
