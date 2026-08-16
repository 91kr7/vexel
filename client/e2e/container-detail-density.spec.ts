/**
 * F14 — the container's expanded detail stops fighting for room
 * (`plan-ui-coherence-optimisation/REQ-62` … `REQ-65`).
 *
 * Two measured defects, both inside an expanded row where room is scarcest: a logs toolbar of three
 * stacked rows, the third holding `Download` alone; and five metrics in a four-column grid, leaving
 * `PIDS` orphaned on a second row while two tiles carried a bar and three did not.
 *
 * **Every assertion here is on a viewport box.** A toolbar that reflows and a grid that re-tracks
 * keep every child and every character they had; what they change is coordinates (CLAUDE.md, "What a
 * check drives, and what it measures"). The controls are hit-tested with a **real pointer at the
 * visible control's own centre** — never at the visually hidden input behind a toggle, whose
 * position is frequently the very thing at issue.
 *
 * Every fixture is a labelled container removed in a `finally`; nothing is asserted about the
 * operator's own daemon, and no assertion is on a total or on a list being empty.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

const DESKTOP_VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
];

const PHONE_VIEWPORT = { width: 375, height: 812 };

interface Box {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** What a real pointer aimed at the control's own centre actually reaches. */
  hitsItself: boolean;
}

/** A container that keeps logging, so the Logs tab has a live stream to draw. */
async function createLoggingContainer(name: string): Promise<void> {
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(name),
    '--entrypoint',
    'sh',
    'alpine:3.20',
    '-c',
    'echo hello-from-stdout; echo boom-from-stderr 1>&2; i=0; while true; do i=$((i+1)); echo tick-$i; sleep 1; done',
  ]);
}

/** Prints `count` numbered lines at once, then stays alive: a buffer of a known, stable size. */
async function createBulkLoggingContainer(name: string, count: number): Promise<void> {
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(name),
    '--entrypoint',
    'sh',
    'alpine:3.20',
    '-c',
    `for i in $(seq 1 ${count}); do echo bulk-$i; done; sleep 300`,
  ]);
}

/** A container burning CPU under a memory limit: non-zero readings, and one metric with a ceiling. */
async function createBusyContainer(name: string): Promise<void> {
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(name),
    '--memory',
    '512m',
    '--entrypoint',
    'sh',
    'alpine:3.20',
    '-c',
    'i=0; while true; do i=$((i+1)); done',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

function containerRow(page: Page, name: string): Locator {
  return page.locator('.ui-data-table__row', { hasText: name });
}

async function openTab(page: Page, name: string, tab: string): Promise<Locator> {
  const row = containerRow(page, name);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByText(name, { exact: true }).click();
  const detail = page.locator('.ui-data-table__expanded');
  await expect(detail).toBeVisible();
  await detail.getByRole('tab', { name: tab }).click();
  return detail;
}

/** The control's box and what a pointer aimed at its own centre reaches. */
async function boxOf(name: string, locator: Locator): Promise<Box> {
  return await locator.evaluate((element, controlName) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return {
      name: controlName,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      hitsItself: hit !== null && (element.contains(hit) || hit.contains(element)),
    };
  }, name);
}

/**
 * The boxes grouped into the rows they are actually drawn on: two controls share a row when their
 * vertical extents overlap by more than half the shorter one. Read from geometry, never from the
 * markup — which row a control is *placed* in is exactly what a rearrangement changes.
 */
function rowsOf<T extends { y: number; height: number }>(boxes: T[]): T[][] {
  const rows: T[][] = [];
  for (const box of [...boxes].sort((left, right) => left.y - right.y)) {
    const row = rows.find((candidate) => {
      const reference = candidate[0]!;
      const overlap = Math.min(reference.y + reference.height, box.y + box.height) - Math.max(reference.y, box.y);
      return overlap > Math.min(reference.height, box.height) / 2;
    });
    if (row) row.push(box);
    else rows.push([box]);
  }
  return rows;
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115).
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// These tests keep a container's detail panel open across several UI steps; the expanded row is not
// given extra space by the table's virtualisation, so serial mode keeps the mounted window stable.
test.describe('Container detail — the expanded detail stops fighting for room (REQ-62…REQ-65)', () => {
  test.describe.configure({ mode: 'serial' });

  // plan-ui-coherence-optimisation/REQ-62 — "stdout/stderr, timestamps, line count, since, until,
  // the filter with previous/next, and `Download` occupy fewer rows than the delivered three, and
  // **no row holds a single button alone**. Every control keeps its function and its delivered
  // behaviour."
  test('the logs toolbar occupies fewer than three rows, none of them holding a single control', async ({ page }) => {
    test.setTimeout(180_000);
    const name = `vexel-e2e-toolbar-rows-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openTab(page, name, 'Logs');
      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 20_000 });

      for (const viewport of DESKTOP_VIEWPORTS) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(400);
        const at = `${viewport.width}×${viewport.height}`;

        // The visible controls, each named, each measured where the operator sees it. The toggle is
        // measured on its own visible box and never on the input hidden behind it.
        const controls: [string, Locator][] = [
          ['stdout', detail.getByRole('button', { name: 'stdout', exact: true })],
          ['stderr', detail.getByRole('button', { name: 'stderr', exact: true })],
          ['Timestamps', detail.locator('.ui-toggle').filter({ hasText: 'Timestamps' })],
          ['Tail size', detail.getByRole('combobox', { name: 'Tail size' })],
          ['Since', detail.getByRole('textbox', { name: 'Since' })],
          ['Until', detail.getByRole('textbox', { name: 'Until' })],
          ['Search the stream', detail.getByRole('textbox', { name: 'Search the stream' })],
          ['Previous', detail.getByRole('button', { name: 'Previous' })],
          ['Next', detail.getByRole('button', { name: 'Next' })],
          ['Download', detail.getByRole('button', { name: 'Download' })],
        ];

        const boxes: Box[] = [];
        for (const [controlName, locator] of controls) {
          await expect(locator, `[REQ-62] ${at}: ${controlName} is not on the surface`).toBeVisible();
          boxes.push(await boxOf(controlName, locator));
        }

        const rows = rowsOf(boxes);
        console.log(
          `[REQ-62] ${at} — ${rows.length} rows: `
          + rows.map((row) => `[${row.map((box) => box.name).join(', ')}] at y=${Math.round(row[0]!.y)}`).join(' '),
        );

        expect(rows.length, `[REQ-62] ${at}: the toolbar still occupies three rows or more`).toBeLessThan(3);
        for (const row of rows) {
          expect(row.map((box) => box.name), `[REQ-62] ${at}: a row holds a single control alone`).not.toHaveLength(1);
        }
        // Every control is where the operator can reach it: hit-testable at the centre of its own
        // visible box, none of them behind another.
        expect(
          boxes.filter((box) => !box.hitsItself).map((box) => box.name),
          `[REQ-62] ${at}: a control is not reachable at the centre of its own box`,
        ).toEqual([]);
      }
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-ui-coherence-optimisation/REQ-62 — "Every control keeps its function and its delivered
  // behaviour": the search, which is the control that moved, driven with a real pointer at its own
  // coordinates on the row it moved to.
  test('the search that moved onto the stream’s action row still counts and moves between the matches', async ({ page }) => {
    test.setTimeout(180_000);
    const name = `vexel-e2e-toolbar-search-${Date.now()}`;
    try {
      // 20 lines, of which bulk-1 and bulk-10…bulk-19 match "bulk-1": a count that does not move.
      await createBulkLoggingContainer(name, 20);
      const detail = await openTab(page, name, 'Logs');
      await expect(detail.getByText('bulk-20', { exact: true })).toBeVisible({ timeout: 20_000 });

      const search = detail.getByRole('textbox', { name: 'Search the stream' });
      // A real pointer at the field's own centre, rather than a programmatic focus.
      await search.click();
      await search.pressSequentially('bulk-1');

      await expect(detail.locator('mark').first()).toBeVisible();
      await expect(detail.getByText('1/11')).toBeVisible();

      await detail.getByRole('button', { name: 'Next' }).click();
      await expect(detail.getByText('2/11')).toBeVisible();
      await detail.getByRole('button', { name: 'Previous' }).click();
      await expect(detail.getByText('1/11')).toBeVisible();

      // The rearrangement moved the search onto the region's own action row: the row is one row, and
      // it holds the download too.
      const rowMembers = await detail.locator('.ui-log-stream__actions').evaluate((row) => ({
        holdsSearch: row.querySelector('.ui-stream-search') !== null,
        buttons: [...row.querySelectorAll('button')].map((button) => (button.textContent ?? '').trim()),
      }));
      console.log(`[REQ-62] the stream's action row — ${JSON.stringify(rowMembers)}`);
      expect(rowMembers.holdsSearch, '[REQ-62] the search is not on the stream’s action row').toBe(true);
      expect(rowMembers.buttons, '[REQ-62] the download left the row the search is on').toContain('Download');
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-ui-coherence-optimisation/REQ-62 / container-logs-view.md — "`Download` … must still
  // deliver the **whole** buffer and not the rendered window". The region is virtualised, so the two
  // are different numbers and the file is the only place the difference shows.
  test('the download still delivers the whole buffer and not the rendered window', async ({ page }) => {
    test.setTimeout(180_000);
    const name = `vexel-e2e-toolbar-download-${Date.now()}`;
    const lineCount = 200;
    try {
      await createBulkLoggingContainer(name, lineCount);
      const detail = await openTab(page, name, 'Logs');
      // The tail of the buffer, which is what the region is following; the rest of the buffer is
      // deliberately not mounted, and that is the point of this test.
      await expect(detail.getByText(`bulk-${lineCount}`, { exact: true })).toBeVisible({ timeout: 20_000 });
      // The buffer is loaded in full before it is asked for: the last line printed is in it.
      await detail.getByRole('textbox', { name: 'Search the stream' }).fill('bulk-');
      await expect(detail.getByText(new RegExp(`^1/${lineCount}$`))).toBeVisible({ timeout: 20_000 });

      const mounted = await detail.locator('.ui-log-stream__line').count();
      const downloadPromise = page.waitForEvent('download');
      await detail.getByRole('button', { name: 'Download' }).click();
      const download = await downloadPromise;
      try {
        const saved = readFileSync(await download.path(), 'utf8')
          .split('\n')
          .filter((line) => line.trim() !== '');
        console.log(`[REQ-62] ${saved.length} lines saved, ${mounted} rows mounted in the region`);

        expect(download.suggestedFilename()).toBe(`${name}-logs.txt`);
        expect(saved.length, '[REQ-62] the file holds the rendered window rather than the buffer').toBe(lineCount);
        expect(saved[0]).toContain('bulk-1');
        expect(saved[saved.length - 1]).toContain(`bulk-${lineCount}`);
        expect(mounted, '[REQ-62] the region mounted the whole buffer, so the file proves nothing').toBeLessThan(lineCount);
      } finally {
        // The runner's file is the runner's: handed back rather than left on disk.
        await download.delete();
      }
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-ui-coherence-optimisation/REQ-63 — "the grid's column count and the metric count agree at
  // 1440×1000 and 1280×800, with no orphan"; REQ-64 — "The tiles are uniform … a tile without a
  // measurable maximum does not merely look like a tile whose bar failed to render."
  test('the stats tiles share one row with no orphan, and every tile is built the same way', async ({ page }) => {
    test.setTimeout(240_000);
    const name = `vexel-e2e-stats-grid-${Date.now()}`;
    try {
      await createBusyContainer(name);
      const detail = await openTab(page, name, 'Stats');
      await expect(detail.locator('.ui-metric-tile').first()).toBeVisible({ timeout: 30_000 });
      await expect(detail.getByText(/Waiting for the first sample/i)).toHaveCount(0, { timeout: 30_000 });
      // A sparkline draws its line from the second sample on, so the tiles are compared once every
      // one of them is in the state it settles in: before that they are uniformly empty, which would
      // let a tile missing its own sparkline pass.
      await expect
        .poll(async () => detail.locator('.ui-metric-tile svg').count(), {
          timeout: 40_000,
          message: 'expected every tile to have drawn its sparkline',
        })
        .toBe(5);

      for (const viewport of [...DESKTOP_VIEWPORTS, PHONE_VIEWPORT]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(400);
        const at = `${viewport.width}×${viewport.height}`;

        const tiles = await detail.locator('.ui-metric-tile').evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            const meter = element.querySelector('[role="meter"]');
            const meterRect = meter?.getBoundingClientRect();
            return {
              name: (element.querySelector('.ui-metric-tile__label')?.textContent ?? '').trim(),
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              meters: element.querySelectorAll('[role="meter"]').length,
              // The sparkline's own slot, whichever of its two states it is in: the line it draws
              // from the second sample on, or the label it shows until then.
              sparklines: element.querySelectorAll('svg, .ui-sparkline__empty').length,
              meterHeight: meterRect?.height ?? 0,
              meterTreatment: meter === null ? '(no meter)' : getComputedStyle(meter).backgroundImage,
              noMaximum: /no.*maximum/i.test(meter?.getAttribute('aria-valuetext') ?? ''),
            };
          }),
        );

        const rows = rowsOf(tiles);
        console.log(
          `[REQ-63] ${at} — ${tiles.length} tiles over ${rows.length} row(s): `
          + rows.map((row) => `[${row.map((tile) => tile.name).join(', ')}]`).join(' ')
          + ` widths ${tiles.map((tile) => Math.round(tile.width)).join('/')}`,
        );

        expect(tiles.map((tile) => tile.name), `[REQ-63] ${at}: the five metrics are not all drawn`).toEqual([
          'CPU',
          'Memory',
          'Net I/O',
          'Block I/O',
          'PIDs',
        ]);
        if (viewport.width > 720) {
          // Above the phone breakpoint: one row, one track per tile, all of equal width.
          expect(rows.length, `[REQ-63] ${at}: the tiles are laid over more than one row`).toBe(1);
          const widths = tiles.map((tile) => Math.round(tile.width));
          expect(Math.max(...widths) - Math.min(...widths), `[REQ-63] ${at}: the tracks are not equal`).toBeLessThanOrEqual(1);
        } else {
          // Below it: one stacked column, which is the only division of five that leaves no orphan.
          expect(rows.length, `[REQ-63] ${at}: the tiles are not stacked at the phone breakpoint`).toBe(tiles.length);
          expect(new Set(tiles.map((tile) => Math.round(tile.x))).size, `[REQ-63] ${at}: the stacked tiles are not in one column`).toBe(1);
        }

        // REQ-64 — every tile carries the same trailing block, and the tile with no ceiling says so
        // rather than showing what looks like a bar that failed.
        for (const tile of tiles) {
          expect(tile.meters, `[REQ-64] ${at}: ${tile.name} carries no meter, or more than one`).toBe(1);
          expect(tile.sparklines, `[REQ-64] ${at}: ${tile.name} carries no sparkline, or more than one`).toBe(1);
        }
        const meterHeights = tiles.map((tile) => Math.round(tile.meterHeight));
        expect(
          Math.max(...meterHeights) - Math.min(...meterHeights),
          `[REQ-64] ${at}: a tile without a measurable maximum is not the same height as one with it`,
        ).toBeLessThanOrEqual(1);

        const unbounded = tiles.filter((tile) => tile.noMaximum);
        const bounded = tiles.filter((tile) => !tile.noMaximum);
        console.log(
          `[REQ-64] ${at} — no measurable maximum: [${unbounded.map((tile) => tile.name).join(', ')}];`
          + ` treatments ${JSON.stringify(tiles.map((tile) => `${tile.name}: ${tile.meterTreatment}`))}`,
        );
        expect(unbounded.length, `[REQ-64] ${at}: no metric is drawn as having no measurable maximum`).toBeGreaterThan(0);
        expect(bounded.length, `[REQ-64] ${at}: no metric with a ceiling is drawn, so nothing is being distinguished`).toBeGreaterThan(0);
        for (const tile of unbounded) {
          expect(
            tile.meterTreatment,
            `[REQ-64] ${at}: ${tile.name} draws its bar exactly as a bounded metric does, so an absence reads as a failure`,
          ).not.toBe(bounded[0]!.meterTreatment);
        }
      }
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-ui-coherence-optimisation/REQ-65 — "The container detail panel is the primitive, with its
  // tabs (Logs, Stats, Config, Processes, Inspect, Exec, Attach) and its two-column property grid
  // preserved, and with REQ-60 applied to its empty `Labels` section."
  test('the panel keeps its seven tabs, its raw payload and no section headed with a count of zero', async ({ page }) => {
    test.setTimeout(180_000);
    const name = `vexel-e2e-detail-panel-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openTab(page, name, 'Inspect');

      for (const tab of ['Logs', 'Stats', 'Config', 'Processes', 'Inspect', 'Exec', 'Attach']) {
        await expect(detail.getByRole('tab', { name: tab }), `[REQ-65] the ${tab} tab is not offered`).toBeVisible();
      }

      // The raw payload, as real selectable text: complete enough to parse, and this container's.
      const payload = detail.locator('.ui-code-viewer__code');
      await expect(payload).toBeVisible({ timeout: 20_000 });
      const raw = await payload.textContent();
      expect(JSON.parse(raw ?? '').Name, '[REQ-65] the raw inspect payload is not the daemon’s own').toBe(`/${name}`);

      // REQ-60's rule, as this panel applies it: a section is drawn only when it holds something.
      const sections = await detail.locator('.ui-collapsible-section').evaluateAll((elements) =>
        elements.map((element) => ({
          title: (element.querySelector('.ui-collapsible-section__title')?.textContent ?? '').trim(),
          summary: (element.querySelector('.ui-collapsible-section__summary')?.textContent ?? '').trim(),
        })),
      );
      console.log(`[REQ-65] panel sections: ${JSON.stringify(sections)}`);

      expect(
        sections.filter((section) => section.summary === '0'),
        '[REQ-65] a section headed with a count of `0` is drawn',
      ).toEqual([]);
      // The fixture declares its ownership labels, so the section that has content is still drawn,
      // headed by its own count.
      const labels = sections.find((section) => section.title === 'Labels');
      expect(labels, '[REQ-65] the Labels section is missing from a container that declares labels').toBeDefined();
      expect(Number(labels!.summary), '[REQ-65] the section that has content lost its count').toBeGreaterThan(0);
    } finally {
      await removeContainerQuietly(name);
    }
  });
});
