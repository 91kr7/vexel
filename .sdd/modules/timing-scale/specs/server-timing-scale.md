---
module: timing-scale
component: Server timing scale
type: backend module
---

# Server timing scale

**Purpose** → the one place a server cadence is declared from: the factor this process runs its own
rhythms at, and the helper every scaled cadence goes through. The operator sets nothing and gets the
shipped product to the millisecond; a suite sets a factor and gets the same product on a shorter
clock.

## Contract

- `timingScale` → the factor in force for the whole process, computed once when the module is first
  imported
  - `VEXEL_TIMING_SCALE` unset, or set to an empty or blank value → `1`
  - a plain decimal from `0.1` to `10` → that number
  - anything else → throws, and the message names both `VEXEL_TIMING_SCALE` and the rejected value
    as it was written
- `cadence(ms) → number` → the declared cadence on this process's clock
  - `cadence(750)` at factor `1` → `750`; at factor `0.2` → `150`
  - the result is rounded to a whole millisecond and is never below `1`, whatever the factor

### What counts as a number here

- accepted: a plain decimal written canonically — `1`, `1.0`, `0.2`, `10`
- refused: `02`, `.5`, `2.`, `1e-1`, `+1`, `-1`, `abc`

## Rules and invariants

- **The refusal happens at import, not at first use.** Every server cadence is a module-level
  constant computed from this factor, so a check running later would run after the bad value had
  already been used. A process whose factor is refused never opens its port.
- A rejected value is never taken silently as `1`: a suite that meant to run at a fifth and ran at
  full speed reports a slowness nobody can explain, and a typo is exactly how that happens — which
  is why `02`, readable as `2` by an ordinary numeric parse, is refused rather than read as double
  speed.
- **Only a cadence passes through `cadence()`.** A cadence is a rhythm the product chooses for
  itself — how often it polls, groups or samples — so running it faster is the same behaviour on a
  shorter clock. A tolerance is a bet about how slow the outside world may be, and is never scaled:
  a disk, a registry or a daemon does not get faster because a suite is running, and a scaled-down
  tolerance makes the product wrong under load in a way no green run reports.
- The module reads nothing but the environment and depends on nothing else, so importing it can
  never pull a cadence in behind it.

## Requirements served

- plan-docker_management_app-timing_scale/REQ-1
- plan-docker_management_app-timing_scale/REQ-2
- plan-docker_management_app-timing_scale/REQ-3
- plan-docker_management_app-timing_scale/REQ-4
- plan-docker_management_app-timing_scale/REQ-5
- plan-docker_management_app-timing_scale/REQ-6
