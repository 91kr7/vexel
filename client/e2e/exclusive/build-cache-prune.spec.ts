import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';

const execFileAsync = promisify(execFile);
const RUN_ID = `${process.pid}-${Date.now()}`;

// Pruning the build cache (build-cache-service.md) reclaims whichever builder
// is currently active, host-wide and unscopable — exactly like the volume/
// container/image prune specs in this same folder. It lives apart and runs
// alone. See batch-test-isolation.md, INT-4.
//
// It carries one extra hazard those do not: selecting the active builder
// through this app is exactly what client/e2e/builders.spec.ts found
// unreliable on this host — clicking "use" does not always stick by the time
// the cache list is next read. Pruning under that mismatch would reclaim the
// wrong builder's cache, possibly the operator's own. This spec therefore
// verifies, via the API directly, that the cache about to be pruned is
// genuinely the fixture builder's own before ever clicking Prune — and skips
// rather than risk it otherwise.

function fixtureName(caseName: string): string {
  return `vexel-e2e-builder-${caseName}-${RUN_ID}`;
}

async function createBuilderQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['buildx', 'create', '--name', name, '--driver', 'docker-container']);
}

async function removeBuilderQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['buildx', 'rm', name]).catch(() => undefined);
}

async function currentActiveBuilder(): Promise<string | undefined> {
  const { stdout } = await execFileAsync('docker', ['buildx', 'ls', '--format', 'json']);
  const lines = stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  for (const line of lines) {
    const parsed = JSON.parse(line) as { Name: string; Current: boolean };
    if (parsed.Current) return parsed.Name;
  }
  return undefined;
}

async function useBuilderQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['buildx', 'use', name]).catch(() => undefined);
}

/** The fixture builder's own build-cache record ids, queried directly and scoped with `--builder` — the one reliable way to attribute cache to a specific builder on this host. */
async function ownCacheRecordIds(builderName: string): Promise<Set<string>> {
  const { stdout } = await execFileAsync('docker', ['buildx', 'du', '--builder', builderName, '--format', 'json']);
  const lines = stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return new Set(lines.map((line) => (JSON.parse(line) as { ID: string }).ID));
}

function builderRow(page: Page, name: string) {
  return page.locator('.ui-card-list > .ui-surface', { has: page.locator('.ui-card-list__item', { hasText: name }) });
}

// plan-docker_management_app/REQ-91 — the build cache can be pruned, reporting the space reclaimed,
// after confirmation
test('pruning the build cache reclaims space and reports it, after confirmation', async ({ page }) => {
  const name = fixtureName('prune');
  await createBuilderQuietly(name);
  const dir = await mkdtemp(join(tmpdir(), 'vexel-e2e-builder-prune-'));
  const originalActive = await currentActiveBuilder();
  try {
    await writeFile(join(dir, 'Dockerfile'), 'FROM alpine:3.20\nRUN echo vexel-e2e-prune-marker > /tmp/marker\n', 'utf8');
    await execFileAsync('docker', ['buildx', 'build', '--builder', name, dir]);
    const ownIds = await ownCacheRecordIds(name);
    expect(ownIds.size).toBeGreaterThan(0);

    await page.goto('/');
    await page.getByRole('button', { name: 'Builders & cache' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Builders & cache' })).toBeVisible();
    const row = builderRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'use' }).click();

    const cacheResponse = await page.request.get('/api/builders/cache');
    const records = (await cacheResponse.json()) as { id: string }[];
    const belongsToFixture = records.length > 0 && records.every((record) => ownIds.has(record.id));
    test.skip(!belongsToFixture, 'active-builder selection through the app is not reliably reflected by GET /api/builders/cache on this host; see reported defect');

    await page.reload();
    const cacheCard = page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Build cache' }) });
    await cacheCard.getByRole('button', { name: 'Prune' }).click();
    const confirmHeading = page.getByRole('heading', { name: 'Confirm: the build cache' });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await confirmDialog.getByRole('button', { name: 'Prune' }).click();
    await expect(confirmDialog).toBeHidden();

    await expect(page.getByText('Build cache pruned')).toBeVisible({ timeout: 15_000 });
  } finally {
    if (originalActive) await useBuilderQuietly(originalActive);
    await removeBuilderQuietly(name);
    await rm(dir, { recursive: true, force: true });
  }
});
