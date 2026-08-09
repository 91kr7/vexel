---
module: swarm
component: SwarmNodesPanel
type: UI component
---

# SwarmNodesPanel

**Purpose** → the "Nodes" panel of the Swarm screen: every node of the cluster with its hostname,
role, availability and status, and the changes an operator makes to one (REQ-81).

## Contract

Description:
- one card titled "Nodes" holding one row per node, as drawn in the mockup: a state dot, the
  hostname, then the role as a badge and the availability as a quiet reading; selecting a row
  expands the controls for that node inside the same card.

Shows:
- per node: a dot coloured by its status, the hostname (the node the application is talking to
  marked "this node"), and a monospace line with its status (plus the daemon's message when there is
  one), its engine version and its address.
- the role badge reads "leader" on the leader, otherwise "manager" or "worker".
- the availability reads "active", "pause" or "drain".
- with nothing to show: the reason the listing carries — a daemon outside a swarm says so and says
  what to do about it — or "No nodes" on a manager with an empty cluster, or "Reading nodes…" before
  the first read settles.

Actions:
- selecting a row → expands it; selecting it again → collapses it.
- in the expansion, "Role" → changes the node's role, applied immediately; a failure is reported and
  the row keeps the value the cluster still has.
- in the expansion, "Availability" → same, for active / pause / drain.
- "Remove node" → asks the confirmation service, naming the node and the consequence; only then is
  the node removed. Removal is forced, since a node still reachable is refused otherwise, and the
  confirmation says so.
- every action is absent (or inert) when the daemon is not a manager.

## Rules and invariants

- The panel never invents a value: role, availability and status are shown exactly as the daemon
  reports them.
- A node's own row shows what the cluster currently holds; a change that failed leaves the previous
  value visible rather than an optimistic one.
- The panel states the reason it is empty instead of showing an empty list (the non-manager case is
  the common one).

## Dependencies

- ui-library: Card, SectionHeader, CardList, Badge, Row, Select, FormField, ActionButtonGroup,
  EmptyState, ErrorBanner, DefinitionList
- swarm: Swarm formatting
- app-shell: confirmation service, error reporting, progress

## Requirements served

- plan-docker_management_app/REQ-81
