---
module: ui-library
component: StorageUsageRow
type: UI component
---

# StorageUsageRow

**Purpose** → one row of a "reclaim disk space" style listing: a label, an optional description, a
right-aligned size, and an optional clear/prune action (REQ-113, REQ-115).

## Contract

- `<StorageUsageRow label description? sizeLabel action? />`
  - `label` — bold title (e.g. "Analysis cache").
  - `description?` — one line under the label, muted tone.
  - `sizeLabel` — pre-formatted size text (e.g. `"2.1GB"`), right-aligned, monospace.
  - `action?: { label, onClick, disabled? }` — renders a trailing `Button` (secondary variant).

## Requirements served

- plan-docker_management_app/REQ-113
- plan-docker_management_app/REQ-115
