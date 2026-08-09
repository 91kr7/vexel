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

## Tests — non-negotiable rule

**A test leaves the machine exactly as it found it, and depends on nothing another test did.**

This application is tested against a real Docker daemon — the operator's own, the same one their
work runs on. That makes two habits harmful here that would be merely untidy elsewhere: leaving
objects behind, and reading state somebody else created.

### What a test creates, it destroys

- Every fixture — container, volume, network, built image, tag — is removed by the test that made
  it, in a `finally` (or `afterAll`) so a failure cleans up as thoroughly as a pass.
- Remove containers with `docker rm -fv`, never `docker rm -f`. Docker attaches an anonymous volume
  to every `VOLUME` an image declares, and without `-v` that volume outlives the container carrying
  no label of ours — invisible to any later cleanup. This one missing letter had accumulated
  thousands of volumes on the development machine.
- Where the application itself recreates a container, it deliberately keeps the replaced
  container's volumes so that editing a setting never destroys data. The orphan is then the test's
  to remove: `removeAnonymousVolumesSince` in `client/e2e/support/fixtures.ts`.
- Every fixture carries the ownership labels (`ownershipArgs`), including built images, so a run
  killed halfway can still be swept. `npm run test:sweep -w server` removes labelled leftovers of
  every kind and, having nothing else to go on, never touches an object it cannot prove is ours.
- Files belonging to the runner are the runner's: hand a Playwright download back with
  `download.delete()` instead of deleting the artifact directory it lives in.

### A test establishes its own starting state

- **Never assume an empty daemon.** The operator has their own containers, images and volumes, and
  they must neither break a test nor be touched by one. Assert on the fixtures you created — "the
  container I made is listed, with these values" — never on totals, counts or a list being empty.
- **Never inherit state from another test**, and that includes the application's own: the last
  active screen and the analysis cache survive by design (REQ-113, REQ-115), so a spec that needs a
  particular screen pins it (`openApp`) rather than trusting whichever one the previous spec left.
  Every suite points the server at its own `VEXEL_DATA_DIR` instead of the operator's `~/.vexel`:
  the e2e one is emptied per run, the server one is kept between runs so the analysis cache stays
  warm (empty it with `npm run test:reset-data-dir -w server` when a cold start is the point).
- **Every spec must pass on its own.** Running one file is what development actually looks like. A
  fixed order is legitimate for sharing expensive setup — `client/e2e/support/global-setup.ts` pulls
  the base images once — but never for passing state from one test to the next.
- Destructive-by-nature tests (`prune` acts on the whole host) cannot be scoped, so they live apart:
  `server/test/exclusive/` and `client/e2e/exclusive/`, scheduled after everything else.

### Fixtures stay small

Base images are `alpine:3.20` (a container that simply stays up — it declares no `VOLUME`, so it
cannot orphan one), `registry:2` (the multi-layer registry-pulled image the layer analyses need) and
`hello-world` (single layer). Roughly 50 MB in total. Do not reach for a heavier image because it
happens to be lying around: the suite used `postgres:16` this way and paid 663 MB for a process that
only had to sleep.

## Running it — two arrangements, and which belongs to whom

There are two ways to bring this application up, and they are not interchangeable. One is how the
product runs; the other is a convenience for editing it. Everything is run from the repository root
(npm workspaces).

### Running the product — the operator's arrangement

**One process, one port.**

- `npm start` — builds the client, builds the server, then runs the single Express process that
  serves the interface **and** the API on `http://localhost:3000`. Nothing else to start, no
  ordering to know: that one line is the whole instruction set.
- `npm run serve` — runs an application that is already built, without rebuilding it. This is the
  command for restarting the process; it costs no build time.
- The client is built before the server **because the server serves the client's output**
  (`client/dist`). A failed build stops the command and serves nothing — it never falls back to the
  previous build.
- `PORT` moves that single port. `VEXEL_CLIENT_DIST` points the process at a build elsewhere on
  disk, without rebuilding the server.
- A server started with no built interface is not an error: it serves the API only and says so once,
  in one line naming the cause and what to run.

### Developing — the developer's arrangement

**Two processes with hot reload, for manual development only. This is not how the product is run.**

- `npm run dev:server` — Express on port 3000, watch mode.
- `npm run dev:client` — Vite on port 5173, proxying `/api` (with `ws: true`) to port 3000, so
  origin-relative calls, the event stream and the interactive-session upgrades behave exactly as they
  do in the single-process form.
- Both are needed together, and neither arrangement needs a step of the other: development needs no
  `client/dist`, and `npm start` needs no Vite server.

Other root scripts: `npm run build` (both workspaces, client first), `npm run lint`, `npm run test`.

## Conventions

- Source code, identifiers, comments: **English only**.
- Package/folder naming: kebab-case.
- Run everything from the repository root (npm workspaces) — see "Running it" above for the two
  arrangements and their commands.
