---
request_slug: docker_management_app
date: 2026-08-06
type: new
---

## Request

> i want to develop an application for docker management.
>
> it must allow to manage the 100% of the docker feature
>
> in need an advanced analysis about the docker ecosystem, the docker cli capabilities and the
> docker layering.
>
> the app must have a liquid glass interface.

(Note: the request also contained an orchestration instruction — "please can you run the sdd-plan
using opus 5 instead of sonnet?" — addressed to the workflow orchestrator, not a business
requirement, and is therefore excluded from this analysis.)

> please include this two feature in this analysis .sdd/analysis/docker_management_app.md
> inspect the docker image filesystem (for the distroless container i use docker creare and docker
> cp to esport the full filesystem),
> the capability to explore the image layer and what each layer added

(Note: "creare" = `docker create`, "esport" = export — typos preserved as understood, corrected in
this analysis's prose.)

## Summary

A desktop/local client application that gives a single operator full visibility and control over
a Docker installation — containers, images, volumes, networks, builds, Compose stacks, Swarm,
registries, contexts and system-level configuration — through a visually modern, translucent
("liquid glass") interface, positioned as a richer alternative to Docker Desktop, Portainer,
OrbStack and Lazydocker. Image management includes deep, layer-aware inspection: runtime-
independent browsing of an image's full merged filesystem — including a first-class flow for
distroless/scratch images that have no shell to `exec` into — and per-layer exploration showing
what each layer added, changed or removed, its size, and its originating build instruction.

## Business goal

Docker's official and community tooling splits capability across several disconnected surfaces:
the CLI (complete but not visual), Docker Desktop (visual but partially closed-source, subscription
gated for larger companies, and heavier), Portainer (web-based, multi-host, but not native/local
and visually utilitarian), OrbStack (fast and native but macOS-only and intentionally not
"complete" — it deliberately hides advanced/rare features), and Lazydocker (terminal-only, no
graphical polish). The business value of this application is to remove that trade-off: give a
technical user (developer, DevOps engineer, homelabber) one native client that exposes the entire
functional surface of Docker with no artificial feature ceiling, while differentiating on visual
quality (a distinctive, premium "liquid glass" aesthetic) as a market differentiator against
utilitarian competitors.

Within that positioning, layering is one of the three areas explicitly called out for deep
analysis, and layer-aware image inspection is a stated differentiator. In practice, operators of
minimal/distroless/scratch images (a 2026 best-practice trend for production images, reinforced by
supply-chain-security concerns) cannot use the normal `docker exec` + shell inspection path at all,
because these images ship no shell and no coreutils. Today the only recourse is a manual,
multi-step CLI workaround (`docker create` to materialize a non-running container, then `docker
cp` to extract its filesystem to the host) — exactly the kind of "raw CLI knowledge required" gap
this app's value proposition (a complete, discoverable native client) is meant to remove.
Likewise, understanding *why* an image is large or what a given Dockerfile instruction actually
changed on disk is a routine, recurring operational need (build-cache efficiency, spotting
accidental secret leakage, image-size optimization) currently served, outside Docker's own
tooling, primarily by a separate third-party tool (`dive`). Absorbing both capabilities natively
removes two more reasons a technical operator would need to leave the app or drop to a terminal,
directly reinforcing the "100% coverage, no artificial ceiling" positioning.

## Requirements

### Functional

Grouped by the Docker capability areas the human asked to be analyzed in depth (ecosystem, CLI,
layering), translated into user-facing capabilities. "100% of Docker features" is interpreted (see
Assumptions) as full coverage of the areas below, exposed either as first-class UI flows or as an
escape-hatch raw-command/API console for the long tail of rare flags.

- **Container lifecycle management**: list, inspect, create (from image or run config), start,
  stop, restart, pause/unpause, kill, remove, rename; attach to a running container's stdio; open
  an interactive shell/exec session; view and stream logs (with filtering, search, follow,
  timestamps); view real-time resource stats (CPU, memory, network, block I/O); inspect and edit
  restart policies, resource limits, environment variables, port mappings, volume mounts and
  health checks; view and manage container processes.
- **Image management**: list, inspect (including layer history), pull, push, tag, remove, prune;
  ~~build images from a Dockerfile or build context with full build-argument, target, platform and
  cache configuration~~ — **withdrawn 2026-08-07 by human decision: the application does not build
  images; the capability stays reachable through the raw console. See "Departures from the spec" in
  `.sdd/plans/plan-docker_management_app/batches.md`**; inspect an image's layer stack, per-layer
  size and metadata; export/import
  and save/load images as tarballs; view and act on vulnerability/health recommendations (Docker
  Scout-equivalent surface) where available.
- **Volume management**: list, inspect, create, remove, prune; browse/manage the association
  between volumes and the containers that mount them.
- **Network management**: list, inspect, create, remove, prune; manage network drivers, subnets,
  and container-to-network attachment/detachment.
- **Compose (multi-container application) management**: discover, view, and manage Compose
  projects/stacks; bring stacks up/down, scale services, view aggregated logs and status per
  service, edit and validate compose files.
- **Swarm / orchestration management**: initialize/join/leave a swarm; manage nodes, services,
  tasks, stacks and secrets/configs in swarm mode, for users who operate clustered Docker.
  ~~Deploying a stack from a compose file~~ — **withdrawn 2026-08-07 by human decision: deploying
  needs a compose file on the machine running the server, which a remote operator cannot see, and a
  deployed stack keeps no link to that file. Listing and removing stacks is unaffected. See
  "Departures from the spec" in `.sdd/plans/plan-docker_management_app/batches.md`**.
- **Registry interaction**: log in/out of registries, browse repositories and tags reachable from
  configured registries, manage credentials.
- **Build system (BuildKit/buildx) management**: manage builders/build instances, ~~multi-platform
  builds~~ (**withdrawn 2026-08-07 with image building — same decision as above**), ~~build cache
  import/export~~ (**withdrawn 2026-08-07: buildx transfers a cache only as flags of a build, which
  went with image building, and a local destination is a directory on the server the operator cannot
  see — same place in `batches.md`**), and inspect build cache usage.
- **Context and daemon management**: list, create, switch between and remove Docker contexts
  (local, remote-over-SSH, ~~remote-over-TCP~~ — **creating a TCP+TLS context withdrawn 2026-08-07
  by human decision: it needs CA/client certificate and key files at paths on the server the
  operator cannot see. Listing, selecting and using a TCP+TLS context created elsewhere is
  unaffected. Same place in `batches.md`**); view daemon-level information (version, storage
  driver, root directory, resource totals) and system-wide disk usage; run system prune operations
  (containers/images/volumes/networks/build cache) with selectable scope.
- **Plugin awareness**: list installed CLI/daemon plugins and their status, where introspectable.
- **Escape hatch**: a raw command/API console so that CLI flags or API operations not (yet) modeled
  by a dedicated UI flow remain reachable, in support of the "100%" ambition without requiring the
  UI to bespoke-model every rare flag on day one.
- **Layer-aware image inspection**: a dedicatedu view that visualizes an image's layer stack (order,
  size, originating instrction, shared/duplicated layers across images) so users can reason about
  build cache efficiency and storage reuse — this is the direct product translation of the
  requested "layering" deep-dive. This extends down to per-file, per-layer changesets: for each
  layer, the set of paths added, modified and deleted by that layer specifically (not just the
  cumulative merged state), plus that layer's compressed/uncompressed size and the build
  instruction (`RUN`, `COPY`, `ADD`, etc., including its recorded command text where available)
  that produced it.
- **Filesystem browser for an image (runtime-independent)**: given any image, produce a browsable
  tree of its fully merged (post-union) filesystem — files, directories, symlinks — without
  requiring the image to be run or to contain a shell. This must work uniformly for normal images
  and for distroless/scratch/static images alike, since the latter defeat the `docker exec`-based
  inspection path entirely (no `sh`, `ls`, `cat`, or any userland binary is present to inspect
  itself from the inside).
- **First-class "extract and inspect" flow modeled on the `docker create` + `docker cp` technique**:
  the app must, on the operator's behalf, create a non-started container from the target image (no
  process is ever executed), copy its filesystem out via the container-copy mechanism, present it as
  a browsable tree, and then remove the intermediate container automatically — surfacing this today-
  manual sequence as a single one-click operation, with the intermediate container never exposed as
  a "real" running container in the UI. This extraction technique is the runtime-independent
  fallback/underlying mechanism for all images, not only distroless ones (see Assumptions).
- **In-tree file operations**: once the filesystem is extracted/mounted, allow reading file
  contents (text and binary/hex preview), inspecting permissions, ownership (uid/gid) and symlink
  targets, searching/filtering the tree (e.g. to locate binaries, shared libraries, or CA
  certificate bundles), and exporting a chosen file or subtree back out to the host filesystem for
  further inspection with external tools.
- **Cross-image filesystem diff**: compare the merged filesystem of two images (e.g. two tags of the
  same image, or before/after a rebuild) and highlight added, removed and changed paths — a natural
  extension once both filesystems are extractable trees.
- **Layer efficiency and waste signals**: surface actionable findings derived from the per-layer
  changeset data — files added in one layer and later deleted in a subsequent layer (still counted
  in image size even though absent from the final filesystem), duplicated file content across
  layers, and an overall estimate of "wasted" bytes — mirroring the kind of insight `dive` already
  provides, so the app is not a functional step backward from the closest existing prior-art tool.
- **Secret/credential leakage surfacing**: flag files that look like they were added and then removed
  in a later layer, or paths matching common credential/secret file patterns anywhere in the layer
  history (not just the final merged tree), since such artifacts remain physically present in the
  image even when invisible in the final filesystem — a known real-world risk this capability
  directly helps detect.
- **Traceability to build cache**: tie the per-layer view back into the build-cache/BuildKit
  material scoped below, so an operator can move from "this layer is large or wasteful" to "this is
  the build step and cache entry responsible for it" within the same mental model, rather than
  treating filesystem/layer inspection and build-cache inspection as unrelated UI areas.
- **Visual identity**: the interface must consistently apply a "liquid glass" visual language
  (translucent, refractive, light-responsive panels and controls) across all the above screens, not
  as a cosmetic skin on one screen only.

### Non-functional

- **Correctness/safety**: destructive operations (remove, prune, kill) must be confirmable and
  clearly distinguishable in the interface to prevent accidental data loss, given the
  administrative power being exposed.
- **Real-time responsiveness**: state shown for containers, logs and stats must reflect the live
  daemon state (event-driven or near-real-time), since Docker state changes independently of the
  app (containers can be started/stopped by other tools).
- **Transparency for the "complete coverage" promise**: because "100% of Docker features" is an
  open-ended target that grows as Docker itself evolves, the product must make it discoverable
  which capabilities are covered by dedicated UI versus reachable only via the escape hatch, so the
  completeness claim stays honest over time.
- **Accessibility of the glass aesthetic**: translucent/glass UI is known to create contrast and
  legibility challenges; the visual language must remain usable (readable text, discernible
  controls) for extended operational use, not purely decorative.
- **Local-first control**: the primary use case is managing Docker the user already has running
  (local daemon and/or remote contexts they configure), not operating a hosted multi-tenant
  service.
- **Performance and disk usage on large images**: extracting a full merged filesystem (create + copy)
  or unpacking every layer tarball to compute per-layer changesets can be expensive in time and
  temporary disk space for large images (multi-gigabyte application or ML-model-bearing images); the
  product must bound and communicate this cost (e.g. progress indication, size warnings) rather than
  silently stalling or exhausting disk space.
- **Resource cleanup guarantee**: any intermediate container created solely to extract a filesystem
  (the `docker create` step) must be reliably removed after use, including on error/cancellation
  paths, so the technique never leaves orphaned stopped containers behind — the first capability in
  the app that creates a Docker object purely as an internal implementation detail rather than at
  the operator's explicit request, so this guarantee has no equivalent among the other operations.
- **Host filesystem write safety**: when exporting extracted files/subtrees to the host, the app must
  guard against unsafe paths (e.g. path traversal via crafted symlinks or `../` segments inside the
  extracted tree, and Docker's own historical whiteout/extraction edge cases) so that extraction
  cannot write outside the operator-chosen destination.
- **Read-only guarantee on the source image**: filesystem and layer inspection must never mutate the
  source image or any running container; the created-for-extraction container must never be started
  (no process execution), consistent with the point that distroless images may have no process to
  run in the first place.

## Assumptions

- **"100% of Docker features" is scoped to the areas explicitly called out by the human (ecosystem,
  CLI, layering) plus the natural functional groups these imply** — containers, images, volumes,
  networks, Compose, Swarm, registries, BuildKit/buildx, contexts, daemon/system administration,
  and plugins — rather than literally every flag of every CLI subcommand on day one. Rationale: the
  Docker CLI surface (dozens of top-level commands, each with many flags, e.g. `docker scout`,
  `docker manifest`, `docker trust`, `docker buildx bake`) is too large to fully bespoke-model
  without a build phase; the escape-hatch raw-command capability is the assumed mechanism to
  honestly cover the long tail without inflating scope now.
- **The application targets a single technical operator managing Docker they control** (their own
  machine and/or Docker daemons/contexts they have credentials for), not a multi-tenant SaaS with
  its own user/role management layer. Rationale: nothing in the request implies multi-tenant access
  control, and the comparable products cited (OrbStack, Lazydocker) are single-operator tools;
  Portainer's team/RBAC layer is treated as out of scope unless the human says otherwise.
- **"Liquid glass" refers to the Apple-introduced visual design language** (translucent, refractive,
  light- and motion-responsive material introduced with iOS/iPadOS/macOS 26 at WWDC 2025), applied
  as the interface's aesthetic direction, not to any Docker-specific or unrelated meaning of the
  term. Rationale: this is the dominant, current (2026) usage of "liquid glass" in UI design
  discourse, and it directly matches "translucent glass interface" phrasing.
- **Swarm-mode features are included but treated as secondary** to the single-host container/image/
  volume/network/Compose workflows, reflecting that Swarm is a legacy/niche orchestration mode in
  the current Docker ecosystem (most orchestration use has moved to Kubernetes, which is out of
  scope — see Scope) while still being part of the Docker Engine feature set the human asked to
  cover "100%" of.
- **The application manages Docker Engine/Moby-based daemons** (local or remote, including
  Docker-Desktop-provided daemons) — not Kubernetes clusters, not non-Docker OCI runtimes (Podman,
  containerd/nerdctl standalone) beyond what Docker itself uses internally. Rationale: the request
  says "docker management" throughout, not "container management" broadly; Kubernetes/Podman
  support would be a distinct, much larger scope decision.
- **No requirement was stated for authentication, multi-user accounts, telemetry, or licensing
  model**; these are treated as not applicable at this stage and are left for later phases to
  decide once the product's distribution model is set.
- **"Docker cp" refers to the container-copy mechanism as used against a non-started container**
  created for the sole purpose of filesystem extraction, exactly as the human describes, not to
  copying files into/out of a *running* container as an operational task (that already-implied use
  case remains covered generically by container-management). Rationale: the human's own
  description ties the technique specifically to the distroless-inspection workaround.
- **The per-layer changeset is computed by unpacking and diffing layer blobs (including honoring
  whiteout markers) rather than solely relying on `docker history`**, because `docker history` alone
  is known to omit or truncate information for images pulled from a registry (missing intermediate
  layer IDs, `<missing>` entries, truncated command strings) — insufficient for the fidelity the
  human's request implies ("what each layer added"). Rationale: this is standard practice in the
  closest prior-art tool (`dive`) and is necessary to meet the stated goal for pulled, not just
  locally-built, images.
- **`dive` is treated as the direct functional benchmark for the layer-exploration capability**, and
  this app's layer view should be at parity with or exceed dive's core outcomes (per-layer added/
  removed/modified sets, size, an efficiency/waste signal), consistent with the "no artificial
  ceiling" positioning. Rationale: dive is the closest, actively used prior-art tool in exactly this
  niche and the human did not name an alternative benchmark.
- **Filesystem browsing supports read/export, not in-place editing** of an image's filesystem.
  Rationale: the human's own workaround (extract via `docker cp`) is inherently read-oriented, and
  editing image filesystems in place is not part of normal Docker workflows (an image is rebuilt via
  Dockerfile instructions, not hand-edited); introducing write-back would be a materially larger,
  separate feature.
- **The extraction technique remains the fallback/underlying mechanism for all images, not only
  distroless ones** — the same "create (never start) + copy" flow works uniformly whether or not the
  image has a shell, so the app does not need two separate code paths gated on image type. Rationale:
  the technique is runtime-independent by construction, which is precisely why the human uses it for
  distroless images in the first place; applying it universally keeps the feature simpler and
  consistent.

## Constraints

- **Domain constraint — dependency on the Docker Engine API and CLI surface**: the product's
  functional ceiling is bounded by what the Docker Engine API and CLI expose; features Docker
  itself does not expose programmatically cannot be delivered.
- **Domain constraint — Docker Engine API evolves under versioning**: Docker's Engine API is
  versioned and gains fields/endpoints over time (e.g. BuildKit-related build output options); the
  product must track a specific API/CLI baseline and accept that "100% coverage" is a moving target
  as Docker ships new versions.
- **Domain constraint — destructive, system-level operations**: several in-scope operations (prune,
  remove, kill, daemon-level system changes) are irreversible and can affect other tools/processes
  sharing the same Docker daemon, which is a standing operational risk inherent to the domain, not
  specific to this app.
- **Design constraint — "liquid glass" is a live, evolving design language** originating from and
  most native to Apple platforms; applying it consistently and accessibly across all functional
  screens is a sustained design constraint on every future UI decision, not a one-off skin.
- **Domain constraint — layer blobs and whiteouts follow the OCI image format**: any per-layer
  changeset computation must correctly interpret whiteout files (`.wh.<name>` for deleted entries and
  the `.wh..wh..opq` opaque-directory marker for "everything previously in this directory is hidden")
  as defined by the OCI/Docker image layer format, since naive tarball diffing without whiteout
  awareness would misreport deletions as ordinary missing files.
- **Domain constraint — `docker history` is an incomplete data source**: for images pulled from a
  registry rather than built locally, intermediate layer identifiers and full build commands are
  often unavailable (`<missing>`, truncated `CreatedBy` strings); the per-layer feature cannot assume
  `docker history` alone is sufficient and must fall back to image config (`rootfs.diff_ids`,
  `history` entries, `empty_layer` markers) and raw layer digests from the OCI manifest/config.
- **Domain constraint — extraction cost scales with image size**: there is no way to inspect a
  merged filesystem or compute full per-layer changesets without at some point reading every layer's
  content, so cost is fundamentally proportional to image size; this bounds how "instant" the feature
  can ever be for very large images, independent of implementation choices left to later phases.

## Market trends

The Docker-management-tool space is active and directly comparable, so market research is
relevant. The layer-exploration capability additionally has a clear, actively maintained prior-art
tool, and the filesystem-inspection capability responds to a real, current best-practice trend
(minimal/distroless base images), so both were researched as well.

- **Docker Desktop** remains the official, most complete GUI, but is bound to Docker's product/
  licensing model and is comparatively heavier; this app's differentiator is being an independent,
  visually distinctive alternative. ([Docker Docs](https://docs.docker.com/build/buildkit/))
- **Portainer** is the most widely deployed third-party Docker/Swarm/Kubernetes web UI, positioned
  for remote/multi-host/team management with a functional, utilitarian interface — a strong
  functional benchmark but not a visual-design benchmark.
  ([Better Stack comparison](https://betterstack.com/community/comparisons/docker-ui-alternative/))
- **OrbStack** is the closest positioning match (native, fast, polished single-operator client) but
  is macOS-only, subscription-priced, and — notably — deliberately does *not* try to expose every
  Docker feature, favoring simplicity over completeness; this app's "100% coverage" ambition is a
  direct point of differentiation from OrbStack's philosophy.
  ([Unstore, Docker Desktop alternatives 2026](https://unstore.io/discover/best-docker-desktop-alternatives-desktop/))
- **Lazydocker** and **Dockge** show sustained demand for lightweight, fast Docker management from
  technical users, but both intentionally stay minimal (terminal UI / compose-file-centric web UI
  respectively) rather than aiming for full feature coverage with a rich visual layer.
  ([HomeLab Starter comparison](https://homelabstarter.com/homelab-container-management/))
- **BuildKit is now the default build engine** since Docker Engine 23.0, with BuildKit 0.17
  (Q1 2026) adding rootless execution and tighter containerd integration — reinforcing that any
  "advanced" build/layer feature set must be modeled around BuildKit/buildx concepts (build cache,
  multi-platform builds, output configuration), not the legacy builder.
  ([Docker Docs, BuildKit](https://docs.docker.com/build/buildkit/); [dasroot.net BuildKit deep dive, 2026](https://dasroot.net/posts/2026/01/docker-buildkit-advanced-build-features/))
- **Docker Scout** is now a standard part of the Docker CLI/Desktop surface for image vulnerability
  and base-image-freshness recommendations, indicating that "advanced" image management in 2026 is
  expected to include supply-chain/security visibility, not just layer/size inspection.
  ([Docker Scout CLI docs](https://docs.docker.com/reference/cli/docker/scout/recommendations/))
- **"Liquid Glass"** is Apple's current (WWDC 2025-introduced, shipping across iOS/iPadOS/macOS 26)
  design language: a translucent, light-refracting, motion-responsive material system, described as
  Apple's biggest interface change since iOS 7 and its philosophy traces back to visionOS's
  glass-based spatial materials. Accessibility commentary already flags contrast/legibility risk
  with heavy translucency, which is reflected in this analysis's non-functional requirements.
  ([Wikipedia, Liquid Glass](https://en.wikipedia.org/wiki/Liquid_Glass); [glassui.dev WWDC 2025 analysis](https://glassui.dev/blog/liquid-glass-apple-design-wwdc-2025); [designedforhumans.tech, accessibility](https://designedforhumans.tech/blog/liquid-glass-smart-or-bad-for-accessibility))
- **`dive` (wagoodman/dive) is the reference tool for per-layer Docker/OCI image exploration**: it
  shows layers alongside a merged filesystem tree, marks files as added/modified/removed/unmodified
  per layer, computes an experimental "image efficiency" score and estimated wasted-space metric, and
  reads images from the Docker engine, Podman, or tar archives. Its documented limitation is that,
  for images pulled from a registry rather than built locally, full build history/intermediate layers
  may be unavailable — the same `docker history` limitation this analysis's Constraints section
  already accounts for. This app's layer-exploration feature should match dive's core outcomes
  (per-layer changeset, size, waste signal) while being delivered inside a broader, visually
  distinctive, always-available native client rather than a separate terminal-UI tool the operator
  has to install and switch to. ([wagoodman/dive on GitHub](https://github.com/wagoodman/dive))
- **Minimal/distroless base images are established, actively promoted 2026 production practice**
  (Google's `distroless` project, Chainguard's distroless images, and Docker's own "Docker Hardened
  Images" distroless offering), explicitly trading away a shell and package manager for a smaller
  attack surface and image size. This directly validates the pain point of images with no shell to
  `exec` into: distroless images are common enough in current practice that this is a real,
  recurring operational scenario the app must handle natively, not an edge case.
  ([Docker Docs, Minimal or distroless images](https://docs.docker.com/dhi/core-concepts/distroless/); [GoogleContainerTools/distroless on GitHub](https://github.com/googlecontainertools/distroless); [Chainguard Academy, Getting started with distroless](https://edu.chainguard.dev/chainguard/chainguard-images/about/getting-started-distroless/))
- **`docker export` and `docker save` are documented, Docker-native alternatives with different
  trade-offs than `docker create` + `docker cp`**: `docker save` preserves the full layered
  image/history and is meant for image transport/archival (larger, layer-aware tarball); `docker
  export` flattens a *container's* current filesystem into a single-layer tarball, discarding image
  history entirely and losing per-layer attribution — meaning `docker export` alone cannot serve the
  per-layer changeset capability, only the merged-filesystem-snapshot capability, and even then
  requires a container to already exist (the same precondition the `docker create` step satisfies).
  This confirms `docker create` + `docker cp` (extract into a live, browsable directory without
  producing an intermediate tarball the operator must unpack) as the more direct mechanism for
  interactive filesystem browsing, while `docker save`/layer-blob reading remains the correct
  mechanism for the separate per-layer changeset capability.
  ([Baeldung on Ops, Difference Between Docker Save and Export](https://www.baeldung.com/ops/docker-save-export))

## Risks

- **Scope creep / unbounded completeness target**: "100% of Docker features" has no natural
  stopping point, since Docker's own surface keeps growing; without the escape-hatch approach and
  the tiered coverage model above, the project risks never feeling "done."
- **Destructive-action risk**: exposing prune/remove/kill operations broadly increases the chance
  of accidental data loss if the interface does not clearly separate safe/read operations from
  destructive ones.
- **Design-vs-usability tension**: heavy translucency/glass effects can reduce text and control
  legibility, which is a real risk for an app whose core value is dense operational information
  (logs, stats, layer trees).
- **API/version drift**: building against a specific Docker Engine API/CLI/BuildKit baseline means
  the product can fall behind as Docker ships new versions (new commands, new API fields), eroding
  the completeness claim over time if not revisited periodically.
- **Competitive commoditization**: several free, mature alternatives (Portainer, Lazydocker, Dockge)
  already cover large parts of this functional scope, so visual differentiation ("liquid glass")
  and completeness are the main defensible value propositions; if either erodes, the product's
  reason to exist weakens.
- **Performance/disk risk on large or many-layered images**: full filesystem extraction or per-layer
  unpacking can be slow and disk-intensive for large images (common with ML/data-heavy or monolithic
  application images); without size warnings or streaming/partial views, the feature can feel broken
  rather than merely slow.
- **Orphaned intermediate containers**: since this is the first capability in the app that creates a
  Docker object purely as an internal mechanism (not at the operator's explicit, visible request), a
  bug or crash mid-flow risks leaving stray stopped containers behind, silently consuming disk and
  cluttering the container list — a failure mode not present in any other feature.
- **Unsafe extraction to host**: writing extracted files/subtrees to the host filesystem introduces a
  path-traversal-style risk (e.g. via symlinks inside the image pointing outside the intended
  destination), distinct from the general "destructive operations" risk since it involves writing
  arbitrary extracted content to the host rather than acting on Docker objects.
- **False sense of completeness from `docker history` alone**: if the per-layer feature is built on
  `docker history` output without falling back to OCI config/manifest data, it will silently produce
  incomplete or misleading results for registry-pulled images (missing layer IDs, truncated commands)
  — undermining the "what each layer added" promise for exactly the images (pulled, not locally
  built) operators most often need to inspect.
- **Benchmark risk against `dive`**: because `dive` is free, mature and already solves the layer-
  exploration problem well, this feature only adds value if it is at least as capable and better
  integrated (native UI, no separate tool/install) — falling short of dive's core outcomes would make
  this pillar a visible regression rather than a differentiator.

## Scope

**In scope**: management of a Docker Engine/Moby-based installation (local and/or remote via
contexts) covering containers, images, volumes, networks, Compose projects, Swarm orchestration,
registry interaction, BuildKit/buildx build management, daemon/system administration and prune
operations, plugin visibility, and an escape-hatch raw command/API console for long-tail coverage —
all delivered through a consistently applied liquid-glass visual design language. Image management
includes: layer stack visualization (order, size, originating instruction, shared/duplicated
layers) and build-cache inspection; runtime-independent, full-filesystem inspection of any Docker
image (with an explicit first-class flow for distroless/scratch images) via a `docker create` +
`docker cp`-equivalent extraction; in-tree file reading, metadata inspection (permissions,
ownership, symlinks) and export to host; cross-image filesystem diffing; per-layer changeset
exploration (added/modified/deleted paths, size, originating instruction) sourced from OCI
manifest/config/layer data rather than `docker history` alone; layer efficiency/waste and
potential-secret-leakage signals; automatic cleanup of any intermediate container created for
extraction.

**Out of scope** (unless a future evolution request extends it): Kubernetes cluster management;
non-Docker container runtimes (Podman, bare containerd/nerdctl) as first-class targets; multi-
tenant user/role/team access control (Portainer-style RBAC); hosted/SaaS multi-tenant operation;
CI/CD pipeline features; image vulnerability scanning as a built-from-scratch capability beyond
surfacing what Docker's own tooling (Scout-equivalent data) already exposes — secret-pattern
flagging in extracted filesystems is a lightweight heuristic signal, not a full security-scanning
capability; in-place editing of an image's filesystem (read/export only, per Assumptions); building
a general-purpose file manager unrelated to image/layer inspection; licensing/monetization model.
</content>
