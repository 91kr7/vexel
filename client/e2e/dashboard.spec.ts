import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
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
