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
  containers/images/volumes/networks/compose screens) — composes UI-library components and
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
| the overlay glass material itself — the class a `Surface` carries when it is asked for `material="overlay"`, which is how the dialog surfaces (`Modal` and everything built on it, `FormSheet`), the toasts and the popup of the overflow menu (`Menu`) get it. The menu's popup is admitted under the criterion below and not beside it: **at most one menu is open in the whole interface at a time**, enforced by the component itself, so its count is one however many triggers a list holds — and the per-row `…` trigger blurs nothing whatever, which is the half of the rule that protects a long scrolled list | `.ui-overlay-glass` |
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
`dashboard`, `containers`, `lmages-layers`, `volume-networks`, `compose`, `registries`,
`build-and-cache`, `context`, `plugins`, `system-and-prune`, `raw-console`.

Read the relevant mockup before implementing a screen. Derive reusable primitives from what
repeats across mockups — those repetitions are the library's component inventory.

## Tests — non-negotiable rule

**A test leaves the machine exactly as it found it, and depends on nothing another test did.**

This application is tested against a real Docker daemon — the operator's own, the same one their
work runs on. That makes two habits harmful here that would be merely untidy elsewhere: leaving
objects behind, and reading state somebody else created.

### What a test creates, it destroys — within its own file

- Every fixture — container, volume, network, built image, tag — is removed by the test that made
  it, in a `finally`, so a failure cleans up as thoroughly as a pass. That `finally` is what keeps
  the **next test of the same file** from seeing it: the daemon reset runs once per file, never
  between two tests of one.
- **A file does not clean up after itself at the end.** An `afterAll` that removed containers,
  images, volumes, networks, plugins, build cache or contexts was deleting what the next file's
  reset deletes anyway, and one deletion is enough — the redundancy read as a second, weaker rule
  about who owns the daemon. What an `afterAll` may still hold is what the reset **cannot** reach,
  because none of it is Docker: a fixture server running inside the test process (`fixture.stop()`),
  a temporary directory, an environment variable or a patched prototype, and the operator's **active
  context**, which a test that switched it must switch back — removing a context is the reset's job,
  choosing one is not.
- The two ends of a run are the price of that, and both are paid: the **last file** of a pass has no
  successor to clean up after it, and an **interrupted run** has none either. `npm run test:sweep -w
  server` removes every labelled leftover, and a whole pass ends on it.
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

- **Never assume an empty daemon.** Assert on the fixtures you created — "the container I made is
  listed, with these values" — never on totals, counts or a list being empty. An end-to-end file now
  does start from an empty one, and that changes nothing here: a count is a fact about the whole
  host, and the reset below is a starting state, not a licence to assert on one. The server suite
  resets nothing at all, and the operator's own objects are still no business of any assertion.
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
  from there and not from `@playwright/test`) and `server/test/support/api-lifecycle.ts`
  (preloaded with `--import` by the server's daemon-backed pass).

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
- **Every spec must pass on its own.** Running one file is what development actually looks like,
  and the end-to-end suite has no preparation step ahead of the first file for it to miss: what a
  `globalSetup` used to arrange, every file now arranges for itself (below). A fixed order may still
  share expensive setup, but never pass state from one test to the next.
- Destructive-by-nature tests (`prune` acts on the whole host) cannot be scoped, and they used to be
  kept apart for it — `server/test/exclusive/` and `client/e2e/exclusive/`, scheduled after
  everything else. **They now run beside every other file**, in `server/test/api/` and `client/e2e/`.
  What ended the split is that its cost was real and its benefit had lapsed: the Playwright project
  declared the parallel one as a dependency, so a red anywhere in the suite skipped every destructive
  spec silently — which is exactly what happened, eight specs unrun behind one unrelated failure.
  The benefit had lapsed because **no file trusts what the one before it left**: each ensures the
  base images it needs at the point of use (`server/test/support/base-images.ts`), so a prune landing
  mid-pass costs a local restore from the run's own registry and nothing else, and both passes are
  serial, so a prune can never reach a fixture still in use. What was lost is the ability to run the
  suite without pruning the host, and nothing gives it back any more: **every test file of both
  daemon-backed trees now empties the host before it runs** (see below), so "destructive" describes
  the whole suite and no longer distinguishes anything. A command that ran the destructive files
  alone existed for a while and was removed with the distinction it named.

### Every daemon-backed test file resets the daemon before it runs

That is both trees — `client/e2e/*.spec.ts` and `server/test/api/*.test.ts` — and they are wired
differently, because they run differently:

- **End-to-end.** One Playwright worker serves every spec, so the reset is registered per file:
  each spec opens with `cleanDaemonBeforeAll()`, from `client/e2e/support/lifecycle.ts`, which
  registers the file's first `beforeAll`.
- **Server api.** `node --test` gives every file a process of its own, so the reset is a **preload**
  — `--import ./test/support/api-lifecycle.ts` — and no file has to remember anything. It sits at
  that module's **top level, not in a `before()` hook**, and that is not a style choice: a root
  `before()` starts ahead of the test file's module scope but does not block it (measured), and
  thirty-two files under `test/api/` ensure their images with a top-level `await ensureImages(…)`.
  A hook would be pruning images while the file was preparing them. A preload's top-level await
  does block the entry module.
- **The unit trees reset nothing**, and must not: `server/test/unit` and `client/test/unit` mock
  `execFileAsync` and never reach a daemon, so a reset there would be cost with no subject.

What the reset does is the same for both, and it is one function: it **empties Docker except the
run's own registry** — that container, the volume holding what has been pushed into it, and the
`registry:2` image it runs from, which survives every prune by being in use. Containers, images,
volumes, networks, build cache, build records, plugins and every builder that is not the daemon's
own: gone. The work itself is `server/test/support/lifecycle.ts`, runnable by hand as
`npm run test:reset-daemon -w server`.

Why a whole file's worth of ceremony: both passes are serial and every file drives the same daemon,
so a file used to inherit whatever the one before it left standing — a container that outlived a failed
assertion, an image a build produced, a network nobody removed. That is invisible from the file that
then fails, and it fails differently depending on which files ran first, which is what a flake is.
The order inside the reset is load-bearing and written down where it happens; the one thing to know
from here is that the registry container is spared, because it is what keeps `registry:2` in use,
and `registry:2` is the one image that cannot be restored from the registry.

**This empties the machine it runs on, and is deliberately not scoped to the suite's own objects.**
The operator's containers, images, volumes, networks, builders and plugins go with the suite's,
named volumes included — a volume holding data nobody can rebuild is removed like any other. It is
the single place in this repository where that is allowed, it is a decision about a development
machine, and **no fixture may ever do it on its own**: the rules above still bind every test.

One thing is **not** emptied, and it is not an oversight. Docker **contexts** are emptied with the
rest, bar the two Docker will not part with: the one in use, since removing it would take away how
this machine reaches its daemon, and `default`, which cannot be removed at all. And **swarm** is not
touched at all: it left the product on 2026-08-27, and no check of this project ever initialises
one.

The last step of the reset puts the base images back, **and it puts them back by pulling them out of
the run's own registry** — which is the point of having one. A spec writes `alpine:3.20`, a Docker
Hub name, and the daemon runs no registry mirror, so nothing would send that reference to localhost
on its own; `ensureImage` is what does, pulling `localhost:<port>/alpine:3.20` and re-tagging it
under the name the spec wrote. The re-tag is not cosmetic: specs assert on that string.

So the daemon, after a reset, holds exactly what the registry put there and nothing else. **Every
image a test uses comes from that registry, always** — `vexel-test-tiny:1` included, which is built
`FROM scratch` the first time and published there like the rest, so every later file pulls it too.
`registry:2` is the one image that cannot come from the registry, because the registry is started
from it.

What it costs: a prune and a restore per file, on a daemon that is almost empty by the second file.
What it buys back: a file that fails now fails for its own reason.

**A new spec file is not exempt**, and forgetting the line is not a matter of memory:
`scripts/check-clean-daemon-conformance.mjs` — run by the repository-root `npm run lint` and
`npm run test`, as `lint:clean-daemon` — fails on a spec file that does not call it, and on one
that registers a `test` hook ahead of it, since hooks run in registration order and a hook
registered first would build its fixtures on a daemon the reset then prunes. There is no exception
marker.

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
- **Neither pass runs them any more**, and they are kept as commands an operator types. Both passes
  reset the daemon before every file (above), and that reset reaches these same functions directly,
  so by the time a file's first test runs everything is in place for **that file** rather than for
  whichever file happened to run first. A preparation step ahead of a pass could only have described
  a state no file was entitled to assume by the second one.
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
  has one (`docker tag` + `docker push`, no network at all). Whenever it goes missing mid-run — a
  prune spec prunes the host — it is restored from there.
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

### What a check drives, and what it measures

Both halves below were paid for by one shipped defect — a switch that dragged its dialog 1044px above
the top of the viewport (bug-2) — which the coverage written for that very report passed on, twice
over.

**A check that does not use a real pointer cannot detect a defect only focus or hit-testing can
trigger.** Seven programmatic activations — `HTMLElement.click()` and dispatched events — found
nothing across two builds, both entry paths and a complete privileged create; one real click at the
control's own coordinates found it immediately. A programmatic activation moves no focus, and focus
was the whole trigger: the browser scrolls a focused element into view, and this control's visually
hidden input was drawn 1346px away from the switch it belongs to. So an interaction a human performs
with a mouse is checked with a **real pointer at the visible control's coordinates** — never by
calling the element's own `click()`, never by dispatching an event, and never by aiming at the
visually hidden input behind a control, whose position is frequently the very thing under
examination.

**A check that measures content cannot detect a defect that moves position.** The same coverage
counted 1154 characters of dialog text before the toggle and 1154 after — with the defect active, on
a dialog that had just been carried off screen. A surface dragged out of the viewport keeps every
child and every character it had; what it loses is its **coordinates**. So a check for "the surface
broke" asserts the surface's viewport box before and after the interaction, and that the control just
operated is still inside the viewport. Content assertions stay beside that one where they answer a
different symptom — a surface present and blank — never instead of it.

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

### Never instruct a subagent on how to write comments

**Say nothing to a subagent about the form, the length or the content of code comments.** Not what to
explain, not what a comment should cover, not "say why this value is what it is". The comment
convention already binds them, they read it on their own, and it is stricter than the prose an
instruction invites: one line, two if the reason genuinely needs them, never a paragraph and never an
argument. The reasoning goes in the component spec.

Why it is a rule and not a preference: an instruction phrased as "explain what each of these values is
a bet about" reads to whoever receives it as permission to explain at length, and it outranks the
convention because it is the more specific and more recent thing they were told. That is exactly how
the `timing-scale` batch came back with **75 lines of added comments**, including thirteen lines of
prose with a bulleted list over three constants in `persistence/local-store.ts`.

The same applies to reviewing what comes back: a comment that breaks the convention is sent back
naming the convention, never rewritten by hand into a house style of your own.
