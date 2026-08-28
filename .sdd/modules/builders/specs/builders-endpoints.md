---
module: builders
component: Builders endpoints
type: REST endpoint
---

# Builders endpoints

**Purpose** → exposes buildx builder inventory/management and the build-cache inventory/prune to the
client.

## Contract

- `GET /api/builders` → the builder list, **answered from the refresh cache**.
  - `200` → `BuilderSummary[]`.
- `POST /api/builders` → creates a builder.
  - request: `{ name, driver, endpoint?, platforms?: string[] }`.
  - `400` → `name` or `driver` missing/blank.
  - `201` → the created builder.
- `DELETE /api/builders/:name` → removes a builder.
  - `204` → removed.
- `POST /api/builders/:name/use` → sets `:name` as the active builder.
  - `200` → the resulting builder (now `active`).
- `GET /api/builders/cache` → the build-cache inventory, **answered from the refresh cache**.
  - `200` → `BuildCacheRecord[]`.
- `GET /api/builders/cache/:id/usage` → the images and layers `:id` relates to (REQ-69).
  - `200` → `BuildCacheUsage` (references, or the reason none can be named).
  - `404` → no build-cache record carries that id.
- `POST /api/builders/cache/prune` → prunes reclaimable build-cache records.
  - `200` → `{ reclaimedBytes }`.
- Any daemon/CLI-side failure on the above → `502` (or the error's own status code) with
  `{ error: message }`, the daemon's own message verbatim.

## Rules and invariants

- **Neither listing endpoint runs the CLI while the client waits.** Each answers the value the
  refresh cache holds (kinds `builders` and `build-cache`); only an inventory never read before
  waits for a read. Their bodies are unchanged; each response carries `X-Vexel-Read-At`,
  `X-Vexel-Age-Ms`, and `X-Vexel-Stale` when the last read attempt failed.
- Create, remove and select-active mark `builders` changed on success; the cache prune marks
  `build-cache`. The cache-record usage lookup stays **direct**.

## Dependencies

- builders: BuildersService, BuildCacheService, BuildCacheUsageService

## Requirements served

- plan-docker_management_app/REQ-88
- plan-docker_management_app/REQ-89
- plan-docker_management_app/REQ-91
- plan-docker_management_app/REQ-69
- plan-docker_management_app-refresh_cache/REQ-9
- plan-docker_management_app-refresh_cache/REQ-13
