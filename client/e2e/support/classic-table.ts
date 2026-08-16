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
  headers: string[];
  table: Box;
  /** The column header's own band, so the distance from a label to its values can be read. */
  headerBox: Box | null;
  clientWidth: number;
  scrollWidth: number;
  /** The table's own enclosing surface — the card of REQ-40 — and what else it holds. */
  card: Box | null;
  cardClasses: string[];
  cardHolds: string[];
  /** `.ui-surface` boundaries between the table and the screen's content region (REQ-4). */
  enclosingSurfaces: number;
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
 * Every figure of one list, in a single pass, so that no two numbers come from
 * two layouts.
 *
 * The list is found by a column header only it carries, and everything below is
 * geometry the browser reports — never a class name standing in for a
 * measurement, except where the class *is* the contract (REQ-39's "the same set
 * of row modifiers").
 */
export async function measureList(page: Page, column: string): Promise<ListGeometry> {
  return await page.evaluate((wantedHeader) => {
    const empty: ListGeometry = {
      found: false,
      headers: [],
      table: { x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0 },
      headerBox: null,
      clientWidth: 0,
      scrollWidth: 0,
      card: null,
      cardClasses: [],
      cardHolds: [],
      enclosingSurfaces: 0,
      surfacesInside: 0,
      headerInsideCard: false,
      sectionHeaderInsideCard: false,
      nestedInAnExpansion: false,
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
      }
      return { visible: Math.max(0, bottom - top), natural: raw.height };
    };

    const tables = Array.from(document.querySelectorAll<HTMLElement>('.ui-frame__content .ui-data-table'));
    // A header cell **of this table**, not of one nested inside it: a list drawn
    // in the panel one of its rows opened carries its own header, and a probe
    // that did not scope the match would hand back the outer table for the
    // inner one's column name.
    const table = tables.find((candidate) =>
      Array.from(candidate.querySelectorAll('.ui-data-table__header-cell')).some(
        (cell) => cell.closest('.ui-data-table') === candidate && (cell.textContent ?? '').trim() === wantedHeader,
      ),
    );
    if (!table) return empty;

    const headerCells = Array.from(
      table.querySelectorAll<HTMLElement>('.ui-data-table__header-cell:not(.ui-data-table__select-cell)'),
    ).filter((cell) => cell.closest('.ui-data-table') === table);
    const headerElement = table.querySelector<HTMLElement>('.ui-data-table__header');
    const card = table.closest('.ui-surface');

    // How many surface boundaries stand between the table and the screen's own
    // content region: REQ-4 admits exactly one.
    let enclosingSurfaces = 0;
    for (let node: Element | null = table.parentElement; node !== null && !node.matches('.ui-frame__content'); node = node.parentElement) {
      if (node.matches('.ui-surface')) enclosingSurfaces += 1;
    }

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

    return {
      found: true,
      headers: headerCells.map((cell) => (cell.textContent ?? '').trim()),
      table: box(table),
      headerBox: headerElement ? box(headerElement) : null,
      clientWidth: table.clientWidth,
      scrollWidth: table.scrollWidth,
      card: card ? box(card) : null,
      cardClasses: card ? Array.from(card.classList) : [],
      cardHolds: card
        ? Array.from(card.children).map((child) => child.className || child.tagName.toLowerCase())
        : [],
      enclosingSurfaces,
      surfacesInside: table.querySelectorAll('.ui-surface').length,
      headerInsideCard: card !== null && headerElement !== null && card.contains(headerElement),
      sectionHeaderInsideCard: card !== null && card.querySelector('.ui-section-header') !== null,
      nestedInAnExpansion: table.closest('.ui-data-table__expanded') !== null,
      rows,
      rowContentBlocks: blocks.filter((block) => block.matches('.ui-data-table__row-content')).length,
      rowJunctions,
      ownContentJunctions,
      columnEdges,
      zeroWidthCells,
    };
  }, column);
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
export async function settledList(page: Page, column: string, budget = 20_000): Promise<ListGeometry> {
  const table = page
    .locator('.ui-frame__content .ui-data-table')
    .filter({ has: page.locator('.ui-data-table__header-cell', { hasText: column }) })
    .first();
  if ((await table.count()) > 0) await table.scrollIntoViewIfNeeded().catch(() => undefined);

  const deadline = Date.now() + budget;
  let previous = '';
  let current = await measureList(page, column);
  while (Date.now() < deadline) {
    const serialised = JSON.stringify(current);
    if (serialised === previous && current.found && current.rows.length > 0) return current;
    previous = serialised;
    await page.waitForTimeout(400);
    current = await measureList(page, column);
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
    )}, ${list.enclosingSurfaces} enclosing surface(s), ${list.surfacesInside} surface(s) inside the table`,
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
export function tableWithColumn(page: Page, column: string): Locator {
  return page
    .locator('.ui-frame__content .ui-data-table')
    .filter({ has: page.locator('.ui-data-table__header-cell', { hasText: column }) })
    .first();
}
