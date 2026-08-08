---
module: compose
component: ComposeScreen
type: UI component
---

# ComposeScreen

**Purpose** → the Compose screen: every discovered project with its per-service state, up/down/
restart and per-service replica scaling, the selected project's compose file(s) — editable,
validated on demand, saved back to disk after confirmation — and its aggregated live logs labelled
per service.

## Contract

- `<ComposeScreen projects loaded error? onRefresh />`

Description:

- two columns: the left one lists every project and its services (`GroupedRowsPanel`); the right one
  stacks the selected project's compose file editor over its aggregated logs.

Shows:

- one group per project: status pill (Up/Partial/Down/Unknown), its discovered compose file path(s)
  as the subtitle (or the daemon's own message when the project could not be read), and its services
  indented below, each with a status dot, name, image and a replicas `Stepper`.
- the selected project's compose file in a `CodeEditor`, tabbed by file name when the project has
  several; a validation summary line below it once validated (valid: file name, service/volume/
  network counts; invalid: the daemon's own error).
- the selected project's aggregated logs in a `LogStream`, each line labelled with its service.

Actions:

- "Restart" → restarts the project's stack.
- "Up" (stopped/unknown project) → brings the stack up; "Down" (running/partial project) → asks for
  confirmation, then brings it down.
- "Validate" (project header) → selects that project and validates its compose file(s).
- a service's replicas `Stepper` → scales that service to the chosen count.
- "Validate" (editor footer) → validates the selected project's file(s) on demand.
- "Save" (editor footer, enabled only while the active file is dirty) → asks for confirmation, then
  writes the active file back to disk.
- selecting a project's header (outside its actions) → shows that project's file(s) and logs.

## Rules and invariants

- No path is ever entered by the operator anywhere on this screen: every path shown is discovered
  from the daemon's own compose labels.
- Switching the selected project discards any unsaved edit of the previously selected one's file.

## Dependencies

- ui-library: GroupedRowsPanel, CodeEditor, Stepper, LogStream, Tabs, StatusPill, Badge, Button,
  ErrorBanner, EmptyState, Card, SectionHeader, Grid, Stack, Row
- compose: useComposeFile, useComposeLifecycle, useComposeLogs
- app-shell: ConfirmationService, ErrorReportingService, Toast

## Requirements served

- plan-docker_management_app/REQ-75
- plan-docker_management_app/REQ-76
- plan-docker_management_app/REQ-77
- plan-docker_management_app/REQ-78
