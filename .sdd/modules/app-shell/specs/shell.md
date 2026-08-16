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
  screen (with a live-events `StatusPill` and an "Engine API v…" `Badge` when the daemon is
  reachable — and nothing else: the header states what is true of the connection and offers no
  control of its own), and whose footer status (active Docker context) is shown inside the rail.
Shows:
- The active screen's title and description in the header; in the content area: any active
  `ErrorBanner`s (REQ-7), an unreachable-daemon `ErrorBanner` with cause and retry when the daemon
  cannot be reached (REQ-10), the `AboutNotice` as the **first** card of the About screen
  (`coverage-matrix`), above everything else that screen carries
  (plan-docker_management_app-about_license_notice/REQ-6,
  plan-docker_management_app-about_license_notice/REQ-7), a "CLI availability" `Card` listing docker/compose/buildx presence
  and version (REQ-110), a "Local storage" `Card` with a `StorageUsageRow` for the analysis cache's
  size and a "Clear" action (REQ-113, REQ-115) — and **no event stream**, the shell having stopped
  subscribing to one (see the invariants below) —, then the active screen's real content: `DashboardScreen` for
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
  breakdown and daemon information —, `RawConsoleScreen` for the `raw-console` screen (REQ-100,
  REQ-101, REQ-102, REQ-103, REQ-104, REQ-112, REQ-114) — self-sufficient, reading its own console
  history —, and `CoverageMatrixScreen` for the `coverage-matrix` screen (REQ-105, REQ-106) —
  self-sufficient, reading its own baseline. A `PlaceholderScreen` remains the content of an
  active id naming no screen at all; every screen of the navigation data now has its own.
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
- The `raw-console` screen is reached by its own `NavItem`, in the rail and in the phone drawer, and
  by nothing else: the header carries no second route to it
  (plan-ui-coherence-optimisation/REQ-15, REQ-100).
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
  availability card, the local-storage card and the active screen's content remain visible (REQ-10).
- The "CLI availability" and "Local storage" cards are the shell's own surfaces of REQ-110 and
  REQ-113, and they keep the place they have always had — the last entry of the navigation, the
  screen now labelled "About". Batch 30 replaced the placeholder that used to sit under them, not
  them: they have no other home in the application, and the analysis cache's size and clear action
  exist nowhere else.
- **The shell renders no daemon event stream, and that absence is a decision, not a gap.** The
  "Daemon event stream" card it drew on the About screen repeated the Dashboard's own stream
  verbatim — the same provider, the same events, the same empty label — and one fact stated in two
  places is the duplication this plan exists to remove. The gate decided which of the two keeps it:
  **the Dashboard**, About being an identity and licence screen. So the Shell no longer subscribes
  (`useDaemonEventStream` is not called here) and REQ-11/REQ-12 are served on the Dashboard alone
  (`dashboard/specs/dashboard-screen.md`). This **supersedes**
  `plan-docker_management_app-about_license_notice/REQ-3`'s clause that the About screen keeps the
  daemon event stream: it is not to be restored here as a missing feature
  (plan-ui-coherence-optimisation/REQ-71).
- The `DaemonEventStreamProvider` stays mounted in `App`, above the Shell: the Dashboard and the
  invalidation registry read it, so one consumer stopping is the whole of the change — the service
  itself, its connection handling and its content are untouched.
- The About screen's content is `AboutNotice` first, then those two cards, then the coverage matrix.
  The notice going on top adds a card and reorders nothing: reaching the About entry of the
  permanent navigation is the single step that shows it, and no dialog, acknowledgement or first-run
  gate stands between the operator and their work
  (plan-docker_management_app-about_license_notice/REQ-6,
  plan-docker_management_app-about_license_notice/REQ-7).
- **Every section of the About screen is titled the same way**: a `SectionHeader` in its default
  treatment inside the card it titles — the notice's `Identity and license`, `CLI availability`,
  `Local storage` and the coverage half's two. The uppercase micro-caps `Card title` treatment is
  gone from this screen, and no section title on it is styled locally
  (plan-ui-coherence-optimisation/REQ-70, plan-ui-coherence-optimisation/REQ-26). This screen having
  held its last three call sites, that treatment is now gone from the library too: `Card` has no
  title prop at all (plan-ui-coherence-optimisation/REQ-81, `ui-library/specs/card.md`).
- `errors` (REQ-7), `pending` (REQ-8) and `connection` (REQ-9/REQ-10/REQ-13/REQ-110) come from
  providers supplied by the caller (`App`), so they can be observed/driven independently of the
  shell chrome; `ToastProvider` and `ConfirmationProvider` (REQ-6/REQ-8) are supplied by the Shell
  itself.
- The header's action group is a wrapping `Row` (`wrap`): PageHeader only wraps at its own top
  level, so a non-wrapping action row would overflow the header card once the viewport is narrow
  enough that the pill and the version badge no longer fit on one line.
- Every control the header renders answers a real click, and the header advertises no keyboard
  shortcut: it carries no control without a handler, no keyboard hint for a keystroke nothing
  answers, and no second route to a destination the rail already offers. On a reachable daemon that
  leaves the header with **no interactive control at all** — the status pill grows its inline
  "Retry" only while the daemon is unreachable, and the version badge is a label. Removing the
  search control and the console action closed the space they occupied; the remaining two keep the
  order, spacing and height they were delivered with, and nothing replaced either — no disabled
  control, no tooltip, no placeholder field (plan-ui-coherence-optimisation/REQ-12,
  plan-ui-coherence-optimisation/REQ-13, plan-ui-coherence-optimisation/REQ-14,
  plan-ui-coherence-optimisation/REQ-15, plan-ui-coherence-optimisation/REQ-16).
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
  Badge, Row, Stack, Card, SectionHeader, ErrorBanner, StorageUsageRow, ToastProvider
- Navigation data, AboutNotice, PlaceholderScreen, ConfirmationService, ErrorReportingService, ProgressService,
  ConnectionStatusService
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
- raw-console: RawConsoleScreen
- coverage: CoverageMatrixScreen

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-2
- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-10
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
- plan-docker_management_app/REQ-100
- plan-docker_management_app/REQ-68
- plan-docker_management_app/REQ-69
- plan-docker_management_app/REQ-110
- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-115
- plan-docker_management_app/REQ-105
- plan-docker_management_app-about_license_notice/REQ-6
- plan-docker_management_app-about_license_notice/REQ-7
- plan-ui-coherence-optimisation/REQ-12
- plan-ui-coherence-optimisation/REQ-13
- plan-ui-coherence-optimisation/REQ-14
- plan-ui-coherence-optimisation/REQ-15
- plan-ui-coherence-optimisation/REQ-16
- plan-ui-coherence-optimisation/REQ-70
- plan-ui-coherence-optimisation/REQ-71
- plan-ui-coherence-optimisation/REQ-72
