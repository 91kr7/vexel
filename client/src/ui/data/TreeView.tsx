import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type UIEvent } from 'react';
import { ScrollArea } from '../glass/ScrollArea';
import { Spinner } from '../feedback/Spinner';
import './tree-view.css';

export type TreeEntryKind = 'file' | 'directory' | 'symlink';

export interface TreeNode {
  /** Stable identifier, unique across the whole tree (e.g. the full path). */
  id: string;
  label: string;
  kind: TreeEntryKind;
  /** Trailing text next to the label (e.g. a formatted size). */
  meta?: string;
}

export interface TreeViewProps {
  /** Top-level nodes, already loaded. */
  rootNodes: TreeNode[];
  /** A directory's loaded children, keyed by its id; absent means not requested yet. */
  childrenById: Map<string, TreeNode[]>;
  /** Directory ids currently being loaded; rendered with a loading row under the parent. */
  loadingIds?: Set<string>;
  expandedIds: Set<string>;
  /** Called when a directory's caret is activated (click, Enter, ArrowRight/ArrowLeft); the caller owns expansion state and lazy loading. */
  onToggleExpand: (node: TreeNode) => void;
  selectedId?: string;
  onSelect?: (node: TreeNode) => void;
  /** Caps the tree's height and enables virtualised scrolling; unset renders every visible row. */
  maxHeight?: string;
  /**
   * Takes the height of the region the tree is placed in instead of a stated
   * maximum, with virtualisation working exactly as it does under `maxHeight`:
   * the window is measured from the scroll container itself, so it follows the
   * region as the region follows the screen.
   */
  fill?: boolean;
  /** Fixed row height in px (default 32). */
  rowHeight?: number;
  emptyState?: ReactNode;
  /** Ids marked as matching an in-progress search (REQ-60): their row is highlighted in place, distinct from the selected row. */
  matchedIds?: Set<string>;
  /** A node's status accent (e.g. a diff's added/changed/removed), rendered as a small colored dot before its glyph; a node with no entry here renders no accent (REQ-63). */
  statusById?: Map<string, 'success' | 'warning' | 'danger'>;
}

type FlatRow = { key: string; depth: number } & ({ type: 'node'; node: TreeNode } | { type: 'loading' });

const OVERSCAN_ROWS = 8;

function flatten(
  nodes: TreeNode[],
  depth: number,
  expandedIds: Set<string>,
  childrenById: Map<string, TreeNode[]>,
  loadingIds: Set<string>,
  rows: FlatRow[],
): void {
  for (const node of nodes) {
    rows.push({ key: node.id, depth, type: 'node', node });
    if (node.kind !== 'directory' || !expandedIds.has(node.id)) continue;
    const children = childrenById.get(node.id);
    if (children) flatten(children, depth + 1, expandedIds, childrenById, loadingIds, rows);
    else if (loadingIds.has(node.id)) rows.push({ key: `${node.id}::loading`, depth: depth + 1, type: 'loading' });
  }
}

/**
 * Virtualised, expandable/collapsible tree (REQ-52): one row per node, with
 * entry-type glyphs (file, directory, symlink), single selection and keyboard
 * navigation. A directory's children are read from `childrenById`, supplied
 * by the caller on demand (`onToggleExpand`) — the tree never fetches
 * anything itself, so any subtree can be loaded lazily.
 */
export function TreeView({
  rootNodes,
  childrenById,
  loadingIds = EMPTY_SET,
  expandedIds,
  onToggleExpand,
  selectedId,
  onSelect,
  maxHeight,
  fill = false,
  rowHeight = 32,
  emptyState,
  matchedIds = EMPTY_SET,
  statusById = EMPTY_STATUS,
}: TreeViewProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** The selection whose reveal has already been performed, so no later render repeats it. */
  const revealedSelectionRef = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    if (scrollRef.current) setViewportHeight(scrollRef.current.clientHeight);
  }, [maxHeight, fill, rootNodes.length]);

  // In the region-bounded mode the scrollport's height is whatever the region
  // currently offers, so it is observed rather than measured once: a screen that
  // grows must mount the rows it has just made room for. (jsdom provides no
  // ResizeObserver; there is no layout to observe there either.)
  useEffect(() => {
    const element = scrollRef.current;
    if (!fill || !element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [fill]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    setScrollTop(event.currentTarget.scrollTop);
  }

  const rows: FlatRow[] = [];
  flatten(rootNodes, 0, expandedIds, childrenById, loadingIds, rows);

  const virtualized = Boolean(maxHeight) || fill;
  const startIndex = virtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS) : 0;
  const endIndex = virtualized ? Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS) : rows.length;
  const visibleRows = rows.slice(startIndex, endIndex);
  const topSpacerHeight = virtualized ? startIndex * rowHeight : 0;
  const bottomSpacerHeight = virtualized ? (rows.length - endIndex) * rowHeight : 0;

  // A selection or a search hit is brought into **this** container's window, and
  // into no other: the row a search jumped to is otherwise not mounted at all
  // while the tree is virtualised, and letting the browser reveal it would
  // scroll every ancestor — the dialog included. Only a row out of the window
  // moves the scroll position, and only ever the row that has just been
  // selected.
  //
  // Once per change of selection, which is what the ref is for rather than a
  // dependency list. Keyed on the row count instead, the reveal fired on every
  // expansion, every collapse and every completed lazy load: an operator who
  // scrolled away from an earlier selection to reach a directory, and expanded
  // it, was carried back to that selection — with the directory whose children
  // they had just asked for taken off the screen. A reveal that is still pending
  // (a search hit whose ancestor directories are still loading, so the row it
  // named does not exist yet) stays pending, and is completed by the load that
  // brings the row in.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!fill || !element) return;
    if (selectedId === undefined) {
      revealedSelectionRef.current = undefined;
      return;
    }
    if (revealedSelectionRef.current === selectedId) return;
    const index = rows.findIndex((row) => row.type === 'node' && row.node.id === selectedId);
    if (index === -1) return;
    revealedSelectionRef.current = selectedId;
    const top = index * rowHeight;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + rowHeight > element.scrollTop + element.clientHeight) element.scrollTop = top + rowHeight - element.clientHeight;
  });

  function selectableIndex(fromIndex: number, direction: 1 | -1): number {
    let index = fromIndex;
    while (index >= 0 && index < rows.length) {
      const row = rows[index];
      if (row.type === 'node') return index;
      index += direction;
    }
    return -1;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = rows.findIndex((row) => row.type === 'node' && row.node.id === selectedId);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = selectableIndex(currentIndex === -1 ? 0 : currentIndex + 1, 1);
      if (nextIndex !== -1) selectRow(rows[nextIndex]);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = selectableIndex(currentIndex === -1 ? rows.length - 1 : currentIndex - 1, -1);
      if (nextIndex !== -1) selectRow(rows[nextIndex]);
      return;
    }
    if (currentIndex === -1) return;
    const current = rows[currentIndex];
    if (current.type !== 'node') return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (current.node.kind === 'directory' && !expandedIds.has(current.node.id)) onToggleExpand(current.node);
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (current.node.kind === 'directory' && expandedIds.has(current.node.id)) onToggleExpand(current.node);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (current.node.kind === 'directory') onToggleExpand(current.node);
      onSelect?.(current.node);
    }
  }

  function selectRow(row: FlatRow) {
    if (row.type === 'node') onSelect?.(row.node);
  }

  if (rootNodes.length === 0) return <div className="ui-tree-view__empty">{emptyState}</div>;

  return (
    <div className={fill ? 'ui-tree-view ui-tree-view--fill' : 'ui-tree-view'} role="tree" tabIndex={0} onKeyDown={handleKeyDown}>
      <ScrollArea ref={scrollRef} maxHeight={maxHeight} onScroll={handleScroll}>
        <div className="ui-tree-view__body">
          {topSpacerHeight > 0 ? <div style={{ height: topSpacerHeight }} /> : null}
          {visibleRows.map((row) => {
            const rowStyle: CSSProperties = { height: rowHeight, paddingLeft: `calc(var(--space-4) + ${row.depth} * var(--space-5))` };
            if (row.type === 'loading') {
              return (
                <div key={row.key} className="ui-tree-view__row ui-tree-view__row--loading" style={rowStyle}>
                  <Spinner label="Loading entries" />
                </div>
              );
            }
            const { node } = row;
            const selected = node.id === selectedId;
            const matched = matchedIds.has(node.id);
            const expandable = node.kind === 'directory';
            const expanded = expandable && expandedIds.has(node.id);
            const rowClassName = ['ui-tree-view__row', selected && 'ui-tree-view__row--selected', matched && 'ui-tree-view__row--matched']
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={row.key}
                role="treeitem"
                aria-selected={selected}
                aria-expanded={expandable ? expanded : undefined}
                className={rowClassName}
                style={rowStyle}
                onClick={() => onSelect?.(node)}
              >
                <span
                  className={expandable ? 'ui-tree-view__caret ui-tree-view__caret--expandable' : 'ui-tree-view__caret'}
                  onClick={
                    expandable
                      ? (event) => {
                          event.stopPropagation();
                          onToggleExpand(node);
                        }
                      : undefined
                  }
                >
                  {expandable ? (expanded ? '▾' : '▸') : ''}
                </span>
                <span className={`ui-tree-view__glyph ui-tree-view__glyph--${node.kind}`} />
                {statusById.has(node.id) ? <span className={`ui-tree-view__status ui-tree-view__status--tone-${statusById.get(node.id)}`} /> : null}
                <span className="ui-tree-view__label">{node.label}</span>
                {node.meta ? <span className="ui-tree-view__meta">{node.meta}</span> : null}
              </div>
            );
          })}
          {bottomSpacerHeight > 0 ? <div style={{ height: bottomSpacerHeight }} /> : null}
        </div>
      </ScrollArea>
    </div>
  );
}

const EMPTY_SET: Set<string> = new Set();
const EMPTY_STATUS: Map<string, 'success' | 'warning' | 'danger'> = new Map();
