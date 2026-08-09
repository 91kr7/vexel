---
module: app-shell
component: Shell
type: UI component
---

# Shell

**Purpose** → the "Vexel — Docker Control" application shell: the persistent rail/header/footer
around the active screen.

## Contract

Description:
- Owns a `ToastProvider` and a `ConfirmationProvider` around its own tree (screen-local services:
  any screen it renders can call `useToast()`/`useConfirmation()` without the caller wiring them).
  Inside, renders a `Frame` whose rail is a `NavRail` built from the navigation data (one
  `NavGroup` per group, one `NavItem` per screen), whose header is a `PageHeader` for the active
  screen (with a live-events `StatusPill`, an "Engine API v…" `Badge` when the daemon is reachable,
  a search `Button` with a `KeyHint`, and a console `Button`), and whose footer status (active
  Docker context) is shown inside the rail.
Shows:
- The active screen's title and description in the header; in the content area: any active
  `ErrorBanner`s (REQ-7), an unreachable-daemon `ErrorBanner` with cause and retry when the daemon
  cannot be reached (REQ-10), a "CLI availability" `Card` listing docker/compose/buildx presence
  and version (REQ-110), a "Daemon event stream" `Card` with the live `EventStream` (REQ-11,
  REQ-12), a "Local storage" `Card` with a `StorageUsageRow` for the analysis cache's size and a
  "Clear" action (REQ-113, REQ-115), then the active screen's real content: `DashboardScreen` for
  the `dashboard` screen (REQ-14–REQ-18) — fed the live container list from `useContainers()`, so
  its activity panel and the rail's own count come from one reading —, `ContainersScreen` for
  the `containers` screen (REQ-19–REQ-23, REQ-109) — which also receives the live image list from
  `useImages()`, since its create/run form suggests the local images (REQ-29) —, `ImagesScreen` for the `images-layers` screen
  (REQ-37–REQ-41), `ComposeScreen` for the `compose` screen (REQ-75–REQ-78) — fed the live project
  list from `useComposeProjects()` —, `VolumesNetworksScreen` for the `volumes-networks` screen
  (REQ-70, REQ-71) — fed the live volume list from `useVolumes()` —, `RegistriesScreen` for the
  `registries` screen (REQ-85, REQ-86, REQ-87) — self-sufficient, reading its own registry inventory
  and repository browsing —, `BuildersScreen` for the
  `builders-cache` screen (REQ-88, REQ-89, REQ-91) — self-sufficient, reading its own builder and
  build-cache inventories —, `SwarmScreen` for the `swarm` screen (REQ-79–REQ-84) —
  self-sufficient, reading its own swarm state, nodes, services, stacks, secrets and configs —,
  `ContextsScreen` for the `contexts` screen (REQ-92, REQ-93, REQ-94) —
  self-sufficient, reading its own context inventory and daemon information —, `PluginsScreen` for
  the `plugins` screen (REQ-98, REQ-99, REQ-111) — self-sufficient, reading its own CLI and daemon
  plugin inventories —, `SystemScreen` for
  the `system-prune` screen (REQ-95, REQ-96, REQ-97) — self-sufficient, reading its own disk-usage
  breakdown and daemon information —, a `PlaceholderScreen` for every screen not yet built by its
  own feature batch.
- The Containers `NavItem`'s count badge is the live container count from `useContainers()`, the
  Images & layers `NavItem`'s count badge is the live image count from `useImages()`, the
  Compose `NavItem`'s count badge is the live compose project count from `useComposeProjects()`, and
  the Contexts `NavItem`'s count badge is the live context count from `useContexts()`, all
  regardless of which screen is active.
- The rail's footer names the context every screen currently follows, as `name (kind)` — an em dash
  until the inventory has been read, or when no context is active. It follows a switch made on the
  Contexts screen without the shell being remounted (REQ-93).
Actions:
- Selecting a `NavItem` sets it active, persists it as `lastScreenId` via `usePreferences()`, and
  replaces the content area with its screen, without remounting the rail, header or footer.
- A pending cross-navigation request (`useCrossNavigation()`) makes the screen it names active, by
  the same path as an operator's own selection — so it is persisted as `lastScreenId` too. The
  Shell does not clear the request: the destination screen reveals the object and acknowledges it
  (REQ-68, REQ-69).
- The status pill's inline "Retry" action and the unreachable-daemon banner's retry both call
  `useConnectionStatus().retry()` to re-probe the daemon immediately (REQ-10).
- The "Local storage" card's "Clear" action calls `clearAnalysisCache()` then refreshes the shown
  size; it is disabled while the cache is empty or its size has not loaded yet.
Navigation:
- No URL routing in this batch: the active screen is local component state, defaulting to
  `defaultScreenId` until preferences restore it (see below).

## Rules and invariants

- Exactly one `NavItem` is active at a time, matching the displayed screen (REQ-2).
- The header's status pill reflects `useProgress()`'s pending-operation count first; otherwise it
  reflects daemon reachability (danger when unreachable, warning when reachable but a CLI
  capability is unavailable, success otherwise) so connectivity is visible without blocking
  navigation to another screen (REQ-8, REQ-9).
- The unreachable-daemon banner never replaces or hides the rest of the screen: the CLI
  availability card, the event stream, the local-storage card and the placeholder content remain
  visible (REQ-10).
- `errors` (REQ-7), `pending` (REQ-8), `connection` (REQ-9/REQ-10/REQ-13/REQ-110) and `events`
  (REQ-11/REQ-12) come from providers supplied by the caller (`App`), so they can be
  observed/driven independently of the shell chrome; `ToastProvider` and `ConfirmationProvider`
  (REQ-6/REQ-8) are supplied by the Shell itself.
- The header's action group is a wrapping `Row` (`wrap`): PageHeader only wraps at its own top
  level, so a non-wrapping action row would overflow the header card once the viewport is narrow
  enough that the pill, version badge, search and console no longer fit on one line.
- Once `usePreferences()` reports `loaded`, the active screen is set to `preferences.lastScreenId`
  if it names a known screen; this restore runs at most once per mount and only while the operator
  has not yet selected a screen themselves. A preferences read that settles after the operator has
  already picked a `NavItem` leaves them where they are, and a later external change to
  `preferences.lastScreenId` (e.g. from another tab) never yanks the operator to a different screen
  while they are using this one (REQ-2, REQ-115). With no persisted `lastScreenId`, `defaultScreenId`
  stays active — that is the Dashboard, so a first run lands on the overview (REQ-14).
- The active context is read from the Docker installation itself (`useContexts()`), never from
  `OperatorPreferences.selectedContext`: the daemon in use is the one the local Docker configuration
  names, so the shell and a `docker context use` typed in a terminal can never disagree.
  `listFilters` is still carried by `OperatorPreferences` and read by nobody.

## Dependencies

- ui-library: Frame, NavRail, NavBrand, NavGroup, NavItem, FooterStatus, PageHeader, StatusPill,
  Badge, Button, KeyHint, Row, Stack, Card, SectionHeader, ErrorBanner, EventStream,
  StorageUsageRow, ToastProvider
- Navigation data, PlaceholderScreen, ConfirmationService, ErrorReportingService, ProgressService,
  ConnectionStatusService, EventStreamService
- local-persistence: usePreferences, fetchAnalysisCacheUsage, clearAnalysisCache
- dashboard: DashboardScreen
- containers: useContainers, ContainersScreen
- images: useImages, ImagesScreen
- compose: useComposeProjects, ComposeScreen
- volumes: useVolumes
- volumes-networks: VolumesNetworksScreen
- builders: BuildersScreen
- contexts: useContexts, ContextsScreen
- system: SystemScreen

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-2
- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-10
- plan-docker_management_app/REQ-11
- plan-docker_management_app/REQ-12
- plan-docker_management_app/REQ-13
- plan-docker_management_app/REQ-14
- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-75
- plan-docker_management_app/REQ-76
- plan-docker_management_app/REQ-77
- plan-docker_management_app/REQ-78
- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-71
- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-89
- plan-docker_management_app/REQ-91
- plan-docker_management_app/REQ-92
- plan-docker_management_app/REQ-93
- plan-docker_management_app/REQ-94
- plan-docker_management_app/REQ-95
- plan-docker_management_app/REQ-68
- plan-docker_management_app/REQ-69
- plan-docker_management_app/REQ-110
- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-115
