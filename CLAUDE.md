# CLAUDE.md

Docker management webapp — npm workspaces monorepo (`client` React 19 + Vite 8, `server` Node +
Express 5), TypeScript everywhere, ESM. See `.sdd/.archi` for the full architecture and
`.sdd/analysis/docker_management_app.md` for the business analysis.

## UI — non-negotiable rule

**Every visual element of this webapp MUST come from the internal UI library. Raw HTML tags and
hand-written CSS are forbidden in feature code.**

The application must present one single, homogeneous visual language (the "liquid glass"
interface). That is only achievable if there is exactly one place where markup, styling and the
glass material are defined. That place is the UI library.

### The boundary

- **UI library** — `client/src/ui/` — the ONLY location in the client allowed to emit raw DOM
  tags (`div`, `span`, `button`, `input`, `table`, …) and the ONLY location allowed to contain CSS.
- **Feature code** — everything else under `client/src/` (pages, views, panels, domain components,
  containers/images/volumes/networks/compose/swarm screens) — composes UI-library components and
  nothing else.

### Forbidden in feature code

- Raw HTML tags. Not `<div>`, not `<span>`, not `<button>`, not `<p>`, not `<ul>`, not `<table>`,
  not even "just a wrapper `<div>`". Use the library's layout primitives instead.
- CSS in any form: `.css` files, CSS modules, `style={{ … }}` inline props, `className` carrying
  visual utility classes, styled-components declared outside the library.
- Hard-coded colors, radii, blur values, spacings, shadows, font sizes, z-indexes. These live as
  design tokens inside the library and are referenced by name.
- Copy-pasting markup from the mockups in `.sdd/analysis/ui-mock/` straight into a feature
  component. The mockups are the visual target, not source code to inline.

### The only escape hatch

Raw markup or a local style is permitted in feature code **only if strictly necessary** — meaning
there is a genuine technical reason it cannot live in the library (e.g. a third-party widget that
demands a specific host element). When that happens:

1. keep it to the smallest possible surface;
2. add a comment on the spot stating why the library could not cover it.

"It was faster", "it is only one element", "it is a temporary placeholder" are not reasons.

### Performance — background and blur

The liquid-glass look must never be paid for at runtime. Two hard rules:

- **The background is static. Never animated.** No animated gradients or meshes, no moving blobs,
  no looping video, no `<canvas>` animation loop, no CSS `animation`/`transition` driving anything
  on the backdrop, no parallax on scroll.
- **The blur is baked into the asset, not computed by the browser.** The background ships
  **already blurred** as a static image. `backdrop-filter: blur(...)` and `filter: blur(...)` are
  forbidden on panels, surfaces, the shell, modals and drawers — anything large or numerous.

Why: `backdrop-filter` forces the compositor to re-render everything behind the element, on every
frame, for every glass surface. With a shell plus stacked panels, drawers and modals — this app's
entire layout — it collapses to single-digit FPS on scroll and resize. A pre-blurred asset costs
nothing to draw.

The glass material is therefore built from **translucency over the pre-blurred background**: alpha
layers, subtle borders, inner highlights and gradient overlays — all as tokens in the library. If a
surface needs to look more blurred, that is a change to the asset or to the alpha, never a new
`blur()`.

The narrow exception: a `blur()` on a small, short-lived, non-repeated element may be acceptable if
measured and justified on the spot, under the escape-hatch rules above. Large surfaces are never
that case.

### How the library grows

The library is **not** built up front. It grows incrementally, batch by batch, as development
proceeds. When a feature needs something the library does not yet provide:

1. add the component (or the token, or the variant) to `client/src/ui/` first — generic, with a
   typed public API, no knowledge of Docker domain concepts;
2. export it from the library's public entry point;
3. only then consume it from the feature code.

Never inline a one-off and promise to extract it later. Extend the library, then use it.

If an existing component almost fits, extend it with a new prop or variant rather than creating a
near-duplicate. Two components that look 90% alike are exactly the divergence this rule exists to
prevent.

### Domain logic

UI-library components stay domain-agnostic: no Docker vocabulary, no API calls, no data fetching.
They receive data and callbacks as props. Docker knowledge lives in the feature layer.

## Visual reference

The intended look and layout for each screen is mocked in `.sdd/analysis/ui-mock/`:
`dashboard`, `containers`, `lmages-layers`, `volume-networks`, `compose`, `swarm`, `registries`,
`build-and-cache`, `context`, `plugins`, `system-and-prune`, `raw-console`.

Read the relevant mockup before implementing a screen. Derive reusable primitives from what
repeats across mockups — those repetitions are the library's component inventory.

## Conventions

- Source code, identifiers, comments: **English only**.
- Package/folder naming: kebab-case.
- Run everything from the repository root (npm workspaces): `npm run dev:client`,
  `npm run dev:server`, `npm run build`, `npm run lint`, `npm run test`.
