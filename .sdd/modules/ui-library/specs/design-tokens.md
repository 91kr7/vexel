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
  - Elevation: `--shadow-{1,2,3}`.
  - Z-index: `--z-{backdrop,shell,content,overlay,modal,toast}`.

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

## Requirements served

- plan-docker_management_app/REQ-3
- plan-docker_management_app/REQ-4
