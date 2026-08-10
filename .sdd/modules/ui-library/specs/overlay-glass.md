---
module: ui-library
component: Overlay glass material
type: configuration
---

# Overlay glass material

**Purpose** → the one definition of a runtime-blurred glass material in the application, carried by
the surfaces drawn above what they cover and present only while an interaction or a state lasts.
The main view's material is untouched by it and computes no blur.

## Contract

- Named `.ui-overlay-glass`. A surface carries it in one of two ways:
  - a `Surface` asked for `material="overlay"` (see `surface.md`) — this is how the dialog
    surfaces and the toasts get it;
  - a surface that is plain CSS rather than a `Surface`, which declares the material on its own
    rule from the same tokens: the `Combobox` popup, and — at the phone breakpoint only — the
    navigation drawer card and its scrim. A class cannot be scoped to a media query, which is the
    only reason those three are written out; no value of the material is defined twice.
- What a carrying surface presents:
  - what is behind it is rendered blurred, at `--blur-overlay`, so its edges and text are not
    legible through the surface;
  - a translucent fill (`--overlay-glass-background`) and a strong hairline border, so it reads as
    glass rather than as a frosted rectangle. No gradient is laid over the fill: the blurred
    content behind it is what gives the surface its depth, and a light wash on top only greyed it
    out;
  - the geometry, padding, radius and shadow of the surface it is applied to — the material changes
    the fill and the blur, nothing else.
- Two guarded degradations, both at the same geometry and both keeping the documented text
  contrast:
  - the browser supports no backdrop blur → the fill goes near-opaque
    (`--color-surface-overlay-dense`), so the covered content stays unreadable without the blur
    doing that work;
  - the operator's system asks for reduced transparency → the surface drops the blur and presents a
    fully opaque fill (`--color-surface-overlay-opaque`).

## Rules and invariants

- The blur radius is `var(--blur-overlay)` and nothing else: no carrying surface declares a blur
  length of its own, and none may exceed the token's value, which is documented as the maximum.
- Only an allow-listed overlay surface may carry it; the allow-list is stated in `CLAUDE.md` and
  enforced by the UI conformance check (`ui-conformance-check.md`). `.ui-overlay-glass` is itself
  an allow-listed selector.
- The material never lands on `.ui-surface` or on any of its elevations: a `Surface` that does not
  ask for it is unchanged, and so is every main-view panel built on one.
- The blur is declared with its `-webkit-` counterpart, prefixed first and standard last, so it
  takes effect on WebKit-based browsers as well as on Chromium and Firefox.
- Two carrying surfaces are never nested inside one another: an element carrying a backdrop blur
  becomes the backdrop root of its descendants, so a nested pair would resample an already-blurred
  layer and pay twice for one effect. The dialog scrim is therefore deliberately not a carrier
  (see `modal.md`); the drawer and its scrim are siblings, so both are.
- The fill is selected once, centrally, and every carrier names the same variable: a surface never
  states its own fallback for either degradation.
- The translucent fill's alpha (44%) is within the range the token contrast verification already
  covers (`--color-surface-1`/`--color-surface-2`, 36–44%), and both fallbacks are more opaque
  still, so text on a carrying surface keeps the documented contrast in all three states.

## Dependencies

- Design tokens (`--blur-overlay`, `--overlay-glass-saturation`, `--color-surface-overlay`,
  `--color-surface-overlay-dense`, `--color-surface-overlay-opaque`, the border roles)

## Requirements served

- plan-liquid_glass_overlays/REQ-1
- plan-liquid_glass_overlays/REQ-6
- plan-liquid_glass_overlays/REQ-7
- plan-liquid_glass_overlays/REQ-11
- plan-liquid_glass_overlays/REQ-12
- plan-liquid_glass_overlays/REQ-13
