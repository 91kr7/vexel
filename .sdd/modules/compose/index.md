# compose — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| ComposeDiscoveryService | backend service | `server/src/compose/compose-discovery-service.ts` | Discovers compose projects (name, discovered config file path(s), overall and per-service state) through `docker compose ls`/`ps` | `specs/compose-discovery-service.md` |
| ComposeLifecycleService | backend service | `server/src/compose/compose-lifecycle-service.ts` | Stack up/down/restart and per-service scaling through `docker compose`, streaming output and resolving with the resulting state | `specs/compose-lifecycle-service.md` |
| ComposeFileService | backend service | `server/src/compose/compose-file-service.ts` | Compose file read, validated write-back (host-path validation) and on-demand validation via `docker compose config` | `specs/compose-file-service.md` |
| ComposeLogsService | backend service | `server/src/compose/compose-logs-service.ts` | Aggregated log streaming for every service of a project through `docker compose logs --follow`, cancellable | `specs/compose-logs-service.md` |
| Compose endpoints | REST endpoint | `server/src/compose/compose-routes.ts` | Exposes compose discovery, lifecycle, scaling, file read/write/validate and aggregated log streaming to the client | `specs/compose-endpoints.md` |
| Compose client | frontend data client | `client/src/data/compose-client.ts` | Typed `fetch` wrapper for the compose endpoints, including NDJSON reading of lifecycle/scale commands | `specs/compose-client.md` |
| useComposeProjects | frontend hook | `client/src/data/use-compose-projects.ts` | Reads the compose project list, re-reading on a bounded poll and on `container` daemon events | `specs/use-compose-projects.md` |
| useComposeLifecycle | frontend hook | `client/src/data/use-compose-lifecycle.ts` | Drives stack lifecycle and per-service scaling | `specs/use-compose-lifecycle.md` |
| useComposeFile | frontend hook | `client/src/data/use-compose-file.ts` | Reads a project's compose file(s), tracks unsaved edits, saves and validates on demand | `specs/use-compose-file.md` |
| useComposeLogs | frontend hook | `client/src/data/use-compose-logs.ts` | Subscribes to a project's aggregated log stream, each line carrying its own service | `specs/use-compose-logs.md` |
| ComposeScreen | UI component | `client/src/compose/ComposeScreen.tsx` | The Compose screen: projects with per-service state, lifecycle/scaling actions, compose file editor with validation and confirmed save, and aggregated per-service logs | `specs/compose-screen.md` |
