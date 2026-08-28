---
module: docker-access
component: Active endpoint
type: backend service
---

# Active endpoint

**Purpose** → the single place every server area reads its target daemon from: the Engine API
endpoint of the active Docker context, and the announcement of its change.

## Contract

- `resolveActiveEndpoint(): DockerEndpoint`
  - Resolution order, mirroring the Docker CLI's own: an operator-set `DOCKER_HOST` (with
    `DOCKER_TLS_VERIFY`/`DOCKER_CERT_PATH` when present) → the endpoint last published by
    `setActiveEndpoint` → the platform's default local socket (`/var/run/docker.sock`, the named pipe
    on Windows).
- `setActiveEndpoint(endpoint | undefined): void`
  - Publishes the endpoint of the context that has become active; `undefined` returns to the
    platform default.
  - Notifies every listener **only when the resolved active endpoint actually changes** — publishing
    the same endpoint twice notifies nobody, and publishing anything while `DOCKER_HOST` is set
    changes nothing, since that variable keeps precedence.
- `onActiveEndpointChanged(listener): () => void`
  - Registers a listener for that change; returns its unsubscribe function.
- `isExplicitEndpoint(): boolean`
  - `true` only when `DOCKER_HOST` is set in the environment. A spawned CLI process is given a forced
    `DOCKER_HOST` in that case alone: otherwise the CLI resolves the active context by itself, from
    the very configuration `docker context use` writes, which is what keeps tools that key local
    state on the context identity (e.g. buildx's current builder) agreeing with the application.
- `parseEndpointUrl(url, tls?): DockerEndpoint`
  - `unix://` / `npipe://` → a socket endpoint; `ssh://` → an SSH destination; `tcp://`, `http://`,
    `https://` → host and port, defaulting to 2376 with TLS material and 2375 without; anything else
    → the platform's default local socket.
- `defaultLocalSocket(): DockerEndpoint` — the platform's default local socket.

## Rules and invariants

- Nothing here reads the Docker context inventory: the contexts area resolves the active context and
  pushes its endpoint in. That keeps the access layer free of any dependency on the CLI channel.
- The active endpoint is process-wide: every area dials the same daemon at any instant, so no two
  screens can be reading different daemons.
- The change notification is what makes a switch of daemon complete: on it the Engine API client is
  rebuilt, the daemon event stream re-established, and every connection held open for the previous
  daemon is closed (plan-docker_management_app-refresh_cache/REQ-5). Nothing opened for one endpoint
  outlives it.

## Dependencies

- None (only Node built-ins).

## Requirements served

- plan-docker_management_app/REQ-93
- plan-docker_management_app-refresh_cache/REQ-5
