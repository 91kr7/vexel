/**
 * **The Dashboard's overview figures move on a clock**
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-16, REQ-18, REQ-24;
 * `dashboard/specs/use-system-overview.md`).
 *
 * Two claims, and each has its own instrument.
 *
 * - **The figures follow the host with the operator doing nothing.** Read as a *change*, never as a
 *   total: the tile counts the whole host, which is the operator's own, so the check reads the
 *   figure, starts a container of its own and waits for that figure to have risen by one. No
 *   assertion is made on a number, and none on an empty daemon.
 * - **The declared period is the one that runs.** Counted at the wire: every `GET
 *   /api/system/overview` the page issues is timestamped, and the intervals between them are
 *   compared with the period the contract declares, scaled by the factor the suite starts the
 *   process at (`plan-docker_management_app-timing_scale/REQ-18`). A page reading faster or slower
 *   than the contract fails here.
 */
import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

/** The overview period as `use-system-overview.md` declares it, unscaled. */
const DECLARED_PERIOD_MS = 3_000;
/** What `playwright.config.ts` starts the web server at (plan-docker_management_app-timing_scale/REQ-18). */
const SUITE_SCALE = 0.2;
const PERIOD_ON_THE_SUITE_CLOCK_MS = DECLARED_PERIOD_MS * SUITE_SCALE;

/**
 * How long the tile is given to count a container this spec started. The server marks the container
 * listing due on the daemon's event and defers the read to the end of its grouping window (750 ms
 * unscaled), and the tile is then one overview period behind it (3 000 ms unscaled). 12s is four
 * times that sum on the shipped clock, so the budget holds at any factor and sits well inside the
 * test's own 30s.
 */
const FOLLOWS_THE_HOST_MS = 12_000;

function tileValue(page: Page, label: string) {
  return page
    .locator('.ui-metric-tile')
    .filter({ has: page.locator('.ui-metric-tile__label', { hasText: new RegExp(`^${label}$`) }) })
    .locator('.ui-metric-tile__value');
}

async function runningTileCount(page: Page): Promise<number> {
  const text = (await tileValue(page, 'Running').textContent()) ?? '';
  const count = Number(text.trim());
  expect(Number.isFinite(count), `the Running tile reads "${text}", which is not a count`).toBe(true);
  return count;
}

async function startContainer(name: string): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sleep', ALPINE_IMAGE, '300']);
}

async function removeContainerQuietly(name: string): Promise<void> {
  // `-v` and never a bare `-f`: an anonymous volume the daemon attached on its own behalf outlives
  // the container carrying no label of ours, invisible to any later sweep.
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

async function openDashboard(page: Page): Promise<void> {
  await openApp(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });
  await expect(tileValue(page, 'Running')).toHaveText(/^\d+$/, { timeout: 20_000 });
}

// REQ-16 — "The operator who leaves the Dashboard open sees them follow the host without asking."
test('the Running tile counts a container started while nobody touches the Dashboard', async ({ page }) => {
  const name = `vexel-e2e-overview-clock-${Date.now()}`;
  try {
    await openDashboard(page);
    const before = await runningTileCount(page);

    await startContainer(name);

    // Nothing is pressed and nothing is navigated between the two readings: the
    // only trigger left that can move this figure is the clock.
    await expect
      .poll(async () => runningTileCount(page), {
        timeout: FOLLOWS_THE_HOST_MS,
        message: 'the Running tile never counted the container this spec started: the overview figures are not on a clock',
      })
      .toBe(before + 1);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-18, REQ-24 — "The period is one figure, declared in one place, and is a cadence of the
// product: an automated pass runs it at the same factor it runs every other cadence at."
test('the overview is re-read at the declared cadence, neither faster nor slower', async ({ page }) => {
  const readings: number[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/system/overview') readings.push(Date.now());
  });

  await openDashboard(page);
  // Six periods of watching, which on the suite's clock is 3.6s: enough for five
  // intervals to be measured without approaching the test's own budget.
  readings.length = 0;
  await page.waitForTimeout(PERIOD_ON_THE_SUITE_CLOCK_MS * 6);

  expect(readings.length, `the page issued ${readings.length} overview reads in six periods: it is not reading on a clock at all`).toBeGreaterThanOrEqual(4);

  const intervals = readings.slice(1).map((at, index) => at - readings[index]);
  const average = intervals.reduce((total, interval) => total + interval, 0) / intervals.length;
  console.log(`[REQ-18] ${intervals.length} intervals between overview reads: ${intervals.join(', ')}ms (average ${Math.round(average)}ms)`);

  // Half a period either side: a page still running at factor 1 averages 3 000ms
  // and fails, and so does one reading twice as often as the contract declares.
  expect(
    average,
    `the overview is read every ${Math.round(average)}ms, and the contract declares ${PERIOD_ON_THE_SUITE_CLOCK_MS}ms on this pass's clock`,
  ).toBeGreaterThan(PERIOD_ON_THE_SUITE_CLOCK_MS / 2);
  expect(
    average,
    `the overview is read every ${Math.round(average)}ms, and the contract declares ${PERIOD_ON_THE_SUITE_CLOCK_MS}ms on this pass's clock`,
  ).toBeLessThan(PERIOD_ON_THE_SUITE_CLOCK_MS * 2);
});

// REQ-20 — "Nothing on the Dashboard says the figures are on a clock: no indicator, no 'last
// updated', no control, no setting. The figures change in place."
test('nothing on the Dashboard says its figures are on a clock', async ({ page }) => {
  await openDashboard(page);

  const text = (await page.locator('.ui-frame__content').innerText()).toLowerCase();
  for (const wording of ['last updated', 'auto-refresh', 'auto refresh', 'refreshing every', 'live update']) {
    expect(text.includes(wording), `the Dashboard states "${wording}", which REQ-20 forbids`).toBe(false);
  }
});
