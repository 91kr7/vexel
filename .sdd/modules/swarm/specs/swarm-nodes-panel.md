---
module: swarm
component: SwarmNodesPanel
type: UI component
---

# SwarmNodesPanel

**Purpose** → the "Nodes" section of the Swarm screen: every node of the cluster with its role,
availability and status, and the changes an operator makes to one (REQ-81).

## Contract

- `<SwarmNodesPanel nodes onUpdate onRemove />`

Description:

- composed as containers and images are: the section header "Nodes" **above**, and then the object
  list (`DataTable`) alone in an **unpadded card it fills edge to edge**, at the content column's
  full width. The header is not on a surface: the panel's only surface is the list's own card. The
  selected node's detail is revealed below its row, inside the same table, in the detail panel, at
  that same width.

Shows:

- one row per node, managers first then in hostname order, with: the hostname (the node the
  application is talking to marked "this node"), the role as a badge reading "leader" on the leader
  and otherwise "manager" / "worker", the availability as a badge ("active" / "pause" / "drain"), the
  status as a dot and the daemon's own word, and the daemon's message about that node (`–` where
  there is none).
- for the opened node, in the detail panel: its id, hostname, address, engine version, platform,
  reachability, status with the daemon's message, and its labels — then the two controls that change
  it.
- with no node listed: the empty state's title, the reason the listing carries where it carries one,
  and no action — nothing here adds a node to a cluster.

Actions:

- selecting a row → reveals that node's detail panel; selecting it again, or `Escape`, closes it.
- "Role" (in the panel) → changes the node's role, applied immediately; a failure is reported and the
  row keeps the value the cluster still has.
- "Availability" (in the panel) → the same, for active / pause / drain.
- "Remove" (row) → asks the confirmation service, naming the node and the consequence; only then is
  the node removed. Removal is forced, since a node still reachable is refused otherwise, and the
  confirmation says so.

## Rules and invariants

- **The panel is drawn only where there is a cluster to read.** The screen states the condition of
  the swarm once, on one surface, and renders this panel on a manager alone
  (plan-ui-coherence-optimisation/REQ-52), so the panel carries no copy of it — the paragraph it used
  to repeat is gone, not moved.
- **The list is the containers list**, not merely table-like: one header row over a continuous run
  of rows, a single hairline between each pair, no gap between two rows and no surface, corner or
  outline of any row's own — and the **same row**, of the reference's own fixed height and vertical
  alignment, stating no row modifier of its own. There is no per-panel choice of presentation to be
  made here.
- Every cell of a row is a fixed number of lines whatever the node's state: the daemon's message
  about a node that is down shared a line with the status, the engine version and the address, and it
  is a column of its own here, so an unhealthy node's row is exactly as tall as a healthy one's — and
  that height is the reference's own, no cell asking for more room than the fixed-height row gives
  it. (The 59.39px recorded before this list became the one presentation was the retired
  presentation's row and is superseded by the reference's, whatever value that reads in the tree.)
- The engine version and the address are stated in the panel and not in the row: six columns and
  their gaps resolve to 808px of the 854px a 1280×800 surface offers, and a seventh would make every
  desktop width pan. The full value of anything the row omits or truncates is in the panel
  (plan-ui-coherence-optimisation/REQ-21).
- The panel never invents a value: role, availability and status are shown exactly as the daemon
  reports them.
- A node's row shows what the cluster currently holds; a change that failed leaves the previous value
  visible rather than an optimistic one.
- One detail is open at a time — the list's own guarantee, and `DetailPanel`'s across the interface,
  so opening a node closes whatever else on this screen was open.

## Dependencies

- ui-library: Card (unpadded, holding the list alone), SectionHeader, DataTable, DetailPanel,
  ActionButtonGroup, TwoLineCell, MetaCell, BadgeListCell, StatusDotCell, EmptyState, Select,
  FormField, Row, Stack
- swarm: Swarm formatting
- app-shell: confirmation service, error reporting, progress

## Requirements served

- plan-docker_management_app/REQ-81
- plan-ui-coherence-optimisation/REQ-52
- plan-ui-coherence-optimisation/REQ-55
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-20
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-39
- plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40
