import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { containerCard, containerDetail, detailControl } from './support/container-cards.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { boxOf } from './support/settled.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/**
 * The one connection a window opens, driven through the browser
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-1,
 * REQ-8, REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-16, REQ-17,
 * REQ-35, REQ-39, REQ-40).
 *
 * These are the batch's own acceptance scenarios: the list follows the host with
 * no clock in the browser, a lost connection is told and recovers on its own,
 * closing one window does not stop another, and a quiet minute leaves the
 * operator's screen where they left it.
 */

/** The suite runs the product on a fifth of its clock, so the demand would expire after 12s. */
const DEMAND_EXPIRY_MS = 12_000;

async function createSleepingContainer(name: string): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sleep', 'alpine:3.20', '300']);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

function searchField(page: Page) {
  return page.getByPlaceholder('Search name, image or state…');
}

/** Every request the page made to the path given, as an exact match on the pathname. */
function countRequests(page: Page, pathname: string): { total: () => number } {
  let total = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === pathname) total += 1;
  });
  return { total: () => total };
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115).
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// REQ-8, REQ-13 — "the operator starts a container from a terminal, outside the application ... the
// new container appears in the list without the operator doing anything", on a screen left open
// longer than the window in which the server's reading would have expired
test('shows a container started outside the application on a screen left untouched past the expiry window', async ({ page }) => {
  test.setTimeout(90_000);
  const name = `vexel-e2e-live-follows-${Date.now()}`;
  try {
    // Nothing is operated in here: the screen is simply left open.
    await page.waitForTimeout(DEMAND_EXPIRY_MS + 5_000);

    await createSleepingContainer(name);

    await expect(containerCard(page, name)).toBeVisible({ timeout: 30_000 });
    await expect(containerCard(page, name)).toContainText('RUNNING');
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-1 — "A window opens exactly one SSE channel to the server."
test('opens one channel for the window, and no second one', async ({ page }) => {
  const channels = countRequests(page, '/api/live');

  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  // Wide enough for a second connection raised on a timer or on a mount to have been made.
  await page.waitForTimeout(DEMAND_EXPIRY_MS);

  expect(channels.total(), 'the window opened more than one live channel').toBe(1);
});

// REQ-17, REQ-39 — "The browser holds no clock for a converted value", and the channel is the only
// source of the container listing in the client
test('asks the server for no container listing while the screen is open', async ({ page }) => {
  test.setTimeout(60_000);
  const listings = countRequests(page, '/api/containers');
  const name = `vexel-e2e-live-no-clock-${Date.now()}`;

  try {
    await openApp(page, 'containers');
    await createSleepingContainer(name);
    await expect(containerCard(page, name)).toBeVisible({ timeout: 30_000 });
    // Several periods of the listing the browser used to poll on.
    await page.waitForTimeout(DEMAND_EXPIRY_MS);

    expect(listings.total(), 'the browser asked the server for the container listing').toBe(0);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-40 — "A channel that opens before the server holds anything leaves the screen in the loading
// state it already has today ... No element is added for this case."
test('shows no failure on the screen while the first values are on their way', async ({ page }) => {
  await openApp(page, 'containers');

  // The screen either shows the loading state or the list; what it never shows is
  // a failure, which is what an operator opening the application would read as one.
  await expect(page.getByText('Could not load containers')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// REQ-12 — "A value sent again unchanged replaces nothing on screen. What the operator has opened,
// typed, selected or scrolled to stays as it was."
test('leaves what the operator typed and opened exactly where it was through a quiet minute', async ({ page }) => {
  test.setTimeout(120_000);
  const name = `vexel-e2e-live-quiet-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    await expect(containerCard(page, name)).toBeVisible({ timeout: 30_000 });

    await searchField(page).fill(name);
    await detailControl(page, name).click();
    const detail = containerDetail(page);
    await expect(detail).toBeVisible();
    const before = await boxOf(detail, 'the container detail dialog');

    // Nothing happens on the host, and nothing is operated in the browser.
    await page.waitForTimeout(60_000);

    // The surface's own coordinates, not its content: a dialog carried out of the
    // viewport keeps every character it had (CLAUDE.md, "what a check measures").
    await expect(detail).toBeVisible();
    expect(await boxOf(detail, 'the container detail dialog')).toEqual(before);
    await expect(searchField(page)).toHaveValue(name);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-9, REQ-10, REQ-11, REQ-35 — a lost connection is told with the indication the interface
// already has, and the screens are current again once it returns, with the operator doing nothing
test('tells the operator the connection is down, and is current again once it returns', async ({ page }) => {
  test.setTimeout(120_000);
  const name = `vexel-e2e-live-recovers-${Date.now()}`;
  try {
    await page.route('**/api/live', (route) => route.abort());
    await openApp(page, 'containers');

    // The indication the interface already has for a connection that is down, and
    // no element of its own for the channel (REQ-11, REQ-35).
    await expect(page.getByText('Daemon unreachable').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Retry' }).first()).toBeVisible();

    // Started while the connection is down: it must be on screen once it returns,
    // with the operator doing nothing (REQ-10).
    await createSleepingContainer(name);
    await page.unroute('**/api/live');

    await expect(containerCard(page, name)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Daemon unreachable')).toHaveCount(0);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-14, REQ-15, REQ-16 — "the operator closes one of them ... the other keeps following the host
// without the operator doing anything"
test('keeps the second window following the host when the first one is closed', async ({ page, context }) => {
  test.setTimeout(120_000);
  const name = `vexel-e2e-live-two-windows-${Date.now()}`;
  const second = await context.newPage();
  try {
    await openApp(second, 'containers');
    await expect(second.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();

    await page.close();
    await createSleepingContainer(name);

    await expect(containerCard(second, name)).toBeVisible({ timeout: 30_000 });
  } finally {
    await removeContainerQuietly(name);
    await second.close();
  }
});
