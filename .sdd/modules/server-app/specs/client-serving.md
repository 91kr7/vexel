---
module: server-app
component: Client serving
type: configuration
---

# Client serving

**Purpose** → serves the built interface from the same process, origin and port as the API: the
build's static assets plus the history fallback that answers an ordinary page request with the
entry document instead of a server "not found".

## Contract

- `resolveClientDistDir() → string` → the absolute directory the built interface is looked for in.
  - `VEXEL_CLIENT_DIST` when it is set and not blank, resolved to an absolute path.
  - otherwise `client/dist` of the repository, resolved from this module's own location, so it is
    the same whatever the working directory the process was started from.
- `mountClientApp(app, options?) → boolean` → mounts the interface on an existing Express app and
  reports whether it is being served. `options.distDir` overrides both the environment variable and
  the default; `options.report` receives the absence message (`console.warn` by default).
  - the directory holds an `index.html` → mounts the static assets and the history fallback, and
    returns `true`.
  - the directory is absent, or holds no `index.html` → mounts nothing, returns `false`, and calls
    `report` **once**, with a single line naming the cause (the interface has not been built, and
    where it was looked for) and the remedy (`npm run build` at the repository root).
- Once mounted, for a request that reached it:
  - `GET`/`HEAD` on a path that exists in the build → that file, with the type the build gives it.
  - `GET`/`HEAD` on any other path outside `/api` → `200` with the build's `index.html`.
  - any path under `/api` (or `/api` itself) → not answered; the request is passed on.
  - any other method (`POST`, `PUT`, `DELETE`, …) → not answered; the request is passed on, so an
    address that does not exist ends as the error it would otherwise be.

## Rules and invariants

- The build directory and its presence are decided once, when mounting, never probed per request.
- Nothing is mounted when there is no build: a missing build is a normal state (fresh checkout,
  development flow where Vite owns the client), never a reason for the process to fail to start.
- Importing the module does nothing observable: no filesystem work, no listening, no logging. It is
  a mountable unit, so an app composed for a check behaves as the running server does.
- Adds no dependency, no start-up network access, and no work proportional to the size of the build.
- The interface is served by the process that serves the API, on its port: this introduces no second
  process, no proxy and no second origin.

## Dependencies

- `express` (`express.static`, `res.sendFile`) — no other.

## Requirements served

- plan-docker_management_app-single_process_serving/REQ-1
- plan-docker_management_app-single_process_serving/REQ-3
- plan-docker_management_app-single_process_serving/REQ-5
- plan-docker_management_app-single_process_serving/REQ-8
- plan-docker_management_app-single_process_serving/REQ-9
- plan-docker_management_app-single_process_serving/REQ-10
- plan-docker_management_app-single_process_serving/REQ-11
