---
module: compose
component: ComposeLogsService
type: backend service
---

# ComposeLogsService

**Purpose** → aggregated live logs of every service of a project, through `docker compose logs
--follow`, each line carrying the service it came from.

## Contract

- `streamComposeLogs(projectName, configFiles, handlers): () => void`
  - Runs `docker compose -f <file> ... -p <projectName> logs --follow --no-color --timestamps`
    against the project's own discovered `configFiles`.
  - `ComposeLogHandlers`: `{ onLine(line), onError(message), onEnd() }`.
    - `onLine`: `{ seq, service, timestamp?, text }` — `seq` is a strictly increasing counter across
      the whole stream; `service` is extracted from the CLI's own line prefix.
    - `onError` fires with the daemon's own message on a non-zero exit or a spawn failure; `onEnd`
      fires when the process ends cleanly (e.g. the stream is cancelled from the other side).
  - Returns a cancel function; calling it kills the underlying process and no further handler fires.

## Dependencies

- docker-access: CLI runner (`runCliCommand`)

## Requirements served

- plan-docker_management_app/REQ-78
