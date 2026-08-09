---
module: system
component: System endpoints
type: REST endpoint
---

# System endpoints

**Purpose** → exposes the reclaimable-space breakdown and the prunes over it to the client.

## Contract

- `GET /api/system/disk-usage` → the reclaimable-space breakdown.
  - `200` → `DiskUsageBreakdown` (the five categories in their canonical order, plus the total).
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

## Dependencies

- system: DiskUsageService, PruneService

## Requirements served

- plan-docker_management_app/REQ-95
- plan-docker_management_app/REQ-96
