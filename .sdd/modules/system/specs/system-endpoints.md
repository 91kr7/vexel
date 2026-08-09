---
module: system
component: System endpoints
type: REST endpoint
---

# System endpoints

**Purpose** → exposes the host overview, the reclaimable-space breakdown and the prunes over it to
the client.

## Contract

- `GET /api/system/disk-usage` → the reclaimable-space breakdown.
  - `200` → `DiskUsageBreakdown` (the five categories in their canonical order, plus the total).
- `GET /api/system/overview` → the host overview a dashboard is built from.
  - `200` → `SystemOverview`: container counts by state, images, volumes, stacks split
    compose/swarm, build cache with its active builder, and the occupied-space breakdown.
  - a capability the host lacks (buildx, a swarm) does not fail the response: its section carries
    the reason instead.
- `POST /api/system/prune` → prunes the categories named by the scope.
  - request: `{ scope: DiskUsageCategoryId[] }`.
  - `400` → `scope` missing, empty, not an array, or naming a category that does not exist;
    nothing is pruned.
  - `200` → `PruneRunResult`: one outcome per requested category (what was removed, the space
    reclaimed, or that category's `error`) and the total space reclaimed.
- Any daemon/CLI-side failure of the reading → `502` (or the error's own status code) with
  `{ error: message }`, the daemon's own message verbatim.

## Rules and invariants

- One endpoint serves both prunes of REQ-96: a per-category prune is a scope of one, and is
  reported exactly as a system-wide run is — there is no second shape for the same operation.
- A prune whose categories partly failed still answers `200`: the run happened, and the body is the
  account of it. Only a rejected request (`400`) leaves the host untouched.
- Nothing is pruned by a `GET`, and no prune runs without an explicit scope in the body.
- The overview is one request, not one per area: its figures are read together, so two tiles built
  from it cannot describe different moments.

## Dependencies

- system: DiskUsageService, SystemOverviewService, PruneService

## Requirements served

- plan-docker_management_app/REQ-95
- plan-docker_management_app/REQ-96
- plan-docker_management_app/REQ-14
- plan-docker_management_app/REQ-16
