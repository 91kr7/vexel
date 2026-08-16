/**
 * **The classic-table vocabulary** — how a list is measured, and what "it is the
 * containers table" means as an assertion
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table`,
 * `REQ-2` … `REQ-5`, `REQ-8`, `REQ-12`, `REQ-30`, `REQ-39`, `REQ-40`).
 *
 * It lives here rather than in one spec because **the plan converts eight screen
 * areas in five batches, and every one of them owes the same measurement**.
 * Batch 1 wrote it inside `classic-table-criteria.spec.ts`; batch 2 moved it here
 * unchanged so that its own lists are measured by the same instrument rather
 * than by a second one that can drift from it. A criterion restated twice is a
 * criterion that will one day be two.
 *
 * **Batch 3 extended it rather than copying it** (REQ-7): a list drawn inside a
 * *row* of another list states `hideHeader`, so it carries no column to be named
 * by and owes no header assertion — it is reached through its parent's column
 * (`{ nestedInside }`), measured in the same pass as the row that carries it, and
 * judged by `expectFlushRuledRows` plus `expectNestedByIndentationAlone` instead
 * of by `expectClassicTable`. The header half of the criteria is not weakened
 * for it; it does not apply to it, and this says so on the spot.
 *
 * Three things it insists on, none of them negotiable:
 *
 * - **Boxes, not content.** Every character on these screens is identical before
 *   and after, so *"the plugins list shows fifteen plugins"* is true of the build
 *   the human rejected. What changed is the rectangles, so what is asserted is
 *   rectangles: the gap between two rows, the corners a row carries, the number
 *   of enclosing surfaces, the distance between a header cell's left edge and its
 *   column's, and the row's own height and alignment. Content assertions stand
 *   **beside** them and never instead of them (REQ-30).
 * - **The expected values are read from the reference lists in the same run.**
 *   REQ-39 and REQ-40 are comparisons against containers and images *as they
 *   stand in the tree*, so no row height and no edge inset is written into this
 *   file: a converted row is measured against a containers row and an images row
 *   read minutes apart in the same browser, and a number copied here would rot
 *   the day the reference legitimately changes. That is the whole correction the
 *   2026-08-16 amendment makes.
 * - **A list is found by a column only it carries.** The section header naming a
 *   panel is no longer inside the list's card (REQ-40), so a card can no longer
 *   be found by the heading it used to hold.
 *
 * **Batch 4 extended it twice, and again rather than copying it** (REQ-21,
 * REQ-39, REQ-40):
 *
 * - **A list read inside a dialog** — the efficiency & signals view's three,
 *   the only converted lists that do not live on a screen. What "one enclosing
 *   surface" counts has to be counted from the region the list is read in, and
 *   for them that region is the dialog rather than `.ui-frame__content`: the
 *   dialog's own surface is *the dialog*, present for every dialog the product
 *   draws and not something a list took. So the region is a parameter
 *   (`{ region }`), the count inside it is `enclosingSurfaces` exactly as
 *   before, and the count to the screen is reported beside it
 *   (`enclosingSurfacesToTheScreen`) so the dialog's own surface is stated
 *   rather than hidden by the boundary. Nothing about a screen list's
 *   measurement changes: the default region is the one batches 1 to 3 used.
 * - **Every list on a screen, without naming one** — `measureEveryList`, which
 *   is what the product-wide sweep walks with (`b4/INT-4`). A sweep that knew
 *   the lists by name could not find the one nobody enumerated, which is the
 *   whole reason it exists; so a list is reached by its **position** in the
 *   region (`{ index }`) and named afterwards by what it draws.
 */
import { expect, type Locator, type Page } from './test.js';

export interface Viewport {
  width: number;
  height: number;
}

/** The three viewports this plan is written against, as the reference analysis used them. */
export const VIEWPORTS: Viewport[] = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
];

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface RowGeometry {
  label: string;
  /** Everything the row's class list carries besides the base class and the selected state. */
  modifiers: string[];
  height: number;
  alignItems: string;
  /** The left edge of each of this row's own cells, so one row's inset can be read against another's. */
  cellXs: number[];
  /** The largest of the four corner radii, in px. */
  radius: number;
  /**
   * The radius of what the row is actually drawn on: the row's own, or — where a
   * list gives a row a surface of its own — that surface's. The retired
   * presentation rounds the carrier and not the row inside it, so a probe reading
   * the row alone reports a square corner on a list of cards.
   */
  carrierRadius: number;
  outline: string;
  boxShadow: string;
  isSurface: boolean;
  box: Box;
  /** The row is drawn entirely inside every region that clips it, so its lines can be judged. */
  fullyVisible: boolean;
  /** The two-line cell of this row, where it draws one, measured after every clipping ancestor. */
  twoLine: {
    title: string;
    subtitle: string;
    /** Painted height against laid-out height, per line: a clipped line loses the difference. */
    titleVisible: number;
    titleNatural: number;
    subtitleVisible: number;
    subtitleNatural: number;
  } | null;
}

export interface JunctionGeometry {
  label: string;
  /** The vertical distance between the two boxes: REQ-2's inter-row gap. */
  gap: number;
  /** How many of the two facing edges draw a rule, and how wide. */
  edges: number;
  widths: number[];
}

export interface ListGeometry {
  found: boolean;
  /**
   * How many elements the region selector matched, and the region's own box.
   *
   * **A guard against the premise going empty**, not diagnostics: a dialog that
   * never opened matches no region, and a probe that quietly fell back to the
   * screen would measure the list *behind* the dialog and report it green. A
   * region matching twice is the same failure the other way round — two dialogs
   * open, and no way to say which one was measured.
   */
  regionMatches: number;
  regionBox: Box | null;
  headers: string[];
  table: Box;
  /** The table's own class list, so a nested list can be told from a screen list by what it states. */
  tableClasses: string[];
  /** The column header's own band, so the distance from a label to its values can be read. */
  headerBox: Box | null;
  clientWidth: number;
  scrollWidth: number;
  /** The table's own enclosing surface — the card of REQ-40 — and what else it holds. */
  card: Box | null;
  cardClasses: string[];
  cardHolds: string[];
  /** `.ui-surface` boundaries between the table and the region it is read in (REQ-4). */
  enclosingSurfaces: number;
  /**
   * The same count taken all the way to the **screen's** content region.
   *
   * For a screen list the two are equal. For a list inside a dialog this is one
   * more — the dialog's own surface — and it is reported rather than hidden by
   * the boundary, so "the dialog adds exactly one, and the list adds one card"
   * is a figure and not an argument.
   */
  enclosingSurfacesToTheScreen: number;
  /** `.ui-surface` elements inside the table itself: a row on a card of its own is one (REQ-3). */
  surfacesInside: number;
  headerInsideCard: boolean;
  /** The panel's section header sits above the card rather than inside it (REQ-40). */
  sectionHeaderInsideCard: boolean;
  /**
   * The table is drawn inside another table's expansion — a list nested in the
   * panel a row opened, which takes **no card of its own**: it is already inside
   * its parent list's, and a card inside a card is two surfaces (REQ-40).
   */
  nestedInAnExpansion: boolean;
  /**
   * The box that scrolls **inside** the table — the header and the rows share
   * one, capped by `maxHeight` where a call site states one.
   *
   * A list that states none holds no vertical scroll of its own: `scrollHeight`
   * equals `clientHeight`, and the surface it is read in is what scrolls. Inside
   * a dialog that is the difference between one scrollbar and two.
   */
  innerScroll: { clientHeight: number; scrollHeight: number };
  /** The section header drawn immediately above the list's own card, where a screen draws one (REQ-40). */
  precedingSectionHeader: string | null;
  /**
   * The table's own `overflow-x`. A list drawn inside a row of another one
   * computes **no** horizontal overflow of its own (`visible`), so its columns'
   * minimums reach its parent's scroller and the pair pans together; `auto`
   * would make it a scroll container that hands nothing upward (REQ-7, REQ-12).
   */
  overflowX: string;
  /**
   * For a list drawn in a row's **content slot** — a group's children: the row
   * that carries it and the wrapper it is drawn in, measured in the same pass,
   * so the child's inset is read against its own parent's cells rather than
   * against another layout's.
   */
  carrier: {
    rowLabel: string;
    rowBox: Box;
    /** The left edge of each of the parent row's own cells. */
    rowCellXs: number[];
    /** The `.ui-data-table__row-content` the nested list is drawn in. */
    contentBox: Box;
    /** The wrapper's own closing rule — the group's, the last child having given up its own. */
    contentBorderBottom: number;
    contentPaddingBottom: number;
    /** The last child row's own bottom rule, which the group's closing hairline replaces. */
    lastChildBorderBottom: number;
    /** The block drawn after the group, and the distance from the wrapper's bottom edge to it. */
    nextBlockLabel: string | null;
    nextBlockGap: number | null;
  } | null;
  rows: RowGeometry[];
  rowContentBlocks: number;
  /** Junctions between one row's group and the next row: REQ-2 and REQ-3. */
  rowJunctions: JunctionGeometry[];
  /** Junctions between a row's cells and that row's own content below them. */
  ownContentJunctions: JunctionGeometry[];
  /** Per column: the header's left edge, and the worst disagreement with a body cell's (REQ-5). */
  columnEdges: { header: string; headerX: number; worstDelta: number; worstRow: string }[];
  zeroWidthCells: string[];
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function describeBox(box: Box): string {
  return `x=${round(box.x)}→${round(box.right)}, y=${round(box.y)}, ${round(box.width)}×${round(box.height)}`;
}

/**
 * Which list is being measured.
 *
 * A screen list is named by a column only it carries. A list drawn **inside a
 * row of another list** — compose's per-project services, swarm's per-stack ones
 * — states `hideHeader` and therefore carries no column to be named by, so it is
 * named by its parent's column and by which group it belongs to. Its figures are
 * read in the same pass as that parent's row, which is what makes "inset from
 * its parent's cells" a measurement rather than two.
 */
export type ListTarget = string | { nestedInside: string; group?: number; underRow?: string } | { index: number };

/**
 * Where a list is read, and therefore what "one enclosing surface" is counted
 * against (REQ-4).
 *
 * The default is the screen's own content region, which is what batches 1 to 3
 * measure against. A list drawn **inside a dialog** names the dialog instead —
 * the dialog's surface is the dialog, not a surface the list took, and every
 * dialog in the product draws one. The count to the screen is reported anyway
 * (`enclosingSurfacesToTheScreen`), so nothing is hidden by the boundary; what
 * moves is only what the criterion is asserted against.
 */
export interface ListRegionOptions {
  region?: string;
}

/** The region a screen list is read in — the shell's own content column. */
export const SCREEN_REGION = '.ui-frame__content';
/** The region a list inside the large dialog is read in: the dialog's own scrolling box. */
export const LARGE_DIALOG_REGION = '.ui-modal--size-large';

/**
 * Every figure of one list, in a single pass, so that no two numbers come from
 * two layouts.
 *
 * The list is found by a column header only it carries, and everything below is
 * geometry the browser reports — never a class name standing in for a
 * measurement, except where the class *is* the contract (REQ-39's "the same set
 * of row modifiers").
 */
export async function measureList(page: Page, target: ListTarget, options: ListRegionOptions = {}): Promise<ListGeometry> {
  return await page.evaluate(({ wanted, region }) => {
    const byIndex = typeof wanted === 'object' && 'index' in wanted ? wanted.index : null;
    const wantedHeader = typeof wanted === 'string' ? wanted : 'nestedInside' in wanted ? wanted.nestedInside : '';
    const nestedTarget = typeof wanted === 'object' && 'nestedInside' in wanted ? wanted : null;
    const wantedGroup = nestedTarget === null ? null : (nestedTarget.group ?? 0);
    const wantedRow = nestedTarget?.underRow;
    const regionElements = Array.from(document.querySelectorAll<HTMLElement>(region));
    const empty: ListGeometry = {
      found: false,
      regionMatches: regionElements.length,
      regionBox: null,
      headers: [],
      table: { x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0 },
      tableClasses: [],
      headerBox: null,
      clientWidth: 0,
      scrollWidth: 0,
      card: null,
      cardClasses: [],
      cardHolds: [],
      enclosingSurfaces: 0,
      enclosingSurfacesToTheScreen: 0,
      surfacesInside: 0,
      headerInsideCard: false,
      sectionHeaderInsideCard: false,
      nestedInAnExpansion: false,
      innerScroll: { clientHeight: 0, scrollHeight: 0 },
      precedingSectionHeader: null,
      overflowX: '',
      carrier: null,
      rows: [],
      rowContentBlocks: 0,
      rowJunctions: [],
      ownContentJunctions: [],
      columnEdges: [],
      zeroWidthCells: [],
    };

    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom };
    };

    // A rectangle is cut down by every ancestor that clips, the element itself
    // included: a line hidden by overflow still reports its full laid-out box and
    // is only painted short, so "unclipped" cannot be read off the raw rect.
    //
    // **The walk stops at a fixed ancestor**, and that is CSS rather than
    // caution: an element positioned `fixed` is laid out against the viewport, so
    // no ancestor's overflow clips it or anything inside it. Batch 4 met this on
    // the one list the plan reads inside a dialog — the overlay is `fixed` inside
    // the screen's own scrolled region, and a walk that carried on past it
    // intersected the dialog's rows with a scroll region they are not in,
    // reporting a fully painted row as clipped at 375×812.
    const paintedHeight = (element: Element): { visible: number; natural: number } => {
      const raw = element.getBoundingClientRect();
      let top = raw.top;
      let bottom = raw.bottom;
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.overflowY !== 'visible') {
          const owner = node.getBoundingClientRect();
          top = Math.max(top, owner.top);
          bottom = Math.min(bottom, owner.bottom);
        }
        if (style.position === 'fixed') break;
      }
      return { visible: Math.max(0, bottom - top), natural: raw.height };
    };

    // The region the list is read in — the screen's content column, or the
    // dialog's own scrolling box. Matched exactly once or the measurement below
    // would be about a region the caller did not mean: a dialog that never
    // opened matches none, and two open dialogs match two.
    const regionElement = regionElements.length === 1 ? regionElements[0] : null;
    if (regionElement === null) return empty;
    empty.regionBox = box(regionElement);

    const tables = Array.from(regionElement.querySelectorAll<HTMLElement>('.ui-data-table'));
    // A header cell **of this table**, not of one nested inside it: a list drawn
    // in the panel one of its rows opened carries its own header, and a probe
    // that did not scope the match would hand back the outer table for the
    // inner one's column name.
    const named =
      byIndex !== null
        ? tables[byIndex]
        : tables.find((candidate) =>
            Array.from(candidate.querySelectorAll('.ui-data-table__header-cell')).some(
              (cell) => cell.closest('.ui-data-table') === candidate && (cell.textContent ?? '').trim() === wantedHeader,
            ),
          );
    // A nested list draws no header of its own, so it is reached through its
    // parent's: the list in the content slot of that parent's `group`-th row, or
    // of the row naming `underRow` — which is how a fixture's own group is found
    // on a daemon that lists the operator's objects beside it.
    const nestedLists = Array.from(
      named?.querySelectorAll<HTMLElement>('.ui-data-table__row-content > .ui-data-table') ?? [],
    ).filter((candidate) => candidate.parentElement?.closest('.ui-data-table') === named);
    const table =
      wantedGroup === null
        ? named
        : (wantedRow === undefined
            ? nestedLists[wantedGroup]
            : nestedLists.find((candidate) =>
                (candidate.parentElement?.previousElementSibling?.textContent ?? '').includes(wantedRow),
              )) ?? undefined;
    if (!table) return empty;

    const headerCells = Array.from(
      table.querySelectorAll<HTMLElement>('.ui-data-table__header-cell:not(.ui-data-table__select-cell)'),
    ).filter((cell) => cell.closest('.ui-data-table') === table);
    const headerElement = table.querySelector<HTMLElement>('.ui-data-table__header');
    const card = table.closest('.ui-surface');

    // How many surface boundaries stand between the table and the region it is
    // read in: REQ-4 admits exactly one.
    let enclosingSurfaces = 0;
    for (let node: Element | null = table.parentElement; node !== null && node !== regionElement; node = node.parentElement) {
      if (node.matches('.ui-surface')) enclosingSurfaces += 1;
    }
    // …and the same count to the screen's own content region, which for a list
    // inside a dialog is one more: the dialog's. Reported rather than hidden by
    // the boundary above.
    let enclosingSurfacesToTheScreen = 0;
    for (
      let node: Element | null = table.parentElement;
      node !== null && !node.matches('.ui-frame__content');
      node = node.parentElement
    ) {
      if (node.matches('.ui-surface')) enclosingSurfacesToTheScreen += 1;
    }

    // The header a screen draws **above** the list's card, which is where REQ-40
    // puts it: the last one drawn before the table in document order.
    const precedingSectionHeader =
      Array.from(regionElement.querySelectorAll('.ui-section-header__title'))
        .filter((title) => (title.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
        .map((title) => (title.textContent ?? '').trim())
        .pop() ?? null;

    // The box that scrolls inside the table: a list stating no `maxHeight` holds
    // no vertical scroll of its own, and the surface it is read in is what scrolls.
    const scroller = table.querySelector<HTMLElement>('.ui-scroll-area');

    // In document order, and **not** as the body's own children: the retired
    // presentation wraps each row in a carrier surface of its own, so a probe
    // reading direct children finds no row at all on the build this one is
    // measured against.
    const blocks = Array.from(
      table.querySelectorAll<HTMLElement>('.ui-data-table__row, .ui-data-table__row-content, .ui-data-table__expanded'),
    ).filter((block) => block.closest('.ui-data-table') === table);

    /** The surface a row is drawn on, if the list gives it one of its own (REQ-3). */
    const ownSurfaceOf = (row: Element): Element | null => {
      if (row.matches('.ui-surface')) return row;
      const inside = row.querySelector('.ui-surface');
      if (inside !== null) return inside;
      for (let node = row.parentElement; node !== null && node !== table; node = node.parentElement) {
        if (node.matches('.ui-surface')) return node;
      }
      return null;
    };

    const largestRadius = (element: Element): number => {
      const style = getComputedStyle(element);
      return Math.max(
        Number.parseFloat(style.borderTopLeftRadius) || 0,
        Number.parseFloat(style.borderTopRightRadius) || 0,
        Number.parseFloat(style.borderBottomLeftRadius) || 0,
        Number.parseFloat(style.borderBottomRightRadius) || 0,
      );
    };

    const labelOf = (row: Element): string =>
      (row.querySelector('.ui-table-two-line-cell__title')?.textContent ?? row.textContent ?? '').trim().slice(0, 40);

    const rowElements = blocks.filter((block) => block.matches('.ui-data-table__row'));

    /** A row's own cells — never one belonging to a list nested inside it. */
    const cellsOf = (row: Element): HTMLElement[] =>
      Array.from(row.querySelectorAll<HTMLElement>('.ui-data-table__cell')).filter(
        (cell) => cell.closest('.ui-data-table__row') === row,
      );

    const rows: RowGeometry[] = rowElements.map((row) => {
      const style = getComputedStyle(row);
      const title = row.querySelector('.ui-table-two-line-cell__title');
      const subtitle = row.querySelector('.ui-table-two-line-cell__subtitle');
      const titleInk = title ? paintedHeight(title) : null;
      const subtitleInk = subtitle ? paintedHeight(subtitle) : null;
      const carrier = ownSurfaceOf(row);
      const rowInk = paintedHeight(row);
      return {
        label: labelOf(row),
        modifiers: Array.from(row.classList).filter(
          (name) => name !== 'ui-data-table__row' && name !== 'ui-data-table__row--selected',
        ),
        height: row.getBoundingClientRect().height,
        alignItems: style.alignItems,
        cellXs: cellsOf(row).map((cell) => cell.getBoundingClientRect().x),
        radius: largestRadius(row),
        carrierRadius: Math.max(largestRadius(row), carrier ? largestRadius(carrier) : 0),
        // An outline is drawn or it is not: a `none` outline still computes a
        // width (`medium`, 3px in Chromium), which says nothing about the row.
        outline: style.outlineStyle === 'none' ? 'none' : `${style.outlineStyle} ${style.outlineWidth}`,
        boxShadow: style.boxShadow,
        isSurface: carrier !== null,
        box: box(row),
        fullyVisible: rowInk.visible >= rowInk.natural - 0.5,
        twoLine:
          title && subtitle && titleInk && subtitleInk
            ? {
                title: (title.textContent ?? '').trim(),
                subtitle: (subtitle.textContent ?? '').trim(),
                titleVisible: titleInk.visible,
                titleNatural: titleInk.natural,
                subtitleVisible: subtitleInk.visible,
                subtitleNatural: subtitleInk.natural,
              }
            : null,
      };
    });

    // A row and the content it carries below its cells belong together; the rule
    // that separates one row from the *next* is what REQ-3 counts. So the blocks
    // are grouped, and the two kinds of junction are reported apart.
    const groupOf = new Map<Element, number>();
    let group = -1;
    for (const block of blocks) {
      if (block.matches('.ui-data-table__row')) group += 1;
      groupOf.set(block, group);
    }

    const rowJunctions: JunctionGeometry[] = [];
    const ownContentJunctions: JunctionGeometry[] = [];
    for (let index = 0; index + 1 < blocks.length; index += 1) {
      const above = blocks[index];
      const below = blocks[index + 1];
      const aboveStyle = getComputedStyle(above);
      const belowStyle = getComputedStyle(below);
      const widths = [
        Number.parseFloat(aboveStyle.borderBottomWidth) || 0,
        Number.parseFloat(belowStyle.borderTopWidth) || 0,
      ];
      const junction: JunctionGeometry = {
        label: `${labelOf(above) || above.className} → ${labelOf(below) || below.className}`,
        gap: below.getBoundingClientRect().top - above.getBoundingClientRect().bottom,
        edges: widths.filter((width) => width > 0).length,
        widths,
      };
      if (groupOf.get(above) === groupOf.get(below)) ownContentJunctions.push(junction);
      else rowJunctions.push(junction);
    }

    const columnEdges = headerCells.map((header, index) => {
      const headerX = header.getBoundingClientRect().x;
      let worstDelta = 0;
      let worstRow = '';
      for (const row of rowElements) {
        const cells = Array.from(row.querySelectorAll<HTMLElement>('.ui-data-table__cell')).filter(
          (cell) => cell.closest('.ui-data-table__row') === row,
        );
        const cell = cells[index];
        if (!cell) continue;
        const delta = Math.abs(cell.getBoundingClientRect().x - headerX);
        if (delta > worstDelta) {
          worstDelta = delta;
          worstRow = labelOf(row);
        }
      }
      return { header: (header.textContent ?? '').trim(), headerX, worstDelta, worstRow };
    });

    const zeroWidthCells: string[] = [];
    for (const row of rowElements) {
      const cells = Array.from(row.querySelectorAll<HTMLElement>('.ui-data-table__cell')).filter(
        (cell) => cell.closest('.ui-data-table__row') === row,
      );
      cells.forEach((cell, index) => {
        if (cell.getBoundingClientRect().width <= 0) {
          zeroWidthCells.push(`${labelOf(row)} · ${(headerCells[index]?.textContent ?? `column ${index}`).trim()}`);
        }
      });
    }

    // The row this list is drawn under, where it is drawn under one at all. The
    // group's own junctions are read **here** and not on the last child row: the
    // wrapper carries the closing hairline and the last child gives up its own,
    // so a probe reading that row alone measures a missing rule and is wrong
    // about it.
    const wrapper = table.parentElement?.closest('.ui-data-table__row-content') ?? null;
    const carrierRow = wrapper?.previousElementSibling?.matches('.ui-data-table__row')
      ? (wrapper.previousElementSibling as HTMLElement)
      : null;
    const afterTheGroup = wrapper?.nextElementSibling ?? null;
    const lastChild = rowElements[rowElements.length - 1] ?? null;

    return {
      found: true,
      regionMatches: regionElements.length,
      regionBox: box(regionElement),
      headers: headerCells.map((cell) => (cell.textContent ?? '').trim()),
      table: box(table),
      tableClasses: Array.from(table.classList),
      headerBox: headerElement ? box(headerElement) : null,
      clientWidth: table.clientWidth,
      scrollWidth: table.scrollWidth,
      card: card ? box(card) : null,
      cardClasses: card ? Array.from(card.classList) : [],
      cardHolds: card
        ? Array.from(card.children).map((child) => child.className || child.tagName.toLowerCase())
        : [],
      enclosingSurfaces,
      enclosingSurfacesToTheScreen,
      surfacesInside: table.querySelectorAll('.ui-surface').length,
      headerInsideCard: card !== null && headerElement !== null && card.contains(headerElement),
      sectionHeaderInsideCard: card !== null && card.querySelector('.ui-section-header') !== null,
      nestedInAnExpansion: table.closest('.ui-data-table__expanded') !== null,
      innerScroll: { clientHeight: scroller?.clientHeight ?? 0, scrollHeight: scroller?.scrollHeight ?? 0 },
      precedingSectionHeader,
      overflowX: getComputedStyle(table).overflowX,
      carrier:
        wrapper !== null && carrierRow !== null
          ? {
              rowLabel: labelOf(carrierRow),
              rowBox: box(carrierRow),
              rowCellXs: cellsOf(carrierRow).map((cell) => cell.getBoundingClientRect().x),
              contentBox: box(wrapper),
              contentBorderBottom: Number.parseFloat(getComputedStyle(wrapper).borderBottomWidth) || 0,
              contentPaddingBottom: Number.parseFloat(getComputedStyle(wrapper).paddingBottom) || 0,
              lastChildBorderBottom: lastChild
                ? Number.parseFloat(getComputedStyle(lastChild).borderBottomWidth) || 0
                : 0,
              nextBlockLabel: afterTheGroup ? labelOf(afterTheGroup) || afterTheGroup.className : null,
              nextBlockGap: afterTheGroup
                ? afterTheGroup.getBoundingClientRect().top - wrapper.getBoundingClientRect().bottom
                : null,
            }
          : null,
      rows,
      rowContentBlocks: blocks.filter((block) => block.matches('.ui-data-table__row-content')).length,
      rowJunctions,
      ownContentJunctions,
      columnEdges,
      zeroWidthCells,
    };
  }, { wanted: target, region: options.region ?? SCREEN_REGION });
}

/**
 * The measurement once the screen has stopped moving: its content arrives with a
 * daemon read behind it.
 *
 * The list is brought into view first, as an operator brings it into view. Below
 * the desktop breakpoint the panels of a screen stack, so the second one starts
 * a screen-height down the document — and a row the window is not showing paints
 * nothing, which would be read as a clipped line rather than as a page waiting to
 * be scrolled.
 */
export async function settledList(
  page: Page,
  target: ListTarget,
  options: ListRegionOptions & { budget?: number } = {},
): Promise<ListGeometry> {
  const budget = options.budget ?? 20_000;
  const column = typeof target === 'string' ? target : 'nestedInside' in target ? target.nestedInside : null;
  const table =
    column !== null
      ? tableWithColumn(page, column, options)
      : page.locator(`${options.region ?? SCREEN_REGION} .ui-data-table`).nth((target as { index: number }).index);
  if ((await table.count()) > 0) await table.scrollIntoViewIfNeeded().catch(() => undefined);

  const deadline = Date.now() + budget;
  let previous = '';
  let current = await measureList(page, target, options);
  while (Date.now() < deadline) {
    const serialised = JSON.stringify(current);
    if (serialised === previous && current.found && current.rows.length > 0) return current;
    previous = serialised;
    await page.waitForTimeout(400);
    current = await measureList(page, target, options);
  }
  return current;
}

/** Everything one list's figures say, in one line per list, so the report is a comparison and not a pair of numbers. */
export function reportList(at: string, name: string, list: ListGeometry, tag = 'b1'): void {
  if (!list.found) {
    console.log(`[${tag}/REQ-2] ${at} ${name}: no such list on screen`);
    return;
  }
  const gaps = list.rowJunctions.map((junction) => round(junction.gap));
  const radii = list.rows.map((row) => round(row.carrierRadius));
  const heights = [...new Set(list.rows.map((row) => round(row.height)))];
  const inset = list.card ? `${round(list.table.x - list.card.x)} / ${round(list.card.right - list.table.right)}` : 'no card';
  console.log(
    `[${tag}/REQ-2] ${at} ${name}: ${list.rows.length} row(s), inter-row gaps ${JSON.stringify(gaps)}, radii ${JSON.stringify(
      radii,
    )}, ${list.enclosingSurfaces} enclosing surface(s) inside the region it is read in (${
      list.enclosingSurfacesToTheScreen
    } to the screen), ${list.surfacesInside} surface(s) inside the table`,
  );
  // The count that answers the regression this plan exists not to ship: content
  // below a row's cells, before and after (REQ-6).
  console.log(`[${tag}/REQ-6] ${at} ${name}: ${list.rowContentBlocks} content block(s) below the cells of ${list.rows.length} row(s)`);
  console.log(
    `[${tag}/REQ-39] ${at} ${name}: heights ${JSON.stringify(heights)}, align-items ${JSON.stringify([
      ...new Set(list.rows.map((row) => row.alignItems)),
    ])}, modifiers ${JSON.stringify([...new Set(list.rows.flatMap((row) => row.modifiers))])}`,
  );
  console.log(
    `[${tag}/REQ-40] ${at} ${name}: table ${describeBox(list.table)} in card ${
      list.card ? describeBox(list.card) : 'none'
    } — left/right inset ${inset}, card holds [${list.cardHolds.join(', ')}]`,
  );
  console.log(
    `[${tag}/REQ-5] ${at} ${name}: header-to-body column deltas ${JSON.stringify(
      list.columnEdges.map((column) => `${column.header || '·'}=${round(column.worstDelta)}`),
    )}`,
  );
  for (const row of list.rows.filter((candidate) => candidate.twoLine !== null).slice(0, 3)) {
    const lines = row.twoLine!;
    console.log(
      `[${tag}/REQ-8] ${at} ${name}: "${lines.title}" over "${lines.subtitle}" — painted ${round(lines.titleVisible)}/${round(
        lines.titleNatural,
      )}px and ${round(lines.subtitleVisible)}/${round(lines.subtitleNatural)}px in a ${round(row.height)}px row`,
    );
  }
}

/**
 * The four criteria of F1, on one list: rows flush, rows not cards, one
 * enclosing surface with the header inside it, and columns that do not drift.
 */
export function expectClassicTable(at: string, name: string, list: ListGeometry): void {
  expect(list.found, `${at} ${name}: the list is not on screen at all`).toBe(true);
  // The premise every junction assertion rests on: one row cannot be flush with anything.
  expect(list.rows.length, `${at} ${name}: fewer than two rows, so there is no junction to measure`).toBeGreaterThan(1);

  expectFlushRuledRows(at, name, list);

  // REQ-4 — one enclosing surface, with the header inside it and the rows continuous beneath it.
  expect(
    list.enclosingSurfaces,
    `${at} ${name}: the list sits inside ${list.enclosingSurfaces} surfaces`,
  ).toBe(1);
  expect(list.headerInsideCard, `${at} ${name}: the column header is not inside the list's own surface`).toBe(true);

  // REQ-5 — every header cell's left edge is its column's, at rest and at every pan offset.
  for (const column of list.columnEdges) {
    expect(
      column.worstDelta,
      `${at} ${name}: the ${column.header || 'unnamed'} column drifts ${round(column.worstDelta)}px from its header on "${column.worstRow}"`,
    ).toBeLessThanOrEqual(0.5);
  }
}

/**
 * REQ-2 and REQ-3 alone — rows flush, rows not cards, one hairline between two
 * of them.
 *
 * Stated apart from `expectClassicTable` because a **nested** list owes exactly
 * this half and cannot owe the other: it draws no header (`hideHeader`), so
 * there is no header to be inside a surface and no column edge to hold, and a
 * probe demanding them of it would fail on the contract rather than on the
 * build. What it does owe beyond this is `expectNestedByIndentationAlone`.
 */
export function expectFlushRuledRows(at: string, name: string, list: ListGeometry): void {
  expect(list.found, `${at} ${name}: the list is not on screen at all`).toBe(true);

  // REQ-2 — no inter-row gap, at any of the three viewports.
  for (const junction of list.rowJunctions) {
    expect(
      Math.abs(junction.gap),
      `${at} ${name}: ${round(junction.gap)}px of gap between ${junction.label}`,
    ).toBeLessThanOrEqual(0.5);
  }

  // REQ-3 — no row carries a corner, an outline, a shadow or a surface of its own…
  for (const row of list.rows) {
    expect(
      row.carrierRadius,
      `${at} ${name}: the row "${row.label}" carries a ${round(row.carrierRadius)}px corner`,
    ).toBe(0);
    expect(row.outline, `${at} ${name}: the row "${row.label}" carries an outline`).toMatch(/^(none|.* 0px)$/);
    expect(row.boxShadow, `${at} ${name}: the row "${row.label}" carries a shadow`).toBe('none');
    expect(row.isSurface, `${at} ${name}: the row "${row.label}" is drawn on a surface of its own`).toBe(false);
  }
  expect(list.surfacesInside, `${at} ${name}: the table holds ${list.surfacesInside} surface(s) of its own`).toBe(0);
  // …and two adjacent rows are separated by exactly one hairline.
  for (const junction of list.rowJunctions) {
    expect(
      junction.edges,
      `${at} ${name}: ${junction.edges} rule(s) between ${junction.label} — widths ${JSON.stringify(junction.widths)}`,
    ).toBe(1);
    expect(
      Math.max(...junction.widths),
      `${at} ${name}: the rule between ${junction.label} is ${Math.max(...junction.widths)}px and not a hairline`,
    ).toBeLessThanOrEqual(2);
  }
}

/**
 * REQ-39 — a converted row **is** the reference row: the same height, the same
 * vertical alignment and the same set of modifiers as a row of the containers
 * and images lists, read from those lists as they stand.
 */
export function expectSameRowAsReference(
  at: string,
  name: string,
  list: ListGeometry,
  references: { name: string; list: ListGeometry }[],
): void {
  for (const reference of references) {
    expect(reference.list.found, `${at}: the ${reference.name} reference list is not on screen`).toBe(true);
    expect(reference.list.rows.length, `${at}: the ${reference.name} reference list has no row to measure`).toBeGreaterThan(0);
    const referenceRow = reference.list.rows[0];

    for (const row of list.rows) {
      expect(
        round(row.height),
        `${at} ${name}: the row "${row.label}" is ${round(row.height)}px tall against the ${reference.name} row's ${round(
          referenceRow.height,
        )}px`,
      ).toBe(round(referenceRow.height));
      expect(
        row.alignItems,
        `${at} ${name}: the row "${row.label}" aligns ${row.alignItems} against the ${reference.name} row's ${referenceRow.alignItems}`,
      ).toBe(referenceRow.alignItems);
      expect(
        row.modifiers,
        `${at} ${name}: the row "${row.label}" states ${JSON.stringify(row.modifiers)} against the ${
          reference.name
        } row's ${JSON.stringify(referenceRow.modifiers)}`,
      ).toEqual(referenceRow.modifiers);
    }
  }
}

/**
 * REQ-40 — the table runs edge to edge in **one unpadded card holding it and
 * nothing else**, the section header above rather than inside it, and the
 * reference's own inset is what "edge to edge" means.
 *
 * **A list nested in the panel one of its parent's rows opened is not measured
 * this way, and must not be**: it takes no card of its own, being already inside
 * its parent list's, and a card inside a card is two surfaces where REQ-4 admits
 * one. `expectNestedWithoutACardOfItsOwn` is what that list owes instead.
 */
export function expectEdgeToEdgeInItsOwnCard(
  at: string,
  name: string,
  list: ListGeometry,
  references: { name: string; list: ListGeometry }[],
): void {
  expect(list.card, `${at} ${name}: the list sits in no surface at all`).not.toBeNull();
  const card = list.card!;
  const left = list.table.x - card.x;
  const right = card.right - list.table.right;
  for (const [edge, inset] of [
    ['left', left],
    ['right', right],
  ] as const) {
    expect(
      Math.abs(inset),
      `${at} ${name}: the table's ${edge} edge is ${round(inset)}px inside its card's — the reference's own is ${round(
        references[0].list.table.x - (references[0].list.card?.x ?? 0),
      )}px`,
    ).toBeLessThanOrEqual(1);
  }
  expect(
    list.sectionHeaderInsideCard,
    `${at} ${name}: the panel's section header is inside the list's card, where the reference puts it above`,
  ).toBe(false);
  expect(
    list.cardHolds.length,
    `${at} ${name}: the card holds ${list.cardHolds.length} children — [${list.cardHolds.join(', ')}] — where the reference's holds the table alone`,
  ).toBe(1);
}

/**
 * REQ-39 and REQ-40 together — the equality the plan was rejected for the first
 * time, stated as a comparison against the reference lists read in the same run.
 */
export function expectSameTableAsReference(
  at: string,
  name: string,
  list: ListGeometry,
  references: { name: string; list: ListGeometry }[],
): void {
  expectSameRowAsReference(at, name, list, references);
  expectEdgeToEdgeInItsOwnCard(at, name, list, references);
}

/**
 * REQ-4, REQ-12, REQ-40 — a converted list **read inside a dialog**: the
 * efficiency & signals view's three, the only ones in the plan that do not live
 * on a screen.
 *
 * What it asserts, and why each half is the shape it is:
 *
 * - **The dialog is the region, and it is there.** A dialog that never opened
 *   matches no region and two open dialogs match two, so the count is asserted
 *   before anything is read from it: a probe that fell back to the screen would
 *   measure the list *behind* the dialog and report it green.
 * - **The list's own enclosing surface is one card, and the dialog adds exactly
 *   one more.** The surface a dialog draws is the dialog — every dialog in the
 *   product draws it, no list took it, and no list can give it up without the
 *   library changing. So REQ-4's "exactly one" is counted inside the dialog, and
 *   the difference to the screen's count is asserted to be **exactly 1**: a
 *   section that wrapped its list in a surface of its own, or a card nested in a
 *   card, appears here as 2 rather than being absorbed by the boundary.
 * - **One scrollbar, not two.** These lists state no `maxHeight`, so the box
 *   inside the table scrolls nothing and the dialog is what pans vertically. A
 *   list that grew a vertical scroll of its own inside a dialog that scrolls is
 *   the arrangement this batch exists to check.
 * - **Nothing is clipped by the dialog's own edge.** The table's left and right
 *   edges lie inside the dialog's visible box: a list wider than the dialog pans
 *   inside it (`overflow-x: auto`) instead of being cut off by it.
 */
export function expectListInsideADialog(at: string, name: string, list: ListGeometry): void {
  expect(list.regionMatches, `${at} ${name}: ${list.regionMatches} dialog(s) match the region this list is read in`).toBe(1);
  expect(list.found, `${at} ${name}: the list is not inside the dialog at all`).toBe(true);
  expect(
    list.enclosingSurfaces,
    `${at} ${name}: the list sits inside ${list.enclosingSurfaces} surface(s) within the dialog`,
  ).toBe(1);
  expect(
    list.enclosingSurfacesToTheScreen - list.enclosingSurfaces,
    `${at} ${name}: ${list.enclosingSurfacesToTheScreen} surface(s) stand between the table and the screen against ${list.enclosingSurfaces} inside the dialog — the dialog's own is one, and there is another`,
  ).toBe(1);
  expect(
    list.innerScroll.scrollHeight,
    `${at} ${name}: the list holds ${round(list.innerScroll.scrollHeight)}px in ${round(
      list.innerScroll.clientHeight,
    )}px of its own, so it scrolls vertically inside a dialog that scrolls vertically`,
  ).toBeLessThanOrEqual(list.innerScroll.clientHeight + 0.5);

  const dialog = list.regionBox!;
  expect(
    round(list.table.x - dialog.x),
    `${at} ${name}: the table starts at x=${round(list.table.x)} where the dialog's own box starts at ${round(dialog.x)}`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    round(dialog.right - list.table.right),
    `${at} ${name}: the table ends at x=${round(list.table.right)} where the dialog's own box ends at ${round(
      dialog.right,
    )} — the dialog's edge is cutting the list`,
  ).toBeGreaterThanOrEqual(0);
}

/**
 * REQ-40, for a list **nested inside the panel a row of another list opened** —
 * compose's per-project services, swarm's per-service tasks.
 *
 * It takes **no card of its own**: it is already inside its parent list's card,
 * and a card inside a card is two surfaces where REQ-4 admits one. So the
 * assertion is the nesting rather than the inset: the same one enclosing surface
 * as its parent, no surface of its own between the two, and the whole of it
 * drawn inside its parent's expansion. That is how the reference nests a list in
 * a panel (`ContainerProcessesView`, `LayerExplorer`).
 */
export function expectNestedWithoutACardOfItsOwn(at: string, name: string, list: ListGeometry, parentName: string): void {
  expect(list.found, `${at} ${name}: the nested list is not on screen at all`).toBe(true);
  expect(
    list.nestedInAnExpansion,
    `${at} ${name}: it is not drawn inside the panel a row of the ${parentName} list opened`,
  ).toBe(true);
  expect(
    list.enclosingSurfaces,
    `${at} ${name}: it sits inside ${list.enclosingSurfaces} surfaces where the ${parentName} list's own card is the only one admitted`,
  ).toBe(1);
  // The one surface it is inside is still the parent's card holding the parent's
  // table and nothing else: a card taken for the nested list would appear here as
  // a second child, or as a second enclosing surface above.
  expect(
    list.cardHolds.length,
    `${at} ${name}: the ${parentName} list's card holds ${list.cardHolds.length} children — [${list.cardHolds.join(
      ', ',
    )}] — so something took a surface of its own inside it`,
  ).toBe(1);
  // Its own heading is **not** what REQ-40 puts above a card: a nested list is
  // labelled inside the panel it is read in, exactly as the reference labels one
  // (`ContainerProcessesView`, `LayerExplorer`). So `sectionHeaderInsideCard` is
  // true here by construction and is deliberately not asserted against — saying
  // it must be false would demand of a nested list the screen composition that
  // only a screen list owes.
}

/**
 * The library's own spacing step, read from the running build in the same run.
 *
 * REQ-7's indentation is "one spacing step from the tokens", so the check asks
 * the tokens what that is instead of carrying 16 as a figure of its own: a
 * number written into a spec rots the day the token legitimately changes, and
 * what has to hold is that the inset **is** the step, whatever it becomes.
 *
 * **It refuses to answer zero**, and that is not defensiveness: a page that has
 * not loaded the application states no token at all, so the probe would hand
 * back `0` and every "is the child inset by one step?" assertion below would
 * become "is the child inset by nothing?" — an assertion that passes on a build
 * with no indentation whatever. Asked too early it says so, naming the cause,
 * instead of quietly inverting what it is asked.
 */
export async function spacingStep(page: Page, token = '--space-4'): Promise<number> {
  const step = await page.evaluate(
    (name) => Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0,
    token,
  );
  expect(
    step,
    `the page states no ${token}: the application is not loaded here, so a spacing step read from it would be 0`,
  ).toBeGreaterThan(0);
  return step;
}

/**
 * REQ-7 — a list drawn **inside a row of another list**, in that row's content
 * slot, is a child by its **indentation** and by nothing else.
 *
 * Everything here is read against the row that carries this very list, in the
 * same pass, so "one step past its parent's cells" is a measurement and not two.
 * What it asserts, in the order the requirement states it:
 *
 * - it is inside the **same** surface as its parent and takes none of its own;
 * - a child row's box begins one spacing step inside a parent **cell's** left
 *   edge, and a child cell sits one further step in — the parent's own row→cell
 *   inset, read from the parent, so the child differs by the indentation and by
 *   nothing else;
 * - the child rows are **not** on the parent's tracks at the parent's inset,
 *   which is what makes two levels legible at a glance rather than one run of
 *   rows (REQ-7's substance);
 * - the parent row and its first child are flush, as any two rows are (REQ-2);
 * - and the group is closed by **one** full-width hairline, the wrapper's, the
 *   last child having given up its own. **That junction is read on the wrapper
 *   and never on that last child row**: a probe reading the row measures a
 *   missing rule and is wrong about it.
 */
export function expectNestedByIndentationAlone(at: string, name: string, list: ListGeometry, step: number): void {
  expect(list.found, `${at} ${name}: the nested list is not on screen at all`).toBe(true);
  expect(
    list.carrier,
    `${at} ${name}: it is not drawn in the content slot of a row of another list at all`,
  ).not.toBeNull();
  const carrier = list.carrier!;
  expect(list.rows.length, `${at} ${name}: the nested list draws no row to measure`).toBeGreaterThan(0);
  expect(carrier.rowCellXs.length, `${at} ${name}: the row carrying it draws no cell to be inset from`).toBeGreaterThan(0);

  // The one surface is the parent list's card; the nested list takes none.
  expect(
    list.enclosingSurfaces,
    `${at} ${name}: it sits inside ${list.enclosingSurfaces} surfaces where its parent list's own card is the only one admitted`,
  ).toBe(1);
  expect(
    list.surfacesInside,
    `${at} ${name}: the nested list holds ${list.surfacesInside} surface(s) of its own`,
  ).toBe(0);

  const parentCellX = carrier.rowCellXs[0];
  const parentRowToCell = parentCellX - carrier.rowBox.x;
  for (const row of list.rows) {
    expect(
      round(row.box.x - parentCellX),
      `${at} ${name}: the child row "${row.label}" begins ${round(row.box.x - parentCellX)}px inside the "${
        carrier.rowLabel
      }" row's own cells, where the library's one spacing step is ${round(step)}px`,
    ).toBe(round(step));
    expect(row.cellXs.length, `${at} ${name}: the child row "${row.label}" draws no cell`).toBeGreaterThan(0);
    expect(
      round(row.cellXs[0] - row.box.x),
      `${at} ${name}: the child row "${row.label}" insets its own cells by ${round(
        row.cellXs[0] - row.box.x,
      )}px against the parent row's ${round(parentRowToCell)}px — a child differs by its indentation and by nothing else`,
    ).toBe(round(parentRowToCell));
    // REQ-7's substance: standing back, this is not one more row of the parent list.
    expect(
      row.cellXs[0] - parentCellX,
      `${at} ${name}: the child row "${row.label}" draws its first cell on the parent's own track, so the two levels read as one run of rows`,
    ).toBeGreaterThan(step / 2);
  }

  // REQ-2 across the junction the card used to make: the parent row and its first child are flush.
  const first = list.rows[0];
  expect(
    Math.abs(first.box.y - carrier.rowBox.bottom),
    `${at} ${name}: ${round(first.box.y - carrier.rowBox.bottom)}px of gap between the "${carrier.rowLabel}" row and the first of its children`,
  ).toBeLessThanOrEqual(0.5);

  // The group's closing hairline is the wrapper's, full width, and it is the only one there.
  expect(
    carrier.contentBorderBottom,
    `${at} ${name}: the group under "${carrier.rowLabel}" is closed by a ${round(carrier.contentBorderBottom)}px rule`,
  ).toBeGreaterThan(0);
  expect(
    carrier.contentBorderBottom,
    `${at} ${name}: the rule closing the group under "${carrier.rowLabel}" is ${round(
      carrier.contentBorderBottom,
    )}px and not a hairline`,
  ).toBeLessThanOrEqual(2);
  expect(
    carrier.lastChildBorderBottom,
    `${at} ${name}: the last child of "${carrier.rowLabel}" draws a rule of its own under the group's, so the two are drawn one above the other`,
  ).toBe(0);
  expect(
    round(carrier.contentPaddingBottom),
    `${at} ${name}: the wrapper under "${carrier.rowLabel}" keeps ${round(
      carrier.contentPaddingBottom,
    )}px of padding below its last child, which is a gap between two levels of one list`,
  ).toBe(0);
  expect(
    round(carrier.contentBox.x),
    `${at} ${name}: the group's closing rule starts at x=${round(carrier.contentBox.x)} against the "${
      carrier.rowLabel
    }" row's own ${round(carrier.rowBox.x)} — it is the group's, so it runs the row's full width`,
  ).toBe(round(carrier.rowBox.x));
  expect(
    round(carrier.contentBox.right),
    `${at} ${name}: the group's closing rule ends at x=${round(carrier.contentBox.right)} against the "${
      carrier.rowLabel
    }" row's own ${round(carrier.rowBox.right)}`,
  ).toBe(round(carrier.rowBox.right));
  if (carrier.nextBlockGap !== null) {
    expect(
      Math.abs(carrier.nextBlockGap),
      `${at} ${name}: ${round(carrier.nextBlockGap)}px of gap between the group under "${carrier.rowLabel}" and the ${
        carrier.nextBlockLabel
      } drawn after it`,
    ).toBeLessThanOrEqual(0.5);
  }
}

/**
 * REQ-7, REQ-12 — parent and child are **one** pan region, under one scrollbar.
 *
 * `overflow-x: visible` on the nested list is what makes that true, and it is
 * asserted as the property it is: `auto` would make the child a scroll container
 * of its own, and a scroll container hands none of its minimums upward — at a
 * width neither fits, the parent would pan while the child sat still on a
 * scrollbar of its own.
 */
export function expectOnePanRegionWithItsParent(at: string, name: string, list: ListGeometry): void {
  expect(list.found, `${at} ${name}: the nested list is not on screen at all`).toBe(true);
  expect(
    list.overflowX,
    `${at} ${name}: the nested list computes \`overflow-x: ${list.overflowX}\`, so it is a pan region of its own`,
  ).toBe('visible');
  expect(
    list.scrollWidth,
    `${at} ${name}: it holds ${list.scrollWidth}px of row in ${list.clientWidth}px of its own, so it is scrolling something its parent cannot`,
  ).toBeLessThanOrEqual(list.clientWidth + 0.5);
  expect(list.zeroWidthCells, `${at} ${name}: a cell is in the DOM and nowhere on screen`).toEqual([]);
}

/** A nested list's figures, in one line, so the report is a comparison and not a pair of numbers. */
export function reportNestedList(at: string, name: string, list: ListGeometry, step: number, tag = 'b3'): void {
  if (!list.found || list.carrier === null) {
    console.log(`[${tag}/REQ-7] ${at} ${name}: no nested list drawn in a row's content slot`);
    return;
  }
  const carrier = list.carrier;
  const parentCellX = carrier.rowCellXs[0] ?? Number.NaN;
  console.log(
    `[${tag}/REQ-7] ${at} ${name} under "${carrier.rowLabel}": ${list.rows.length} child row(s); ` +
      `child row x=${round(list.rows[0]?.box.x ?? Number.NaN)} against the parent cell's ${round(parentCellX)} ` +
      `(+${round((list.rows[0]?.box.x ?? Number.NaN) - parentCellX)}px, one spacing step being ${round(step)}px), ` +
      `child cell +${round((list.rows[0]?.cellXs[0] ?? Number.NaN) - parentCellX)}px inside it; ` +
      `${list.enclosingSurfaces} enclosing surface(s), ${list.surfacesInside} inside; ` +
      `overflow-x ${list.overflowX}, ${list.scrollWidth}px of row in ${list.clientWidth}px`,
  );
  console.log(
    `[${tag}/REQ-2] ${at} ${name} under "${carrier.rowLabel}": parent→first child ${round(
      (list.rows[0]?.box.y ?? Number.NaN) - carrier.rowBox.bottom,
    )}px, child→child ${JSON.stringify(list.rowJunctions.map((junction) => round(junction.gap)))}; ` +
      `the group closed by the wrapper's ${round(carrier.contentBorderBottom)}px rule over the last child's own ${round(
        carrier.lastChildBorderBottom,
      )}px, ${round(carrier.contentPaddingBottom)}px of padding under it, ${
        carrier.nextBlockGap === null ? 'nothing' : `${round(carrier.nextBlockGap)}px`
      } to the ${carrier.nextBlockLabel ?? 'next block'}`,
  );
}

/**
 * REQ-8 — every line a two-line row shows is painted in full inside the
 * reference's own row.
 *
 * Only rows the browser is actually drawing in full are judged: a row scrolled
 * out of the window that holds it paints nothing, which is the window's doing and
 * not the row's. What REQ-8 is about is a line lost **inside** a row that is on
 * screen, and that is what the rows below are measured for.
 */
export function expectBothLinesUnclipped(at: string, name: string, list: ListGeometry, mustSay?: string): void {
  const twoLineRows = list.rows.filter((row) => row.twoLine !== null && row.fullyVisible);
  expect(twoLineRows.length, `${at} ${name}: no row on screen draws a title over a subtitle`).toBeGreaterThan(0);
  for (const row of twoLineRows) {
    const lines = row.twoLine!;
    expect(lines.title.length, `${at} ${name}: a two-line row draws an empty title`).toBeGreaterThan(0);
    expect(lines.subtitle.length, `${at} ${name}: the row "${lines.title}" draws no second line`).toBeGreaterThan(0);
    expect(
      lines.titleVisible,
      `${at} ${name}: "${lines.title}" is painted ${round(lines.titleVisible)}px of ${round(lines.titleNatural)}px`,
    ).toBeGreaterThanOrEqual(lines.titleNatural - 0.5);
    expect(
      lines.subtitleVisible,
      `${at} ${name}: "${lines.subtitle}" under "${lines.title}" is painted ${round(lines.subtitleVisible)}px of ${round(
        lines.subtitleNatural,
      )}px`,
    ).toBeGreaterThanOrEqual(lines.subtitleNatural - 0.5);
  }
  if (mustSay !== undefined) {
    // Beside the boxes, never instead of them: the line the human asked to read.
    // Over every row of the list, not only the ones the window happens to be
    // showing — where the fixture's own row falls is the viewport's business.
    expect(
      list.rows.some((row) => row.twoLine?.subtitle.includes(mustSay) ?? false),
      `${at} ${name}: no row states ${mustSay} on its second line`,
    ).toBe(true);
  }
}

/**
 * REQ-12 — a list wider than the box it is read in pans, and the pan brings its
 * last column fully into view.
 *
 * Driven by a **real wheel** over a row of the list, never by assigning
 * `scrollLeft`: the pan region writes its own geometry from the scroll event, so
 * a probe that moves the grid itself reads a position no operator can reach.
 */
export async function expectPanReachesLastColumn(page: Page, column: string, label: string, tag = 'b1'): Promise<void> {
  const table = tableWithColumn(page, column);
  const firstRow = table.locator('.ui-data-table__row').first();
  await firstRow.scrollIntoViewIfNeeded();
  const rowBox = (await firstRow.boundingBox())!;
  await page.mouse.move(rowBox.x + Math.min(60, rowBox.width / 2), rowBox.y + rowBox.height / 2);

  let previous = -1;
  for (let step = 0; step < 20; step += 1) {
    await page.mouse.wheel(120, 0);
    await page.waitForTimeout(150);
    const offset = await table.evaluate((element) => Math.round((element as HTMLElement).scrollLeft));
    if (offset === previous) break;
    previous = offset;
  }

  const reached = await table.evaluate((element) => {
    const region = element.getBoundingClientRect();
    const cells = Array.from(element.querySelectorAll('.ui-data-table__row')[0]?.querySelectorAll('.ui-data-table__cell') ?? []);
    const last = cells[cells.length - 1]!.getBoundingClientRect();
    return {
      scrollLeft: Math.round((element as HTMLElement).scrollLeft),
      inside: last.left >= region.left - 1 && last.right <= region.right + 1,
      width: Math.round(last.width * 10) / 10,
    };
  });
  console.log(
    `[${tag}/REQ-12] ${label}: a wheel pans it to scrollLeft ${reached.scrollLeft}, last column ${reached.width}px, inside the region: ${reached.inside}`,
  );
  expect(reached.scrollLeft, `${label}: the list refuses to pan under a real wheel`).toBeGreaterThan(0);
  expect(reached.inside, `${label}: the pan does not bring the last column into view`).toBe(true);
}

/** The table carrying a column only it has — the handle every locator here is built on. */
export function tableWithColumn(page: Page, column: string, options: ListRegionOptions = {}): Locator {
  return page
    .locator(`${options.region ?? SCREEN_REGION} .ui-data-table`)
    .filter({ has: page.locator('.ui-data-table__header-cell', { hasText: column }) })
    .first();
}

/**
 * How many lists the region draws, **once the number has stopped changing**.
 *
 * A screen's content arrives with a daemon read behind it, and a list drawn
 * inside a *row* of another one appears only when that row does: on compose the
 * count goes from one to three as the projects arrive. A sweep that counted
 * before the read returned would walk one list, measure it, and report the screen
 * swept — which is the empty-premise failure one level up, since what went
 * unmeasured is exactly what nobody enumerated.
 */
async function listCountOnceItStops(page: Page, region: string, budget = 20_000): Promise<number> {
  const tables = page.locator(`${region} .ui-data-table`);
  const deadline = Date.now() + budget;
  let previous = -1;
  let current = await tables.count();
  while (Date.now() < deadline) {
    if (current > 0 && current === previous) return current;
    previous = current;
    await page.waitForTimeout(500);
    current = await tables.count();
  }
  return current;
}

/**
 * **Every list the region draws, without naming one** — what the product-wide
 * sweep walks with (`b4/INT-4`, REQ-39, REQ-40).
 *
 * A sweep that knew its lists by name could not find the one nobody enumerated,
 * and that is precisely the list it exists for: "written as a walk over the
 * screens rather than as a list of hard-coded cases, so a screen added later is
 * covered by it". So each list is reached by its **position** in the region and
 * named afterwards by what it draws — the section header above it where a screen
 * draws one, otherwise the columns it states.
 *
 * Each is measured in a pass of its own, after being brought into view, so a
 * list below the fold is judged on rows the browser has actually painted.
 */
export async function measureEveryList(page: Page, options: ListRegionOptions = {}): Promise<{ name: string; list: ListGeometry }[]> {
  const region = options.region ?? SCREEN_REGION;
  const count = await listCountOnceItStops(page, region);
  const measured: { name: string; list: ListGeometry }[] = [];
  for (let index = 0; index < count; index += 1) {
    const list = await settledList(page, { index }, options);
    const nested = list.tableClasses.includes('ui-data-table--nested');
    const name =
      (nested ? null : list.precedingSectionHeader) ??
      (list.headers.length > 0 ? list.headers.join('/') : `list #${index}`);
    measured.push({ name: `${name}${nested ? ' (nested)' : ''}`, list });
  }
  return measured;
}
