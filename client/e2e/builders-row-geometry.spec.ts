/**
 * F8 — the builders and build-cache screen, measured
 * (`plan-ui-coherence-optimisation/REQ-39`, `REQ-40`, `REQ-41`;
 * `builders/specs/builders-screen.md`).
 *
 * Every claim here is about **boxes**. A row that has lost a line, a cluster
 * that has stopped consuming the row, a cell that no longer paints over its
 * neighbour — none of them change what the row says; what they change is where
 * its rectangles are (CLAUDE.md, "What a check drives, and what it measures").
 * So the assertions are on viewport boxes, on the computed tracks, and on
 * painted ink intersected against the cells beside it.
 *
 * **The inventory is stubbed, deliberately.** The two things this screen has to
 * draw and a daemon will not produce on demand are a builder whose endpoint is
 * its own name (REQ-40's whole subject — the `docker` driver reports the
 * context its node answers on), and a cache list holding records both with and
 * without a recorded build step, which is what made two row heights alternate
 * down 151 rows. Building either on the operator's own daemon would mean
 * creating builders, switching the active one and running builds, all of which
 * this machine's state is not ours to move. The screen's daemon-backed
 * behaviour — create, remove, select the active builder, prune — stays in
 * `builders.spec.ts`, against the real thing.
 *
 * Nothing is created on the daemon by this file, and nothing on it is read: the
 * two inventory endpoints are answered from the fixture below.
 *
 * Every control driven here is driven with a **real pointer at the visible
 * control's own coordinates**, and a row is clicked on its **first cell**: below
 * the desktop breakpoint a row is wider than the box it is read in, so its own
 * centre can sit over the action cluster.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { boxOf, boxesOf, centreOf, clickAtItsCentre, movePointerOverTheRow, readOnceSettled, twoFrames } from './support/settled.js';
import { pressUntilItTakes } from './support/delivered-press.js';

interface Viewport {
  width: number;
  height: number;
}

/** The three viewports this plan is written against. */
const VIEWPORTS: Viewport[] = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
];

interface FixtureBuilder {
  name: string;
  driver: string;
  endpoint: string;
  platforms: string[];
  status: string;
  active: boolean;
  cacheBytes?: number;
}

interface FixtureRecord {
  id: string;
  type: string;
  sizeBytes: number;
  usageState: 'shared' | 'in-use' | 'reclaimable';
  description?: string;
}

/**
 * One builder per state the row has to draw: the active one and the idle ones,
 * an endpoint that is the builder's own name and endpoints that are not, a
 * reported cache size and one the builder did not report, a long platform list
 * and none at all.
 */
const FIXTURE_BUILDERS: FixtureBuilder[] = [
  {
    name: 'desktop-linux',
    driver: 'docker',
    endpoint: 'desktop-linux',
    platforms: ['linux/amd64', 'linux/amd64/v2', 'linux/amd64/v3', 'linux/arm64', 'linux/ppc64le', 'linux/s390x'],
    status: 'running',
    active: true,
  },
  {
    name: 'vexel-fixture-multiarch',
    driver: 'docker-container',
    endpoint: 'desktop-linux',
    platforms: ['linux/amd64', 'linux/arm64'],
    status: 'running',
    active: false,
    cacheBytes: 16_148_070,
  },
  {
    name: 'vexel-fixture-remote-builder-with-a-long-name',
    driver: 'remote',
    endpoint: 'tcp://build01.internal.example.test:1234',
    platforms: [],
    status: 'inactive',
    active: false,
    cacheBytes: 0,
  },
  {
    name: 'vexel-fixture-kube',
    driver: 'kubernetes',
    // Deliberately not naming the builder: REQ-40 is counted on the row's text, and an endpoint
    // that happens to embed the name would count as a second statement of it without being one.
    endpoint: 'kubernetes:///cluster-07?deployment=builder',
    platforms: ['linux/amd64'],
    status: 'unknown',
    active: false,
  },
];

/** The longest build step the screen has had to draw, kept as one unbroken line. */
const LONG_BUILD_STEP =
  'RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund && npm run build --workspace client && npm run build --workspace server && node ./scripts/postbuild.mjs --verify --emit-manifest --strip-debug --target linux/amd64 --out /srv/app/dist';

/**
 * Sixteen records, alternating between those carrying a recorded build step and
 * those carrying none — the shape the two row heights were measured on.
 */
const FIXTURE_RECORDS: FixtureRecord[] = Array.from({ length: 16 }, (_, index) => {
  const withStep = index % 2 === 0;
  return {
    id: `sha256:${String(index).padStart(2, '0')}${'0123456789abcdef'.repeat(3)}`,
    type: withStep ? 'regular' : index % 3 === 0 ? 'source.local' : 'exec.cachemount',
    sizeBytes: (index + 1) * 1_048_576,
    usageState: (['shared', 'in-use', 'reclaimable'] as const)[index % 3],
    description: withStep ? (index === 0 ? LONG_BUILD_STEP : `RUN step number ${index} of the fixture build`) : undefined,
  };
});

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CellGeometry {
  /** The column this cell belongs to, by the header naming it. */
  header: string;
  text: string;
  box: Box;
  /** Painted width lost to the ellipsis, summed over the cell's truncating lines. */
  clipped: number;
  /** Lines the cell draws, whatever they say. */
  lines: number;
}

interface RowGeometry {
  label: string;
  text: string;
  box: Box;
  /** The row's own computed `grid-template-columns`: one row layout per table, or none. */
  computed: string;
  cells: CellGeometry[];
  /** One entry per pair of cells whose painted ink and box intersect. */
  collisions: string[];
}

interface ListGeometry {
  card: Box;
  list: Box;
  listClientWidth: number;
  listScrollWidth: number;
  headers: string[];
  headerCells: Box[];
  headerComputed: string;
  rows: RowGeometry[];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function describeBox(box: Box): string {
  return `x=${round(box.x)}, y=${round(box.y)}, ${round(box.width)}×${round(box.height)}`;
}

/**
 * The region a list is read in, named by the section header titling it.
 *
 * Named by **what it holds** rather than by the surface it used to be: each
 * section's header and toolbar sit **above** the one unpadded card holding its
 * list (`builders-screen.md`, and
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`),
 * so a card can no longer be found by the heading it used to hold. A panel is
 * the innermost region carrying both the heading and the list; every region
 * matching contains the same heading and is therefore an ancestor of the next,
 * so the last in document order is the panel's own — and on a screen still drawn
 * the old way that is its card. The **card** itself is still what is measured;
 * it is resolved from the table inside `measureList`.
 */
function panel(page: Page, title: 'builders' | 'cache'): Locator {
  const heading = title === 'builders' ? /^buildx builders$/ : /^Build cache$/;
  return page
    .locator('.ui-frame__content')
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: heading }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

/**
 * Every row of a list, cell by cell, in one pass — so no two figures come from
 * two layouts — with each cell's **painted** ink intersected against the boxes
 * of the cells beside it.
 */
/**
 * The same reading, **once the layout has come to rest** — which is what every
 * caller in this file gets by asking for `measureList`.
 *
 * The single `evaluate` below is what stops two figures coming from two frames;
 * it is not what stops the whole reading coming from a frame nobody sees. Those
 * are different guarantees, and this file had only the first (`support/settled.ts`,
 * "the limits"). The comparator is the whole geometry object: everything read in
 * the pass has to agree between samples, since that is what a caller compares.
 */
async function measureList(page: Page, title: 'builders' | 'cache'): Promise<ListGeometry> {
  return await readOnceSettled(
    page,
    () => measureListThisFrame(page, title),
    (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
  );
}

/** **One frame, and no test calls it**: the sampler above is built out of it. */
async function measureListThisFrame(page: Page, title: 'builders' | 'cache'): Promise<ListGeometry> {
  return await panel(page, title).evaluate((card) => {
    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };

    // A rectangle is cut down by every ancestor that clips, the element itself
    // included: without this an ellipsised line measures its full laid-out
    // length and a collision is reported that is nowhere painted.
    const clip = (raw: DOMRect, from: Element | null): Box | null => {
      let { top, bottom, left, right } = raw;
      for (let node: Element | null = from; node !== null; node = node.parentElement) {
        const style = getComputedStyle(node);
        const owner = node.getBoundingClientRect();
        if (style.overflowX !== 'visible') {
          left = Math.max(left, owner.left);
          right = Math.min(right, owner.right);
        }
        if (style.overflowY !== 'visible') {
          top = Math.max(top, owner.top);
          bottom = Math.min(bottom, owner.bottom);
        }
      }
      if (right - left <= 0.5 || bottom - top <= 0.5) return null;
      return { x: left, y: top, width: right - left, height: bottom - top };
    };

    const inkOf = (element: Element): Box[] => {
      const out: Box[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.nodeValue?.trim()) continue;
        range.selectNodeContents(node);
        for (const raw of Array.from(range.getClientRects())) {
          const clipped = clip(raw, node.parentElement);
          if (clipped) out.push(clipped);
        }
      }
      return out;
    };

    const intersects = (a: Box, b: Box): boolean => {
      // Half a pixel of tolerance on each axis: adjacent boxes land within a
      // rounding error of each other under sub-pixel layout.
      const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      return width > 0.5 && height > 0.5;
    };

    const list = card.querySelector('.ui-data-table') as HTMLElement;
    // The list's **own card**, resolved from the table it holds: the section header
    // and the toolbar are outside it now, so the region scoped by the heading is no
    // longer the surface, and `card` below is about the surface (REQ-40).
    const surface = (list.closest('.ui-surface') ?? card) as HTMLElement;
    const header = list.querySelector<HTMLElement>('.ui-data-table__header');
    const headerCellElements = Array.from(list.querySelectorAll('.ui-data-table__header-cell'));
    const headers = headerCellElements.map((cell) => (cell.textContent ?? '').trim());

    const rows = Array.from(list.querySelectorAll('.ui-data-table__row')).map((row) => {
      const cellElements = Array.from(row.querySelectorAll('.ui-data-table__cell'));
      const cells = cellElements.map((cell, index) => {
        const lines = Array.from(cell.querySelectorAll('.ui-truncating-line'));
        return {
          header: headers[index] ?? `#${index}`,
          text: (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
          box: box(cell),
          clipped: lines.reduce((total, line) => total + Math.max(0, line.scrollWidth - line.clientWidth), 0),
          lines: cell.querySelectorAll('.ui-table-two-line-cell__title, .ui-table-two-line-cell__subtitle, .ui-table-meta-cell').length,
        };
      });

      const collisions: string[] = [];
      cellElements.forEach((cell, index) => {
        const ink = inkOf(cell);
        cellElements.forEach((other, otherIndex) => {
          if (index === otherIndex) return;
          const otherBox = box(other);
          if (ink.some((piece) => intersects(piece, otherBox))) {
            collisions.push(`${headers[index] ?? index} inks over ${headers[otherIndex] ?? otherIndex}`);
          }
        });
      });

      const label = (
        row.querySelector('.ui-table-two-line-cell__title')?.textContent ??
        row.querySelector('.ui-table-identifier-cell')?.textContent ??
        row.textContent ??
        ''
      ).trim();
      return {
        label,
        text: (row.textContent ?? '').replace(/\s+/g, ' ').trim(),
        box: box(row),
        computed: getComputedStyle(row).gridTemplateColumns,
        cells,
        collisions,
      };
    });

    return {
      card: box(surface),
      list: box(list),
      listClientWidth: list.clientWidth,
      listScrollWidth: list.scrollWidth,
      headers,
      headerCells: headerCellElements.map(box),
      headerComputed: header ? getComputedStyle(header).gridTemplateColumns : '',
      rows,
    };
  });
}

/** The content column the screen lays out in: the shell's own padding is not width a screen has. */
async function contentColumnWidth(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const content = document.querySelector('.ui-frame__content') as HTMLElement;
    const style = getComputedStyle(content);
    return content.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
  });
}

/**
 * Pans a list by assignment, for the measurements that depend on no event: the
 * tracks a grid resolves and the boxes of its cells are laid out by CSS, and
 * header and rows pan together because they are one scroll container.
 *
 * The frame is waited for all the same, so that every figure read afterwards is
 * one the browser has painted.
 */
async function panTo(page: Page, title: 'builders' | 'cache', scrollLeft: number): Promise<number> {
  const landed = await panel(page, title).evaluate((card, left) => {
    const list = card.querySelector('.ui-data-table') as HTMLElement;
    list.scrollLeft = left;
    return list.scrollLeft;
  }, scrollLeft);
  await nextPaint(page);
  return landed;
}

async function nextPaint(page: Page): Promise<void> {
  await twoFrames(page);
}

/**
 * Pans a list **with a real wheel**, from wherever the pointer already is, and
 * reports where the scroll settled.
 *
 * Required wherever what is being measured is written from the pan region's own
 * **scroll event** — the open expansion's pin is. A programmatic `scrollLeft =`
 * moves the grid without dispatching that event in the same tick, so a box read
 * straight after the assignment reads a position the product occupies only
 * between the assignment and its own event, which no operator can reach: it is
 * `element.click()` in another costume (CLAUDE.md, "What a check drives, and
 * what it measures"). Read that way at 375×812 this panel measured x −199 — and
 * so did the **dense** images table, at −369, which is how the reading was
 * shown to be the probe's and not the variant's.
 *
 * The pointer is placed **once**, by the caller, and left there: a row's own box
 * travels with the pan, so re-aiming at it between wheels walks the pointer off
 * the list and the second wheel reaches something else entirely.
 */
async function wheelPan(page: Page, table: Locator, deltaX: number): Promise<number> {
  await page.mouse.wheel(deltaX, 0);
  let previous = Number.NaN;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = await table.evaluate((element) => (element as HTMLElement).scrollLeft);
    if (current === previous) return Math.round(current);
    previous = current;
    await nextPaint(page);
  }
  return Math.round(previous);
}

function rowFor(list: ListGeometry, text: string): RowGeometry | undefined {
  return list.rows.find((row) => row.cells.some((cell) => cell.text.includes(text)));
}

function cellOf(row: RowGeometry, header: RegExp): CellGeometry | undefined {
  return row.cells.find((cell) => header.test(cell.header));
}

/** How many times `value` occurs in `text` — REQ-40 is a claim about a count. */
function occurrences(text: string, value: string): number {
  return text.split(value).length - 1;
}

/**
 * Answers the two inventory endpoints from the fixture, and the "use" call the
 * action makes, so the screen can be measured in every state it has to draw
 * without a single object being created on the operator's daemon.
 */
async function stubInventory(page: Page, used: string[]): Promise<void> {
  await page.route('**/api/builders', async (route) => {
    await route.fulfill({ json: FIXTURE_BUILDERS });
  });
  await page.route('**/api/builders/cache', async (route) => {
    await route.fulfill({ json: FIXTURE_RECORDS });
  });
  await page.route('**/api/builders/*/use', async (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? '');
    used.push(name);
    await route.fulfill({ json: { ...FIXTURE_BUILDERS[1], active: true } });
  });
  await page.route('**/api/builders/cache/*/usage', async (route) => {
    await route.fulfill({ json: { record: FIXTURE_RECORDS[0], references: [], unavailableReason: 'NoMatchingImage', unavailableDetail: 'No local image carries this build step.' } });
  });
}

async function openScreen(page: Page, viewport: Viewport, used: string[]): Promise<void> {
  await page.setViewportSize(viewport);
  await stubInventory(page, used);
  await openApp(page, 'builders-cache');
  await expect(page.getByRole('heading', { level: 1, name: 'Builders & cache' })).toBeVisible({ timeout: 20_000 });
  await expect(panel(page, 'builders').locator('.ui-data-table__row').first()).toBeVisible({ timeout: 20_000 });
  await expect(panel(page, 'cache').locator('.ui-data-table__row').first()).toBeVisible({ timeout: 20_000 });
}

test.describe('F8 — the builders screen against an inventory holding every row state', () => {
  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}×${viewport.height}`;

    // REQ-39, builders-screen.md — "Every row of a list is the same height as every other row of
    // that list, at every viewport: no value's presence adds or removes a line, the two that come
    // and go — the endpoint and the cache size — being columns of their own"; and the same for the
    // cache list, whose recorded build step "is a column" and whose rows "do not change height for
    // it".
    test(`every row of each list is the same height as every other at ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      const used: string[] = [];
      await openScreen(page, viewport, used);

      for (const [title, expectedRows] of [
        ['builders', FIXTURE_BUILDERS.length],
        ['cache', FIXTURE_RECORDS.length],
      ] as const) {
        const list = await measureList(page, title);

        // The premise: the inventory really does hold rows in different states, so equal heights
        // are a repair and not an artefact of every row saying the same thing.
        expect(list.rows.length, `${at}: the ${title} list does not hold the fixture's rows`).toBe(expectedRows);
        const distinctRowTexts = new Set(list.rows.map((row) => row.text));
        expect(distinctRowTexts.size, `${at}: every ${title} row states the same thing, so equal heights prove nothing`).toBeGreaterThan(1);

        const heights = list.rows.map((row) => round(row.box.height));
        console.log(`[REQ-39] ${at} ${title}: ${list.rows.length} rows, heights ${JSON.stringify([...new Set(heights)])}, card ${describeBox(list.card)}`);
        expect(
          new Set(heights).size,
          `${at}: the ${title} rows are ${JSON.stringify(heights)}px tall — a row's height still depends on what the object states`,
        ).toBe(1);
      }
    });

    // data-table.md — "A row and the header share one width and one set of resolved tracks …
    // measured as identical `x` for every header cell and its row cell, on **every** row, at
    // `scrollLeft` 0 and at the end of the pan", which rests on every admissible width resolving
    // independently of content: one row layout for the whole table, the header included.
    test(`each list resolves one set of tracks for the header and every row at ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      const used: string[] = [];
      await openScreen(page, viewport, used);

      for (const title of ['builders', 'cache'] as const) {
        const initial = await measureList(page, title);
        const offsets = [0, Math.round((initial.listScrollWidth - initial.listClientWidth) / 2), initial.listScrollWidth];

        for (const offset of offsets) {
          const landed = await panTo(page, title, offset);
          const list = await measureList(page, title);

          const layouts = new Set(list.rows.map((row) => row.computed));
          console.log(
            `[REQ-39] ${at} ${title} at scrollLeft ${round(landed)}: ${layouts.size} distinct row layout(s) over ${list.rows.length} rows — ${[...layouts].join(' | ')}`,
          );
          expect(
            layouts.size,
            `${at}: the ${title} rows resolve ${layouts.size} different layouts — ${[...layouts].join(' against ')}`,
          ).toBe(1);
          expect(
            list.headerComputed,
            `${at}: the ${title} header is laid out on ${list.headerComputed} over rows laid out on ${[...layouts][0]}`,
          ).toBe([...layouts][0]);

          expect(list.headerCells.length, `${at}: the ${title} header does not carry one cell per column`).toBe(list.rows[0].cells.length);
          for (const row of list.rows) {
            row.cells.forEach((cell, index) => {
              expect(
                cell.box.x - list.headerCells[index].x,
                `${at}: at scrollLeft ${round(landed)} the ${title} row "${row.label}" puts its ${cell.header} cell at x ${round(
                  cell.box.x,
                )} under a header cell at x ${round(list.headerCells[index].x)}`,
              ).toBeCloseTo(0, 0);
            });
          }
        }
        await panTo(page, title, 0);
      }
    });

    // REQ-40 — "A builder's name appears once per row"; builders-screen.md — "The endpoint column
    // is empty for a builder whose endpoint is its own name … the cell's tooltip states why it
    // holds nothing", and every other endpoint is shown.
    test(`a builder’s name is stated once in its row at ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      const used: string[] = [];
      await openScreen(page, viewport, used);

      const list = await measureList(page, 'builders');
      for (const builder of FIXTURE_BUILDERS) {
        const row = rowFor(list, builder.name);
        expect(row, `${at}: the fixture builder ${builder.name} is not listed`).toBeDefined();
        console.log(`[REQ-40] ${at} ${builder.name}: row ${describeBox(row!.box)} — ${row!.cells.map((cell) => `${cell.header}="${cell.text}"`).join(', ')}`);
        expect(occurrences(row!.text, builder.name), `${at}: the ${builder.name} row states its own name more than once`).toBe(1);

        const endpoint = cellOf(row!, /^endpoint$/i)!;
        if (builder.endpoint === builder.name) {
          expect(endpoint.text, `${at}: the ${builder.name} row repeats its name in the endpoint column`).not.toContain(builder.name);
        } else {
          expect(endpoint.text, `${at}: the ${builder.name} row does not state the endpoint its node answers on`).toContain(
            builder.endpoint.slice(0, 20),
          );
        }

        // A cache size the builder did not report reads `unavailable`, never a blank and never
        // another builder's number.
        const cache = cellOf(row!, /^cache$/i)!;
        if (builder.cacheBytes === undefined) {
          expect(cache.text, `${at}: the ${builder.name} row states a cache size it never reported`).toBe('unavailable');
        } else {
          expect(cache.text, `${at}: the ${builder.name} row states no cache size where the builder reported one`).not.toBe('unavailable');
        }
      }
    });

    // REQ-39 — the mixed trailing run becomes columns and a cluster, so no reading is painted over
    // another; REQ-21/REQ-4 — a value cut at its column's width is cut, not overlaid.
    test(`no cell of either list paints over the cell beside it at ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      const used: string[] = [];
      await openScreen(page, viewport, used);

      for (const title of ['builders', 'cache'] as const) {
        const list = await measureList(page, title);
        const collisions = list.rows.flatMap((row) => row.collisions.map((collision) => `${row.label}: ${collision}`));
        const starved = list.rows.flatMap((row) => row.cells.filter((cell) => cell.box.width <= 0).map((cell) => `${row.label} ${cell.header}`));
        console.log(
          `[REQ-39] ${at} ${title}: ${collisions.length} colliding cell pair(s) over ${list.rows.reduce((total, row) => total + row.cells.length, 0)} cells`,
        );
        expect(collisions, `${at}: a ${title} cell's painted text lands on the cell beside it`).toEqual([]);
        expect(starved, `${at}: a ${title} cell is in the DOM and nowhere on screen`).toEqual([]);
      }
    });

    // builders-screen.md — the two cards are "stacked, full-width", so both lists are read at the
    // content column's width; data-table.md — given less width than its columns' minimums need the
    // table pans, and dragging it brings every column fully into view.
    test(`both lists are read at the content column’s width, panning where the columns exceed it — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      const used: string[] = [];
      await openScreen(page, viewport, used);

      const column = await contentColumnWidth(page);
      const builders = await measureList(page, 'builders');
      const cache = await measureList(page, 'cache');
      console.log(
        `[REQ-39] ${at}: content column ${round(column)}px — builders card ${describeBox(builders.card)} holding ${round(
          builders.listScrollWidth,
        )}px of row in ${round(builders.listClientWidth)}px; cache card ${describeBox(cache.card)} holding ${round(
          cache.listScrollWidth,
        )}px in ${round(cache.listClientWidth)}px`,
      );

      for (const [title, list] of [
        ['builders', builders],
        ['cache', cache],
      ] as const) {
        expect(round(list.card.width), `${at}: the ${title} card is ${round(list.card.width)}px of a ${round(column)}px content column`).toBeGreaterThanOrEqual(
          round(column) - 1,
        );
        expect(round(list.card.x), `${at}: the two cards are not on one left edge`).toBe(round(builders.card.x));

        if (list.listScrollWidth > list.listClientWidth) {
          const landed = await panTo(page, title, list.listScrollWidth);
          expect(landed, `${at}: the ${title} list holds more than it shows and refuses to pan`).toBeGreaterThan(0);
          const panned = await measureList(page, title);
          const last = panned.rows[0].cells.at(-1)!;
          expect(
            last.box.x >= panned.list.x - 1 && last.box.x + last.box.width <= panned.list.x + panned.list.width + 1,
            `${at}: panning the ${title} list does not bring its last column into the region — cell ${describeBox(last.box)} against region ${describeBox(
              panned.list,
            )}`,
          ).toBe(true);
          await panTo(page, title, 0);
        }
      }
    });

    // REQ-39, REQ-27 — the action is a control and hit-tests to itself, wherever the table has been
    // panned to. Driven with a real pointer at the control's own coordinates: a programmatic
    // activation moves no focus and lands wherever the element claims to be, which is the half a
    // dragged surface gets wrong.
    test(`the Use action is reachable and hit-tests to itself at ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      const used: string[] = [];
      await openScreen(page, viewport, used);

      const idle = FIXTURE_BUILDERS.find((builder) => !builder.active)!;
      const row = panel(page, 'builders').locator('.ui-data-table__row', { hasText: idle.name }).first();
      const useAction = row.getByRole('button', { name: 'Use', exact: true });
      await useAction.scrollIntoViewIfNeeded();
      await expect(useAction, `${at}: the idle builder is offered no Use action`).toBeVisible();

      const box = await boxOf(useAction, `${at}: the idle builder's Use action`);
      const centre = centreOf(box);
      const hit = await page.evaluate(
        ({ x, y }) => {
          const element = document.elementFromPoint(x, y);
          const button = element?.closest('button');
          return { tag: element?.tagName.toLowerCase() ?? null, label: (button?.textContent ?? '').trim() };
        },
        centre,
      );
      console.log(`[REQ-39] ${at}: Use at ${describeBox({ ...box })} — the point at its centre resolves to <${hit.tag}> "${hit.label}"`);
      expect(hit.label, `${at}: the point at the Use control's own centre belongs to something else`).toBe('Use');

      // **The press is one this check can prove reached the control it names.** This list re-reads
      // every 5s (`use-builders.ts`), and a re-read that replaces the row takes the button with it:
      // a settled box says nothing about that, since the replacement has the same geometry
      // (`support/settled.ts`, "a settled box is not a stable node"). A run was lost here with
      // "clicking Use at its own coordinates activated nothing" — a press that reached nothing,
      // reported as the product ignoring it.
      //
      // The two outcomes are kept as **two different reports**, because they are two different
      // findings: a press delivered to this very control that activated nothing ends the gesture and
      // says so (`support/delivered-press.ts` refuses to press a control that has already answered),
      // while a press that activated **another builder** throws from the effect itself rather than
      // being retried into a second wrong activation. Only a press that reached nothing at all is
      // repeated, and it cannot have activated anything.
      await pressUntilItTakes(page, useAction, `${at}: the Use action of ${idle.name}`, {
        describe: `the daemon was asked to use ${idle.name}`,
        reached: async () => {
          const wrong = used.filter((name) => name !== idle.name);
          expect(
            wrong,
            `${at}: clicking Use at ${idle.name}'s own coordinates activated another builder — the press landed on a control that is not the one it was aimed at`,
          ).toEqual([]);
          return used.includes(idle.name);
        },
      });
      expect(used, `${at}: clicking Use at its own coordinates asked for something other than ${idle.name}`).toEqual([idle.name]);

      // …and the marker column is a reading, not a control: the active builder offers no action
      // that would switch to itself.
      const activeRow = panel(page, 'builders').locator('.ui-data-table__row', { hasText: FIXTURE_BUILDERS[0].name }).first();
      await expect(activeRow.getByText('in use', { exact: true })).toBeVisible();
      await expect(activeRow.getByRole('button', { name: 'Use', exact: true })).toHaveCount(0);
    });
  }

  // REQ-41 — "Page-level actions exist where the screen has them, in the toolbar under the header
  // rather than in a card header". Measured as a box, not as a presence: the toolbar sits under its
  // section's header and above the list it acts on — all three above the list's own card since
  // `./../classic-table/REQ-40`, which is why the region is named by what it holds.
  test('the page-level actions are in each section’s toolbar, under its header and above its list', async ({ page }) => {
    test.setTimeout(120_000);
    const used: string[] = [];
    await openScreen(page, VIEWPORTS[0], used);

    for (const [title, label] of [
      ['builders', 'Create builder'],
      ['cache', 'Prune'],
    ] as const) {
      const section = panel(page, title);
      const toolbar = section.locator('.ui-screen-toolbar').first();
      await expect(toolbar, `the ${title} section draws no screen toolbar`).toBeVisible();

      const action = toolbar.getByRole('button', { name: label });
      await expect(action, `${label} is not a control of the ${title} toolbar`).toHaveCount(1);
      expect(await section.getByRole('button', { name: label }).count(), `${label} is stated twice on the ${title} section`).toBe(1);

      // **One layout, not three.** These three boxes are compared to one another, so they are read
      // together once they have all stopped moving: read one at a time, a toolbar's bottom edge came
      // back at 714px above a list whose top edge came back at 592px — three readings of one layout
      // coming to rest, reported as the toolbar not being above its list (`support/settled.ts`).
      const { header: headerBox, toolbar: toolbarBox, list: listBox } = await boxesOf(
        page,
        {
          header: section.locator('.ui-section-header').first(),
          toolbar,
          list: section.locator('.ui-data-table').first(),
        },
        `the ${title} section`,
      );
      console.log(`[REQ-41] ${title}: header ${describeBox(headerBox)}, toolbar ${describeBox(toolbarBox)}, list ${describeBox(listBox)}`);

      expect(toolbarBox.y, `the ${title} toolbar is not under its section header`).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);
      expect(toolbarBox.y + toolbarBox.height, `the ${title} toolbar is not above the list it acts on`).toBeLessThanOrEqual(listBox.y + 1);
    }
  });

  // builders-screen.md — "Selecting a row reveals that record in the library's detail panel, inside
  // the same card, at the full width of the content column"; data-table.md — "An expansion is never
  // wider than the box the table is read in, and never pans", and REQ-69's reverse lookup keeps its
  // stated reason where no image can be named. The row is clicked on its **first cell**, its own
  // centre being able to land on another column once the table pans.
  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}×${viewport.height}`;

    test(`selecting a cache record reveals it in a panel held inside the table’s visible box — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      const used: string[] = [];
      await openScreen(page, viewport, used);

      const record = FIXTURE_RECORDS[0];
      const row = panel(page, 'cache').locator('.ui-data-table__row').first();
      // The second card sits below the fold at the shorter viewports, and a pointer click at
      // coordinates outside the viewport reaches nothing at all.
      await clickAtItsCentre(page, row.locator('.ui-data-table__cell').first(), `${at}: the cache record's first cell`);

      const expansion = panel(page, 'cache').locator('.ui-data-table__expanded');
      await expect(expansion, `${at}: selecting a record opened no panel`).toBeVisible({ timeout: 20_000 });
      const panelBox = await boxOf(expansion, `${at}: the cache record's panel`);
      const list = await measureList(page, 'cache');

      /**
       * **Two widths, and which is which** — the surface has a border box and a content box, and
       * they differ by exactly the carrier's inline inset (2 × `--space-5` = 40px), so the same
       * panel is honestly reported as either figure:
       *
       * - **border box** — 1052 / 892 / 269 at the three viewports, i.e. the table's own visible
       *   width to the pixel. This is what the assertions below are about, because the contract is
       *   about the box the panel is *read in*: "never wider than the box the table is read in".
       * - **content box** — 1012 / 852 / 229, the width its content actually lays out in, which is
       *   the figure batch 8 reported.
       *
       * Both are logged, side by side, so the pair is never read as a disagreement.
       */
      const contentWidth = await expansion.evaluate((element) => {
        const style = getComputedStyle(element);
        return element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      });
      console.log(
        `[REQ-39] ${at}: cache detail panel ${describeBox(panelBox)} (border box), ${round(contentWidth)}px of content box, ` +
          `in a list read through ${describeBox(list.list)} at ${round(list.listClientWidth)}px visible`,
      );

      // The identifier in full — the list cell cuts it at 20 characters (REQ-21).
      await expect(expansion).toContainText(record.id);
      // …and the stated reason no image can be named, which a migration may not turn into a blank.
      await expect(expansion).toContainText('No local image carries this build step.');

      // The panel is read in the box the table is read in: no wider than it, and starting at its
      // left edge — data-table.md, "An expansion is never wider than the box the table is read in,
      // and never pans … its left edge holds the table's left edge at every scroll offset". The
      // qualifier this sentence carried — the row card's edge, one hairline in from the pan
      // region's — belonged to the retired presentation, which put every row on a surface of its
      // own; since `.../classic-table/REQ-16` there is no row card and the two coincide. The
      // tolerance is unchanged, so nothing here is weakened into passing.
      expect(panelBox.width, `${at}: the panel is wider than the box the table is read in`).toBeLessThanOrEqual(list.listClientWidth + 0.5);
      expect(panelBox.x - list.list.x, `${at}: the panel does not start at the table's left edge`).toBeGreaterThanOrEqual(-0.5);
      expect(panelBox.x - list.list.x, `${at}: the panel starts more than a hairline inside the table`).toBeLessThanOrEqual(1.5);

      // …and it does not pan with the grid underneath it: a row is scanned across, a panel is read.
      // Driven with a **real wheel** and sampled once each scroll has settled, for the reason
      // `wheelPan` states — the pin is written from the scroll event, so an assignment measures a
      // frame the product only occupies between the assignment and its own event.
      if (list.listScrollWidth > list.listClientWidth) {
        const table = panel(page, 'cache').locator('.ui-data-table');
        // The wheel is delivered over a **row**, not over the panel, which scrolls nothing
        // horizontally; the pointer is placed once, before any of the grid has moved.
        await movePointerOverTheRow(page, panel(page, 'cache').locator('.ui-data-table__row').first(), `${at}: the cache row`);
        const readings: string[] = [];
        let previous = -1;
        for (let step = 0; step < 12; step += 1) {
          const landed = await wheelPan(page, table, 80);
          if (landed === previous) break;
          previous = landed;
          const panned = await boxOf(expansion, `${at}: the panel, after the grid was panned`);
          readings.push(`scrollLeft ${landed} → x ${round(panned.x)}, w ${round(panned.width)}`);
          expect(round(panned.x), `${at}: at scrollLeft ${landed} the panel panned with the grid underneath it`).toBe(round(panelBox.x));
          expect(round(panned.width), `${at}: at scrollLeft ${landed} the panel changed width as the grid panned`).toBe(round(panelBox.width));
          if (landed >= list.listScrollWidth - list.listClientWidth) break;
        }
        console.log(`[REQ-39] ${at}: wheeled across the cache list — ${readings.join('; ')}`);
        // The premise: the wheel really did pan the grid, or the series above says nothing.
        expect(readings.length, `${at}: a wheel over the cache list moved it to no new offset at all`).toBeGreaterThan(1);
        expect(previous, `${at}: the wheel did not reach the end of the pan`).toBeGreaterThanOrEqual(
          Math.round(list.listScrollWidth - list.listClientWidth) - 1,
        );
        await panTo(page, 'cache', 0);
      }
    });
  }
});
