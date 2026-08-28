# docker-access — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| Active endpoint | backend service | `server/src/docker/endpoint.ts` | The endpoint of the active Docker context every area dials, its precedence over `DOCKER_HOST`/default, and the notification of its change | `specs/active-endpoint.md` |
| EngineClient | backend service | `server/src/docker/engine-client.ts` | Engine API client for the active context's endpoint: dials unix/TCP(+TLS)/ssh over connections held open and reused per endpoint, negotiates the API version, maps daemon errors to a typed shape, and exposes the shared client that follows the active context | `specs/engine-client.md` |
| CLI runner | backend service | `server/src/docker/cli-runner.ts` | Detects `docker`/`compose`/`buildx` presence and version once per server process, and runs a CLI command against the active context with streamed output, an optional standard input (the channel a secret travels on), exit code and cancellation | `specs/cli-runner.md` |
