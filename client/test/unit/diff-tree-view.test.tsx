import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiffTreeView, type DiffTreeNode } from '../../src/ui';

afterEach(cleanup);

function node(overrides: Partial<DiffTreeNode> = {}): DiffTreeNode {
  return { id: 'root', label: 'root', kind: 'file', ...overrides };
}

describe('DiffTreeView (plan-docker_management_app/REQ-63)', () => {
  // diff-tree-view.md — a node's status renders as TreeView's own status accent (added -> success, removed -> danger, changed -> warning)
  it('renders the success/danger/warning status accent matching each node\'s added/removed/changed status', () => {
    const nodes = [
      node({ id: 'added.txt', label: 'added.txt', status: 'added' }),
      node({ id: 'removed.txt', label: 'removed.txt', status: 'removed' }),
      node({ id: 'changed.txt', label: 'changed.txt', status: 'changed' }),
    ];
    render(
      <DiffTreeView
        rootNodes={nodes}
        childrenById={new Map()}
        expandedIds={new Set()}
        onToggleExpand={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
      />,
    );

    expect(document.querySelector('.ui-tree-view__status--tone-success')).not.toBeNull();
    expect(document.querySelector('.ui-tree-view__status--tone-danger')).not.toBeNull();
    expect(document.querySelector('.ui-tree-view__status--tone-warning')).not.toBeNull();
  });

  // diff-tree-view.md — a bare directory node (no status) renders no accent at all
  it('renders no status accent for a bare directory node carrying no status of its own', () => {
    render(
      <DiffTreeView
        rootNodes={[node({ id: 'nested', label: 'nested', kind: 'directory' })]}
        childrenById={new Map()}
        expandedIds={new Set()}
        onToggleExpand={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
      />,
    );

    expect(document.querySelector('[class*="ui-tree-view__status--tone-"]')).toBeNull();
  });

  // diff-tree-view.md — a directory's non-zero roll-up counts render as trailing text, only the non-zero parts
  it('renders only the non-zero parts of a roll-up as trailing text', () => {
    render(
      <DiffTreeView
        rootNodes={[node({ id: 'nested', label: 'nested', kind: 'directory', rollup: { added: 2, removed: 0, changed: 1 } })]}
        childrenById={new Map()}
        expandedIds={new Set()}
        onToggleExpand={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
      />,
    );

    expect(screen.getByText('+2 ~1')).toBeInTheDocument();
  });

  // diff-tree-view.md — a directory with an all-zero roll-up renders no trailing text at all
  it('renders no trailing text for an all-zero roll-up', () => {
    render(
      <DiffTreeView
        rootNodes={[node({ id: 'nested', label: 'nested', kind: 'directory', rollup: { added: 0, removed: 0, changed: 0 } })]}
        childrenById={new Map()}
        expandedIds={new Set()}
        onToggleExpand={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
      />,
    );

    expect(document.querySelector('.ui-tree-view__meta')).toBeNull();
  });

  // diff-tree-view.md — filtering rootNodes/childrenById is the caller's responsibility: the component only renders the chips and reports the choice
  it('renders every root node unfiltered regardless of the active statusFilter, leaving filtering to the caller', () => {
    const nodes = [node({ id: 'added.txt', label: 'added.txt', status: 'added' }), node({ id: 'removed.txt', label: 'removed.txt', status: 'removed' })];
    render(
      <DiffTreeView
        rootNodes={nodes}
        childrenById={new Map()}
        expandedIds={new Set()}
        onToggleExpand={vi.fn()}
        statusFilter="added"
        onStatusFilterChange={vi.fn()}
      />,
    );

    expect(screen.getByText('added.txt')).toBeInTheDocument();
    expect(screen.getByText('removed.txt')).toBeInTheDocument();
  });

  // diff-tree-view.md — a FilterChips row above the tree drives statusFilter/onStatusFilterChange
  it('calls onStatusFilterChange with the chosen filter when a status chip is clicked', async () => {
    const onStatusFilterChange = vi.fn();
    render(
      <DiffTreeView
        rootNodes={[]}
        childrenById={new Map()}
        expandedIds={new Set()}
        onToggleExpand={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={onStatusFilterChange}
        emptyState={<span>Nothing here</span>}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Changed' }));

    expect(onStatusFilterChange).toHaveBeenCalledWith('changed');
  });
});
