/**
 * F2 — a list row keeps its content below the desktop breakpoint
 * (plan-ui-coherence-optimisation/REQ-6 … REQ-11).
 *
 * Every check in this file asserts **geometry**, and that is the whole point of
 * the file. The delivered defect left every character of every cell in the DOM,
 * at zero width: a check that the row still names the container passed
 * throughout it. What the row lost was its **tracks** — `20px 0px 0px 0px 0px
 * 0px 0px 296px` at 375×812, six of eight columns at nothing while the action
 * cluster held 296px of a 375px viewport. So what is measured here is the
 * computed `grid-template-columns`, the cells' own boxes, whether a pan brings
 * them into view, and whether a column and the label naming it share an x
 * (CLAUDE.md, "What a check drives, and what it measures"; REQ-89).
 *
 * Three things decide the shape of these checks:
 *
 * - **The box that pans is `.ui-data-table`, not the body's scroll region.** The
 *   header row is laid out on the same tracks as the rows and lives outside that
 *   region, so whichever box scrolls has to carry both or a column parts company
 *   with its label — which `data-table.md` states as the contract, and which the
 *   header/row alignment check below is what actually verifies.
 * - **"Offers a scrollbar" is asserted as a pan that moves, not as reserved
 *   layout space.** Headless Chromium draws overlay scrollbars and reports no
 *   gutter at all, so REQ-8's observable half is `scrollWidth > clientWidth`
 *   *and* a `scrollLeft` that takes and holds a value that brings cells into
 *   view.
 * - **"Before and after" is measured in one run** (REQ-11), by taking the new
 *   floor back out of the tracks: with `--data-table-column-min-width` at 0px,
 *   `minmax(0px, 1.8fr)` resolves exactly as the delivered `1.8fr` did, the
 *   cells having waived their automatic minimum on both builds. If the two
 *   measurements agree at 1440×1000 and 1280×800, the minimum binds nowhere
 *   there and the delivered desktop layout is untouched; if they diverge, the
 *   repair has redrawn a desktop it was supposed to leave alone.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { waitForArrivedContent } from './support/arrived.js';
import { readOnceSettled } from './support/settled.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TableGeometry {
  /** The row's computed tracks, in px — the figure REQ-6 is written about. */
  tracks: number[];
  /** The same, as the browser prints it, for the report. */
  computed: string;
  /** The tracks as the screen declared them, which is where the flex factors come from. */
  declared: string;
  headers: string[];
  cells: Box[];
  headerCells: Box[];
  /**
   * How many tracks come before the first data column: a table with multi-select
   * carries a leading checkbox track, and the row's checkbox cell is
   * deliberately not a column cell (data-table.md), so `tracks` can be one
   * longer than `cells` and `headers`.
   */
  columnOffset: number;
  rowBox: Box;
  headerBox: Box | null;
  tableBox: Box;
  expandedBox: Box | null;
  scrollWidth: number;
  clientWidth: number;
  scrollLeft: number;
  /** The effective `--data-table-column-min-width`, in px: the floor a `1fr` track carries. */
  columnMinimum: number;
  /** The effective `--data-table-action-column-width`, in px. */
  actionColumnWidth: number;
  /**
   * The effective `--data-table-menu-action-column-width`, in px: the narrower of the library's two
   * action-column tokens, which a list whose row carries its overflow control alone reserves
   * instead (`plan-docker_management_app-image_row_actions/REQ-18`).
   */
  menuActionColumnWidth: number;
}

const PHONE = { width: 375, height: 812 };
const NARROWER_THAN_PHONE = { width: 320, height: 812 };
const DESKTOPS = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
];

/**
 * The data columns the exemplar list states, matched on the header the screen gives them.
 *
 * **REQ-6 was written against the containers list, and that list stopped being a table on
 * 2026-08-25** (`plan-docker_management_app-containers_card_view/REQ-1`, `REQ-63`): it draws one
 * card per container, and its own arrangement at 375×812 is measured in
 * `containers-card-geometry.spec.ts`. The defect this file exists for is the **table's** — a column
 * resolving to no width at all under the phone breakpoint — so the exemplar moves to the images
 * list, which is still that table and was already the file's second adopter. Nothing about the claim
 * changes: every data column of a row of it resolves to a width, and the list pans to reach each.
 */
const IMAGE_DATA_COLUMNS = ['REPOSITORY:TAG', 'DIGEST', 'PLATFORM', 'DISK USAGE', 'CREATED'];

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function describeBox(box: Box): string {
  return `x=${round(box.x)}, y=${round(box.y)}, ${round(box.width)}×${round(box.height)}`;
}

/** Whether `inner` lies wholly within `outer`; one pixel of tolerance absorbs sub-pixel layout. */
function contains(outer: Box, inner: Box, tolerance = 1): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

/**
 * **The** measurement: everything one row and the table around it can say about
 * their layout, read once the layout has come to rest.
 *
 * The single pass below is what stops two figures coming from two frames; it is
 * not what stops the *whole reading* coming from a frame nobody sees. Those are
 * different guarantees and this file had only the first: it panned the grid and
 * read immediately, and the run reported "the grid panned 574px and the expansion
 * went with it, from x 21 to -553". x=-553 is the expansion **before** the
 * `ResizeObserver` re-pins it to the pan region's visible box — a layout that
 * exists for one frame and is never painted, and that a probe forcing layout in
 * between reads (`support/settled.ts`, and `e705f06`). The pinned value is the 21
 * that was expected.
 *
 * The comparator is the **whole geometry object**, not one box: everything read
 * in the pass has to agree between samples, since that is what a caller compares.
 */
async function measure(row: Locator): Promise<TableGeometry> {
  return await readOnceSettled(
    row.page(),
    () => measureThisFrame(row),
    (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
  );
}

/**
 * **One frame, and no test calls it.** The sampler above is built out of it; on
 * its own it answers about whichever layout happens to be current, which after a
 * pan or a style change is regularly the one the browser is about to replace.
 */
async function measureThisFrame(row: Locator): Promise<TableGeometry> {
  return await row.evaluate((rowElement) => {
    const table = rowElement.closest('.ui-data-table') as HTMLElement;
    const header = table.querySelector<HTMLElement>('.ui-data-table__header');
    const expanded = table.querySelector<HTMLElement>('.ui-data-table__expanded');
    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const rootStyle = getComputedStyle(document.documentElement);
    const computed = getComputedStyle(rowElement).gridTemplateColumns;
    // The multi-select checkbox is a structural control, not column data: the
    // header carries it as a header cell while the row's own is not a column
    // cell at all, so it is left out of both here and counted as an offset.
    const dataHeaderCells = header
      ? Array.from(header.querySelectorAll('.ui-data-table__header-cell:not(.ui-data-table__select-cell)'))
      : [];
    const tracks = computed.split(' ').map((track) => Number.parseFloat(track));
    const cells = Array.from(rowElement.querySelectorAll('.ui-data-table__cell'));
    return {
      tracks,
      computed,
      declared: rowElement.style.gridTemplateColumns,
      headers: dataHeaderCells.map((cell) => cell.textContent ?? ''),
      cells: cells.map(box),
      headerCells: dataHeaderCells.map(box),
      columnOffset: tracks.length - cells.length,
      rowBox: box(rowElement),
      headerBox: header ? box(header) : null,
      tableBox: box(table),
      expandedBox: expanded ? box(expanded) : null,
      scrollWidth: table.scrollWidth,
      clientWidth: table.clientWidth,
      scrollLeft: table.scrollLeft,
      columnMinimum: Number.parseFloat(rootStyle.getPropertyValue('--data-table-column-min-width')),
      actionColumnWidth: Number.parseFloat(rootStyle.getPropertyValue('--data-table-action-column-width')),
      menuActionColumnWidth: Number.parseFloat(rootStyle.getPropertyValue('--data-table-menu-action-column-width')),
    };
  });
}

/** The header naming the track at `index`, for a failure message that says which column moved. */
function trackName(geometry: TableGeometry, index: number): string {
  const column = index - geometry.columnOffset;
  if (column < 0) return 'multi-select';
  return geometry.headers[column] || `column ${column}`;
}

/** Pans the table the row belongs to, and reports where it actually landed. */
async function panTo(row: Locator, scrollLeft: number): Promise<number> {
  return await row.evaluate((rowElement, left) => {
    const table = rowElement.closest('.ui-data-table') as HTMLElement;
    table.scrollLeft = left;
    return table.scrollLeft;
  }, scrollLeft);
}

/**
 * Measures with the column minimum taken back out — the delivered build's own
 * sizing, reconstructed in the running one (see the file header). The override
 * is a `:root` custom property, so the tracks recompute without React
 * re-rendering anything, and it is removed again whatever the measurement did.
 */
async function withoutColumnMinimum<T>(page: Page, measurement: () => Promise<T>): Promise<T> {
  const style = await page.addStyleTag({ content: ':root { --data-table-column-min-width: 0px !important; }' });
  try {
    return await measurement();
  } finally {
    await style.evaluate((node: Element) => node.remove());
  }
}

/**
 * Waits until the inline expansion **holds its content** and has then stopped
 * moving — in that order, because the second cannot stand in for the first.
 *
 * This is the wait that decides the comparison below, and it was wrong in a way
 * that reads as a product defect: the containers expansion settles at 226.6px
 * while it draws "Loading container details…", grows to 355.1px when the inspect
 * payload lands, and a run was lost reporting a 128.5px difference in height with
 * `x` and `width` agreeing to the pixel. A box that has stopped moving is not a
 * panel that has arrived; the settle was doing its job and answering another
 * question (`support/arrived.ts`).
 */
async function waitForStableExpansion(page: Page): Promise<void> {
  await waitForArrivedContent(page.locator('.ui-data-table__expanded'), "the row's inline expansion");
}

/** The flex factor of each declared track, `null` for a track that is a length. */
function flexFactors(declared: string): (number | null)[] {
  const tracks: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of declared) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ' ' && depth === 0) {
      if (current.length > 0) tracks.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (current.length > 0) tracks.push(current);
  return tracks.map((track) => {
    const flexible = /(\d*\.?\d+)fr\s*\)?\s*$/.exec(track);
    return flexible ? Number(flexible[1]) : null;
  });
}

async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<void> {
  // Ensured at the point of use, not once for the run: the exclusive project prunes the host.
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(name),
    ...extraArgs,
    '--entrypoint',
    'sleep',
    ALPINE_IMAGE,
    '300',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  // `-v` and not just `-f`: without it an image's anonymous volumes outlive the container.
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** A tag of its own on an image the run already holds: a row this spec owns, in a list it does not. */
async function createFixtureTag(tag: string): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', ['tag', ALPINE_IMAGE, tag]);
}

async function removeFixtureTag(tag: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
}

function rowContaining(page: Page, text: string): Locator {
  return page.locator('.ui-data-table__row', { hasText: text }).first();
}

async function openScreen(page: Page, screenId: string, heading: string, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await openApp(page, screenId);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 20_000 });
}

// plan-ui-coherence-optimisation/REQ-6, REQ-8, REQ-9 — the defect itself: the
// tracks, the cells' boxes, and whether an operator can actually reach them.
test('at 375×812 every column of an images row resolves to a width, and the table pans to reach each of them', async ({ page }) => {
  test.setTimeout(120_000);
  const tag = `vexel-e2e-cols-phone-${Date.now()}:1`;

  try {
    await createFixtureTag(tag);
    await openScreen(page, 'images-layers', 'Images & layers', PHONE);
    const row = rowContaining(page, tag);
    await expect(row, 'the fixture image never appeared in the list').toBeVisible({ timeout: 20_000 });

    const geometry = await measure(row);
    // The same row with the floor taken back out: the delivered build's own
    // sizing, so the run reports the computed grid before and after (REQ-90).
    const delivered = await withoutColumnMinimum(page, () => measure(row));
    console.log(`[REQ-6] @375×812 images, before (no column minimum): ${delivered.computed}`);
    console.log(`[REQ-6] @375×812 images, after: ${geometry.computed}`);
    console.log(`[REQ-6] declared tracks: ${geometry.declared}`);

    // The reconstruction is what makes this check a red on the delivered build rather than a green on
    // both: without a floor the columns are squeezed to a width nothing can be read in.
    //
    // **It read `=== 0` while the exemplar was the containers list**, whose tracks collapsed to
    // exactly that and which stopped being a table on 2026-08-25
    // (`plan-docker_management_app-containers_card_view/REQ-1`). On the images row the same
    // neutralisation squeezes data columns to a dozen pixels rather than to none — the same defect
    // and the same repair, one step milder — so what is required of the reconstruction is that it
    // put a data track **below the floor the repair introduced**. A run in which it does not is a run
    // in which the floor binds nowhere on this row, and the check below would pass with the repair
    // removed.
    expect(
      delivered.tracks.filter((track) => track < geometry.columnMinimum).length,
      `with the column minimum neutralised no track of this row falls below the ${geometry.columnMinimum}px floor (${delivered.computed}), so this check would have passed on the delivered build too and proves nothing`,
    ).toBeGreaterThan(0);

    expect(geometry.cells, 'the row does not lay out one cell per column header').toHaveLength(geometry.headers.length);
    expect(geometry.tracks, 'the row does not lay out one track per cell').toHaveLength(geometry.cells.length + geometry.columnOffset);
    expect(
      geometry.tracks.filter((track) => track <= 0),
      `@375×812 the images row still resolves ${geometry.tracks.filter((track) => track <= 0).length} of its ${geometry.tracks.length} tracks to nothing — computed ${geometry.computed} (REQ-6)`,
    ).toEqual([]);

    // Each named column's own box, not its text: every character was present
    // throughout the defect, in a cell 0px wide.
    for (const header of IMAGE_DATA_COLUMNS) {
      const index = geometry.headers.indexOf(header);
      expect(index, `the images list no longer carries a ${header} column`).toBeGreaterThanOrEqual(0);
      expect(
        geometry.cells[index].width,
        `@375×812 the ${header} cell of the fixture row is ${round(geometry.cells[index].width)}px wide — its content is in the DOM at no width (REQ-6)`,
      ).toBeGreaterThan(0);
    }

    // REQ-8 — the minimums exceed the width, so the list pans, and the pan moves.
    expect(
      geometry.scrollWidth,
      `@375×812 the list region reports scrollWidth ${geometry.scrollWidth} against clientWidth ${geometry.clientWidth}: the columns it cannot fit are clipped away instead of being scrollable (REQ-8)`,
    ).toBeGreaterThan(geometry.clientWidth);

    const landed = await panTo(row, geometry.scrollWidth);
    expect(
      landed,
      `@375×812 the list region reports ${geometry.scrollWidth}px of content in ${geometry.clientWidth}px and still refuses to pan: scrollLeft stays at ${landed} (REQ-8)`,
    ).toBeGreaterThan(0);
    console.log(`[REQ-8] @375×812 images pan: scrollWidth ${geometry.scrollWidth} / clientWidth ${geometry.clientWidth}, scrollLeft reaches ${round(landed)}`);

    // …and the pan is what brings each named column fully inside the region.
    await panTo(row, 0);
    const reached: string[] = [];
    for (const header of IMAGE_DATA_COLUMNS) {
      const index = geometry.headers.indexOf(header);
      const cell = row.locator('.ui-data-table__cell').nth(index);
      await cell.scrollIntoViewIfNeeded();
      const after = await measure(row);
      const cellBox = after.cells[index];
      expect(
        cellBox.width,
        `@375×812 the ${header} cell has no width once panned into view — ${describeBox(cellBox)} (REQ-6)`,
      ).toBeGreaterThan(0);
      expect(
        contains(after.tableBox, cellBox),
        `@375×812 panning the list does not bring the ${header} cell fully into the region: cell ${describeBox(cellBox)} against region ${describeBox(after.tableBox)} at scrollLeft ${round(after.scrollLeft)} (REQ-8)`,
      ).toBe(true);
      reached.push(`${header} at scrollLeft ${round(after.scrollLeft)} → ${describeBox(cellBox)}`);
    }
    console.log(`[REQ-8] @375×812 reachable by panning: ${reached.join('; ')}`);

    // REQ-9 — the action cluster keeps its intrinsic width and does not grow at
    // the expense of the data columns.
    await panTo(row, 0);
    const actions = geometry.headers.indexOf('ACTIONS') + geometry.columnOffset;
    const actionTrack = geometry.tracks[actions];
    const dataTracks = geometry.tracks.filter((_, index) => index !== actions).reduce((total, track) => total + track, 0);
    // The images row came down to its overflow control alone and reserves the narrower of the two
    // tokens for it (`plan-docker_management_app-image_row_actions/REQ-18`); REQ-9's claim is that
    // the cluster holds **its own** intrinsic width, whichever of them that is.
    expect(
      actionTrack,
      `@375×812 the action column resolves to ${round(actionTrack)}px where its own token states ${geometry.menuActionColumnWidth}px: it is not holding its intrinsic width (REQ-9)`,
    ).toBeCloseTo(geometry.menuActionColumnWidth, 0);
    expect(
      actionTrack,
      `@375×812 the action column holds ${round(actionTrack)}px of a ${round(geometry.rowBox.width)}px row, against ${round(dataTracks)}px for every data column together — the cluster is consuming the row, as it did holding 296px of 375px on the delivered build (REQ-9)`,
    ).toBeLessThan(geometry.rowBox.width / 2);
    console.log(
      `[REQ-9] @375×812 action column ${round(actionTrack)}px of a ${round(geometry.rowBox.width)}px row; the data columns hold ${round(dataTracks)}px between them`,
    );
  } finally {
    await removeFixtureTag(tag);
  }
});

// plan-ui-coherence-optimisation/REQ-7 — the minimum is a floor, not a
// suggestion: it is scaled by the column's own flex factor, and narrowing the
// viewport further takes nothing more off it.
test('a column stops at its own minimum and does not shrink below it as the viewport narrows further', async ({ page }) => {
  test.setTimeout(120_000);
  const tag = `vexel-e2e-cols-floor-${Date.now()}:1`;

  try {
    await createFixtureTag(tag);
    await openScreen(page, 'images-layers', 'Images & layers', PHONE);
    const row = rowContaining(page, tag);
    await expect(row, 'the fixture image never appeared in the list').toBeVisible({ timeout: 20_000 });

    const atPhone = await measure(row);
    const factors = flexFactors(atPhone.declared);
    console.log(`[REQ-7] @375×812 tracks ${atPhone.computed}, floor ${atPhone.columnMinimum}px, factors ${factors.join(', ')}`);

    expect(
      factors.some((factor) => factor !== null),
      'no column of the images list is flexible, so there is no minimum under test here',
    ).toBe(true);

    // Each flexible track is at least its own factor times the floor
    // (data-table.md, design-tokens.md), and the floor scaling by the factor is
    // what keeps the compressed table in the proportions it was declared with
    // rather than equalising every column.
    const perFactor: number[] = [];
    factors.forEach((factor, index) => {
      if (factor === null) return;
      const track = atPhone.tracks[index];
      expect(
        track,
        `@375×812 the ${trackName(atPhone, index)} track resolves to ${round(track)}px, below its floor of ${factor} × ${atPhone.columnMinimum}px (REQ-7)`,
      ).toBeGreaterThanOrEqual(factor * atPhone.columnMinimum - 0.5);
      perFactor.push(track / factor);
    });
    const widest = Math.max(...perFactor);
    const narrowest = Math.min(...perFactor);
    expect(
      widest - narrowest,
      `@375×812 the compressed columns no longer stand in the proportions they were declared with: per flex unit they resolve to ${perFactor.map(round).join(', ')}px (REQ-7)`,
    ).toBeLessThanOrEqual(1);

    // 55px narrower: below the width where the minimums bind, the tracks are the
    // floor itself, so nothing about them may move — only the pan grows.
    await page.setViewportSize(NARROWER_THAN_PHONE);
    await expect(row).toBeVisible();
    const atNarrower = await measure(row);
    console.log(`[REQ-7] @320×812 tracks ${atNarrower.computed}, pan ${atNarrower.scrollWidth} / ${atNarrower.clientWidth}`);

    atPhone.tracks.forEach((track, index) => {
      expect(
        atNarrower.tracks[index],
        `the ${trackName(atPhone, index)} track shrank from ${round(track)}px at 375px to ${round(atNarrower.tracks[index])}px at 320px, so the minimum is not a floor (REQ-7)`,
      ).toBeCloseTo(track, 0);
    });
    expect(
      atNarrower.scrollWidth - atNarrower.clientWidth,
      `@320×812 the narrower viewport did not lengthen the pan (${atNarrower.scrollWidth} / ${atNarrower.clientWidth}); the columns must have given the width up instead (REQ-7, REQ-8)`,
    ).toBeGreaterThan(atPhone.scrollWidth - atPhone.clientWidth);
  } finally {
    await removeFixtureTag(tag);
  }
});

// plan-ui-coherence-optimisation/REQ-8 — the half that decides which box may
// pan: a column and the label naming it share an x at every pan offset, or the
// list is unreadable however far it scrolls.
test('at 375×812 a header cell and its row cell share an x-offset at every pan position', async ({ page }) => {
  test.setTimeout(120_000);
  const tag = `vexel-e2e-cols-align-${Date.now()}:1`;

  try {
    await createFixtureTag(tag);
    await openScreen(page, 'images-layers', 'Images & layers', PHONE);
    const row = rowContaining(page, tag);
    await expect(row, 'the fixture image never appeared in the list').toBeVisible({ timeout: 20_000 });

    const initial = await measure(row);
    const offsets = [0, Math.round((initial.scrollWidth - initial.clientWidth) / 2), initial.scrollWidth];
    const reported: string[] = [];

    for (const offset of offsets) {
      const landed = await panTo(row, offset);
      const geometry = await measure(row);
      const headerXs = geometry.headerCells.map((cell) => round(cell.x));
      const rowXs = geometry.cells.map((cell) => round(cell.x));
      reported.push(`scrollLeft ${round(landed)}: header ${headerXs.join('/')} against row ${rowXs.join('/')}`);

      expect(geometry.headerCells, 'the header no longer carries one cell per column').toHaveLength(geometry.cells.length);
      geometry.cells.forEach((cell, index) => {
        expect(
          cell.x - geometry.headerCells[index].x,
          `@375×812 at scrollLeft ${round(landed)} the ${geometry.headers[index] || `column ${index}`} row cell sits at x ${round(cell.x)} under a header cell at x ${round(geometry.headerCells[index].x)} — the header and the rows are not on one set of tracks (REQ-8)`,
        ).toBeCloseTo(0, 0);
      });
      expect(
        geometry.rowBox.width,
        `@375×812 at scrollLeft ${round(landed)} the row is ${round(geometry.rowBox.width)}px wide under a ${round(geometry.headerBox?.width ?? 0)}px header (REQ-8)`,
      ).toBeCloseTo(geometry.headerBox?.width ?? 0, 0);
    }

    console.log(`[REQ-8] @375×812 header/row alignment — ${reported.join(' | ')}`);
  } finally {
    await removeFixtureTag(tag);
  }
});

/**
 * The desktop non-regression, for one screen: everything the delivered build's
 * layout consisted of, measured with the column minimum in force and with it
 * taken back out, at both desktop viewports. This is the check that makes the
 * repair a repair rather than a redesign (REQ-11) — and the one that matters
 * most, since every `DataTable` screen inherits the change.
 */
async function desktopLayoutUnchanged(
  page: Page,
  options: { screenId: string; heading: string; row: (page: Page) => Locator; rowHeight?: number; label: string; expands?: boolean },
): Promise<void> {
  for (const viewport of DESKTOPS) {
    const at = `@${viewport.width}×${viewport.height} ${options.label}`;
    await openScreen(page, options.screenId, options.heading, viewport);
    const row = options.row(page);
    await expect(row, `${at}: the fixture row never appeared in the list`).toBeVisible({ timeout: 20_000 });

    if (options.expands) {
      // A real pointer on the row's own first cell (REQ-88): the inline
      // expansion is part of what must be unchanged.
      await row.locator('.ui-data-table__cell').first().click();
      await expect(page.locator('.ui-data-table__expanded')).toBeVisible({ timeout: 20_000 });
      await waitForStableExpansion(page);
    }

    const after = await measure(row);
    const before = await withoutColumnMinimum(page, () => measure(row));
    console.log(`[REQ-11] ${at} before (no column minimum): ${before.computed}`);
    console.log(`[REQ-11] ${at} after: ${after.computed}`);
    console.log(
      `[REQ-11] ${at} row ${describeBox(after.rowBox)}, table ${describeBox(after.tableBox)}, expansion ${after.expandedBox ? describeBox(after.expandedBox) : 'none'}`,
    );

    after.tracks.forEach((track, index) => {
      expect(
        track,
        `${at}: the ${trackName(after, index)} column resolves to ${round(track)}px where the delivered sizing gives it ${round(before.tracks[index])}px — ${after.computed} against ${before.computed} (REQ-11)`,
      ).toBeCloseTo(before.tracks[index], 0);
    });

    after.cells.forEach((cell, index) => {
      const message = `${at}: the ${after.headers[index] || `column ${index}`} cell is at ${describeBox(cell)} where the delivered sizing puts it at ${describeBox(before.cells[index])} (REQ-11)`;
      expect(cell.x, message).toBeCloseTo(before.cells[index].x, 0);
      expect(cell.width, message).toBeCloseTo(before.cells[index].width, 0);
    });

    after.headerCells.forEach((cell, index) => {
      expect(
        cell.x - after.cells[index].x,
        `${at}: the ${after.headers[index]} header cell sits at x ${round(cell.x)} over a row cell at x ${round(after.cells[index].x)} (REQ-11)`,
      ).toBeCloseTo(0, 0);
    });

    if (options.rowHeight !== undefined) {
      expect(
        after.rowBox.height,
        `${at}: the row is ${round(after.rowBox.height)}px tall where the table's fixed row height is ${options.rowHeight}px (REQ-11)`,
      ).toBeCloseTo(options.rowHeight, 0);
    }
    expect(after.rowBox.height, `${at}: the row height moved with the column minimum (REQ-11)`).toBeCloseTo(before.rowBox.height, 0);

    const rowMessage = `${at}: the row is ${describeBox(after.rowBox)} where the delivered sizing gives ${describeBox(before.rowBox)} (REQ-11)`;
    expect(after.rowBox.x, rowMessage).toBeCloseTo(before.rowBox.x, 0);
    expect(after.rowBox.width, rowMessage).toBeCloseTo(before.rowBox.width, 0);

    const tableMessage = `${at}: the table is ${describeBox(after.tableBox)} where the delivered sizing gives ${describeBox(before.tableBox)} (REQ-11)`;
    expect(after.tableBox.x, tableMessage).toBeCloseTo(before.tableBox.x, 0);
    expect(after.tableBox.width, tableMessage).toBeCloseTo(before.tableBox.width, 0);

    // Nothing pans at a desktop width: the minimums are inert there, so the
    // list region holds its content exactly as the delivered one did.
    expect(
      after.scrollWidth,
      `${at}: the list region reports ${after.scrollWidth}px of content in ${after.clientWidth}px, so a desktop width now pans horizontally (REQ-11)`,
    ).toBeLessThanOrEqual(after.clientWidth + 1);

    // The inline expansion: same box before and after. Where the columns fit,
    // it carries no geometry of the component's own and lays out as it always
    // did (data-table.md), which is what this comparison states. Its height is
    // given a little tolerance and no more — the panel loads its content
    // asynchronously, and a change worth catching here is a change of hundreds
    // of pixels, not of one.
    if (!options.expands) continue;
    expect(after.expandedBox, `${at}: the row's inline expansion is not laid out at all`).not.toBeNull();
    const expansionMessage = `${at}: the inline expansion is ${describeBox(after.expandedBox!)} where the delivered sizing gives ${describeBox(before.expandedBox!)} (REQ-11)`;
    expect(after.expandedBox!.x, expansionMessage).toBeCloseTo(before.expandedBox!.x, 0);
    expect(after.expandedBox!.width, expansionMessage).toBeCloseTo(before.expandedBox!.width, 0);
    expect(Math.abs(after.expandedBox!.height - before.expandedBox!.height), expansionMessage).toBeLessThanOrEqual(4);
  }
}

// plan-ui-coherence-optimisation/REQ-11 asked the **containers** list to be laid out at both desktop
// viewports exactly as it was before the column minimum existed. That list stopped being a table on
// 2026-08-25 (`plan-docker_management_app-containers_card_view/REQ-1`, `REQ-63`), so this case has no
// subject: there is no containers grid whose tracks a minimum could bind. What replaced it is
// checked where it now lives — the card's own arrangement at desktop and at 375×812, in
// `containers-card-geometry.spec.ts` — and REQ-11's claim about the **table** stands unchanged on
// every screen that still draws one, immediately below and in the two tests after it.

// plan-ui-coherence-optimisation/REQ-11 — the second adopter with an inline
// expansion, on the same terms.
test('at 1440×1000 and 1280×800 the images table is laid out exactly as it was before the column minimum existed', async ({ page }) => {
  test.setTimeout(180_000);
  const tag = `vexel-e2e-cols-desktop-${Date.now()}:1`;

  try {
    await createFixtureTag(tag);
    await desktopLayoutUnchanged(page, {
      screenId: 'images-layers',
      heading: 'Images & layers',
      row: (target) => rowContaining(target, tag),
      rowHeight: 56,
      label: 'images',
      expands: true,
    });
  } finally {
    await removeFixtureTag(tag);
  }
});

// plan-ui-coherence-optimisation/REQ-11, REQ-10 — the two remaining adopters at
// desktop, and the tightest case of the four: the dashboard's activity list sits
// in half a content column, so it is where a floor under a column would bind at
// a desktop width if it bound anywhere. The coverage matrix is the content-sized
// variant of the same table. Neither expands a row.
test('at 1440×1000 and 1280×800 the dashboard and coverage tables are laid out exactly as they were before the column minimum existed', async ({ page }) => {
  test.setTimeout(240_000);
  const name = `vexel-e2e-cols-desktop-others-${Date.now()}`;

  try {
    await createSleepingContainer(name);
    await desktopLayoutUnchanged(page, {
      screenId: 'dashboard',
      heading: 'Dashboard',
      row: (target) => rowContaining(target, name),
      // The dashboard's activity list declares its own dense row height.
      rowHeight: 44,
      label: 'dashboard activity',
    });
    await desktopLayoutUnchanged(page, {
      screenId: 'coverage-matrix',
      heading: 'About',
      row: (target) => target.locator('.ui-data-table__row').first(),
      // The matrix variant grows its rows to their content, so the row height is
      // compared against the delivered sizing alone rather than against a figure.
      label: 'coverage matrix',
    });
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-ui-coherence-optimisation/REQ-10 — the repair is made once and every
// adopter inherits it: images, the dashboard and the coverage matrix, none of
// them saying anything about a column minimum of its own. **The containers
// screen was the fourth until 2026-08-25**, when it stopped building on the
// table at all (`plan-docker_management_app-containers_card_view/REQ-1`); the
// dashboard's own container list is still the table and is still walked here.
test('every screen built on the table keeps its columns at 375×812, without a word of its own about it', async ({ page }) => {
  test.setTimeout(240_000);
  const name = `vexel-e2e-cols-adopters-${Date.now()}`;
  const tag = `vexel-e2e-cols-adopters-${Date.now()}:1`;

  try {
    await createSleepingContainer(name);
    await createFixtureTag(tag);

    const adopters = [
      { screenId: 'images-layers', heading: 'Images & layers', row: (target: Page) => rowContaining(target, tag) },
      { screenId: 'dashboard', heading: 'Dashboard', row: (target: Page) => rowContaining(target, name) },
      { screenId: 'coverage-matrix', heading: 'About', row: (target: Page) => target.locator('.ui-data-table__row').first() },
    ];

    for (const adopter of adopters) {
      await openScreen(page, adopter.screenId, adopter.heading, PHONE);
      const row = adopter.row(page);
      await expect(row, `${adopter.heading}: no row to measure`).toBeVisible({ timeout: 20_000 });

      const geometry = await measure(row);
      console.log(
        `[REQ-10] @375×812 ${adopter.heading}: ${geometry.computed} — pan ${geometry.scrollWidth} / ${geometry.clientWidth}`,
      );

      expect(
        geometry.tracks.filter((track) => track <= 0),
        `@375×812 the ${adopter.heading} list resolves ${geometry.tracks.filter((track) => track <= 0).length} of its ${geometry.tracks.length} tracks to nothing — computed ${geometry.computed} (REQ-6, REQ-10)`,
      ).toEqual([]);
      geometry.cells.forEach((cell, index) => {
        expect(
          cell.width,
          `@375×812 the ${adopter.heading} list draws its column ${index} cell at ${describeBox(cell)} (REQ-6, REQ-10)`,
        ).toBeGreaterThan(0);
      });

      // Where the minimums exceed the width, the pan is what reaches the last
      // column; where they do not, there is nothing to reach.
      if (geometry.scrollWidth > geometry.clientWidth) {
        const last = row.locator('.ui-data-table__cell').last();
        await last.scrollIntoViewIfNeeded();
        const panned = await measure(row);
        const lastCell = panned.cells[panned.cells.length - 1];
        expect(
          contains(panned.tableBox, lastCell),
          `@375×812 panning the ${adopter.heading} list does not bring its last column into the region: cell ${describeBox(lastCell)} against region ${describeBox(panned.tableBox)} (REQ-8, REQ-10)`,
        ).toBe(true);
      }
    }
  } finally {
    await removeContainerQuietly(name);
    await removeFixtureTag(tag);
  }
});

// ui-library/specs/data-table.md — "An expansion is never wider than the box the
// table is read in, and never pans": while the grid pans underneath it,
// `renderExpanded`'s content keeps the width of the table's own visible box and
// its left edge holds the table's left edge at every scroll offset. A row is a
// grid to be scanned across; a panel is prose and values to be read.
//
// This is the settled reading of REQ-23, and it is also what keeps the property
// arrangement inside the panel
// (`plan-docker_management_app-detail_property_columns`) seeing the width the
// window actually offers — the half that decides four checks of that plan's own
// suite at 460, 640, 700 and 720.
test('at 375×812 the inline expansion holds the table\u2019s visible box while the grid pans underneath it', async ({ page }) => {
  test.setTimeout(120_000);
  const tag = `vexel-e2e-cols-expansion-${Date.now()}:1`;

  try {
    await createFixtureTag(tag);
    await openScreen(page, 'images-layers', 'Images & layers', PHONE);
    const row = rowContaining(page, tag);
    await expect(row, 'the fixture image never appeared in the list').toBeVisible({ timeout: 20_000 });

    await row.locator('.ui-data-table__cell').first().click();
    await expect(page.locator('.ui-data-table__expanded')).toBeVisible({ timeout: 20_000 });
    await waitForStableExpansion(page);

    await panTo(row, 0);
    const atRest = await measure(row);
    expect(atRest.expandedBox, "the row's inline expansion is not laid out at all").not.toBeNull();
    console.log(
      `[REQ-8] @375×812 expansion ${describeBox(atRest.expandedBox!)} against row ${describeBox(atRest.rowBox)}, visible box ${round(atRest.tableBox.x)}/${atRest.clientWidth}`,
    );

    // The premise: there is a pan to hold against. Without it this test would
    // pass on a build that pins nothing at all.
    expect(
      atRest.scrollWidth,
      `@375×812 the table reports ${atRest.scrollWidth}px of content in ${atRest.clientWidth}px, so nothing pans and this check proves nothing (REQ-8)`,
    ).toBeGreaterThan(atRest.clientWidth);

    expect(
      atRest.expandedBox!.width,
      `@375×812 the inline expansion is ${round(atRest.expandedBox!.width)}px wide in a table read through a ${atRest.clientWidth}px box: it is wider than the box it is read in (data-table.md)`,
    ).toBeCloseTo(atRest.clientWidth, 0);
    expect(
      atRest.expandedBox!.x,
      `@375×812 the inline expansion starts at x ${round(atRest.expandedBox!.x)} where the table's visible box starts at ${round(atRest.tableBox.x)} (data-table.md)`,
    ).toBeCloseTo(atRest.tableBox.x, 0);

    const landed = await panTo(row, atRest.scrollWidth);
    const panned = await measure(row);
    const rowTravel = atRest.rowBox.x - panned.rowBox.x;
    console.log(
      `[REQ-8] @375×812 panned to scrollLeft ${round(landed)}: row moved ${round(rowTravel)}px, expansion ${describeBox(panned.expandedBox!)}`,
    );

    // The grid really did pan, so "the expansion did not move" is a fact about
    // the expansion rather than about a table that never scrolled.
    expect(
      rowTravel,
      `@375×812 the table was panned to scrollLeft ${round(landed)} and the row moved ${round(rowTravel)}px, so nothing was actually panned (REQ-8)`,
    ).toBeGreaterThan(100);

    expect(
      panned.expandedBox!.x,
      `@375×812 the grid panned ${round(rowTravel)}px and the expansion went with it, from x ${round(atRest.expandedBox!.x)} to ${round(panned.expandedBox!.x)}: it does not hold the table's visible box, and reading the panel means panning it (data-table.md)`,
    ).toBeCloseTo(atRest.expandedBox!.x, 0);
    expect(
      panned.expandedBox!.x,
      `@375×812 at scrollLeft ${round(landed)} the expansion sits at x ${round(panned.expandedBox!.x)} where the table's visible box starts at ${round(panned.tableBox.x)} (data-table.md)`,
    ).toBeCloseTo(panned.tableBox.x, 0);
    expect(
      panned.expandedBox!.width,
      `@375×812 at scrollLeft ${round(landed)} the expansion is ${round(panned.expandedBox!.width)}px wide against a ${panned.clientWidth}px visible box (data-table.md)`,
    ).toBeCloseTo(panned.clientWidth, 0);
  } finally {
    await removeFixtureTag(tag);
  }
});
