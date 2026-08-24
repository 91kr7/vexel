import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { readOnceSettled } from './support/settled.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

const RUN_ID = `${process.pid}-${Date.now()}`;

// The Dashboard as an operator reads it (REQ-14 to REQ-18): the five summary
// tiles, the live container activity, the disk-usage breakdown, the daemon
// event feed, and where each tile and row leads.
//
// The daemon is the operator's own: nothing here asserts a host total, a count
// or an empty list. Every claim is either about a fixture this spec created and
// destroys, or about the shape of a reading.

/** A size as the interface writes one, e.g. "3.1MB" or "512B". */
const SIZE = /^\d+(\.\d+)?(B|KB|MB|GB|TB)$/;

function fixtureName(caseName: string): string {
  return `vexel-e2e-dashboard-${caseName}-${RUN_ID}`;
}

async function startContainer(caseName: string): Promise<string> {
  const name = fixtureName(caseName);
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(caseName),
    '--entrypoint',
    'sleep',
    'alpine:3.20',
    '300',
  ]);
  return name;
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

function panel(page: Page, title: string): Locator {
  return page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: title }) });
}

function tile(page: Page, label: string): Locator {
  return page.locator('.ui-metric-tile', { has: page.locator('.ui-metric-tile__label', { hasText: new RegExp(`^${label}$`) }) });
}

function tileValue(page: Page, label: string): Locator {
  return tile(page, label).locator('.ui-metric-tile__value');
}

function tileSubLabel(page: Page, label: string): Locator {
  return tile(page, label).locator('.ui-metric-tile__sub-label');
}

function usageRow(page: Page, label: string): Locator {
  return page.locator('.ui-usage-breakdown__row', {
    has: page.locator('.ui-usage-breakdown__label', { hasText: new RegExp(`^${label}$`) }),
  });
}

function activityRow(page: Page, name: string): Locator {
  return panel(page, 'Container activity').locator('.ui-data-table__row').filter({ hasText: name });
}

async function openDashboard(page: Page): Promise<void> {
  // The last active screen survives by design (REQ-115): pin it rather than inherit it.
  await openApp(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  // The tiles read "—" until the first overview settles.
  await expect(tileValue(page, 'Images')).not.toHaveText('—', { timeout: 30_000 });
}

/**
 * Brings a container's activity row into the mounted window.
 *
 * The activity list is virtualised, so a row far down the list is not in the
 * DOM until it is scrolled to — and how far down this spec's own container sits
 * depends on how many containers the operator is running.
 */
async function revealActivityRow(page: Page, name: string): Promise<Locator> {
  const row = activityRow(page, name);
  const scroller = panel(page, 'Container activity').locator('.ui-scroll-area');
  await expect
    .poll(
      async () => {
        if ((await row.count()) > 0) return true;
        await scroller.evaluate((node) => {
          node.scrollTop += 200;
        });
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return row;
}

// plan-docker_management_app/REQ-14, app-shell/specs/shell.md — with no persisted screen, the
// application lands on the Dashboard, and it is the real screen rather than a placeholder
test('the application lands on the Dashboard when no screen has been persisted', async ({ page }) => {
  await openApp(page, null);

  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Container activity' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Disk usage' })).toBeVisible();
});

// plan-docker_management_app/REQ-14 — the dashboard shows summary tiles for running containers
// (with the stopped/paused count), images, volumes, stacks and build cache
test('the dashboard summarises the host in five tiles, each with its own sub-reading', async ({ page }) => {
  await openDashboard(page);

  // The five tiles, in the order dashboard-screen.md fixes.
  await expect(page.locator('.ui-metric-tile__label')).toHaveText(['Running', 'Images', 'Volumes', 'Stacks', 'Build cache']);

  await expect(tileValue(page, 'Running')).toHaveText(/^\d+$/);
  await expect(tileSubLabel(page, 'Running')).toHaveText(/^\d+ stopped \/ paused$/);

  await expect(tileValue(page, 'Images')).toHaveText(/^\d+$/);
  await expect(tileSubLabel(page, 'Images')).toHaveText(/^\d+(\.\d+)?(B|KB|MB|GB|TB) on disk$/);

  await expect(tileValue(page, 'Volumes')).toHaveText(/^\d+$/);
  await expect(tileSubLabel(page, 'Volumes')).toHaveText(/^\d+(\.\d+)?(B|KB|MB|GB|TB) on disk$/);

  await expect(tileValue(page, 'Stacks')).toHaveText(/^\d+$/);
  await expect(tileSubLabel(page, 'Stacks')).toHaveText(/^\d+ compose · (\d+ swarm|no swarm)$/);

  // A host without buildx says so, with no size to show; otherwise the size and the active builder.
  const buildCacheSubLabel = (await tileSubLabel(page, 'Build cache').textContent()) ?? '';
  if (buildCacheSubLabel === 'buildx unavailable') {
    await expect(tileValue(page, 'Build cache')).toHaveText('—');
  } else {
    await expect(tileValue(page, 'Build cache')).toHaveText(SIZE);
    expect(buildCacheSubLabel).toMatch(/^buildx: .+$/);
  }
});

// plan-docker_management_app/REQ-14 — the tiles carry the daemon's real objects: a container this
// spec starts is part of what the "Running" tile counts
test('a container this spec starts is counted by the Running tile', async ({ page }) => {
  const name = await startContainer('counted');
  try {
    await openDashboard(page);

    await expect
      .poll(async () => Number((await tileValue(page, 'Running').textContent()) ?? '0'), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-15 — the dashboard lists current container activity with, per
// container, its state, CPU usage and uptime
test('the container activity names this spec container with its state, CPU and uptime', async ({ page }) => {
  const name = await startContainer('activity');
  try {
    await openDashboard(page);

    const row = await revealActivityRow(page, name);
    const cells = row.locator('.ui-data-table__cell');
    await expect(cells.nth(1)).toHaveText('running');
    // The daemon's own uptime text, with the leading "Up " dropped.
    await expect(cells.nth(3)).toHaveText(/.+/);
    await expect(cells.nth(3)).not.toHaveText(/^Up /);
    // The CPU is sampled shortly after the list is first read.
    await expect(cells.nth(2)).toHaveText(/^\d+% cpu$/, { timeout: 30_000 });
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-16 — the dashboard shows disk usage broken down by images,
// containers, volumes and build cache, each with its absolute size and its relative share
test('the disk usage is broken down by kind, each with its size and its share of the total', async ({ page }) => {
  await openDashboard(page);

  await expect(panel(page, 'Disk usage').locator('.ui-usage-breakdown__label')).toHaveText([
    'Images',
    'Containers',
    'Volumes',
    'Build cache',
  ]);

  for (const label of ['Images', 'Containers', 'Volumes', 'Build cache']) {
    const row = usageRow(page, label);
    // A size, or "unavailable" for a category the host could not report.
    await expect(row.locator('.ui-usage-breakdown__value')).toHaveText(/^(unavailable|\d+(\.\d+)?(B|KB|MB|GB|TB))$/);
    // The share is exposed as a meter named after the category.
    await expect(row.getByRole('meter', { name: label })).toHaveAttribute('aria-valuenow', /^\d+$/);
  }

  // The panel's description is the total the shares are drawn against.
  await expect(panel(page, 'Disk usage').locator('.ui-section-header__description')).toHaveText(
    /\d+(\.\d+)?(B|KB|MB|GB|TB)/,
  );
});

// plan-docker_management_app/REQ-17 — the dashboard shows the most recent daemon events in a live
// panel, without a manual refresh
test('a daemon change made by this spec appears in the dashboard event panel', async ({ page }) => {
  await openDashboard(page);

  const feed = panel(page, 'Daemon event stream');
  await expect(feed).toBeVisible();

  const networkName = `vexel-e2e-dashboard-net-${Date.now()}`;
  try {
    await execFileAsync('docker', ['network', 'create', ...ownershipArgs('dashboard-events'), networkName]);
    await expect(feed.getByText(networkName)).toBeVisible({ timeout: 15_000 });
  } finally {
    await execFileAsync('docker', ['network', 'rm', networkName]).catch(() => undefined);
  }
});

/**
 * The middle row's two cards, as boxes.
 *
 * A box and nothing else: a card dragged short, dragged tall or dragged off the
 * row keeps every child and every character it had, and what it loses is its
 * coordinates (CLAUDE.md, "What a check drives, and what it measures"). "The
 * two cards end at the same y" is a bottom edge, so a bottom edge is what is
 * read.
 */
/**
 * The middle row's two cards, **once the layout has come to rest**: they fill from a daemon read and
 * are compared with each other, so a reading taken while one of them is still arriving compares two
 * moments (`support/settled.ts`).
 */
async function measureMiddleRow(page: Page): Promise<{
  columnWidth: number;
  activity: Box | null;
  disk: Box | null;
}> {
  return await readOnceSettled(
    page,
    () => measureMiddleRowThisFrame(page),
    (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
  );
}

/** **One frame, and no test calls it**: the reader above is built out of it. */
async function measureMiddleRowThisFrame(page: Page): Promise<{
  columnWidth: number;
  activity: Box | null;
  disk: Box | null;
}> {
  return await page.evaluate(() => {
    const content = document.querySelector('.ui-frame__content') as HTMLElement;
    const style = getComputedStyle(content);
    const columnWidth = content.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    const cardOf = (title: string) => {
      const heading = [...content.querySelectorAll('.ui-section-header__title')].find(
        (node) => (node.textContent ?? '').trim() === title,
      );
      const card = heading?.closest('.ui-surface') ?? null;
      if (card === null) return null;
      const rect = card.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom };
    };
    return { columnWidth, activity: cardOf('Container activity'), disk: cardOf('Disk usage') };
  });
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  bottom: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// plan-ui-coherence-optimisation/REQ-66 — "Container activity and Disk usage measure the same height
// at 1440×1000 and 1280×800 — measured, not eyeballed"; dashboard-screen.md — "the two panels of that
// middle row end at the same y, whichever of them holds more"
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
]) {
  const at = `${viewport.width}×${viewport.height}`;

  test(`the middle row's two cards end at the same y at ${at}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openDashboard(page);

    const row = await measureMiddleRow(page);
    expect(row.activity, `${at}: the screen draws no Container activity card`).not.toBeNull();
    expect(row.disk, `${at}: the screen draws no Disk usage card`).not.toBeNull();
    console.log(
      `[REQ-66] ${at}: Container activity ${round(row.activity!.height)}px (y=${round(row.activity!.y)} → ${round(
        row.activity!.bottom,
      )}), Disk usage ${round(row.disk!.height)}px (y=${round(row.disk!.y)} → ${round(row.disk!.bottom)})`,
    );

    // One row to begin with: side by side, on one top edge.
    expect(round(row.disk!.y), `${at}: the two cards are not on one row`).toBe(round(row.activity!.y));
    expect(row.disk!.x, `${at}: the two cards are not side by side`).toBeGreaterThan(row.activity!.x);

    // …and one straight bottom edge, whichever of them holds more.
    expect(
      Math.abs(row.disk!.bottom - row.activity!.bottom),
      `${at}: the two cards end ${round(Math.abs(row.disk!.bottom - row.activity!.bottom))}px apart — ` +
        `Container activity ${round(row.activity!.height)}px against Disk usage ${round(row.disk!.height)}px`,
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(row.disk!.height - row.activity!.height), `${at}: the two cards do not measure the same height`).toBeLessThanOrEqual(1);
  });
}

// dashboard-layout.md — "Below the tablet breakpoint the two columns become one, primary first and
// secondary under it; stacked, each is its own height and the shared edge no longer applies", and
// the cell each panel fills is the content column's: a list too wide for it pans inside its own
// region (data-table.md) rather than widening the card that holds it.
test('below the breakpoint the two cards stack, each at the content column’s width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openDashboard(page);

  const row = await measureMiddleRow(page);
  expect(row.activity, 'the screen draws no Container activity card').not.toBeNull();
  expect(row.disk, 'the screen draws no Disk usage card').not.toBeNull();
  console.log(
    `[REQ-66] 375×812: content column ${round(row.columnWidth)}px — Container activity x=${round(row.activity!.x)} ` +
      `w=${round(row.activity!.width)} h=${round(row.activity!.height)}, Disk usage x=${round(row.disk!.x)} ` +
      `w=${round(row.disk!.width)} h=${round(row.disk!.height)}`,
  );

  expect(round(row.disk!.x), 'the two cards are not on one left edge').toBe(round(row.activity!.x));
  expect(row.disk!.y, 'the Disk usage card is not below the Container activity card').toBeGreaterThan(row.activity!.y);
  for (const [title, card] of [
    ['Container activity', row.activity!],
    ['Disk usage', row.disk!],
  ] as const) {
    expect(
      round(card.width),
      `the ${title} card is ${round(card.width)}px of a ${round(row.columnWidth)}px content column`,
    ).toBe(round(row.columnWidth));
  }
});

// plan-ui-coherence-optimisation/REQ-67 — "The two hues carry a legend naming what each means; no
// colour in the chart is unexplained"; usage-breakdown.md — "one entry per item, in the same order,
// each pairing that item's own color with its label"
test('the disk-usage chart carries a legend naming what each of its colours means', async ({ page }) => {
  await openDashboard(page);

  const chart = await page.evaluate(() => {
    const breakdown = document.querySelector('.ui-usage-breakdown') as HTMLElement;
    const paint = (element: Element | null) => {
      if (element === null) return null;
      const style = getComputedStyle(element);
      return `${style.backgroundColor} ${style.backgroundImage}`;
    };
    return {
      rows: [...breakdown.querySelectorAll('.ui-usage-breakdown__row')].map((row) => ({
        label: (row.querySelector('.ui-usage-breakdown__label')?.textContent ?? '').trim(),
        // What the row draws on its track: a bar, a zero mark, or nothing where nothing was measured.
        paint: paint(row.querySelector('[role="meter"]')?.firstElementChild ?? null),
      })),
      legend: [...breakdown.querySelectorAll('.ui-usage-breakdown__legend-item')].map((entry) => ({
        label: (entry.querySelector('.ui-usage-breakdown__legend-label')?.textContent ?? '').trim(),
        paint: paint(entry.querySelector('.ui-usage-breakdown__swatch')),
      })),
    };
  });
  console.log(`[REQ-67] rows ${JSON.stringify(chart.rows)} — legend ${JSON.stringify(chart.legend)}`);

  // One entry per category, in the order the rows are drawn, each naming its category.
  expect(chart.legend.map((entry) => entry.label), 'the legend does not name the categories the chart draws').toEqual(
    chart.rows.map((row) => row.label),
  );

  // …and paired with that category's own colour, so no hue in the chart is left unexplained.
  for (const [index, row] of chart.rows.entries()) {
    if (row.paint === null) continue; // a category the daemon could not report draws no colour at all
    expect(chart.legend[index]!.paint, `the ${row.label} legend entry is not drawn in that row's own colour`).toBe(row.paint);
  }
  expect(
    new Set(chart.legend.map((entry) => entry.paint)).size,
    'two categories of the legend are drawn in one colour, so the legend cannot say which is which',
  ).toBe(chart.legend.length);
});

/**
 * A disk-usage reading in which one category holds nothing and another could
 * not be read at all — the two states REQ-68 requires the reader to be able to
 * tell apart.
 *
 * Answered in the page rather than arranged on the daemon: neither state can be
 * produced on the operator's own host, and a category that happens to read `0B`
 * there is not a fixture this spec controls. Only `GET` is answered, so nothing
 * this stub covers can be mistaken for a mutation that did not happen.
 */
async function stubDiskUsage(page: Page): Promise<void> {
  await page.route('**/api/system/overview', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    await route.fulfill({
      json: {
        containers: { total: 3, running: 1, paused: 0, stopped: 2 },
        images: { count: 4, sizeBytes: 3_145_728 },
        volumes: { count: 0, sizeBytes: 0 },
        stacks: { compose: 0, swarm: 0, total: 0, swarmUnavailableDetail: 'This node is not a swarm manager' },
        buildCache: { sizeBytes: 0, unavailableDetail: 'buildx is not installed' },
        diskUsage: {
          categories: [
            { id: 'images', sizeBytes: 3_145_728, itemCount: 4 },
            { id: 'containers', sizeBytes: 1_048_576, itemCount: 3 },
            { id: 'volumes', sizeBytes: 0, itemCount: 0 },
            { id: 'build-cache', sizeBytes: 0, itemCount: 0, unavailableDetail: 'buildx is not installed' },
          ],
          totalBytes: 4_194_304,
        },
      },
    });
  });
}

// plan-ui-coherence-optimisation/REQ-68 — "A row whose value is 0B renders something that reads as
// zero … so that the reader can tell it from a row that was not measured"; usage-breakdown.md —
// "three distinguishable bar states"
test('a category holding nothing reads as zero, and not as a category nobody could read', async ({ page }) => {
  await stubDiskUsage(page);
  await openDashboard(page);

  const chart = await page.evaluate(() => {
    const breakdown = document.querySelector('.ui-usage-breakdown') as HTMLElement;
    return [...breakdown.querySelectorAll('.ui-usage-breakdown__row')].map((row) => {
      const meter = row.querySelector('[role="meter"]')!;
      const mark = meter.firstElementChild;
      const trackBox = meter.getBoundingClientRect();
      const markBox = mark?.getBoundingClientRect() ?? null;
      const style = getComputedStyle(meter);
      return {
        label: (row.querySelector('.ui-usage-breakdown__label')?.textContent ?? '').trim(),
        value: (row.querySelector('.ui-usage-breakdown__value')?.textContent ?? '').trim(),
        valueText: meter.getAttribute('aria-valuetext'),
        valueNow: meter.getAttribute('aria-valuenow'),
        track: { x: trackBox.x, width: trackBox.width, paint: `${style.backgroundColor} ${style.backgroundImage}` },
        mark:
          markBox === null
            ? null
            : {
                x: markBox.x,
                width: markBox.width,
                height: markBox.height,
                paint: (() => {
                  const markStyle = getComputedStyle(mark!);
                  return `${markStyle.backgroundColor} ${markStyle.backgroundImage}`;
                })(),
              },
      };
    });
  });
  console.log(`[REQ-68] ${JSON.stringify(chart)}`);

  const rowNamed = (label: string) => chart.find((row) => row.label === label)!;
  const images = rowNamed('Images');
  const empty = rowNamed('Volumes');
  const unmeasured = rowNamed('Build cache');

  // The category holding nothing reads 0B…
  expect(empty.value, 'the empty category does not read 0B').toBe('0B');
  // …and draws something: a mark at the track's origin, in its own colour, with a length of its own.
  expect(empty.mark, 'the 0B category draws nothing at all on its track (REQ-68)').not.toBeNull();
  expect(empty.mark!.width, 'the 0B category draws a bar of width 0, which is the picture REQ-68 refuses').toBeGreaterThan(0);
  expect(empty.mark!.height, 'the 0B mark has no height').toBeGreaterThan(0);
  expect(Math.abs(empty.mark!.x - empty.track.x), "the 0B mark is not drawn at the track's origin").toBeLessThanOrEqual(1);
  expect(empty.mark!.width, 'the 0B mark is as long as a bar, so it does not read as zero').toBeLessThan(empty.track.width / 2);

  // The category nobody could read draws no mark at all, on a track of its own treatment.
  expect(unmeasured.value, 'the unreadable category does not say so in place of its size').toBe('unavailable');
  expect(unmeasured.mark, 'the unreadable category draws a mark, so it cannot be told from a measured zero').toBeNull();
  expect(unmeasured.track.paint, "the unreadable category's track is drawn exactly as a measured one's").not.toBe(empty.track.paint);
  expect(unmeasured.valueText, "the unreadable row's meter does not announce the reading it was given").toBe('unavailable');
  expect(unmeasured.valueNow, "the unreadable row's meter announces a share it does not have").toBe('0');

  // Three states, three pictures — the whole of REQ-68.
  const pictures = [images, empty, unmeasured].map((row) => `${row.track.paint} > ${row.mark?.paint ?? 'nothing'} @ ${round(row.mark?.width ?? 0)}px`);
  expect(new Set(pictures).size, `two of the three states draw the same picture: ${pictures.join(' | ')}`).toBe(3);
});

// plan-docker_management_app/REQ-18 — activating a tile navigates to the screen that owns the object
// it names
test.describe('activating a tile leads to the screen owning what it counts', () => {
  const destinations: [string, string][] = [
    ['Running containers — open the Containers screen', 'Containers'],
    ['Images — open the Images & layers screen', 'Images & layers'],
    ['Volumes — open the Volumes & networks screen', 'Volumes & networks'],
    ['Stacks — open the Compose screen', 'Compose'],
    ['Build cache — open the Builders & cache screen', 'Builders & cache'],
  ];

  for (const [tileName, destination] of destinations) {
    test(`the tile "${tileName}" opens ${destination}`, async ({ page }) => {
      await openDashboard(page);

      await page.getByRole('button', { name: tileName }).click();

      await expect(page.getByRole('heading', { level: 1, name: destination })).toBeVisible();
    });
  }
});

// plan-docker_management_app/REQ-18 — a listed item leads to the screen that owns it, too
test('activating a disk-usage row opens the screen owning that category', async ({ page }) => {
  await openDashboard(page);

  await usageRow(page, 'Volumes').click();

  await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();
});

// plan-docker_management_app/REQ-18 — "activating a container-activity row → navigates to the
// Containers screen"
test('activating a container-activity row opens the Containers screen', async ({ page }) => {
  const name = await startContainer('navigate');
  try {
    await openDashboard(page);

    const row = await revealActivityRow(page, name);
    await row.click();

    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  } finally {
    await removeContainerQuietly(name);
  }
});
