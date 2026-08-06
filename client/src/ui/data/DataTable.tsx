import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type UIEvent } from 'react';
import { ScrollArea } from '../glass/ScrollArea';
import './data-table.css';

export interface DataTableColumn<T> {
  id: string;
  header: string;
  /** `grid-template-columns` track for this column (default `1fr`). */
  width?: string;
  align?: 'start' | 'end';
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Fixed row height in px; every row is this tall (dense rows). Default 56. */
  rowHeight?: number;
  /** Caps the table body height and enables virtualised scrolling; unset renders every row. */
  maxHeight?: string;
  selectedRowKey?: string;
  onRowSelect?: (row: T) => void;
  emptyState?: ReactNode;
  /** Content rendered in normal flow directly below the row whose key matches `expandedRowKey`. */
  expandedRowKey?: string;
  renderExpanded?: (row: T) => ReactNode;
}

const OVERSCAN_ROWS = 6;

/**
 * Dense data table with column definitions, hover/selected row states, and
 * virtualised scrolling when `maxHeight` is set (REQ-109): only the rows in
 * and around the visible window are mounted. When `expandedRowKey` matches a
 * mounted row, `renderExpanded` content is inserted in normal flow directly
 * below that row, pushing the rows after it down. The row matching
 * `expandedRowKey` is always kept mounted regardless of scroll position, so
 * its expanded content never loses its component instance (and thus its
 * internal state) while scrolling.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHeight = 56,
  maxHeight,
  selectedRowKey,
  onRowSelect,
  emptyState,
  expandedRowKey,
  renderExpanded,
}: DataTableProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (scrollRef.current) setViewportHeight(scrollRef.current.clientHeight);
  }, [maxHeight, rows.length]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    setScrollTop(event.currentTarget.scrollTop);
  }

  const gridTemplateColumns = columns.map((column) => column.width ?? '1fr').join(' ');
  const headerRowStyle: CSSProperties = { gridTemplateColumns };

  const virtualized = Boolean(maxHeight);
  let startIndex = virtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS) : 0;
  let endIndex = virtualized
    ? Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS)
    : rows.length;
  // The expanded row's actual height diverges from `rowHeight` (its
  // `renderExpanded` content can be much taller), so the naive scrollTop-based
  // window can compute it as out of view while it is still visible on screen.
  // Widening the window to always include it keeps it mounted and prevents
  // its component instance (and thus its internal state) from being reset.
  if (virtualized && expandedRowKey !== undefined) {
    const expandedIndex = rows.findIndex((row) => rowKey(row) === expandedRowKey);
    if (expandedIndex !== -1) {
      startIndex = Math.min(startIndex, expandedIndex);
      endIndex = Math.max(endIndex, expandedIndex + 1);
    }
  }
  const visibleRows = rows.slice(startIndex, endIndex);
  // Spacers stand in for the rows above/below the visible window, so the
  // scrollbar reflects the full list while only the window is mounted; a
  // spacer's height ignores an expanded row's extra height, an acceptable
  // approximation for the moderate list sizes this table serves.
  const topSpacerHeight = virtualized ? startIndex * rowHeight : 0;
  const bottomSpacerHeight = virtualized ? (rows.length - endIndex) * rowHeight : 0;

  return (
    <div className="ui-data-table">
      <div className="ui-data-table__header" style={headerRowStyle}>
        {columns.map((column) => (
          <span
            key={column.id}
            className={column.align === 'end' ? 'ui-data-table__header-cell ui-data-table__header-cell--end' : 'ui-data-table__header-cell'}
          >
            {column.header}
          </span>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="ui-data-table__empty">{emptyState}</div>
      ) : (
        <ScrollArea ref={scrollRef} maxHeight={maxHeight} onScroll={handleScroll}>
          <div className="ui-data-table__body">
            {topSpacerHeight > 0 ? <div style={{ height: topSpacerHeight }} /> : null}
            {visibleRows.map((row) => {
              const key = rowKey(row);
              const rowStyle: CSSProperties = { height: rowHeight, gridTemplateColumns };
              const selected = key === selectedRowKey;
              return (
                <Fragment key={key}>
                  <div
                    className={selected ? 'ui-data-table__row ui-data-table__row--selected' : 'ui-data-table__row'}
                    style={rowStyle}
                    onClick={onRowSelect ? () => onRowSelect(row) : undefined}
                    aria-selected={onRowSelect ? selected : undefined}
                  >
                    {columns.map((column) => (
                      <div
                        key={column.id}
                        className={column.align === 'end' ? 'ui-data-table__cell ui-data-table__cell--end' : 'ui-data-table__cell'}
                      >
                        {column.render(row)}
                      </div>
                    ))}
                  </div>
                  {key === expandedRowKey && renderExpanded ? <div className="ui-data-table__expanded">{renderExpanded(row)}</div> : null}
                </Fragment>
              );
            })}
            {bottomSpacerHeight > 0 ? <div style={{ height: bottomSpacerHeight }} /> : null}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
