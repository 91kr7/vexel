---
module: docker-access
component: Docker call log
type: backend service
---

# Docker call log

**Purpose** → one line written **before** anything is asked of Docker, on either channel the
product talks to it on: the Engine API over the dialed socket and the local `docker` CLI. What the
operator's daemon is being asked, as it is being asked it.

## Contract

- `logSocketCall(endpoint, { method, path, mode }): void` — announces an Engine API request about to
  be issued. `path` is the path as it will be dialed, API version prefix and query string included.
  `mode` is `"request"` (ordinary buffered call, left unmarked), `"stream"` or `"hijack"`; the last
  two are marked because they own a connection for as long as they last.
- `logCliCall(command, args, endpoint?): void` — announces a CLI process about to be spawned.
  `endpoint` is omitted for the availability probe (`docker --version` and friends), which dials
  nothing and would be described by a target it never contacts.
- `describeEndpoint(endpoint): string` — how an endpoint is named in a line: `unix://<path>`,
  `tcp://<host>:<port>` (with ` (tls)` appended when the context carries TLS material),
  `ssh://<destination>` — the same URL forms `DOCKER_HOST` accepts.
- `redactCliArgs(args): string[]` — the argv as it may be written; see **Redaction** below.
- `setDockerCallLogSink(sink | undefined): void` — test seam. Redirects the lines somewhere a check
  can read them; `undefined` restores standard output. The server never calls it.

### The line

```
2026-08-28T17:39:55.222Z [docker socket] GET /v1.43/containers/json?all=true → unix:///var/run/docker.sock
2026-08-28T17:39:55.212Z [docker socket] GET /v1.43/events (stream) → unix:///var/run/docker.sock
2026-08-28T17:39:55.240Z [docker cli] docker compose ls --all --format json → unix:///var/run/docker.sock
2026-08-28T17:39:55.163Z [docker cli] docker --version
```

- ISO-8601 timestamp, the channel tag, the call, and the endpoint after an arrow. The tag is
  `[docker socket]` or `[docker cli]` and nothing else, so one grep catches a whole channel however
  the call was framed; the mode qualifies the call rather than the tag, for that reason.
- Written to standard output, the stream the process already reports itself on.
- Arguments containing whitespace are quoted, so a line reads back unambiguously.
- A call longer than 500 characters is cut, and the line says by how much: `… (+N chars)`.
- The endpoint named on a CLI line is the **active endpoint the call is aimed at**. When the
  operator has not set `DOCKER_HOST`, that value is not forced onto the child — the CLI resolves the
  active Docker context by itself (see `cli-runner.md`) — and the two agree by construction.

### Before, and only before

The line goes out before the request is issued and before the agent dials anything for it, and
before the child process exists. That is the whole point: a call that hangs, or that takes the
daemon down with it, is named in the log by the time it does so. **Nothing is written afterwards** —
no outcome, no status, no duration — so the volume is exactly one line per call.

### What is never written

Request and response bodies, headers, and the child's standard input.

That last one is not a detail. Standard input is where this product deliberately puts every secret
it hands the CLI, precisely so it stays out of `argv` where `ps` would show it (REQ-87); writing it
here would hand back what that rule exists to withhold. `--password-stdin` is left visible in the
line for the same reason it exists: seeing it is how one reads that the secret went the safe way.

### Redaction

`argv` is redacted all the same, because the raw console (REQ-100) lets an operator type anything.
The flag is left in place and its value blanked to `***`, in both spellings (`--flag secret` and
`--flag=secret`):

- always: `--password`, `--token`, `--registry-token`, `--identity-token`, `--secret`, `--auth`.
- for `docker login` only: `-p`. Everywhere else `-p` publishes a port, and reading `-p 8080:80` as
  a credential would blank out the most useful half of the line for every container the product
  starts.

### On by default, off by request

`VEXEL_DOCKER_LOG` set to `off`, `0`, `false` or `no` silences it. Any other value, or none, leaves
it on: an operator running the product is meant to be told what it asks of their daemon without
having to ask for it first.

The variable is read **per call**, not once at import: a check flips it around a single call, and one
process must not be pinned to whatever the environment held when this module was first imported.

Every automated pass sets it off (`server/package.json`, and the e2e web server in
`client/playwright.config.ts`). A suite is the one reader that is not the operator: a pass makes
thousands of calls, and a line each would bury the reporter's own output in the exact place a
failure has to be read.

## Why two call sites cover every call

Both channels already funnel through a single function each — `send`/`hijack` in `http-client.ts`,
`runCliCommand`/`runOnce` in `cli-runner.ts`. Logging there rather than per area means a new feature
area is logged the day it is written, without being told to be, and that no area can quietly acquire
a Docker call the log does not know about.

The ssh transport's own `ssh <host> docker system dial-stdio` is not logged separately: it is how a
socket call reaches a remote daemon, and that call is already on the line above it.

## Dependencies

- docker-access: shared types (`DockerEndpoint`)

## Consumers

- docker-access: EngineClient (through `http-client.ts`)
- docker-access: CLI runner
