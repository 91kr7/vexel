---
slug: docker_management_app
date: 2026-08-06
spec: .sdd/analysis/docker_management_app.md
requirements: .sdd/plans/plan-docker_management_app/requirements.md
status: validated
---

# Batches — Docker management app ("Vexel — Docker Control")

One batch = one feature, delivered vertically (UI-library contribution → server → data access →
screen). Two batches are declared **enabling**: `foundation-ui-shell` and `local-persistence`.

Order is the reading order of the table: foundation first, then the core (containers, images,
layers/filesystem), then the peripheral areas, so development can stop after any batch and still
leave a coherent product.

| Batch | Feature | REQ closed | Depends | Status | Human acceptance |
| --- | --- | --- | --- | --- | --- |
| 1 · foundation-ui-shell | F1 — Visual foundation and application shell (enabling) | REQ-1, REQ-2, REQ-3, REQ-4, REQ-5, REQ-6, REQ-7, REQ-8, REQ-107, REQ-108, REQ-117 | — | certified | The app opens on the "Vexel — Docker Control" shell with the 13 navigation entries grouped as in the mockups; clicking each one switches the main area and keeps rail/header/footer; every surface is glass over a static pre-blurred backdrop; nothing on the backdrop moves; a destructive demo action asks for confirmation naming its target and does nothing when cancelled; `npm run lint` fails if a raw `<div>`, a CSS rule, a `className`/`style` prop or a `backdrop-filter`/`filter: blur()` is added to feature code; narrowing the window to tablet width keeps the rail docked but narrower, and to phone width collapses it into a drawer opened by the header's menu control and closed by picking an entry, tapping the scrim or pressing Escape, with the header's title/description/actions never overflowing their card at any width. |
| 2 · daemon-connectivity | F2 — Daemon connectivity and live state | REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-110 | 1 | certified | With Docker running, the header shows "connected" and the negotiated Engine API version; stop the daemon → the shell says why and offers retry, no blank screens; start a container from a terminal → the event stream shows it within seconds without refreshing; rename the `docker` binary out of PATH → the app states the CLI is missing and what becomes unavailable. |
| 3 · local-persistence | F30 — Local persistence and host-path access (enabling) | REQ-115 | 1, 2 | certified | Change screen and a couple of list filters, restart the app → it reopens where it was with the same filters and context; the store lives in a per-user app-data directory created on first run. |
| 4 · containers-lifecycle | F4 — Container list and lifecycle | REQ-19, REQ-20, REQ-21, REQ-22, REQ-23, REQ-109 | 1, 2 | certified | The Containers screen matches the mockup and lists every container with name/id/state/image/CPU/memory/ports/uptime; each row offers only the actions its state allows and executing one is reflected in the row; rename works; "Prune stopped" confirms, then reports how many were removed; search filters the list; scrolling a long list with a modal open stays smooth. |
| 5 · container-inspect-config | F5 — Container inspection and configuration | REQ-24, REQ-25, REQ-26 | 4 | certified | Selecting a container opens a detail surface with all the inspect data including health checks; editing restart policy, limits, env, ports, mounts or health check applies the change (warning first when Docker requires a recreate) and the result is visible on the container; the raw inspect payload can be copied. |
| 6 · container-logs | F7 — Container logs | REQ-30, REQ-31 | 4 | certified | Logs of a running container stream live, follow can be toggled, timestamps on/off, tail size and since/until change what is shown, stdout/stderr can be separated; searching highlights matches; the visible log can be copied and downloaded. |
| 7 · container-stats-processes | F8 — Container stats and processes | REQ-32, REQ-33 | 4 | certified | Opening a running container shows CPU, memory used/limit, network in/out and block I/O updating continuously; the process list shows pid, user and command and refreshes on demand. |
| 8 · container-exec-attach | F9 — Container exec and attach | REQ-34, REQ-35, REQ-36 | 4 | certified | An interactive shell can be opened in a running container with a chosen command, user and working directory; typing reaches the process, output renders, resizing the window reflows the terminal; stdio of a container can be attached and detached without stopping it; leaving the view leaves no exec/attach session alive on the daemon. |
| 9 · images-core | F10 — Image list and registry-facing actions | REQ-37, REQ-38, REQ-39, REQ-40, REQ-41 | 1, 2 | certified | The Images & layers screen matches the mockup; pulling a reference shows per-layer progress until done; tag, untag, push, remove and prune dangling work with confirmation on the destructive ones; inspect shows config/env/labels/ports/digest/history; search filters by reference or digest. |
| 10 · container-create-run | F6 — Container creation and run | REQ-27, REQ-28, REQ-29 | 4, 9 | certified | "Run container…" and "Create from image…" open a form covering name, command, env, ports, volumes, networks, restart policy, limits, labels and privileges; the image can be picked from local images or typed and is pulled when missing, with progress; a daemon rejection is shown with its own message and the entered values are preserved. |
| ~~11 · image-build~~ | *Withdrawn 2026-08-07 — see "Departures from the spec". Number retired.* | — | — | withdrawn | — |
| 12 · image-transport | F11 — Image transport (save/load, export/import) | REQ-42, REQ-43 | 9 | certified | Saving selected images downloads a tarball to the operator's own machine with progress; uploading that tarball back restores the images and reports their references; a container's filesystem downloads as a tarball and can be uploaded back as an image under a chosen reference; a multi-gigabyte image transfers in both directions without the server buffering it whole; no screen of the batch offers a path field, and running the server on a different machine from the browser changes nothing about any of the four flows. |
| 13 · layer-stack-changesets | F13 — Layer stack and per-layer changesets | REQ-47, REQ-48, REQ-49, REQ-50, REQ-51 | 3, 9 | certified | An image shows its ordered layer stack with digest, compressed/uncompressed size, empty-layer flag and originating instruction with full command text; a registry-pulled image (not built locally) still shows every layer, with genuinely missing data marked unavailable rather than hidden; selecting a layer lists exactly what that layer added, modified and deleted, with a file deleted by a later layer reported as deleted (whiteout) and an opaque directory handled; layers shared with other images are marked with those images; a multi-GB image warns about cost first and shows cancellable progress. |
| 14 · image-filesystem-browser | F14 — Runtime-independent image filesystem browser | REQ-52, REQ-53, REQ-54, REQ-55, REQ-56, REQ-57, REQ-113 | 3, 9, 13 | certified | Browsing the filesystem of a distroless image (no shell) yields the same complete merged tree as for a normal image; during and after the operation `docker ps -a` shows no leftover container, including when the operation is cancelled or fails mid-way; the source image digest and tags are unchanged and no container was started; a large image warns about time/disk first and shows cancellable progress; re-opening the same image after restarting the app reuses the cached analysis instead of re-extracting, and the cache size is visible and clearable. |
| 15 · in-tree-file-operations | F15 — In-tree file operations | REQ-58, REQ-59, REQ-60, REQ-61, REQ-62 | 14 | certified | Selecting an entry shows size, permissions, uid/gid, mtime, type and symlink target; a text file previews as text and a binary as hex, the mode can be forced, and an oversized file is truncated with a notice; searching finds binaries/libraries/CA bundles in place; a file downloads through the browser and a subtree downloads as one archive; an image containing a symlink or `../` pointing outside the tree cannot make the server read or serve anything outside that tree, the produced archive carries no absolute or `../` entry so extracting it writes only inside the chosen directory, and every refusal is explained. |
| 16 · image-filesystem-diff | F16 — Cross-image filesystem diff | REQ-63, REQ-64 | 14 | certified | Comparing two tags of the same image shows added, removed and changed paths as a navigable tree; a changed file states what changed (content, size, mode, ownership, symlink) and both sides can be previewed side by side. |
| 17 · layer-efficiency-signals | F17 — Layer efficiency, waste and secret signals | REQ-65, REQ-66, REQ-67 | 13, 14 | certified | For an image built to add and later delete a file, that file is listed with the bytes it still costs, and a total wasted-bytes estimate and efficiency score are shown; content duplicated across layers is listed with its wasted bytes; a credential-looking file added then removed in a later layer is flagged with the introducing and removing layers, explicitly labelled as a heuristic signal. |
| 18 · volumes | F19 — Volumes | REQ-70, REQ-71 | 1, 2 | certified | The Volumes panel matches the mockup: name, driver, mountpoint, size and mounting containers, with unattached volumes visible; creating a volume with driver options and labels works, inspect shows the full payload, remove and prune confirm and report the space reclaimed. |
| 19 · networks | F20 — Networks | REQ-72, REQ-73, REQ-74 | 1, 2, 18 | certified | The Networks panel matches the mockup: name, driver, scope, subnet/gateway and attached containers as chips; creating a network with subnet/gateway/options works, inspect shows the full payload, remove and prune confirm; attaching and detaching a container updates the chips and is visible in `docker network inspect`. |
| 20 · compose | F21 — Compose | REQ-75, REQ-76, REQ-77, REQ-78, REQ-116 | 2, 3, 4 | certified | Compose projects are discovered with their file path and per-service state; up, down, restart and per-service scaling work and the states follow; the compose file is shown, can be edited and — after confirmation — is written back to disk, and validation reports valid/invalid with errors plus the services/volumes/networks summary; aggregated logs stream live with the service name on each line. The file path is never typed by the operator: it comes from the daemon's own project labels, and a path that has vanished, is not a file, is not writable or traverses outside the allowed root is refused with the reason before anything is written, the refusal making clear the path is resolved on the server's machine. |
| 21 · builders-build-cache | F24 — Builders and build cache | REQ-88, REQ-89, REQ-91 | 2 | certified | The Builders & cache screen matches the mockup: builders with driver, endpoint, platforms, status and cache size, the active one marked and switchable; creating and removing a builder works; the cache is listed record by record with type, size and usage state and can be pruned with the space reported. The screen carries no build-launch affordance and no cache export/import affordance: after the withdrawal of REQ-90 and of REQ-91's export/import half, the screen observes builders and their cache and reclaims the cache, nothing more. |
| 22 · layer-build-cache-traceability | F18 — Layer to build-cache traceability | REQ-68, REQ-69 | 13, 21 | certified | From a layer of a locally built image, the build step and the cache entry behind it can be reached in one move; for a registry-pulled image where the association does not exist, the reason is stated instead of an empty panel; from a cache entry, the images/layers it relates to can be reached when known. |
| 23 · contexts-daemon | F25 — Contexts and daemon information | REQ-92, REQ-93, REQ-94 | 2 | todo | The Contexts screen matches the mockup and lists every context whatever its endpoint kind, a TCP+TLS one created from a terminal included, which can be selected and used like any other; creating a local or SSH context works (the creation form offers no TLS material and no path input), selecting one re-points every screen at that daemon and updates the footer, removing one confirms; the daemon panel reports version, Engine API, BuildKit, storage driver, cgroup driver, OS/arch, root directory and container counts. |
| 24 · system-prune | F26 — System disk usage and prune | REQ-95, REQ-96, REQ-97 | 2, 9, 18, 19, 21 | todo | The System & prune screen matches the mockup with the five reclaimable categories, their sizes and what they contain; pruning one category and running a scoped system prune both confirm, state that the daemon is shared with other tools, and report the space actually reclaimed, after which the breakdown refreshes. |
| 25 · dashboard | F3 — Dashboard | REQ-14, REQ-15, REQ-16, REQ-17, REQ-18 | 2, 4, 9, 18, 20, 21 | todo | The Dashboard matches the mockup: the five tiles carry real numbers, container activity updates live, disk usage shows the four categories with size and share, recent daemon events stream in, and clicking a tile or a row lands on the screen that owns the object. |
| 26 · registries | F23 — Registries | REQ-85, REQ-86, REQ-87 | 2, 9 | todo | The Registries screen matches the mockup; logging in to a registry succeeds and the state becomes authenticated, logging out reverts it; repositories and tags of a registry can be browsed and searched with sizes, and a tag can be pulled from there; credentials go to the host credential store and are never displayed back nor stored by the app. |
| 27 · swarm | F22 — Swarm | REQ-79, REQ-80, REQ-81, REQ-82, REQ-83, REQ-84 | 2 | todo | On a swarm-enabled daemon the screen matches the mockup: state with cluster id, node count and raft health; init/join/leave work and leave confirms; join tokens can be shown and rotated; nodes list role/availability/status and can be changed or removed; services list replicas/image/ports and can be created, updated, inspected with tasks and removed; a stack deployed from a terminal is listed with its services and can be removed, and the screen offers no deploy affordance, no compose-file path input and no compose editor; secrets and configs are listed, created and removed, and a secret's value is never displayed. |
| 28 · plugins | F27 — Plugins | REQ-98, REQ-99, REQ-111 | 2 | todo | The Plugins screen matches the mockup: CLI plugins with version and availability, daemon plugins with type and enabled/disabled; installing a plugin shows the privileges it requests before granting, enable/disable flips the state in the list and in `docker plugin ls`, inspect shows its configuration, removal confirms as destructive. |
| 29 · raw-console | F28 — Raw command and API console | REQ-100, REQ-101, REQ-102, REQ-103, REQ-104, REQ-112, REQ-114 | 2, 3 | todo | The Raw console matches the mockup with its CLI/API toggle; a `docker` command runs against the active context and streams stdout/stderr and exit code; an Engine API call returns raw status and body; history can be recalled, re-run and copied and survives a restart; the long-tail command chips prefill an entry; a destructive command (e.g. `system prune -a`) asks for confirmation naming the command before running; the console states its channel and privilege level. |
| 30 · coverage-matrix | F29 — Coverage matrix | REQ-105, REQ-106 | 29 | todo | The Coverage matrix lists the Docker capability areas, states for each whether it has a dedicated screen or is console-only, links to the screen when there is one, and declares the Engine API/CLI baseline alongside the version of the daemon currently connected so a mismatch is visible. |
| 31 · images-table-alignment | F10 — Image list and registry-facing actions (remediation) | REQ-3, REQ-37, REQ-41 | 4, 9 | certified | The Images & layers screen shows a header row and aligned columns exactly like Containers: leading status dot, repository:tag, short digest, platform(s), size and age each in their own column, and tag/untag/push/remove visible on every row without expanding it; a dangling image is marked by its status dot and badge; clicking a row still opens the image detail panel underneath it; search by reference or digest still filters; switching between Containers and Images shows no difference in row height, column typography, header style, hover or selected treatment; the Containers screen is unchanged. |
| 32 · test-isolation | Test-suite isolation (remediation, no product change) | — | 10, 31 | certified | The API suite runs in parallel without flaking across three consecutive runs; the whole suite is measurably faster than the 489s baseline and the new figure is reported; running the suite while the operator has their own stopped containers and dangling images on the daemon leaves those objects untouched and fails no test; killing a run mid-way and re-running it passes, the orphan sweep having cleaned the leftovers; `git status` shows no file under `server/src/` or `client/src/` modified. |
| 33 · event-feed-keys | Daemon event feed — identity of an event (remediation) | — | 2 | todo | Triggering two events on one container within the same second shows two distinct rows, each with its own action, neither vanishing on re-render; a full e2e run logs no duplicate-key error in the console. |
| 34 · key-value-editor-naming | KeyValueEditor — a field says which editor it belongs to (remediation) | — | 10 | todo | On the container create/run sheet the environment rows and the label rows carry distinct accessible names, so a screen reader announces which editor a field belongs to; no other consumer of `KeyValueEditor` regressed. |

## Assumptions and decisions

- **Placement of `create` interventions** follows `.sdd/.archi` (npm workspaces, `client` React 19 +
  Vite 8, `server` Node 22 + Express 5, TypeScript/ESM) plus the non-negotiable rule of
  `CLAUDE.md`: `client/src/ui/` is the UI library (the only place with DOM tags and CSS), every
  other area of `client/src/` is feature code. Beyond that boundary, no internal folder structure is
  imposed: batch files name the module/domain area, the implementer decides the files and records
  them in the indexes.
- **`.sdd/modules/` does not exist yet** (no component indexes, no component specs): this plan is
  written against the bare scaffold described in `.sdd/.archi`. Interventions that touch something
  produced by an earlier batch of this same plan cite that batch instead of a path, since the path
  is decided by that batch's implementer.
- **Only four files exist today that later batches modify**: `client/src/App.tsx`,
  `client/src/main.tsx`, `client/src/index.css` + `client/src/App.css`, `server/src/index.ts`, plus
  the root `package.json` and `client/.oxlintrc.json` for the conformance check. They are all
  touched in batch 1 and batch 2 only.
- **Two Docker channels**: the Engine API over the active context's endpoint is the primary channel
  for every feature; the local `docker` / `docker compose` / `docker buildx` CLI is used by the raw
  console and where the API does not cover a capability cleanly (compose discovery, buildx builders,
  contexts, registry login). Both live behind one server-side access layer built in batch 2.
- **The glass material is translucency over a static pre-blurred background asset**, per
  `CLAUDE.md`: no `backdrop-filter`, no `filter: blur()`, no animated backdrop. The asset and the
  token layer are deliverables of batch 1; later batches only reference tokens.
- **Each batch's UI-library contribution comes first** inside its own file (INT-1 and, when needed,
  INT-2), before the feature interventions that consume it. A batch that needs a primitive an
  earlier batch already created extends it with a variant rather than duplicating it.
- **The terminal emulator** (batch 8) is the single documented use of the `CLAUDE.md` escape hatch:
  a third-party emulator wrapped in one UI-library component that owns its host element and carries
  the on-the-spot justification.
- **Docker Scout / vulnerability data** is reachable through the raw console only (human decision);
  no requirement, no batch. Batch 9 leaves the images detail surface open to a future panel without
  building one.
- **Test data for the deep-inspection batches** (13, 14, 15, 16, 17) assumes at least one distroless
  image and one image that adds then deletes a file, built locally for acceptance.

## Departures from the spec

**One — the largest capability the spec asks for that this product will not deliver (human decision,
2026-08-07): Vexel does not build images.** (It is no longer the only one: departure Three, taken the
same day, withdraws three smaller capabilities for the same reason.) F12 (REQ-44, REQ-45, REQ-46) is withdrawn and batch 11
retired; REQ-90 (launching a multi-platform build from the Builders screen) goes with it, being the
same capability under another name. Two reasons were given:

1. **Scope** — creating images is beyond what this product should do. Vexel manages an existing
   Docker installation; it does not produce artefacts for it.
2. **Deployment reality, and the stronger of the two** — a build needs an operator-typed build
   context and Dockerfile resolved *on the filesystem of the machine running the server*. Vexel is
   expected to be able to run on a remote host, where the operator neither knows that filesystem nor
   has any way to browse it. The requirement is not merely out of scope, it is ill-posed for the
   intended deployment.

This is a genuine reduction of the spec's scope, not a sharpening of it, which is why it is recorded
here rather than in `requirements.md` alone. What it costs and what it does not:

- **Image building leaves the dedicated-screen surface entirely** and stays reachable through the
  raw command console (F28), which runs `docker build` against the active context and streams its
  output. This is exactly the treatment the spec already chose for Docker Scout. Batch 30's coverage
  matrix declares image building **console-only** — one data entry in its coverage map (INT-2), no
  structural change to that batch.
- **Batch 21 survives nearly intact.** REQ-88 (list builders, switch the active one), REQ-89 (create
  and remove a builder) and REQ-91 (cache inventory and prune; its export/import half went later,
  in departure Three) never needed batch 11;
  only REQ-90 did. Batch 21's dependency drops from `2, 11` to `2`, and its INT-3 is deleted. The
  cache half keeps its full value independently of this decision: a build cache grows whenever the
  operator builds from a terminal, and `docker system prune` does not reclaim a `docker-container`
  builder's cache — only `docker buildx prune` does. Making that visible and reclaimable is a real
  contribution of the product.
- **Nothing else in the plan depended on batch 11.** Batches 22, 24 and 25 depend on batch 21, for
  its builder and cache parts, not for build execution. No other batch referenced it.
- **REQ-116 moves.** It closed in batch 11 as the first operator-typed host path; it moved to
  batch 12 (tarball source/target), the first surviving one, and then to batch 20 when departure
  Four removed every operator-typed path from the product. The validation service itself was built
  in batch 3 and is unaffected throughout. Its wording lost "build context, Dockerfile" and gained
  the statement that paths resolve on the server's machine — the same remote-deployment concern that
  motivated the withdrawal.
- **One shipped artefact must be removed**: batch 9 left a disabled "Build from Dockerfile…"
  secondary action on the Images screen toolbar as a placeholder for batch 11. It has no future and
  is deleted, along with its line in `images-screen.md`.

REQ-44, REQ-45, REQ-46 and REQ-90 are retired numbers and are never reused.

**A related question was left open here and has since been answered in full.** The
remote-deployment argument that killed F12 applies to every remaining operator-typed host path: the
tarball source and target of batch 12, the export destination of batch 15, the compose file path of
batch 20, the cache export/import of batch 21, the stack compose file of batch 27 and the TLS
material of batch 23. Re-examining them was declared a separate decision, and it was taken the same
day, in two steps: **departure Three** withdrew the three capabilities that could only ever have
taken a server path (21, 23, 27), and **departure Four** moved the three operator artefacts (12, 15)
to browser download/upload. Batch 20 is confirmed legitimate and is now the only host path left in
the product — and it is discovered, not typed.

**Two, decided post-certification of batch 1 (human decision, 2026-08-06): the shell chrome floats
instead of being docked.** The mockups in `.sdd/analysis/ui-mock/` show the navigation rail and the
header flush to the viewport edges, with only the content cards floating. The implemented shell
insets the whole layout by `--space-5` and separates rail / header / content by the same gap, so
every region is its own rounded glass island with the Backdrop visible between them — the reference
"liquid glass" look the human asked for. This changes chrome only, never a screen's content,
composition or information architecture.

**This departure is temporary: the mockups will be regenerated with the new graphics.** Until that
lands, the rule of `CLAUDE.md` is unchanged and still binding — **read the relevant mockup in
`.sdd/analysis/ui-mock/` before implementing a screen**. The mockups remain the visual target and
the authority on each screen's content, layout, composition and interaction. The single thing they
are temporarily out of date on is the shell chrome: where a current mockup shows the rail and header
flush to the viewport edges, the implemented floating treatment wins, since that is settled once in
the UI library and must not be re-flattened per screen. Everything inside the content area follows
its mockup as drawn. Once the mockups are regenerated, this departure closes and the mockups are
authoritative again on every point, chrome included.

**Three — three capabilities withdrawn for the same reason as F12 (human decision, 2026-08-07):
Vexel does not deploy swarm stacks, does not export or import the build cache, and does not create
TCP+TLS contexts.** Each asked the operator for a host path *on the machine running the server*, and
each turned out to buy nothing in return. They are the answer to the question departure One left
open, for three of the six paths it listed. What goes and what stays:

- **REQ-83 loses stack deployment**, batch 27. A deployed stack keeps no link to the compose file it
  came from: the services, networks, secrets and configs become swarm objects in the cluster's raft
  store, and the file is consumed once and forgotten — unlike a Compose project, where the file
  stays the project's state. Listing stacks with their services and removing them needs no file and
  stays. Batch 27's dependency drops from `2, 20` to `2`, that dependency having existed only to
  reuse batch 20's compose file handling.
- **REQ-91 loses cache export and import**, batch 21. Beyond the destination being an invisible
  directory on the server, the capability has no vehicle left: buildx exports and imports a cache
  only as flags of a build (`--cache-to` / `--cache-from`), and builds went out with F12. Its
  purpose is also foreign to this product — a shared cache serves CI runners on other machines. The
  inventory and prune half, which is where the value was, is untouched: a `docker-container`
  builder's cache is invisible to `docker system prune` and is often many GB.
- **REQ-92 loses the creation of TCP+TLS contexts**, batch 23. Such a context needs three files — CA
  certificate, client certificate, client private key — readable by the server, so the form asked for
  three paths on a filesystem the operator cannot see. Local socket and SSH creation need no path and
  stay. **This restricts creation, not support**: a TCP+TLS context created outside the application
  is still listed, selectable and usable like any other, and batch 23's inventory and switch must
  stay agnostic to the endpoint kind.

All three stay reachable through the raw command console (F28) — `docker stack deploy`,
`docker buildx build --cache-to`, `docker context create` — the treatment the spec already gives
Docker Scout and image building. Batch 30's coverage matrix declares the three **console-only**:
three data entries in its coverage map (INT-2), no structural change to that batch. **No REQ number
is retired**: REQ-83, REQ-91 and REQ-92 all survive in reduced form, so the coverage check below is
unchanged. Nothing else in the plan depended on the withdrawn parts — batches 22, 24 and 25 depend
on batch 21 for its builder and cache inventory, not for cache transfer.

The human owner reserved the right to re-examine whether these capabilities are wanted at all, in
any form; this records the removal, not a judgement that they could never return.

**Four — the transfers that survive change channel (human decision, 2026-08-07): what belongs to the
operator travels through the browser, never through the server's filesystem.** This is not a
withdrawal; every capability is delivered in full. It is the answer to the same question departures
One and Three answered by removal, for the cases where removal was the wrong answer, because a
tarball of an image and a file pulled out of an image are artefacts the *operator* wants, not files
the server needs to keep. A tarball written to a path on a remote server is unreachable by whoever
asked for it, and a tarball to load would have to be put on that machine by other means first, which
defeats the feature outright.

- **REQ-42 and REQ-43**, batch 12: saving images and exporting a container's filesystem stream out as
  **browser downloads**; loading images and importing a filesystem take a file the operator picks on
  **their own machine**, streamed up. Both directions stream end to end — no whole tarball is ever
  buffered on the server, these being routinely multi-gigabyte. Batch 12's dependency drops from
  `3, 9` to `9`, batch 3 having been there only for host-path validation.
- **REQ-61**, batch 15: a single file downloads as itself and a subtree downloads as one archive; the
  operator-typed destination goes.
- **REQ-62 is reframed and kept as a first-class requirement**, batch 15. With no host write left,
  containment does not disappear, it moves — and one half of it gets *more* dangerous. A symlink
  escaping the extracted tree would make the server read a file of its own host and serve it to
  whoever is using the application: an exfiltration channel, worse than the stray write it replaces.
  And the archive built for a subtree is extracted on the operator's machine, so an absolute or
  `../` entry inside it writes outside the directory *they* chose. REQ-62 is restated over reads and
  over the archive's contents instead of over a destination path.
- **REQ-116 moves to batch 20** and is restated. With departures Three and Four both applied,
  **no host path is typed by the operator anywhere in this product**. Exactly one survives: the
  compose file of a Compose project, which the application learns from the daemon's own
  `com.docker.compose.project.config_files` label and writes back to because that file *is* the
  project's state. Validation still applies — the value arrives as a string from CLI output and is
  written to — so the service built in batch 3 keeps its purpose, with one consumer instead of five.

**Nothing is withdrawn here, so the analysis spec needs no annotation**: F11 and F15 deliver exactly
the capabilities the analysis asked for, over a different channel. **No REQ number is retired**, and
the only movement in the coverage check is REQ-116 from batch 12 to batch 20.

**One consequence to settle later**: with zero operator-typed paths, the `PathInput` primitive built
in batch 3 (INT-1) has no consumer left in the client. It is a library primitive and batch 3 is
certified, so it is left in place rather than removed as a side effect of this decision.

All other human decisions taken during validation (both CLI and API channels, full plugin
management, compose write-back, local persistence, product name "Vexel — Docker Control", static
pre-blurred backdrop with no runtime blur) either sharpen the spec or concern implementation
constraints the spec left open; they are recorded in `requirements.md` (REQ-104, REQ-110 to REQ-116,
REQ-107 to REQ-109) and in the assumptions above. Those need no correction to the spec file.

**The first and third departures above do.** `.sdd/analysis/docker_management_app.md` lists image
building twice in its functional scope — under "Image management" and under "Build system
(BuildKit/buildx) management" — and both places are annotated on the spot with the withdrawal,
pointing here. The three capabilities of departure Three are annotated the same way, under "Swarm /
orchestration management", "Build system (BuildKit/buildx) management" and "Context and daemon
management". The analysis is otherwise left as written: it is the record of what the analysis phase concluded, not a
live specification, and rewriting its conclusions after the fact would destroy that record.

## Coverage check

**Every REQ is served by at least one INT.** REQ ↔ batch mapping (each REQ closes in exactly one
batch):

| Batch | REQ closed |
| --- | --- |
| 1 foundation-ui-shell | 1–8, 107, 108, 117 |
| 2 daemon-connectivity | 9–13, 110 |
| 3 local-persistence | 115 |
| 4 containers-lifecycle | 19–23, 109 |
| 5 container-inspect-config | 24–26 |
| 6 container-logs | 30, 31 |
| 7 container-stats-processes | 32, 33 |
| 8 container-exec-attach | 34–36 |
| 9 images-core | 37–41 |
| 10 container-create-run | 27–29 |
| ~~11 image-build~~ | *withdrawn — 44–46 retired* |
| 12 image-transport | 42, 43 |
| 13 layer-stack-changesets | 47–51 |
| 14 image-filesystem-browser | 52–57, 113 |
| 15 in-tree-file-operations | 58–62 |
| 16 image-filesystem-diff | 63, 64 |
| 17 layer-efficiency-signals | 65–67 |
| 18 volumes | 70, 71 |
| 19 networks | 72–74 |
| 20 compose | 75–78, 116 |
| 21 builders-build-cache | 88, 89, 91 (90 retired) |
| 22 layer-build-cache-traceability | 68, 69 |
| 23 contexts-daemon | 92–94 |
| 24 system-prune | 95–97 |
| 25 dashboard | 14–18 |
| 26 registries | 85–87 |
| 27 swarm | 79–84 |
| 28 plugins | 98, 99, 111 |
| 29 raw-console | 100–104, 112, 114 |
| 30 coverage-matrix | 105, 106 |

REQ-1 to REQ-117 are all present exactly once, **except the four retired numbers REQ-44, REQ-45,
REQ-46 and REQ-90**, withdrawn on 2026-08-07 with F12 (see "Departures from the spec"). Retired
numbers are never reused. Excluding them: no gap, no duplicate.

(REQ-117 — responsive shell — was added on 2026-08-06, after batch 1 was certified, to cover the
viewport adaptation and phone rail drawer built during the post-certification visual rework; it
closes in batch 1 alongside the rest of F1.)

**REQs whose mechanism is built in one batch and closed in another** (declared, as required):

- REQ-6 (destructive confirmation) and REQ-7/REQ-8 (error and progress surfaces) close in batch 1,
  which builds the mechanism and demonstrates it; every later batch is expected to route its
  destructive actions, errors and long operations through it — this is part of each batch's human
  acceptance, not a re-closing of the REQ.
- REQ-113 (analysis cache across restarts): the store is built in batch 3, the REQ closes in
  batch 14, the first batch producing analysis results to cache.
- REQ-114 (console history across restarts): store in batch 3, closes in batch 29.
- REQ-116 (host-path validation): the validation service is built in batch 3 and the REQ closes in
  batch 20, its one and only consumer — the compose file, which is discovered from the daemon's
  labels rather than typed. It closed in batch 11 until that batch was withdrawn on 2026-08-07, then
  in batch 12 until departure Four the same day moved every operator-typed path to browser
  download/upload; batches 12 and 15 no longer touch a host path at all.
- REQ-109 (scroll smoothness of the glass material): the material is built in batch 1, the REQ
  closes in batch 4, the first screen dense enough to make it observable.
- REQ-5 / REQ-108 (conformance check): the check is built in batch 1 and closes there; it then runs
  in `npm run lint` for every subsequent batch.

**Every INT serves at least one REQ.** The exceptions, declared as enabling:

- `batch-foundation-ui-shell` INT-13 and INT-14 (conformance check and its wiring into the standard
  commands) — they serve REQ-5 and REQ-108 directly, so they are not exceptions.
- `batch-daemon-connectivity` INT-5 (mounting the routers on the existing Express entry point) —
  enabling, no REQ of its own; without it none of REQ-9 to REQ-13 is reachable.
- `batch-local-persistence` INT-1, INT-2, INT-3, INT-4 — enabling: they serve REQ-113, REQ-114 and
  REQ-116, which close in later batches (see above).
