---
module: ui-library
component: DiffTreeView
type: UI component
---

# DiffTreeView

**Purpose** → the diff variant of `TreeView` (e.g. a cross-image filesystem comparison): nodes
carrying an added/removed/changed status, a directory's roll-up counts of its subtree shown when
collapsed, and a status filter row above the tree (REQ-63).

## Contract

- `<DiffTreeView rootNodes childrenById loadingIds? expandedIds onToggleExpand selectedId?
  onSelect? maxHeight? rowHeight? emptyState? statusFilter onStatusFilterChange />`
  - `DiffTreeNode`: `{ id, label, kind: 'file' | 'directory' | 'symlink', status?: 'added' |
    'removed' | 'changed', rollup?: { added, removed, changed } }` — `status` present only for a
    real added/removed/changed path; absent for a bare directory node shown only to carry a nested
    change; `rollup` present on a directory node (real or bare), the counts of added/removed/changed
    paths anywhere in its subtree.
  - `rootNodes: DiffTreeNode[]`, `childrenById: Map<string, DiffTreeNode[]>`, `loadingIds?`,
    `expandedIds`, `onToggleExpand`, `selectedId?`, `onSelect?`, `maxHeight?`, `rowHeight?`,
    `emptyState?` — same contract as `TreeView`'s own, since this component wraps it.
  - `statusFilter: 'all' | 'added' | 'removed' | 'changed'`, `onStatusFilterChange(filter)` — drive
    a `FilterChips` row above the tree.

## Rules and invariants

- A node's `status` renders as `TreeView`'s `statusById` accent (`added` → success, `removed` →
  danger, `changed` → warning); a directory's non-zero `rollup` counts render as trailing text
  (`"+<added> −<removed> ~<changed>"`, only the non-zero parts), same slot as `TreeView`'s `meta`.
- Filtering `rootNodes`/`childrenById` to the active `statusFilter` is the caller's responsibility:
  this component only renders the chips and reports the choice, since a lazily loaded tree cannot
  filter a level it has not fetched yet.

## Dependencies

- FilterChips, Stack, TreeView

## Requirements served

- plan-docker_management_app/REQ-63
