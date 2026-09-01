---
module: timing-scale
component: Client timing scale
type: client module
---

# Client timing scale

**Purpose** → the one place a client cadence is declared from: the factor the running page uses, and
the helper every scaled cadence goes through. The counterpart of the server's, and a separate
declaration because these are two processes — neither can read the other's memory.

## Contract

- `setTimingScale(value)` → adopts the factor for the rest of the page's life
  - a finite number greater than `0` → that factor
  - anything else → `1`
- `cadence(ms) → number` → the declared cadence on this page's clock
  - before `setTimingScale` has been called → the declared value unchanged, so a page that never
    learns a factor runs at the shipped rhythm
  - `cadence(3000)` at factor `0.2` → `600`
  - the result is rounded to a whole millisecond and is never below `1`, whatever the factor

## Rules and invariants

- **The factor must be set before any module holding a cadence is imported.** A client cadence is a
  module-level constant, evaluated the moment its module is first imported; a factor adopted after
  that changes nothing already computed. The entry point is what guarantees the order.
- The factor is set once, by the entry point. Nothing else sets it, and no cadence is recomputed
  afterwards.
- **Only a cadence passes through `cadence()`.** The reconnect backoffs of the log and statistics
  streams are tolerances and stay absolute, for the reason the server's module states.
- The module reads no environment of its own, and no client source names the server's environment
  variable or reads a build-time environment at all, so the factor cannot enter the bundle when it
  is built. The client's only source for it is the endpoint.

## Requirements served

- plan-docker_management_app-timing_scale/REQ-3
- plan-docker_management_app-timing_scale/REQ-9
- plan-docker_management_app-timing_scale/REQ-10
- plan-docker_management_app-timing_scale/REQ-11
- plan-docker_management_app-timing_scale/REQ-12
- plan-docker_management_app-timing_scale/REQ-13
