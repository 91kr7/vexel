import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { refreshControl, refreshThroughTheControl } from './support/refresh-control.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImages, localBuilderDriverArgs } from '../../server/test/support/base-images.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/**
 * Every listing the server holds reaches its screen on the live channel
 * (plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-23,
 * REQ-24, REQ-25, REQ-33, REQ-34, REQ-39).
 *
 * These are the batch's own acceptance scenarios, in the browser:
 *
 * - every screen follows the host **with nothing pressed** — an object created
 *   or removed from a terminal appears or disappears on its own;
 * - the result of the operator's own action is on screen as soon as the action
 *   reports success;
 * - the manual refresh control still reloads everything and still reports, and
 *   it does not park for ever on a channel that is not delivering;
 * - a context switch shows the daemon now in use.
 *
 * The half that makes the first claim mean anything is the **request counter**:
 * a screen that quietly kept a list endpoint would pass every visible assertion
 * here. So each case that says "with nothing pressed" also says "and the
 * interface asked for no listing", read off the wire.
 *
 * The container listing is not in here: it moved to the channel one batch
 * earlier and is driven by `live-channel.spec.ts`.
 */

const RUN_ID = `${process.pid}-${Date.now()}`;

/** The list endpoints no screen may read any more (REQ-39). */
const LISTING_PATHS = [
  '/api/containers',
  '/api/images',
  '/api/volumes',
  '/api/networks',
  '/api/compose/projects',
  '/api/builders',
  '/api/builders/cache',
  '/api/contexts',
  '/api/registries',
  '/api/plugins',
];

/** Every listing read the page made, so "nothing was asked for" is a fact and not a hope. */
function watchListingReads(page: Page): { made: () => string[] } {
  const made: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (request.method() === 'GET' && LISTING_PATHS.includes(pathname)) made.push(pathname);
  });
  return { made: () => made };
}

function fixtureName(caseName: string): string {
  return `vexel-e2e-push-${caseName}-${RUN_ID}`;
}

/** A row of whichever object list is on screen, by the name it states. */
function row(page: Page, name: string): Locator {
  return page.locator('.ui-frame__content').locator('.ui-data-table__row', { hasText: name }).first();
}

async function removeQuietly(args: string[]): Promise<void> {
  await execFileAsync('docker', args).catch(() => undefined);
}

async function currentContextName(): Promise<string> {
  const { stdout } = await execFileAsync('docker', ['context', 'show']);
  return stdout.trim();
}

async function contextEndpoint(name: string): Promise<string> {
  const { stdout } = await execFileAsync('docker', ['context', 'inspect', name, '--format', '{{.Endpoints.docker.Host}}']);
  return stdout.trim();
}

/**
 * How long an object created outside the application may take to reach the
 * screen when a **daemon event** announces it: the server marks the kind due on
 * the event and the push follows its reading, with nothing of the browser's
 * added to it.
 */
const PUSH_BUDGET_MS = 30_000;

/** The reading periods the server declares for the kinds no daemon event announces, unscaled. */
const SHIPPED_PERIOD_MS = { contexts: 300_000, builders: 30_000 };

/**
 * What a change no daemon event announces costs: the server's own reading period
 * on the clock **this process was configured with**, plus slack for the reading
 * and the push.
 *
 * The factor is asked of the running server — `/api/timing-scale`, the same
 * source the browser reads it from — rather than written here, so this spec
 * writes no scaled figure of its own
 * (plan-docker_management_app-timing_scale/REQ-18) and the budget follows the
 * configuration wherever it is set.
 */
async function periodBudget(page: Page, shippedPeriodMs: number): Promise<number> {
  const { scale } = (await (await page.request.get('/api/timing-scale')).json()) as { scale: number };
  return Math.round(shippedPeriodMs * scale) + 20_000;
}

// REQ-33, REQ-39 — "the operator removes an image from a terminal, outside the application ... the
// row disappears from the list without the operator doing anything".
test('shows an image tagged outside the application, and drops it when it is untagged', async ({ page }) => {
  const reference = `${fixtureName('image')}:1`;
  const reads = watchListingReads(page);
  try {
    await ensureImages([ALPINE_IMAGE]);
    await openApp(page, 'images-layers');
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();

    await execFileAsync('docker', ['tag', ALPINE_IMAGE, reference]);
    await expect(row(page, reference)).toBeVisible({ timeout: PUSH_BUDGET_MS });

    await execFileAsync('docker', ['rmi', reference]);
    await expect(row(page, reference)).toHaveCount(0, { timeout: PUSH_BUDGET_MS });

    expect(reads.made(), 'the interface read a listing from a list endpoint').toEqual([]);
  } finally {
    await removeQuietly(['rmi', reference]);
  }
});

// REQ-33, REQ-39 — the two listings of the Volumes & networks screen, each following the host with
// the screen untouched.
test('shows a volume and a network created outside the application, with nothing pressed', async ({ page }) => {
  const volumeName = fixtureName('volume');
  const networkName = fixtureName('network');
  const reads = watchListingReads(page);
  try {
    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();

    await execFileAsync('docker', ['volume', 'create', ...ownershipArgs('push-volume'), volumeName]);
    await execFileAsync('docker', ['network', 'create', ...ownershipArgs('push-network'), networkName]);

    await expect(row(page, volumeName)).toBeVisible({ timeout: PUSH_BUDGET_MS });
    await expect(row(page, networkName)).toBeVisible({ timeout: PUSH_BUDGET_MS });

    await execFileAsync('docker', ['volume', 'rm', '-f', volumeName]);
    await expect(row(page, volumeName)).toHaveCount(0, { timeout: PUSH_BUDGET_MS });

    expect(reads.made(), 'the interface read a listing from a list endpoint').toEqual([]);
  } finally {
    await removeQuietly(['volume', 'rm', '-f', volumeName]);
    await removeQuietly(['network', 'rm', networkName]);
  }
});

// REQ-33, REQ-39 — a context is host-level configuration Docker publishes no event for, so this is
// the case that used to need the refresh control pressed. It now arrives on the server's own
// reading, with nothing pressed.
test('shows a context created outside the application, with nothing pressed', async ({ page }) => {
  test.setTimeout(180_000);
  const name = fixtureName('context');
  const reads = watchListingReads(page);
  try {
    await openApp(page, 'contexts');
    await expect(page.getByRole('heading', { level: 2, name: 'Docker contexts' })).toBeVisible();
    const budget = await periodBudget(page, SHIPPED_PERIOD_MS.contexts);

    await execFileAsync('docker', ['context', 'create', name, '--docker', `host=${await contextEndpoint(await currentContextName())}`]);

    await expect(row(page, name)).toBeVisible({ timeout: budget });
    expect(reads.made(), 'the interface read a listing from a list endpoint').toEqual([]);
  } finally {
    await removeQuietly(['context', 'rm', '-f', name]);
  }
});

// REQ-33, REQ-39 — the builder inventory, the other listing with no daemon event of its own.
test('shows a builder created outside the application, with nothing pressed', async ({ page }) => {
  test.setTimeout(120_000);
  const name = fixtureName('builder');
  const reads = watchListingReads(page);
  try {
    await openApp(page, 'builders-cache');
    await expect(page.getByRole('heading', { level: 1, name: 'Builders & cache' })).toBeVisible();
    const budget = await periodBudget(page, SHIPPED_PERIOD_MS.builders);

    // Booted from the run's own registry, on the host network: buildx contacts a registry on every
    // bootstrap, whatever the daemon already holds.
    await execFileAsync('docker', ['buildx', 'create', '--name', name, '--driver', 'docker-container', ...(await localBuilderDriverArgs())]);

    await expect(row(page, name)).toBeVisible({ timeout: budget });
    expect(reads.made(), 'the interface read a listing from a list endpoint').toEqual([]);
  } finally {
    await removeQuietly(['buildx', 'rm', name]);
  }
});

// REQ-25, REQ-34 — "the new volume is in the list as soon as the action reports success, as it is
// today": the result of the operator's own action arrives as the push the server's own operation
// caused, and the screen still asks for nothing.
test('lists a volume the operator creates through the dialog, as soon as the action succeeds', async ({ page }) => {
  const name = fixtureName('created');
  const reads = watchListingReads(page);
  try {
    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();

    await page.getByRole('button', { name: 'Create volume…' }).click();
    const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Create volume' }) });
    await dialog.getByRole('textbox', { name: 'Volume name' }).fill(name);
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(row(page, name)).toBeVisible({ timeout: 15_000 });
    expect(reads.made(), 'the interface re-read the listing after the action instead of waiting for the push').toEqual([]);
  } finally {
    await removeQuietly(['volume', 'rm', '-f', name]);
  }
});

// REQ-23, REQ-34 — "the control stays busy until the screen shows the reloaded data, and then
// reports the outcome as it does today", on a screen whose listing is one of the converted ones.
test('reloads everything through the refresh control, and reports it', async ({ page }) => {
  const name = fixtureName('refreshed');
  try {
    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();
    await execFileAsync('docker', ['volume', 'create', ...ownershipArgs('push-refreshed'), name]);

    await refreshThroughTheControl(page);

    // The press has ended, so the screen is already showing what the reload read.
    await expect(row(page, name)).toBeVisible();
    await expect(page.locator('.ui-toast__title', { hasText: 'Refreshed' })).toBeVisible();
  } finally {
    await removeQuietly(['volume', 'rm', '-f', name]);
  }
});

// The decision recorded in `batches.md` on 2026-09-02: the control awaits the channel's
// end-of-reload message, so on a channel that is not delivering it would stay busy for as long as
// the channel stayed down. It ends instead, and the interface shows the disconnected state it
// already has (REQ-11, REQ-18, REQ-23, REQ-34).
test('leaves the refresh control at rest when the channel is not delivering', async ({ page }) => {
  await page.route('**/api/live', (route) => route.abort());
  await openApp(page, 'volumes-networks');
  await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();

  // The state the interface already has for a connection that is down — no new element for it.
  await expect(page.getByText('Server unreachable').first()).toBeVisible({ timeout: 30_000 });

  await refreshThroughTheControl(page);

  await expect(refreshControl(page)).toBeEnabled();
  await expect(refreshControl(page)).not.toHaveAttribute('aria-busy', 'true');
});

// REQ-24 — "every screen shows the objects of the new daemon, and no object of the previous one is
// left on screen": the server discards what it holds, says so on the channel, and sends the new
// context's values. The fixture points at the daemon that was already active, so nothing outside
// this spec can notice, and the operator's own context is restored either way.
test('shows the new daemon on every screen after a context switch, asking for nothing', async ({ page }) => {
  test.setTimeout(180_000);
  const name = fixtureName('switch');
  const volumeName = fixtureName('switch-volume');
  const originalActive = await currentContextName();
  const endpoint = await contextEndpoint(originalActive);
  const kind = endpoint.startsWith('ssh://') ? 'ssh' : /^(tcp|http|https):\/\//.test(endpoint) ? 'tcp' : 'local';
  const reads = watchListingReads(page);
  try {
    await execFileAsync('docker', ['context', 'create', name, '--docker', `host=${endpoint}`]);
    await execFileAsync('docker', ['volume', 'create', ...ownershipArgs('push-switch-volume'), volumeName]);
    await openApp(page, 'contexts');
    await expect(page.getByRole('heading', { level: 2, name: 'Docker contexts' })).toBeVisible();
    await expect(row(page, name)).toBeVisible({ timeout: await periodBudget(page, SHIPPED_PERIOD_MS.contexts) });

    await row(page, name).getByRole('button', { name: 'Use', exact: true }).click();

    // The switch is confirmed, and the inventory that names the active context arrives again.
    await expect(page.getByText('Active context switched')).toBeVisible({ timeout: 20_000 });
    await expect(row(page, name).getByText('active', { exact: true })).toBeVisible({ timeout: PUSH_BUDGET_MS });
    await expect(page.getByRole('navigation')).toContainText(`${name} (${kind})`, { timeout: PUSH_BUDGET_MS });

    // Another screen, whose listing was discarded with the rest: it fills again from the channel.
    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();
    await expect(row(page, volumeName)).toBeVisible({ timeout: PUSH_BUDGET_MS });

    expect(reads.made(), 'a screen re-read a listing over the context switch').toEqual([]);
  } finally {
    await removeQuietly(['context', 'use', originalActive]);
    await removeQuietly(['context', 'rm', '-f', name]);
    await removeQuietly(['volume', 'rm', '-f', volumeName]);
  }
});
