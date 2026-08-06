---
module: containers
component: Container logs client
type: frontend data client
---

# Container logs client

**Purpose** → the typed client-side description of the container log stream: its line shape, its
options, and the URL that carries them.

## Contract

- `ContainerLogLine = { seq: number, stream: 'stdout' | 'stderr', timestamp?: string, text: string }`
- `ContainerLogOptions = { stdout?: boolean, stderr?: boolean, follow?: boolean,
  timestamps?: boolean, tail?: number | 'all', since?: string, until?: string }`
- `containerLogStreamUrl(id, options) → string`
  - returns the `/api/containers/<id>/logs/stream` URL with only the options that differ from the
    endpoint's defaults present as query parameters; blank `since`/`until` are omitted.

## Requirements served

- plan-docker_management_app/REQ-30
- plan-docker_management_app/REQ-31
