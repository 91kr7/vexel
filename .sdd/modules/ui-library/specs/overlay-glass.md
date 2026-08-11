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

- Named `.ui-overlay-glass`. A surface carries it in one of three ways:
  - a `Surface` asked for `material="overlay"` (see `surface.md`) — this is how the dialog
    surfaces, the toasts and the overflow menu's popup (see `menu.md`) get it;
  - a surface that is not a `Surface` but carries the class itself: the log stream's jump-to-live
    control (see `log-stream.md`), which adds its own geometry and nothing of the material;
  - a surface that is plain CSS rather than a `Surface`, which declares the material on its own
    rule from the same tokens: the `Combobox` popup, and — at the phone breakpoint only — the
    navigation drawer card. A class cannot be scoped to a media query, which is the only reason
    those two are written out; no value of the material is defined twice.
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
  itself, and the layer sits behind the surface's content. Observable consequence, which is the
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
- A surface whose count is not naturally one is capped before it may ask for the material. The
  overflow menu's popup is the case that made this explicit: its trigger sits once per row of a
  list of any length, and the popup is admitted only because at most one menu is open in the whole
  interface at a time (`menu.md`), so what carries the material is one surface, never one per row.
  The triggers themselves carry no overlay material and compute no filter of any kind.
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
- A carrier blurs everything painted behind it up to the nearest backdrop root. When what it has to
  blur is a **sibling inside its own region** — rather than the page beneath an overlay layer — the
  carrier is a stacking context of its own, without which the blur layer is painted underneath that
  sibling and blurs the wrong thing. The two carriers inside the scrolled content flow are exactly
  that case (see `session-chrome.md`, `log-stream.md`). A stacking context is not a backdrop root,
  so this costs the invariant above nothing.
- **No scrim is a carrier** — neither the dialog's (see `modal.md`) nor the drawer's (see
  `frame.md`). A scrim spans the whole viewport, so a blur on one is not a blur on a panel: it is a
  blur of the entire main view, background asset included. Behind an open dialog or drawer the
  application stays sharp and merely dimmed; the carrier is the dialog surface, or the drawer card.
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
- plan-docker_management_app-container_row_actions/REQ-25
- plan-docker_management_app-container_row_actions/REQ-26
