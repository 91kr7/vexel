/**
 * **A column's label stays over its column, on a list that scrolls**
 * (`ui-library/specs/data-table.md`, "A row and the header share one width and
 * one set of resolved tracks" — third bullet;
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-5`,
 * `REQ-18`, `REQ-29`, `REQ-30`, `REQ-35`).
 *
 * The defect this covers is structural and predates the plan: the column header
 * was drawn as a **sibling** of the box that scrolls, so a vertical scrollbar
 * took real layout space out of that box's content box and out of the rows'
 * grid, while the header's grid resolved in a box that much wider. The flexible
 * tracks redistributed the difference, and every column after the first parted
 * company with its label — silently, and only once a list was long enough to
 * scroll. The repair is that the header and the rows now share **one** scrolling
 * box, the header sticky at its top.
 *
 * ## The harness, and why the green here means something
 *
 * **Playwright's Chromium draws overlay scrollbars on this machine**: measured
 * on a scroll container of its own, a vertical scrollbar takes **0px** — with
 * the default launch, with `--disable-features=OverlayScrollbar`, and with the
 * app's own `::-webkit-scrollbar` width, which `scrollbar-width: thin` overrides
 * anyway. With a 0px scrollbar the defect **cannot reproduce**, and a regression
 * test written on top of one is green whatever the code does. A test that has
 * quietly stopped testing anything is worse than a slow one, and it passes.
 *
 * So the mechanism is made live rather than hoped for: `scrollbar-gutter: stable`
 * is injected on `.ui-scroll-area`, which makes Chromium **reserve the
 * platform's classic scrollbar width in exactly the place a classic scrollbar
 * takes it** — out of the scroll container's content box, leaving its border box
 * untouched (measured on this machine: `offsetWidth 300, clientWidth 289`, an
 * 11px gutter, the same 11px the human's own browser takes). That is the whole
 * of the defect's cause, produced by the browser's own layout rather than
 * imitated with a border; every rule of the product is the product's own.
 *
 * **And the harness checks itself**: every measurement below first asserts that
 * the gutter really was taken out of the scrolling box, so this file cannot pass
 * because the scrollbar was invisible. The figure is printed on every run.
 *
 * The delivered build's own numbers — the same list, the same stub, the same
 * gutter, before the repair — are recorded by
 * `classic-table-criteria-plain-lists.spec.ts` (REQ-29).
 *
 * **Nothing here touches the daemon**: the CLI plugins list is answered in the
 * page, and it is the right subject twice over — it states `maxHeight`, as
 * containers and images do, and it is the list whose `WHY UNAVAILABLE` column
 * the reference analysis measured adrift.
 */
import { expect, test, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { movePointerOverTheRow, readOnceSettled } from './support/settled.js';
import { measureList, round, tableWithColumn } from './support/classic-table.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

const DESKTOP = { width: 1440, height: 1000 };

/** The column only the CLI plugins list carries — the named case's own column. */
const CLI_COLUMN = 'WHY UNAVAILABLE';

/**
 * Fifteen rows, so the list is taller than the `60vh` it caps itself at and
 * really scrolls: a list that does not scroll has no scrollbar and cannot show
 * this defect at all.
 */
const CLI_PLUGINS = Array.from({ length: 15 }, (_, index) => ({
  name: `vexel-e2e-plugin-${String(index).padStart(2, '0')}`,
  command: `docker vexel-e2e-plugin-${String(index).padStart(2, '0')}`,
  version: index % 3 === 0 ? 'v0.36.0-desktop.1' : index % 3 === 1 ? 'v2.40.0' : undefined,
  availability: (index === 4 ? 'unavailable' : index % 2 === 0 ? 'enabled' : 'available') as 'enabled' | 'available' | 'unavailable',
  unavailableReason:
    index === 4 ? 'accessing plugin /usr/local/lib/docker/cli-plugins/docker-vexel-e2e-plugin-04: permission denied' : undefined,
}));

const DAEMON_PLUGINS = [
  { id: 'vexel-e2e-align-plugin', name: 'loki:latest', enabled: true, interfaceTypes: ['docker.logdriver/1.0'], type: 'log driver' },
];

/** The inventory, answered in the page: no mutation is passed on, and the daemon is not read. */
async function stubPlugins(page: Page): Promise<void> {
  await page.route('**/api/plugins', async (route) => {
    if (route.request().method() !== 'GET') return route.abort();
    await route.fulfill({ json: { cli: { items: CLI_PLUGINS }, daemon: { items: DAEMON_PLUGINS } } });
  });
}

/**
 * Makes a scrollbar's layout cost real in a browser that draws overlay
 * scrollbars, by asking for the gutter a classic one occupies.
 *
 * Injected **after** the navigation, since a style tag belongs to the document
 * it was added to, and re-injected by every test that needs it rather than once
 * for the file: each of them must pass on its own.
 */
async function reserveTheScrollbarGutter(page: Page): Promise<void> {
  await page.addStyleTag({ content: '.ui-scroll-area { scrollbar-gutter: stable; }' });
}

/** What the scrolling box of a list looks like, and what its header does inside it. */
/**
 * The scroll box, **once the layout has come to rest**: it is read straight after a real wheel, and what the sticky header is written from is the scroll event.
 *
 * The pass below is what stops two figures coming from two frames; the sampler is
 * what stops the whole reading coming from a frame nobody sees (`support/settled.ts`).
 */
async function measureScrollBox(page: Page, column: string) {
  return await readOnceSettled(
    page,
    () => measureScrollBoxThisFrame(page, column),
    (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
  );
}

/** **One frame, and no test calls it**: the reader above is built out of it. */
async function measureScrollBoxThisFrame(page: Page, column: string) {
  return await page.evaluate((wanted) => {
    const tables = Array.from(document.querySelectorAll<HTMLElement>('.ui-frame__content .ui-data-table'));
    const table = tables.find((candidate) =>
      Array.from(candidate.querySelectorAll('.ui-data-table__header-cell')).some(
        (cell) => cell.closest('.ui-data-table') === candidate && (cell.textContent ?? '').trim() === wanted,
      ),
    );
    if (!table) return null;
    const scroll = table.querySelector<HTMLElement>('.ui-scroll-area');
    const header = table.querySelector<HTMLElement>('.ui-data-table__header');
    const row = table.querySelector<HTMLElement>('.ui-data-table__row');
    if (!scroll || !header || !row) return null;
    const style = getComputedStyle(header);
    return {
      /** The gutter the scrollbar takes: the whole mechanism, in one number. */
      gutter: scroll.offsetWidth - scroll.clientWidth,
      headerInsideScrollBox: scroll.contains(header),
      scrollBoxes: table.querySelectorAll('.ui-scroll-area').length,
      position: style.position,
      zIndex: style.zIndex,
      backdropFilter: style.backdropFilter,
      filter: style.filter,
      stuck: header.className.includes('--stuck'),
      /** The header's own top against the top of the box it scrolls in: sticky means 0. */
      offsetFromScrollTop: header.getBoundingClientRect().top - scroll.getBoundingClientRect().top,
      headerWidth: header.getBoundingClientRect().width,
      rowWidth: row.getBoundingClientRect().width,
      scrollTop: scroll.scrollTop,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
      maxHeight: getComputedStyle(scroll).maxHeight,
      scrollBoxTop: scroll.getBoundingClientRect().top,
      tableTop: table.getBoundingClientRect().top,
      tableHeight: table.getBoundingClientRect().height,
    };
  }, column);
}

/** The screen, at the desktop viewport, with the inventory stubbed and the gutter reserved. */
async function openPluginsWithAScrollbar(page: Page): Promise<void> {
  await page.setViewportSize(DESKTOP);
  await stubPlugins(page);
  await openApp(page, 'plugins');
  await expect(page.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible({ timeout: 20_000 });
  await expect(tableWithColumn(page, CLI_COLUMN).locator('.ui-data-table__row').first()).toBeVisible({ timeout: 20_000 });
  await reserveTheScrollbarGutter(page);
  await page.waitForTimeout(300);
}

/**
 * The harness's own premise, asserted before anything is concluded from it: the
 * scrolling box really is narrower inside than out, and the list really does
 * scroll. Without both, every drift below would read 0 for reasons that have
 * nothing to do with the product.
 */
function expectTheMechanismIsLive(box: NonNullable<Awaited<ReturnType<typeof measureScrollBox>>>, at: string): void {
  console.log(
    `[b2/REQ-5] ${at}: the scrolling box gives up ${round(box.gutter)}px to the scrollbar ` +
      `(${box.scrollHeight}px of list in ${box.clientHeight}px, max-height ${box.maxHeight})`,
  );
  expect(
    box.gutter,
    `${at}: the scrollbar takes ${round(box.gutter)}px of layout space, so this check cannot detect the defect it exists for`,
  ).toBeGreaterThanOrEqual(8);
  expect(box.scrollHeight, `${at}: the list fits inside its own cap, so there is no scrollbar to be wrong about`).toBeGreaterThan(
    box.clientHeight + 1,
  );
}

// data-table.md — "**The header and the rows are inside one scrolling box**, the
// header sticky at its top." Structure first: the arrangement the alignment
// rests on, measured rather than read off the source.
test('the header and the rows share one scrolling box, the header sticky at its top — 1440×1000', async ({ page }) => {
  test.setTimeout(180_000);
  await openPluginsWithAScrollbar(page);

  const box = (await measureScrollBox(page, CLI_COLUMN))!;
  expect(box, 'the CLI plugins list is not on screen at all').not.toBeNull();
  expectTheMechanismIsLive(box, '1440×1000 CLI plugins');

  console.log(
    `[b2/REQ-5] 1440×1000 CLI plugins: header inside the scroll box: ${box.headerInsideScrollBox}, position ${box.position}, ` +
      `z-index ${box.zIndex}, offset from the box's top ${round(box.offsetFromScrollTop)}, header ${round(box.headerWidth)}px ` +
      `against a row's ${round(box.rowWidth)}px`,
  );

  expect(box.headerInsideScrollBox, 'the header is drawn outside the box that scrolls').toBe(true);
  expect(box.scrollBoxes, `the list holds ${box.scrollBoxes} scrolling boxes, so the two grids are back in two content boxes`).toBe(1);
  expect(box.position, 'the header is not sticky, so it scrolls away with the rows').toBe('sticky');
  expect(Number.parseInt(box.zIndex, 10), 'the header states no stacking order, so an open expansion can paint over it').toBeGreaterThanOrEqual(1);
  expect(round(box.offsetFromScrollTop), 'the header does not sit at the top of the box it scrolls in').toBe(0);
  expect(
    round(box.headerWidth),
    `the header is ${round(box.headerWidth)}px where a row is ${round(box.rowWidth)}px: the two grids are not one width`,
  ).toBe(round(box.rowWidth));

  // These lists are main view: the floor under a sticky header is a colour, never
  // a filter (CLAUDE.md, "Performance — background and blur"; REQ-34).
  expect(box.backdropFilter, 'the sticky header computes a backdrop filter on a main-view surface').toBe('none');
  expect(box.filter, 'the sticky header computes a filter on a main-view surface').toBe('none');
});

// REQ-5 — "Every header cell's left edge equals its body cells' left edge
// **exactly**": with a scrollbar really taking layout space, at rest and once the
// list is scrolled under a real wheel.
test('no column drifts from its header while a scrollbar takes real width — 1440×1000', async ({ page }) => {
  test.setTimeout(180_000);
  await openPluginsWithAScrollbar(page);

  const before = (await measureScrollBox(page, CLI_COLUMN))!;
  expectTheMechanismIsLive(before, '1440×1000 CLI plugins, at rest');

  const rested = await measureList(page, CLI_COLUMN);
  console.log(
    `[b2/REQ-5] 1440×1000 CLI plugins at rest: ${JSON.stringify(
      rested.columnEdges.map((column) => `${column.header || '·'}=${round(column.worstDelta)}`),
    )}`,
  );
  for (const column of rested.columnEdges) {
    expect(
      column.worstDelta,
      `at rest the ${column.header || 'unnamed'} column drifts ${round(column.worstDelta)}px from its header on "${column.worstRow}"`,
    ).toBeLessThanOrEqual(0.5);
  }

  // …and once something really is scrolling under it. Driven by a **real wheel**
  // over a row of the list, never by assigning `scrollTop`.
  await movePointerOverTheRow(page, tableWithColumn(page, CLI_COLUMN).locator('.ui-data-table__row').first(), 'the first row of the CLI list');
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(400);

  const scrolled = (await measureScrollBox(page, CLI_COLUMN))!;
  expect(scrolled.scrollTop, 'a real wheel over the list scrolled it nowhere').toBeGreaterThan(0);
  const panned = await measureList(page, CLI_COLUMN);
  console.log(
    `[b2/REQ-5] 1440×1000 CLI plugins scrolled to ${round(scrolled.scrollTop)}: ${JSON.stringify(
      panned.columnEdges.map((column) => `${column.header || '·'}=${round(column.worstDelta)}`),
    )}`,
  );
  for (const column of panned.columnEdges) {
    expect(
      column.worstDelta,
      `at scrollTop ${round(scrolled.scrollTop)} the ${column.header || 'unnamed'} column drifts ${round(column.worstDelta)}px from its header`,
    ).toBeLessThanOrEqual(0.5);
  }

  // The header is still where a sticky header belongs — at the top of the box,
  // not scrolled away with the rows it names.
  expect(round(scrolled.offsetFromScrollTop), 'the header scrolled away with the rows it names').toBe(0);
});

/**
 * data-table.md — "The sticky header is **opaque only while the list is scrolled
 * away from its top**, carrying a state class for it: its own wash is 4% white
 * and hides nothing, and a list that never scrolls is drawn exactly as before."
 *
 * Driven by a real wheel, and asserted on the **computed background** rather than
 * on the class alone: what the rule exists for is that rows do not read through
 * the band naming them.
 */
test('the header takes an opaque floor only while something scrolls under it — 1440×1000', async ({ page }) => {
  test.setTimeout(180_000);
  await openPluginsWithAScrollbar(page);

  const paint = async () =>
    await page.evaluate((wanted) => {
      const tables = Array.from(document.querySelectorAll<HTMLElement>('.ui-frame__content .ui-data-table'));
      const table = tables.find((candidate) =>
        Array.from(candidate.querySelectorAll('.ui-data-table__header-cell')).some(
          (cell) => cell.closest('.ui-data-table') === candidate && (cell.textContent ?? '').trim() === wanted,
        ),
      )!;
      const header = table.querySelector<HTMLElement>('.ui-data-table__header')!;
      const style = getComputedStyle(header);
      return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, stuck: header.className.includes('--stuck') };
    }, CLI_COLUMN);

  const atRest = await paint();
  await movePointerOverTheRow(page, tableWithColumn(page, CLI_COLUMN).locator('.ui-data-table__row').first(), 'the first row of the CLI list');
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(400);
  const scrolled = await paint();

  console.log(
    `[b2/REQ-35] 1440×1000 CLI plugins header: at rest ${atRest.backgroundColor} (stuck ${atRest.stuck}), ` +
      `scrolled ${scrolled.backgroundColor} (stuck ${scrolled.stuck})`,
  );

  expect(atRest.stuck, 'the header carries its scrolled state before anything has scrolled').toBe(false);
  expect(scrolled.stuck, 'the header takes no floor while rows pass beneath it').toBe(true);
  expect(
    scrolled.backgroundColor,
    'the header paints the same background scrolled as at rest, so a row reads through the band naming it',
  ).not.toBe(atRest.backgroundColor);
  // The floor is a colour. No surface of a scrolled list gains a filter (REQ-34, REQ-35).
  expect(scrolled.backgroundImage, 'the scrolled header paints a gradient of its own beyond the wash it always had').not.toContain('url(');
});

/**
 * data-table.md — "`maxHeight?: string` — caps the height of the **list**, the
 * column header and the rows together. **Corrected 2026-08-16**: it bounded the
 * rows alone, the header standing above the cap, so a list stated at `60vh` was
 * 60vh plus a header tall."
 *
 * The one behavioural consequence of the repair, and therefore the one thing
 * that has to be measured rather than trusted: what the stated cap now bounds.
 */
test('the stated cap bounds the header and the rows together — 1440×1000', async ({ page }) => {
  test.setTimeout(180_000);
  await openPluginsWithAScrollbar(page);

  const box = (await measureScrollBox(page, CLI_COLUMN))!;
  expectTheMechanismIsLive(box, '1440×1000 CLI plugins');
  console.log(
    `[b2/REQ-5] 1440×1000 CLI plugins: the whole list is ${round(box.tableHeight)}px, its scrolling box ${round(box.clientHeight)}px ` +
      `of a ${DESKTOP.height}px viewport, cap ${box.maxHeight}`,
  );

  // The header is inside the box the cap is set on…
  expect(box.headerInsideScrollBox, 'the header is outside the box the cap bounds').toBe(true);
  expect(round(box.scrollBoxTop), 'the scrolling box does not start where the list does').toBe(round(box.tableTop));
  // …so the list as a whole is no taller than the cap, rather than the cap plus a header.
  expect(
    round(box.tableHeight),
    `the list is ${round(box.tableHeight)}px where its stated cap is ${round(DESKTOP.height * 0.6)}px`,
  ).toBeLessThanOrEqual(round(DESKTOP.height * 0.6) + 1);
});
