import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TreeView, type TreeNode } from '../../src/ui';

afterEach(cleanup);

function node(overrides: Partial<TreeNode> = {}): TreeNode {
  return { id: 'root', label: 'root', kind: 'directory', ...overrides };
}

describe('TreeView (plan-docker_management_app/REQ-52)', () => {
  // ui-library/specs/tree-view.md — a directory not present in expandedIds shows no children rows
  it('shows no children for a collapsed directory even when children are already loaded', () => {
    const dir = node({ id: 'dir', label: 'dir' });
    render(
      <TreeView
        rootNodes={[dir]}
        childrenById={new Map([['dir', [node({ id: 'dir/a.txt', label: 'a.txt', kind: 'file' })]]])}
        expandedIds={new Set()}
        onToggleExpand={vi.fn()}
      />,
    );

    expect(screen.getByText('dir')).toBeInTheDocument();
    expect(screen.queryByText('a.txt')).not.toBeInTheDocument();
  });

  // ui-library/specs/tree-view.md — an expanded directory's visible children are exactly childrenById.get(node.id)
  it('shows a directory\'s loaded children once it is expanded', () => {
    const dir = node({ id: 'dir', label: 'dir' });
    render(
      <TreeView
        rootNodes={[dir]}
        childrenById={new Map([['dir', [node({ id: 'dir/a.txt', label: 'a.txt', kind: 'file' })]]])}
        expandedIds={new Set(['dir'])}
        onToggleExpand={vi.fn()}
      />,
    );

    expect(screen.getByText('a.txt')).toBeInTheDocument();
  });

  // ui-library/specs/tree-view.md — an expanded directory not yet loaded (absent from childrenById) shows a loading row when in loadingIds
  it('shows a loading row under an expanded directory whose children are not loaded yet', () => {
    const dir = node({ id: 'dir', label: 'dir' });
    render(
      <TreeView
        rootNodes={[dir]}
        childrenById={new Map()}
        loadingIds={new Set(['dir'])}
        expandedIds={new Set(['dir'])}
        onToggleExpand={vi.fn()}
      />,
    );

    expect(document.querySelector('.ui-tree-view__row--loading')).not.toBeNull();
  });

  // ui-library/specs/tree-view.md — a file or symlink is never expandable: no caret
  it('renders no expand caret for a file or a symlink', () => {
    render(
      <TreeView
        rootNodes={[node({ id: 'file.txt', label: 'file.txt', kind: 'file' }), node({ id: 'link', label: 'link', kind: 'symlink' })]}
        childrenById={new Map()}
        expandedIds={new Set()}
        onToggleExpand={vi.fn()}
      />,
    );

    expect(document.querySelectorAll('.ui-tree-view__caret--expandable')).toHaveLength(0);
  });

  // ui-library/specs/tree-view.md — clicking a directory's caret calls onToggleExpand for that node, letting the caller trigger a lazy load
  it('calls onToggleExpand when a directory caret is clicked', async () => {
    const onToggleExpand = vi.fn();
    const dir = node({ id: 'dir', label: 'dir' });
    render(<TreeView rootNodes={[dir]} childrenById={new Map()} expandedIds={new Set()} onToggleExpand={onToggleExpand} />);

    await userEvent.click(document.querySelector('.ui-tree-view__caret--expandable')!);

    expect(onToggleExpand).toHaveBeenCalledWith(dir);
  });

  // ui-library/specs/tree-view.md — clicking a row (or Enter/Space on the focused row) calls onSelect
  it('calls onSelect when a row is clicked', async () => {
    const onSelect = vi.fn();
    const file = node({ id: 'file.txt', label: 'file.txt', kind: 'file' });
    render(<TreeView rootNodes={[file]} childrenById={new Map()} expandedIds={new Set()} onToggleExpand={vi.fn()} onSelect={onSelect} />);

    await userEvent.click(screen.getByText('file.txt'));

    expect(onSelect).toHaveBeenCalledWith(file);
  });

  // ui-library/specs/tree-view.md — ArrowDown moves selection to the next visible row
  it('moves the selection to the next row with ArrowDown', () => {
    const onSelect = vi.fn();
    const nodes = [node({ id: 'a', label: 'a', kind: 'file' }), node({ id: 'b', label: 'b', kind: 'file' })];
    render(
      <TreeView rootNodes={nodes} childrenById={new Map()} expandedIds={new Set()} onToggleExpand={vi.fn()} selectedId="a" onSelect={onSelect} />,
    );

    fireEvent.keyDown(document.querySelector('.ui-tree-view')!, { key: 'ArrowDown' });

    expect(onSelect).toHaveBeenCalledWith(nodes[1]);
  });

  // ui-library/specs/tree-view.md — ArrowUp moves selection to the previous visible row
  it('moves the selection to the previous row with ArrowUp', () => {
    const onSelect = vi.fn();
    const nodes = [node({ id: 'a', label: 'a', kind: 'file' }), node({ id: 'b', label: 'b', kind: 'file' })];
    render(
      <TreeView rootNodes={nodes} childrenById={new Map()} expandedIds={new Set()} onToggleExpand={vi.fn()} selectedId="b" onSelect={onSelect} />,
    );

    fireEvent.keyDown(document.querySelector('.ui-tree-view')!, { key: 'ArrowUp' });

    expect(onSelect).toHaveBeenCalledWith(nodes[0]);
  });

  // ui-library/specs/tree-view.md — ArrowRight expands a collapsed selected directory
  it('expands the selected directory with ArrowRight', () => {
    const onToggleExpand = vi.fn();
    const dir = node({ id: 'dir', label: 'dir' });
    render(
      <TreeView rootNodes={[dir]} childrenById={new Map()} expandedIds={new Set()} onToggleExpand={onToggleExpand} selectedId="dir" />,
    );

    fireEvent.keyDown(document.querySelector('.ui-tree-view')!, { key: 'ArrowRight' });

    expect(onToggleExpand).toHaveBeenCalledWith(dir);
  });

  // ui-library/specs/tree-view.md — ArrowLeft collapses an expanded selected directory
  it('collapses the selected directory with ArrowLeft', () => {
    const onToggleExpand = vi.fn();
    const dir = node({ id: 'dir', label: 'dir' });
    render(
      <TreeView
        rootNodes={[dir]}
        childrenById={new Map()}
        expandedIds={new Set(['dir'])}
        onToggleExpand={onToggleExpand}
        selectedId="dir"
      />,
    );

    fireEvent.keyDown(document.querySelector('.ui-tree-view')!, { key: 'ArrowLeft' });

    expect(onToggleExpand).toHaveBeenCalledWith(dir);
  });

  // ui-library/specs/tree-view.md — Enter/Space selects the focused row and, for a directory, also toggles its expansion
  it('toggles expansion and selects on Enter for a directory row', () => {
    const onSelect = vi.fn();
    const onToggleExpand = vi.fn();
    const dir = node({ id: 'dir', label: 'dir' });
    render(
      <TreeView
        rootNodes={[dir]}
        childrenById={new Map()}
        expandedIds={new Set()}
        onToggleExpand={onToggleExpand}
        selectedId="dir"
        onSelect={onSelect}
      />,
    );

    fireEvent.keyDown(document.querySelector('.ui-tree-view')!, { key: 'Enter' });

    expect(onToggleExpand).toHaveBeenCalledWith(dir);
    expect(onSelect).toHaveBeenCalledWith(dir);
  });

  // ui-library/specs/tree-view.md — emptyState is shown instead of the tree when rootNodes is empty
  it('shows the empty state instead of the tree when there are no root nodes', () => {
    render(
      <TreeView rootNodes={[]} childrenById={new Map()} expandedIds={new Set()} onToggleExpand={vi.fn()} emptyState={<span>Nothing here</span>} />,
    );

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(document.querySelector('.ui-tree-view')).not.toBeInTheDocument();
  });

  // ui-library/specs/tree-view.md — maxHeight enables virtualised scrolling so only rows in and around the visible window are mounted
  it('mounts only a window of rows around the visible area when maxHeight is set', () => {
    const nodes = Array.from({ length: 200 }, (_, index) => node({ id: `n-${index}`, label: `n-${index}`, kind: 'file' }));
    render(<TreeView rootNodes={nodes} childrenById={new Map()} expandedIds={new Set()} onToggleExpand={vi.fn()} maxHeight="300px" />);

    const mountedCount = screen.getAllByText(/^n-\d+$/).length;
    expect(mountedCount).toBeLessThan(200);
    expect(screen.getByText('n-0')).toBeInTheDocument();
    expect(screen.queryByText('n-199')).not.toBeInTheDocument();
  });

  // ui-library/specs/tree-view.md — unset renders every visible row (no virtualisation)
  it('mounts every row when maxHeight is not set', () => {
    const nodes = Array.from({ length: 200 }, (_, index) => node({ id: `n-${index}`, label: `n-${index}`, kind: 'file' }));
    render(<TreeView rootNodes={nodes} childrenById={new Map()} expandedIds={new Set()} onToggleExpand={vi.fn()} />);

    expect(screen.getAllByText(/^n-\d+$/)).toHaveLength(200);
  });

  // ui-library/specs/tree-view.md (plan-docker_management_app/REQ-63) — statusById renders a small
  // colored dot, before the glyph, for a node present in the map
  it('renders a status accent for a node present in statusById', () => {
    const withStatus = node({ id: 'changed.txt', label: 'changed.txt', kind: 'file' });
    render(
      <TreeView
        rootNodes={[withStatus]}
        childrenById={new Map()}
        expandedIds={new Set()}
        onToggleExpand={vi.fn()}
        statusById={new Map([['changed.txt', 'warning']])}
      />,
    );

    expect(document.querySelector('.ui-tree-view__status--tone-warning')).not.toBeNull();
  });

  // ui-library/specs/tree-view.md (plan-docker_management_app/REQ-63) — a node absent from statusById renders no accent at all
  it('renders no status accent for a node absent from statusById', () => {
    const withStatus = node({ id: 'changed.txt', label: 'changed.txt', kind: 'file' });
    const withoutStatus = node({ id: 'plain.txt', label: 'plain.txt', kind: 'file' });
    render(
      <TreeView
        rootNodes={[withStatus, withoutStatus]}
        childrenById={new Map()}
        expandedIds={new Set()}
        onToggleExpand={vi.fn()}
        statusById={new Map([['changed.txt', 'danger']])}
      />,
    );

    expect(document.querySelectorAll('[class*="ui-tree-view__status--tone-"]')).toHaveLength(1);
  });
});
