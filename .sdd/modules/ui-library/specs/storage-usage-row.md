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

## Requirements served

- plan-docker_management_app/REQ-95
- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-115
