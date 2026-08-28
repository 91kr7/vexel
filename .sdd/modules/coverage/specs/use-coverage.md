---
module: coverage
component: useCoverage
type: frontend hook
---

# useCoverage

**Purpose** → the coverage map joined with the Docker baseline the coverage statement holds against,
as the screen needs them: the map is local data and always there, only the baseline travels.

## Contract

- `useCoverage(): { areas, counts, baseline?, loaded, error?, refresh }`
  - `areas` — the declared coverage map, always the full declaration.
  - `counts` — `{ total, dedicatedScreen, consoleOnly, notApplicable }` over `areas`.
  - `baseline` — the last successfully read `BaselineReport`; `undefined` until the first read
    succeeds.
  - `loaded` — `true` once a baseline read has settled, successfully or not.
  - `error` — the failure message of the last read; cleared by the next successful one.
  - `refresh()` — re-reads the baseline.

## Rules and invariants

- A payload that is not the shape the baseline endpoint promises (no `declared`, a
  non-string version, an unknown `comparison`) is treated as a failed read: it is reported through
  `error` and never stored, so the screen can never state a baseline the server did not declare.
- A failed read leaves the last successfully read baseline in place rather than blanking it: the
  declared half does not change between reads, and an error banner beside a known baseline says
  more than an empty panel.
- A daemon that cannot be reached is **not** a failed read: the server answers with the declared
  baseline and the reason the daemon half is missing, and that answer is stored like any other.
- The baseline is re-read on every active-context switch: the daemon half belongs to a daemon, not
  to the screen (REQ-93).
- It does not poll — neither the declared baseline nor a daemon's version changes while a screen is
  open — and a read that settles after the hook is unmounted updates nothing.
- The map never fails and never waits: `areas` and `counts` are readable before, during and after
  any baseline read, so a server that cannot be reached hides no part of the coverage statement.
- Re-reads on the manual reload signal, and that signal waits for this read: when the
  operator's refresh ends, the screen is already showing the reloaded data. The read replaces
  the data in place — nothing is closed, navigated or reset (plan-docker_management_app-refresh_cache-manual_refresh/REQ-11,
  plan-docker_management_app-refresh_cache-manual_refresh/REQ-13).

## Dependencies

- coverage: Coverage map
- system: System client (`fetchCoverageBaseline`)
- contexts: active-context broadcast (`subscribeToActiveContextChange`)
- app-shell: Reload signal

## Requirements served

- plan-docker_management_app/REQ-105
- plan-docker_management_app/REQ-106
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-11
- plan-docker_management_app-refresh_cache-manual_refresh/REQ-13
