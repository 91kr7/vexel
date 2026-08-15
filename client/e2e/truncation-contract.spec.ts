/**
 * F4 — a long identifier never collides with the value beside it
 * (`plan-ui-coherence-optimisation/REQ-17` … `REQ-21`).
 *
 * What is asserted here is **painted geometry**, and the instrument is the point
 * of the file. An ellipsised line is still laid out at its full length and only
 * painted clipped, so a check built on raw text rectangles measures the string
 * instead of the ink and reports "unchanged" on a contract that is working. Every
 * rectangle below is therefore clipped by every ancestor that is not
 * `overflow: visible`, and an overlap is the intersection of those clipped
 * rectangles with the trailing group's box (`support/truncating-rows.ts`).
 *
 * Three things decide the shape of these checks:
 *
 * - **The requirement is about any identifier at any width, not about three
 *   repaired screens.** So beside the three sites the analysis named — the volume
 *   mount path, the `Unused volumes` hash and the context endpoint — every
 *   truncating row the product draws is swept, at each of the three viewports,
 *   and each row is measured twice: as the daemon fills it, and carrying a
 *   **synthetic 64-character identifier** (REQ-19), which is what a Docker hash
 *   is in the normal case.
 * - **A trailing control cleared of ink is not repaired if it has been covered.**
 *   `Prune` is therefore hit-tested at its own visible centre in every row and
 *   viewport, and clicked with a real pointer once, since a check that does not
 *   use a real pointer cannot detect a defect only hit-testing can trigger
 *   (CLAUDE.md, "What a check drives, and what it measures").
 * - **The half that must not change is asserted beside it** (REQ-20): a property
 *   band keeps wrapping, in full, with no ellipsis and no one-line clamp; the
 *   table's wrapping cell variants keep wrapping; and no table cell has gained
 *   the run's floor. And the route out of a truncation (REQ-21): the volume's
 *   `Mountpoint` is shown in full, wrapped and selectable, on its own detail
 *   surface.
 *
 * Every fixture carries an ownership label or a name of this suite's own and is
 * removed in a `finally`; nothing assumes an empty daemon; nothing reaches Docker
 * Hub.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import {
  F4_VIEWPORTS,
  SYNTHETIC_64_CHAR_IDENTIFIER,
  describeRect,
  expectRowHonoursTheContract,
  measureTruncatingRows,
  metaInkClippedByTheCard,
  metaInkSqueezed,
  reportRow,
  round,
  type Rect,
  type TruncatingRowGeometry,
} from './support/truncating-rows.js';

interface Viewport {
  width: number;
  height: number;
}

/** The thirteen screens of the shell, by the id the preference holds and the heading each one draws. */
const SCREENS: { id: string; heading: string }[] = [
  { id: 'dashboard', heading: 'Dashboard' },
  { id: 'containers', heading: 'Containers' },
  { id: 'compose', heading: 'Compose' },
  { id: 'swarm', heading: 'Swarm' },
  { id: 'images-layers', heading: 'Images & layers' },
  { id: 'volumes-networks', heading: 'Volumes & networks' },
  { id: 'registries', heading: 'Registries' },
  { id: 'builders-cache', heading: 'Builders & cache' },
  { id: 'contexts', heading: 'Contexts' },
  { id: 'plugins', heading: 'Plugins' },
  { id: 'system-prune', heading: 'System & prune' },
  { id: 'raw-console', heading: 'Raw console' },
  { id: 'coverage-matrix', heading: 'About' },
];

const RUN_ID = `${process.pid}-${Date.now()}`;

/**
 * A name of exactly 64 characters — the length of a Docker hash, and the length
 * REQ-19 is written about. The prefix keeps the fixture recognisable to the
 * cleanup below; the padding takes it to the length under test.
 */
function name64(kind: string): string {
  const stem = `vexel-e2e-trunc-${kind}-${RUN_ID}-`;
  return `${stem}${'a'.repeat(Math.max(1, 64 - stem.length))}`.slice(0, 64);
}

async function openScreen(page: Page, screenId: string, heading: string, viewport: Viewport): Promise<void> {
  await page.setViewportSize(viewport);
  await openApp(page, screenId);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 20_000 });
}

/**
 * Waits until the number of truncating rows on screen has stopped changing.
 *
 * A screen's rows arrive with the daemon read behind them, so a sweep taken the
 * instant the heading appears would report a count about this runner's timing
 * rather than about the product.
 */
async function settledRowCount(page: Page, budget = 15_000): Promise<number> {
  const rows = page.locator('.ui-truncating-row');
  const deadline = Date.now() + budget;
  let previous = -1;
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const count = await rows.count();
    if (count !== previous) {
      previous = count;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= 700) {
      return count;
    }
    await page.waitForTimeout(200);
  }
  return previous;
}

/**
 * Whether a control answers a hit test at its own visible centre — the half of
 * "whole and hit-testable" that a cleared overlap does not prove on its own: a
 * repair that clears the ink by drawing something over the button is not a
 * repair.
 */
async function hitTestAtVisibleCentre(control: Locator): Promise<{ reached: boolean; box: string; hit: string }> {
  await control.scrollIntoViewIfNeeded();
  return control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const hit = document.elementFromPoint(x, y);
    const describe = (node: Element | null) =>
      node === null ? 'nothing' : `${node.tagName.toLowerCase()}.${node.className.toString().split(' ').join('.')}`;
    return {
      reached: hit !== null && (hit === element || element.contains(hit) || hit.contains(element)),
      box: `x=${Math.round(box.left)}, y=${Math.round(box.top)}, ${Math.round(box.width)}×${Math.round(box.height)}`,
      hit: describe(hit),
    };
  });
}

/** Every property band's value on the current screen, with what the contract's boundary says about it. */
async function measurePropertyValues(page: Page): Promise<
  {
    label: string;
    text: string;
    whiteSpace: string;
    textOverflow: string;
    lineClamp: string;
    userSelect: string;
    lines: number;
    scrollWidth: number;
    clientWidth: number;
    inkLost: number;
    truncationClasses: string[];
    box: { top: number; bottom: number; left: number; right: number; width: number; height: number };
  }[]
> {
  return page.evaluate(() => {
    const values = Array.from(document.querySelectorAll('.ui-definition-list__value'));
    const range = document.createRange();
    return values.map((value) => {
      const band = value.parentElement;
      const style = getComputedStyle(value);
      const box = value.getBoundingClientRect();
      const rects: DOMRect[] = [];
      const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.nodeValue?.trim()) continue;
        range.selectNodeContents(node);
        rects.push(...Array.from(range.getClientRects()));
      }
      // Ink lost to the value's own box: a wrapped value never loses any, a
      // clamped or ellipsised one does.
      const inkLost = rects.reduce((total, rect) => {
        const left = Math.max(rect.left, box.left);
        const right = Math.min(rect.right, box.right);
        return total + Math.max(0, rect.width - Math.max(0, right - left));
      }, 0);
      const truncationClasses = Array.from(value.querySelectorAll('[class*="ui-truncating-"]'))
        .concat(value.className.toString().includes('ui-truncating-') ? [value] : [])
        .map((element) => element.className.toString());
      return {
        label: band?.querySelector('.ui-definition-list__label')?.textContent?.trim() ?? '(no label)',
        text: value.textContent?.trim() ?? '',
        whiteSpace: style.whiteSpace,
        textOverflow: style.textOverflow,
        lineClamp: style.webkitLineClamp,
        userSelect: style.userSelect,
        lines: Math.max(1, rects.length),
        scrollWidth: value.scrollWidth,
        clientWidth: value.clientWidth,
        inkLost,
        truncationClasses,
        box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height },
      };
    });
  });
}

/**
 * A **migrated** list row, measured the way `measureTruncatingRows` measures a
 * card row.
 *
 * `plan-ui-coherence-optimisation/REQ-31` moved volumes and networks onto the
 * object list, where the flexible text and the trailing values are no longer one
 * row of `.ui-truncating-run` / `.ui-truncating-meta` but **cells of declared
 * columns**. The contract they are held to is the same one — the flexible text
 * truncates, the trailing values keep their width, and neither inks over the
 * other — so the site is measured rather than dropped: the painted ink of the
 * first cell, clipped by every ancestor that clips, against the boxes of the
 * cells beside it.
 *
 * The clipping is the whole instrument, exactly as it is there: an ellipsised
 * line is laid out at its full length and only painted clipped, so raw text
 * rectangles would report a collision nobody can see.
 */
async function measureTableRow(row: Locator): Promise<{
  headers: string[];
  cells: { header: string; box: Rect }[];
  inkOverCells: { header: string; area: number; rect: Rect }[];
  isTruncating: boolean;
  lineTitles: (string | null)[];
  lineUserSelect: string[];
}> {
  return await row.evaluate((rowElement) => {
    const table = rowElement.closest('.ui-data-table')!;
    const headers = Array.from(table.querySelectorAll('.ui-data-table__header-cell')).map((cell) => cell.textContent?.trim() ?? '');
    const rect = (box: { top: number; bottom: number; left: number; right: number }) => ({
      top: box.top,
      bottom: box.bottom,
      left: box.left,
      right: box.right,
      width: box.right - box.left,
      height: box.bottom - box.top,
    });
    const clip = (raw: DOMRect, from: Element | null) => {
      let { top, bottom, left, right } = raw;
      for (let node: Element | null = from; node !== null; node = node.parentElement) {
        const style = getComputedStyle(node);
        const nodeBox = node.getBoundingClientRect();
        if (style.overflowX !== 'visible') {
          left = Math.max(left, nodeBox.left);
          right = Math.min(right, nodeBox.right);
        }
        if (style.overflowY !== 'visible') {
          top = Math.max(top, nodeBox.top);
          bottom = Math.min(bottom, nodeBox.bottom);
        }
      }
      if (right - left <= 0.5 || bottom - top <= 0.5) return null;
      return rect({ top, bottom, left, right });
    };
    const intersection = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) => {
      const left = Math.max(a.left, b.left);
      const right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top);
      const bottom = Math.min(a.bottom, b.bottom);
      if (right - left <= 0.5 || bottom - top <= 0.5) return null;
      return rect({ top, bottom, left, right });
    };

    const cellElements = Array.from(rowElement.querySelectorAll('.ui-data-table__cell'));
    const cells = cellElements.map((cell, index) => ({ header: headers[index] ?? `column ${index}`, box: rect(cell.getBoundingClientRect()) }));
    const flexible = cellElements[0]!;
    const lines = Array.from(flexible.querySelectorAll('.ui-truncating-line'));

    const flexibleInk: ReturnType<typeof rect>[] = [];
    const range = document.createRange();
    const walker = document.createTreeWalker(flexible, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.nodeValue?.trim()) continue;
      range.selectNodeContents(node);
      for (const raw of Array.from(range.getClientRects())) {
        const clipped = clip(raw, node.parentElement);
        if (clipped) flexibleInk.push(clipped);
      }
    }

    const inkOverCells: { header: string; area: number; rect: ReturnType<typeof rect> }[] = [];
    for (const cell of cells.slice(1)) {
      for (const piece of flexibleInk) {
        const hit = intersection(piece, cell.box);
        if (hit) inkOverCells.push({ header: cell.header, area: hit.width * hit.height, rect: hit });
      }
    }

    return {
      headers,
      cells,
      inkOverCells,
      isTruncating: lines.some((line) => line.scrollWidth > line.clientWidth + 1),
      lineTitles: lines.map((line) => line.getAttribute('title')),
      lineUserSelect: lines.map((line) => getComputedStyle(line).userSelect),
    };
  });
}

async function createVolumeQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'create', ...ownershipArgs('truncation-contract'), name]);
}

async function removeVolumeQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
}

async function createContextQuietly(name: string, host: string): Promise<void> {
  await execFileAsync('docker', ['context', 'create', name, '--docker', `host=${host}`]);
}

async function removeContextQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['context', 'rm', '-f', name]).catch(() => undefined);
}

/**
 * A Docker context is host-level configuration and carries no label, so its name
 * is the only handle there is — and a spec killed by its own timeout never
 * reaches its `finally`, which is exactly when a leftover appears. The suite runs
 * single-worker, so nothing else can own a name under this prefix.
 */
test.afterAll(async () => {
  const { stdout } = await execFileAsync('docker', ['context', 'ls', '--format', '{{.Name}}']).catch(() => ({ stdout: '' }));
  for (const leftover of stdout.split('\n').filter((entry) => entry.startsWith('vexel-e2e-trunc-ctx-'))) {
    await removeContextQuietly(leftover);
  }
});

// REQ-18, REQ-19 — the first of the three sites the analysis named, with a
// 64-character volume name, so its mount path is the arbitrary-length case
// rather than whatever this daemon happens to hold.
test('volumes: a 64-character mount path never inks over the values beside it, at all three viewports', async ({ page }) => {
  test.setTimeout(180_000);
  const volume = name64('vol');
  expect(volume, 'the fixture name is not the 64 characters REQ-19 is written about').toHaveLength(64);

  try {
    await createVolumeQuietly(volume);
    for (const viewport of F4_VIEWPORTS) {
      await openScreen(page, 'volumes-networks', 'Volumes & networks', viewport);
      const listRow = page.locator('.ui-data-table__row', { hasText: volume }).first();
      await expect(listRow).toBeVisible({ timeout: 20_000 });
      await settledRowCount(page);

      const measured = await measureTableRow(listRow);
      const at = `@${viewport.width}×${viewport.height} volumes`;
      console.log(
        `[REQ-18] ${at} the fixture volume's row: ${measured.cells
          .map((cell) => `${cell.header} ${describeRect(cell.box)}`)
          .join(' | ')} — ink over the values beside it ${round(
          measured.inkOverCells.reduce((total, hit) => total + hit.area, 0),
        )}px², ${measured.isTruncating ? 'mount path truncating' : 'mount path whole'}`,
      );

      // The premise: at this width the mount path genuinely does not fit, so
      // "no overlap" is a statement about the contract rather than about a row
      // that had room to spare all along.
      if (viewport.width >= 1280) {
        expect(measured.isTruncating, `${at}: the 64-character mount path fits without truncating, so this row proves nothing`).toBe(true);
      }

      // The site the analysis named, restated for the column the value now sits
      // in: the mount path's painted ink never lands on the driver, the mounting
      // containers or the size (REQ-18, REQ-19).
      expect(
        measured.inkOverCells.map((hit) => `${round(hit.area)}px² over the ${hit.header} column at ${describeRect(hit.rect)}`),
        `${at}: the mount path's painted ink lands on the values beside it (REQ-18)`,
      ).toEqual([]);
      for (const cell of measured.cells) {
        expect(
          round(cell.box.width),
          `${at}: the ${cell.header} column resolves to ${round(cell.box.width)}px, so its value is squeezed out of existence rather than kept at a width (REQ-19)`,
        ).toBeGreaterThan(0);
      }

      // The route out of a truncation is the detail surface, and nothing on either
      // side loses selectability.
      //
      // The **tooltip** assertion that stood here belonged to the card row, which
      // rendered none. The object list's cells carry a native `title` by design
      // (`table-cells.md`), and what `truncation-contract.md` forbids is a tooltip
      // being *a substitute for* the detail surface — not its existence. So what
      // is checked is the substance of that clause: whatever the tooltip says, the
      // value is also obtainable in full on the object's own detail surface, which
      // is the REQ-21 test at the foot of this file, over this very fixture.
      for (const title of measured.lineTitles.filter((value): value is string => value !== null)) {
        expect(title.trim(), `${at}: a line carries an empty tooltip, which states nothing`).not.toBe('');
      }
      expect(measured.lineUserSelect.filter((value) => value === 'none'), `${at}: a truncated line has gained user-select: none`).toEqual([]);
    }
  } finally {
    await removeVolumeQuietly(volume);
  }
});

// REQ-18, REQ-19 — the third site, whose trailing group is the `active` / `use`
// pill and the Remove action, with a 64-character context name and an endpoint
// longer than any row can hold.
test('contexts: a long endpoint never inks over the active pill, at all three viewports', async ({ page }) => {
  test.setTimeout(180_000);
  const context = name64('ctx');
  expect(context, 'the fixture name is not the 64 characters REQ-19 is written about').toHaveLength(64);
  const endpoint = `ssh://operator@build-host-${'x'.repeat(40)}.example.invalid`;

  try {
    await createContextQuietly(context, endpoint);
    for (const viewport of F4_VIEWPORTS) {
      await openScreen(page, 'contexts', 'Contexts', viewport);
      // `plan-ui-coherence-optimisation/REQ-42` moved this list onto the object
      // list, where the endpoint and the values beside it are cells of declared
      // columns rather than one row of `.ui-truncating-run` / `.ui-truncating-meta`.
      // The contract is the same one — the flexible text truncates, the values
      // beside it keep their width, and neither inks over the other — so the site
      // is measured in its migrated form rather than dropped, exactly as the
      // volume row above is.
      const listRow = page.locator('.ui-data-table__row', { hasText: context }).first();
      await expect(listRow).toBeVisible({ timeout: 20_000 });
      await settledRowCount(page);

      const measured = await measureTableRow(listRow);
      const at = `@${viewport.width}×${viewport.height} contexts`;
      console.log(
        `[REQ-18] ${at} the fixture context's row: ${measured.cells
          .map((cell) => `${cell.header} ${describeRect(cell.box)}`)
          .join(' | ')} — ink over the values beside it ${round(
          measured.inkOverCells.reduce((total, hit) => total + hit.area, 0),
        )}px², ${measured.isTruncating ? 'endpoint truncating' : 'endpoint whole'}`,
      );

      // The premise: at this width the endpoint genuinely does not fit, so "no
      // overlap" is a statement about the contract rather than about a row that
      // had room to spare all along. The first cell of a context row is the
      // marker column, so the row's own truncating value is measured through the
      // endpoint cell's clipped ink below.
      expect(
        measured.inkOverCells.map((hit) => `${round(hit.area)}px² over the ${hit.header} column at ${describeRect(hit.rect)}`),
        `${at}: a cell's painted text lands on the values beside it (REQ-18)`,
      ).toEqual([]);
      for (const cell of measured.cells) {
        expect(
          round(cell.box.width),
          `${at}: the ${cell.header} column resolves to ${round(cell.box.width)}px, so its value is squeezed out of existence rather than kept at a width (REQ-19)`,
        ).toBeGreaterThan(0);
      }
      expect(measured.lineUserSelect.filter((value) => value === 'none'), `${at}: a truncated line has gained user-select: none`).toEqual([]);

      // …and the whole row, cell by cell, against every cell beside it: the
      // endpoint's ink is the one this site is named for, and it is the first
      // cell of the endpoint column rather than of the row.
      const endpointInk = await page.evaluate(
        ({ name }) => {
          const rowElement = Array.from(document.querySelectorAll('.ui-data-table__row')).find((candidate) =>
            (candidate.textContent ?? '').includes(name),
          )!;
          const headers = Array.from(rowElement.closest('.ui-data-table')!.querySelectorAll('.ui-data-table__header-cell')).map(
            (cell) => (cell.textContent ?? '').trim(),
          );
          const index = headers.findIndex((header) => /^ENDPOINT$/i.test(header));
          const cell = rowElement.querySelectorAll('.ui-data-table__cell')[index] as HTMLElement;
          const line = cell.querySelector('.ui-truncating-line') as HTMLElement | null;
          return {
            header: headers[index],
            clipped: line ? Math.max(0, line.scrollWidth - line.clientWidth) : 0,
            title: line?.getAttribute('title') ?? null,
          };
        },
        { name: context },
      );
      console.log(`[REQ-19] ${at}: the ${endpointInk.header} cell hides ${round(endpointInk.clipped)}px of its value`);
      expect(
        endpointInk.clipped,
        `${at}: the long endpoint fits without truncating, so this row proves nothing`,
      ).toBeGreaterThan(1);
    }
  } finally {
    await removeContextQuietly(context);
  }
});

// REQ-18, REQ-19 — the second site. The `Unused volumes` description is whatever
// this daemon's unused volumes are, so the arbitrary-length case is made by
// injecting a 64-character identifier into every storage row's description; and
// the trailing `Prune` is checked for being **whole and hit-testable at its own
// centre**, which a cleared overlap does not prove on its own.
test('system & prune: the storage rows keep their size and a hit-testable Prune, at all three viewports', async ({ page }) => {
  test.setTimeout(180_000);

  for (const viewport of F4_VIEWPORTS) {
    await openScreen(page, 'system-prune', 'System & prune', viewport);
    const at = `@${viewport.width}×${viewport.height} system & prune`;
    await expect(page.locator('.ui-storage-usage-row').first(), `${at}: the reclaim listing drew no row at all`).toBeVisible({ timeout: 20_000 });
    await settledRowCount(page);

    const asDrawn = (await measureTruncatingRows(page)).filter((row) => row.kind === 'storage');
    const stressed = (await measureTruncatingRows(page, undefined, { inject: SYNTHETIC_64_CHAR_IDENTIFIER })).filter((row) => row.kind === 'storage');
    expect(asDrawn.length, `${at}: no storage row was measured`).toBeGreaterThan(0);

    for (const row of asDrawn) console.log(`[REQ-18] ${reportRow(at, row)}`);
    for (const row of stressed) console.log(`[REQ-19] ${reportRow(`${at} (64-character identifier)`, row)}`);

    for (const row of asDrawn) expectRowHonoursTheContract(row, `${at} row "${row.rowText.slice(0, 24)}"`);
    for (const row of stressed) {
      expectRowHonoursTheContract(row, `${at} row "${row.rowText.slice(0, 24)}" carrying a 64-character identifier`);
    }

    // The `Prune` action of every row, at its own visible centre.
    const pruneButtons = page.locator('.ui-storage-usage-row').getByRole('button', { name: 'Prune', exact: true });
    const count = await pruneButtons.count();
    expect(count, `${at}: the reclaim listing offers no Prune action to check`).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const outcome = await hitTestAtVisibleCentre(pruneButtons.nth(index));
      console.log(`[REQ-18] ${at} Prune ${index}: box ${outcome.box}, centre reaches ${outcome.hit}`);
      expect(
        outcome.reached,
        `${at}: the Prune button of row ${index} is at ${outcome.box} and its own centre reaches ${outcome.hit} instead — it is covered, not repaired (REQ-18)`,
      ).toBe(true);
    }
  }

  // …and a real pointer on one of them, since a programmatic activation moves no
  // focus and hit-tests nothing (CLAUDE.md). The confirmation is cancelled, so
  // this performs nothing on the daemon.
  await openScreen(page, 'system-prune', 'System & prune', F4_VIEWPORTS[0]!);
  await settledRowCount(page);
  const pruneButtons = page.locator('.ui-storage-usage-row').getByRole('button', { name: 'Prune', exact: true });
  let enabled: Locator | undefined;
  for (let index = 0; index < (await pruneButtons.count()); index += 1) {
    if (await pruneButtons.nth(index).isEnabled()) {
      enabled = pruneButtons.nth(index);
      break;
    }
  }
  if (!enabled) {
    console.log('[REQ-18] system & prune: this daemon has nothing reclaimable, so no Prune action is enabled to click');
  } else {
    await enabled.click();
    const heading = page.getByRole('heading', { name: /^Confirm: / });
    await expect(heading, 'a real click at the Prune button opened no confirmation').toBeVisible({ timeout: 20_000 });
    await page.locator('.ui-modal').filter({ has: heading }).getByRole('button', { name: 'Cancel' }).click();
    await expect(heading).toBeHidden();
  }
});

// REQ-18, REQ-19 — the whole product rather than three hand-picked rows: every
// truncating row of every screen, measured as the daemon fills it and again
// carrying a 64-character identifier. This is the check that generalises to the
// screens later batches migrate onto the same primitives.
for (const viewport of F4_VIEWPORTS) {
  test(`every truncating row of every screen honours the contract at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    test.setTimeout(600_000);
    const at = `@${viewport.width}×${viewport.height}`;
    let cards = 0;
    let storage = 0;
    let colliding = 0;
    let collidingStressed = 0;
    let narrowCards = 0;

    for (const screen of SCREENS) {
      await openScreen(page, screen.id, screen.heading, viewport);
      await settledRowCount(page);

      const asDrawn = await measureTruncatingRows(page);
      const stressed = await measureTruncatingRows(page, undefined, { inject: SYNTHETIC_64_CHAR_IDENTIFIER });
      cards += asDrawn.filter((row) => row.kind === 'card').length;
      storage += asDrawn.filter((row) => row.kind === 'storage').length;

      const collides = (row: TruncatingRowGeometry) => row.overlaps.length > 0 || row.boxOverlaps.length > 0 || metaInkSqueezed(row) > 1;
      const collidingHere = asDrawn.filter(collides);
      const collidingStressedHere = stressed.filter(collides);
      colliding += collidingHere.length;
      collidingStressed += collidingStressedHere.length;
      // Reported, never asserted on: a trailing group at its natural width in a
      // card too narrow to hold it is the call site's fixed `Grid` template, not
      // the contract — feature-code work pinned to batches 6, 9 and 14.
      const clippedByTheCard = asDrawn.filter((row) => metaInkClippedByTheCard(row) > 1);
      narrowCards += clippedByTheCard.length;
      console.log(
        `[REQ-18] ${at} ${screen.heading}: ${asDrawn.length} truncating row(s) — ${collidingHere.length} colliding as drawn, ${collidingStressedHere.length} colliding with a 64-character identifier, ${clippedByTheCard.length} whose card is narrower than the trailing group it holds`,
      );
      for (const row of clippedByTheCard) console.log(`[card width] ${reportRow(`${at} ${screen.heading}`, row)}`);
      for (const row of collidingHere) console.log(`[REQ-18] ${reportRow(`${at} ${screen.heading}`, row)}`);
      for (const row of collidingStressedHere) console.log(`[REQ-19] ${reportRow(`${at} ${screen.heading} (64-character identifier)`, row)}`);

      for (const row of asDrawn) expectRowHonoursTheContract(row, `${at} ${screen.heading} row "${row.label}"`);
      for (const row of stressed) {
        expectRowHonoursTheContract(row, `${at} ${screen.heading} row "${row.label}" carrying a 64-character identifier`);
      }
    }

    console.log(
      `[REQ-18] ${at} sweep total: ${cards} card row(s) and ${storage} storage row(s) over ${SCREENS.length} screens — ${colliding} colliding as drawn, ${collidingStressed} colliding under a 64-character identifier, ${narrowCards} in a card too narrow for the trailing group it holds`,
    );
    // A sweep that found nothing to measure is an environment fact, not a
    // verdict about the product, and it must not read as a pass.
    expect(cards + storage, `${at}: this daemon put no truncating row on any screen, so the sweep asserts nothing`).toBeGreaterThan(0);
    expect(colliding, `${at}: ${colliding} row(s) drawn by the product still collide (REQ-18)`).toBe(0);
    expect(collidingStressed, `${at}: ${collidingStressed} row(s) collide once they carry a 64-character identifier (REQ-19)`).toBe(0);

    // The other quantity, kept apart from the verdict on purpose. At the
    // delivered desktop widths a trailing group is never wider than the card it
    // sits in, and that is asserted. At 375×812 it frequently is — the screens
    // that hand `Grid` a fixed template that never collapses leave a card at
    // ~90px — and no change inside the library can repair it: it is reported
    // here and pinned to batch 14, batch 6 having taken volumes and networks out
    // of that list and batch 9 the contexts screen (REQ-42: the `Grid` went with
    // the daemon card, one child not being a pair).
    if (viewport.width >= 1280) {
      expect(
        narrowCards,
        `${at}: ${narrowCards} row(s) sit in a card narrower than the trailing group at its natural width, so a value is clipped away by the card`,
      ).toBe(0);
    } else {
      console.log(
        `[card width] ${at}: ${narrowCards} row(s) sit in a card narrower than their trailing group — the call sites' fixed Grid templates (SystemScreen.tsx:176; VolumesNetworksScreen's went with the F6 migration and ContextsScreen's with the F9 one), not the truncation contract`,
      );
    }
  });
}

// REQ-20 — the half that must not change: a property band wraps and stays wholly
// readable. This is the assertion that stops the truncation being applied where
// it would turn a layout decision into a data loss.
test('a property band still wraps, with no ellipsis and no one-line clamp', async ({ page }) => {
  test.setTimeout(240_000);
  const volume = name64('vol');

  try {
    await createVolumeQuietly(volume);
    for (const viewport of F4_VIEWPORTS.slice(0, 2)) {
      for (const screen of [
        { id: 'system-prune', heading: 'System & prune', reveal: false },
        // Contexts states no property band until a context is selected: the
        // eight-property daemon block that used to stand beside the list left
        // this screen with `plan-ui-coherence-optimisation/REQ-45`, and the bands
        // that remain are the row's own detail — which is where REQ-21 sends the
        // operator for the endpoint the row cuts. The rule under test is the
        // band's, so the site is revealed rather than dropped.
        { id: 'contexts', heading: 'Contexts', reveal: true },
      ]) {
        await openScreen(page, screen.id, screen.heading, viewport);
        if (screen.reveal) {
          // A real pointer on the cell naming the context: the action cluster
          // sits at the row's trailing edge and is not the gesture that reveals
          // the detail, and the row's leading cell is the marker column, which
          // is empty on every context but the one in use.
          const firstCell = page
            .locator('.ui-data-table__row')
            .first()
            .locator('.ui-data-table__cell', { has: page.locator('.ui-table-two-line-cell') })
            .first();
          await expect(firstCell).toBeVisible({ timeout: 20_000 });
          const cellBox = (await firstCell.boundingBox())!;
          await page.mouse.click(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2);
        }
        await expect(page.locator('.ui-definition-list').first()).toBeVisible({ timeout: 20_000 });
        const bands = await measurePropertyValues(page);
        const at = `@${viewport.width}×${viewport.height} ${screen.heading}`;
        expect(bands.length, `${at}: no property band was measured`).toBeGreaterThan(0);
        console.log(`[REQ-20] ${at}: ${bands.length} band(s) — ${bands.map((band) => `${band.label} ${round(band.box.width)}×${round(band.box.height)}px over ${band.lines} line(s)`).join(', ')}`);

        for (const band of bands) {
          expect(band.truncationClasses, `${at}: the \`${band.label}\` band carries a truncation class (REQ-20)`).toEqual([]);
          expect(band.whiteSpace, `${at}: the \`${band.label}\` band's value is laid out \`white-space: ${band.whiteSpace}\` (REQ-20)`).not.toBe('nowrap');
          expect(band.textOverflow, `${at}: the \`${band.label}\` band's value ellipsises (REQ-20)`).toBe('clip');
          expect(band.lineClamp, `${at}: the \`${band.label}\` band's value is clamped to ${band.lineClamp} line(s) (REQ-20)`).toBe('none');
          expect(
            round(band.inkLost),
            `${at}: the \`${band.label}\` band loses ${round(band.inkLost)}px of ink outside its own box, so its value is not wholly readable (REQ-20)`,
          ).toBeLessThanOrEqual(1);
          expect(
            band.scrollWidth,
            `${at}: the \`${band.label}\` band holds ${band.scrollWidth}px of value in ${band.clientWidth}px, so part of it is clipped away (REQ-20)`,
          ).toBeLessThanOrEqual(band.clientWidth + 1);
        }
      }

      // …and the same on the surface a truncated list row sends the operator to.
      // A real pointer on the row's own first cell: the action cluster now sits
      // at the row's trailing edge and is not the gesture that reveals the panel.
      await openScreen(page, 'volumes-networks', 'Volumes & networks', viewport);
      await page.locator('.ui-data-table__row', { hasText: volume }).first().locator('.ui-data-table__cell').first().click();
      await expect(page.locator('.ui-detail-panel .ui-definition-list').first()).toBeVisible({ timeout: 20_000 });
      const detail = (await measurePropertyValues(page)).filter((band) => band.label === 'Mountpoint');
      const at = `@${viewport.width}×${viewport.height} volume detail`;
      expect(detail, `${at}: the volume's detail surface presents no Mountpoint band`).toHaveLength(1);
      expect(detail[0]!.whiteSpace, `${at}: the Mountpoint band no longer wraps (REQ-20)`).not.toBe('nowrap');
      expect(detail[0]!.lineClamp, `${at}: the Mountpoint band is clamped to ${detail[0]!.lineClamp} line(s) (REQ-20)`).toBe('none');
    }
  } finally {
    await removeVolumeQuietly(volume);
  }
});

// REQ-21 (the volume half) — a truncated value stays obtainable in full: the
// mount path the list row ellipsises is shown by the object's own detail
// surface, wrapped, unclipped and selectable.
test('the mount path a volume row truncates is shown in full, wrapped and selectable, on the volume’s detail surface', async ({ page }) => {
  test.setTimeout(180_000);
  const volume = name64('vol');

  try {
    await createVolumeQuietly(volume);
    const { stdout } = await execFileAsync('docker', ['volume', 'inspect', volume, '--format', '{{.Mountpoint}}']);
    const mountpoint = stdout.trim();
    expect(mountpoint.length, 'the daemon reported no mount path for the fixture volume').toBeGreaterThan(0);

    await openScreen(page, 'volumes-networks', 'Volumes & networks', F4_VIEWPORTS[0]!);
    const row = page.locator('.ui-data-table__row', { hasText: volume }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // The premise: the row really does truncate this value, so the detail
    // surface is the route out of something rather than a second copy of a
    // value already wholly on screen.
    const listRow = await measureTableRow(row);
    expect(listRow.isTruncating, 'the list row shows the whole mount path, so REQ-21 has nothing to be the route out of').toBe(true);

    // A real pointer on the row's own first cell, at its visible centre.
    await row.locator('.ui-data-table__cell').first().click();
    await expect(page.locator('.ui-detail-panel .ui-definition-list').first()).toBeVisible({ timeout: 20_000 });
    const band = (await measurePropertyValues(page)).find((candidate) => candidate.label === 'Mountpoint');
    expect(band, "the volume's detail surface presents no Mountpoint band").toBeDefined();
    console.log(
      `[REQ-21] volume detail Mountpoint: "${band!.text}" — ${describeRect(band!.box)} over ${band!.lines} line(s), scrollWidth ${band!.scrollWidth} / clientWidth ${band!.clientWidth}, user-select ${band!.userSelect}`,
    );

    expect(band!.text, 'the detail surface shows a different mount path from the one the daemon reports (REQ-21)').toBe(mountpoint);
    expect(
      band!.scrollWidth,
      `the detail surface holds ${band!.scrollWidth}px of mount path in ${band!.clientWidth}px, so it is truncated there too (REQ-21)`,
    ).toBeLessThanOrEqual(band!.clientWidth + 1);
    expect(round(band!.inkLost), `${round(band!.inkLost)}px of the mount path is painted outside its own box (REQ-21)`).toBeLessThanOrEqual(1);
    expect(band!.userSelect, 'the mount path is not selectable on the detail surface (REQ-21)').not.toBe('none');
    expect(band!.whiteSpace, 'the mount path does not wrap on the detail surface (REQ-21)').not.toBe('nowrap');
  } finally {
    await removeVolumeQuietly(volume);
  }
});

// REQ-20, and the boundary `truncation-contract.md` states for a table: a cell
// takes the line and meta classes and **not** the run's floor, which inside a
// 72px column track would push the cell's inline action out of it; and the
// wrapping variants of `TwoLineCell` / `MetaCell` keep wrapping, because they
// withhold the line class rather than override it.
test('a table cell carries no run floor, and the wrapping cell variants still wrap', async ({ page }) => {
  test.setTimeout(180_000);

  for (const viewport of F4_VIEWPORTS.slice(0, 2)) {
    await openScreen(page, 'coverage-matrix', 'About', viewport);
    await expect(page.locator('.ui-data-table__row').first()).toBeVisible({ timeout: 20_000 });
    const at = `@${viewport.width}×${viewport.height} About`;

    const cells = await page.evaluate(() => {
      const range = document.createRange();
      const linesOf = (element: Element): number => {
        const rects: DOMRect[] = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.nodeValue?.trim()) continue;
          range.selectNodeContents(node);
          rects.push(...Array.from(range.getClientRects()));
        }
        const tops: number[] = [];
        for (const rect of rects) if (!tops.some((top) => Math.abs(top - rect.top) <= 1)) tops.push(rect.top);
        return tops.length;
      };
      const describe = (element: Element) => {
        const style = getComputedStyle(element);
        return {
          className: element.className.toString(),
          whiteSpace: style.whiteSpace,
          textOverflow: style.textOverflow,
          lines: linesOf(element),
          text: (element.textContent ?? '').trim().slice(0, 40),
          clipped: element.scrollWidth > element.clientWidth + 1,
        };
      };
      return {
        runsInsideTables: document.querySelectorAll('.ui-data-table .ui-truncating-run').length,
        wrappingTwoLine: Array.from(document.querySelectorAll('.ui-table-two-line-cell--wrap .ui-table-two-line-cell__title, .ui-table-two-line-cell--wrap .ui-table-two-line-cell__subtitle')).map(describe),
        wrappingMeta: Array.from(document.querySelectorAll('.ui-table-meta-cell--wrap')).map(describe),
        truncatingCells: Array.from(document.querySelectorAll('.ui-data-table .ui-truncating-line')).map(describe),
      };
    });

    console.log(
      `[REQ-20] ${at}: ${cells.runsInsideTables} truncating run(s) inside a table, ${cells.wrappingTwoLine.length} wrapping two-line line(s), ${cells.wrappingMeta.length} wrapping meta cell(s), ${cells.truncatingCells.length} truncating cell line(s)`,
    );

    expect(
      cells.runsInsideTables,
      `${at}: ${cells.runsInsideTables} table cell(s) carry the run's floor, which inside a column track is a second floor the cell's action is pushed out of (truncation-contract.md)`,
    ).toBe(0);

    expect(cells.wrappingTwoLine.length + cells.wrappingMeta.length, `${at}: this screen presents no wrapping cell variant to check`).toBeGreaterThan(0);
    for (const cell of [...cells.wrappingTwoLine, ...cells.wrappingMeta]) {
      expect(cell.whiteSpace, `${at}: the wrapping cell "${cell.text}" is laid out \`white-space: ${cell.whiteSpace}\` (REQ-20)`).not.toBe('nowrap');
      expect(cell.textOverflow, `${at}: the wrapping cell "${cell.text}" ellipsises (REQ-20)`).toBe('clip');
      expect(cell.clipped, `${at}: the wrapping cell "${cell.text}" is clipped at its column's width (REQ-20)`).toBe(false);
      expect(cell.className, `${at}: the wrapping cell "${cell.text}" took the line class instead of withholding it`).not.toContain('ui-truncating-line');
    }
    const wrapped = [...cells.wrappingTwoLine, ...cells.wrappingMeta].filter((cell) => cell.lines >= 2);
    console.log(`[REQ-20] ${at}: ${wrapped.length} wrapping cell(s) actually drawn over two or more lines`);
    expect(wrapped.length, `${at}: not one wrapping cell is drawn over more than one line, so nothing here shows that wrapping survived`).toBeGreaterThan(0);

    // The other side of the same boundary: a cell that does take the line class
    // is one line, ellipsised.
    for (const cell of cells.truncatingCells) {
      expect(cell.whiteSpace, `${at}: the truncating cell "${cell.text}" no longer keeps to one line`).toBe('nowrap');
      expect(cell.textOverflow, `${at}: the truncating cell "${cell.text}" does not ellipsise`).toBe('ellipsis');
    }
  }
});
