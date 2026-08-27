---
module: containers
component: Container inspect reading
type: shared rule
---

# Container inspect reading

**Purpose** → what a key of the container inspect payload *means*, so the Inspect tab can put a
readable date, a byte unit, a duration, a yes/no or a pill **beside** the daemon's own literal. The
knowledge of which key means what lives here, in feature code, and never in the library that draws
the payload.

## Contract

- `readContainerInspectValue(path, value) → { text?, pill?, tone? } | undefined`
  - `path` is the key path from the payload's root (an array item addressed as `[0]`, `[1]`, …).
  - The result is the reading shown **beside** the literal: `text` is the reading in words, `pill`
    asks for it as a pill in `tone`, and a `tone` with no `text` tones the literal itself.
  - **`undefined` for every key it does not recognise** — the literal then stands on its own.
  - What it recognises, and nothing else:

    | key path / key | reading |
    | --- | --- |
    | `State.Status` | the state as a pill, in the state's own tone (`container-status.md`) |
    | `State.Health.Status` | the health outcome as a pill, in that outcome's tone (`container-status.md`) |
    | `State.ExitCode` | non-zero → the danger tone on the literal; **zero → no reading at all** |
    | a `HostIp`/`HostPort` object under `NetworkSettings.Ports` or `HostConfig.PortBindings` | the binding read `host:port → container port/protocol`; an unbound entry gets none |
    | `Created`, `StartedAt`, `FinishedAt`, `Start`, `End` | the instant as a readable date; Go's zero time (`0001-01-01T00:00:00Z`) as `never` |
    | `Memory`, `MemorySwap`, `MemoryReservation`, `KernelMemory`, `ShmSize`, `SizeRw`, `SizeRootFs` | the count of bytes with a unit |
    | `Memory`, `MemorySwap`, `MemoryReservation`, `KernelMemory`, `NanoCpus` **valued `0`** | `no limit` |
    | `NanoCpus` | the limit in CPUs |
    | `Interval`, `Timeout`, `StartPeriod`, `StartInterval` | the nanosecond duration as a duration; `0` gets none |
    | any boolean, anywhere | `yes` / `no` |

## Rules and invariants

- **The reading is added, never substituted.** Every rule above produces something to draw *beside*
  the literal the daemon sent; nothing here removes, rounds, shortens or masks what the payload says.
- **A sentinel is annotated only where the daemon documents it and it is unambiguous** — `0` as "no
  limit" on the resource limits above, and Go's zero time as "never". Every other number is drawn as
  the number: a `0` exit code, a `0` restart count and a `0` shm size are zeros, not sentences.
- **The state and the health outcome are the module's existing readings** (`container-status.md`),
  not second ones: two tables is exactly the divergence that rule exists to prevent.
- **Every value is read alike, whatever it holds**: an environment variable carrying a password or a
  token is a string like any other — no masking, no truncation, no reveal.
- Pure and total: no request, no state, no throw, and an unrecognised or wrongly-typed value simply
  yields no reading.

## Dependencies

- Container status reading (`container-status.md`)

## Requirements served

- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-15
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-16
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-17
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-18
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-27
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor-inspect_full_payload/REQ-35
