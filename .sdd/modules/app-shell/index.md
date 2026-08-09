# app-shell — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| Navigation data | configuration | `client/src/shell/navigation.ts` | Defines the thirteen screens, their grouping, glyphs and page-header copy | `specs/navigation-data.md` |
| Shell | UI component | `client/src/shell/Shell.tsx` | Composes the frame, grouped navigation, page header and content area; owns the toast/confirmation services; binds connection status and the daemon event stream; tracks the active screen, restoring/persisting it via preferences (landing on the Dashboard when none is persisted) and exposing the analysis-cache size with its clear action; switches to the screen a pending cross-navigation request names, and to the Raw console from the header's console action | `specs/shell.md` |
| PlaceholderScreen | UI component | `client/src/shell/screens/PlaceholderScreen.tsx` | Stand-in content for a screen not yet implemented by a later batch; hosts the REQ-6 destructive-confirmation demo | `specs/placeholder-screen.md` |
| ConfirmationProvider, useConfirmation | frontend service | `client/src/shell/services/ConfirmationService.tsx` | Destructive-confirmation service, owned by the Shell; also carries back the scope the human chose for an action that has one | `specs/confirmation-service.md` |
| ErrorReportingProvider, useErrorReporter | frontend service | `client/src/shell/services/ErrorReportingService.tsx` | Application-wide failure reporting service | `specs/error-reporting-service.md` |
| ProgressProvider, useProgress | frontend service | `client/src/shell/services/ProgressService.tsx` | Application-wide pending/progress tracking service | `specs/progress-service.md` |
| ConnectionStatusProvider, useConnectionStatus | frontend service | `client/src/shell/services/ConnectionStatusService.tsx` | Polls daemon reachability, negotiated API version and CLI availability app-wide | `specs/connection-status-service.md` |
| DaemonEventStreamProvider, useDaemonEventStream | frontend service | `client/src/shell/services/EventStreamService.tsx` | Keeps the most recent live daemon events app-wide | `specs/event-stream-service.md` |
| CrossNavigationProvider, useCrossNavigation | frontend service | `client/src/shell/services/CrossNavigationService.tsx` | Cross-screen navigation to a named object: a screen posts the request, the Shell switches screen, the destination reveals the object and acknowledges | `specs/cross-navigation-service.md` |
| App | UI component | `client/src/App.tsx` | Application root: wires the error-reporting, progress, connection-status, event-stream and cross-navigation services around the Shell | `specs/app.md` |
