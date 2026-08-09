---
module: server-app
component: Server bootstrap
type: configuration
---

# Server bootstrap

**Purpose** → the Express entrypoint: composes every server module into one running app.

## Contract

- `GET /health` → `{ status: "ok" }` (unchanged from the scaffold).
- Parses JSON request bodies (`express.json()`) for every route.
- Mounts `connectivityRouter` at `/api/connectivity`, `contextsRouter` at `/api/contexts`,
  `eventsRouter` at `/api/events`,
  `persistenceRouter` at `/api/persistence`, `hostPathsRouter` at `/api/host-paths`,
  `volumesRouter` at `/api/volumes`, `networksRouter` at `/api/networks`, `composeRouter` at
  `/api/compose`, and `imageAnalysisRouter` alongside `imagesRouter` at `/api/images`.
- Calls `publishActiveEndpoint()` once at startup, before anything dials the daemon, so every area
  talks to the daemon of the active Docker context rather than to the platform-default socket; its
  failure (no `docker` CLI, unreadable configuration) is not fatal and leaves the default in place
  (REQ-93).
- Starts `eventStreamService` so the daemon event subscription is live as soon as the server boots,
  independent of whether any client has connected yet.
- Calls `reclaimOrphans()` once at startup, before listening, so analysis-cache files left behind by
  a previously interrupted run are cleaned up before any client can observe cache usage.
- Calls `sweepAbandonedExtractionContainers()` once at startup (its failure, e.g. an unreachable
  daemon, is not fatal to boot) so any intermediate filesystem-extraction container left behind by
  an interrupted run is removed before any client can observe the container list (REQ-54, REQ-57).
- Listens on `process.env.PORT`, defaulting to `3000`.

## Dependencies

- connectivity: connectivityRouter
- contexts: contextsRouter, publishActiveEndpoint
- events: eventsRouter, eventStreamService
- local-persistence: persistenceRouter, hostPathsRouter, reclaimOrphans
- images: imagesRouter
- image-analysis: imageAnalysisRouter, sweepAbandonedExtractionContainers
- volumes: volumesRouter
- networks: networksRouter
- compose: composeRouter

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-12
- plan-docker_management_app/REQ-54
- plan-docker_management_app/REQ-57
- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-93
- plan-docker_management_app/REQ-71
- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-115
- plan-docker_management_app/REQ-116
