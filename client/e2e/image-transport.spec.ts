import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Download, type Page } from './support/test.js';
import { navEntry, openApp, ownershipArgs } from './support/fixtures.js';
import { expectCompletedAndStillWaiting } from './support/progress-completion.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { chooseCardAction, containerCard, containerDetail } from './support/container-cards.js';

// Every test in this file drives a real save/load or export/import round
// trip against the daemon, so it runs one at a time.
test.describe.configure({ mode: 'serial' });

/**
 * Creates (but never starts) a container from the suite's own single-file image.
 *
 * Ensured at the point of use, not once for the run: the exclusive project
 * prunes the host, so an image present at global setup may be gone by now.
 * Locally built, so putting it back costs a second and no network.
 */
async function createFromTinyImage(containerName: string): Promise<void> {
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), TINY_IMAGE]);
}

async function removeTagQuietly(tag: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** A standalone single-tag image (its own id, unrelated to any other locally tagged image). */
async function createStandaloneImage(tag: string, containerName: string): Promise<void> {
  await createFromTinyImage(containerName);
  await execFileAsync('docker', ['commit', containerName, tag]);
}

function imageRow(page: Page, text: string) {
  return page.locator('.ui-data-table__row', { hasText: text });
}

function searchField(page: Page) {
  return page.getByPlaceholder('Search reference or digest…');
}

async function tempTarPath(name: string): Promise<string> {
  return path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'vexel-e2e-')), name);
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-docker_management_app/REQ-42 — an image can be saved to a tarball downloaded through the
// browser to the operator's own machine, and loaded back, reporting the resulting reference.
test('saving an image downloads a tarball that reloads it under the same reference', async ({ page }) => {
  const containerName = `vexel-e2e-transport-save-src-${Date.now()}`;
  const tag = `vexel-e2e-transport-save-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent('download');
    // The row carries one control now: the tarball download is started from its `Save` entry
    // (images/specs/images-screen.md). Opening and choosing are one retried gesture: the menu closes
    // on a scroll or a re-read of the row (ui-library/specs/menu.md), and a gesture split in two
    // waits out its budget on an entry that is gone. It is never pressed twice — the retry stops at
    // the first activation the browser delivers — so at most one download is ever started.
    await chooseFromRowOverflowMenu(page, row, 'Save', { trigger: `More actions for ${tag}` });
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe(`${tag}.tar`.replace(':', '_'));
    await expect(page.locator('.ui-toast-viewport')).toContainText('Download started');
    // No dialog collects a save target: the browser owns the download on its own.
    await expect(page.locator('.ui-modal')).toHaveCount(0);

    await removeTagQuietly(tag);
    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();
    const { stdout } = await execFileAsync('docker', ['load', '-i', savedPath!]);
    expect(stdout).toContain(tag);
  } finally {
    await removeTagQuietly(tag);
    await removeContainerQuietly(containerName);
  }
});

// plan-docker_management_app/REQ-42 — several selected images are saved as one combined tarball
test('saving several selected images downloads one combined tarball named "<count>-images.tar"', async ({ page }) => {
  const runId = Date.now();
  const containerA = `vexel-e2e-transport-bulk-src-a-${runId}`;
  const containerB = `vexel-e2e-transport-bulk-src-b-${runId}`;
  const tagA = `vexel-e2e-transport-bulk-${runId}-a:v1`;
  const tagB = `vexel-e2e-transport-bulk-${runId}-b:v1`;
  try {
    await createStandaloneImage(tagA, containerA);
    await createStandaloneImage(tagB, containerB);
    await page.reload();
    await searchField(page).fill(`vexel-e2e-transport-bulk-${runId}`);
    await expect(page.locator('.ui-data-table__row')).toHaveCount(2, { timeout: 10_000 });

    for (const row of await page.locator('.ui-data-table__row').all()) {
      await row.getByRole('checkbox').check();
    }
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save to tarball…' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe('2-images.tar');
    await removeTagQuietly(tagA);
    await removeTagQuietly(tagB);
    const savedPath = await download.path();
    const { stdout } = await execFileAsync('docker', ['load', '-i', savedPath!]);
    expect(stdout).toContain(tagA);
    expect(stdout).toContain(tagB);
  } finally {
    await removeTagQuietly(tagA);
    await removeTagQuietly(tagB);
    await removeContainerQuietly(containerA);
    await removeContainerQuietly(containerB);
  }
});

// plan-docker_management_app/REQ-42 — images can be loaded back from a tarball the operator uploads
// from their own machine, with progress and the resulting references reported; no path is typed.
test('loading a tarball from the operator\'s machine uploads it with progress and lists the loaded reference', async ({ page }) => {
  const containerName = `vexel-e2e-transport-load-src-${Date.now()}`;
  const tag = `vexel-e2e-transport-load-${Date.now()}:v1`;
  await createStandaloneImage(tag, containerName);
  const tarPath = await tempTarPath('image.tar');
  await execFileAsync('docker', ['save', '-o', tarPath, tag]);
  await removeTagQuietly(tag); // only the uploaded tarball can bring it back
  try {
    await page.getByRole('button', { name: 'Load tarball…' }).click();
    const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Load tarball' }) });
    await expect(dialog).toBeVisible();
    // The operator picks a file from their own machine: no server-side path field is offered anywhere in the dialog.
    await expect(dialog.locator('.ui-path-input')).toHaveCount(0);
    await expect(dialog.getByRole('textbox')).toHaveCount(0);

    await dialog.getByLabel('Tarball to load').setInputFiles(tarPath);
    // exact: true — the native file input's own accessible name ("Tarball to load") otherwise also
    // matches a loose "Load" name filter, since it exposes an implicit button role too.
    await dialog.getByRole('button', { name: 'Load', exact: true }).click();

    const progressDialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Loading tarball' }) });
    await expect(progressDialog).toBeVisible();
    // Scoped to the dialog itself: a background poll can independently bring the same reference into
    // the table underneath while the dialog is still open, which would otherwise match twice.
    await expect(progressDialog.getByText(tag)).toBeVisible({ timeout: 20_000 });
    // One of the two dialogs deliberately excluded from the self-dismissal: it states its
    // completion like every other one and then keeps waiting, however long, because it is the only
    // place the reference of the image just loaded is shown
    // (progress_completion_autoclose/REQ-12, REQ-21).
    await expectCompletedAndStillWaiting(progressDialog, 20_000);
    await expect(progressDialog.getByText(tag)).toBeVisible();
    // This press stays, and is the correct behaviour rather than a race: nothing else dismisses
    // this dialog.
    await progressDialog.getByRole('button', { name: 'Close' }).click();

    await searchField(page).fill(tag);
    await expect(imageRow(page, tag)).toBeVisible({ timeout: 10_000 });
  } finally {
    await removeTagQuietly(tag);
    await removeContainerQuietly(containerName);
    await fs.rm(path.dirname(tarPath), { recursive: true, force: true });
  }
});

// plan-docker_management_app/REQ-43 — a container's filesystem downloads as a tarball, and can be
// uploaded back as an image under a chosen reference; no path is typed anywhere in either flow.
test('exporting a container filesystem and importing it back builds an image under the chosen reference', async ({ page }) => {
  const containerName = `vexel-e2e-transport-export-${Date.now()}`;
  const targetReference = `vexel-e2e-transport-imported-${Date.now()}:v1`;
  await createFromTinyImage(containerName);
  let tarPath: string | undefined;
  // Kept out of the try so the finally can hand the file back to Playwright,
  // which owns it: a downloaded file lives inside the runner's own artifact
  // directory, and deleting that directory by hand races the runner's cleanup.
  let download: Download | undefined;
  try {
    // Scoped to the rail: the Dashboard's cross-navigation tiles name the same
    // screens, so an unscoped locator matches more than the entry meant here.
    await navEntry(page, 'Containers').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    const row = containerCard(page, containerName);
    await expect(row).toBeVisible({ timeout: 10_000 });
    // Started from the card's overflow menu: the detail panel no longer offers
    // the export, so the card is not selected on the way (REQ-19). The download is awaited from
    // before the gesture, which is now one retried unit — the menu dismisses itself on a scroll or a
    // re-read (ui-library/specs/menu.md) and a split gesture waits out its budget on a vanished
    // entry. At most one export is ever started: the retry stops at the first delivered activation.
    const downloadPromise = page.waitForEvent('download');
    await chooseCardAction(page, containerName, 'Export filesystem…');
    download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`${containerName}.tar`);
    await expect(page.locator('.ui-modal')).toHaveCount(0);
    await expect(containerDetail(page)).toHaveCount(0);
    tarPath = (await download.path()) ?? undefined;
    expect(tarPath).toBeTruthy();

    await navEntry(page, 'Images & layers').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
    await page.getByRole('button', { name: 'Import filesystem…' }).click();
    const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Import filesystem tarball' }) });
    await expect(dialog).toBeVisible();
    // No server-side path field anywhere in the import dialog either: a file picker plus a target reference.
    await expect(dialog.locator('.ui-path-input')).toHaveCount(0);

    await dialog.getByLabel('Filesystem tarball to import').setInputFiles(tarPath!);
    await dialog.getByRole('textbox', { name: 'Target reference (optional)' }).fill(targetReference);
    // exact: true — same ambiguity as "Load" above, against the file input's own accessible name.
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();

    const progressDialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Importing filesystem tarball' }) });
    await expect(progressDialog).toBeVisible();
    // Scoped to the dialog itself, for the same reason as the load flow above.
    await expect(progressDialog.getByText(targetReference)).toBeVisible({ timeout: 20_000 });
    // The second dialog excluded from the self-dismissal, for the same reason as the load flow
    // above (progress_completion_autoclose/REQ-12, REQ-21).
    await expectCompletedAndStillWaiting(progressDialog, 20_000);
    await expect(progressDialog.getByText(targetReference)).toBeVisible();
    await progressDialog.getByRole('button', { name: 'Close' }).click();

    await searchField(page).fill(targetReference);
    await expect(imageRow(page, targetReference)).toBeVisible({ timeout: 10_000 });
  } finally {
    await removeTagQuietly(targetReference);
    await removeContainerQuietly(containerName);
    await download?.delete();
  }
});
