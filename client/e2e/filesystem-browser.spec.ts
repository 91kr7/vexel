import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { TINY_IMAGE, TINY_IMAGE_FILE, ensureImage } from '../../server/test/support/base-images.js';

async function createStandaloneImage(tag: string, containerName: string): Promise<void> {
  // Ensured at the point of use, not once for the run: the exclusive project
  // prunes the host, so an image present at global setup may be gone by now.
  // Locally built, so putting it back costs a second and no network.
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), TINY_IMAGE]);
  await execFileAsync('docker', ['commit', containerName, tag]);
}

async function removeStandaloneImage(tag: string, containerName: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
  await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
}

function imageRow(page: Page, text: string) {
  return page.locator('.ui-data-table__row', { hasText: text });
}

/** Selects a row by clicking a non-action cell (the action group swallows its own clicks). */
async function selectRow(row: ReturnType<typeof imageRow>): Promise<void> {
  await row.locator('.ui-data-table__cell').first().click();
}

function searchField(page: Page) {
  return page.getByPlaceholder('Search reference or digest…');
}

/**
 * Opens one of the image's four analyses from the row's own overflow menu — the entry point they all
 * have now that they are the screen's views rather than the detail panel's
 * (images/specs/images-screen.md).
 */
async function chooseRowAction(page: Page, row: ReturnType<typeof imageRow>, label: string): Promise<void> {
  // The opening is retried as a whole: the list keeps re-reading from the daemon's own events, and a
  // re-read that replaces the row takes its trigger — and with it the menu — as it is meant to
  // (ui-library/specs/menu.md). Same precedent as the keyboard case in `images.spec.ts`.
  await expect(async () => {
    await row.getByRole('button', { name: /^More actions for / }).click();
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

function filesystemBrowserModal(page: Page, title: string) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: title }) });
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-docker_management_app/REQ-52, plan-docker_management_app/REQ-53 — a runtime-independent
// image's complete merged filesystem is browsed as a lazily expanded tree, with no process from the
// image ever run; selecting an entry shows its details.
test('browses the complete filesystem of an image without running it, lazily expanding a directory and showing a selected entry\'s details', async ({ page }) => {
  const containerName = `vexel-e2e-fsbrowser-src-${Date.now()}`;
  const tag = `vexel-e2e-fsbrowser-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Opened from the row's own menu with no row selected and no detail panel open — the case that
    // did not exist while the browser was the panel's (panel_actions_to_menu/REQ-13, REQ-30).
    await chooseRowAction(page, row, 'Browse filesystem…');
    const modal = filesystemBrowserModal(page, `Filesystem — ${tag}`);
    await expect(modal).toBeVisible();
    await expect(page.locator('.ui-detail-panel')).toHaveCount(0);
    await expect(modal.getByText('Filesystem not extracted yet')).toBeVisible();

    await modal.getByRole('button', { name: 'Browse filesystem…' }).click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${tag}` });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = confirmHeading.locator('xpath=..');
    await confirmDialog.getByRole('button', { name: 'Extract' }).click();

    const progressHeading = page.getByRole('heading', { name: 'Extracting the filesystem' });
    await expect(progressHeading).toBeVisible();
    const progressDialog = progressHeading.locator('xpath=..');
    await expect(progressDialog.getByRole('button', { name: 'Close' })).toBeVisible({ timeout: 15_000 });
    await progressDialog.getByRole('button', { name: 'Close' }).click();

    await expect(modal.getByText('Freshly extracted')).toBeVisible();
    const treeRow = (name: string) => modal.locator('.ui-tree-view__row', { hasText: name });
    await expect(treeRow(TINY_IMAGE_FILE)).toBeVisible();
    await expect(treeRow('etc')).toBeVisible();

    // Expanding "etc" the first time triggers its lazy child read.
    await treeRow('etc').locator('.ui-tree-view__caret').click();
    await expect(treeRow('hostname')).toBeVisible();

    // Selecting a file shows its path/type/size in the right-hand pane.
    await treeRow(TINY_IMAGE_FILE).click();
    await expect(modal.getByText(`/${TINY_IMAGE_FILE}`)).toBeVisible();
    await expect(modal.getByText('file', { exact: true })).toBeVisible();
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});

// plan-docker_management_app/REQ-55 — the operator is warned of the expected time and temporary
// disk cost before extraction starts, and cancelling stops it without extracting anything.
test('warns about the cost before extracting, and cancelling returns to the not-extracted prompt', async ({ page }) => {
  const containerName = `vexel-e2e-fsbrowser-cost-src-${Date.now()}`;
  const tag = `vexel-e2e-fsbrowser-cost-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await chooseRowAction(page, row, 'Browse filesystem…');
    const modal = filesystemBrowserModal(page, `Filesystem — ${tag}`);

    await modal.getByRole('button', { name: 'Browse filesystem…' }).click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${tag}` });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = confirmHeading.locator('xpath=..');
    await expect(confirmDialog).toContainText(/taking roughly \d+s/);
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmHeading).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Extracting the filesystem' })).toHaveCount(0);

    // Starting for real, then cancelling the progress dialog itself: no leftover progress, no tree.
    await modal.getByRole('button', { name: 'Browse filesystem…' }).click();
    await confirmDialog.getByRole('button', { name: 'Extract' }).click();
    const progressHeading = page.getByRole('heading', { name: 'Extracting the filesystem' });
    await expect(progressHeading).toBeVisible();
    const progressDialog = progressHeading.locator('xpath=..');
    await progressDialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(progressHeading).toHaveCount(0);
    await expect(modal.getByText('Filesystem not extracted yet')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Browse filesystem…' })).toBeVisible();
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});

// plan-docker_management_app/REQ-113 — re-opening the same image's filesystem browser after it was
// closed and the client state discarded still reuses the cached extraction rather than recomputing.
test('reuses the cached extraction the next time the image is browsed', async ({ page }) => {
  const containerName = `vexel-e2e-fsbrowser-cache-src-${Date.now()}`;
  const tag = `vexel-e2e-fsbrowser-cache-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await chooseRowAction(page, row, 'Browse filesystem…');
    const modal = filesystemBrowserModal(page, `Filesystem — ${tag}`);

    await modal.getByRole('button', { name: 'Browse filesystem…' }).click();
    await page.getByRole('heading', { name: `Confirm: ${tag}` }).locator('xpath=..').getByRole('button', { name: 'Extract' }).click();
    const progressDialog = page.getByRole('heading', { name: 'Extracting the filesystem' }).locator('xpath=..');
    await expect(progressDialog.getByRole('button', { name: 'Close' })).toBeVisible({ timeout: 15_000 });
    await progressDialog.getByRole('button', { name: 'Close' }).click();
    await expect(modal.getByText('Freshly extracted')).toBeVisible();

    // Closes the browser's own Modal (overlay click, away from its content — the modal is still
    // covering the row underneath), which discards its client-side state entirely: only the open
    // view is rendered, so nothing of it survives the closing. Reopened from the row's menu, the
    // browser is back at its unextracted prompt and the extraction is asked for again — which is
    // what makes the second one a genuine question to the server's cache
    // (images/specs/images-screen.md).
    await page.locator('.ui-modal-overlay').click({ position: { x: 5, y: 5 } });
    await expect(modal).toHaveCount(0);

    // change-3's own dismissal check, kept: the panel offers no close control — its row opens it and
    // selecting that row again closes it. It no longer stands in for discarding the browser's state,
    // which closing the view does on its own.
    await selectRow(imageRow(page, tag));
    await expect(page.locator('.ui-detail-panel')).toHaveCount(1);
    await selectRow(imageRow(page, tag));
    await expect(page.locator('.ui-detail-panel')).toHaveCount(0);

    await chooseRowAction(page, imageRow(page, tag), 'Browse filesystem…');
    const reopenedModal = filesystemBrowserModal(page, `Filesystem — ${tag}`);
    await expect(reopenedModal.getByText('Filesystem not extracted yet')).toBeVisible();

    await reopenedModal.getByRole('button', { name: 'Browse filesystem…' }).click();
    await page.getByRole('heading', { name: `Confirm: ${tag}` }).locator('xpath=..').getByRole('button', { name: 'Extract' }).click();

    await expect(reopenedModal.getByText('From cache')).toBeVisible({ timeout: 15_000 });
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});
