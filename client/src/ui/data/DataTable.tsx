import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type UIEvent } from 'react';
import { DISMISSAL_FOCUS_TARGET_ATTRIBUTE } from '../controls/escape-arbitration';
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

export interface DataTableSelection<T> {
  selectedKeys: string[];
  onToggle: (row: T) => void;
  onToggleAll?: () => void;
  allSelected?: boolean;
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
  /** Adds a leading multi-select checkbox column, independent of `onRowSelect`'s single-row selection. */
  selection?: DataTableSelection<T>;
  /** Drops the column header row, for a short list whose columns need no naming. */
  hideHeader?: boolean;
  /**
   * Rows grow to fit their content instead of being clipped to `rowHeight`,
   * which becomes a minimum — for a reference table whose cells carry wrapping
   * text rather than a dense list of one-line values. Virtualisation is off in
   * this mode: a row's height is only known once it is rendered.
   */
  autoRowHeight?: boolean;
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
  selection,
  hideHeader = false,
  autoRowHeight = false,
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

  const gridTemplateColumns = (selection ? ['36px', ...columns.map((column) => column.width ?? '1fr')] : columns.map((column) => column.width ?? '1fr')).join(
    ' ',
  );
  const headerRowStyle: CSSProperties = { gridTemplateColumns };

  const virtualized = Boolean(maxHeight) && !autoRowHeight;
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
    // The list region is where the point of interaction returns when a surface
    // expanded inside it is dismissed by the key rather than by a control of its
    // own. `tabIndex={-1}` and nothing more: it takes focus when it is handed
    // it, and adds no stop of its own to the tab order, which walks the screen
    // exactly as it did before.
    <div className="ui-data-table" tabIndex={-1} {...{ [DISMISSAL_FOCUS_TARGET_ATTRIBUTE]: '' }}>
      {hideHeader ? null : (
        <div className="ui-data-table__header" style={headerRowStyle}>
          {selection ? (
            <span className="ui-data-table__header-cell ui-data-table__select-cell">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={Boolean(selection.allSelected)}
                onChange={() => selection.onToggleAll?.()}
                disabled={!selection.onToggleAll}
              />
            </span>
          ) : null}
          {columns.map((column) => (
            <span
              key={column.id}
              className={column.align === 'end' ? 'ui-data-table__header-cell ui-data-table__header-cell--end' : 'ui-data-table__header-cell'}
            >
              {column.header}
            </span>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <div className="ui-data-table__empty">{emptyState}</div>
      ) : (
        <ScrollArea ref={scrollRef} maxHeight={maxHeight} onScroll={handleScroll}>
          <div className="ui-data-table__body">
            {topSpacerHeight > 0 ? <div style={{ height: topSpacerHeight }} /> : null}
            {visibleRows.map((row) => {
              const key = rowKey(row);
              const rowStyle: CSSProperties = autoRowHeight
                ? { minHeight: rowHeight, gridTemplateColumns }
                : { height: rowHeight, gridTemplateColumns };
              const selected = key === selectedRowKey;
              const rowClasses = ['ui-data-table__row', autoRowHeight ? 'ui-data-table__row--auto-height' : '', selected ? 'ui-data-table__row--selected' : '']
                .filter(Boolean)
                .join(' ');
              return (
                <Fragment key={key}>
                  <div
                    className={rowClasses}
                    style={rowStyle}
                    onClick={onRowSelect ? () => onRowSelect(row) : undefined}
                    aria-selected={onRowSelect ? selected : undefined}
                  >
                    {selection ? (
                      // Only the checkbox's own click is swallowed (its hit area, not the
                      // whole 36px column): clicking the cell's padding still selects/expands
                      // the row like any other cell, and this cell is deliberately not also a
                      // `.ui-data-table__cell` — that class marks a real column cell, and a
                      // selection checkbox is a structural control, not column data.
                      <div className="ui-data-table__select-cell">
                        <input
                          type="checkbox"
                          aria-label="Select row"
                          checked={selection.selectedKeys.includes(key)}
                          onChange={() => selection.onToggle(row)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </div>
                    ) : null}
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
