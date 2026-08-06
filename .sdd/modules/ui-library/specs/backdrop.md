---
module: ui-library
component: Backdrop
type: UI component
---

# Backdrop

**Purpose** → the application's background: a static, already-blurred image asset layered behind
the whole shell.

## Contract

Description:
- A fixed, full-viewport layer rendering `backdrop-asset.svg` (a static gradient composition, no
  raster blur filter, no animated primitives) with `object-fit: cover`.
Shows:
- The background image, nothing else; carries no text or interactive content.

## Rules and invariants

- Nothing on this component is animated: no CSS `animation`/`transition`, no looping video, no
  canvas draw loop, no scroll-linked transform (REQ-107).
- Never applies `backdrop-filter` or `filter: blur(...)`; the blur, where present, is baked into
  the asset at authoring time, not computed by the browser (REQ-108).
- Rendered exactly once per page (by `Frame`), positioned behind every other surface via
  `--z-backdrop`.
- The asset's colour glows must reach the centre of the viewport, not only its corners: the glass
  material is translucency over this asset, so wherever the backdrop is flat the panels above it
  have no colour to transmit and read as flat dark fills. Revised 2026-08-06 — the original
  corner-concentrated composition left the whole content column colourless, which is what made the
  panels look black (see `design-tokens.md` for the matching alpha change).

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-107
