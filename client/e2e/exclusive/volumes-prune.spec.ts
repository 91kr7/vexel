import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { ownershipArgs } from '../support/fixtures.js';

const execFileAsync = promisify(execFile);

// Pruning exercises the daemon's own prune (`filters={"all":["true"]}`,
// volumes-service.md), which acts on every unused volume on the host, named
// or anonymous — not only the fixture set up here. No labelling can scope it,
// so it lives apart and runs alone, mirroring the containers/images prune
// specs in this same folder. See batch-test-isolation.md, INT-4 and INT-6.
test.describe.configure({ mode: 'serial' });

async function createNamedVolume(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(name), name]);
}

async function removeVolumeQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
}

// plan-docker_management_app/REQ-71 — unused volumes can be pruned in one bulk action, reporting the
// removed count and reclaimed space
test('pruning unused volumes removes them from the list and reports the outcome', async ({ page }) => {
  const name = `vexel-e2e-prune-${Date.now()}`;
  try {
    await createNamedVolume(name);

    await page.goto('/');
    await page.getByRole('button', { name: /Volumes & networks/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();
    await expect(page.locator('.ui-card-list__item', { hasText: name })).toBeVisible({ timeout: 15_000 });

    const pruneButton = page.getByRole('button', { name: 'Prune', exact: true });
    await expect(pruneButton).toBeEnabled();
    await pruneButton.click();
    await expect(page.getByRole('heading', { name: 'Confirm: unused volumes' })).toBeVisible();
    const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Confirm: unused volumes' }) });
    await dialog.getByRole('button', { name: 'Prune' }).click();

    await expect(page.locator('.ui-toast-viewport')).toContainText(/removed/i, { timeout: 15_000 });
    await expect(page.locator('.ui-card-list__item', { hasText: name })).toHaveCount(0);
  } finally {
    await removeVolumeQuietly(name);
  }
});
