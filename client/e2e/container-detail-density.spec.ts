/**
 * F14 — the container's expanded detail stops fighting for room
 * (`plan-ui-coherence-optimisation/REQ-62` … `REQ-65`).
 *
 * Two measured defects, both inside an expanded row where room is scarcest: a logs toolbar of three
 * stacked rows, the third holding `Download` alone; and five metrics in a four-column grid, leaving
 * `PIDS` orphaned on a second row while two tiles carried a bar and three did not.
 *
 * **The stats half of that answer is superseded**, by name and deliberately, by
 * `plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-13` …
 * `REQ-17`: `plan-ui-coherence-optimisation/REQ-63` (five tiles on one row, one track per tile) and
 * `REQ-64` (all five built alike, each carrying a meter) no longer hold. REQ-63's own reason
 * survives and is answered differently — 2 + 3 orphans no metric either — and is asserted below
 * where REQ-63 used to be. What REQ-64 protected against, an absence that reads as a bar which
 * failed to render, survives too: a metric whose maximum is merely unknown still carries the
 * meter's unbounded state, and only a counter with no maximum in principle carries no bar at all.
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
import { readOnceSettled } from './support/settled.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { containerDetail, openContainerDetail } from './support/container-cards.js';

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

async function openTab(page: Page, name: string, tab: string): Promise<Locator> {
  await openContainerDetail(page, name);
  const detail = containerDetail(page);
  await expect(detail).toBeVisible();
  await detail.getByRole('tab', { name: tab }).click();
  return detail;
}

/**
 * The control's box and what a pointer aimed at its own centre reaches, **once it has stopped
 * moving**: a hit test at a point taken from a layout in flight answers about whatever was there
 * that frame (`support/settled.ts`). This file changes the viewport under an open panel, which is
 * the arrangement that produced the worst of these readings elsewhere.
 */
async function boxOf(name: string, locator: Locator): Promise<Box> {
  return await readOnceSettled(
    locator.page(),
    () => readTheBox(name, locator),
    (previous, current) =>
      Math.abs(previous.x - current.x) < 0.5 &&
      Math.abs(previous.y - current.y) < 0.5 &&
      Math.abs(previous.width - current.width) < 0.5 &&
      Math.abs(previous.height - current.height) < 0.5,
  );
}

async function readTheBox(name: string, locator: Locator): Promise<Box> {
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
      // it holds the download too. Since …tabs_composition_refactor/REQ-27 the two share that row as
      // the `Read` group, which is the composition this assertion now names.
      const rowMembers = await detail.locator('.ui-log-stream__actions').evaluate((row) => ({
        holdsSearch: row.querySelector('.ui-stream-search') !== null,
        groups: [...row.querySelectorAll('.ui-control-group__label')].map((label) => (label.textContent ?? '').trim()),
        searchGroup: row
          .querySelector('.ui-stream-search')
          ?.closest('.ui-control-group')
          ?.querySelector('.ui-control-group__label')?.textContent,
        buttons: [...row.querySelectorAll('button')].map((button) => (button.textContent ?? '').trim()),
      }));
      console.log(`[REQ-62] the stream's action row — ${JSON.stringify(rowMembers)}`);
      expect(rowMembers.holdsSearch, '[REQ-62] the search is not on the stream’s action row').toBe(true);
      expect(rowMembers.buttons, '[REQ-62] the download left the row the search is on').toContain('Download');
      expect(rowMembers.groups, '[REQ-27] the action row does not hold the two labelled groups').toEqual(['Fetch', 'Read']);
      expect(rowMembers.searchGroup, '[REQ-27] the search is not in the Read group').toBe('Read');
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

  // REQ-13 — "Stats is arranged as two groups instead of five equal tiles on one row: CPU and Memory
  // on a row of two, then Net I/O, Block I/O and PIDs on a row of three"; REQ-14 — "CPU and Memory
  // each keep a meter, filled in proportion to the ceiling each of them has"; REQ-15 — "Net I/O,
  // Block I/O and PIDs carry no meter at all — no bar, and no 'no measurable maximum' state of one".
  //
  // This is where `plan-ui-coherence-optimisation/REQ-63` ("the grid's column count and the metric
  // count agree … with no orphan") and `REQ-64` ("the tiles are uniform … a tile without a
  // measurable maximum does not merely look like a tile whose bar failed to render") used to be
  // asserted. Both are **superseded here by name**. REQ-63's reason is answered by the assertion
  // that no metric is left alone on a row and that a group's tracks are its own tiles; REQ-64's, by
  // the memory tile, which keeps its bar and would announce no measurable maximum had this
  // container been run without a limit.
  test('the stats tiles are two groups — two metrics with a ceiling, then three without', async ({ page }) => {
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
              // Not merely "no meter role": no part of the bar is drawn at all, so an absence
              // cannot come back as a track flattened to nothing.
              bars: element.querySelectorAll('.ui-meter, .ui-meter__track, .ui-meter__fill').length,
              // The sparkline's own slot, whichever of its two states it is in: the line it draws
              // from the second sample on, or the label it shows until then.
              sparklines: element.querySelectorAll('svg, .ui-sparkline__empty').length,
              meterHeight: meterRect?.height ?? 0,
              filled: Number(meter?.getAttribute('aria-valuenow') ?? Number.NaN),
              noMaximum: /no.*maximum/i.test(meter?.getAttribute('aria-valuetext') ?? ''),
            };
          }),
        );

        const rows = rowsOf(tiles);
        console.log(
          `[REQ-13] ${at} — ${tiles.length} tiles over ${rows.length} row(s): `
          + rows.map((row) => `[${row.map((tile) => tile.name).join(', ')}]`).join(' ')
          + ` widths ${tiles.map((tile) => Math.round(tile.width)).join('/')}`,
        );

        expect(tiles.map((tile) => tile.name), `[REQ-13] ${at}: the five metrics are not all drawn`).toEqual([
          'CPU',
          'Memory',
          'Net I/O',
          'Block I/O',
          'PIDs',
        ]);
        if (viewport.width > 720) {
          // Above the phone breakpoint: two rows, the metrics with a ceiling on the first.
          expect(
            rows.map((row) => row.map((tile) => tile.name)),
            `[REQ-13] ${at}: the tiles are not the two groups the metrics divide into`,
          ).toEqual([['CPU', 'Memory'], ['Net I/O', 'Block I/O', 'PIDs']]);
          // One track per tile **within its own group**: equal widths inside a row, and no metric
          // left alone on a row the others do not share (REQ-63's surviving reason).
          for (const row of rows) {
            const widths = row.map((tile) => Math.round(tile.width));
            expect(
              Math.max(...widths) - Math.min(...widths),
              `[REQ-13] ${at}: the tracks of [${row.map((tile) => tile.name).join(', ')}] are not equal`,
            ).toBeLessThanOrEqual(1);
            expect(row.length, `[REQ-13] ${at}: ${row[0]!.name} is alone on a row`).toBeGreaterThan(1);
          }
        } else {
          // Below it: one stacked column, exactly as the single row did (unchanged by this plan).
          expect(rows.length, `[REQ-13] ${at}: the tiles are not stacked at the phone breakpoint`).toBe(tiles.length);
          expect(new Set(tiles.map((tile) => Math.round(tile.x))).size, `[REQ-13] ${at}: the stacked tiles are not in one column`).toBe(1);
        }

        const named = new Map(tiles.map((tile) => [tile.name, tile]));
        // REQ-14 — the two metrics that have a ceiling keep a bar filled against it.
        for (const metric of ['CPU', 'Memory']) {
          const tile = named.get(metric)!;
          expect(tile.meters, `[REQ-14] ${at}: ${metric} carries no meter, or more than one`).toBe(1);
          expect(tile.noMaximum, `[REQ-14] ${at}: ${metric} announces no measurable maximum though it has one`).toBe(false);
          expect(tile.filled, `[REQ-14] ${at}: ${metric} is not filled against its ceiling`).toBeGreaterThanOrEqual(0);
          expect(tile.filled, `[REQ-14] ${at}: ${metric} is filled past its ceiling`).toBeLessThanOrEqual(100);
        }
        const meterHeights = ['CPU', 'Memory'].map((metric) => Math.round(named.get(metric)!.meterHeight));
        expect(
          Math.max(...meterHeights) - Math.min(...meterHeights),
          `[REQ-14] ${at}: the two bars are not the same height`,
        ).toBeLessThanOrEqual(1);

        // REQ-15 — the three counters carry no bar in any state, and each keeps its own line.
        for (const metric of ['Net I/O', 'Block I/O', 'PIDs']) {
          const tile = named.get(metric)!;
          expect(tile.meters, `[REQ-15] ${at}: ${metric} still carries a meter`).toBe(0);
          expect(tile.bars, `[REQ-15] ${at}: ${metric} still draws a bar, flattened or not`).toBe(0);
        }
        for (const tile of tiles) {
          expect(tile.sparklines, `[REQ-15] ${at}: ${tile.name} carries no sparkline, or more than one`).toBe(1);
        }
      }
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // REQ-16 — "A sparkline draws a filled area beneath its line and marks its final point, so the
  // current value is findable without reading the line."
  //
  // Measured, not counted: a third path in the markup says nothing about what is drawn where the
  // operator looks. The mark is found by geometry (the one shape that does not span the window),
  // located against the line's own last sample, and **hit-tested outward from its own centre** —
  // because the box a sparkline is stretched into is far wider than it is tall, and a mark that does
  // not resist that stretch is drawn as a flat smear rather than as a point.
  test('every sparkline marks its last sample, and the mark stays round however the line is stretched', async ({ page }) => {
    test.setTimeout(240_000);
    const name = `vexel-e2e-stats-mark-${Date.now()}`;
    try {
      await createBusyContainer(name);
      const detail = await openTab(page, name, 'Stats');
      await expect(detail.getByText(/Waiting for the first sample/i)).toHaveCount(0, { timeout: 30_000 });
      await expect
        .poll(async () => detail.locator('.ui-metric-tile svg').count(), {
          timeout: 40_000,
          message: 'expected every tile to have drawn its sparkline',
        })
        .toBe(5);

      const marks = await detail.locator('.ui-metric-tile').evaluateAll((elements) =>
        elements.map((element) => {
          const label = (element.querySelector('.ui-metric-tile__label')?.textContent ?? '').trim();
          const svg = element.querySelector('svg');
          if (!svg) return { name: label, drawn: false, filledArea: false, offBy: 0, stretch: 0, horizontal: 0, vertical: 0 };
          const box = svg.getBoundingClientRect();
          const view = svg.viewBox.baseVal;
          const shapes = [...svg.querySelectorAll('path, circle, rect, polyline, line')] as SVGGraphicsElement[];
          const spanning = Math.max(...shapes.map((shape) => shape.getBBox().width));
          // The line and the area beneath it span the whole window; whatever is drawn at one sample
          // does not, whichever shape carries it.
          const mark = shapes.find((shape) => shape.getBBox().width < spanning / 2);
          // The area the line is drawn over: the closed one, painted rather than stroked.
          const area = shapes.find((shape) => shape !== mark && /z/i.test(shape.getAttribute('d') ?? ''));
          // Of the two that do span it, the line is the open one: the area is closed back down to
          // the baseline, so its own last coordinate is a corner and not a sample.
          const line = shapes
            .filter((shape) => shape !== mark && shape.getBBox().width >= spanning / 2)
            .find((shape) => !/z/i.test(shape.getAttribute('d') ?? ''));
          if (!mark || !line) return { name: label, drawn: false, filledArea: false, offBy: 0, stretch: 0, horizontal: 0, vertical: 0 };

          // Where the last sample of the line falls, in the box the svg is actually drawn in.
          const points = [...(line.getAttribute('d') ?? '').matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)];
          const last = points[points.length - 1]!;
          const lastSample = {
            x: box.x + ((Number(last[1]) - view.x) / view.width) * box.width,
            y: box.y + ((Number(last[2]) - view.y) / view.height) * box.height,
          };

          const markBox = mark.getBoundingClientRect();
          const centre = { x: markBox.x + markBox.width / 2, y: markBox.y + markBox.height / 2 };
          // How far the mark actually paints around its own centre: the reading a count of elements
          // cannot give. Every point of a small grid is hit-tested, and the extent is taken from the
          // ones the mark itself answers — so a single probe landing on a box edge, which resolves
          // to whatever is behind, costs nothing. Only leftwards is scanned: the last sample sits on
          // the right edge of the box, and what is painted past it is outside the svg's own hit
          // area. The mark is symmetric, so half of it says how round it is.
          let horizontal = 0;
          let vertical = 0;
          for (let dx = 0; dx >= -6; dx -= 0.25) {
            for (let dy = -6; dy <= 6; dy += 0.25) {
              if (document.elementFromPoint(centre.x + dx, centre.y + dy) !== mark) continue;
              horizontal = Math.max(horizontal, Math.abs(dx));
              vertical = Math.max(vertical, Math.abs(dy));
            }
          }
          return {
            name: label,
            drawn: true,
            filledArea: area !== undefined && getComputedStyle(area).fill !== 'none',
            offBy: Math.hypot(centre.x - lastSample.x, centre.y - lastSample.y),
            stretch: box.width / box.height,
            horizontal,
            vertical,
          };
        }),
      );

      console.log(`[REQ-16] ${JSON.stringify(marks)}`);
      expect(marks.map((mark) => mark.name)).toEqual(['CPU', 'Memory', 'Net I/O', 'Block I/O', 'PIDs']);
      for (const mark of marks) {
        expect(mark.drawn, `[REQ-16] ${mark.name} draws nothing at the end of its line`).toBe(true);
        expect(mark.filledArea, `[REQ-16] ${mark.name} draws no filled area beneath its line`).toBe(true);
        expect(mark.offBy, `[REQ-16] ${mark.name} marks a point that is not its last sample`).toBeLessThanOrEqual(1.5);
        // The box is stretched wide and short, which is the whole difficulty.
        expect(mark.stretch, `[REQ-16] ${mark.name}'s line is not stretched, so this proves nothing`).toBeGreaterThan(2);
        expect(mark.horizontal, `[REQ-16] ${mark.name}'s mark paints nothing around its own centre`).toBeGreaterThan(0);
        expect(mark.vertical, `[REQ-16] ${mark.name}'s mark is flattened to a smear by the stretched box`).toBeGreaterThan(0);
        expect(
          Math.abs(mark.horizontal - mark.vertical) / Math.max(mark.horizontal, mark.vertical),
          `[REQ-16] ${mark.name}'s mark reaches ${mark.horizontal}px sideways and ${mark.vertical}px vertically: an ellipse, not a point`,
        ).toBeLessThanOrEqual(0.35);
      }
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // REQ-17 — "Net I/O shows its inbound and its outbound value as two separately labelled and
  // visually distinguished values, and Block I/O its read and its write value likewise; neither is
  // one `a / b` string in which the two differ only by position."
  test('Net I/O and Block I/O read as two labelled values told apart by their own treatment', async ({ page }) => {
    test.setTimeout(240_000);
    const name = `vexel-e2e-stats-readings-${Date.now()}`;
    try {
      await createBusyContainer(name);
      const detail = await openTab(page, name, 'Stats');
      await expect(detail.getByText(/Waiting for the first sample/i)).toHaveCount(0, { timeout: 30_000 });
      await expect(detail.locator('.ui-metric-tile')).toHaveCount(5, { timeout: 30_000 });

      const pairs = await detail.locator('.ui-metric-tile').evaluateAll((elements) =>
        elements.map((element) => {
          const value = element.querySelector('.ui-metric-tile__value');
          const readings = [...(value?.querySelectorAll('.ui-metric-reading') ?? [])].map((reading) => {
            const amount = reading.querySelector('.ui-metric-reading__value');
            const box = (amount ?? reading).getBoundingClientRect();
            return {
              text: (reading.textContent ?? '').trim(),
              colour: amount ? getComputedStyle(amount).color : '(none)',
              y: box.y,
              height: box.height,
            };
          });
          return {
            name: (element.querySelector('.ui-metric-tile__label')?.textContent ?? '').trim(),
            text: (value?.textContent ?? '').trim(),
            readings,
          };
        }),
      );

      console.log(`[REQ-17] ${JSON.stringify(pairs.map((tile) => ({ name: tile.name, readings: tile.readings })))}`);
      const named = new Map(pairs.map((tile) => [tile.name, tile]));
      for (const [metric, labels] of [['Net I/O', ['in', 'out']], ['Block I/O', ['read', 'written']]] as const) {
        const tile = named.get(metric)!;
        expect(tile.readings.length, `[REQ-17] ${metric} does not show two readings of its own`).toBe(2);
        for (const [index, label] of labels.entries()) {
          expect(tile.readings[index]!.text, `[REQ-17] ${metric}'s reading ${index + 1} is not labelled "${label}"`).toContain(label);
        }
        expect(
          tile.readings[0]!.colour,
          `[REQ-17] ${metric}'s two readings are drawn in one treatment, so only their position tells them apart`,
        ).not.toBe(tile.readings[1]!.colour);
        // On one baseline: the pair reads as one line, not as two stacked values.
        expect(
          Math.abs(tile.readings[0]!.y - tile.readings[1]!.y),
          `[REQ-17] ${metric}'s two readings are not on one baseline`,
        ).toBeLessThanOrEqual(1);
        expect(tile.text, `[REQ-17] ${metric} still reads as one a / b string`).not.toMatch(/\d\s*(B|KB|MB|GB|TB)\s*\/\s*\d/);
      }
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // detail_modal/REQ-19 — at 375×812 the detail stays usable: every tab reachable, no value clipped
  // to nothing, the terminal and the log views operable, and nothing requiring horizontal scrolling.
  // Every claim is a viewport box; the tabs are reached with a real pointer at their own coordinates.
  test('at 375×812 every tab is reachable inside the dialog, nothing is clipped and nothing scrolls sideways', async ({ page }) => {
    test.setTimeout(180_000);
    const name = `vexel-e2e-detail-phone-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      await page.setViewportSize(PHONE_VIEWPORT);
      const detail = await openTab(page, name, 'Logs');

      const dialog = await boxOf('the detail dialog', detail);
      console.log(`[REQ-19] the dialog at 375×812 is x=${dialog.x.toFixed(1)}, ${dialog.width.toFixed(1)}×${dialog.height.toFixed(1)}`);
      expect(dialog.x, 'the dialog starts left of the viewport').toBeGreaterThanOrEqual(-0.5);
      expect(dialog.x + dialog.width, 'the dialog runs off the right of the viewport').toBeLessThanOrEqual(PHONE_VIEWPORT.width + 0.5);
      expect(dialog.height, 'the dialog is taller than the viewport').toBeLessThanOrEqual(PHONE_VIEWPORT.height + 0.5);

      // The log view is operable: it draws the container's own lines, and the toolbar it carries is
      // reachable rather than merely present.
      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 30_000 });
      const stdout = await boxOf('the logs stdout filter', detail.getByRole('button', { name: 'stdout', exact: true }));
      expect(stdout.width, 'the logs toolbar is clipped to nothing').toBeGreaterThan(0);
      expect(stdout.hitsItself, 'a pointer aimed at the logs toolbar reaches something else').toBe(true);

      for (const tab of ['Stats', 'Processes', 'Inspect', 'Exec', 'Attach', 'Config', 'Logs']) {
        const control = detail.getByRole('tab', { name: tab, exact: true });
        await control.scrollIntoViewIfNeeded();
        const box = await boxOf(`the ${tab} tab`, control);
        expect(box.width, `[REQ-19] the ${tab} tab is clipped to nothing`).toBeGreaterThan(0);
        expect(box.hitsItself, `[REQ-19] a pointer aimed at the ${tab} tab reaches something else`).toBe(true);
        await control.click();
        await expect(control, `[REQ-19] the ${tab} tab did not take the click`).toHaveAttribute('aria-selected', 'true');

        // Whatever the tab draws, it draws something with a box, inside the dialog's own width.
        const overflow = await detail.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const widest = Array.from(element.querySelectorAll('*')).reduce((worst, child) => {
            const box = child.getBoundingClientRect();
            return box.width > 0 ? Math.max(worst, box.right) : worst;
          }, 0);
          return { right: rect.right, widest, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
        });
        expect(
          overflow.scrollWidth,
          `[REQ-19] the ${tab} tab scrolls sideways inside the dialog: ${overflow.scrollWidth} against ${overflow.clientWidth}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
      }

      // The terminal is drawn and reaches a pointer: the Exec tab's own host, not a stand-in.
      await detail.getByRole('tab', { name: 'Exec', exact: true }).click();
      const launch = await boxOf('the Exec launch action', detail.getByRole('button', { name: 'Launch session' }));
      expect(launch.width, 'the Exec launch action is clipped to nothing').toBeGreaterThan(0);
      expect(launch.hitsItself, 'a pointer aimed at the Exec launch action reaches something else').toBe(true);

      // And the page itself is not made to scroll sideways by any of it.
      const document_ = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        document_.scrollWidth,
        `[REQ-19] the page scrolls sideways at 375px: ${document_.scrollWidth} against ${document_.clientWidth}`,
      ).toBeLessThanOrEqual(document_.clientWidth + 1);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-ui-coherence-optimisation/REQ-65 — "The container detail panel is the primitive, with its
  // tabs (Config, Logs, Stats, Processes, Inspect, Exec, Attach — that order since
  // tabs_composition_refactor/REQ-11) and its two-column property grid
  // preserved, and with REQ-60 applied to its empty `Labels` section."
  test('the panel keeps its seven tabs, its raw payload and no section headed with a count of zero', async ({ page }) => {
    test.setTimeout(180_000);
    const name = `vexel-e2e-detail-panel-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openTab(page, name, 'Inspect');

      for (const tab of ['Config', 'Logs', 'Stats', 'Processes', 'Inspect', 'Exec', 'Attach']) {
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
