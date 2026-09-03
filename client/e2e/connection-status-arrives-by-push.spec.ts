import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { containerCard } from './support/container-cards.js';
import { clickAtItsCentre } from './support/settled.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/**
 * The batch's acceptance scenarios, driven through the browser
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-17,
 * REQ-18, REQ-19, REQ-20, REQ-38, REQ-39).
 *
 * The connection is severed at the boundary and never on the machine: the channel is aborted in the
 * browser, so the operator's daemon is neither stopped nor touched (`CLAUDE.md`).
 */

/** The connectivity poll as the browser used to declare it, unscaled: the period nothing runs on now. */
const REMOVED_POLL_MS = 5_000;

/** Three of those periods: a clock still running would have asked for the status by then. */
const OBSERVATION_MS = 15_000;

/** Anchored on an attempt just landed, and closed well inside the browser's own 3 s retry: an attempt in here is the press's. */
const PRESS_RECONNECT_MS = 2_000;

function header(page: Page): Locator {
  return page.locator('header.ui-page-header');
}

/** The top bar's refresh control, on whichever screen is active. */
function refreshControl(page: Page): Locator {
  return header(page).getByRole('button', { name: 'Refresh', exact: true });
}

async function createSleepingContainer(name: string): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sleep', 'alpine:3.20', '300']);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** Every request the page made to the path given, as an exact match on the pathname. */
function countRequests(page: Page, pathname: string): { total: () => number } {
  let total = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === pathname) total += 1;
  });
  return { total: () => total };
}

/** The live channel, refused until it is let through again, with every attempt recorded. */
async function refuseTheChannel(page: Page): Promise<{ attempts: () => number[]; letThrough: () => void }> {
  const attempts: number[] = [];
  let refusing = true;

  await page.route('**/api/live', async (route) => {
    attempts.push(Date.now());
    if (refusing) await route.abort();
    else await route.continue();
  });

  return {
    attempts: () => [...attempts],
    letThrough: () => {
      refusing = false;
    },
  };
}

// REQ-17, REQ-19, REQ-20, REQ-39 — "The browser stops asking for the connection status on a
// period", and what the header states is what the channel delivered.
test('states the negotiated Engine API version without ever asking the server for it', async ({ page }) => {
  test.setTimeout(60_000);
  const statusReads = countRequests(page, '/api/connectivity/status');

  await openApp(page, 'containers');
  await expect(header(page).getByText(/Engine API v\d+\.\d+/), 'the negotiated version never reached the header').toBeVisible({
    timeout: 30_000,
  });
  await expect(header(page).getByText('Live · daemon events')).toBeVisible();

  await page.waitForTimeout(OBSERVATION_MS);

  expect(
    statusReads.total(),
    `the browser asked the server for the connection status ${statusReads.total()} times over ${OBSERVATION_MS}ms; the removed poll ran every ${REMOVED_POLL_MS}ms`,
  ).toBe(0);
  await expect(header(page).getByText(/Engine API v\d+\.\d+/)).toBeVisible();
});

// REQ-11, REQ-19, REQ-35 — the daemon coming back is noticed with no clock in the browser: the
// application opens on a connection it cannot hold, states it, and states the versions instead as
// soon as the channel delivers, with the operator pressing nothing.
test('states the versions as soon as the channel delivers, with nothing pressed', async ({ page }) => {
  test.setTimeout(120_000);
  const channel = await refuseTheChannel(page);

  await openApp(page, 'containers');
  await expect(header(page).getByText('Daemon unreachable'), 'the connection that could not be held was not stated').toBeVisible({
    timeout: 30_000,
  });
  await expect(header(page).getByText(/Engine API v\d+\.\d+/)).toHaveCount(0);

  channel.letThrough();

  await expect(header(page).getByText(/Engine API v\d+\.\d+/), 'nothing was pressed and the versions never came back').toBeVisible({
    timeout: 60_000,
  });
  await expect(header(page).getByText('Live · daemon events')).toBeVisible();
});

// REQ-18, REQ-38 — the batch's second scenario: "the interface asks for the channel again, and the
// screens fill as soon as it delivers". The press is the one thing the operator can do about a
// connection that is down, and it is what this control does about it (refresh-control.md).
test('asks for the channel again when the refresh control is pressed on a connection that is down', async ({ page }) => {
  test.setTimeout(180_000);
  const name = `vexel-e2e-status-press-${Date.now()}`;
  const channel = await refuseTheChannel(page);

  try {
    await openApp(page, 'containers');
    await expect(header(page).getByText('Daemon unreachable')).toBeVisible({ timeout: 30_000 });
    // Created while the connection is down: it can only reach the screen once the channel does.
    await createSleepingContainer(name);

    await expect(containerCard(page, name)).toHaveCount(0);

    const anchor = channel.attempts().length;
    await expect
      .poll(() => channel.attempts().length, { timeout: 30_000, message: 'the browser stopped asking for the channel at all' })
      .toBeGreaterThan(anchor);
    const before = channel.attempts().length;

    const pressedAt = Date.now();
    await clickAtItsCentre(page, refreshControl(page), 'the refresh control');

    await expect
      .poll(() => channel.attempts().length, {
        timeout: PRESS_RECONNECT_MS,
        message: 'the press asked for nothing: no further channel was opened',
      })
      .toBeGreaterThan(before);
    const asked = channel.attempts().at(-1)!;
    expect(asked - pressedAt, 'the channel was asked for later than the press could account for').toBeLessThan(PRESS_RECONNECT_MS);

    await expect(refreshControl(page), 'the control stayed working on a channel that was down').not.toHaveAttribute(
      'aria-busy',
      'true',
      { timeout: 30_000 },
    );

    channel.letThrough();

    await expect(containerCard(page, name), 'the screen did not fill once the channel delivered').toBeVisible({ timeout: 60_000 });
    await expect(header(page).getByText('Daemon unreachable')).toHaveCount(0);
  } finally {
    await removeContainerQuietly(name);
  }
});
