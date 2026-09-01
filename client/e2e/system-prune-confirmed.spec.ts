import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

const RUN_ID = `${process.pid}-${Date.now()}`;

// The prunes of the System & prune screen act on every stopped container,
// unused volume and unused network of the host — the operator's own included:
// the daemon's prunes take no filter that could scope them. The file therefore
// lives apart and runs alone, like the per-area prune specs beside it.
//
// Acceptance is established on the fixtures this spec creates: they are gone
// after a run that named their category, and they survive one that did not.
// Nothing is asserted on host totals or on a category being empty.
test.describe.configure({ mode: 'serial' });

function fixtureName(caseName: string): string {
  return `vexel-e2e-system-${caseName}-${RUN_ID}`;
}

/** A container in the `created` state — what a prune of stopped containers acts on — that never runs. */
async function createStoppedContainer(caseName: string): Promise<{ id: string; name: string }> {
  const name = fixtureName(caseName);
  const { stdout } = await execFileAsync('docker', [
    'create',
    '--name',
    name,
    ...ownershipArgs(caseName),
    '--entrypoint',
    'sleep',
    'alpine:3.20',
    '300',
  ]);
  return { id: stdout.trim(), name };
}

async function createUnusedVolume(caseName: string): Promise<string> {
  const name = fixtureName(caseName);
  await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(caseName), name]);
  return name;
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

async function removeVolumeQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
}

async function containerExists(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync('docker', ['ps', '-aq', '--filter', `name=^${name}$`]).catch(() => ({ stdout: '' }));
  return stdout.trim().length > 0;
}

async function volumeExists(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync('docker', ['volume', 'ls', '-q', '--filter', `name=^${name}$`]).catch(() => ({ stdout: '' }));
  return stdout.trim().length > 0;
}

function reclaimPanel(page: Page) {
  return page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Reclaim disk space' }) });
}

function categoryRow(page: Page, title: string) {
  return reclaimPanel(page).locator('.ui-storage-usage-row').filter({ hasText: title });
}

function confirmDialog(page: Page) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: /^Confirm:/ }) });
}

interface PruneOutcome {
  categoryId: string;
  removed: string[];
  removedCount: number;
  reclaimedBytes: number;
  error?: string;
}

async function openSystemScreen(page: Page): Promise<void> {
  // The last active screen survives by design (REQ-115): pin it rather than inherit it.
  await openApp(page, 'system-prune');
  await expect(page.getByRole('heading', { level: 1, name: 'System & prune' })).toBeVisible();
  await expect(categoryRow(page, 'Stopped containers')).toBeVisible({ timeout: 30_000 });
}

const SIZE_PATTERN = /\d+(\.\d+)?\s*(B|KB|KiB|MB|MiB|GB|GiB|TB)/;

// plan-docker_management_app/REQ-96 — a category can be pruned on its own; the space actually
// reclaimed is reported and the breakdown refreshes
test('pruning one category from its row reports what was reclaimed and refreshes the breakdown', async ({ page }) => {
  const container = await createStoppedContainer('row-prune');
  try {
    await openSystemScreen(page);
    await expect(categoryRow(page, 'Stopped containers').locator('.ui-storage-usage-row__description')).toHaveText(
      /\d+ containers? not running/,
      { timeout: 30_000 },
    );

    await categoryRow(page, 'Stopped containers').getByRole('button', { name: 'Prune' }).click();
    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/daemon is shared/i);

    const prunePromise = page.waitForResponse(
      (response) => response.url().includes('/api/system/prune') && response.request().method() === 'POST',
    );
    // The breakdown is re-read after every prune (use-disk-usage.md), so what the screen shows is
    // the host after the run.
    const refreshPromise = page.waitForResponse(
      (response) => response.url().includes('/api/system/disk-usage') && response.request().method() === 'GET',
    );
    await dialog.getByRole('button', { name: 'Prune' }).click();
    await expect(dialog).toBeHidden();

    const pruneResponse = await prunePromise;
    expect(pruneResponse.status()).toBe(200);
    expect(JSON.parse(pruneResponse.request().postData() ?? '{}')).toEqual({ scope: ['stopped-containers'] });
    const result = (await pruneResponse.json()) as { categories: PruneOutcome[]; reclaimedBytes: number };
    expect(result.categories.map((outcome) => outcome.categoryId)).toEqual(['stopped-containers']);
    expect(result.categories[0]?.error).toBeUndefined();
    expect(result.categories[0]?.removedCount).toBeGreaterThan(0);
    expect(result.categories[0]?.removed.some((removed) => container.id.startsWith(removed) || removed.startsWith(container.id))).toBe(true);

    await refreshPromise;

    // The operator is told what the run reclaimed: the summary stays, the toast passes by.
    const summary = page.locator('.ui-result-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Last prune');
    await expect(summary).toContainText(SIZE_PATTERN);
    await expect(summary).toContainText('Stopped containers');
    await expect(page.locator('.ui-toast-viewport')).toContainText(SIZE_PATTERN, { timeout: 20_000 });

    expect(await containerExists(container.name)).toBe(false);
  } finally {
    await removeContainerQuietly(container.name);
  }
});

// plan-docker_management_app/REQ-96 — a system-wide prune with a selectable scope: what the scope
// leaves out is not pruned
test('a scoped system prune removes the categories chosen and leaves the others alone', async ({ page }) => {
  const container = await createStoppedContainer('scoped-run');
  const volume = await createUnusedVolume('scoped-run');
  try {
    await openSystemScreen(page);
    await expect(categoryRow(page, 'Unused volumes').locator('.ui-storage-usage-row__description')).toHaveText(
      /unattached/,
      { timeout: 30_000 },
    );

    await reclaimPanel(page).getByRole('button', { name: 'System prune…' }).click();
    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();

    // Keep only the volumes: everything else the scope leaves out must survive the run.
    for (const checkbox of await dialog.getByRole('checkbox').all()) {
      const name = await checkbox.getAttribute('aria-label');
      if (name === 'Unused volumes') {
        await checkbox.check();
      } else if (await checkbox.isChecked()) {
        await checkbox.uncheck();
      }
    }

    const prunePromise = page.waitForResponse(
      (response) => response.url().includes('/api/system/prune') && response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Prune selected' }).click();
    await expect(dialog).toBeHidden();

    const pruneResponse = await prunePromise;
    expect(pruneResponse.status()).toBe(200);
    expect(JSON.parse(pruneResponse.request().postData() ?? '{}')).toEqual({ scope: ['unused-volumes'] });
    const result = (await pruneResponse.json()) as { categories: PruneOutcome[]; reclaimedBytes: number };
    expect(result.categories.map((outcome) => outcome.categoryId)).toEqual(['unused-volumes']);
    expect(result.categories[0]?.error).toBeUndefined();
    expect(result.categories[0]?.removed).toContain(volume);

    const summary = page.locator('.ui-result-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Unused volumes');
    await expect(summary).not.toContainText('Stopped containers');

    expect(await volumeExists(volume)).toBe(false);
    expect(await containerExists(container.name)).toBe(true);
  } finally {
    await removeContainerQuietly(container.name);
    await removeVolumeQuietly(volume);
  }
});
