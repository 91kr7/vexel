---
module: swarm
component: SwarmScreen
type: UI component
---

# SwarmScreen

**Purpose** → the Swarm screen: the cluster's state with initialise / join / leave and its join
tokens, above the four panels of the mockup — nodes, services & tasks, secrets, configs & stacks
(REQ-79 to REQ-84).

## Contract

Description:
- a state bar across the top, then the four panels in a two-by-two grid, exactly as drawn in the
  mockup. Every panel is fed from the same reading of the cluster, so they never show two different
  moments of it.

Shows:
- the state bar: a dot, the state in words ("Swarm active", "Swarm inactive", or the daemon's own
  word for a pending, locked or errored swarm) and a monospace line of facts —
  - on a manager: the role, the cluster id, the node count and the raft health;
  - on a worker: that it is a worker and that only a manager reads the cluster;
  - outside a swarm: that this daemon is not part of one.
- the tone is green for a healthy swarm, amber for a degraded raft or a pending/locked/errored
  state, and neutral when the daemon is not in a swarm.
- a failed read of the cluster (an unreachable daemon) as an error banner with a retry, above the
  panels.
- the four panels: Nodes, Services & tasks, Secrets, Configs & stacks.

Actions:
- outside a swarm: "Initialise swarm" → a form with an optional advertise address; and "Join swarm"
  → a form with the manager addresses, the join token (entered masked, never displayed back) and an
  optional advertise address.
- in a swarm, on a manager: "Join tokens" → a dialog showing the worker and manager tokens, each
  hidden until asked for and each rotatable on the spot; the tokens are read when the dialog opens
  and dropped when it closes. A token is taken by revealing it and selecting it — the only route
  since 2026-08-14, `plan-docker_management_app-remove_copy_controls`/REQ-21, which records that cost
  as accepted.
- in a swarm: "Leave swarm" → asks the confirmation service, naming the consequence (the node stops
  being part of the cluster; a last manager needs the forced leave, which the confirmation states).
- the token action is offered on a manager only; a worker sees state, leave, and the stated reason
  in every panel.

Navigation:
- none: the screen owns its own objects.

## Rules and invariants

- **The screen never shows an empty panel or an unhandled error when the daemon is not a swarm
  manager** — the state bar says what the daemon is and offers the way in, and every panel carries
  the reason it has nothing to list. This is the common case, not the exception.
- A join token is displayed only inside the token dialog, only after an explicit reveal, and is held
  nowhere once that dialog closes (REQ-80).
- The token typed to join a swarm is entered in a masked field with no reveal control and is dropped
  when the form closes.
- Every destructive action of the screen and of its panels goes through the application-wide
  confirmation service (REQ-6); every long operation through the progress service, every failure
  through the error reporter.
- **The screen offers no deploy affordance, no compose-file path input and no compose editor**
  (departure Three, REQ-83).

## Dependencies

- ui-library: StateSummaryBar, QuadPanelLayout, Stack, Row, Button, FormDialog, FormField,
  TextField, SecretField, RevealableValue, ErrorBanner, SectionHeader
- swarm: useSwarm, SwarmNodesPanel, SwarmServicesPanel, SwarmSecretsPanel, SwarmConfigsStacksPanel
- app-shell: confirmation service, error reporting, progress, toasts

## Requirements served

- plan-docker_management_app/REQ-79
- plan-docker_management_app/REQ-80
- plan-docker_management_app/REQ-81
- plan-docker_management_app/REQ-82
- plan-docker_management_app/REQ-83
- plan-docker_management_app/REQ-84
