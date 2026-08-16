/**
 * F10 — the plugins screen, measured
 * (`plan-ui-coherence-optimisation/REQ-46`, `REQ-47`, `REQ-48`;
 * `plugins/specs/plugins-screen.md`).
 *
 * Every claim here is about **boxes and paint**. A pill that has stopped
 * following the row above it, a row that has lost a line, a version string
 * painting past the card that holds it, a panel drawn off the left edge of the
 * viewport — none of them change what the screen *says*; what they change is
 * where its rectangles are (CLAUDE.md, "What a check drives, and what it
 * measures"). So the assertions are on viewport boxes and on painted ink, and
 * every control is driven with a **real pointer at the visible control's own
 * coordinates**.
 *
 * **The inventories are stubbed at the browser's own request, and that is
 * deliberate.** REQ-47 is about a column of rows whose version strings differ in
 * length, and REQ-48 about two inventories that are empty — with and without a
 * stated reason. The daemon this suite runs against exposes **no** managed
 * plugin, and installing one to obtain a row would be a host mutation
 * (`docker plugin ls` is a host-wide list no label can scope, which is why the
 * one spec that installs lives in `e2e/exclusive/`). Answering `GET /api/plugins`
 * in the page gives every row state at once, at every viewport, and touches
 * nothing on the machine: no container, no image, no plugin, no context.
 *
 * What that costs is stated rather than hidden: this file says nothing about the
 * server's reading of the daemon. That half is `plugins.spec.ts`, which drives
 * the real inventory — and measures REQ-47's pill on the CLI plugins the
 * operator's own installation ships, which is where the defect was found.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';

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

interface CliPluginFixture {
  name: string;
  command: string;
  version?: string;
  availability: 'enabled' | 'available' | 'unavailable';
  unavailableReason?: string;
}

interface DaemonPluginFixture {
  id: string;
  name: string;
  reference?: string;
  enabled: boolean;
  interfaceTypes: string[];
  type: string;
  description?: string;
}

/**
 * A CLI inventory of the shape a stock installation ships: fifteen rows, version
 * strings of three markedly different lengths — `v0.36.0-desktop.1` against
 * `v2.40.0` against none at all — and all three availabilities, the widest badge
 * included. Those two differences are exactly what used to decide where a row's
 * pill was drawn (REQ-47).
 */
const CLI_FIXTURE: CliPluginFixture[] = [
  { name: 'buildx', command: 'docker buildx', version: 'v0.36.0-desktop.1', availability: 'enabled' },
  { name: 'compose', command: 'docker compose', version: 'v2.40.0', availability: 'enabled' },
  { name: 'ai', command: 'docker ai', version: 'v1.9.4', availability: 'available' },
  { name: 'cloud', command: 'docker cloud', version: 'v0.3.2', availability: 'available' },
  { name: 'debug', command: 'docker debug', version: 'v0.0.42', availability: 'enabled' },
  { name: 'desktop', command: 'docker desktop', version: 'v0.1.9', availability: 'enabled' },
  { name: 'dev', command: 'docker dev', version: 'v0.1.2', availability: 'available' },
  { name: 'extension', command: 'docker extension', version: 'v0.2.27', availability: 'enabled' },
  { name: 'feedback', command: 'docker feedback', version: 'v1.0.0-beta.14', availability: 'available' },
  { name: 'init', command: 'docker init', version: 'v1.4.0', availability: 'enabled' },
  { name: 'mcp', command: 'docker mcp', version: 'v0.24.0-desktop.2', availability: 'available' },
  { name: 'model', command: 'docker model', version: 'v0.1.44', availability: 'enabled' },
  { name: 'sbom', command: 'docker sbom', version: '0.6.1', availability: 'enabled' },
  { name: 'scout', command: 'docker scout', version: 'v1.18.3', availability: 'enabled' },
  {
    name: 'refused',
    command: 'docker refused',
    availability: 'unavailable',
    unavailableReason: 'accessing plugin /usr/local/lib/docker/cli-plugins/docker-refused: permission denied',
  },
];

/**
 * Three daemon plugins, differing in the one value whose presence used to decide
 * a row's height — the description — and one of them carrying a name no row can
 * hold at the phone breakpoint.
 */
const DAEMON_FIXTURE: DaemonPluginFixture[] = [
  {
    id: 'e2e-plugin-described',
    name: 'localhost:41234/vexel-e2e-geometry-plugin:v1',
    reference: 'localhost:41234/vexel-e2e-geometry-plugin:v1',
    enabled: false,
    interfaceTypes: ['docker.volumedriver/1.0'],
    type: 'volume driver',
    description: 'a stubbed reading of a volume driver, carrying a description of its own',
  },
  {
    id: 'e2e-plugin-bare',
    name: 'loki:latest',
    enabled: true,
    interfaceTypes: ['docker.logdriver/1.0'],
    type: 'log driver',
  },
  {
    id: 'e2e-plugin-network',
    name: 'weaveworks/net-plugin:latest_release',
    enabled: false,
    interfaceTypes: ['docker.networkdriver/1.0'],
    type: 'network driver',
    description: 'a stubbed reading of a network driver',
  },
];

const INSPECT_FIXTURE = {
  ...DAEMON_FIXTURE[0],
  documentation: 'https://docs.docker.com/engine/extend/',
  mounts: ['/var/lib/docker/plugins/state → /mnt/state'],
  devices: ['/dev/fuse'],
  capabilities: ['CAP_SYS_ADMIN'],
  env: [],
  raw: {
    Id: 'e2e-plugin-described'.repeat(2),
    Name: DAEMON_FIXTURE[0].name,
    Enabled: false,
    Config: {
      Description: 'a stubbed reading of a volume driver, carrying a description of its own',
      Interface: { Types: ['docker.volumedriver/1.0'], Socket: 'sshfs.sock' },
      Entrypoint: ['/docker-volume-sshfs'],
      WorkDir: '/go/src/github.com/vieux/docker-volume-sshfs',
    },
  },
};

interface Reading {
  cli: { items: CliPluginFixture[]; unavailableReason?: string };
  daemon: { items: DaemonPluginFixture[]; unavailableReason?: string };
}

const FULL_READING: Reading = { cli: { items: CLI_FIXTURE }, daemon: { items: DAEMON_FIXTURE } };

/**
 * Answers the plugin inventory in the page, leaving the daemon untouched.
 *
 * Only `GET` is answered: everything else on the same path — the removal, above
 * all — is handed on rather than intercepted, so a stub can never be mistaken
 * for a mutation that did not happen.
 */
async function stubReading(page: Page, reading: Reading): Promise<void> {
  await page.route('**/api/plugins', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({ json: reading });
  });
  await page.route('**/api/plugins/inspect*', async (route) => {
    const name = new URL(route.request().url()).searchParams.get('name') ?? '';
    await route.fulfill({ json: { ...INSPECT_FIXTURE, name, id: name } });
  });
}

function content(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

/**
 * The region one of the two inventories is read in, by the section header naming
 * it.
 *
 * Named by **what it holds** rather than by the surface it used to be: each
 * section's header — and, for the daemon list, its toolbar — sits **above** the
 * one unpadded card holding its list (`plugins-screen.md`, and
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`),
 * so a card can no longer be found by the heading it used to hold. A panel is
 * the innermost region carrying both the heading and the list; every region
 * matching contains the same heading and is therefore an ancestor of the next,
 * so the last in document order is the panel's own — and on a screen still drawn
 * the old way that is its card. The **card** itself is still what is measured;
 * it is resolved from the table inside `measureList`.
 */
function panel(page: Page, title: string): Locator {
  return content(page)
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: title }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

function rows(page: Page, title: string): Locator {
  return panel(page, title).locator('.ui-data-table__row');
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function describeBox(box: Box): string {
  return `x=${round(box.x)}, y=${round(box.y)}, ${round(box.width)}×${round(box.height)}`;
}

interface CellGeometry {
  header: string;
  text: string;
  box: Box;
  /** The pill this cell draws, where it draws one — the box REQ-47 is about. */
  badge: Box | null;
  /** Painted ink of this cell that lands outside the card holding the list, in px of width. */
  outsideTheCard: number;
  /** Lines the cell draws, whatever they say. */
  lines: number;
}

interface RowGeometry {
  label: string;
  box: Box;
  cells: CellGeometry[];
  inkPieces: number;
}

interface ListGeometry {
  card: Box;
  table: Box;
  tableClientWidth: number;
  tableScrollWidth: number;
  /** The scrolling region of the body, where the list caps its own height. */
  scrollArea: { height: number; scrollHeight: number; maxHeight: string } | null;
  headers: string[];
  headerBoxes: Box[];
  rows: RowGeometry[];
  emptyState: { title: string; description: string | null; controls: number; box: Box } | null;
}

/**
 * One card of the screen, row by row and cell by cell, in a single pass — so no
 * two figures come from two layouts.
 *
 * The ink is **clipped by every ancestor that is not `overflow: visible`** and
 * then compared to the card's own box, which is the instrument the defect calls
 * for: a version string painted 35.2px past the card that held it was ink nobody
 * had clipped, while a column beyond the pan region's visible box is not painted
 * at all — the table clips it, and panning is how it is reached. Measured raw,
 * the second would be reported as the first (as it was, on the first run of this
 * file: 43 "spilling" cells at 375×812, every one of them merely panned).
 */
async function measureList(page: Page, title: string): Promise<ListGeometry> {
  return await panel(page, title).evaluate((region) => {
    // The list's **own card**, resolved from the table it holds: the section
    // header and the toolbar are outside it now, so the region scoped by the
    // heading is no longer the surface, and every figure below is about the
    // surface (REQ-40).
    const cardElement = (region.querySelector('.ui-data-table')?.closest('.ui-surface') ?? region) as HTMLElement;
    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };

    /** A rectangle reduced to what is actually painted: every clipping ancestor cuts it. */
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

    const paintedInk = (element: Element): Box[] => {
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

    const cardBox = cardElement.getBoundingClientRect();
    const table = cardElement.querySelector('.ui-data-table') as HTMLElement | null;
    const scroll = cardElement.querySelector('.ui-scroll-area') as HTMLElement | null;
    const headerCells = table ? Array.from(table.querySelectorAll<HTMLElement>('.ui-data-table__header-cell')) : [];
    const headers = headerCells.map((cell) => (cell.textContent ?? '').trim());

    const rows = table
      ? Array.from(table.querySelectorAll<HTMLElement>('.ui-data-table__row')).map((row) => {
          const cells = Array.from(row.querySelectorAll<HTMLElement>('.ui-data-table__cell'));
          let inkPieces = 0;
          const measured = cells.map((cell, index) => {
            const ink = paintedInk(cell);
            inkPieces += ink.length;
            const outside = ink.reduce(
              (total, rect) => total + Math.max(0, rect.x + rect.width - cardBox.right) + Math.max(0, cardBox.left - rect.x),
              0,
            );
            const badge = cell.querySelector('.ui-badge');
            return {
              header: headers[index] ?? `#${index}`,
              text: (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
              box: box(cell),
              badge: badge ? box(badge) : null,
              outsideTheCard: outside,
              lines: cell.querySelectorAll(
                '.ui-table-two-line-cell__title, .ui-table-two-line-cell__subtitle, .ui-table-meta-cell, .ui-table-badge-list-cell',
              ).length,
            };
          });
          return {
            label: (row.querySelector('.ui-table-two-line-cell__title')?.textContent ?? row.textContent ?? '').trim().slice(0, 60),
            box: box(row),
            cells: measured,
            inkPieces,
          };
        })
      : [];

    const empty = cardElement.querySelector('.ui-empty-state');

    return {
      card: { x: cardBox.x, y: cardBox.y, width: cardBox.width, height: cardBox.height },
      table: table ? box(table) : { x: 0, y: 0, width: 0, height: 0 },
      tableClientWidth: table?.clientWidth ?? 0,
      tableScrollWidth: table?.scrollWidth ?? 0,
      scrollArea: scroll
        ? { height: scroll.clientHeight, scrollHeight: scroll.scrollHeight, maxHeight: getComputedStyle(scroll).maxHeight }
        : null,
      headers,
      headerBoxes: headerCells.map(box),
      rows,
      emptyState: empty
        ? {
            title: (empty.querySelector('.ui-empty-state__title')?.textContent ?? '').trim(),
            description: empty.querySelector('.ui-empty-state__description')?.textContent?.trim() ?? null,
            controls: empty.querySelectorAll('button, [role="button"], a').length,
            box: box(empty),
          }
        : null,
    };
  });
}

/** The content column the screen lays out in: the shell's own padding is not width a screen has. */
async function contentColumnWidth(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const region = document.querySelector('.ui-frame__content') as HTMLElement;
    const style = getComputedStyle(region);
    return region.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
  });
}

function cellOf(row: RowGeometry, header: RegExp): CellGeometry | undefined {
  return row.cells.find((cell) => header.test(cell.header));
}

/** The screen, at `viewport`, with the stubbed reading drawn. */
async function openScreen(page: Page, viewport: Viewport, reading: Reading = FULL_READING): Promise<void> {
  await page.setViewportSize(viewport);
  await stubReading(page, reading);
  await openApp(page, 'plugins');
  await expect(page.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible({ timeout: 20_000 });
  // Waited for on both halves: a list still being read is not a list with nothing to show, and only
  // the second of the two explains itself (REQ-48). Measuring the first would measure this runner's
  // timing.
  for (const [title, items] of [
    ['CLI plugins', reading.cli.items],
    ['Daemon plugins', reading.daemon.items],
  ] as const) {
    if (items.length > 0) {
      await expect(rows(page, title).first()).toBeVisible({ timeout: 20_000 });
    } else {
      await expect(panel(page, title).locator('.ui-empty-state__description')).toBeVisible({ timeout: 20_000 });
    }
  }
}

/** A real pointer at the visible control's own coordinates — never `element.click()`. */
async function clickAtItsOwnCentre(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test.describe('F10 — the plugins screen against an inventory holding every row state', () => {
  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}×${viewport.height}`;

    // REQ-47 — "The `enabled` pill is column-aligned. Its left edge is identical on every row —
    // measured — regardless of the length of that row's version string; a longer version such as
    // `v0.36.0-desktop.1` no longer pushes its row's pill out of line with its neighbours'."
    // plugins-screen.md — "every column keeps its left edge on every row — the availability badge
    // included, whatever the length of that row's version string".
    test(`every availability pill of the CLI list shares one left edge — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      const list = await measureList(page, 'CLI plugins');
      expect(list.rows.length, `${at}: the stubbed inventory did not reach the screen`).toBe(CLI_FIXTURE.length);

      // The premise: the rows really do carry version strings of markedly different lengths, or an
      // identical left edge below says nothing at all.
      const versionInk = list.rows.map((row) => round(cellOf(row, /VERSION/i)?.box.width ?? 0));
      const versionText = list.rows.map((row) => cellOf(row, /VERSION/i)?.text ?? '');
      expect(new Set(versionText).size, `${at}: every row states the same version, so this measurement proves nothing`).toBeGreaterThan(3);
      expect(
        versionText.some((text) => text.length >= 17),
        `${at}: no row carries a long version string, which is the case REQ-47 names`,
      ).toBe(true);

      const pills = list.rows.map((row) => ({ label: row.label, badge: cellOf(row, /AVAILABILITY/i)?.badge ?? null }));
      const missing = pills.filter((pill) => pill.badge === null).map((pill) => pill.label);
      expect(missing, `${at}: a row states no availability pill at all`).toEqual([]);

      const edges = pills.map((pill) => round(pill.badge!.x));
      const spread = Math.max(...edges) - Math.min(...edges);
      console.log(
        `[REQ-47] ${at}: ${edges.length} pill(s), left edges ${JSON.stringify([...new Set(edges)])}, spread ${round(spread)}px — ` +
          `version cells ${JSON.stringify([...new Set(versionInk)])}px wide, texts ${JSON.stringify([...new Set(versionText)]).slice(0, 200)}`,
      );

      expect(
        new Set(edges).size,
        `${at}: the availability pill is drawn at ${new Set(edges).size} distinct left edges down the column, spread ${round(spread)}px (REQ-47)`,
      ).toBe(1);

      // …and that one edge belongs to the column's own header cell, which is what makes it an
      // alignment rather than a coincidence of equal content.
      const header = list.headers.findIndex((label) => /AVAILABILITY/i.test(label));
      expect(header, `${at}: the list has no availability column`).toBeGreaterThanOrEqual(0);
      const headerBox = list.headerBoxes[header]!;
      console.log(`[REQ-47] ${at}: the AVAILABILITY header cell at ${describeBox(headerBox)}, the pills at x ${edges[0]}`);
      expect(edges[0], `${at}: the pill column starts left of the header naming it`).toBeGreaterThanOrEqual(round(headerBox.x) - 0.5);
      expect(
        edges[0],
        `${at}: the pill is drawn ${round(edges[0]! - headerBox.x)}px into a ${round(headerBox.width)}px column`,
      ).toBeLessThanOrEqual(round(headerBox.x + headerBox.width) + 0.5);

      // The daemon list states its state in the same way, and its badges hold one edge too.
      const daemon = await measureList(page, 'Daemon plugins');
      const daemonEdges = daemon.rows.map((row) => round(cellOf(row, /^STATE$/i)?.badge?.x ?? Number.NaN));
      console.log(`[REQ-47] ${at}: the daemon list's state badges at ${JSON.stringify([...new Set(daemonEdges)])}`);
      expect(daemonEdges.filter((edge) => Number.isNaN(edge)), `${at}: a daemon row states no state badge`).toEqual([]);
      expect(new Set(daemonEdges).size, `${at}: the daemon list's state badge takes more than one left edge`).toBe(1);
    });

    // REQ-46 — the object-list primitive, "hand-built cards deleted"; plugins-screen.md — "every row
    // is one line tall, whatever the plugin's state" and "a plugin without a description costs the
    // row no height". A row that has lost a line keeps every character it had; what it loses is its
    // height.
    test(`every row of each list is the same height as every other — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      expect(await content(page).locator('.ui-card-list').count(), `${at}: the screen still draws a hand-built card list`).toBe(0);
      // **The count is kept and the qualifier is gone.** This counted how many lists were drawn in
      // the retired card-per-row presentation and expected both of them to be; since
      // `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-18` the screen
      // draws the same two lists and **neither** is a card. So the two claims are asserted apart:
      // two lists, and none of them asking for a presentation.
      expect(await content(page).locator('.ui-data-table').count(), `${at}: the screen does not draw its two inventories`).toBe(2);
      expect(
        await content(page).locator('.ui-data-table--comfortable').count(),
        `${at}: an inventory is still drawn as a stack of cards`,
      ).toBe(0);

      for (const title of ['CLI plugins', 'Daemon plugins']) {
        const list = await measureList(page, title);
        for (const row of list.rows) {
          console.log(
            `[REQ-46] ${at} ${title} "${row.label}": row ${describeBox(row.box)} — ${row.cells
              .map((cell) => `${cell.header || '(cell)'}="${cell.text}" ${round(cell.box.width)}px`)
              .join(' | ')}`,
          );
        }
        const heights = list.rows.map((row) => round(row.box.height));
        console.log(`[REQ-46] ${at} ${title}: ${list.rows.length} row(s), heights ${JSON.stringify([...new Set(heights)])}`);
        expect(list.rows.length, `${at}: ${title} drew no row`).toBeGreaterThan(1);
        expect(
          new Set(heights).size,
          `${at}: the ${title} rows are ${JSON.stringify(heights)}px tall — a row's height still depends on the plugin's state`,
        ).toBe(1);

        // …and no cell is drawn at no width at all, which is the other way a value is lost.
        const starved = list.rows.flatMap((row) => row.cells.filter((cell) => cell.box.width <= 0).map((cell) => `${row.label} ${cell.header}`));
        expect(starved, `${at}: a cell of ${title} is in the DOM and nowhere on screen`).toEqual([]);
      }

      // The premise for the daemon list: it really does hold a described plugin and a bare one, so
      // equal heights are a repair and not an artefact of every row saying the same thing.
      const daemon = await measureList(page, 'Daemon plugins');
      const described = daemon.rows.find((row) => row.label.includes('vexel-e2e-geometry-plugin'))!;
      const bare = daemon.rows.find((row) => row.label.includes('loki'))!;
      expect(cellOf(described, /DESCRIPTION/i)!.text, `${at}: the described plugin states no description`).toContain('a stubbed reading');
      expect(cellOf(bare, /DESCRIPTION/i)!.text, `${at}: the bare plugin states a description it does not have`).toMatch(/^[-–—]?$/);

      // …and for the CLI list: a plugin the installation refuses to run, beside ones it runs.
      const cli = await measureList(page, 'CLI plugins');
      const refused = cli.rows.find((row) => row.label.includes('refused'))!;
      expect(cellOf(refused, /UNAVAILABLE$/i)!.text, `${at}: the refused plugin explains nothing`).toContain('permission denied');
      expect(cellOf(cli.rows[1]!, /UNAVAILABLE$/i)!.text, `${at}: a plugin the installation runs explains itself anyway`).toMatch(/^[-–—]$/);
    });

    // REQ-46, plugins-screen.md — "two object lists, one under the other, each at the full width of
    // the content column". The pair this deletes never collapsed: at 375×812 each list drew in
    // 157.5px and every version cell painted 35.2px past its own card.
    test(`the two lists are stacked at the content column’s full width, with nothing painted past a card — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      const column = await contentColumnWidth(page);
      const cli = await measureList(page, 'CLI plugins');
      const daemon = await measureList(page, 'Daemon plugins');
      console.log(
        `[REQ-46] ${at}: content column ${round(column)}px — CLI card ${describeBox(cli.card)}, daemon card ${describeBox(daemon.card)}; ` +
          `CLI table holds ${round(cli.tableScrollWidth)}px of row in ${round(cli.tableClientWidth)}px, daemon ${round(daemon.tableScrollWidth)}/${round(daemon.tableClientWidth)}`,
      );

      for (const [title, list] of [['CLI plugins', cli], ['Daemon plugins', daemon]] as const) {
        expect(
          round(list.card.width),
          `${at}: the ${title} card is ${round(list.card.width)}px of a ${round(column)}px content column`,
        ).toBeGreaterThanOrEqual(round(column) - 1);
      }
      expect(round(daemon.card.x), `${at}: the two cards are not on one left edge`).toBe(round(cli.card.x));
      expect(daemon.card.y, `${at}: the daemon list is not below the CLI list`).toBeGreaterThan(cli.card.y);

      // Nothing paints outside the card that holds it: below the desktop widths the list pans, and
      // a column that does not fit is panned to rather than spilled.
      const spilling = [...cli.rows, ...daemon.rows].flatMap((row) =>
        row.cells
          .filter((cell) => cell.outsideTheCard > 1)
          .map((cell) => `${row.label} ${cell.header}: ${round(cell.outsideTheCard)}px painted outside the card`),
      );
      const inkPieces = [...cli.rows, ...daemon.rows].reduce((total, row) => total + row.inkPieces, 0);
      console.log(`[REQ-46] ${at}: ${inkPieces} painted text(s) measured over ${cli.rows.length + daemon.rows.length} row(s), ${spilling.length} spilling`);
      expect(inkPieces, `${at}: no painted text was measured, so this comparison shows nothing`).toBeGreaterThan(0);
      expect(spilling, `${at}: a value is painted outside the card that holds it`).toEqual([]);

      if (viewport.width >= 1280) {
        expect(cli.tableScrollWidth, `${at}: the CLI list pans at a desktop width`).toBeLessThanOrEqual(cli.tableClientWidth + 1);
        expect(daemon.tableScrollWidth, `${at}: the daemon list pans at a desktop width`).toBeLessThanOrEqual(daemon.tableClientWidth + 1);
      } else {
        expect(daemon.tableScrollWidth, `${at}: the daemon list neither fits nor pans`).toBeGreaterThan(daemon.tableClientWidth);
      }
    });

    // plugins-screen.md — "'Inspect' → opens the plugin's full reading under its row, on the detail
    // panel, **at the list's full width**" — which the half-width pair could not give it: the panel
    // measured 442px of a 1120px content column at 1440×1000 and was drawn at x = −12.5, 89.5px
    // wide, at 375×812.
    test(`the inspection is drawn on the detail panel at the list’s own width — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      const inspect = rows(page, 'Daemon plugins').first().getByRole('button', { name: 'Inspect' });
      await clickAtItsOwnCentre(page, inspect);

      const detailPanel = panel(page, 'Daemon plugins').locator('.ui-detail-panel');
      await expect(detailPanel, `${at}: the inspection opened no detail panel`).toBeVisible({ timeout: 20_000 });

      const geometry = await panel(page, 'Daemon plugins').evaluate((cardElement) => {
        const table = cardElement.querySelector('.ui-data-table') as HTMLElement;
        const expansion = cardElement.querySelector('.ui-data-table__expanded') as HTMLElement;
        const detail = cardElement.querySelector('.ui-detail-panel') as HTMLElement;
        const rect = (element: Element) => {
          const box = element.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        };
        const values = Array.from(cardElement.querySelectorAll<HTMLElement>('.ui-definition-list__value')).map((value) => ({
          label: (value.parentElement?.querySelector('.ui-definition-list__label')?.textContent ?? '').trim(),
          box: rect(value),
        }));
        return {
          table: rect(table),
          tableClientWidth: table.clientWidth,
          expansion: rect(expansion),
          detail: rect(detail),
          values,
        };
      });
      console.log(
        `[REQ-46] ${at}: the inspection panel ${describeBox(geometry.detail)} inside an expansion ${describeBox(geometry.expansion)}, ` +
          `table visible box ${round(geometry.tableClientWidth)}px at x ${round(geometry.table.x)}`,
      );

      expect(geometry.expansion.x, `${at}: the expansion starts left of the table's own visible box`).toBeGreaterThanOrEqual(geometry.table.x - 0.5);
      expect(geometry.expansion.x, `${at}: the expansion is drawn off the left edge of the viewport`).toBeGreaterThanOrEqual(-0.5);
      expect(
        round(geometry.expansion.width),
        `${at}: the expansion is wider than the box the table is read in`,
      ).toBeLessThanOrEqual(round(geometry.tableClientWidth) + 0.5);
      // The panel takes the width it is given rather than a fraction of the screen: the pair this
      // migration deletes left it at half the content column.
      expect(
        round(geometry.detail.width),
        `${at}: the panel is ${round(geometry.detail.width)}px inside a ${round(geometry.tableClientWidth)}px list`,
      ).toBeGreaterThanOrEqual(round(geometry.tableClientWidth) * 0.75);

      // No property value is drawn at no width at all — the 0px-wide, 313px-tall cell the pair
      // produced at the phone breakpoint.
      const starved = geometry.values.filter((value) => value.box.width <= 1).map((value) => `${value.label} ${describeBox(value.box)}`);
      console.log(`[REQ-46] ${at}: ${geometry.values.length} property value(s), ${starved.length} drawn at no width`);
      expect(geometry.values.length, `${at}: the panel states no property at all`).toBeGreaterThan(3);
      expect(starved, `${at}: a property value is in the DOM and nowhere on screen`).toEqual([]);
    });
  }

  // plugins-screen.md — "the CLI list scrolls within the screen once it is taller than 60% of the
  // viewport", which is what keeps the list carrying every action on this screen from being pushed
  // down by the read-only inventory above it.
  test('the CLI list scrolls within the screen rather than growing past 60% of the viewport', async ({ page }) => {
    test.setTimeout(120_000);
    const viewport = VIEWPORTS[0];
    await openScreen(page, viewport);

    const list = await measureList(page, 'CLI plugins');
    expect(list.scrollArea, 'the CLI list has no scrolling region at all').not.toBeNull();
    console.log(
      `[REQ-46] ${viewport.width}×${viewport.height}: the CLI list holds ${round(list.scrollArea!.scrollHeight)}px of rows in ` +
        `${round(list.scrollArea!.height)}px (max-height ${list.scrollArea!.maxHeight}), of a ${viewport.height}px viewport`,
    );

    // The premise: fifteen rows really are taller than the cap, or a capped height says nothing.
    expect(list.scrollArea!.scrollHeight, 'the CLI rows fit inside the cap, so nothing here shows the cap works').toBeGreaterThan(
      list.scrollArea!.height + 1,
    );
    expect(
      list.scrollArea!.height,
      `the CLI list is ${round(list.scrollArea!.height)}px of a ${viewport.height}px viewport`,
    ).toBeLessThanOrEqual(viewport.height * 0.6 + 1);

    // …and the daemon list, the one carrying every action, is as tall as its rows rather than
    // scrolling: it is not capped (plugins-screen.md).
    const daemon = await measureList(page, 'Daemon plugins');
    expect(daemon.scrollArea?.maxHeight ?? 'none', 'the daemon list caps its own height').toBe('none');
  });

  // detail-panel.md — "at most one detail panel is open anywhere in the interface"; and in the
  // `opening-gesture` presentation "the panel presents **no** close control … `Escape` calls
  // `onClose` instead" (plugins-screen.md: "Pressing 'Hide' closes it, and so does `Escape`; the
  // panel offers no close control of its own").
  test('one inspection is open at a time, closed by Hide and by Escape, with no close control of its own', async ({ page }) => {
    test.setTimeout(120_000);
    await openScreen(page, VIEWPORTS[0]);

    const first = rows(page, 'Daemon plugins').first();
    const second = rows(page, 'Daemon plugins').nth(1);

    await clickAtItsOwnCentre(page, first.getByRole('button', { name: 'Inspect' }));
    await expect(page.locator('.ui-detail-panel')).toHaveCount(1);
    await expect(page.locator('.ui-detail-panel')).toContainText(DAEMON_FIXTURE[0].name);
    await expect(page.locator('.ui-detail-panel').getByRole('button', { name: 'Close detail' }), 'the panel presents a close control of its own').toHaveCount(0);

    await clickAtItsOwnCentre(page, second.getByRole('button', { name: 'Inspect' }));
    await expect(page.locator('.ui-detail-panel'), 'a second inspection was opened beside the first').toHaveCount(1);
    await expect(page.locator('.ui-detail-panel')).toContainText(DAEMON_FIXTURE[1].name);

    // The row's own control closes it…
    await clickAtItsOwnCentre(page, second.getByRole('button', { name: 'Hide' }));
    await expect(page.locator('.ui-detail-panel')).toHaveCount(0);

    // …and so does Escape, from the panel that is open.
    await clickAtItsOwnCentre(page, first.getByRole('button', { name: 'Inspect' }));
    await expect(page.locator('.ui-detail-panel')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ui-detail-panel'), 'Escape left the inspection open').toHaveCount(0);
  });
});

test.describe('F10 — an empty inventory (REQ-48)', () => {
  // REQ-48 — "`No daemon plugins` becomes a real empty state — the primitive, on a surface, with a
  // title, one line of explanation and, where one exists, the action that resolves it — instead of
  // bare text floating in the layout."
  test('an empty daemon inventory is stated on a surface, with a title, one line and the action that resolves it', async ({ page }) => {
    test.setTimeout(120_000);
    await openScreen(page, VIEWPORTS[0], { cli: { items: CLI_FIXTURE }, daemon: { items: [] } });

    const daemon = await measureList(page, 'Daemon plugins');
    expect(daemon.emptyState, 'the empty daemon inventory is not stated on the empty-state primitive').not.toBeNull();
    console.log(
      `[REQ-48] the daemon empty state ${describeBox(daemon.emptyState!.box)}: "${daemon.emptyState!.title}" — ` +
        `"${daemon.emptyState!.description}", ${daemon.emptyState!.controls} control(s)`,
    );

    // A surface of the library's own, with a box of its own — not bare text in the layout.
    const surface = panel(page, 'Daemon plugins').locator('.ui-empty-state');
    await expect(surface).toBeVisible();
    expect(daemon.emptyState!.box.width, 'the empty state has no box at all').toBeGreaterThan(0);
    expect(daemon.emptyState!.title, 'the empty state states no title').not.toBe('');
    expect(daemon.emptyState!.description, 'the empty state states no reason').not.toBeNull();
    expect(daemon.emptyState!.description!.length, 'the empty state explains nothing').toBeGreaterThan(20);
    expect(daemon.emptyState!.controls, 'the empty state offers no action to resolve it').toBe(1);

    // The action really is the install, driven with a real pointer at its own coordinates.
    await clickAtItsOwnCentre(page, surface.getByRole('button'));
    await expect(page.getByRole('heading', { name: 'Install daemon plugin' }), 'the empty state’s action opened no install').toBeVisible({
      timeout: 20_000,
    });
  });

  // batch 10 — "The stated reason is content, and it must survive the change of container"; and the
  // action is withheld where the reason is that the daemon exposes no managed plugin at all, which
  // installing one would not resolve (plugins-screen.md).
  test('a stated reason survives the change of container, and the action that would not resolve it is withheld', async ({ page }) => {
    test.setTimeout(120_000);
    const cliReason = 'This Docker installation exposes no CLI plugin inventory.';
    const daemonReason = 'This daemon does not expose managed plugins.';
    await openScreen(page, VIEWPORTS[0], {
      cli: { items: [], unavailableReason: cliReason },
      daemon: { items: [], unavailableReason: daemonReason },
    });

    const cli = await measureList(page, 'CLI plugins');
    const daemon = await measureList(page, 'Daemon plugins');
    console.log(`[REQ-48] CLI: "${cli.emptyState?.title}" — "${cli.emptyState?.description}", ${cli.emptyState?.controls} control(s)`);
    console.log(`[REQ-48] daemon: "${daemon.emptyState?.title}" — "${daemon.emptyState?.description}", ${daemon.emptyState?.controls} control(s)`);

    expect(cli.emptyState?.description, 'the installation’s own reason did not survive the change of container').toBe(cliReason);
    expect(daemon.emptyState?.description, 'the daemon’s own reason did not survive the change of container').toBe(daemonReason);
    expect(daemon.emptyState?.controls, 'an action is offered for a reason installing a plugin would not resolve').toBe(0);
    expect(cli.emptyState?.controls, 'the read-only CLI inventory offers an action on its empty state').toBe(0);

    // The screen's own install is still where it belongs — in the toolbar, not on the empty state.
    await expect(panel(page, 'Daemon plugins').locator('.ui-screen-toolbar').getByRole('button', { name: 'Install plugin' })).toBeVisible();
  });
});
