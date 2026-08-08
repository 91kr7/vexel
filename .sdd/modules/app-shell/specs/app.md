---
module: app-shell
component: App
type: UI component
---

# App

**Purpose** → the application's root component: wires the error-reporting, progress, connection
status, event stream and cross-navigation providers around the Shell (the Shell owns its own toast
and confirmation providers, see `shell.md`).

## Contract

- No props (mounted once by `main.tsx`).
- Provider nesting order: `ErrorReportingProvider` > `ProgressProvider` > `ConnectionStatusProvider`
  > `DaemonEventStreamProvider` > `CrossNavigationProvider` > `Shell`.
- `CrossNavigationProvider` sits above the Shell so the Shell itself can read the pending request
  and switch to the screen it names (REQ-68, REQ-69).

## Dependencies

- Shell, ErrorReportingProvider, ProgressProvider, ConnectionStatusProvider,
  DaemonEventStreamProvider, CrossNavigationProvider

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-68
- plan-docker_management_app/REQ-69
