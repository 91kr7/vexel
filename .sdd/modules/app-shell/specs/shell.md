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
  "Clear" action (REQ-113, REQ-115), then the active screen's real content: `ContainersScreen` for
  the `containers` screen (REQ-19–REQ-23, REQ-109), `ImagesScreen` for the `images-layers` screen
  (REQ-37–REQ-41), a `PlaceholderScreen` for every screen not yet built by its own feature batch.
- The Containers `NavItem`'s count badge is the live container count from `useContainers()`, and
  the Images & layers `NavItem`'s count badge is the live image count from `useImages()`, both
  regardless of which screen is active.
Actions:
- Selecting a `NavItem` sets it active, persists it as `lastScreenId` via `usePreferences()`, and
  replaces the content area with its screen, without remounting the rail, header or footer.
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
  if it names a known screen; this restore runs exactly once per mount, so a later external change
  to `preferences.lastScreenId` (e.g. from another tab) does not yank the operator to a different
  screen while they are using this one (REQ-115).
- `selectedContext` and `listFilters` are carried by `OperatorPreferences` and persisted through
  `usePreferences()`, but nothing in this batch's shell reads or writes them: no context switcher
  or per-screen filter control exists yet (they land with the screens that own them in later
  batches).

## Dependencies

- ui-library: Frame, NavRail, NavBrand, NavGroup, NavItem, FooterStatus, PageHeader, StatusPill,
  Badge, Button, KeyHint, Row, Stack, Card, SectionHeader, ErrorBanner, EventStream,
  StorageUsageRow, ToastProvider
- Navigation data, PlaceholderScreen, ConfirmationService, ErrorReportingService, ProgressService,
  ConnectionStatusService, EventStreamService
- local-persistence: usePreferences, fetchAnalysisCacheUsage, clearAnalysisCache
- containers: useContainers, ContainersScreen
- images: useImages, ImagesScreen

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-2
- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-10
- plan-docker_management_app/REQ-11
- plan-docker_management_app/REQ-12
- plan-docker_management_app/REQ-13
- plan-docker_management_app/REQ-19
- plan-docker_management_app/REQ-37
- plan-docker_management_app/REQ-110
- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-115
