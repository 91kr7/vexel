---
module: timing-scale
component: Timing-scale endpoint
type: REST endpoint
---

# Timing-scale endpoint

**Purpose** → hands the browser the factor the serving process is using. The browser has no
environment to read, so the process that has one answers for it.

## Contract

- `GET /api/timing-scale` → the factor this process runs its cadences at
  - `200` → `{ scale: <number> }`, the value `timingScale` holds
  - the factor the operator's process reports is `1`

## Rules and invariants

- Answers from a value read when the process started: **nothing is asked of the daemon**, so the
  answer is the same whether the daemon is reachable, unreachable or absent, and it costs no Docker
  call.
- It is the browser's only source for the factor. The figure is never inlined at build time, so the
  bundle an operator runs and the bundle a suite exercises are the same files; only the configuration
  of the process serving them differs, as it already does for `PORT` and `VEXEL_DATA_DIR`.

## Dependencies

- Server timing scale

## Requirements served

- plan-docker_management_app-timing_scale/REQ-7
- plan-docker_management_app-timing_scale/REQ-13
