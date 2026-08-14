---
module: ui-library
component: Design tokens
type: configuration
---

# Design tokens

**Purpose** → single source of truth for every color, typography, spacing, radius, border,
elevation and z-index value used across the application; every UI-library component references a
token by name, never a literal value.

## Contract

- CSS custom properties on `:root`, grouped as:
  - Color roles: `--color-void`, `--color-surface-{1,2,raised,sunken}`, `--color-border-{subtle,strong}`,
    `--color-highlight-{top,bottom}`, `--color-text-{primary,secondary,muted,inverse}`,
    `--color-accent{,-strong,-tint}`, `--color-{success,warning,danger,info}{,-tint,-strong}`.
  - Categorical palette: `--color-series-{1,2,3,4}` — four colors for telling the slices of one
    whole apart (a usage breakdown, a legend). They carry no meaning: series 4 is not "worse" than
    series 1, it is only the fourth category.
  - Typography: `--font-family-{sans,mono}`, `--font-size-{xs,sm,md,lg,xl,2xl}`,
    `--font-weight-{regular,medium,semibold,bold}`, `--line-height-{tight,normal}`.
  - Spacing scale: `--space-1` (4px) through `--space-10` (64px).
  - Radii: `--radius-{sm,md,lg,xl,full}`.
  - Borders: `--border-width-hairline` (1px).
  - Scrollbars: `--scrollbar-width` (8px) — the styled scrollbar's width. Styling
    `::-webkit-scrollbar` opts out of the platform's overlay scrollbars, so this is real layout
    space a scroll container takes out of its content area. Layouts aligning a scrolling region
    with a non-scrolling sibling subtract it. Note this value is a **fallback**: the true gutter
    varies by browser/platform and is measured at runtime where alignment depends on it (see
    `frame.md`).
  - DataTable action column sizing: `--data-table-action-column-width` (296px) — a column holding a
    row's action group, sized for up to four dense action controls on one line — and
    `--data-table-menu-action-column-width` (64px) — the same column once its action set has come
    down to the overflow control alone, sized for that one trigger plus the cell's own breathing
    room and its column header. A screen picks the one that matches what its rows carry; neither
    value is ever written on a screen. Both are **fixed**, which is also what keeps an action
    column out of the width pressure the column minimum below answers: it holds these pixels at
    every width and neither grows nor shrinks with the data columns beside it.
  - DataTable column minimum: `--data-table-column-min-width` (72px) — the floor under a
    **flexible** column, scaled by its flex factor (a `1fr` track never resolves below 72px, a
    `1.8fr` track never below 1.8 × 72px), so a table narrower than its columns need keeps the
    proportions it was declared with instead of equalising them, and no track reaches 0px. It is
    the smaller of two figures: what a dense cell's content needs (~7.8px per character at the 13px
    monospace, so 72px carries `128.4MB`, `443/tcp` or `0%` plus the ellipsis that says there is
    more) and what the delivered desktop allows — it must bind **nowhere** at 1440×1000 or
    1280×800, and the narrowest per-`fr` share any shipped table resolves at 1280×800 is 79.7px
    (containers; images 107.6px, coverage 123.2px, the dashboard's list 121.8px, the layer explorer
    ~100px). Never written at a call site; a column that needs a different floor states it through
    `DataTable`'s own `minWidth`.
  - Property-band sizing by content class: `--band-min-pair-{short-scalar,long-single-line}`
    (360px / 560px), `--band-min-value-{short-scalar,long-single-line}` (240px / 460px) and
    `--band-run-max-{short-scalar,long-single-line}` (500px / 700px). The minima decide how many
    bands a property section fits in its own box, the maxima bound the label→value run inside a
    band. Every figure is derived from the content at the 12px monospace the values are drawn in
    (~7.2px per character). Both forms carry the band's own horizontal padding (24px); what a
    `pair` band carries on top of its value is the **label run** — the longest label in these
    sections (~85px) plus the label→value gap (16px), **~100px**. The difference between the two
    shipped minima of a class is therefore **120px for short scalars** (~100px of label run and
    ~19px of rounding 341px up to 360px) and **100px for long single-line text** (459px rounded up
    to 460px, 559px to 560px) — two figures, not one. See `content-columns.md`; none of these is
    ever written at a call site.
  - Overflow menu popup: `--menu-min-width` (236px) and `--menu-max-height` (480px) — the height
    beyond which a popup's entries scroll inside it. A last resort against a popup taller than the
    screen, never a size a menu is meant to reach: a scrolling menu hides the entries below its
    fold, and the last of them is the destructive one. Sized above the tallest menu the product
    builds — ten entries, two group separators and a reason line under every entry that can be
    disabled at once — so that menu is shown whole. It makes no menu taller: a cap only stops
    capping earlier.
  - Elevation: `--shadow-{1,2,3}`.
  - Z-index: `--z-{backdrop,shell,content,overlay,modal,toast}`.
  - Overlay glass: `--blur-overlay` (20px) and `--overlay-glass-saturation` (140%), plus the three
    fills the material degrades between — `--color-surface-overlay` (blurred),
    `--color-surface-overlay-dense` (no backdrop blur available),
    `--color-surface-overlay-opaque` (reduced transparency). See `overlay-glass.md`.

## Rules and invariants

- Every color pairing used for body or secondary text on a glass surface meets at least a 4.5:1
  (body) / 3:1 (secondary, large text) contrast ratio against `--color-surface-1`/`--color-surface-2`
  (REQ-4): `--color-text-primary` (#eef0f5) and `--color-text-secondary` (#a4abbd) on
  `--color-surface-1`/`--color-surface-2` clear these ratios across the full range of the Backdrop
  (from its darkest point, `--color-void`, to the brightest point inside a glow), verified
  computationally at both ends (2026-08-06): worst case ≥13.7:1 primary / ≥6.8:1 secondary over the
  void alone, ≥9.4:1 primary / ≥4.7:1 secondary over the most saturated glow.
- Surface alpha is deliberately low (34–52%, `--color-border-subtle`/`--color-highlight-top` raised
  to compensate) so the Backdrop's color visibly bleeds through glass panels rather than reading as
  a flat, near-opaque dark fill — revised 2026-08-06 after the initial batch-1 values (55–76% alpha
  over a near-black `--color-void`) read as solid black in practice, especially away from the
  Backdrop's corner-concentrated glows.
- No component under `client/src/ui/` hard-codes a color, radius, spacing, shadow or z-index value
  outside this file; it references the token by name.
- A `DataTable` renders each row as its own independent grid, so a column carrying an action group
  must use one of the two fixed action-column tracks above rather than a fractional or
  content-based one: a track sized narrower than the controls it holds clips them past the row's
  edge, silently. The wider of the two is shared by every screen whose rows still carry buttons, so
  a screen whose action set shrinks moves to the narrower token instead of narrowing the shared one.
- A fixed action track never consumes the row: what made it look as though it did at 375px was the
  other side of the same grid — six flexible tracks resolving to 0px each — not the fixed track
  growing. Measured on the delivered build, the containers cluster's four controls and its menu
  trigger ink 189px of the 296px, and the track is 296px at 1440, at 1280 and at 375 alike.
- `--blur-overlay` (20px) is the **only** blur value in the codebase and is documented as the
  **maximum** any surface may use: no component declares a blur length of its own, and none asks
  for a larger radius. The three overlay fills are the same hue as `--color-surface-raised`
  composited over `--color-void`, so a surface degrading to one of them keeps its colour and the
  text contrast guaranteed above.
- The categorical palette is kept to four entries: a breakdown that needed more would be relying on
  two colors an eye cannot separate. Three of the four reuse the accent, success and warning roles
  by reference, so the palette cannot drift away from the rest of the interface.

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-4
- plan-liquid_glass_overlays/REQ-6
- plan-docker_management_app-image_row_actions/REQ-18
- plan-docker_management_app-image_row_actions/REQ-34
- plan-ui-coherence-optimisation/REQ-7
- plan-ui-coherence-optimisation/REQ-9
