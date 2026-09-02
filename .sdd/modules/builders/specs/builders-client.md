---
module: builders
component: Builders client
type: frontend data client
---

# Builders client

**Purpose** → typed `fetch` wrapper for the builders, build-cache and build-cache traceability
endpoints.

## Contract

- `createBuilder(input: CreateBuilderInput): Promise<BuilderSummary>`
- `removeBuilder(name): Promise<void>`
- `activateBuilder(name): Promise<BuilderSummary>` — sets `name` as the active builder.
- `BuildCacheRecord`: `{ id, type, sizeBytes, usageState, description? }` — the shape of a record,
  which the live channel delivers; this client no longer reads the inventory.
- `fetchBuildCacheUsage(recordId, signal?): Promise<BuildCacheUsage>` —
  `GET /api/builders/cache/{recordId}/usage` (REQ-69); aborting `signal` abandons the read, so a
  caller can supersede it.
  - `BuildCacheUsage`: `{ record, references, unavailableReason?, unavailableDetail? }`.
  - `BuildCacheLayerReference`: `{ imageId, imageShortId, tags, layerIndex, diffId?, instruction,
    command? }`.
  - `BuildCacheUsageUnavailableReason`: `'NonLayerCacheRecord' | 'NoRecordedDescription' |
    'NoMatchingImage'`; present exactly when `references` is empty.
- `pruneBuildCache(): Promise<BuildCachePruneResult>`
- Every call rejects with the server's own `error` message (or a generic HTTP-status message when the
  response carries no JSON body) on a non-2xx response.

## Dependencies

- builders: Builders endpoints

## Requirements served

- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-89
- plan-docker_management_app/REQ-91
- plan-docker_management_app/REQ-69
