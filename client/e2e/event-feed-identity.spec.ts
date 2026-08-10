import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

const RUN_ID = `${process.pid}-${Date.now()}`;

// The identity of an event, as the operator sees it (batch-event-feed-keys):
// two events on one container inside one second are two rows in the feed, each
// with its own action, and neither is lost when the feed re-renders.
//
// The daemon is the operator's own and emits events of its own the whole time,
// so nothing here counts rows or reads the feed as a whole: every assertion is
// about the events of a container this spec created and destroys.

function fixtureName(caseName: string): string {
  return `vexel-e2e-event-id-${caseName}-${RUN_ID}`;
}

function panel(page: Page, title: string): Locator {
  return page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: title }) });
}

/** The feed's lines mentioning one object, as the dashboard renders them. */
function feedLines(page: Page, actor: string): Locator {
  return panel(page, 'Daemon event stream').locator('.ui-event-stream__line').filter({ hasText: actor });
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** Moves to another screen through the navigation, without reloading the page. */
async function navigateTo(page: Page, label: string): Promise<void> {
  await page.getByRole('navigation').getByRole('button', { name: new RegExp(label) }).click();
}

async function openDashboard(page: Page): Promise<void> {
  // The last active screen survives by design (REQ-115): pin it rather than inherit it.
  await openApp(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(panel(page, 'Daemon event stream')).toBeVisible();
}

/**
 * Starts a container that stays up. `docker run` makes the daemon emit `create`
 * and `start` milliseconds apart — the pair inside one clock second the feed has
 * to tell apart.
 */
async function runSleepingContainer(caseName: string): Promise<string> {
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

// plan-docker_management_app/REQ-17, batch-event-feed-keys acceptance — two events on one container
// within the same second are two distinct rows, each with its own action
test('shows two events of one container in the same second as two rows, each with its own action', async ({ page }) => {
  await openDashboard(page);

  const name = await runSleepingContainer('two-rows');
  try {
    const rows = feedLines(page, name);
    await expect(rows.filter({ hasText: 'create' })).toHaveCount(1, { timeout: 15_000 });
    await expect(rows.filter({ hasText: 'start' })).toHaveCount(1, { timeout: 15_000 });

    // Further events re-render the feed: a row keyed against another one's is
    // where the reconciler drops or swaps a line, so both must still be there,
    // each still carrying its own action.
    await execFileAsync('docker', ['stop', '-t', '0', name]);
    await expect(rows.filter({ hasText: 'die' })).toHaveCount(1, { timeout: 15_000 });
    await expect(rows.filter({ hasText: 'create' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'start' })).toHaveCount(1);
  } finally {
    await removeContainerQuietly(name);
  }
});

// batch-event-feed-keys acceptance — no duplicate-key error in the console while the feed is live
test('logs no duplicate-key error while the feed takes events of one container in one second', async ({ page }) => {
  const duplicateKeyErrors: string[] = [];
  page.on('console', (message) => {
    if (/two children with the same key/i.test(message.text())) duplicateKeyErrors.push(message.text());
  });

  await openDashboard(page);

  const name = await runSleepingContainer('duplicate-key');
  try {
    await expect(feedLines(page, name).filter({ hasText: 'start' })).toHaveCount(1, { timeout: 15_000 });

    // A burst on one object: several actions inside one or two seconds, which is
    // exactly what a single second-resolution key could not separate.
    await execFileAsync('docker', ['stop', '-t', '0', name]);
    await execFileAsync('docker', ['start', name]);
    await execFileAsync('docker', ['stop', '-t', '0', name]);
    await expect(feedLines(page, name).filter({ hasText: 'die' })).toHaveCount(2, { timeout: 15_000 });

    // The shell's own feed reads the same provider: leaving the screen and
    // coming back remounts the list over the events already held.
    await navigateTo(page, 'About');
    await expect(page.locator('.ui-card__title', { hasText: 'Daemon event stream' })).toBeVisible();
    await navigateTo(page, 'Dashboard');
    await expect(feedLines(page, name).filter({ hasText: 'start' })).toHaveCount(2, { timeout: 15_000 });

    expect(duplicateKeyErrors).toEqual([]);
  } finally {
    await removeContainerQuietly(name);
  }
});
