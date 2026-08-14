---
module: ui-library
component: StorageUsageRow
type: UI component
---

# StorageUsageRow

**Purpose** → one row of a "reclaim disk space" style listing: a label, an optional description, a
right-aligned size, and an optional clear/prune action (REQ-95, REQ-113, REQ-115).

## Contract

- `<StorageUsageRow label description? sizeLabel action? />`
  - `label` — bold title (e.g. "Analysis cache", "Stopped containers").
  - `description?` — one line under the label, muted tone: what the row's figure covers.
  - `sizeLabel` — pre-formatted size text (e.g. `"2.1GB"`, or `"—"` when unknown), right-aligned,
    monospace.
  - `action?: { label, onClick, disabled?, destructive? }` — renders a trailing `Button`:
    destructive variant when `destructive`, secondary otherwise.

## Rules and invariants

- A row whose action removes what the row counts asks for `destructive`, so the red marking of a
  destructive action is the same one the whole application uses.
- **The row honors the truncation contract** (`truncation-contract.md`): the `description` — which
  on the "unused volumes" row is a list of 64-character volume names — shrinks and truncates with
  an ellipsis, while `sizeLabel` and the action keep their width. The description's box never
  intersects either of them, and the action stays whole and hit-testable at its own centre.
- **The `label` is outside the contract, deliberately**: it is a fixed caption in the product's own
  wording, not a machine value, so it wraps rather than losing characters. Only the description
  below it truncates.
- **When the row cannot hold all three, the size and the action take a line of their own** under
  the text. That is what happens at 375×812, where this listing's card is ~116px wide.

## Dependencies

- Button, Truncation contract

## Requirements served

- plan-docker_management_app/REQ-95
- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-115
- plan-ui-coherence-optimisation/REQ-17
- plan-ui-coherence-optimisation/REQ-18
- plan-ui-coherence-optimisation/REQ-19
