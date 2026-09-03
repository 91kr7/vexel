---
module: measurement
component: Coverage server entry
type: repository command
---

# Coverage server entry

**Purpose** → the web server the browser-driven suite runs against during a coverage run: the same
built application, started so that what it executed is on disk before the process is stopped.

## Contract

- `node scripts/measurement/coverage-server.mjs`, with `NODE_V8_COVERAGE` naming the directory to
  record into.
- It builds the client and then the server, both with source maps, and stops with the build's own
  failing outcome if either fails — serving nothing.
- It then runs the built server, exactly as `npm run serve` does: same process, same port, same
  environment.
- On `SIGTERM` or `SIGINT` it writes what the process executed into the recording directory and
  exits successfully.

## Rules and invariants

- **The reason it exists** is that the product installs no stop-signal handler: the signal
  Playwright sends its web server would end the process with nothing recorded.
- Source maps are asked for on the build command line, never through the build configurations:
  `client/vite.config.ts` may read no environment variable at all
  (plan-docker_management_app-timing_scale/REQ-13).
- **The builds record nothing.** Node forces its own recording directory on every process it spawns,
  so the two builds are pointed at a directory nobody reads; what the run counts is the server's
  execution, not the compiler's.
- The application it serves is the delivered one: the build is the product's own, with source maps
  added and nothing else changed.

## Dependencies

- *Report store* (same module) — for the repository root it resolves the build and the server
  against.
- *Server bootstrap* (module `server-app`) — what it ends up running.

## Requirements served

- plan-test_coverage_code_quality/REQ-3
