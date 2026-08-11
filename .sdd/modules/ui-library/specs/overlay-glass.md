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
    the fill and the blur, nothing else. The blur covers the whole surface, corners included, and
    stays put while the surface's content scrolls.
- The blur is painted on a layer of the surface's own (`::before`), never by the surface element
  itself, and the layer sits behind the translucent fill. Observable consequence, which is the
  reason it exists: **a carrying surface nested inside another carrying surface blurs correctly,
  and so does the one it is nested in** — an open `Combobox` popup inside a form dialog blurs the
  form rows under it while the dialog goes on blurring the application behind it.
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
- **No carrying surface is ever a backdrop root**, and that is what makes nesting safe. An element
  that declares a backdrop blur becomes the backdrop root of everything inside it, and a backdrop
  blur nested inside such a root renders *nothing at all* in Chromium — the inner surface silently
  stops blurring. This was shipped once and found by the human: the `Combobox` popup opened inside
  the create-container form dialog showed the labels beneath it sharp and readable. Declaring the
  blur on the surface's own pseudo layer — a sibling of its content rather than an ancestor of it —
  removes the root, so every carrier blurs whatever its nesting. Every carrier does it this way, so
  the property holds by construction rather than by anyone remembering it, and the conformance
  check accepts the pseudo-element form of an allow-listed selector precisely so it can stay that
  way (`ui-conformance-check.md`).
- The dialog scrim is still deliberately **not** a carrier (see `modal.md`) — that is a decision
  about how the application should look behind an open dialog, not a technical workaround, and it
  stands unchanged. The drawer and its scrim are siblings and both carry the material.
- One consequence specific to the drawer scrim: it fades with `opacity`, and an element whose
  opacity is below 1 *is* a backdrop root, so the scrim's blur resolves only once its fade has
  settled at 1. The drawer's own material is unaffected, being a sibling rather than a child.
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
