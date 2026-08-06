import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type UIEvent } from 'react';
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
}

const OVERSCAN_ROWS = 6;

/**
 * Dense data table with column definitions, hover/selected row states, and
 * virtualised scrolling when `maxHeight` is set (REQ-109): only the rows in
 * and around the visible window are mounted.
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
  const startIndex = virtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS) : 0;
  const endIndex = virtualized
    ? Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS)
    : rows.length;
  const visibleRows = rows.slice(startIndex, endIndex);
  const totalHeight = rows.length * rowHeight;

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
          <div className="ui-data-table__body" style={{ height: virtualized ? totalHeight : undefined, position: 'relative' }}>
            {visibleRows.map((row, index) => {
              const key = rowKey(row);
              const rowStyle: CSSProperties = virtualized
                ? { position: 'absolute', top: (startIndex + index) * rowHeight, left: 0, right: 0, height: rowHeight, gridTemplateColumns }
                : { height: rowHeight, gridTemplateColumns };
              const selected = key === selectedRowKey;
              return (
                <div
                  key={key}
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
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
