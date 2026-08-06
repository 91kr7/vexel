---
module: local-persistence
component: GET/POST /api/host-paths
type: REST endpoint
---

# POST /api/host-paths/validate

**Purpose** → exposes `HostPathValidator` to the client, so a path field can validate inline as the
operator types (REQ-116).

## Contract

- `POST /api/host-paths/validate` → request body: `{ path, kind?, root? }` (see
  `host-path-validator.md`).
  - `200` with the `HostPathValidationResult` JSON body, whether the path is valid or refused (a
    refusal is a normal, `200` outcome carrying `valid: false` and a `reason`, not an HTTP error).
  - `400` when `path` is missing or not a string.

## Dependencies

- HostPathValidator

## Requirements served

- plan-docker_management_app/REQ-116
