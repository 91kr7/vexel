---
module: swarm
component: SwarmScreen
type: UI component
---

# SwarmScreen

**Purpose** → the Swarm screen: the cluster's state with initialise / join / leave and its join
tokens, above the cluster's inventories — nodes, services & tasks, secrets, configs, stacks
(REQ-79 to REQ-84).

## Contract

Description:

- one column of full-width sections, one inventory per section, and **nothing laid out beside
  anything else**. Each section is its own section header (and toolbar, where it has one) over one
  unpadded card holding that inventory's list and nothing else. Above them, on a daemon that is in a
  swarm, the state bar. Every inventory is fed from the same reading of the cluster, so they never
  show two different moments of it.

Shows:

- **where there is no cluster to read, exactly one statement of why, on one surface** — the empty
  state, with the two actions that resolve it *inside* it:
  - outside a swarm: "This daemon is not part of a swarm", one line saying what each of the two ways
    in does and what appears once one is taken, and the actions `Initialise a swarm` and `Join an
    existing one`;
  - in a swarm but not on a manager (a worker, or a swarm that is pending, locked or errored): "No
    cluster to read from here" with the daemon's **own** reason where it gave one, and **no** action
    — nothing on this screen promotes a node;
  - before the first reading settles: "Reading the swarm state…", alone.
- the state bar, **only where there is a state to qualify** (in a swarm): a dot, the state in words
  ("Swarm active", or the daemon's own word for a pending, locked or errored swarm) and a monospace
  line of facts — on a manager the role, the cluster id, the node count and the raft health; on a
  worker, that it is a worker.
- the tone is green for a healthy swarm and amber for a degraded raft or a pending / locked /
  errored state.
- a failed read of the cluster (an unreachable daemon) as an error banner with a retry, above
  everything.
- on a manager, the five inventories in this order, each in a section of its own: Nodes, Services &
  tasks, Secrets, Configs, Stacks.

Actions:

- outside a swarm, from the empty state: "Initialise a swarm" → a form with an optional advertise
  address; "Join an existing one" → a form with the manager addresses, the join token (entered
  masked, never displayed back) and an optional advertise address.
- in a swarm, on a manager: "Join tokens" → a dialog showing the worker and manager tokens, each
  hidden until asked for and each rotatable on the spot; the tokens are read when the dialog opens
  and dropped when it closes. A token is taken by revealing it and selecting it — the only route
  since 2026-08-14, `plan-docker_management_app-remove_copy_controls`/REQ-21, which records that cost
  as accepted.
- in a swarm: "Leave swarm" → asks the confirmation service, naming the consequence (the node stops
  being part of the cluster; a last manager needs the forced leave, which the confirmation states).

Navigation:

- none: the screen owns its own objects.

## Rules and invariants

- **One fact is stated once** (plan-ui-coherence-optimisation/REQ-52). The condition of the swarm is
  stated in exactly one place at any moment: the state bar where there is a state to qualify, the
  empty state where there is not, never both. **No panel states it at all** — the panels are rendered
  only where there is a cluster to read, so a panel has nothing to explain and no reason to explain
  it. Measured on the delivered build, at all three viewports: **12 elements** said it (the bar's
  title and its facts, plus a title and a description in each of the **five** lists — the analysis
  counted five statements and the fifth list, stacks, made it six); after: **1**.
- **The actions that resolve the condition are inside the statement of it**
  (plan-ui-coherence-optimisation/REQ-53), not in a bar above it. Both perform exactly what they
  performed before: the same two forms, the same masked token field, the same confirmations.
- A join token is displayed only inside the token dialog, only after an explicit reveal, and is held
  nowhere once that dialog closes (REQ-80).
- The token typed to join a swarm is entered in a masked field with no reveal control and is dropped
  when the form closes.
- Every destructive action of the screen and of its panels goes through the application-wide
  confirmation service (REQ-6); every long operation through the progress service, every failure
  through the error reporter.
- **The screen offers no deploy affordance, no compose-file path input and no compose editor**
  (departure Three, REQ-83).
- A reading that states a reason of its own is never replaced by a generic one: the worker's
  explanation is the daemon's sentence where the daemon gave one.

## Decisions recorded

- **The two-by-two grid is deleted and the inventories are stacked, each at the content column's
  full width** (plan-ui-coherence-optimisation/REQ-55, REQ-23). Measured on the delivered build, a
  service's reveal inside the grid was **482px at 1440×1000, 362px at 1280×800 and 227px at
  375×812**, its property grid resolving **one column** at every one of them; stacked, the panel is
  **1012 / 852 / 229px** — the same figures volumes & networks, contexts, plugins and compose
  measured after their own pairs went. Side by side and a full-width reveal are incompatible, and
  this screen has a reveal in every one of its lists; `QuadPanelLayout` is what the screen used and
  it leaves the screen with the arrangement, its last call site in the client.
- **`Configs & stacks` becomes two cards, `Configs` and `Stacks`** (REQ-54). That card was the only
  one on the screen holding two inventories, so it had to label the first of them *inside its own
  body* — and that inner label, not a header sublabel, is what set its content **25.4px below** its
  neighbour `Secrets`' at 1440×1000 and 1280×800 on the delivered build. One card per inventory
  removes the cause rather than compensating for it: every card now carries one section header and
  starts its content **0px** under it, and every header is the same height (46px at both desktop
  widths). **No sublabel is supplied anywhere on this screen** — the arrangement that would have
  needed one is gone. `SectionHeader`'s same-baseline guarantee is unchanged and stays covered by its
  own unit test.
- **The state bar is not drawn outside a swarm.** It exists to qualify a state with facts; a daemon
  that is not in a swarm has none to qualify, and drawing it there is what made the condition's fifth
  and sixth statements. Nothing else about the bar changes.
- **Each list's page-level action sits in that list's own `ScreenToolbar`**, under that section's
  header rather than in it: `Create service`, `New secret`, `New config`. Three toolbars on one screen, for
  the reason batch 6 recorded when volumes & networks kept two — each action opens a dialog owned by
  its own panel, and lifting the three through the screen is a rewrite this migration does not need.
  Nodes and Stacks have no page-level action: a node is not created from here and a stack is never
  deployed from here.

## Dependencies

- ui-library: StateSummaryBar, EmptyState, Stack, Row, Button, FormDialog, FormField, TextField,
  SecretField, RevealableValue, ErrorBanner, SectionHeader
- swarm: useSwarm, SwarmNodesPanel, SwarmServicesPanel, SwarmSecretsPanel, SwarmConfigsStacksPanel
- app-shell: confirmation service, error reporting, progress, toasts

## Requirements served

- plan-docker_management_app/REQ-79
- plan-docker_management_app/REQ-80
- plan-docker_management_app/REQ-81
- plan-docker_management_app/REQ-82
- plan-docker_management_app/REQ-83
- plan-docker_management_app/REQ-84
- plan-ui-coherence-optimisation/REQ-52
- plan-ui-coherence-optimisation/REQ-53
- plan-ui-coherence-optimisation/REQ-54
- plan-ui-coherence-optimisation/REQ-55
