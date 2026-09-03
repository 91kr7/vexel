/**
 * The batch's acceptance scenarios, driven through the browser: the header names **which** side is
 * unreachable, keeps its retry, stays legible at every supported width, and the screen the operator
 * is on fills again when the connection returns
 * (plan-docker_management_app-inline_error_panels/REQ-9, /REQ-10, /REQ-11, /REQ-12).
 *
 * The two states are arranged differently because they are different failures:
 *
 * - **the server gone** — the live channel is severed in the browser, so the operator's daemon is
 *   neither stopped nor touched (`CLAUDE.md`);
 * - **the daemon gone** — the server is asked to use a Docker context whose endpoint is a socket
 *   that does not exist, so the application server keeps answering while its probe of the daemon
 *   fails. The operator's own active context is restored either way, through the same endpoint the
 *   application uses, so the server is left pointing at the daemon it was pointing at.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/** A socket no daemon listens on: the server answers, the daemon does not. */
const DEAD_ENDPOINT = 'unix:///var/run/vexel-e2e-no-such-daemon.sock';

/** The widths the report is held to, the phone breakpoint included (…/REQ-10). */
const WIDTHS = [320, 360, 375, 390, 600, 768, 1024, 1440, 1920];

/** Three screens the report must be on, reached by pinning each rather than through the rail. */
const SCREENS = ['dashboard', 'containers', 'images-layers'];

function header(page: Page): Locator {
  return page.locator('header.ui-page-header');
}

/** The header's connection report. */
function pill(page: Page): Locator {
  return header(page).locator('.ui-status-pill');
}

async function currentContextName(): Promise<string> {
  const { stdout } = await execFileAsync('docker', ['context', 'show']);
  return stdout.trim();
}

/**
 * Points the server at a daemon that is not there, through the application's own endpoint, so the
 * endpoint it resolved is published with the switch instead of being left behind a `docker context
 * use` typed beside it.
 */
async function useContext(page: Page, name: string): Promise<void> {
  const response = await page.request.post(`/api/contexts/${name}/use`);
  expect(response.ok(), `the server refused to use the context ${name}: ${response.status()}`).toBe(true);
}

// Scenario: the application server is the one that is gone (…/REQ-9, /REQ-11)
test('reads "Server unreachable" while the application server is not answering', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route('**/api/live', (route) => route.abort());

  await openApp(page, 'containers');

  await expect(pill(page), 'the header did not name the server that stopped answering').toContainText('Server unreachable', {
    timeout: 30_000,
  });
  await expect(pill(page), 'the header named the daemon for a server that stopped answering').not.toContainText(
    'Docker daemon unreachable',
  );
  await expect(header(page).getByRole('button', { name: 'Retry' }), 'the report lost its retry').toBeVisible();
});

// Scenario: the header names what is unreachable (…/REQ-9, /REQ-11)
test('reads "Docker daemon unreachable" while the server answers and the daemon does not', async ({ page }) => {
  test.setTimeout(180_000);
  const name = `vexel-e2e-dead-daemon-${Date.now()}`;
  const operatorContext = await currentContextName();
  try {
    await execFileAsync('docker', ['context', 'create', name, '--docker', `host=${DEAD_ENDPOINT}`]);
    await openApp(page, 'containers');
    await expect(pill(page), 'the application did not start on a daemon it could reach').toContainText('Live · daemon events', {
      timeout: 30_000,
    });

    await useContext(page, name);

    await expect(pill(page), 'the header did not name the daemon it cannot reach').toContainText('Docker daemon unreachable', {
      timeout: 60_000,
    });
    await expect(pill(page), 'the header named the server, which is answering').not.toContainText('Server unreachable');
    await expect(header(page).getByRole('button', { name: 'Retry' }), 'the report lost its retry').toBeVisible();

    // The other half of the statement, stated rather than assumed: the application server is
    // answering all the while, which is what makes this the daemon's failure and not its own.
    const answered = await page.request.get('/api/contexts');
    expect(answered.ok(), `the application server stopped answering too: ${answered.status()}`).toBe(true);
  } finally {
    await page.request.post(`/api/contexts/${operatorContext}/use`).catch(() => undefined);
    await execFileAsync('docker', ['context', 'use', operatorContext]).catch(() => undefined);
    await execFileAsync('docker', ['context', 'rm', '-f', name]).catch(() => undefined);
  }
});

// Scenario: the report is visible on a phone-width window (…/REQ-10)
test('shows the report in full on every screen and at every supported width', async ({ page }) => {
  test.setTimeout(300_000);
  const name = `vexel-e2e-report-width-${Date.now()}`;
  const operatorContext = await currentContextName();
  try {
    // The longest of the three wordings, so a width that holds this one holds the others.
    await execFileAsync('docker', ['context', 'create', name, '--docker', `host=${DEAD_ENDPOINT}`]);
    await openApp(page, 'containers');
    await useContext(page, name);
    await expect(pill(page)).toContainText('Docker daemon unreachable', { timeout: 60_000 });

    const measured: string[] = [];
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 812 });
      await expect(pill(page), `@${width}px: the report is not on screen`).toBeVisible();
      await expect(pill(page), `@${width}px: the report does not name the daemon`).toContainText('Docker daemon unreachable');

      const metrics = await pill(page).evaluate((element) => ({
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      const box = (await pill(page).boundingBox())!;
      measured.push(
        `@${width}px pill ${Math.round(box.width)}×${Math.round(box.height)} at (${Math.round(box.x)}, ${Math.round(box.y)})`,
      );

      // Nothing clipped: what the pill would need to draw is what it draws.
      expect(
        metrics.scrollWidth,
        `@${width}px: the report is cut, needing ${metrics.scrollWidth}px inside ${metrics.clientWidth}px`,
      ).toBeLessThanOrEqual(metrics.clientWidth + 1);
      // And nothing pushed out of the window: the report is not reachable by scrolling sideways.
      expect(
        metrics.documentScrollWidth,
        `@${width}px: the page scrolls sideways, ${metrics.documentScrollWidth}px against a ${metrics.viewportWidth}px window`,
      ).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      expect(box.x, `@${width}px: the report starts left of the window`).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width, `@${width}px: the report ends past the right edge of the window`).toBeLessThanOrEqual(width + 1);
    }
    console.log(`[REQ-10] ${measured.join('\n[REQ-10] ')}`);

    // On every screen, at the phone breakpoint: each screen is pinned rather than reached through
    // the rail, which is an off-canvas drawer at this width.
    await page.setViewportSize({ width: 375, height: 812 });
    for (const screen of SCREENS) {
      await openApp(page, screen);
      await expect(pill(page), `@375px on ${screen}: the report is not on screen`).toContainText('Docker daemon unreachable', {
        timeout: 30_000,
      });
      const box = (await pill(page).boundingBox())!;
      expect(box.x + box.width, `@375px on ${screen}: the report ends past the right edge of the window`).toBeLessThanOrEqual(376);
    }
  } finally {
    await page.request.post(`/api/contexts/${operatorContext}/use`).catch(() => undefined);
    await execFileAsync('docker', ['context', 'use', operatorContext]).catch(() => undefined);
    await execFileAsync('docker', ['context', 'rm', '-f', name]).catch(() => undefined);
  }
});

/**
 * The live channel, driven through its three states from the browser: it answers and ends (the
 * start-up every mounted view has just read for), it is refused (the connection is down), and it is
 * let through to the server (the connection is back).
 *
 * An established stream cannot be severed from the test — `context.setOffline` leaves one already
 * open running — so the channel is answered with a stream that ends at once. What the browser sees
 * is what it would see of a server that answered and then stopped: an open, then the end of it, and
 * a reconnection every three seconds.
 */
type ChannelPhase = 'answer-then-end' | 'refuse' | 'pass';

async function controlTheChannel(page: Page): Promise<(phase: ChannelPhase) => void> {
  let phase: ChannelPhase = 'answer-then-end';
  await page.route('**/api/live', async (route) => {
    if (phase === 'refuse') {
      await route.abort();
      return;
    }
    if (phase === 'pass') {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }, body: ':\n\n' });
  });
  return (next) => {
    phase = next;
  };
}

// Scenario: the screen fills again when the connection returns (…/REQ-12)
test('reads the screen the operator is on again when the connection returns', async ({ page }) => {
  test.setTimeout(180_000);
  const command = `docker version --vexel-e2e-returned-${Date.now()}`;
  const channel = await controlTheChannel(page);

  // The console history is read by request and never carried by the channel, so what puts it back
  // on screen is the reload a returning connection raises and nothing else.
  const historyRead = page.waitForResponse(
    (response) => response.url().includes('/api/console/history') && response.request().method() === 'GET',
  );
  await openApp(page, 'raw-console');
  await historyRead;
  await expect(page.getByRole('heading', { name: 'Raw command & API console' })).toBeVisible({ timeout: 30_000 });

  channel('refuse');
  await expect(pill(page), 'the connection never went down').toContainText('Server unreachable', { timeout: 60_000 });

  // Written after the screen read the history: only a second read can put it on screen.
  const appended = await page.request.post('/api/console/history', { data: { channel: 'cli', command, status: 'exit 0' } });
  expect(appended.ok(), `the history entry could not be written: ${appended.status()}`).toBe(true);
  await expect(page.getByText(command), 'the screen read the history again with the connection still down').toHaveCount(0);

  channel('pass');

  await expect(page.getByText(command), 'the screen did not read its data again when the connection returned').toBeVisible({
    timeout: 60_000,
  });
  await expect(pill(page), 'the connection never came back').toContainText('Live · daemon events', { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Raw command & API console' }), 'the operator was moved off the screen').toBeVisible();
});
