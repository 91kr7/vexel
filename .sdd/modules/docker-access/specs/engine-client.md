---
module: docker-access
component: EngineClient
type: backend service
---

# EngineClient

**Purpose** → talks to the Docker Engine API of the active context's endpoint (unix socket, SSH or
TCP+TLS), negotiates the API version, and preserves the daemon's own error message on failure.

## Contract

- `new EngineClient(endpoint: DockerEndpoint)`
  - `DockerEndpoint`: `{ kind: 'unix', socketPath }` | `{ kind: 'tcp', host, port, tls? }` |
    `{ kind: 'ssh', destination }`.
- `getVersion(): Promise<{ apiVersion, engineVersion, minApiVersion? }>`
  - Calls the daemon's `/version`, then negotiates: the lower of the daemon's reported API version
    and this client's maximum supported version, raised to the daemon's `MinAPIVersion` when that
    floor is higher.
  - Rejects with a `DockerDaemonError` (code `DaemonUnreachable`) when the endpoint cannot be
    reached, or `UnsupportedApiVersion` when the daemon reports no API version or answers `/version`
    with a body that is not valid JSON (an endpoint that is not a Docker daemon).
- `request(path, { method?, body? }): Promise<{ statusCode, body }>`
  - Prefixes `path` with `/v{negotiated apiVersion}`; rejects with a `DockerDaemonError` (code
    `DaemonRejected`, `statusCode` set) carrying the daemon's own `message` field verbatim when the
    response status is >= 400.
- `requestRaw(path, { method?, body? }): Promise<{ path, statusCode, body, contentType? }>`
  - The daemon's answer as it came: no error is raised for a status >= 400 and the body is returned
    unaltered — for the caller that has to show the status and body themselves (the raw console,
    REQ-101).
  - A `path` that already carries a version prefix (`/v1.43/…`) is sent as typed; any other is
    prefixed with the negotiated version. The `path` returned is the one actually dialed.
  - Still rejects with a `DockerDaemonError` (code `DaemonUnreachable`) when the endpoint cannot be
    reached at all: there is no status to report in that case.
- `requestStream(path, { method?, headers?, body? }): Promise<IncomingMessage>`
  - Same version-prefixing and error mapping as `request`, but returns the raw streamed response
    (used for `/events`, logs, stats, image pull/push progress, tarball save/load/export/import, …).
    Defaults to `GET`; sets `Content-Type: application/json` when `body` is a JSON string, same as
    `request`.
  - `body` may also be a `Readable` (e.g. a tarball read from disk), streamed into the request rather
    than buffered; the caller supplies its own `Content-Type` via `headers` in that case.
- `hijack(path, { method?, body? }): Promise<{ socket: Duplex, head: Buffer }>`
  - Prefixes `path` with `/v{negotiated apiVersion}` and asks the daemon to hijack the connection
    (exec start, attach): resolves with the raw duplex socket once the daemon switches protocols;
    rejects with a `DockerDaemonError` (code `DaemonRejected`, `statusCode` set) when the daemon
    answers with a normal (non-upgraded) error response instead.
  - Sets `Content-Type: application/json` when `body` is given, same as `request`.
- `CLIENT_MAX_API_VERSION: string`
  - The highest Engine API version this client was written against, and the ceiling of every
    negotiation. Exported because it is also the Engine API baseline the product's coverage
    statement refers to (REQ-106): the number is declared once, here, and read from there.
- `getEngineClient(): EngineClient`
  - The client of the **active context**, shared by every server area.
  - Discarded and rebuilt on the next call as soon as the active endpoint changes, so no caller can
    keep talking to the daemon left behind (REQ-93); a caller that held the previous instance keeps
    talking to the previous daemon, which is why every area calls this on each use rather than
    caching it.
- `resetConnectionPools(): void`
  - Closes every connection held for every endpoint, in flight ones included, and empties the pools.
    Called on a change of the active endpoint, and the seam a check uses to start from no connection
    at all.

## Rules and invariants

- Every request goes through the endpoint's actual transport (unix socket, TCP(+TLS) socket, or an
  `ssh … docker system dial-stdio` tunnel) — no transport-specific branching in callers.
- **A connection is opened once and reused by the calls that follow it**
  (plan-docker_management_app-refresh_cache/REQ-4): `getVersion`, `request` and `requestRaw` take a
  connection from the pool of the endpoint they are dialing and return it once the answer has been
  read. A run of calls over one endpoint therefore opens fewer connections than it makes calls, and
  a remote context pays its TLS handshake — or its `ssh` process — for the connection, not for the
  call. What the caller receives does not change: same answers, same errors, same order.
- **Streams and hijacked connections are dialed outside the pool** (REQ-4): a log follow, an event
  stream or an `exec` owns its connection for its whole life, so it never blocks a pooled one and is
  never handed to another call.
- **A pool belongs to the endpoint it was opened for** (REQ-5): connections are held per endpoint and
  never shared between two, and a change of the active endpoint closes every one of them. A call in
  flight over the previous daemon at that instant fails as `DaemonUnreachable` instead of answering
  with what that daemon had to say.
- The number of connections held for one endpoint is bounded: a burst of parallel calls is served by
  at most sixteen of them, and at most four are kept once it is over.
- A `DockerDaemonError`'s `message` is always the daemon's own message when the daemon responded
  with one; otherwise a description of the low-level connection failure.
- **Every failure of a request leaves this layer as a `DockerDaemonError`** — never as a raw stream,
  socket or parse error. That includes a connection dropped *while the response body was being
  read*, which reaches the caller as `DaemonUnreachable` with no `statusCode`, exactly like a
  connection that was never established: the callers map it as a fault of the link to the daemon
  (`502`) instead of one of the application's own (`500`).
- A failure the daemon itself reports is relayed as it came: the daemon's own status code and its
  own message, verbatim, with no rewriting. A `500` the daemon answers with (e.g. a transient
  "rw layer snapshot not found for container …" while it enumerates containers another process is
  removing) is therefore relayed as that daemon `500` and its text. This layer never retries a
  request on the caller's behalf: a retry would hide from the operator that their daemon answered
  this, and turn one operation into two.

## Dependencies

- docker-access: Active endpoint (for the shared client, and for the change that discards the pools)
- Node built-ins: `http`, `net`, `tls`, `child_process`

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-93
- plan-docker_management_app/REQ-10
- plan-docker_management_app/REQ-13
- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
- plan-docker_management_app/REQ-101
- plan-docker_management_app/REQ-106
- plan-docker_management_app-refresh_cache/REQ-4
- plan-docker_management_app-refresh_cache/REQ-5
