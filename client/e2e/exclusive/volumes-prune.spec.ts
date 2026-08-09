import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { openApp, ownershipArgs } from '../support/fixtures.js';

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

// The volumes panel only. Its actions must be scoped to it: the networks panel next
// to it on the same screen carries a "Prune" button of its own.
function volumesPanel(page: Page) {
  return page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Volumes' }) });
}

// plan-docker_management_app/REQ-71 — unused volumes can be pruned in one bulk action, reporting the
// removed count and reclaimed space
test('pruning unused volumes removes them from the list and reports the outcome', async ({ page }) => {
  const name = `vexel-e2e-prune-${Date.now()}`;
  try {
    await createNamedVolume(name);

    // Pinned, not inherited: the last active screen survives by design
    // (REQ-115), and the Dashboard the application otherwise lands on names
    // this screen in a cross-navigation tile an unscoped rail click matches too.
    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();
    await expect(volumesPanel(page).locator('.ui-card-list__item', { hasText: name })).toBeVisible({ timeout: 15_000 });

    const pruneButton = volumesPanel(page).getByRole('button', { name: 'Prune', exact: true });
    await expect(pruneButton).toBeEnabled();
    await pruneButton.click();
    await expect(page.getByRole('heading', { name: 'Confirm: unused volumes' })).toBeVisible();
    const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Confirm: unused volumes' }) });
    await dialog.getByRole('button', { name: 'Prune' }).click();

    await expect(page.locator('.ui-toast-viewport')).toContainText(/removed/i, { timeout: 15_000 });
    await expect(volumesPanel(page).locator('.ui-card-list__item', { hasText: name })).toHaveCount(0);
  } finally {
    await removeVolumeQuietly(name);
  }
});
