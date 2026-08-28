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
  `refreshRouter` at `/api/refresh`,
  `volumesRouter` at `/api/volumes`, `networksRouter` at `/api/networks`, `registriesRouter` at
  `/api/registries`, `composeRouter` at
  `/api/compose`, `systemRouter` at `/api/system`, `consoleRouter` at `/api/console`, and
  `imageAnalysisRouter` alongside `imagesRouter` at `/api/images`.
- After every `/api/*` router and before the interface, answers any remaining address under `/api`
  with `404` and a JSON body `{ error: <text> }`, so a mistyped, misspelled or removed call fails as
  an API error a program can detect and is never answered with the interface.
- **Last of all, and before listening**, mounts the client serving (`mountClientApp`), so that an
  ordinary page request outside `/api` is answered with the built interface rather than a server
  "not found", while `/health` and every `/api` address keep answering exactly as before.
  - `VEXEL_CLIENT_DIST` points the interface at another directory at run time.
  - no built interface present → the server starts anyway and serves its whole API, with the reason
    and the remedy reported once.
- Handles the HTTP `upgrade` hook on the `http.Server` itself, outside the middleware chain, so the
  interactive container sessions are unaffected by anything mounted on the app.
- Calls `publishActiveEndpoint()` once at startup, before anything dials the daemon, so every area
  talks to the daemon of the active Docker context rather than to the platform-default socket; its
  failure (no `docker` CLI, unreadable configuration) is not fatal and leaves the default in place
  (REQ-93).
- Starts `eventStreamService` so the daemon event subscription is live as soon as the server boots,
  independent of whether any client has connected yet.
- **Starts no per-container stats sampler.** Booting the process asks the daemon for no stats at
  all: sampling begins only when a consumer subscribes to the sampled figures and ends when the last
  one goes, so a server left running with no browser attached is silent
  (`plan-docker_management_app-containers_card_view/REQ-41`, `REQ-44`).
- Calls `reclaimOrphans()` once at startup, before listening, so analysis-cache files left behind by
  a previously interrupted run are cleaned up before any client can observe cache usage.
- Calls `sweepAbandonedExtractionContainers()` once at startup (its failure, e.g. an unreachable
  daemon, is not fatal to boot) so any intermediate filesystem-extraction container left behind by
  an interrupted run is removed before any client can observe the container list (REQ-54, REQ-57).
- Listens on `process.env.PORT`, defaulting to `3000`, once — one process, one port, serving the
  interface and the API together at that one address.

## Rules and invariants

- **Mount order is load-bearing**: `/health` and every `/api/*` router first, then the API's
  `404`, then the client serving, then `listen`. A new router goes before the API `404`; anything
  registered after the client serving would be unreachable for a page request, and anything
  registered before `/api` could shadow the API.
- The interface and the API share one origin and one port; there is no arrangement in which one is
  exposed without the other, and the process introduces no authentication, authorisation or
  transport-security layer of its own.
- A missing built interface never stops the process from starting.

## Dependencies

- server-app: mountClientApp (client serving)
- containers: handleContainerSessionUpgrade, containersRouter
- connectivity: connectivityRouter
- contexts: contextsRouter, publishActiveEndpoint
- events: eventsRouter, eventStreamService
- local-persistence: persistenceRouter, hostPathsRouter, reclaimOrphans
- images: imagesRouter
- image-analysis: imageAnalysisRouter, sweepAbandonedExtractionContainers
- volumes: volumesRouter
- networks: networksRouter
- registries: registriesRouter
- compose: composeRouter
- system: systemRouter

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-12
- plan-docker_management_app/REQ-54
- plan-docker_management_app/REQ-57
- plan-docker_management_app/REQ-70
- plan-docker_management_app/REQ-93
- plan-docker_management_app/REQ-95
- plan-docker_management_app/REQ-96
- plan-docker_management_app/REQ-71
- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-115
- plan-docker_management_app/REQ-116
- plan-docker_management_app-single_process_serving/REQ-1
- plan-docker_management_app-single_process_serving/REQ-4
- plan-docker_management_app-single_process_serving/REQ-6
- plan-docker_management_app-single_process_serving/REQ-7
- plan-docker_management_app-single_process_serving/REQ-12
- plan-docker_management_app-containers_card_view/REQ-41
- plan-docker_management_app-containers_card_view/REQ-44
