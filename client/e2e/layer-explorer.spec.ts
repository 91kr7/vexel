import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { expectCompletedThenSelfDismissed } from './support/progress-completion.js';
import { expectRegionPinnedAcrossViewportHeights } from './support/pinned-region.js';
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

// Selects a row by clicking a non-action cell (mirrors images.spec.ts's own helper): the
// multi-select checkbox column, when present, is a `.ui-data-table__select-cell`, not a
// `.ui-data-table__cell`, so this always lands on the first real column cell.
async function selectRow(row: ReturnType<typeof imageRow>): Promise<void> {
  await row.locator('.ui-data-table__cell').first().click();
}

function searchField(page: Page) {
  return page.getByPlaceholder('Search reference or digest…');
}

/**
 * Opens one of the image's four analyses from the row's own overflow menu — the entry point they
 * all have now that they are the screen's views rather than the detail panel's
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

function layerExplorerModal(page: Page, title: string) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: title }) });
}

/**
 * Waits for the layer stack to load, retrying through the explorer's own "Retry" action if it
 * doesn't. A just-committed image is occasionally not yet consistently visible to the daemon under
 * the concurrent request burst a page load fires (observed directly against this real daemon,
 * independent of this batch's fixes); retrying — exactly what an operator would do — recovers.
 */
async function waitForLayerStack(page: Page, modal: ReturnType<typeof layerExplorerModal>): Promise<void> {
  const row = modal.locator('.ui-data-table__row').first();
  const retryButton = modal.getByRole('button', { name: 'Retry' });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await Promise.race([row.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined), retryButton.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined)]);
    if (await row.isVisible()) return;
    if (await retryButton.isVisible()) {
      await page.waitForTimeout(500);
      await retryButton.click();
    }
  }
  await row.waitFor({ state: 'visible', timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-docker_management_app/REQ-47, plan-docker_management_app/REQ-48 — a registry-pulled image
// (never built locally) shows its whole layer stack, with the compressed size marked unavailable.
// Opened from the row's own menu with **no row selected and no detail panel open** — the case that did
// not exist while the explorer was the panel's (panel_actions_to_menu/REQ-13, REQ-30).
test('opens the layer explorer from the row menu with no panel open, and shows the ordered layer stack for a registry-pulled image', async ({ page }) => {
  await searchField(page).fill('registry');
  const row = imageRow(page, 'registry:2');
  await expect(row).toBeVisible({ timeout: 10_000 });

  await chooseRowAction(page, row, 'Explore layers…');

  // No panel opened behind it, and no row became selected.
  await expect(page.locator('.ui-data-table__expanded')).toHaveCount(0);
  await expect(page.locator('.ui-data-table__row--selected')).toHaveCount(0);
  const modal = layerExplorerModal(page, 'Layer stack — registry:2');
  await expect(modal).toBeVisible();
  // SIGNALS marks the layers carrying an efficiency or secret finding, and CACHE the build-cache
  // record behind each layer — between the signals marker and the sizes (images/specs/layer-explorer.md).
  await expect(modal.locator('.ui-data-table__header-cell')).toHaveText(['#', 'INSTRUCTION', 'SHARED', 'SIGNALS', 'CACHE', 'SIZE', 'COMPRESSED']);
  const rows = modal.locator('.ui-data-table__row');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  expect(await rows.count()).toBeGreaterThan(1);
  // images-analysis/specs/layer-metadata-service.md — the local daemon reports no compressed size
  await expect(modal.getByText('unavailable').first()).toBeVisible();

  // plan-docker_management_app-filesystem_browser_layout/REQ-20 — this dialog is deliberately out of
  // that report's scope: its inner layer table is still pinned in feature code (`maxHeight="320px"`)
  // and must measure the same at both viewport heights. See `support/pinned-region.ts` for the
  // recorded breach and for when this assertion is deleted.
  await expectRegionPinnedAcrossViewportHeights(page, modal.locator('.ui-data-table .ui-scroll-area').first(), 'Images & layers → Explore layers');
});

// plan-docker_management_app/REQ-51 — the operator is warned of the expected time and temporary
// disk cost before analysis starts, and cancelling stops it.
test('warns about cost before analyzing, and cancelling closes the progress dialog without starting over', async ({ page }) => {
  const containerName = `vexel-e2e-layers-cost-src-${Date.now()}`;
  const tag = `vexel-e2e-layers-cost-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await chooseRowAction(page, row, 'Explore layers…');

    const modal = layerExplorerModal(page, `Layer stack — ${tag}`);
    await waitForLayerStack(page, modal);
    await selectRow(modal.locator('.ui-data-table__row').first());
    await modal.getByRole('button', { name: 'Analyze changesets…' }).click();

    const confirmDialogHeading = page.getByRole('heading', { name: `Confirm: ${tag}` });
    await expect(confirmDialogHeading).toBeVisible();
    // The dialogs are nested inside the layer-explorer Modal's own DOM (its children), not
    // siblings, so a heading's direct parent — not a `.ui-modal` filter — is the right scope.
    const confirmDialog = confirmDialogHeading.locator('xpath=..');
    await expect(confirmDialog).toContainText('temporary disk');
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmDialogHeading).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Analyzing layer changesets' })).toHaveCount(0);

    await modal.getByRole('button', { name: 'Analyze changesets…' }).click();
    await confirmDialog.getByRole('button', { name: 'Analyze', exact: true }).click();
    const progressHeading = page.getByRole('heading', { name: 'Analyzing layer changesets' });
    await expect(progressHeading).toBeVisible();
    const progressDialog = progressHeading.locator('xpath=..');
    await progressDialog.getByRole('button', { name: 'Cancel' }).click();

    // layer-explorer.md — Cancel discards: the dialog closes with no result, and the "not analyzed
    // yet" prompt is shown again (a deliberate, expected end, not a failure).
    await expect(progressHeading).toHaveCount(0);
    await expect(modal.getByText('Changesets not analyzed yet')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Analyze changesets…' })).toBeVisible();
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});

// plan-docker_management_app/REQ-49 — selecting a layer, once analysed, shows the paths that layer
// alone added: the suite's single-file image's one layer adds exactly one file. layer-explorer.md —
// Close is only an acknowledgement once the analysis finished: the computed changeset stays and is
// what layer selection keeps browsing afterwards, dialog dismissed or not.
test('keeps the changeset browsable after closing the dialog, and layer selection still works', async ({ page }) => {
  const containerName = `vexel-e2e-layers-paths-src-${Date.now()}`;
  const tag = `vexel-e2e-layers-paths-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await chooseRowAction(page, row, 'Explore layers…');

    const modal = layerExplorerModal(page, `Layer stack — ${tag}`);
    await waitForLayerStack(page, modal);
    const layerRows = modal.locator('.ui-data-table__row');
    await selectRow(layerRows.first());
    await modal.getByRole('button', { name: 'Analyze changesets…' }).click();
    const confirmDialogHeading = page.getByRole('heading', { name: `Confirm: ${tag}` });
    const confirmDialog = confirmDialogHeading.locator('xpath=..');
    await confirmDialog.getByRole('button', { name: 'Analyze', exact: true }).click();

    const progressHeading = page.getByRole('heading', { name: 'Analyzing layer changesets' });
    const progressDialog = progressHeading.locator('xpath=..');
    // Re-pointed at the dialog's own dismissal: the completion is stated while it is still there,
    // and it then leaves with nothing pressed (progress_completion_autoclose/REQ-18, REQ-24). The
    // `Close` press that used to be here would now race that dismissal.
    await expectCompletedThenSelfDismissed(progressDialog, 30_000);

    // The dialog is gone, but the just-computed changeset must still be browsable — not a
    // "not analyzed yet" prompt left behind by the dismissal.
    await expect(progressHeading).toHaveCount(0);
    await expect(modal.getByText('Changesets not analyzed yet')).toHaveCount(0);
    await expect(modal.locator('.ui-data-table__expanded')).toContainText(TINY_IMAGE_FILE);

    // Selecting layers still works after the dialog is dismissed: the committed image has empty
    // layers alongside its one real one, so a different row's changeset is legitimately empty —
    // the point is it renders the "no changes" state, not "not analyzed yet" again.
    const layerCount = await layerRows.count();
    if (layerCount > 1) {
      await selectRow(layerRows.nth(1));
      await expect(modal.getByText('Changesets not analyzed yet')).toHaveCount(0);
      await expect(modal.locator('.ui-data-table__expanded')).toBeVisible();
    }
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});
