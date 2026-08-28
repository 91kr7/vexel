/**
 * F9 — the contexts screen, measured
 * (`plan-ui-coherence-optimisation/REQ-42`, `REQ-43`, `REQ-44`, `REQ-45`, and
 * REQ-21's contexts half; `contexts/specs/contexts-screen.md`).
 *
 * Every claim here is about **boxes and paint**. A row that has lost a line, an
 * endpoint that has stopped running under the marker beside it, a panel that has
 * appeared under the row — none of them change what the screen says; what they
 * change is where its rectangles are (CLAUDE.md, "What a check drives, and what
 * it measures"). So the assertions are on viewport boxes, on painted ink
 * intersected against the cells beside it, and on the paint that tells a control
 * from a statement.
 *
 * **The defect REQ-43 repairs is finer than "bare text acting as a control".**
 * The delivered `use` was already a real button; what it was not was
 * *distinguishable*: it and the `active` marker were both badges, in the same
 * box, at the same radius and the same type scale, separated only by a fill that
 * appears on hover. So what is checked here is neither "is it clickable" nor "is
 * it a `<button>`" — both were already true — but **weight and appearance**: the
 * switch paints as the screen's own primary control does, the marker paints as
 * neither, and the two differ with no pointer anywhere near them.
 *
 * The fixtures are two contexts of this file's own, one carrying a description
 * and one carrying none, so equal row heights are a repair rather than an
 * artefact of every row saying the same thing. A context is host-level
 * configuration and carries no label, so its name prefix is the only handle
 * there is; each is removed in an `afterAll`, and **nothing here switches the
 * active context** — that is exercised, once, in `contexts.spec.ts`, against a
 * fixture pointing at the daemon that is already active.
 *
 * Every control driven here is driven with a **real pointer at the visible
 * control's own coordinates**, and a row is clicked on its **first cell**: below
 * the desktop breakpoint a row is wider than the box it is read in, so its own
 * centre can sit over the action cluster.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { boxOf, clickAtItsCentre, readOnceSettled } from './support/settled.js';
import { refreshThroughTheControl } from './support/refresh-control.js';
// The shared classic-table instrument, extended by each batch rather than copied: what replaced the
// retired presentation's class name here is a measurement, and it is the same measurement every
// other converted list is judged by (`e2e/support/classic-table.ts`).
import { expectFlushRuledRows, settledList } from './support/classic-table.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

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

const RUN_ID = `${process.pid}-${Date.now()}`;

/** The eight properties REQ-45 takes off this screen, by the labels the delivered block used. */
const DAEMON_PROPERTIES = [
  'Docker version',
  'Engine API',
  'BuildKit',
  'Storage driver',
  'Cgroup driver',
  'OS / Arch',
  'Root directory',
  'Containers (running)',
];

interface Fixture {
  name: string;
  endpoint: string;
  description?: string;
}

/**
 * Two contexts, differing in the one value whose presence used to decide a row's
 * height — the description — and both carrying an endpoint no row can hold, which
 * is what REQ-21 is the route out of.
 */
const FIXTURES: Fixture[] = [
  {
    name: `vexel-e2e-ctxgeo-described-${RUN_ID}`,
    endpoint: `ssh://operator@build-host-${'x'.repeat(40)}.example.invalid`,
    description: 'an e2e fixture carrying a description',
  },
  {
    name: `vexel-e2e-ctxgeo-bare-${RUN_ID}`,
    endpoint: `ssh://operator@another-build-host-${'y'.repeat(30)}.example.invalid`,
  },
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
  /** The row's first line — the context's name. */
  label: string;
  text: string;
  box: Box;
  cells: CellGeometry[];
  /** One entry per pair of cells whose painted ink and box intersect. */
  collisions: string[];
  /** Every painted piece of text in the row, so a sweep can count what it compared. */
  inkPieces: number;
}

interface ListGeometry {
  card: Box;
  list: Box;
  listClientWidth: number;
  listScrollWidth: number;
  headers: string[];
  rows: RowGeometry[];
  /** How many property bands the screen draws outside a row's own detail panel. */
  bandsOutsideDetail: number;
  /** Every property label on screen, so REQ-45's count is a measurement rather than a hope. */
  propertyLabels: string[];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function describeBox(box: Box): string {
  return `x=${round(box.x)}, y=${round(box.y)}, ${round(box.width)}×${round(box.height)}`;
}

/**
 * The region this screen's one list is read in, named by the section header
 * titling it.
 *
 * Named by **what it holds** rather than by the surface it used to be: the
 * section header and the toolbar sit **above** the one unpadded card holding the
 * list (`contexts-screen.md`, and
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`),
 * so a card can no longer be found by the heading it used to hold. A panel is
 * the innermost region carrying both the heading and the list; every region
 * matching contains the same heading and is therefore an ancestor of the next,
 * so the last in document order is the panel's own — and on a screen still drawn
 * the old way that is its card.
 */
function panel(page: Page): Locator {
  return page
    .locator('.ui-frame__content')
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Docker contexts' }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

function rowOf(page: Page, name: string): Locator {
  return panel(page).locator('.ui-data-table__row', { hasText: name }).first();
}

/**
 * The cell of a row that names the context — the one a row is selected on.
 *
 * Not the row's own centre, which below the desktop breakpoint can sit over
 * another column, and not its leading cell either: that is the marker column,
 * empty on every context but the one in use.
 */
function nameCell(page: Page, name: string): Locator {
  return rowOf(page, name).locator('.ui-data-table__cell', { has: page.locator('.ui-table-two-line-cell') }).first();
}

/**
 * Every row of the list, cell by cell, in one pass — so no two figures come from
 * two layouts — with each cell's **painted** ink intersected against the boxes of
 * the cells beside it.
 *
 * The clipping is the whole instrument: an ellipsised line is still laid out at
 * its full length and only painted clipped, so raw text rectangles would report a
 * collision nobody can see.
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
async function measureList(page: Page): Promise<ListGeometry> {
  return await readOnceSettled(
    page,
    () => measureListThisFrame(page),
    (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
  );
}

/** **One frame, and no test calls it**: the sampler above is built out of it. */
async function measureListThisFrame(page: Page): Promise<ListGeometry> {
  return await panel(page).evaluate((card) => {
    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };

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
          lines: cell.querySelectorAll(
            '.ui-table-two-line-cell__title, .ui-table-two-line-cell__subtitle, .ui-table-meta-cell, .ui-table-badge-list-cell, .ui-status-pill',
          ).length,
        };
      });

      const collisions: string[] = [];
      let inkPieces = 0;
      cellElements.forEach((cell, index) => {
        const ink = inkOf(cell);
        inkPieces += ink.length;
        cellElements.forEach((other, otherIndex) => {
          if (index === otherIndex) return;
          const otherBox = box(other);
          if (ink.some((piece) => intersects(piece, otherBox))) {
            collisions.push(`${headers[index] ?? index} inks over ${headers[otherIndex] ?? otherIndex}`);
          }
        });
      });

      const label = (row.querySelector('.ui-table-two-line-cell__title')?.textContent ?? row.textContent ?? '').trim();
      return { label, text: (row.textContent ?? '').replace(/\s+/g, ' ').trim(), box: box(row), cells, collisions, inkPieces };
    });

    const content = document.querySelector('.ui-frame__content')!;
    const propertyLabels = Array.from(content.querySelectorAll('.ui-definition-list__label')).map((label) => (label.textContent ?? '').trim());
    const bandsOutsideDetail = Array.from(content.querySelectorAll('.ui-definition-list__label')).filter(
      (label) => label.closest('.ui-detail-panel') === null,
    ).length;

    return {
      card: box(surface),
      list: box(list),
      listClientWidth: list.clientWidth,
      listScrollWidth: list.scrollWidth,
      headers,
      rows,
      bandsOutsideDetail,
      propertyLabels,
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

function rowFor(list: ListGeometry, name: string): RowGeometry | undefined {
  return list.rows.find((row) => row.cells.some((cell) => cell.text.includes(name)));
}

function cellOf(row: RowGeometry, header: RegExp): CellGeometry | undefined {
  return row.cells.find((cell) => header.test(cell.header));
}

/** The screen, at `viewport`, with both fixture contexts drawn. */
async function openScreen(page: Page, viewport: Viewport): Promise<void> {
  await page.setViewportSize(viewport);
  await openApp(page, 'contexts');
  await expect(page.getByRole('heading', { level: 1, name: 'Contexts' })).toBeVisible({ timeout: 20_000 });
  // Docker publishes no context event, so the press is what puts the two fixtures on
  // screen (plan-docker_management_app-refresh_cache/REQ-30). Waiting instead would pass
  // only while nothing had read the context list yet, and cost a whole period once
  // something had.
  await refreshThroughTheControl(page);
  for (const fixture of FIXTURES) {
    await expect(rowOf(page, fixture.name), `the fixture context ${fixture.name} is not listed`).toBeVisible({ timeout: 20_000 });
  }
}

/** What the daemon records as a context's endpoint — the value the panel must hold in full. */
async function endpointOf(name: string): Promise<string> {
  const { stdout } = await execFileAsync('docker', ['context', 'inspect', name, '--format', '{{.Endpoints.docker.Host}}']);
  return stdout.trim();
}

async function removeContextQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['context', 'rm', '-f', name]).catch(() => undefined);
}

test.beforeAll(async () => {
  for (const fixture of FIXTURES) {
    await removeContextQuietly(fixture.name);
    await execFileAsync('docker', [
      'context',
      'create',
      fixture.name,
      '--docker',
      `host=${fixture.endpoint}`,
      ...(fixture.description ? ['--description', fixture.description] : []),
    ]);
  }
});

/**
 * Removes every context this file left behind, whatever the run: a context
 * carries no label, so the name prefix is the only handle there is, and a spec
 * killed by its own timeout never reaches a `finally`. The suite runs
 * single-worker, so nothing else can own a name under this prefix.
 */
test.afterAll(async () => {
  const { stdout } = await execFileAsync('docker', ['context', 'ls', '--format', '{{.Name}}']).catch(() => ({ stdout: '' }));
  for (const leftover of stdout.split('\n').filter((name) => name.startsWith('vexel-e2e-ctxgeo-'))) {
    await removeContextQuietly(leftover);
  }
});

test.describe('F9 — the contexts screen against an inventory holding described and bare contexts', () => {
  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}×${viewport.height}`;

    // REQ-42 — the list is the object-list primitive and the cards-with-inline-trailing-buttons
    // paradigm is deleted; contexts-screen.md — "Every cell of a row is the same number of lines
    // whatever the context's state … each is a column, where an absence costs the row no height".
    // A row that has lost a line keeps every character it had; what it loses is its height.
    test(`every context row is the same height as every other at ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      const list = await measureList(page);

      // The paradigm this migration deletes is not merely unused: it is not drawn.
      expect(await panel(page).locator('.ui-card-list').count(), `${at}: the screen still draws a hand-built card list`).toBe(0);
      // **The count is kept and the qualifier is gone.** This counted the one list drawn in the
      // retired card-per-row presentation and expected it to be; since
      // `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-17` the screen
      // draws the same one list and it is **not** a card.
      expect(await panel(page).locator('.ui-data-table').count(), `${at}: the screen does not draw its one list`).toBe(1);
      // The `--comfortable` count that stood beside it until 2026-08-16 went **with the class**
      // (that plan's `REQ-22`, `REQ-28`, batch 5): the library emits it from nowhere, so the count
      // was zero whatever the screen drew. What it claimed — the list is not a stack of cards — is
      // measured here as boxes rather than as a class name: no row carries a corner, an outline, a
      // shadow or a surface of its own, and two rows are separated by one hairline.
      const asBoxes = await settledList(page, 'ENDPOINT');
      // …and its own premise: one row is flush with nothing, so a junction assertion over a
      // one-row list asserts nothing at all.
      expect(asBoxes.rows.length, `${at}: fewer than two context rows, so there is no junction to measure`).toBeGreaterThan(1);
      expectFlushRuledRows(at, 'the contexts list', asBoxes);

      // The premise: the inventory really does hold rows in different states, so equal heights are
      // a repair and not an artefact of every row saying the same thing.
      const described = rowFor(list, FIXTURES[0].name)!;
      const bare = rowFor(list, FIXTURES[1].name)!;
      expect(cellOf(described, /^DESCRIPTION$/i)!.text, `${at}: the described fixture states no description`).toContain('an e2e fixture');
      expect(cellOf(bare, /^DESCRIPTION$/i)!.text, `${at}: the bare fixture states a description it does not have`).toMatch(/^[-–—]?$/);

      for (const row of list.rows) {
        console.log(
          `[REQ-42] ${at} "${row.label}": row ${describeBox(row.box)} — ${row.cells
            .map((cell) => `${cell.header || '(marker)'}="${cell.text}" ${round(cell.box.width)}px${cell.clipped > 1 ? `, ${round(cell.clipped)}px clipped` : ''}`)
            .join(' | ')}`,
        );
      }

      const heights = list.rows.map((row) => round(row.box.height));
      console.log(`[REQ-42] ${at}: ${list.rows.length} row(s), heights ${JSON.stringify(heights)}, list ${round(list.list.width)}px, card ${round(list.card.width)}px`);
      expect(list.rows.length, `${at}: fewer rows than the two fixtures this file created`).toBeGreaterThanOrEqual(2);
      expect(
        new Set(heights).size,
        `${at}: the rows are ${JSON.stringify(heights)}px tall — a row's height still depends on the context's state`,
      ).toBe(1);

      // …and no cell is drawn at no width at all, which is the other way a value is lost.
      const starved = list.rows.flatMap((row) => row.cells.filter((cell) => cell.box.width <= 0).map((cell) => `${row.label} ${cell.header}`));
      expect(starved, `${at}: a cell is in the DOM and nowhere on screen`).toEqual([]);
    });

    // REQ-44 — "The endpoint no longer collides with the `active` pill (REQ-18 observed here), at
    // all three viewports". Measured as painted ink against the boxes beside it, on every row and
    // every column, the marker column included.
    test(`no cell of a context row paints over the cell beside it at ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      const list = await measureList(page);
      const texts = list.rows.reduce((total, row) => total + row.inkPieces, 0);
      const collisions = list.rows.flatMap((row) => row.collisions.map((collision) => `${row.label}: ${collision}`));
      console.log(`[REQ-44] ${at}: ${collisions.length} colliding cell pair(s) over ${texts} painted text(s) on ${list.rows.length} row(s)`);
      for (const collision of collisions) console.log(`[REQ-44] ${at} collision: ${collision}`);

      // The premise: there is ink to compare, and the marker really is on screen — the endpoint it
      // used to run under belongs to the context Docker itself has selected.
      expect(texts, `${at}: no painted text was measured, so this comparison shows nothing`).toBeGreaterThan(0);
      const markerRow = list.rows.find((row) => row.cells.some((cell) => cell.text === 'active'));
      expect(markerRow, `${at}: no row carries the active marker, so the collision REQ-44 names cannot occur here`).toBeDefined();

      expect(collisions, `${at}: a cell's painted text lands on the cell beside it (REQ-44)`).toEqual([]);

      // And the specific pair the requirement names, stated as boxes: the endpoint's own cell and
      // the marker's never overlap on the active row.
      const endpoint = cellOf(markerRow!, /^ENDPOINT$/i)!;
      const marker = markerRow!.cells[0]!;
      console.log(`[REQ-44] ${at} active row: marker ${describeBox(marker.box)}, endpoint ${describeBox(endpoint.box)}`);
      const overlap = Math.min(marker.box.x + marker.box.width, endpoint.box.x + endpoint.box.width) - Math.max(marker.box.x, endpoint.box.x);
      expect(round(overlap), `${at}: the endpoint's column and the marker's column overlap by ${round(overlap)}px`).toBeLessThanOrEqual(0.5);
    });

    // data-table.md — given the width its columns' minimums need the table divides it as the tracks
    // say; given less it pans rather than starving a column, and the pan brings the last column into
    // view. The card itself is the content column's full width, the `Grid` that halved it having gone
    // with the daemon card (contexts-screen.md, "one child is not a pair").
    test(`the list is read at the content column’s width, panning only where the columns exceed it — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      const list = await measureList(page);
      const column = await contentColumnWidth(page);
      console.log(
        `[REQ-42] ${at}: content column ${round(column)}px — card ${describeBox(list.card)}, list ${round(list.list.width)}px, ` +
          `holding ${round(list.listScrollWidth)}px of row in ${round(list.listClientWidth)}px`,
      );

      expect(
        round(list.card.width),
        `${at}: the card is ${round(list.card.width)}px of a ${round(column)}px content column`,
      ).toBeGreaterThanOrEqual(round(column) - 1);

      if (viewport.width >= 1280) {
        expect(
          list.listScrollWidth,
          `${at}: the list pans at a desktop width, so a column does not fit the card it was given`,
        ).toBeLessThanOrEqual(list.listClientWidth + 1);
      } else {
        expect(list.listScrollWidth, `${at}: the list neither fits nor pans`).toBeGreaterThan(list.listClientWidth);

        // The pan brings the last column into view, and the action it holds still answers a hit
        // test at its own centre once it is there.
        const panned = await panel(page).evaluate((card) => {
          const table = card.querySelector('.ui-data-table') as HTMLElement;
          table.scrollLeft = table.scrollWidth;
          const tableBox = table.getBoundingClientRect();
          const cells = Array.from(table.querySelectorAll('.ui-data-table__row')[0]?.querySelectorAll('.ui-data-table__cell') ?? []);
          const last = cells[cells.length - 1]!.getBoundingClientRect();
          return { scrollLeft: table.scrollLeft, lastInside: last.left >= tableBox.left - 1 && last.right <= tableBox.right + 1, lastX: last.x };
        });
        console.log(`[REQ-42] ${at}: pan reaches scrollLeft ${round(panned.scrollLeft)}, the actions column at x ${round(panned.lastX)}, inside: ${panned.lastInside}`);
        expect(panned.scrollLeft, `${at}: the list refuses to pan`).toBeGreaterThan(0);
        expect(panned.lastInside, `${at}: the pan does not bring the actions column into view`).toBe(true);

        const useAction = rowOf(page, FIXTURES[0].name).getByRole('button', { name: 'Use', exact: true });
        await expect(useAction, `${at}: the panned row offers no Use action`).toBeVisible();
        const box = await boxOf(useAction, `${at}: the panned row's Use action`);
        const hit = await page.evaluate(
          ({ x, y }) => {
            const element = document.elementFromPoint(x, y);
            return { tag: element?.tagName.toLowerCase() ?? null, label: (element?.closest('button')?.textContent ?? '').trim() };
          },
          { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        );
        console.log(`[REQ-43] ${at}: Use at ${describeBox({ ...box })} — the point at its centre resolves to <${hit.tag}> "${hit.label}"`);
        expect(hit.label, `${at}: after the pan, the point at the Use control's own centre belongs to something else`).toBe('Use');
      }
    });

    // REQ-45 — "The second full eight-property daemon block does not survive on Contexts";
    // contexts-screen.md — the summary of two or three of them that the requirement permits was
    // declined, so the count is nought and not "fewer".
    test(`no daemon property is stated on this screen at ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      const before = await measureList(page);
      const cards = await page.locator('.ui-frame__content .ui-section-header__title').allInnerTexts();
      const statedNow = () =>
        page.evaluate(
          (labels) => {
            const text = (document.querySelector('.ui-frame__content')?.textContent ?? '').replace(/\s+/g, ' ');
            return labels.filter((label) => text.includes(label));
          },
          DAEMON_PROPERTIES,
        );

      console.log(
        `[REQ-45] ${at} before any selection: card(s) ${JSON.stringify(cards)}, ${before.bandsOutsideDetail} property band(s) outside a detail panel, ` +
          `labels ${JSON.stringify(before.propertyLabels)}`,
      );
      expect(await statedNow(), `${at}: the screen still states daemon properties of the active context`).toEqual([]);
      expect(before.bandsOutsideDetail, `${at}: a property block is drawn beside the list`).toBe(0);
      expect(cards, `${at}: a second card is drawn beside the list`).toEqual(['Docker contexts']);

      // …and none of them arrives with a row's detail either. The row is selected on its own first
      // cell, with a real pointer.
      await clickAtItsCentre(page, nameCell(page, FIXTURES[0].name), `${at}: the context row's own first cell`);
      await expect(panel(page).locator('.ui-detail-panel'), `${at}: selecting a context opened no detail panel`).toBeVisible({ timeout: 20_000 });

      const after = await measureList(page);
      console.log(`[REQ-45] ${at} with a context selected: labels ${JSON.stringify(after.propertyLabels)}`);
      expect(await statedNow(), `${at}: the row's detail states daemon properties of the active context`).toEqual([]);
      expect(after.bandsOutsideDetail, `${at}: a property block is drawn outside the row's own detail`).toBe(0);
    });
  }

  // REQ-43 — "`use` is a control that looks like one": the switch weighs `primary` in the row's
  // cluster and the marker is a statement in a column of its own (contexts-screen.md). The delivered
  // pair were the same badge at the same radius and type scale, told apart only by a hover fill —
  // so what is asserted is the **paint at rest**, against the screen's own primary control as the
  // known-good case.
  test('the switch paints as a primary control and the active marker paints as no control at all', async ({ page }) => {
    test.setTimeout(120_000);
    await openScreen(page, VIEWPORTS[0]);

    const idle = FIXTURES[0].name;
    const useAction = rowOf(page, idle).getByRole('button', { name: 'Use', exact: true });
    await expect(useAction, 'a context not in use is offered no switch').toBeVisible();

    // The cluster is a cell of the row, and every control the row carries is in it.
    const cluster = rowOf(page, idle).locator('.ui-action-button-group');
    await expect(cluster, 'the row draws no action cluster').toHaveCount(1);
    expect(await rowOf(page, idle).locator('button').count(), 'a control of the row sits outside its action cluster').toBe(
      await cluster.locator('button').count(),
    );
    expect(await rowOf(page, idle).locator('.ui-data-table__cell', { has: page.locator('.ui-action-button-group') }).count(), 'the cluster is not a cell of the row').toBe(1);

    // The known-good case: the screen's own primary action, in the toolbar under the header.
    const toolbarPrimary = panel(page).locator('.ui-screen-toolbar').getByRole('button', { name: 'Create context' });
    await expect(toolbarPrimary, 'the screen states no primary action to compare the switch against').toBeVisible();

    const paintOf = (locator: Locator) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role'),
          background: style.backgroundColor,
          backgroundImage: style.backgroundImage,
          color: style.color,
          borderRadius: style.borderRadius,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          cursor: style.cursor,
          box: { x: box.x, y: box.y, width: box.width, height: box.height },
        };
      });

    const marker = panel(page).locator('.ui-data-table__row .ui-status-pill', { hasText: 'active' }).first();
    await expect(marker, 'no row carries the active marker').toBeVisible();

    const [switchPaint, primaryPaint, markerPaint] = await Promise.all([paintOf(useAction), paintOf(toolbarPrimary), paintOf(marker)]);
    console.log(`[REQ-43] the switch: <${switchPaint.tag}> ${JSON.stringify(switchPaint)}`);
    console.log(`[REQ-43] the screen's primary action: <${primaryPaint.tag}> ${JSON.stringify(primaryPaint)}`);
    console.log(`[REQ-43] the active marker: <${markerPaint.tag}> ${JSON.stringify(markerPaint)}`);

    // The switch is painted like the screen's own primary control, at rest and with no pointer
    // anywhere near it.
    expect(switchPaint.tag, 'the switch is not a control').toBe('button');
    expect(
      `${switchPaint.background} ${switchPaint.backgroundImage} ${switchPaint.color}`,
      'the switch does not carry the fill the screen paints a primary action with',
    ).toBe(`${primaryPaint.background} ${primaryPaint.backgroundImage} ${primaryPaint.color}`);

    // …and the marker is not a control: not a button, not focusable, and not painted like one.
    expect(markerPaint.tag, 'the active marker is a button').not.toBe('button');
    expect(markerPaint.role, 'the active marker claims a control’s role').not.toBe('button');
    expect(await marker.locator('button').count(), 'the active marker holds a control').toBe(0);
    expect(await marker.evaluate((element) => element.closest('button, [role="button"], a') !== null), 'the active marker is inside a control').toBe(false);
    expect(
      `${markerPaint.background} ${markerPaint.backgroundImage} ${markerPaint.color}`,
      'the marker and the primary control are painted identically, which is the defect REQ-43 names',
    ).not.toBe(`${primaryPaint.background} ${primaryPaint.backgroundImage} ${primaryPaint.color}`);
    expect(
      `${markerPaint.background} ${markerPaint.backgroundImage} ${markerPaint.color} ${markerPaint.borderRadius} ${markerPaint.fontSize}`,
      'the switch and the marker are drawn identically, which is what a hover fill alone was hiding',
    ).not.toBe(`${switchPaint.background} ${switchPaint.backgroundImage} ${switchPaint.color} ${switchPaint.borderRadius} ${switchPaint.fontSize}`);

    // The two are also in different columns: a statement is not offered where an action is taken.
    const markerColumn = await marker.evaluate((element) => Array.from(element.closest('.ui-data-table__row')!.querySelectorAll('.ui-data-table__cell')).indexOf(element.closest('.ui-data-table__cell')!));
    const actionColumn = await cluster.evaluate((element) => Array.from(element.closest('.ui-data-table__row')!.querySelectorAll('.ui-data-table__cell')).indexOf(element.closest('.ui-data-table__cell')!));
    console.log(`[REQ-43] the marker sits in column ${markerColumn}, the action cluster in column ${actionColumn}`);
    expect(markerColumn, 'the marker and the switch share one column').not.toBe(actionColumn);

    // …and the switch answers a hit test at its own visible centre, which a cleared overlap does
    // not prove on its own.
    const box = await boxOf(useAction, 'the row’s Use switch');
    const hit = await page.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return { tag: element?.tagName.toLowerCase() ?? null, label: (element?.closest('button')?.textContent ?? '').trim() };
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(hit.label, 'the point at the switch’s own centre belongs to something else').toBe('Use');

    // The context Docker itself has selected is offered no switch to itself.
    const activeRow = panel(page).locator('.ui-data-table__row', { has: page.locator('.ui-status-pill', { hasText: 'active' }) }).first();
    await expect(activeRow.getByRole('button', { name: 'Use', exact: true }), 'the active context is offered a switch to itself').toHaveCount(0);
    await expect(activeRow.getByRole('button', { name: 'Remove' }), 'the active context has lost its removal action').toHaveCount(1);
  });

  // REQ-21 (the contexts half) — "A truncated value is still obtainable in full … that object's
  // detail panel displays the same value in full, wrapped, as selectable text". Batch 4 could not
  // close this here: the screen had no detail surface at all, so 43.8px of a 388.9px endpoint were
  // painted and the rest was obtainable nowhere. A `title` tooltip does not satisfy it, which is why
  // what is measured is the **panel's own band**: its text, its ink, and what it loses to its box.
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    const at = `${viewport.width}×${viewport.height}`;

    test(`the endpoint a row truncates is readable in full on the context’s detail panel — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport);

      const fixture = FIXTURES[0];
      const endpoint = await endpointOf(fixture.name);
      expect(endpoint, 'the daemon reported no endpoint for the fixture context').toBe(fixture.endpoint);

      // The premise: the row really does cut this value, so the panel is the route out of something
      // rather than a second copy of a value already wholly on screen.
      const list = await measureList(page);
      const rowCell = cellOf(rowFor(list, fixture.name)!, /^ENDPOINT$/i)!;
      console.log(`[REQ-21] ${at} the row's endpoint cell: "${rowCell.text}" ${describeBox(rowCell.box)}, ${round(rowCell.clipped)}px clipped`);
      expect(rowCell.clipped, `${at}: the row shows the whole endpoint, so REQ-21 has nothing to be the route out of`).toBeGreaterThan(1);

      // A real pointer on the row's own first cell: the action cluster sits at the row's trailing
      // edge and is not the gesture that reveals the panel.
      await clickAtItsCentre(page, nameCell(page, fixture.name), `${at}: the ${fixture.name} row's own first cell`);

      const detail = panel(page).locator('.ui-detail-panel');
      await expect(detail, `${at}: selecting the context opened no detail panel`).toBeVisible({ timeout: 20_000 });

      const band = await detail.evaluate((element) => {
        const label = Array.from(element.querySelectorAll('.ui-definition-list__label')).find(
          (candidate) => (candidate.textContent ?? '').trim() === 'Endpoint',
        );
        if (!label) return null;
        const value = label.parentElement!.querySelector('.ui-definition-list__value') as HTMLElement;
        const style = getComputedStyle(value);
        const box = value.getBoundingClientRect();
        const range = document.createRange();
        const rects: DOMRect[] = [];
        const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.nodeValue?.trim()) continue;
          range.selectNodeContents(node);
          rects.push(...Array.from(range.getClientRects()));
        }
        // Ink lost to the value's own box: a wrapped value loses none, a clamped or ellipsised one does.
        const inkLost = rects.reduce((total, rect) => {
          const left = Math.max(rect.left, box.left);
          const right = Math.min(rect.right, box.right);
          return total + Math.max(0, rect.width - Math.max(0, right - left));
        }, 0);
        const tops: number[] = [];
        for (const rect of rects) if (!tops.some((top) => Math.abs(top - rect.top) <= 1)) tops.push(rect.top);
        return {
          text: (value.textContent ?? '').trim(),
          whiteSpace: style.whiteSpace,
          textOverflow: style.textOverflow,
          lineClamp: style.webkitLineClamp,
          userSelect: style.userSelect,
          scrollWidth: value.scrollWidth,
          clientWidth: value.clientWidth,
          inkLost,
          lines: tops.length,
          box: { x: box.x, y: box.y, width: box.width, height: box.height },
          truncationClasses: Array.from(value.querySelectorAll('[class*="ui-truncating-"]')).map((node) => node.className.toString()),
        };
      });

      expect(band, `${at}: the context's detail surface presents no Endpoint band`).not.toBeNull();
      console.log(
        `[REQ-21] ${at} panel Endpoint: "${band!.text}" — ${describeBox(band!.box)} over ${band!.lines} line(s), ` +
          `scrollWidth ${band!.scrollWidth} / clientWidth ${band!.clientWidth}, ink lost ${round(band!.inkLost)}px, user-select ${band!.userSelect}`,
      );

      expect(band!.text, `${at}: the panel states a different endpoint from the one the daemon reports (REQ-21)`).toBe(endpoint);
      expect(band!.truncationClasses, `${at}: the panel's endpoint carries a truncation class (REQ-21)`).toEqual([]);
      expect(band!.whiteSpace, `${at}: the panel's endpoint does not wrap (REQ-21)`).not.toBe('nowrap');
      expect(band!.lineClamp, `${at}: the panel's endpoint is clamped to ${band!.lineClamp} line(s) (REQ-21)`).toBe('none');
      expect(
        round(band!.inkLost),
        `${at}: ${round(band!.inkLost)}px of the endpoint is painted outside its own box, so it is truncated on the panel too (REQ-21)`,
      ).toBeLessThanOrEqual(1);
      expect(
        band!.scrollWidth,
        `${at}: the panel holds ${band!.scrollWidth}px of endpoint in ${band!.clientWidth}px (REQ-21)`,
      ).toBeLessThanOrEqual(band!.clientWidth + 1);
      expect(band!.userSelect, `${at}: the endpoint is not selectable on the panel (REQ-21)`).not.toBe('none');

      // The panel is inside the box the table is read in, and never pans with it (data-table.md).
      const expansion = panel(page).locator('.ui-data-table__expanded');
      const expansionBox = await boxOf(expansion, `${at}: the open expansion`);
      const table = await panel(page).evaluate((card) => {
        const element = card.querySelector('.ui-data-table') as HTMLElement;
        const box = element.getBoundingClientRect();
        return { x: box.x, width: box.width, clientWidth: element.clientWidth };
      });
      console.log(`[REQ-23] ${at}: the panel ${describeBox(expansionBox)} inside a table visible box of ${round(table.clientWidth)}px at x ${round(table.x)}`);
      expect(round(expansionBox.width), `${at}: the panel is wider than the box the table is read in`).toBeLessThanOrEqual(round(table.clientWidth) + 0.5);
      expect(expansionBox.x, `${at}: the panel starts left of the table's own visible box`).toBeGreaterThanOrEqual(table.x - 0.5);
    });
  }

  // detail-panel.md — "At most one detail is open on this screen, and at most one anywhere in the
  // interface" (contexts-screen.md restates it as the panel's own guarantee). Selecting a second
  // context moves the panel rather than opening a second one.
  test('one context detail is open at a time, and selecting the row again closes it', async ({ page }) => {
    test.setTimeout(120_000);
    await openScreen(page, VIEWPORTS[0]);

    const clickFirstCell = async (name: string) => {
      await clickAtItsCentre(page, nameCell(page, name), `the ${name} row's own first cell`);
    };

    await clickFirstCell(FIXTURES[0].name);
    await expect(page.locator('.ui-detail-panel')).toHaveCount(1);
    await expect(page.locator('.ui-detail-panel')).toContainText(FIXTURES[0].name);

    await clickFirstCell(FIXTURES[1].name);
    await expect(page.locator('.ui-detail-panel'), 'a second detail panel was opened beside the first').toHaveCount(1);
    await expect(page.locator('.ui-detail-panel')).toContainText(FIXTURES[1].name);
    await expect(page.locator('.ui-detail-panel'), 'the first context’s detail is still open').not.toContainText(FIXTURES[0].name);

    // Selecting the same row again closes it (contexts-screen.md).
    await clickFirstCell(FIXTURES[1].name);
    await expect(page.locator('.ui-detail-panel')).toHaveCount(0);
  });
});
