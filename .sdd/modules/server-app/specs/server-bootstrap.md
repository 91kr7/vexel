---
module: server-app
component: Server bootstrap
type: configuration
---

# Server bootstrap

**Purpose** → the Express entrypoint: composes every server module into one running app.

## Contract

- `GET /health` → `{ status: "ok" }` (unchanged from the scaffold).
- Mounts `connectivityRouter` at `/api/connectivity` and `eventsRouter` at `/api/events`.
- Starts `eventStreamService` so the daemon event subscription is live as soon as the server boots,
  independent of whether any client has connected yet.
- Listens on `process.env.PORT`, defaulting to `3000`.

## Dependencies

- connectivity: connectivityRouter
- events: eventsRouter, eventStreamService

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-12
