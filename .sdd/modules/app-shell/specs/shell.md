---
module: app-shell
component: Shell
type: UI component
---

# Shell

**Purpose** → the "Vessel — Docker Control" application shell: the persistent rail/header/footer
around the active screen.

## Contract

Description:
- Owns a `ToastProvider` and a `ConfirmationProvider` around its own tree (screen-local services:
  any screen it renders can call `useToast()`/`useConfirmation()` without the caller wiring them).
  Inside, renders a `Frame` whose rail is a `NavRail` built from the navigation data (one
  `NavGroup` per group, one `NavItem` per screen), whose header is a `PageHeader` for the active
  screen (with a live-events `StatusPill`, a search `Button` with a `KeyHint`, and a console
  `Button`), and whose footer status (active Docker context) is shown inside the rail.
Shows:
- The active screen's title and description in the header; a `PlaceholderScreen` (later batches
  substitute the real screen) plus any active `ErrorBanner`s in the content area.
Actions:
- Selecting a `NavItem` sets it active and replaces the content area with its screen, without
  remounting the rail, header or footer.
Navigation:
- No URL routing in this batch: the active screen is local component state, defaulting to
  `defaultScreenId`.

## Rules and invariants

- Exactly one `NavItem` is active at a time, matching the displayed screen (REQ-2).
- The header's status pill reflects `useProgress()`'s pending-operation count so an in-flight
  operation is visible without blocking navigation to another screen (REQ-8).
- `errors` (REQ-7) and `pending` (REQ-8) come from providers supplied by the caller (`App`), so
  they can be observed/driven independently of the shell chrome; `ToastProvider` and
  `ConfirmationProvider` (REQ-6/REQ-8) are supplied by the Shell itself.

## Dependencies

- ui-library: Frame, NavRail, NavBrand, NavGroup, NavItem, FooterStatus, PageHeader, StatusPill,
  Button, KeyHint, Row, Stack, ErrorBanner, ToastProvider
- Navigation data, PlaceholderScreen, ConfirmationService, ErrorReportingService, ProgressService

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-2
