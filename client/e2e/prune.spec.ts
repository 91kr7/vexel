import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { containerCard } from './support/container-cards.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

// The two prune actions exercise the daemon's real prune, which acts on every
// stopped container / every dangling image on the host — not only on the
// fixtures set up here. No labelling can scope them, and nothing has to: the
// suite is one project on one worker, and every spec file empties the daemon
// before it runs, so a prune here costs the next file a restore and can never
// reach a fixture still in use. Acceptance is established on the fixtures
// created here, never on host totals.
test.describe.configure({ mode: 'serial' });

async function createSleepingContainer(name: string): Promise<void> {
  // Ensured at the point of use: this file prunes the host, so an image that was
  // there a moment ago may be gone. Restored from the run's own registry, never
  // from Docker Hub.
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', [
    'run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sleep', ALPINE_IMAGE, '300',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

async function removeTagQuietly(tag: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
}

/** The container's card on the containers screen — the surface that carries its name and its controls. */
function containerRow(page: Page, name: string) {
  return containerCard(page, name);
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
    // Pinned, not inherited: the last active screen survives by design
    // (REQ-115), and the Dashboard the application otherwise lands on names
    // this screen in a cross-navigation tile an unscoped rail click matches too.
    await openApp(page, 'containers');
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();

    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(row).toContainText('EXITED', { timeout: 10_000 });

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
  // Same reason as above: this file's own earlier test prunes the host.
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), TINY_IMAGE]);
  const { stdout: firstId } = await execFileAsync('docker', ['commit', '--change', 'LABEL step=1', containerName, danglingTag]);
  await new Promise((resolve) => setTimeout(resolve, 1100)); // ensure a different image config timestamp
  await execFileAsync('docker', ['commit', '--change', 'LABEL step=2', containerName, danglingTag]);
  try {
    // Pinned, not inherited: the last active screen survives by design
    // (REQ-115), and the Dashboard the application otherwise lands on names
    // this screen in a cross-navigation tile an unscoped rail click matches too.
    await openApp(page, 'images-layers');
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
