---
batch: 1 · foundation-ui-shell
feature: F1 — Visual foundation and application shell (enabling)
closed_req: [REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-107, REQ-108, REQ-117]
depends: []
---

# Batch 1 — Visual foundation and application shell

Foundation batch. It creates the UI library's skeleton (tokens, glass material, layout, navigation,
feedback primitives), the application shell, and the mechanical conformance check that keeps
`CLAUDE.md`'s rules enforceable from here on. Every later batch adds to this library rather than
re-styling.

Visual reference: all mockups in `.sdd/analysis/ui-mock/` share this shell; `dashboard.png` and
`containers.png` show it best.

INT-16 and the glass-material revision of INT-1/INT-2/INT-3 were added on 2026-08-06, after this
batch was certified, during a visual rework driven by the reference app: surface alpha lowered and
the backdrop's glows widened so panels read as glass rather than flat black, the shell chrome
changed from docked to floating (see "Departures from the spec" in `batches.md` — the mockups are
still authoritative and will be regenerated with the new graphics), and the responsive behaviour of
REQ-117 added.

| ID | Type | Where | What | REQ | Depends |
| --- | --- | --- | --- | --- | --- |
| INT-1 | create | client, UI library (`client/src/ui/`) | Design-token layer: color roles, typography scale, spacing, radii, borders, elevation/shadow, z-index, and the alpha/overlay values of the glass material. Single source of truth, referenced by name; no literal values anywhere else. | REQ-3, REQ-4 | — |
| INT-2 | create | client, UI library (`client/src/ui/`) + client static assets | The static, already-blurred background asset and the backdrop surface that layers it under the whole application. No animation of any kind on it, no runtime blur: the blur is baked into the asset. | REQ-3, REQ-107 | INT-1 |
| INT-3 | create | client, UI library (`client/src/ui/`) | Glass material primitives: surface/panel with elevation variants, card, section header, divider, scroll area. Built from translucency, borders, inner highlights and gradient overlays over the backdrop — never `backdrop-filter`/`filter: blur()`. | REQ-3, REQ-4, REQ-108 | INT-1, INT-2 |
| INT-4 | create | client, UI library (`client/src/ui/`) | Layout primitives: application frame with rail / header / content / footer regions, stack, row, grid, spacer — so feature code never needs a wrapper element. | REQ-1, REQ-2 | INT-3 |
| INT-5 | create | client, UI library (`client/src/ui/`) | Navigation primitives: grouped navigation rail, navigation item with two-letter glyph, count badge and active state, and a footer status block. | REQ-1, REQ-2 | INT-3 |
| INT-6 | create | client, UI library (`client/src/ui/`) | Header and control primitives: page header (title, one-line description, trailing actions), status pill, button with primary/secondary/ghost/destructive variants, icon button, badge/tag, keyboard-shortcut hint. | REQ-1, REQ-6 | INT-3 |
| INT-7 | create | client, UI library (`client/src/ui/`) | Feedback primitives: modal and confirmation dialog with a destructive variant (target name + consequence + cancel), toast, inline error banner able to display a raw upstream message verbatim, progress bar, spinner, empty state. | REQ-6, REQ-7, REQ-8 | INT-3 |
| INT-8 | create | client, application shell area | The "Vessel — Docker Control" shell: composes the frame, the grouped navigation of the thirteen screens (Workloads / Artifacts / Environment / Full coverage), the page header and the active-context footer; routes between screens marking the active entry; registers a placeholder screen per area for later batches to replace. | REQ-1, REQ-2 | INT-4, INT-5, INT-6 |
| INT-9 | create | client, application shell area | Application-wide confirmation, error-reporting and pending/progress services that feature code calls to obtain REQ-6/REQ-7/REQ-8 behaviour identically everywhere, without navigation being blocked while an operation runs. | REQ-6, REQ-7, REQ-8 | INT-7, INT-8 |
| INT-10 | modify | `client/src/App.tsx` | Replace the `create-vite` demo component with the shell entry point. | REQ-1 | INT-8 |
| INT-11 | modify | `client/src/main.tsx` | Mount the shell, drop the template stylesheet import, load the UI library's single style entry point instead. | REQ-3, REQ-5 | INT-10 |
| INT-12 | modify | `client/src/App.css`, `client/src/index.css` | Remove the template stylesheets: CSS is allowed only inside `client/src/ui/`; whatever of the reset is still needed moves into the library's own style entry point. | REQ-5 | INT-11 |
| INT-13 | create | client, lint/verification tooling | Automated conformance check that fails on: raw DOM tags, `.css`/CSS-module imports, `style` props and visual `className` outside `client/src/ui/`; and on `backdrop-filter` or `filter: blur(...)` anywhere, except entries of an explicit, commented exception list. | REQ-5, REQ-108 | — |
| INT-14 | modify | `package.json` (repository root), `client/.oxlintrc.json` | Wire the conformance check into the standard `npm run lint` / `npm run test` commands so it runs by default for every later batch. | REQ-5, REQ-108 | INT-13 |
| INT-15 | create | client, UI library (`client/src/ui/`) | The library's public entry point: everything above is exported from it, and it is the only import path feature code uses. | REQ-5 | INT-4, INT-5, INT-6, INT-7 |
| INT-16 | modify | client, UI library (`client/src/ui/`) | Responsive shell: tablet/phone breakpoints on the frame, the rail becoming an off-canvas drawer below the phone breakpoint with a header menu control, a dimmed scrim and close-on-select/scrim/Escape, and wrapping of the header's title/description/actions so they never overflow their card. | REQ-117 | INT-4, INT-5, INT-6 |
