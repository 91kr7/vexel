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
- Owns a `ConfirmationProvider` around its own tree (any screen it renders can call
  `useConfirmation()` without the caller wiring it); the toast service is mounted by `App`, above
  the Shell, and every screen still reaches it through `useToast()`.
  Inside, renders a `Frame` whose rail is a `NavRail` built from the navigation data (one
  `NavGroup` per group, one `NavItem` per screen), whose header is a `PageHeader` for the active
  screen (the `RefreshControl` first, then a connection `StatusPill` and an "Engine API v…" `Badge`
  when the daemon is reachable — and nothing else), and whose footer status (active Docker context)
  is shown inside the rail.
Shows:
- The active screen's title and description in the header; in the content area — which opens on the
  active screen's own content, the Shell drawing no failure of its own — the `AboutNotice` as the
  **first** card of the About screen
  (`coverage-matrix`), above everything else that screen carries
  (plan-docker_management_app-about_license_notice/REQ-6,
  plan-docker_management_app-about_license_notice/REQ-7), a "CLI availability" `Card` listing docker/compose/buildx presence
  and version (REQ-110), a "Local storage" `Card` with a `StorageUsageRow` for the analysis cache's
  size and a "Clear" action (REQ-113, REQ-115) — and **no event stream**, the shell having stopped
  subscribing to one (see the invariants below) —, then the active screen's real content: `DashboardScreen` for
  the `dashboard` screen (REQ-14–REQ-18) — fed the live container list from `useContainers()`, so
  its activity panel and the rail's own count come from one reading, and no retry of that list: the
  panel that carried one is gone (plan-docker_management_app-inline_error_panels/REQ-1) —, `ContainersScreen` for
  the `containers` screen (REQ-19–REQ-23, REQ-109) — which also receives the live image list from
  `useImages()`, since its create/run form suggests the local images (REQ-29) —, `ImagesScreen` for the `images-layers` screen
  (REQ-37–REQ-41), `ComposeScreen` for the `compose` screen (REQ-75–REQ-78) — fed the live project
  list from `useComposeProjects()` —, `VolumesNetworksScreen` for the `volumes-networks` screen
  (REQ-70, REQ-71) — self-sufficient, the screen reading the volume listing and the `NetworksPanel`
  it is composed with reading the network listing, neither of them mounted here
  (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40, REQ-44) —,
  `RegistriesScreen` for the
  `registries` screen (REQ-85, REQ-86, REQ-87) — self-sufficient, reading its own registry inventory
  and repository browsing —, `BuildersScreen` for the
  `builders-cache` screen (REQ-88, REQ-89, REQ-91) — self-sufficient, reading its own builder and
  build-cache inventories —, `ContextsScreen` for the `contexts` screen (REQ-92, REQ-93, REQ-94) —
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
- The header's `RefreshControl` reloads what the server holds and then every mounted view; the Shell
  passes it nothing and reads nothing back (plan-docker_management_app-refresh_cache-manual_refresh/REQ-1).
- The status pill's inline "Retry" action calls `useConnectionStatus().retry()` to re-probe the
  daemon immediately (REQ-10), and it is offered exactly while something is unreachable
  (plan-docker_management_app-inline_error_panels/REQ-11).
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
- **The pill names which side is unreachable**, reading the connection service's `unreachable`:
  `Server unreachable` while the live channel is not delivering, `Docker daemon unreachable` while
  it delivers a status saying the daemon cannot be reached, `Live · daemon events` otherwise. It
  used to say `Daemon unreachable` for both, which named the daemon for a daemon that was running
  behind a server that had stopped answering (plan-docker_management_app-inline_error_panels/REQ-9).
  Tone, position and the inline `Retry` are unchanged, and this pill remains the **only** report of
  the connection anywhere in the application (…/REQ-2, …/REQ-13).
- **The Shell draws no failure in the content area, and that absence is the decision.** It used to
  draw two panels there: the list the error reporting service held, and an unreachable-daemon panel
  with its cause and retry. A failure is now a toast, raised by the reporting service itself
  (plan-docker_management_app-inline_error_panels/REQ-5), and the lost connection is told by the
  header's status pill and its `Retry` alone — nowhere in the page body, in any form
  (…/REQ-1, …/REQ-2, …/REQ-13). The pill keeps its tone, its position and its retry; the only thing
  this plan changed about it is its wording, above.
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
- The `DaemonEventStreamProvider` stays mounted in `App`, above the Shell: the Dashboard reads it,
  so one consumer stopping is the whole of the change — the service itself, its connection handling
  and its content are untouched.
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
- **The Shell is where the reload signal watches the live channel**: it calls
  `reloadWhenChannelReturns()` once, for the life of the application, so a connection that comes
  back reads every mounted view again and the screen the operator is on fills with them navigating
  nowhere (plan-docker_management_app-inline_error_panels/REQ-12). It is mounted here because it is
  the one component that is mounted exactly once and never unmounted. Measured on the delivered
  build (2026-09-03): with the server killed and started again, the pill goes `Live · daemon
  events` → `Server unreachable` → `Live · daemon events`, and the System & prune screen's two
  readings taken by request — the disk usage and the daemon information — are read once more, with
  nothing pressed and no navigation. The screens the channel feeds need no signal: the server reads
  again on its own period and pushes, which for the volume and network listings was 26s after the
  daemon came back.
- `pending` (REQ-8) and `connection` (REQ-9/REQ-10/REQ-13/REQ-110) come from providers supplied by
  the caller (`App`), together with the toast and error-reporting services, so they can be
  observed/driven independently of the shell chrome; `ConfirmationProvider` (REQ-6) is supplied by
  the Shell itself. The Shell no longer calls `useErrorReporter()` at all.
- The header's action group is a wrapping `Row` (`wrap`): PageHeader only wraps at its own top
  level, so a non-wrapping action row would overflow the header card once the viewport is narrow
  enough that the pill and the version badge no longer fit on one line.
- Every control the header renders answers a real click, and the header advertises no keyboard
  shortcut: it carries no control without a handler, no keyboard hint for a keystroke nothing
  answers, and no second route to a destination the rail already offers. Those clauses stand.
- **The header carries exactly one interactive control: the refresh control**, and that
  **reverses** plan-ui-coherence-optimisation/REQ-12–REQ-16, which left the header with no
  interactive control at all on a reachable daemon. The reversal is deliberate and was confirmed by
  the human on 2026-08-28: the operator needs one place, present on every screen, to say "read it
  all again now", and the top bar is the only surface every screen shares
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-1). What that earlier decision
  removed is **not** restored by it: no search control, no second route to the console, no keyboard
  hint, no disabled control and no placeholder field.
- The refresh control is the **first** item of the action row, so the status pill and the version
  badge keep the coordinates they had: the row is right-aligned, and an item added at its head
  extends the group leftwards instead of pushing the other two along
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-15). Nothing else in the header
  moved, and the pill still grows its inline "Retry" only while the daemon is unreachable.
- **The longer wording stays inside the header at every width, measured on the delivered build**
  (plan-docker_management_app-inline_error_panels/REQ-10, 2026-09-03). An unreachable state carries
  no version badge, so the action row holds two items: the 32px refresh control, 8px, and the pill —
  **254.2px** for `Docker daemon unreachable`, against 211.6px for the `Daemon unreachable` it
  replaces and 200.7px for `Server unreachable`, the narrowest of the three. The row therefore needs
  294.2px, and up to 600px the header's action area is the viewport less 82px. Measured, in the
  daemon-unreachable state:
  - 320px → the pill is squeezed to 238px and its label takes two lines inside it; header card
    174.4px
  - 360px and 375px → the refresh control takes the first line, the pill the second; header card
    136.7px instead of 99.8px
  - 390px → back to one line, 294.2px against the 308px available, 13.8px spare — the tightest fit
    of the one-line arrangement
  - 460, 600, 719, 768, 1024, 1280, 1440, 1920px → one line, the row unchanged at 294.2px
  **Nothing is ever clipped and nothing overflows**: at every width from 320px to 1920px the pill's
  `scrollWidth` equals its `clientWidth` and the document's `scrollWidth` equals the viewport's, so
  the report is visible in full on every screen and at every supported width. The wrap threshold
  moves with the wording — the old one wrapped the row below 334px, this one below 376px — and the
  wrapped arrangement is the same one already accepted for the version badge, one step narrower.
- **At the phone breakpoint the action row wraps, and that is accepted, not a regression.** At 390px
  the row is 308px wide and its three items need 321.7px (32 + 8 + 165.6 + 8 + 108.1), so the
  version badge takes a line of its own and the header region grows from **178.7px to 211.2px**.
  Measured on the delivered build and accepted by the human on 2026-08-28: the `Row` already carried
  `wrap` for exactly this case, and the result reads as a left-aligned stack rather than as an
  overflow. No breakpoint rule hides the badge and no label is shortened at that width. Anyone
  measuring the header at the phone breakpoint is measuring this, not a defect
  (plan-docker_management_app-refresh_cache-manual_refresh/REQ-15).
- Once `usePreferences()` reports `loaded`, the active screen is set to `preferences.lastScreenId`
  if it names a known screen; this restore runs at most once per mount and only while the operator
  has not yet selected a screen themselves. A preferences read that settles after the operator has
  already picked a `NavItem` leaves them where they are, and a later external change to
  `preferences.lastScreenId` (e.g. from another tab) never yanks the operator to a different screen
  while they are using this one (REQ-2, REQ-115). With no persisted `lastScreenId`, `defaultScreenId`
  stays active — that is the Dashboard, so a first run lands on the overview (REQ-14).
- **A persisted id naming no screen leaves `defaultScreenId` active**, which is the guard, and it is
  the whole of the landing an operator gets when a screen is withdrawn: a saved `swarm` is not a
  known screen after 2026-08-27, so the Dashboard is shown, complete and working, with no error, no
  blank area and no notice about a screen that has gone
  (plan-docker_management_app-swarm_removal/REQ-9). The stored value is neither migrated nor
  cleared — an unknown id is already a normal thing for the store to hold — and `PlaceholderScreen`
  is **not** reached: it renders for an active id, and no unknown id ever becomes active.
- The active context is read from the Docker installation itself (`useContexts()`), never from
  `OperatorPreferences.selectedContext`: the daemon in use is the one the local Docker configuration
  names, so the shell and a `docker context use` typed in a terminal can never disagree.
  `listFilters` is still carried by `OperatorPreferences` and read by nobody.

## Dependencies

- ui-library: Frame, NavRail, NavBrand, NavGroup, NavItem, FooterStatus, PageHeader, StatusPill,
  Badge, Row, Stack, Card, SectionHeader, StorageUsageRow
- Navigation data, Reload signal, RefreshControl, AboutNotice, PlaceholderScreen, ConfirmationService, ProgressService,
  ConnectionStatusService
- local-persistence: usePreferences, fetchAnalysisCacheUsage, clearAnalysisCache
- dashboard: DashboardScreen
- containers: useContainers, ContainersScreen
- images: useImages, ImagesScreen
- compose: useComposeProjects, ComposeScreen
- volumes-networks: VolumesNetworksScreen, NetworksPanel
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
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-1
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-15
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-40
- plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-44
- plan-docker_management_app-inline_error_panels/REQ-1
- plan-docker_management_app-inline_error_panels/REQ-2
- plan-docker_management_app-inline_error_panels/REQ-9
- plan-docker_management_app-inline_error_panels/REQ-10
- plan-docker_management_app-inline_error_panels/REQ-11
- plan-docker_management_app-inline_error_panels/REQ-12
- plan-docker_management_app-inline_error_panels/REQ-13
