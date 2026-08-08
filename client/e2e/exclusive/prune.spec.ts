import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { ownershipArgs } from '../support/fixtures.js';

const execFileAsync = promisify(execFile);

// The two prune actions exercise the daemon's real prune, which acts on every
// stopped container / every dangling image on the host — not only on the
// fixtures set up here. No labelling can scope them, so they live in their own
// project, which runs after the parallel one and serially within itself:
// alongside the rest of the suite they would delete other specs' fixtures
// mid-assertion. See batch-test-isolation.md, INT-4 and INT-6.
test.describe.configure({ mode: 'serial' });

async function createSleepingContainer(name: string): Promise<void> {
  await execFileAsync('docker', [
    'run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sleep', 'alpine:3.20', '300',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

async function removeTagQuietly(tag: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
}

function containerRow(page: Page, name: string) {
  return page.locator('.ui-data-table__row', { hasText: name });
}

function searchField(page: Page) {
  return page.getByPlaceholder('Search reference or digest…');
}

/** The screen's own content: the confirmation dialog renders outside the frame and repeats the toolbar's label on its confirm action. */
function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

// plan-docker_management_app/REQ-22 — stopped containers are pruned in one bulk action, reporting the removed count and reclaimed space
test('pruning stopped containers removes them from the list and reports the outcome', async ({ page }) => {
  const name = `vexel-e2e-prune-${Date.now()}`;
  try {
    await page.goto('/');
    await page.getByRole('button', { name: /Containers/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();

    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'stop', exact: true }).click();
    await expect(row).toContainText('exited', { timeout: 10_000 });

    const pruneButton = screenContent(page).getByRole('button', { name: 'Prune stopped' });
    await expect(pruneButton).toBeEnabled();
    await pruneButton.click();
    const confirmHeading = page.getByRole('heading', { name: /^Confirm:/ });
    await expect(confirmHeading).toBeVisible();
    // The dialog's own action: the toolbar behind it carries the same label.
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await confirmDialog.getByRole('button', { name: 'Prune stopped' }).click();

    await expect(containerRow(page, name)).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('.ui-toast-viewport')).toContainText(/removed/i, { timeout: 15_000 });
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-39 — dangling images can be pruned in one bulk action, reporting the removed count and reclaimed space
test('pruning dangling images removes them and reports the outcome', async ({ page }) => {
  const containerName = `vexel-e2e-prune-src-${Date.now()}`;
  const danglingTag = `vexel-e2e-prune-dangling-${Date.now()}:v1`;
  await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), 'hello-world']);
  const { stdout: firstId } = await execFileAsync('docker', ['commit', '--change', 'LABEL step=1', containerName, danglingTag]);
  await new Promise((resolve) => setTimeout(resolve, 1100)); // ensure a different image config timestamp
  await execFileAsync('docker', ['commit', '--change', 'LABEL step=2', containerName, danglingTag]);
  try {
    await page.goto('/');
    await page.getByRole('button', { name: /Images & layers/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();

    const pruneButton = screenContent(page).getByRole('button', { name: 'Prune dangling' });
    await expect(pruneButton).toBeEnabled({ timeout: 10_000 });
    await pruneButton.click();
    const confirmHeading = page.getByRole('heading', { name: 'Confirm: dangling images' });
    await expect(confirmHeading).toBeVisible();
    // The dialog's own action: the toolbar behind it carries the same label.
    await page.locator('.ui-modal').filter({ has: confirmHeading }).getByRole('button', { name: 'Prune dangling' }).click();

    await expect(page.locator('.ui-toast-viewport')).toContainText(/removed/i, { timeout: 15_000 });
    await searchField(page).fill(firstId.trim().slice(7, 19));
    await expect(page.locator('.ui-data-table__row')).toHaveCount(0);
  } finally {
    await removeContainerQuietly(containerName);
    await removeTagQuietly(danglingTag);
  }
});
