import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type UIEvent } from 'react';
import { DISMISSAL_FOCUS_TARGET_ATTRIBUTE } from '../controls/escape-arbitration';
import { ScrollArea } from '../glass/ScrollArea';
import { Surface } from '../glass/Surface';
import './data-table.css';

/**
 * A column's `grid-template-columns` track, as a **closed** set of forms: a flex
 * factor, a length, or a token holding one. Everything else — and `max-content`,
 * `min-content`, `auto` and `fit-content()` in particular — is refused, and the
 * union is the refusal: an intrinsic width does not compile, so no screen can
 * ask for one and no reviewer has to notice that it did.
 *
 * **Why an intrinsic track cannot work here, in either variant.** The table is
 * not one grid: the header is a grid, and **every row is a grid of its own**,
 * each handed the same template string. A `fr` or a length resolves identically
 * in all of them, because the containers are the same width. An intrinsic track
 * resolves against *its own container's content*, so it takes a different value
 * in the header and in every row whose cell content differs — and since the
 * remaining free space is what the flexible tracks divide, **every other column
 * in that row moves with it**. Measured on the delivered build: the registries
 * action column resolved 57.4px in its header, 50.7px on a `Log in` row and
 * 58.0px on a `Log out` row, at all three viewports; the networks one 57.4px
 * against 130.7px, carrying that row's `NAME` column 46px out of line with its
 * header; and in the **dense** variant, one intrinsic track probed on the images
 * table resolved 112.3px in the header, 136.8px on three rows and 164.0px on the
 * `moby/buildkit:buildx-stable-1` row, moving the next column's left edge by
 * 27.2px on that row alone. A column whose left edge depends on the row is not a
 * column.
 *
 * **And it cannot be repaired by resolving the tracks once for the whole list.**
 * That would need the header and every row to be items of a single grid
 * (`subgrid`), and the scroll region between them is a scroll container, which
 * establishes an independent formatting context and therefore cannot be a
 * subgrid — the comfortable variant additionally puts each row inside its own
 * card. Unifying them means rebuilding the variant, so the contract refuses the
 * value instead of accepting one it cannot honour.
 *
 * A caller that wanted "as wide as its content" states the width it measured,
 * which is also what stops an action cluster growing at the data columns'
 * expense (REQ-9).
 */
export type DataTableColumnWidth = `${number}fr` | `${number}px` | `var(--${string})`;

export interface DataTableColumn<T> {
  id: string;
  header: string;
  /** `grid-template-columns` track for this column (default `1fr`). */
  width?: DataTableColumnWidth;
  /**
   * The width this column may never resolve below. Defaults, for a flexible
   * `width`, to the flex factor times `--data-table-column-min-width`; a length
   * `width` already states its own minimum.
   */
  minWidth?: DataTableColumnWidth;
  align?: 'start' | 'end';
  render: (row: T) => ReactNode;
}

export interface DataTableSelection<T> {
  selectedKeys: string[];
  onToggle: (row: T) => void;
  onToggleAll?: () => void;
  allSelected?: boolean;
}

/**
 * How much room a row is given, and therefore what a list of objects looks
 * like. **These are the only two, and they are variants of one component**: an
 * object list is never a second component placed beside this one.
 *
 * - `dense` — the delivered fixed-height row, virtualised: a long list scanned
 *   column by column.
 * - `comfortable` — each row on a card of its own, growing to fit a title over
 *   a monospace subtitle, with trailing badges and meta values, an
 *   always-visible content slot and the expansion inside the same card. The
 *   shape the hand-built card lists across the product were reaching for.
 *
 * Both resolve their columns through the same tracks, so the comfortable
 * variant carries the column-minimum contract (no track reaches zero, the table
 * pans instead) without restating it, and both draw their cells with the same
 * `TableCells`, which carry the truncation contract.
 */
export type DataTableVariant = 'dense' | 'comfortable';

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
  /**
   * Content rendered in normal flow directly below the row whose key matches
   * `expandedRowKey`. **One key, so one expansion**: a list cannot present two
   * open panels, and the cross-list half of that guarantee is `DetailPanel`'s.
   */
  expandedRowKey?: string;
  renderExpanded?: (row: T) => ReactNode;
  /**
   * Content rendered inside every row, below its cells and outside the
   * selectable row itself — chips with their own actions, a nested list. Unlike
   * `renderExpanded` it is not conditional on a selection: a grouped list is
   * this slot holding a nested `hideHeader` list of the group's children.
   * Comfortable rows only; a dense row is a fixed-height line.
   */
  renderRowContent?: (row: T) => ReactNode;
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
  /**
   * How much room a row is given (default `'dense'`). See `DataTableVariant`:
   * `'comfortable'` puts each row on a card of its own and lets it grow to fit
   * its content, which turns off virtualisation exactly as `autoRowHeight`
   * does.
   */
  variant?: DataTableVariant;
}

const OVERSCAN_ROWS = 6;

const FLEXIBLE_WIDTH = /^\s*(\d*\.?\d+)fr\s*$/;

/**
 * A column's `grid-template-columns` track, carrying the minimum below which it
 * may not resolve. A flexible width becomes `minmax(factor × minimum, n fr)`:
 * scaling the minimum by the flex factor is what keeps a compressed table's
 * columns in the proportions they were declared with rather than equalising
 * them, and what keeps the minimum inert at the widths where the fractions
 * already resolve wider. A width that is a length states its own minimum and is
 * used as given, unless a `minWidth` is stated with it.
 *
 * Every form it can be handed resolves to the same width in the header and in
 * every row, which is what `DataTableColumnWidth` exists to guarantee.
 */
function columnTrack(column: { width?: DataTableColumnWidth; minWidth?: DataTableColumnWidth }): string {
  const width = column.width ?? '1fr';
  const flexFactor = FLEXIBLE_WIDTH.exec(width)?.[1];
  if (flexFactor === undefined) return column.minWidth ? `minmax(${column.minWidth}, ${width})` : width;
  const minimum =
    column.minWidth ??
    (Number(flexFactor) === 1 ? 'var(--data-table-column-min-width)' : `calc(${flexFactor} * var(--data-table-column-min-width))`);
  return `minmax(${minimum}, ${width})`;
}

/** The card a comfortable row, its content slot and its expansion share. */
function ComfortableRowCarrier({ children }: { children?: ReactNode }) {
  return (
    <Surface elevation="flat" padding="none">
      {children}
    </Surface>
  );
}

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
  renderRowContent,
  selection,
  hideHeader = false,
  autoRowHeight = false,
  variant = 'dense',
}: DataTableProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const expansionRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (scrollRef.current) setViewportHeight(scrollRef.current.clientHeight);
  }, [maxHeight, rows.length]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    setScrollTop(event.currentTarget.scrollTop);
  }

  /**
   * The expansion is pinned to the pan region's visible box: it keeps that
   * box's width and stays in it while the grid pans underneath. A row is a grid
   * to be scanned across; a detail panel is prose and values to be read, so it
   * never becomes wider than the window it is read in — which is what carried a
   * certified one-column arrangement into two columns of 417.6px at 700px of
   * viewport.
   *
   * Written here rather than declared as `position: sticky; left: 0`, which
   * cannot express it in this structure: the expansion's nearest scroll
   * container is the body's own region, which never scrolls horizontally — the
   * box that pans is one level further out — so a sticky inset resolves against
   * a scrollport that does not move. Measured at 375px, panned to 400: the
   * panel at x -379 with sticky, both with that region scrolling and with its
   * inline axis clipped, against x 21 (the table's own left edge) this way.
   *
   * `transform` would pin it too, and is refused: it makes the expansion the
   * containing block of every `position: fixed` descendant, and a dialog is
   * rendered in place inside the panel, not portalled — the same probe measured
   * at the panel's box (21, 543, 907×355) instead of the viewport.
   *
   * Nothing is written while the table is not panning, so at every width where
   * the columns fit — every desktop width — the expansion carries no geometry
   * of ours at all and lays out exactly as delivered.
   */
  function pinExpansion() {
    const pan = panRef.current;
    const expansion = expansionRef.current;
    if (!pan || !expansion) return;
    const panning = pan.scrollWidth > pan.clientWidth;
    expansion.style.width = panning ? `${pan.clientWidth}px` : '';
    expansion.style.left = panning ? `${pan.scrollLeft}px` : '';
  }

  // The pan region's box changes with the window, and nothing renders when it
  // does, so it is observed rather than measured once. (jsdom provides no
  // `ResizeObserver`; there is no layout to observe there either.)
  useLayoutEffect(() => {
    pinExpansion();
    const pan = panRef.current;
    if (!pan || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => pinExpansion());
    observer.observe(pan);
    return () => observer.disconnect();
  }, [expandedRowKey, rows.length, columns.length, maxHeight, autoRowHeight]);

  const columnTracks = columns.map((column) => columnTrack(column));
  const gridTemplateColumns = (selection ? ['36px', ...columnTracks] : columnTracks).join(' ');
  const headerRowStyle: CSSProperties = { gridTemplateColumns };

  // A comfortable row grows to fit its content for the same reason
  // `autoRowHeight` does — its height is not known before it is rendered — so it
  // makes the same trade: every row mounted, `maxHeight` still scrolling.
  const comfortable = variant === 'comfortable';
  const contentSized = autoRowHeight || comfortable;
  const virtualized = Boolean(maxHeight) && !contentSized;
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
    <div
      className={comfortable ? 'ui-data-table ui-data-table--comfortable' : 'ui-data-table'}
      ref={panRef}
      onScroll={pinExpansion}
      tabIndex={-1}
      {...{ [DISMISSAL_FOCUS_TARGET_ATTRIBUTE]: '' }}
    >
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
              const rowStyle: CSSProperties = contentSized
                ? { minHeight: rowHeight, gridTemplateColumns }
                : { height: rowHeight, gridTemplateColumns };
              const selected = key === selectedRowKey;
              const rowClasses = [
                'ui-data-table__row',
                contentSized ? 'ui-data-table__row--auto-height' : '',
                comfortable ? 'ui-data-table__row--comfortable' : '',
                selected ? 'ui-data-table__row--selected' : '',
              ]
                .filter(Boolean)
                .join(' ');
              // A comfortable row, the content it always carries and the panel it
              // expands into are one card, exactly as the card lists this variant
              // replaces drew them; a dense row is a line in a continuous grid and
              // is wrapped in nothing.
              const Carrier = comfortable ? ComfortableRowCarrier : Fragment;
              return (
                <Carrier key={key}>
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
                  {comfortable && renderRowContent ? <div className="ui-data-table__row-content">{renderRowContent(row)}</div> : null}
                  {key === expandedRowKey && renderExpanded ? (
                    <div className="ui-data-table__expanded" ref={expansionRef}>
                      {renderExpanded(row)}
                    </div>
                  ) : null}
                </Carrier>
              );
            })}
            {bottomSpacerHeight > 0 ? <div style={{ height: bottomSpacerHeight }} /> : null}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
