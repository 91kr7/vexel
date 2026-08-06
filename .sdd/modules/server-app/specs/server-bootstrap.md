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
- Mounts `connectivityRouter` at `/api/connectivity`, `eventsRouter` at `/api/events`,
  `persistenceRouter` at `/api/persistence` and `hostPathsRouter` at `/api/host-paths`.
- Starts `eventStreamService` so the daemon event subscription is live as soon as the server boots,
  independent of whether any client has connected yet.
- Calls `reclaimOrphans()` once at startup, before listening, so analysis-cache files left behind by
  a previously interrupted run are cleaned up before any client can observe cache usage.
- Listens on `process.env.PORT`, defaulting to `3000`.

## Dependencies

- connectivity: connectivityRouter
- events: eventsRouter, eventStreamService
- local-persistence: persistenceRouter, hostPathsRouter, reclaimOrphans

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-12
- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-115
- plan-docker_management_app/REQ-116
