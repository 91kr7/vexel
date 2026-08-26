---
module: containers
component: Container status reading
type: shared rule
---

# Container status reading

**Purpose** → the one reading of a container's state and health every surface in this module draws
from, so a card and a dialog header cannot disagree about the same container.

## Contract

- `STATE_TONE[state] → tone` — the tone a container's state is drawn in, wherever it is drawn (dot,
  pill, accent edge, metric fill):

  | state | tone |
  | --- | --- |
  | `running` | success |
  | `paused`, `restarting` | warning |
  | `dead` | danger |
  | `created`, `exited`, `removing` | neutral |

- `readHealthOutcome(status) → { label, tone } | undefined` — the health outcome the daemon's own
  status sentence states, read from the container summary the list already carries and asking the
  daemon for nothing:

  ```
  status contains "(unhealthy)"        → UNHEALTHY, danger tone
  status contains "(healthy)"          → HEALTHY,   success tone
  status contains "(health: starting)" → STARTING,  warning tone
  otherwise                            → undefined
  ```

## Rules and invariants

- The reading is case-insensitive, and matches nothing else the daemon puts in parentheses: `(Paused)`
  and the exit code of `Exited (0) …` state no outcome and return `undefined`.
- **`undefined` means "the daemon states no outcome"** — a container declaring no health check, and
  equally one whose state has no outcome to report. A caller draws nothing at all for it, never a
  placeholder.
- **Both readings are total and pure**: every state has a tone, no call reads or writes anything, and
  neither issues a request.
- **It is the only place either rule is written.** A surface rendering a container's state or health
  takes it from here rather than declaring a map of its own; two maps is the divergence this rule
  exists to prevent.

## Requirements served

- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-7
- plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-9
