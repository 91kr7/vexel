---
module: app-shell
component: App
type: UI component
---

# App

**Purpose** → the application's root component: wires the toast, connection status, error-reporting,
progress, event stream and cross-navigation providers around the Shell (the Shell owns its own
confirmation provider, see `shell.md`).

## Contract

- No props (mounted once by `main.tsx`).
- Provider nesting order: `ToastProvider` > `ConnectionStatusProvider` > `ErrorReportingProvider` >
  `ProgressProvider` > `DaemonEventStreamProvider` > `CrossNavigationProvider` > `Shell`.
- `ToastProvider` and `ConnectionStatusProvider` sit **above** `ErrorReportingProvider`, because a
  reported failure is raised as a toast and is dropped while nothing is reachable
  (plan-docker_management_app-inline_error_panels/REQ-5, /REQ-13). The toast stack is therefore
  mounted for the whole application rather than for the Shell's subtree; every existing caller of
  `useToast()` is inside the Shell and reads the same service.
- `CrossNavigationProvider` sits above the Shell so the Shell itself can read the pending request
  and switch to the screen it names (REQ-68, REQ-69).

## Dependencies

- Shell, ToastProvider, ConnectionStatusProvider, ErrorReportingProvider, ProgressProvider,
  DaemonEventStreamProvider, CrossNavigationProvider

## Requirements served

- plan-docker_management_app/REQ-1
- plan-docker_management_app/REQ-68
- plan-docker_management_app/REQ-69
- plan-docker_management_app-inline_error_panels/REQ-5
- plan-docker_management_app-inline_error_panels/REQ-13
