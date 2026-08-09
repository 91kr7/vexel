---
module: system
component: System client
type: frontend data client
---

# System client

**Purpose** → typed access to the disk-usage and prune endpoints for the client.

## Contract

- `fetchDiskUsage(): Promise<DiskUsageBreakdown>` — `GET /api/system/disk-usage`.
- `pruneScope(scope: DiskUsageCategoryId[]): Promise<PruneRunResult>` — `POST /api/system/prune`
  with `{ scope }`; a scope of one is the per-category prune.
- Both reject with an `Error` carrying the server's own `error` message on a non-2xx response, and
  `Request failed with HTTP <status>` when the body carries none.
- Re-exports the payload types the screens read: `DiskUsageBreakdown`, `DiskUsageCategory`,
  `DiskUsageCategoryId`, `CategoryPruneOutcome`, `PruneRunResult`.

## Rules and invariants

- Transport only: no caching, no retry, no derived state — the hook owns those.

## Requirements served

- plan-docker_management_app/REQ-95
- plan-docker_management_app/REQ-96
