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

The liquid-glass look must never be paid for at runtime **by the main view**. Two hard rules, and
then a named allow-list — which is exactly as wide as the list below, and no wider.

- **The background is static. Never animated.** No animated gradients or meshes, no moving blobs,
  no looping video, no `<canvas>` animation loop, no CSS `animation`/`transition` driving anything
  on the backdrop, no parallax on scroll.
- **The background's blur is baked into the asset, not computed by the browser.** The background
  ships **already blurred** as a static image. The backdrop layer itself computes no filter of any
  kind, ever.

Why the main view pays nothing: `backdrop-filter` forces the compositor to re-render everything
behind the element, on every frame, for every glass surface carrying it. With a shell plus stacked
panels, cards, tables and detail panels — this app's entire layout — it collapses to single-digit
FPS on scroll and resize. So the main view's glass material is built from **translucency over the
pre-blurred background**: alpha layers, subtle borders, inner highlights and gradient overlays, all
as tokens in the library. If a panel needs to look more blurred, that is a change to the asset or to
the alpha, never a `blur()`.

**`backdrop-filter` / `filter: blur(...)` are therefore forbidden everywhere except on the surfaces
of this allow-list**, which are overlay surfaces — drawn above what they cover, present only while
an interaction or a state lasts:

| Surface | Selector |
|---------|----------|
| the overlay glass material itself — the class a `Surface` carries when it is asked for `material="overlay"`, which is how the dialog surfaces (`Modal` and everything built on it, `FormSheet`) and the toasts get it | `.ui-overlay-glass` |
| the suggestion / choice popup of `Combobox` | `.ui-combobox__list` |
| the off-canvas navigation drawer at the phone breakpoint — its sizing wrapper and the card that actually paints, **inside the `max-width: 720px` block only** | `.ui-frame__rail`, `.ui-nav-rail` |
| the log stream's floating jump-to-live control | `.ui-log-stream__jump` |

Above the phone breakpoint the rail is docked: it is main view, and it blurs nothing. **Neither
scrim is on the list, and neither ever will be** — not the dialog's (`.ui-modal-overlay`) nor the
drawer's (`.ui-frame__scrim`). A scrim covers the entire viewport, so blurring one does not blur a
panel: it blurs the whole main view, background asset included, which is the exact cost this rule
exists to refuse. Behind an open dialog or an open drawer the application stays sharp and merely
dimmed; the surface that blurs is the dialog, or the drawer card. The drawer's scrim was briefly
on this list and was withdrawn on sight, for that reason.

**The blur is declared on the surface's own `::before` layer, never on the surface element itself**,
and that is not a stylistic preference. An element carrying `backdrop-filter` becomes the backdrop
root of everything inside it, and in Chromium a `backdrop-filter` nested inside such a root renders
**nothing at all** — the inner surface simply stops blurring. That was shipped once and caught by
the human: the `Combobox` popup opened inside a form dialog showed the labels underneath it sharp
and readable, because the dialog surface above it carried the blur. A pseudo layer is a sibling of
the surface's content rather than an ancestor of it, so no allow-listed surface is ever a backdrop
root, nesting is harmless, and both surfaces blur at once. Keep it that way when adding a surface to
the list; the conformance check accepts `.selector::before` as the surface itself, and still rejects
a real descendant of it.

Why that is affordable: there is **one instance of each** of these, none of them repeats across a
screen or scales with the number of objects listed, and any surface whose count is not naturally one
must be capped before it may join the list (the toast stack, the one member whose count is not
naturally one, is capped at three for exactly this reason). The radius is one bounded value for all of them. And the large, numerous,
scrolled surfaces — the shell, the header, cards, panels, tables, detail panels, split panes, and
the log / console / terminal surfaces themselves — still pay nothing at all.

The guard rails that keep it that narrow:

- **One value.** The only legal blur value in the codebase is the `--blur-overlay` token (20px),
  declared once with the library's other design tokens (`client/src/ui/tokens.css`) and documented
  there as the **maximum** any surface may use. A blur length written on the spot is a violation
  even on an allow-listed surface.
- **The automated check enforces both halves.** `client/scripts/check-ui-conformance.mjs` — run by
  `npm run lint` and `npm run test` in the client workspace — fails on any `backdrop-filter` /
  `filter: blur(...)` whose rule does not target an allow-listed selector, and on any allow-listed
  one not valued `var(--blur-overlay)`. Its `blurAllowedOverlaySelectors` constant and the list
  above are one list written in two places: change them together.
- **The only way out is still a comment.** A `ui-blur-exception:` comment on the declaration or the
  line above it exempts it, for a case genuinely outside the list — measured and justified on the
  spot, under the escape-hatch rules above. Adding a surface to the allow-list is a decision about
  the product; sprinkling exception comments is how a rule becomes a formality.

**One allow-listed surface sits inside the scrolled content flow**, which is the case the whole rule
exists to prevent, and it is accepted deliberately: the log stream's **jump-to-live control** — a
single instance, small, and bounded to a detail view. It is the most expensive member of the list,
sitting over a continuously repainted view, and it is **the first thing to withdraw if scrolling
ever regresses on a real machine**: it is the cheapest to remove and the one with the least visual
return.

The **session-ended overlay** over a terminal was the second, and was withdrawn on sight — the same
objection as the scrims, one scale down. It is `inset: 0` over the whole terminal region, so a blur
on it did not read as a card of glass over the session but as the session having gone out of focus;
and a terminal's own backdrop, small monospace glyphs on a near-uniform dark field, smears at 20px
into a flat rectangle in which no glass is legible. It is a plain dim, and declares
`backdrop-filter: none` so that the absence reads as the decision it is.

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
  Every suite points the server at its own `VEXEL_DATA_DIR` instead of the operator's `~/.vexel`.
- **Every test starts from a clean application state** — as surely as it starts with a fresh browser.
  `VEXEL_DATA_DIR` holds the preferences, the console history, the analysis cache and its index, and
  all of it outlives the test that wrote it. That is the widest shared state the suite has, and
  leaving any of it standing breaks the rule above twice over: a test **inherits what another
  wrote** — `persistence-routes.test.ts` asked for the default preferences and was handed a
  `selectedContext` no test of its own had set — and a test **stops running the code it exists to
  drive**, because the analysis cache is keyed by content digest, never evicts (REQ-113), and a hit
  skips the extraction outright. A test that has quietly stopped testing anything is worse than a
  slow one, and it is invisible: it passes.

  The whole directory, not one namespace of it. Cleared *before* each test and never during: a test
  that writes state and then relies on it is contracting exactly that
  (`filesystem-browser.spec.ts`, "reuses the cached extraction the next time the image is browsed")
  and owns it for its own duration. It lives where no new file can forget it —
  `client/e2e/support/test.ts` (an automatic Playwright fixture, which is why specs import `test`
  from there and not from `@playwright/test`) and `server/test/support/fresh-data-dir.ts`
  (preloaded with `--import` by the daemon-backed passes).

  Two mechanisms, because the two halves are not equivalent. The analysis cache is emptied through
  the store's own `clear()` — or, in e2e, through `POST /api/persistence/analysis-cache/clear`,
  since one server process serves the whole run and holds an in-process write queue: it is asked,
  not undercut. The remaining namespaces have no such API, and removing their files is a state the
  store reads correctly by design, re-reading each one per call and falling back to the defaults.
  The **directory itself** is never removed: `local-store.ts` resolves it once, at import.

  **This reverses an earlier decision, so here is what it costs**, to save anyone reinstating it
  from the old argument. The data directory used to be kept warm between runs, said to be worth
  "minutes against well over ten". Measured: `npm run test` 7m23s before against 7m26s after; the
  full e2e suite 13m21s–14m12s before against 13m30s and 14m07s after — inside the run-to-run spread,
  not minutes. The saving was already gone; the growth was not, the directory having reached **3.2 GB
  across 1936 artefacts** because every run builds fixture images with content of their own and
  nothing evicts. It now never holds more than the running test put there.

  This does **not** excuse a test from the rule above: state written by other work finishing
  *during the same test's window* is still shared, and no assertion may require it to be empty.
- **Every spec must pass on its own.** Running one file is what development actually looks like. A
  fixed order is legitimate for sharing expensive setup — `client/e2e/support/global-setup.ts`
  prepares the base images once — but never for passing state from one test to the next.
- Destructive-by-nature tests (`prune` acts on the whole host) cannot be scoped, so they live apart:
  `server/test/exclusive/` and `client/e2e/exclusive/`, scheduled after everything else.

### No test reaches Docker Hub

**A run gets its images from a registry of its own, started before the first test.** A registry
exposed on the internet occasionally does not answer, and when it does not, the failure lands on
whichever assertion happened to need an image — saying nothing whatever about the product. That is
not hypothetical here: `filesystem-browser`, `layer-build-cache`, `images` and `container-create-run`
have each been lost to `production.cloudfront.docker.com … EOF` while pulling a base image, and each
of them passed on its own minutes later.

So the network work is a **preliminary step with a command of its own**, never something a test
arranges for itself:

- `npm run test:images -w server` puts on the daemon what has to be there. The only step of a run
  allowed to reach Docker Hub, and only for what is genuinely not there yet.
- `npm run test:registry -w server` brings up the run's own `registry:2` — one container per
  machine, under a fixed name, carrying the ownership labels — and seeds it with every image the
  tests pull (`docker tag` + `docker push` from the daemon's own copy, no network at all), builds
  the single-layer image and publishes the copy of it the "missing locally" tests fetch.
- Both are chained, in that order, by `test:api` and `test:exclusive`, and
  `client/e2e/support/global-setup.ts` runs **those same two commands** rather than a second
  implementation of them. By the time the first test file loads, everything is in place.
- One definition behind them, `server/test/support/base-images.ts`, serving both test trees.
  `ensureImage`/`ensureImages` is how a test file asks for the same guarantee, and every step is
  idempotent — an already-prepared registry is the normal case, not an error — so **running one spec
  file, or one server test file, on its own gets the same arrangement** rather than a second one.
- The registry is stopped when a whole pass ends (`globalTeardown` for Playwright, a closing
  `test:sweep` for the server). A run killed before that leaves it labelled, so
  `npm run test:sweep -w server` removes it — along with anything the daemon pulled out of it.

Where each image comes from:

- **`alpine:3.20`** — a container that simply stays up; it declares no `VOLUME`, so it cannot orphan
  one. Mirrored into the run's registry at the preliminary step, from the daemon's own copy when it
  has one (`docker tag` + `docker push`, no network at all). Whenever it goes missing mid-run — the
  exclusive passes prune the host — it is restored from there.
- **`vexel-test-tiny:1`** — the single-layer image a fixture is made from whenever all it needs is
  something a container can instantly be created out of. **Built** by the suite, `FROM scratch`, with
  one file of known content and a `CMD` (without one, `docker create` refuses it). Nothing is fetched
  at all. It replaced `hello-world`, which had to be pulled and, after a system prune, often failed
  to be.
- **`registry:2`** — the multi-layer, registry-pulled image the layer analyses need, and **the one
  irreducible exception**: it is the image the run's own registry is started from, so it cannot come
  out of it. It must be on the daemon, pulled from Docker Hub if it is not.
- **`moby/buildkit:buildx-stable-1`** — not a fixture image but one the toolchain needs, and the
  worst offender of the three: `docker buildx` contacts a registry on *every* bootstrap of a
  `docker-container` builder, even when the daemon already holds the image. So a builder fixture is
  created pointing at the mirrored copy (`--driver-opt image=…`, `--driver-opt network=host`), and
  a `FROM` line inside such a build names the mirrored `alpine` — BuildKit in a container has an
  image store of its own and resolves every `FROM` against a registry.

### Fixtures stay small

Roughly 35 MB in total, and that rule stands: do not reach for a heavier image because it happens to
be lying around. The suite used `postgres:16` this way and paid 663 MB for a process that only had
to sleep.

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
- **No automated check drives this arrangement.** The e2e suite builds the product and runs against
  the single process that serves it, on its own port — so what is verified is what ships. This flow
  is for manual work with hot reload, and keeping it working is a human's judgement.

Other root scripts: `npm run build` (both workspaces, client first), `npm run lint`, `npm run test`.

## Conventions

- Source code, identifiers, comments: **English only**.
- Package/folder naming: kebab-case.
- Run everything from the repository root (npm workspaces) — see "Running it" above for the two
  arrangements and their commands.
