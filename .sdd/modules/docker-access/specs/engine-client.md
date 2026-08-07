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
    reached, or `UnsupportedApiVersion` when the daemon reports no API version.
- `request(path, { method?, body? }): Promise<{ statusCode, body }>`
  - Prefixes `path` with `/v{negotiated apiVersion}`; rejects with a `DockerDaemonError` (code
    `DaemonRejected`, `statusCode` set) carrying the daemon's own `message` field verbatim when the
    response status is >= 400.
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

## Rules and invariants

- Every request goes through the endpoint's actual transport (unix socket, TCP(+TLS) socket, or an
  `ssh … docker system dial-stdio` tunnel) — no transport-specific branching in callers.
- A `DockerDaemonError`'s `message` is always the daemon's own message when the daemon responded
  with one; otherwise a description of the low-level connection failure.

## Dependencies

- None (only Node built-ins: `http`, `net`, `tls`, `child_process`).

## Requirements served

- plan-docker_management_app/REQ-9
- plan-docker_management_app/REQ-10
- plan-docker_management_app/REQ-13
- plan-docker_management_app/REQ-34
- plan-docker_management_app/REQ-35
