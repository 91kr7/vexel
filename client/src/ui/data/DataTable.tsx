import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type UIEvent } from 'react';
import { DISMISSAL_FOCUS_TARGET_ATTRIBUTE } from '../controls/escape-arbitration';
import { ScrollArea } from '../glass/ScrollArea';
import './data-table.css';

/**
 * A column's `grid-template-columns` track, as a **closed** set of forms: a flex
 * factor, a length, or a token holding one. Everything else — and `max-content`,
 * `min-content`, `auto` and `fit-content()` in particular — is refused, and the
 * union is the refusal: an intrinsic width does not compile, so no screen can
 * ask for one and no reviewer has to notice that it did.
 *
 * **Why an intrinsic track cannot work here.** The table is
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
 * header; and one intrinsic track probed on the images table resolved 112.3px in
 * the header, 136.8px on three rows and 164.0px on the
 * `moby/buildkit:buildx-stable-1` row, moving the next column's left edge by 27.2px
 * on that row alone. A column whose left edge depends on the row is not a column.
 *
 * **And it cannot be repaired by resolving the tracks once for the whole list.**
 * That would need the header and every row to be items of a single grid
 * (`subgrid`), and the scroll region between them is a scroll container, which
 * establishes an independent formatting context and therefore cannot be a
 * subgrid. Unifying them means rebuilding the component, so the contract refuses
 * the value instead of accepting one it cannot honour.
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

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Fixed row height in px; every row is this tall. Default 56. */
  rowHeight?: number;
  /**
   * Caps the height of the list — the column header and the rows together — and
   * enables virtualised scrolling; unset renders every row.
   *
   * **The header is inside the cap because it is inside the box that scrolls**,
   * which is what keeps a column's label over its column: see the stylesheet's
   * note on `.ui-data-table__header`. Before that, this bounded the rows alone
   * and the header stood above the cap, so a list drawn at `60vh` was 60vh plus
   * a header tall.
   */
  maxHeight?: string;
  /**
   * The list's bound is the region it is placed in rather than a stated
   * `maxHeight`, with virtualisation working exactly as it does under one: the
   * window is measured from the scroll container itself, so it follows the
   * region as the region follows the screen. The same opt-in `TreeView`,
   * `LogStream` and `SessionSurface` carry, under the same name.
   *
   * A list that states neither is unbounded and renders every row, unchanged.
   */
  fill?: boolean;
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
   *
   * **Conditional on nothing else either**: a list that supplies it gets it,
   * exactly as the expansion beside it already worked. It was once read only
   * when the retired card-per-row presentation was asked for, which made a list
   * converted away from that presentation lose its content with no error, no
   * type change and no shorter list — only shorter rows.
   */
  renderRowContent?: (row: T) => ReactNode;
  /** Adds a leading multi-select checkbox column, independent of `onRowSelect`'s single-row selection. */
  selection?: DataTableSelection<T>;
  /** Drops the column header row, for a short list whose columns need no naming. */
  hideHeader?: boolean;
  /**
   * This list is drawn **inside a row of another list** — in that row's content
   * slot (`renderRowContent`) — rather than on a screen of its own.
   *
   * It takes **no surface of its own**: it stays inside the surface its parent
   * row is drawn in, shares that list's pan region, and is ruled with the same
   * hairline between its rows. What says it is a child is that its rows are
   * **inset** from the parent row's cells — one rule, stated once in the
   * stylesheet, so no caller writes a length for it.
   *
   * A child list keeps the columns it declares; only the arrangement is shared,
   * never the tracks.
   */
  nested?: boolean;
  /**
   * Rows grow to fit their content instead of being clipped to `rowHeight`,
   * which becomes a minimum — for a reference table whose cells carry wrapping
   * text rather than a list of one-line values. Virtualisation is off in this
   * mode: a row's height is only known once it is rendered.
   *
   * **A second line is not a reason to ask for it**: the two-line cell — a
   * title over a monospace subtitle — sits unclipped inside the fixed row that
   * every object list uses. A list that states it is a reference table, not an
   * inventory (`.../classic-table/REQ-39`).
   */
  autoRowHeight?: boolean;
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

/**
 * **The object list of the product, in one presentation**: one table surface,
 * one column header at its top, ruled rows beneath it. Column definitions,
 * hover/selected row states, and virtualised scrolling when `maxHeight` is set
 * (REQ-109): only the rows in and around the visible window are mounted. When
 * `expandedRowKey` matches a mounted row, `renderExpanded` content is inserted
 * in normal flow directly below that row, pushing the rows after it down. The
 * row matching `expandedRowKey` is always kept mounted regardless of scroll
 * position, so its expanded content never loses its component instance (and thus
 * its internal state) while scrolling.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHeight = 56,
  maxHeight,
  fill = false,
  selectedRowKey,
  onRowSelect,
  emptyState,
  expandedRowKey,
  renderExpanded,
  renderRowContent,
  selection,
  hideHeader = false,
  nested = false,
  autoRowHeight = false,
}: DataTableProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const expansionRef = useRef<HTMLDivElement>(null);

  /**
   * The scrolling box's own height, and the height of the sticky header inside
   * it. The header is a child of that box rather than a sibling of it (see the
   * stylesheet), so `scrollTop` is measured from the top of the header and not
   * from the first row: the virtualised window takes that offset off before it
   * indexes anything.
   */
  function measureViewport() {
    if (scrollRef.current) setViewportHeight(scrollRef.current.clientHeight);
    setHeaderHeight(headerRef.current?.offsetHeight ?? 0);
  }

  useLayoutEffect(() => {
    measureViewport();
  }, [maxHeight, fill, rows.length, hideHeader]);

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
  // does, so it is observed rather than measured once. The header's height goes
  // with it: its cells wrap at a narrow enough width, and the virtualised window
  // subtracts that height. (jsdom provides no `ResizeObserver`; there is no
  // layout to observe there either.)
  useLayoutEffect(() => {
    pinExpansion();
    const pan = panRef.current;
    if (!pan || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      pinExpansion();
      measureViewport();
    });
    observer.observe(pan);
    return () => observer.disconnect();
  }, [expandedRowKey, rows.length, columns.length, maxHeight, fill, autoRowHeight]);

  const columnTracks = columns.map((column) => columnTrack(column));
  const gridTemplateColumns = (selection ? ['36px', ...columnTracks] : columnTracks).join(' ');
  const headerRowStyle: CSSProperties = { gridTemplateColumns };

  // Either bound — a stated maximum or the region the list fills — turns
  // virtualisation on. A content-sized row has no height known before it is
  // rendered, so that mode makes its own trade: every row mounted, the bound
  // still scrolling.
  const virtualized = (Boolean(maxHeight) || fill) && !autoRowHeight;
  // The rows begin one header down the scrolling box, so the offset the window
  // is computed from is the scroll position minus that header. The window is
  // still measured over the whole viewport rather than over the part the sticky
  // header leaves uncovered: mounting the few rows drawn behind it costs
  // nothing and keeps this one subtraction the only correction.
  const bodyScrollTop = Math.max(0, scrollTop - headerHeight);
  let startIndex = virtualized ? Math.max(0, Math.floor(bodyScrollTop / rowHeight) - OVERSCAN_ROWS) : 0;
  let endIndex = virtualized
    ? Math.min(rows.length, Math.ceil((bodyScrollTop + viewportHeight) / rowHeight) + OVERSCAN_ROWS)
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

  const tableClasses = ['ui-data-table', fill ? 'ui-data-table--fill' : '', nested ? 'ui-data-table--nested' : ''].filter(Boolean).join(' ');

  return (
    // The list region is where the point of interaction returns when a surface
    // expanded inside it is dismissed by the key rather than by a control of its
    // own. `tabIndex={-1}` and nothing more: it takes focus when it is handed
    // it, and adds no stop of its own to the tab order, which walks the screen
    // exactly as it did before.
    <div
      className={tableClasses}
      ref={panRef}
      onScroll={pinExpansion}
      tabIndex={-1}
      {...{ [DISMISSAL_FOCUS_TARGET_ATTRIBUTE]: '' }}
    >
      {/* The header and the rows share **one** scrolling box, the header sticky
          at its top. It is what keeps a label over its column: a vertical
          scrollbar takes real width out of its scroll container's content box,
          so a header drawn outside that container lays its tracks in a wider box
          than the rows do and every column after the first parts company with
          its label. The stylesheet records the measurements. */}
      <ScrollArea ref={scrollRef} maxHeight={maxHeight} onScroll={handleScroll}>
        {hideHeader ? null : (
          <div
            className={scrollTop > 0 ? 'ui-data-table__header ui-data-table__header--stuck' : 'ui-data-table__header'}
            ref={headerRef}
            style={headerRowStyle}
          >
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
          <div className="ui-data-table__body">
            {topSpacerHeight > 0 ? <div style={{ height: topSpacerHeight }} /> : null}
            {visibleRows.map((row) => {
              const key = rowKey(row);
              const rowStyle: CSSProperties = autoRowHeight
                ? { minHeight: rowHeight, gridTemplateColumns }
                : { height: rowHeight, gridTemplateColumns };
              const selected = key === selectedRowKey;
              const rowClasses = [
                'ui-data-table__row',
                autoRowHeight ? 'ui-data-table__row--auto-height' : '',
                selected ? 'ui-data-table__row--selected' : '',
              ]
                .filter(Boolean)
                .join(' ');
              // A row, the content it always carries and the panel it expands into
              // are three lines of one continuous grid, wrapped in nothing: the
              // fragment groups them under the row's key and draws no box at all.
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
                  {renderRowContent ? <div className="ui-data-table__row-content">{renderRowContent(row)}</div> : null}
                  {key === expandedRowKey && renderExpanded ? (
                    <div className="ui-data-table__expanded" ref={expansionRef}>
                      {renderExpanded(row)}
                    </div>
                  ) : null}
                </Fragment>
              );
            })}
            {bottomSpacerHeight > 0 ? <div style={{ height: bottomSpacerHeight }} /> : null}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
