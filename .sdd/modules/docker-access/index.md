# docker-access — Index

| Component | Type | Path | Responsibility | Spec |
|-----------|------|------|-----------------|------|
| EngineClient | backend service | `server/src/docker/engine-client.ts` | Engine API client for the active context's endpoint: dials unix/TCP(+TLS)/ssh, negotiates the API version, and maps daemon errors to a typed shape | `specs/engine-client.md` |
| CLI runner | backend service | `server/src/docker/cli-runner.ts` | Detects `docker`/`compose`/`buildx` presence and version, and runs a CLI command against the active context with streamed output, exit code and cancellation | `specs/cli-runner.md` |
