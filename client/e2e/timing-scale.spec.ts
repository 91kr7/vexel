import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/**
 * **The browser runs on the clock the serving process was configured with**
 * (plan-docker_management_app-timing_scale/REQ-8, REQ-10, REQ-18;
 * `timing-scale/specs/client-timing-scale.md`,
 * `timing-scale/specs/suite-timing-configuration.md`).
 *
 * The factor is the one thing a spec of this suite may name: `0.2` is what
 * `playwright.config.ts` starts the web server at, and these cases exist to check
 * that the number reaches the browser. No other figure here is scaled by hand —
 * the budgets below are the *shipped* intervals, which is exactly what makes a
 * page still running at factor 1 fail them.
 *
 * The cadence is measured on the connectivity poll, and not on a list's: it is
 * declared at 5 s, it is mounted on every screen, and no daemon event drives it,
 * so the intervals observed are the interval itself and nothing else.
 */

/** What `playwright.config.ts` starts the web server at (REQ-18). */
const SUITE_SCALE = 0.2;

/** The connectivity poll as the client declares it, unscaled (ConnectionStatusService). */
const SHIPPED_CONNECTIVITY_POLL_MS = 5_000;
/** The container list poll as the client declares it, unscaled (use-containers). */
const SHIPPED_LIST_POLL_MS = 3_000;
/**
 * What "well inside the shipped interval" is worth here. On the shipped clock the
 * change costs the server's grouping window (750 ms) plus up to a whole list poll
 * (3000 ms); on the suite's it costs a fifth of each. The budget sits below one
 * shipped poll, so a page running at factor 1 cannot meet it except by luck.
 */
const VISIBLE_WITHIN_MS = 2_500;

const BASE_IMAGE = 'alpine:3.20';

function containerCard(page: Page, name: string): Locator {
  return page.locator('.ui-frame__content .ui-grid--cards > .ui-surface').filter({ hasText: name });
}

// REQ-7, REQ-18 — the browser's only source for the factor answers the one the
// suite started the process with.
test('the serving process tells the browser which clock it is on', async ({ page }) => {
  await openApp(page, 'containers');

  const response = await page.request.get('/api/timing-scale');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ scale: SUITE_SCALE });
});

// REQ-8, REQ-10 — the polls the page makes run at their declared value times the
// factor, and the *first* interval already does: a factor adopted after the
// application's modules were imported would leave every cadence at its shipped
// value, so a first gap of 5 s is the shape that failure takes.
test('the browser polls on the configured clock, from its first interval', async ({ page }) => {
  await openApp(page, 'containers');

  const stamps: number[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/connectivity/status') stamps.push(Date.now());
  });
  // One clean load with the listener already attached, so the first interval the
  // page ever runs is among the ones measured.
  await page.goto('/');

  // Five polls at the scaled interval (1000 ms) take about 4 s; at the shipped
  // one they would take 20 s, and this expectation is what reports that.
  await expect
    .poll(() => stamps.length, { timeout: 8_000, message: 'the connectivity poll never reached five requests in 8 s' })
    .toBeGreaterThanOrEqual(5);

  const gaps = stamps.slice(1).map((stamp, index) => stamp - stamps[index]);
  const scaled = SHIPPED_CONNECTIVITY_POLL_MS * SUITE_SCALE;
  expect(gaps[0], `the first interval was ${gaps[0]} ms; the scaled one is ${scaled} ms`).toBeLessThan(SHIPPED_CONNECTIVITY_POLL_MS / 2);
  expect(Math.max(...gaps), `the intervals were ${gaps.join(', ')} ms; the scaled one is ${scaled} ms`).toBeLessThan(SHIPPED_CONNECTIVITY_POLL_MS / 2);
});

// REQ-10 seen from the operator's side: a change made outside the interface is on
// screen well inside the interval the shipped clock would take to poll for it.
// The event stream can carry this one too, so what isolates the poll's own rhythm
// is the case above; what this one adds is the observable the acceptance scenario
// is written on.
test('a change made outside the interface reaches the list well inside the shipped interval', async ({ page }) => {
  // 60s = 30 + 2.5 + 27.5: the screen opening (`openApp`, 30s), what the case
  // itself measures (VISIBLE_WITHIN_MS), and the fixture — created through the
  // CLI after the screen is up, and removed in the `finally`.
  test.setTimeout(60_000);
  const name = `vexel-e2e-timing-scale-${Date.now()}`;
  try {
    await openApp(page, 'containers');
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    // Nothing of this fixture exists yet, so the card cannot be on screen for any
    // reason other than the change made below.
    await expect(containerCard(page, name)).toHaveCount(0);

    await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sleep', BASE_IMAGE, '300']);
    const startedAt = Date.now();

    await expect(containerCard(page, name)).toBeVisible({ timeout: VISIBLE_WITHIN_MS });
    const elapsed = Date.now() - startedAt;
    expect(elapsed, `the new container took ${elapsed} ms to reach the list; one shipped poll is ${SHIPPED_LIST_POLL_MS} ms`).toBeLessThan(VISIBLE_WITHIN_MS);
  } finally {
    await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
  }
});
