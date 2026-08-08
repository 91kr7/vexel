---
module: compose
component: Compose client
type: frontend data client
---

# Compose client

**Purpose** → typed `fetch` wrapper for the compose endpoints; lifecycle and scaling calls read
their NDJSON response body directly (mirrors the container-create client), since `EventSource`
cannot issue a POST.

## Contract

- `fetchComposeProjects(): Promise<ComposeProjectSummary[]>`
- `fetchComposeFiles(projectName): Promise<ComposeFileReadResult>`
- `writeComposeFile(projectName, path, content): Promise<ComposeFileWriteResult>`
- `validateComposeFile(projectName): Promise<ComposeValidationResult>`
- `bringComposeProjectUp(projectName, handlers?): Promise<ComposeProjectSummary>`
- `bringComposeProjectDown(projectName, handlers?): Promise<ComposeProjectSummary>`
- `restartComposeProject(projectName, handlers?): Promise<ComposeProjectSummary>`
- `scaleComposeService(projectName, service, replicas, handlers?): Promise<ComposeProjectSummary>`
  - `ComposeCommandHandlers`: `{ onOutput?(line) }` — called for every output line as the command
    runs; the returned promise resolves with the resulting project or rejects with the daemon's own
    message.
- `composeLogsStreamUrl(projectName): string` — the aggregated-log stream URL for a project.

## Requirements served

- plan-docker_management_app/REQ-75
- plan-docker_management_app/REQ-76
- plan-docker_management_app/REQ-77
- plan-docker_management_app/REQ-78
