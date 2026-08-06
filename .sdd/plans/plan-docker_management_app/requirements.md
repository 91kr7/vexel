---
slug: docker_management_app
date: 2026-08-06
spec: .sdd/analysis/docker_management_app.md
status: validated
---

# Requirements — Docker management app

Requirements are observable, individually verifiable behaviours. They are grouped by feature; each
feature is meant to become one vertical batch (the visual foundation being the single declared
enabling feature).

Visual reference: `.sdd/analysis/ui-mock/` constrains look, layout and interaction — not scope.

## F1 — Visual foundation and application shell (enabling)

| ID | Requirement |
| --- | --- |
| REQ-1 | The application presents itself as "Vessel — Docker Control" in a persistent shell composed of a left navigation rail grouped into sections (Workloads, Artifacts, Environment, Full coverage), a header carrying the current screen title and its one-line description with the global actions (live-events indicator, search, console), and a footer showing the active Docker context. |
| REQ-2 | Activating a navigation entry replaces the main area with the corresponding screen and marks that entry as active, while the rail, header and footer stay in place. |
| REQ-3 | Every surface of the application is rendered with one single "liquid glass" visual language — translucency over a pre-blurred static background: alpha layers, borders, inner highlights and gradient overlays, with consistent elevation, radii, spacing and typography — defined in one place and applied identically on every screen. |
| REQ-4 | Text and interactive controls placed on glass surfaces remain legible: body text, secondary text and control labels meet a documented minimum contrast ratio against their backdrop on every screen. |
| REQ-5 | No feature code emits raw DOM tags or carries CSS: every visual element comes from the internal UI library, and an automated check run by the project's lint/test command fails when feature code violates this (documented, commented escape-hatch exceptions excluded). |
| REQ-107 | The application's backdrop is a static, already-blurred image asset: nothing on the backdrop is animated (no animated gradient or mesh, no moving blob, no looping video, no canvas animation loop, no CSS animation/transition on the backdrop, no scroll parallax). |
| REQ-108 | No runtime blur is computed by the browser on panels, surfaces, the shell, modals or drawers: `backdrop-filter` and `filter: blur()` are absent from those surfaces, and the same automated check as REQ-5 fails when they appear, the only tolerated case being a small, short-lived, non-repeated element carrying an on-the-spot justification. |
| REQ-109 | Scrolling a dense screen (long container/image list, log stream, layer tree) with panels, drawers and modals open stays visually smooth on a normal developer machine, with no frame collapse attributable to the glass material. |
| REQ-117 | The shell adapts to the viewport instead of requiring a desktop-width window: the navigation rail stays docked (narrowing) down to tablet width, and below the phone breakpoint it becomes an off-canvas drawer opened by a menu control in the header and closed by selecting an entry, tapping the dimmed scrim behind it or pressing Escape; at every width the header's title, description and actions stay inside the header without overflowing it, and no region of the shell is cut off or unreachable. |
| REQ-6 | Any destructive action (remove, kill, prune, down, leave swarm, log out, …) is visually marked as destructive and is executed only after an explicit confirmation that names the target and states the consequence; cancelling performs nothing. |
| REQ-7 | When an operation fails, the application shows the failure together with the daemon's own error message, and the screen stays usable (no blank or broken state). |
| REQ-8 | An operation that is not instantaneous shows a pending/progress indication and never blocks navigation to other screens while it runs. |

## F2 — Daemon connectivity and live state

| ID | Requirement |
| --- | --- |
| REQ-9 | The application talks to the Docker daemon of the active context and permanently shows the connection state (connected / unreachable) in the shell. |
| REQ-10 | When the daemon is unreachable, refuses the connection or exposes an unsupported API version, the application explains the cause and offers a retry instead of showing empty screens. |
| REQ-11 | A change made to Docker outside the application (CLI or another tool) is reflected in the displayed state within a few seconds, without the operator triggering a manual refresh. |
| REQ-12 | A live daemon event stream is available and shows events as they occur, each with a timestamp, the object type (container, image, network, volume, builder, …) and the action. |
| REQ-13 | The application reports which Docker Engine API version it negotiated with the connected daemon. |
| REQ-110 | The application detects whether the local `docker` CLI and its `compose`/`buildx` plugins are available, reports their version or their absence explicitly, and names which capabilities are unavailable when one of them is missing, instead of failing opaquely at the moment of use. |

## F3 — Dashboard

| ID | Requirement |
| --- | --- |
| REQ-14 | The dashboard shows summary tiles for running containers (with the stopped/paused count), images (count and on-disk size), volumes (count and on-disk size), stacks (count, split compose/swarm) and build cache (size and active builder). |
| REQ-15 | The dashboard lists current container activity with, per container, its state, CPU usage and uptime, refreshed live. |
| REQ-16 | The dashboard shows disk usage broken down by images, containers, volumes and build cache, each with its absolute size and its relative share. |
| REQ-17 | The dashboard shows the most recent daemon events in a live panel. |
| REQ-18 | Activating a tile or a listed item on the dashboard navigates to the screen that owns that object. |

## F4 — Container list and lifecycle

| ID | Requirement |
| --- | --- |
| REQ-19 | The containers screen lists every container, running or not, with name, short id, state, image, CPU, memory used/limit, published port mappings and uptime. |
| REQ-20 | Each container offers exactly the lifecycle actions its current state allows (start, stop, restart, pause, unpause, kill, remove); executing one applies it to the daemon and the row reflects the resulting state. |
| REQ-21 | A container can be renamed. |
| REQ-22 | Stopped containers can be pruned in one bulk action from the screen, reporting how many were removed and the space reclaimed. |
| REQ-23 | The container list can be filtered and text-searched by name, image or state. |

## F5 — Container inspection and configuration

| ID | Requirement |
| --- | --- |
| REQ-24 | Selecting a container opens a detail view showing its inspect data: id, image, command/entrypoint, creation date, state details and exit code, restart policy, resource limits, environment variables, port mappings, mounts, attached networks, labels, and health-check configuration with its latest results. |
| REQ-25 | Restart policy, resource limits, environment variables, port mappings, mounts and health check can be edited from the detail view; the change is applied to the container (recreating it when Docker requires it, after telling the operator) and the outcome is reported. |
| REQ-26 | The raw inspect payload of a container is viewable and copyable as-is. |

## F6 — Container creation and run

| ID | Requirement |
| --- | --- |
| REQ-27 | A container can be created from an image with configuration of name, command/entrypoint, environment variables, port mappings, volume mounts, networks, restart policy, resource limits, labels and privileged/capability options, either created only or created and started immediately. |
| REQ-28 | The creation form validates the inputs it can validate locally and surfaces a daemon rejection with the daemon's own message, keeping the entered configuration for correction. |
| REQ-29 | The image to run can be picked among local images or given by reference; if the reference is not present locally it is pulled first, with the pull progress shown. |

## F7 — Container logs

| ID | Requirement |
| --- | --- |
| REQ-30 | A container's logs can be viewed with selectable streams (stdout/stderr), live follow, timestamps on/off, tail size and a since/until time filter. |
| REQ-31 | The displayed logs can be text-searched with the matches highlighted, and the visible log can be copied or downloaded. |

## F8 — Container stats and processes

| ID | Requirement |
| --- | --- |
| REQ-32 | A container's live resource usage (CPU %, memory used/limit, network in/out, block I/O) is shown and keeps updating while the view is open. |
| REQ-33 | The processes running inside a container are listed with pid, user and command, and can be refreshed on demand. |

## F9 — Container exec and attach

| ID | Requirement |
| --- | --- |
| REQ-34 | An interactive session can be opened inside a running container with a chosen command/shell, user and working directory; keystrokes reach the process, its output is rendered, and the session follows the available terminal size. |
| REQ-35 | The stdio of a running container can be attached to and detached from without stopping the container. |
| REQ-36 | Leaving an interactive session closes it and releases the underlying exec/attach resources on the daemon. |

## F10 — Image list and registry-facing actions

| ID | Requirement |
| --- | --- |
| REQ-37 | The images screen lists local images with repository:tag (all tags), short digest, platform(s), size and creation age. |
| REQ-38 | An image can be pulled by reference with an optional platform selection, showing per-layer download/extract progress until completion. |
| REQ-39 | An image can be tagged with a new reference, untagged, pushed to a registry, and removed; dangling images can be pruned. |
| REQ-40 | An image's inspect data (config, entrypoint/cmd, env, labels, exposed ports, digest, platform, size, recorded build history) is viewable. |
| REQ-41 | The image list can be filtered and text-searched by reference or digest. |

## F11 — Image transport (save/load, export/import)

| ID | Requirement |
| --- | --- |
| REQ-42 | One or more images can be saved to a tarball, and images can be loaded back from a tarball, with progress and the resulting references reported. |
| REQ-43 | A container's filesystem can be exported to a tarball, and an image can be imported from a filesystem tarball with an optional target reference and config changes. |

## F12 — Image build from Dockerfile

| ID | Requirement |
| --- | --- |
| REQ-44 | An image can be built from a chosen build context and Dockerfile with build arguments, target stage, platform(s), tags, labels and cache options (cache-from, cache-to, no-cache). |
| REQ-45 | The build output is streamed live while the build runs, showing each step, whether it was cached or executed, warnings and errors, and reporting the resulting image reference on success. |
| REQ-46 | A running build can be cancelled, and the cancellation is reported. |

## F13 — Layer stack and per-layer changesets

| ID | Requirement |
| --- | --- |
| REQ-47 | For a selected image the whole layer stack is shown in order with, per layer, its digest, its compressed and uncompressed size, whether it is an empty layer, and the build instruction that produced it with the full recorded command text where available. |
| REQ-48 | Layer information is derived from the image manifest and config (rootfs diff ids, history entries, empty-layer markers) so that layers are shown completely for registry-pulled images too, and any information the daemon genuinely cannot provide is displayed as explicitly unavailable rather than omitted silently. |
| REQ-49 | Selecting a layer shows the paths that this specific layer added, modified and deleted — not the cumulative merged state — with each path's size, honouring OCI whiteout markers (`.wh.<name>` and `.wh..wh..opq`) so that deletions and hidden directories are reported as deletions, not as missing files. |
| REQ-50 | Layers shared with other local images are marked as shared and the images sharing them are listed. |
| REQ-51 | Computing the per-layer changesets shows progress and can be cancelled, and the operator is warned of the expected time and temporary disk cost before it starts on a large image. |

## F14 — Runtime-independent image filesystem browser

| ID | Requirement |
| --- | --- |
| REQ-52 | For any image, its fully merged post-union filesystem can be browsed as a tree of files, directories and symlinks, without running the image, and identically whether the image contains a shell or is a distroless/scratch image with no userland at all. |
| REQ-53 | The extraction is performed by creating a container from the image without ever starting it and copying its filesystem out; no process from the image is ever executed. |
| REQ-54 | The intermediate container created for the extraction is removed automatically once the extraction ends — including on error and on cancellation — and it is never shown as a container anywhere in the application. |
| REQ-55 | The extraction shows progress and can be cancelled, and announces the expected time and temporary disk cost before starting on a large image. |
| REQ-56 | Filesystem and layer inspection never modify the source image, any of its tags, or any pre-existing container. |
| REQ-57 | The temporary data produced by an extraction is released when the inspection session ends, and any temporary data left behind by an interrupted run is detected and cleaned up on the next start. |

## F15 — In-tree file operations

| ID | Requirement |
| --- | --- |
| REQ-58 | For an entry of the extracted tree, its size, permissions, owner uid/gid, modification time, entry type and symlink target are shown. |
| REQ-59 | A file's content can be previewed as text or as a hex dump, the mode being chosen automatically from the content and overridable by the operator, with oversized files truncated and the truncation stated. |
| REQ-60 | The tree can be filtered and searched by name or path fragment (e.g. to locate binaries, shared libraries or CA-certificate bundles), showing the matches in their position in the tree. |
| REQ-61 | A selected file can be downloaded through the browser, and a selected file or subtree can additionally be exported to a destination path on the host typed by the operator, the outcome (what was written, where) being reported. |
| REQ-62 | An export can never write outside the chosen destination: `../` segments and symlinks pointing outside the extracted tree are neutralised or refused, the destination path itself is refused when it is unsafe, non-existent or not writable, and every refusal is reported with its reason. |

## F16 — Cross-image filesystem diff

| ID | Requirement |
| --- | --- |
| REQ-63 | Two images can be compared and the difference between their merged filesystems is shown as added, removed and changed paths, navigable as a tree. |
| REQ-64 | For a changed path, the nature of the change (content, size, mode, ownership, symlink target) is indicated, and the two sides can be previewed for comparison. |

## F17 — Layer efficiency, waste and secret signals

| ID | Requirement |
| --- | --- |
| REQ-65 | For an image, the files added by one layer and later deleted or overwritten by a subsequent layer are listed with the bytes they still occupy in the image, together with a total estimate of wasted bytes and an efficiency score. |
| REQ-66 | File content duplicated across several layers is identified, with the paths involved and the bytes it wastes. |
| REQ-67 | Paths matching common credential/secret patterns found anywhere in the layer history — including files absent from the final merged filesystem — are flagged with the layer that introduced them and the layer that removed them, presented explicitly as a heuristic signal and not as a security verdict. |

## F18 — Layer to build-cache traceability

| ID | Requirement |
| --- | --- |
| REQ-68 | From a layer of an image, the build step and the build-cache entry responsible for it can be reached when the association is available; when it is not, the reason is stated rather than left blank. |
| REQ-69 | From a build-cache entry, the images and layers it is associated with can be reached, when the association is available. |

## F19 — Volumes

| ID | Requirement |
| --- | --- |
| REQ-70 | Volumes are listed with name, driver, mountpoint, size and the containers mounting them, with unattached volumes identifiable. |
| REQ-71 | A volume can be created (name, driver, driver options, labels), inspected in full, and removed; unused volumes can be pruned with the reclaimed space reported. |

## F20 — Networks

| ID | Requirement |
| --- | --- |
| REQ-72 | Networks are listed with name, driver, scope, subnet and gateway, and the containers currently attached to each. |
| REQ-73 | A network can be created (name, driver, subnet, gateway, IP range, options, labels), inspected in full, and removed; unused networks can be pruned. |
| REQ-74 | A container can be attached to and detached from a network directly from the network view, and the attachment list updates accordingly. |

## F21 — Compose

| ID | Requirement |
| --- | --- |
| REQ-75 | Compose projects are discovered and listed with their project name, compose file path, overall state and per-service state. |
| REQ-76 | A stack can be brought up, brought down and restarted, and each of its services can be scaled to a chosen number of replicas, with the resulting state reflected in the list. |
| REQ-77 | The compose file of a project is displayed, can be edited and saved back to its location on disk after an explicit confirmation, and can be validated on demand, showing valid/invalid with the errors and a summary of the services, volumes and networks it declares. |
| REQ-78 | The aggregated live logs of all services of a stack are shown, each line labelled with the service it comes from. |

## F22 — Swarm

| ID | Requirement |
| --- | --- |
| REQ-79 | The swarm state of the active daemon is shown (inactive, manager, worker, with cluster id, node count and raft health); a swarm can be initialised, joined using a join token, and left. |
| REQ-80 | The manager and worker join tokens can be displayed and rotated. |
| REQ-81 | Swarm nodes are listed with hostname, role, availability and status; a node's role and availability can be changed and a node can be removed. |
| REQ-82 | Swarm services are listed with image, mode (replicated/global), running/desired replicas and published ports; a service can be created, updated (image, replicas, env, ports), inspected together with its tasks, and removed. |
| REQ-83 | Swarm stacks can be deployed from a compose file, listed with their services, and removed. |
| REQ-84 | Swarm secrets and configs are listed with name and age, created, inspected as metadata (never revealing a secret's value) and removed. |

## F23 — Registries

| ID | Requirement |
| --- | --- |
| REQ-85 | Configured registries are listed with their host, the authenticated account, the credential store in use and whether the session is authenticated; a registry can be logged in to and logged out of. |
| REQ-86 | Repositories and their tags reachable from a selected registry can be browsed and searched, with each tag's size shown, and a tag can be pulled directly from the result. |
| REQ-87 | Credentials are delegated to the host's Docker credential store and are never displayed back in clear text nor persisted by the application itself. |

## F24 — Builders and build cache

| ID | Requirement |
| --- | --- |
| REQ-88 | buildx builders are listed with name, driver, endpoint, supported platforms, status and cache size; the builder currently in use is identified and another one can be selected as the active builder. |
| REQ-89 | A builder can be created (name, driver, endpoint, platforms) and removed. |
| REQ-90 | A multi-platform build can be configured and launched on the selected builder (context, Dockerfile, target stage, platforms, build args, cache from/to, output/push) with its output streamed live. |
| REQ-91 | The build cache is listed record by record with id, type, size and usage state (in use, shared, reclaimable), and can be pruned, exported and imported, reporting the space reclaimed or transferred. |

## F25 — Contexts and daemon information

| ID | Requirement |
| --- | --- |
| REQ-92 | Docker contexts are listed with name, endpoint and which one is active; a context can be created (local socket, SSH, TCP with TLS), selected as active, and removed. |
| REQ-93 | Selecting another context re-points every screen of the application at the newly selected daemon, and the active-context indicator in the shell updates. |
| REQ-94 | The daemon of the active context reports its version, Engine API version, BuildKit version, storage driver, cgroup driver, OS/architecture, root directory and container counts. |

## F26 — System disk usage and prune

| ID | Requirement |
| --- | --- |
| REQ-95 | Reclaimable disk space is broken down by stopped containers, dangling images, unused volumes, unused networks and build cache, each with its size and a description of what it contains. |
| REQ-96 | Each category can be pruned individually and a system-wide prune with selectable scope can be run; in both cases the space actually reclaimed is reported and the breakdown refreshes. |
| REQ-97 | Before a prune, the application states that the daemon is shared and that other tools using it are affected by the operation. |

## F27 — Plugins

| ID | Requirement |
| --- | --- |
| REQ-98 | Installed CLI plugins are listed with name, version and availability state, as far as the local Docker installation exposes them. |
| REQ-99 | Daemon plugins are listed with name, type (log/volume/network driver, …) and enabled/disabled state, as far as the daemon exposes them. |
| REQ-111 | A daemon plugin can be installed from a reference (reviewing and granting the privileges it requests), enabled, disabled, inspected and removed, each state change being reflected in the list and the removal being treated as destructive. |

## F28 — Raw command and API console

| ID | Requirement |
| --- | --- |
| REQ-100 | An arbitrary Docker CLI command can be entered and executed against the active context, with its stdout, stderr and exit code streamed back into the console. |
| REQ-101 | An arbitrary Docker Engine API call (method, path, query, body) can be issued against the active daemon and its raw status and response body shown. |
| REQ-102 | The console keeps the history of the session's commands, allows recalling and re-running a previous entry, and allows copying any entry with its output. |
| REQ-103 | The console presents the long-tail commands it is the intended escape hatch for (e.g. manifest, trust, scout, sbom, buildx bake, checkpoint) as one-click starting points. |
| REQ-104 | The console states which channel each entry runs on (local `docker` CLI process or Engine API call) and that it executes with the full privileges of the daemon and of the local user. |
| REQ-112 | A console entry recognised as destructive (remove, prune, kill, system-wide operations, swarm leave, …) goes through the same explicit confirmation as the rest of the application before it runs, naming the command that is about to be executed. |

## F29 — Coverage matrix

| ID | Requirement |
| --- | --- |
| REQ-105 | A coverage screen lists the Docker capability areas and states, for each, whether it is covered by a dedicated screen or reachable only through the raw console, with a link to the covering screen when there is one. |
| REQ-106 | The coverage screen declares the Docker Engine API and CLI baseline the stated coverage refers to, and the daemon version currently connected, so a mismatch is visible. |

## F30 — Local persistence and host-path access (enabling)

| ID | Requirement |
| --- | --- |
| REQ-113 | The result of an image extraction/layer analysis is kept across application restarts and reused when the same image content is inspected again instead of being recomputed, is invalidated when the image content changes, and its total size is shown and can be cleared by the operator. |
| REQ-114 | The raw console's command history survives application restarts. |
| REQ-115 | Operator UI preferences (last screen, list filters, log follow/timestamps toggles, selected context) survive application restarts. |
| REQ-116 | Every host path supplied by the operator (build context, Dockerfile, compose file, tarball source/target, export destination) is validated before use — existence, kind, accessibility, and absence of traversal outside the allowed root — and is refused with the reason stated when it does not qualify. |

## Assumptions carried by these requirements

- Single operator, no authentication, no multi-user roles: nothing in the spec calls for them.
- One active Docker context at a time: every screen shows the state of the active context only
  (as the mockups' permanent "active context" footer implies).
- "Liquid glass" = translucency over a static, pre-blurred background asset, defined as design
  tokens and materials in the UI library, never per screen and never as a runtime blur.
- Two access channels to Docker: the Engine API is the primary channel for all features, the local
  `docker` / `docker compose` / `docker buildx` CLI is used for the raw console and for what the
  API does not cover cleanly. The CLI is therefore a declared prerequisite (REQ-110).
- The interactive terminal surface (REQ-34, REQ-35) is built on a third-party terminal emulator
  wrapped in a single UI-library component that owns its host element, under the documented
  `CLAUDE.md` escape hatch; feature code consumes only that component's typed props and callbacks.
- Docker Scout / vulnerability data is reachable through the raw console only; no dedicated
  requirement, screen or batch in this plan.
- The mockups constrain look, layout and interaction; screens the mockups do not detail (layer
  explorer, filesystem tree, diff, container detail, logs, exec) reuse the same visual language.
