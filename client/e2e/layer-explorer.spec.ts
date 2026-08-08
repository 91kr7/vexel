import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { ownershipArgs } from './support/fixtures.js';

const execFileAsync = promisify(execFile);

async function createStandaloneImage(tag: string, containerName: string): Promise<void> {
  await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), 'hello-world']);
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
  await page.goto('/');
  await page.getByRole('button', { name: /Images & layers/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-docker_management_app/REQ-47, plan-docker_management_app/REQ-48 — a registry-pulled image
// (never built locally) shows its whole layer stack, with the compressed size marked unavailable.
test('opens the layer explorer from the image detail panel and shows the ordered layer stack for a registry-pulled image', async ({ page }) => {
  await searchField(page).fill('registry');
  const row = imageRow(page, 'registry:2');
  await expect(row).toBeVisible({ timeout: 10_000 });
  await selectRow(row);

  await page.getByRole('button', { name: 'Explore layers…' }).click();

  const modal = layerExplorerModal(page, 'Layer stack — registry:2');
  await expect(modal).toBeVisible();
  // SIGNALS marks the layers carrying an efficiency or secret finding
  // (images/specs/layer-explorer.md).
  await expect(modal.locator('.ui-data-table__header-cell')).toHaveText(['#', 'INSTRUCTION', 'SHARED', 'SIGNALS', 'SIZE', 'COMPRESSED']);
  const rows = modal.locator('.ui-data-table__row');
  await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  expect(await rows.count()).toBeGreaterThan(1);
  // images-analysis/specs/layer-metadata-service.md — the local daemon reports no compressed size
  await expect(modal.getByText('unavailable').first()).toBeVisible();
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
    await selectRow(row);
    await page.getByRole('button', { name: 'Explore layers…' }).click();

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
// alone added: a single-file image's one layer adds exactly one file (`hello`). layer-explorer.md —
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
    await selectRow(row);
    await page.getByRole('button', { name: 'Explore layers…' }).click();

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
    await expect(progressDialog.getByRole('button', { name: 'Close' })).toBeVisible({ timeout: 30_000 });
    await progressDialog.getByRole('button', { name: 'Close' }).click();

    // The dialog is gone, but the just-computed changeset must still be browsable — not a
    // "not analyzed yet" prompt sent back by Close.
    await expect(progressHeading).toHaveCount(0);
    await expect(modal.getByText('Changesets not analyzed yet')).toHaveCount(0);
    await expect(modal.locator('.ui-data-table__expanded')).toContainText('hello');

    // Selecting layers still works after the dialog is dismissed: hello-world's committed image
    // has empty layers alongside its one real one, so a different row's changeset is legitimately
    // empty — the point is it renders the "no changes" state, not "not analyzed yet" again.
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
