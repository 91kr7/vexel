---
module: app-shell
component: App
type: UI component
---

# App

**Purpose** → the application's root component: wires the error-reporting, progress, connection
status and event stream providers around the Shell (the Shell owns its own toast and confirmation
providers, see `shell.md`).

## Contract

- No props (mounted once by `main.tsx`).
- Provider nesting order: `ErrorReportingProvider` > `ProgressProvider` > `ConnectionStatusProvider`
  > `DaemonEventStreamProvider` > `Shell`.

## Dependencies

- Shell, ErrorReportingProvider, ProgressProvider, ConnectionStatusProvider,
  DaemonEventStreamProvider

## Requirements served

- plan-docker_management_app/REQ-1
