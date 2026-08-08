---
module: builders
component: Builders client
type: frontend data client
---

# Builders client

**Purpose** → typed `fetch` wrapper for the builders and build-cache endpoints.

## Contract

- `fetchBuilders(): Promise<BuilderSummary[]>`
- `createBuilder(input: CreateBuilderInput): Promise<BuilderSummary>`
- `removeBuilder(name): Promise<void>`
- `activateBuilder(name): Promise<BuilderSummary>` — sets `name` as the active builder.
- `fetchBuildCache(): Promise<BuildCacheRecord[]>`
- `pruneBuildCache(): Promise<BuildCachePruneResult>`
- Every call rejects with the server's own `error` message (or a generic HTTP-status message when the
  response carries no JSON body) on a non-2xx response.

## Dependencies

- builders: Builders endpoints

## Requirements served

- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-89
- plan-docker_management_app/REQ-91
