---
module: system
component: System client
type: frontend data client
---

# System client

**Purpose** → typed access to the overview, disk-usage, prune and coverage-baseline endpoints for
the client.

## Contract

- `fetchSystemOverview(): Promise<SystemOverview>` — `GET /api/system/overview`.
- `fetchDiskUsage(): Promise<DiskUsageBreakdown>` — `GET /api/system/disk-usage`.
- `pruneScope(scope: DiskUsageCategoryId[]): Promise<PruneRunResult>` — `POST /api/system/prune`
  with `{ scope }`; a scope of one is the per-category prune.
- `fetchCoverageBaseline(): Promise<BaselineReport>` — `GET /api/system/baseline`; the declared
  Engine API and docker CLI baseline, the connected daemon's versions and the comparison between
  them. An unreachable daemon is part of the answer, not a rejection.
- All four reject with an `Error` carrying the server's own `error` message on a non-2xx response,
  and `Request failed with HTTP <status>` when the body carries none.
- Re-exports the payload types the screens read: `DiskUsageBreakdown`, `DiskUsageCategory`,
  `DiskUsageCategoryId`, `CategoryPruneOutcome`, `PruneRunResult`, `SystemOverview`,
  `ContainerCounts`, `StacksOverview`, `BuildCacheOverview`, `DiskUsageTotals`,
  `DiskUsageTotalCategory`, `DiskUsageTotalCategoryId`, `BaselineReport`, `BaselineDeclaration`,
  `ConnectedDaemonVersions`, `BaselineComparison`.

## Rules and invariants

- Transport only: no caching, no retry, no derived state — the hook owns those.

## Requirements served

- plan-docker_management_app/REQ-95
- plan-docker_management_app/REQ-96
- plan-docker_management_app/REQ-14
- plan-docker_management_app/REQ-16
- plan-docker_management_app/REQ-106
