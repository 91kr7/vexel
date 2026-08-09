---
module: server-app
component: Root commands
type: configuration
---

# Root commands

**Purpose** → the repository-root command surface of the delivered product: one command that builds
the whole application and runs it, one that runs an already-built one, and — beside them and
untouched by them — the two-process development pair.

## Contract

- `npm start` → builds the whole application and serves it.
  - runs `npm run build`, then `npm run serve`, in that order, in one shell chain.
  - the build fails → the command stops with a failing outcome and **nothing is served**; the
    previously built application is never left running in the failed build's place.
  - the build succeeds → the single server process runs, serving the interface and the API on one
    port (default `3000`, moved with `PORT`).
- `npm run build` → builds the client, then the server.
  - runs `npm run build -w client`, then `npm run build -w server`, in that order.
  - the client build fails → the server build does not run and the command fails.
- `npm run serve` → runs the already-built application (`npm start -w server`, i.e.
  `node dist/index.js`).
  - triggers no build of either workspace: a restart costs the time of starting a process, not of a
    build.
  - the interface has not been built → the process still starts and serves the API only, saying so
    once (see the *Client serving* component).
- `npm run dev:client` / `npm run dev:server` → the development pair, unchanged: Vite on `5173`
  proxying `/api` (WebSocket upgrades included) to Express on `3000`, in watch mode.
- `npm run lint`, `npm run test` → unchanged; neither belongs to the run chain.

## Rules and invariants

- **The order is load-bearing, not cosmetic**: the server process serves the client's build output
  (`client/dist`), so the client is always built before the server, and the build always completes
  before anything is served.
- Every link of a chain propagates failure: no step runs after a step that failed, so a failing
  build can never present itself as a working application.
- No command in the run chain starts more than one long-running process, and none of them starts a
  development server.
- Neither arrangement requires a step of the other: the development pair needs no `client/dist`, and
  `npm start` / `npm run serve` need no Vite dev server.
- The names `start`, `serve`, `build`, `dev:client` and `dev:server` are the operator- and
  developer-facing contract: they are what the instructions and the architecture note quote.

## Dependencies

- *Client serving* and *Server bootstrap* (same module) — what `serve` ends up running.

## Requirements served

- plan-docker_management_app-single_process_serving/REQ-13
- plan-docker_management_app-single_process_serving/REQ-14
- plan-docker_management_app-single_process_serving/REQ-15
- plan-docker_management_app-single_process_serving/REQ-16
- plan-docker_management_app-single_process_serving/REQ-17
