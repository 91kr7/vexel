import type { ReactNode } from 'react';
import { FilterChips } from '../controls/FilterChips';
import { Stack } from '../layout/Stack';
import { TreeView, type TreeEntryKind } from './TreeView';

export type DiffStatus = 'added' | 'removed' | 'changed';
export type DiffStatusFilter = 'all' | DiffStatus;

export interface DiffTreeNode {
  /** Stable identifier, unique across the whole tree (e.g. the full path). */
  id: string;
  label: string;
  kind: TreeEntryKind;
  /** Present only for a real added/removed/changed path; absent for a bare directory shown only to carry its descendants down to a change. */
  status?: DiffStatus;
  /** Counts of added/removed/changed paths anywhere in this directory's subtree, shown as trailing text when collapsed (REQ-63). */
  rollup?: { added: number; removed: number; changed: number };
}

export interface DiffTreeViewProps {
  rootNodes: DiffTreeNode[];
  childrenById: Map<string, DiffTreeNode[]>;
  loadingIds?: Set<string>;
  expandedIds: Set<string>;
  onToggleExpand: (node: DiffTreeNode) => void;
  selectedId?: string;
  onSelect?: (node: DiffTreeNode) => void;
  maxHeight?: string;
  rowHeight?: number;
  emptyState?: ReactNode;
  statusFilter: DiffStatusFilter;
  onStatusFilterChange: (filter: DiffStatusFilter) => void;
}

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'added', label: 'Added' },
  { id: 'removed', label: 'Removed' },
  { id: 'changed', label: 'Changed' },
];

const STATUS_TONE: Record<DiffStatus, 'success' | 'warning' | 'danger'> = { added: 'success', removed: 'danger', changed: 'warning' };

function rollupLabel(rollup?: { added: number; removed: number; changed: number }): string | undefined {
  if (!rollup) return undefined;
  const parts: string[] = [];
  if (rollup.added > 0) parts.push(`+${rollup.added}`);
  if (rollup.removed > 0) parts.push(`−${rollup.removed}`);
  if (rollup.changed > 0) parts.push(`~${rollup.changed}`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Diff variant of TreeView (REQ-63): nodes carrying an added/removed/changed
 * status (rendered as TreeView's own status accent) with a directory's
 * roll-up counts of its subtree shown as trailing text, and a status filter
 * row above the tree. Filtering `rootNodes`/`childrenById` to the active
 * status is the caller's responsibility — a lazily loaded tree cannot filter
 * levels it has not fetched yet.
 */
export function DiffTreeView({
  rootNodes,
  childrenById,
  loadingIds,
  expandedIds,
  onToggleExpand,
  selectedId,
  onSelect,
  maxHeight,
  rowHeight,
  emptyState,
  statusFilter,
  onStatusFilterChange,
}: DiffTreeViewProps) {
  const nodeById = new Map<string, DiffTreeNode>();
  for (const node of rootNodes) nodeById.set(node.id, node);
  for (const children of childrenById.values()) for (const node of children) nodeById.set(node.id, node);

  const statusById = new Map<string, 'success' | 'warning' | 'danger'>();
  for (const node of nodeById.values()) if (node.status) statusById.set(node.id, STATUS_TONE[node.status]);

  function toTreeNode(node: DiffTreeNode) {
    return { id: node.id, label: node.label, kind: node.kind, meta: rollupLabel(node.rollup) };
  }

  const treeChildrenById = new Map(Array.from(childrenById.entries()).map(([id, nodes]) => [id, nodes.map(toTreeNode)]));

  function findNode(id: string): DiffTreeNode | undefined {
    return nodeById.get(id);
  }

  return (
    <Stack gap="var(--space-3)">
      <FilterChips options={FILTER_OPTIONS} activeId={statusFilter} onSelect={(id) => onStatusFilterChange(id as DiffStatusFilter)} />
      <TreeView
        rootNodes={rootNodes.map(toTreeNode)}
        childrenById={treeChildrenById}
        loadingIds={loadingIds}
        expandedIds={expandedIds}
        onToggleExpand={(node) => {
          const found = findNode(node.id);
          if (found) onToggleExpand(found);
        }}
        selectedId={selectedId}
        onSelect={onSelect ? (node) => { const found = findNode(node.id); if (found) onSelect(found); } : undefined}
        maxHeight={maxHeight}
        rowHeight={rowHeight}
        emptyState={emptyState}
        statusById={statusById}
      />
    </Stack>
  );
}
