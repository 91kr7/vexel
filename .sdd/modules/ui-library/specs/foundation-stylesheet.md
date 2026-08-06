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

## Rules and invariants

- Every other stylesheet in the library is imported by the component that owns it, not by this
  file: this file only carries global, cross-cutting rules.

## Dependencies

- Design tokens

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-5
