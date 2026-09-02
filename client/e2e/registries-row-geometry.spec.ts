/**
 * F7 — the registries screen, measured
 * (`plan-ui-coherence-optimisation/REQ-36`, `REQ-37`, `REQ-38`).
 *
 * REQ-37 is a claim about **boxes**, not about text: "row heights no longer
 * alternate down the column … measured as equal row boxes". A row that has lost
 * a line keeps every character it had; what it loses is its height. So every
 * assertion here is on a viewport box, and the two premises that make such a
 * measurement mean anything are asserted before it:
 *
 * - **both kinds of row are on screen at once.** An inventory of registries all
 *   in one state would report equal heights whatever the code did, so the
 *   screen is filled from a fixture holding all of them — authenticated and not,
 *   with an account and without, backed by a credential helper and by the
 *   configuration file, over https and over plain http
 *   (`support/registry-fixture-server.ts`, which also explains why it is a
 *   separate server process and why the operator's own `~/.docker` is never
 *   read);
 * - **a cell that has been cleared of its neighbour is not repaired if it was
 *   merely painted over.** An ellipsised line is still laid out at its full
 *   length and only painted clipped, so every rectangle below is clipped by
 *   every ancestor that is not `overflow: visible` before two of them are
 *   intersected.
 *
 * Every control this file drives is driven with a **real pointer at the visible
 * control's own coordinates**, and a row is clicked on its **first cell**: below
 * the desktop breakpoint a row is wider than the box it is read in, so its own
 * centre can sit over the action cluster.
 *
 * Nothing is created on the daemon, nothing is logged in or out — a credential
 * belongs to the host's credential store and to the operator — and the fixture's
 * process, config directory and data directory go in an `afterAll`.
 */
import type { Browser } from '@playwright/test';
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { clickAtItsCentre, readOnceSettled } from './support/settled.js';
import {
  FIXTURE_REGISTRIES,
  FIXTURE_SECRET,
  startRegistryFixtureServer,
  type FixtureRegistry,
  type RegistryFixtureServer,
} from './support/registry-fixture-server.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

interface Viewport {
  width: number;
  height: number;
}

/** The three viewports this plan is written against; REQ-37 names the first two. */
const VIEWPORTS: Viewport[] = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
];

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
  /** The row's first line — the host, or the repository name. */
  label: string;
  text: string;
  box: Box;
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
  rows: RowGeometry[];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function describeBox(box: Box): string {
  return `x=${round(box.x)}, y=${round(box.y)}, ${round(box.width)}×${round(box.height)}`;
}

/**
 * The panel a list is drawn in, named by the section header above it — and the
 * box the pair arrangement lays out, which is what the widths below are measured
 * on.
 *
 * The innermost region carrying both the heading and the list: since
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`
 * a panel's section header (and, on the right, its search toolbar) sits **above**
 * the one unpadded card holding its list, so the card no longer holds the title
 * it used to be found by.
 */
function panel(page: Page, title: 'registries' | 'repositories'): Locator {
  const heading = title === 'registries' ? /^Registries & credentials$/ : /^Repositories(\s|$)/;
  return page
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: heading }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

function rowOf(page: Page, host: string): Locator {
  return panel(page, 'registries').locator('.ui-data-table__row', { hasText: host }).first();
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
async function measureList(page: Page, title: 'registries' | 'repositories'): Promise<ListGeometry> {
  return await readOnceSettled(
    page,
    () => measureListThisFrame(page, title),
    (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
  );
}

/** **One frame, and no test calls it**: the sampler above is built out of it. */
async function measureListThisFrame(page: Page, title: 'registries' | 'repositories'): Promise<ListGeometry> {
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
    const headers = Array.from(list.querySelectorAll('.ui-data-table__header-cell')).map((cell) => (cell.textContent ?? '').trim());

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

      const label = (row.querySelector('.ui-table-two-line-cell__title')?.textContent ?? row.textContent ?? '').trim();
      return { label, text: (row.textContent ?? '').replace(/\s+/g, ' ').trim(), box: box(row), cells, collisions };
    });

    return {
      card: box(card),
      list: box(list),
      listClientWidth: list.clientWidth,
      listScrollWidth: list.scrollWidth,
      headers,
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

/** The fixture row for a host, as the browser drew it. */
function rowFor(list: ListGeometry, host: string): RowGeometry | undefined {
  return list.rows.find((row) => row.cells.some((cell) => cell.text.startsWith(host)));
}

function cellOf(row: RowGeometry, header: RegExp): CellGeometry | undefined {
  return row.cells.find((cell) => header.test(cell.header));
}

let fixture: RegistryFixtureServer;

test.describe('F7 — the registries screen against a nine-registry inventory', () => {
  test.beforeAll(async () => {
    fixture = await startRegistryFixtureServer();
  });

  test.afterAll(async () => {
    await fixture?.stop();
  });

  /** A page on the fixture server, at `viewport`, showing the Registries screen. */
  async function openFixtureScreen(browser: Browser, viewport: Viewport): Promise<{ page: Page; close: () => Promise<void> }> {
    const context = await browser.newContext({ baseURL: fixture.origin, viewport });
    const page = await context.newPage();
    await openApp(page, 'registries');
    await expect(page.getByRole('heading', { level: 2, name: 'Registries & credentials' })).toBeVisible({ timeout: 20_000 });
    await expect(rowOf(page, 'docker.io')).toBeVisible({ timeout: 20_000 });
    return { page, close: () => context.close() };
  }

  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}×${viewport.height}`;

    // REQ-37 — "Row heights no longer alternate down the column. `authenticated · credential store:
    // desktop` and `not authenticated` occupy the same number of lines … measured as equal row
    // boxes"; registries-screen.md — "Every registry row is the same height as every other, whatever
    // its state line would have said".
    test(`every registry row is the same height as every other at ${at}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const { page, close } = await openFixtureScreen(browser, viewport);

      try {
        const list = await measureList(page, 'registries');

        // The premise: the inventory really does hold rows in different states, so equal heights
        // are a repair and not an artefact of every row saying the same thing.
        const drawn = FIXTURE_REGISTRIES.map((expected) => ({ expected, row: rowFor(list, expected.host) }));
        for (const { expected, row } of drawn) {
          expect(row, `${at}: the fixture registry ${expected.host} is not listed`).toBeDefined();
        }
        const states = new Set(drawn.map(({ expected }) => `${expected.authenticated}/${expected.account !== undefined}/${expected.credentialStore ?? 'none'}`));
        expect(states.size, `${at}: the fixture put registries of only ${states.size} kind(s) on screen`).toBeGreaterThan(3);

        for (const { expected, row } of drawn) {
          const registryCell = cellOf(row!, /^registry$/i)!;
          const storeCell = cellOf(row!, /^credential store$/i)!;
          console.log(
            `[REQ-37] ${at} ${expected.host}: row ${describeBox(row!.box)} — registry cell "${registryCell.text}" (${registryCell.lines} line(s), ${round(
              registryCell.clipped,
            )}px clipped), store cell "${storeCell.text}" (${round(storeCell.clipped)}px clipped)`,
          );
        }

        // Every value the row states, in the column the contract puts it in.
        for (const { expected, row } of drawn) {
          const registryCell = cellOf(row!, /^registry$/i)!;
          const storeCell = cellOf(row!, /^credential store$/i)!;
          expect(registryCell.text, `${at}: the ${expected.host} row does not lead with its host`).toContain(expected.host);
          if (expected.account !== undefined) {
            expect(registryCell.text, `${at}: the ${expected.host} row does not name the account it is authenticated as`).toContain(expected.account);
          }
          if (!expected.authenticated) {
            expect(registryCell.text, `${at}: the ${expected.host} row does not state that it is not authenticated`).toContain('not authenticated');
          }
          if (expected.plainHttp) {
            expect(registryCell.text, `${at}: the ${expected.host} row does not state that it is reached over plain http`).toContain('plain http');
          }
          if (expected.credentialStore === undefined) {
            expect(storeCell.text, `${at}: the ${expected.host} row names a credential store it has none of`).toMatch(/^[-–—]?$/);
          } else {
            expect(storeCell.text, `${at}: the ${expected.host} row does not name its credential store`).toBe(expected.credentialStore);
          }
        }

        // REQ-37 itself.
        const heights = list.rows.map((row) => round(row.box.height));
        console.log(`[REQ-37] ${at}: ${list.rows.length} rows, heights ${JSON.stringify(heights)}, panel ${round(list.card.width)}px, list ${round(list.list.width)}px`);
        expect(
          new Set(heights).size,
          `${at}: the rows are ${JSON.stringify(heights)}px tall — a row's height still depends on the registry's state`,
        ).toBe(1);

        // And the cells of a row do not reach into one another, which is what a repair that merely
        // shortened the line would leave behind.
        const collisions = list.rows.flatMap((row) => row.collisions.map((collision) => `${row.label}: ${collision}`));
        console.log(`[REQ-36] ${at}: ${collisions.length} colliding cell pair(s) over ${list.rows.reduce((total, row) => total + row.cells.length, 0)} cells`);
        expect(collisions, `${at}: a cell's painted text lands on the cell beside it`).toEqual([]);

        // REQ-87 — nothing on this screen carries a credential, and the fixture's is a string that
        // can be looked for.
        expect(await page.getByText(FIXTURE_SECRET).count(), `${at}: the fixture credential is on screen`).toBe(0);
      } finally {
        await close();
      }
    });
  }

  // REQ-36 — "each row's `Log in` / `Log out` is an action of the cluster, not a trailing one-off
  // button"; action-button-group.md — the cluster "stops click propagation so an action never also
  // triggers the containing row's onRowSelect".
  test('logging in and out are actions of the row cluster, and neither also selects the row', async ({ browser }) => {
    test.setTimeout(120_000);
    const { page, close } = await openFixtureScreen(browser, VIEWPORTS[0]);

    try {
      const unauthenticated = FIXTURE_REGISTRIES.find((entry) => !entry.authenticated && entry.host !== 'docker.io')!;
      const authenticated = FIXTURE_REGISTRIES.find((entry) => entry.authenticated)!;

      // Every control a row carries sits in its action cluster, and the cluster sits in the actions
      // column: there is no trailing affordance of the row's own left anywhere.
      for (const host of [unauthenticated.host, authenticated.host]) {
        const row = rowOf(page, host);
        const cluster = row.locator('.ui-action-button-group');
        await expect(cluster, `${host}: the row draws no action cluster`).toHaveCount(1);
        expect(await row.locator('button').count(), `${host}: a control of the row sits outside its action cluster`).toBe(
          await cluster.locator('button').count(),
        );
        const clusterInActionsColumn = await row.locator('.ui-data-table__cell', { has: page.locator('.ui-action-button-group') }).count();
        expect(clusterInActionsColumn, `${host}: the action cluster is not a cell of the row`).toBe(1);
      }

      // The first registry is the one being browsed until something moves the selection.
      await expect(rowOf(page, 'docker.io')).toHaveClass(/ui-data-table__row--selected/);

      // A real pointer, at the control's own coordinates.
      const logIn = rowOf(page, unauthenticated.host).getByRole('button', { name: 'Log in' });
      await expect(logIn).toBeVisible();
      await clickAtItsCentre(page, logIn, 'the Log in action');

      const loginDialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Log in to ${unauthenticated.host}` }) });
      await expect(loginDialog, 'the log-in form did not open from the row action').toBeVisible();
      // …and the click that opened it did not also move the browser onto that registry.
      await expect(rowOf(page, 'docker.io'), 'the row action also selected the row').toHaveClass(/ui-data-table__row--selected/);
      await expect(page.getByRole('heading', { level: 2, name: 'Repositories · docker.io' })).toBeVisible();
      // Nothing is submitted: a credential belongs to the operator's own store.
      await loginDialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(loginDialog).toBeHidden();

      // The other half of the pair, on an authenticated row: it asks before it does anything.
      const logOut = rowOf(page, authenticated.host).getByRole('button', { name: 'Log out' });
      await expect(logOut).toBeVisible();
      await clickAtItsCentre(page, logOut, 'the Log out action');

      const confirmation = page.locator('.ui-modal');
      await expect(confirmation).toBeVisible();
      await expect(confirmation).toContainText(authenticated.host);
      await expect(confirmation).toContainText(/credential store/i);
      await expect(rowOf(page, 'docker.io'), 'the log-out action also selected the row').toHaveClass(/ui-data-table__row--selected/);
      // Never confirmed: what a log out does to a credential store is proved where it can be undone.
      await confirmation.getByRole('button', { name: 'Cancel' }).click();
      await expect(confirmation).toBeHidden();

      // Selecting a registry is still what a click on the row itself does — on its first cell,
      // the row's own centre being over the action cluster once a table pans.
      await rowOf(page, unauthenticated.host).locator('.ui-data-table__cell').first().click();
      await expect(page.getByRole('heading', { level: 2, name: `Repositories · ${unauthenticated.host}` })).toBeVisible({ timeout: 20_000 });
      await expect(rowOf(page, unauthenticated.host)).toHaveClass(/ui-data-table__row--selected/);
    } finally {
      await close();
    }
  });

  // REQ-38 — "The delivered empty state is preserved in the primitive's form … it survives as a
  // title, one line and the resolving action, with the same words"; registries-screen.md — that
  // action "puts the cursor in the search box".
  test('the default index invites a search, and its action puts the cursor in the search box', async ({ browser }) => {
    test.setTimeout(120_000);
    const { page, close } = await openFixtureScreen(browser, VIEWPORTS[0]);

    try {
      const emptyState = panel(page, 'repositories').locator('.ui-empty-state');
      await expect(emptyState).toHaveCount(1);
      await expect(emptyState.locator('.ui-empty-state__title')).toHaveText('Search Docker Hub');
      await expect(emptyState.locator('.ui-empty-state__description')).toHaveCount(1);
      await expect(emptyState.locator('.ui-empty-state__description')).toHaveText('Docker Hub has no catalog to list: type a term to search it.');

      const action = emptyState.getByRole('button');
      await expect(action, 'the invitation offers no control that resolves it').toHaveCount(1);
      console.log(`[REQ-38] the resolving action reads "${(await action.innerText()).trim()}"`);

      // Driven with a real pointer at the control's own coordinates: a programmatic activation
      // moves no focus, and focus is the whole of what this control does.
      await clickAtItsCentre(page, action, "the row's action");

      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        return { label: element?.getAttribute('aria-label') ?? null, tag: element?.tagName.toLowerCase() ?? null };
      });
      expect(focused, 'the action left the cursor somewhere other than the search box').toEqual({ label: 'Search repositories', tag: 'input' });
    } finally {
      await close();
    }
  });

  // REQ-36 — the second list of the screen, with what INT-3 keeps exactly as delivered: the
  // repository, its description, its pull count, and the tag chips with their sizes and their pull.
  // The browse endpoints are stubbed, since the only registry every machine is configured for is the
  // public index and this suite never reaches it (CLAUDE.md, "No test reaches Docker Hub").
  test('the repositories list carries its tags, sizes and pull under every row', async ({ browser }) => {
    test.setTimeout(120_000);
    const { page, close } = await openFixtureScreen(browser, VIEWPORTS[0]);

    try {
      await page.route('**/api/registries/repositories*', async (route) => {
        await route.fulfill({
          json: [
            { name: 'library/vexel-e2e', description: 'a stubbed repository, so this list has rows', pullCount: 1_800_000_000 },
            { name: 'myorg/vexel-e2e-plain', pullCount: 48_000 },
          ],
        });
      });
      await page.route('**/api/registries/tags*', async (route) => {
        await route.fulfill({ json: [{ name: '1.0', sizeBytes: 5_242_880, pullReference: 'docker.io/library/vexel-e2e:1.0' }] });
      });

      const repositories = panel(page, 'repositories');
      await repositories.getByLabel('Search repositories').fill('vexel-e2e');
      await expect(repositories.locator('.ui-data-table__row')).toHaveCount(2, { timeout: 20_000 });

      const list = await measureList(page, 'repositories');
      for (const row of list.rows) {
        console.log(`[REQ-36] repositories row "${row.label}": ${describeBox(row.box)} — ${row.cells.map((cell) => `${cell.header}="${cell.text}"`).join(', ')}`);
      }

      const described = rowFor(list, 'library/vexel-e2e')!;
      expect(cellOf(described, /^repository$/i)!.text).toContain('a stubbed repository, so this list has rows');
      expect(cellOf(described, /^pulls$/i)!.text).toBe('1.8B pulls');
      expect(cellOf(rowFor(list, 'myorg/vexel-e2e-plain')!, /^pulls$/i)!.text).toBe('48k pulls');

      // The tags sit in the content every row of this list carries, below the row itself.
      const rowContent = repositories.locator('.ui-data-table__row-content').first();
      await expect(rowContent).toContainText('1.0');
      await expect(rowContent).toContainText('5MB');
      await expect(rowContent.getByRole('button', { name: 'pull' })).toHaveCount(1);

      // No cell of this list reaches into the one beside it either.
      const collisions = list.rows.flatMap((row) => row.collisions.map((collision) => `${row.label}: ${collision}`));
      expect(collisions, 'a repository cell inks over the cell beside it').toEqual([]);

      // The pull names the reference the server computed, and is abandoned rather than run.
      const chipPull = rowContent.getByRole('button', { name: 'pull' });
      await clickAtItsCentre(page, chipPull, 'the pull chip');
      const pullDialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Pull tag' }) });
      await expect(pullDialog).toBeVisible();
      await expect(pullDialog).toContainText('docker.io/library/vexel-e2e:1.0');
      await pullDialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(pullDialog).toBeHidden();
    } finally {
      await close();
    }
  });

  // The screen's own layout: `RegistriesScreen.tsx` handed `Grid` a template that never collapsed,
  // which at 375×812 left the list 77px wide. Batch 4's one-prop fix is `arrangement="pair"`, whose
  // contract (grid.md) is a pair at desktop widths and one column below them.
  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}×${viewport.height}`;

    test(`the two panels are a pair at desktop widths and one column at the phone breakpoint — ${at}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const { page, close } = await openFixtureScreen(browser, viewport);

      try {
        const registries = await measureList(page, 'registries');
        const repositories = await panel(page, 'repositories').evaluate((card) => {
          const rect = card.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        });
        const column = await contentColumnWidth(page);

        console.log(
          `[REQ-36] ${at}: content column ${round(column)}px — registries panel ${describeBox(registries.card)}, list ${round(
            registries.list.width,
          )}px; repositories panel ${describeBox(repositories)}`,
        );

        if (viewport.width >= 1280) {
          // Side by side, and the pair divides the column between them equally.
          expect(round(repositories.y), `${at}: the two panels are not on one row`).toBe(round(registries.card.y));
          expect(
            Math.abs(repositories.width - registries.card.width),
            `${at}: the pair divides the column unequally — ${round(registries.card.width)}px against ${round(repositories.width)}px`,
          ).toBeLessThanOrEqual(1);
        } else {
          // One column: same left edge, same width, the second below the first, each at the width
          // the content column offers.
          expect(round(repositories.x), `${at}: the panels are still side by side`).toBe(round(registries.card.x));
          expect(round(repositories.width), `${at}: the stacked panels do not share one width`).toBe(round(registries.card.width));
          expect(repositories.y, `${at}: the repositories panel is not below the registries panel`).toBeGreaterThan(registries.card.y);
          expect(
            round(registries.card.width),
            `${at}: the registries panel is ${round(registries.card.width)}px of a ${round(column)}px content column`,
          ).toBeGreaterThanOrEqual(round(column) - 1);
        }

        // data-table.md — given the width its columns' minimums need, the table divides it as the
        // tracks say; given less, it pans rather than starving a column, and the pan brings the
        // last column into view.
        console.log(`[REQ-36] ${at}: registries list holds ${round(registries.listScrollWidth)}px of row in ${round(registries.listClientWidth)}px`);
        if (viewport.width >= 1280) {
          expect(
            registries.listScrollWidth,
            `${at}: the registries list pans at a desktop width, so a column does not fit the panel it was given`,
          ).toBeLessThanOrEqual(registries.listClientWidth + 1);
        } else {
          expect(registries.listScrollWidth, `${at}: the list neither fits nor pans`).toBeGreaterThan(registries.listClientWidth);
          const panned = await panel(page, 'registries').evaluate((card) => {
            const list = card.querySelector('.ui-data-table') as HTMLElement;
            list.scrollLeft = list.scrollWidth;
            const listBox = list.getBoundingClientRect();
            const cells = Array.from(list.querySelectorAll('.ui-data-table__row')[0]?.querySelectorAll('.ui-data-table__cell') ?? []);
            const last = cells[cells.length - 1]!.getBoundingClientRect();
            return { scrollLeft: list.scrollLeft, lastInside: last.left >= listBox.left - 1 && last.right <= listBox.right + 1 };
          });
          console.log(`[REQ-36] ${at}: pan reaches scrollLeft ${round(panned.scrollLeft)}, last column inside the region: ${panned.lastInside}`);
          expect(panned.scrollLeft, `${at}: the registries list refuses to pan`).toBeGreaterThan(0);
          expect(panned.lastInside, `${at}: the pan does not bring the last column into view`).toBe(true);
        }

        // No cell of any row is drawn at no width at all, at any viewport.
        const starved = registries.rows.flatMap((row) => row.cells.filter((cell) => cell.box.width <= 0).map((cell) => `${row.label} ${cell.header}`));
        expect(starved, `${at}: a cell is in the DOM and nowhere on screen`).toEqual([]);
      } finally {
        await close();
      }
    });
  }
});

/** Kept out of the loops above so the fixture's shape is stated once, in the file that depends on it. */
test('the fixture inventory covers every state a registry row has to draw', () => {
  const withAccount = FIXTURE_REGISTRIES.filter((entry: FixtureRegistry) => entry.account !== undefined);
  const authenticatedWithoutAccount = FIXTURE_REGISTRIES.filter((entry) => entry.authenticated && entry.account === undefined);
  const helperBacked = FIXTURE_REGISTRIES.filter((entry) => entry.credentialStore !== undefined && entry.credentialStore !== 'docker config file');
  const configFileBacked = FIXTURE_REGISTRIES.filter((entry) => entry.credentialStore === 'docker config file');

  expect(withAccount.length).toBeGreaterThan(0);
  expect(authenticatedWithoutAccount.length).toBeGreaterThan(0);
  expect(helperBacked.length).toBeGreaterThan(0);
  expect(configFileBacked.length).toBeGreaterThan(0);
  expect(FIXTURE_REGISTRIES.filter((entry) => !entry.authenticated).length).toBeGreaterThan(0);
  expect(FIXTURE_REGISTRIES.filter((entry) => entry.plainHttp).length).toBeGreaterThan(0);
});
