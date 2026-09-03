import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { expectCompletedThenSelfDismissed } from './support/progress-completion.js';
import { expectRegionPinnedAcrossViewportHeights } from './support/pinned-region.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { REGISTRY_IMAGE, TINY_IMAGE, TINY_IMAGE_FILE, ensureImage } from '../../server/test/support/base-images.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

async function createStandaloneImage(tag: string, containerName: string): Promise<void> {
  // Ensured at the point of use, not once for the run: a prune spec in this suite
  // prunes the host, so an image ensured earlier may be gone by now.
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
  // Opening and choosing are one retried gesture, over a settled list: the list keeps re-reading
  // from the daemon's own events, and every one of the menu's specified dismissals
  // (ui-library/specs/menu.md) lands between the two halves when they are retried separately.
  await chooseFromRowOverflowMenu(page, row, label);
}

function layerExplorerModal(page: Page, title: string) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: title }) });
}

/**
 * Waits for the layer stack to load. A just-committed image is occasionally not yet consistently
 * visible to the daemon under the concurrent request burst a page load fires (observed directly
 * against this real daemon), and the explorer's own "Retry" used to recover it. That control is
 * gone with every error panel in the page body (…-inline_error_panels/REQ-1), so the wait is all
 * there is: a read that does fail now shows the screen's empty state and is a red, not a retry.
 */
async function waitForLayerStack(modal: ReturnType<typeof layerExplorerModal>): Promise<void> {
  const row = modal.locator('.ui-data-table__row').first();
  // 20s inside the 30s these tests have: the rest goes on opening the application and the dialog.
  await expect(row, 'the layer explorer never listed a layer').toBeVisible({ timeout: 20_000 });
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
  // image-analysis/specs/layer-metadata-service.md — the local daemon reports no compressed size
  await expect(modal.getByText('unavailable').first()).toBeVisible();

  // plan-docker_management_app-filesystem_browser_layout/REQ-20 — this dialog is deliberately out of
  // that report's scope: its inner layer table is still pinned in feature code (`maxHeight="320px"`)
  // and must measure the same at both viewport heights. See `support/pinned-region.ts` for the
  // recorded breach and for when this assertion is deleted.
  await expectRegionPinnedAcrossViewportHeights(page, modal.locator('.ui-data-table .ui-scroll-area').first(), 'Images & layers → Explore layers');
});

// plan-docker_management_app/REQ-51 — the operator is warned of the expected time and temporary
// disk cost before analysis starts, and cancelling stops it.
//
// **The subject is `registry:2`, and that is the repair.** This check used to analyze a one-file
// image committed for it, and the state it exists to observe — a run in flight, cancelled — does not
// last on such an image: the trace of the 2026-09-01 run holds the whole stream, opened and ended,
// in **35ms**, against the ~43ms the press itself took to be delivered. The dialog had already
// swapped its `Cancel` for the `Close` that acknowledges a finished run, the press landed on the
// control standing at those coordinates, and the changesets it dismissed stayed on screen —
// correctly, and with nothing cancelled. A wait cannot repair that: what the check needs is not to
// arrive later but to have something still running when it arrives.
//
// So it cancels the analysis of the multi-layer, registry-pulled image the suite already requires,
// whose export and per-layer indexing take seconds rather than tens of milliseconds. Nothing is
// weakened: every assertion below is the one this check has always made, and one is added — that the
// run really is in flight when the press lands, read off the product's own statement of it.
test('warns about cost before analyzing, and cancelling closes the progress dialog without starting over', async ({ page }) => {
  // Ensured at the point of use, not once for the run: a prune spec in this suite prunes the host.
  await ensureImage(REGISTRY_IMAGE);
  await page.reload();
  await searchField(page).fill(REGISTRY_IMAGE);
  const row = imageRow(page, REGISTRY_IMAGE).first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await chooseRowAction(page, row, 'Explore layers…');

  const modal = layerExplorerModal(page, `Layer stack — ${REGISTRY_IMAGE}`);
  await waitForLayerStack(modal);
  await selectRow(modal.locator('.ui-data-table__row').first());
  await modal.getByRole('button', { name: 'Analyze changesets…' }).click();

  const confirmDialogHeading = page.getByRole('heading', { name: `Confirm: ${REGISTRY_IMAGE}` });
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

  // The run is still going when the press lands, stated by the product rather than assumed by the
  // check: the dialog offers `Cancel` while the analysis is active and `Close` once it has ended
  // (`images/specs/layer-explorer.md`), so the control being there is the in-flight state itself.
  const cancelControl = progressDialog.getByRole('button', { name: 'Cancel' });
  await expect(cancelControl, `the analysis of ${REGISTRY_IMAGE} ended before its cancel control could be found: this check has no run left to cancel`).toBeVisible();
  await cancelControl.click();

  // layer-explorer.md — Cancel discards: the dialog closes with no result, and the "not analyzed
  // yet" prompt is shown again (a deliberate, expected end, not a failure).
  await expect(progressHeading).toHaveCount(0);
  await expect(
    modal.getByText('Changesets not analyzed yet'),
    'the explorer kept a changeset after the run was cancelled — or the run finished between the control being found and the press being delivered, in which case what closed the dialog was the `Close` that acknowledges a completed run',
  ).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Analyze changesets…' })).toBeVisible();
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
    await waitForLayerStack(modal);
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
