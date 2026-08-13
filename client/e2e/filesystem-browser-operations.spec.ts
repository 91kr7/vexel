import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { expectCompletedThenSelfDismissed } from './support/progress-completion.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

// Every test drives the same extracted-filesystem fixture image; running
// serially avoids racing the single-image extraction cache.
test.describe.configure({ mode: 'serial' });

async function buildImage(tag: string, dockerfile: string): Promise<void> {
  const contextDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-fsops-'));
  await writeFile(join(contextDir, 'Dockerfile'), dockerfile);
  await execFileAsync('docker', ['build', ...ownershipArgs(tag), '-t', tag, contextDir]);
}

async function removeImageQuietly(tag: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
}

function imageRow(page: Page, text: string) {
  return page.locator('.ui-data-table__row', { hasText: text });
}

function searchField(page: Page) {
  return page.getByPlaceholder('Search reference or digest…');
}

/**
 * Opens one of the image's four analyses from the row's own overflow menu — the entry point they all
 * have now that they are the screen's views rather than the detail panel's
 * (images/specs/images-screen.md). The opening is retried as a whole: the list keeps re-reading from
 * the daemon's own events, and a re-read that replaces the row takes its trigger — and with it the
 * menu — as it is meant to (ui-library/specs/menu.md).
 */
async function chooseRowAction(page: Page, row: ReturnType<typeof imageRow>, label: string): Promise<void> {
  await expect(async () => {
    await row.getByRole('button', { name: /^More actions for / }).click();
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

function filesystemBrowserModal(page: Page, title: string) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: title }) });
}

function treeRow(modal: ReturnType<typeof filesystemBrowserModal>, name: string) {
  return modal.locator('.ui-tree-view__row', { hasText: name });
}

/** Opens the browser for the given already-listed image tag and runs a fresh, forced extraction. */
async function openAndExtract(page: Page, tag: string) {
  await page.reload();
  await searchField(page).fill(tag);
  const row = imageRow(page, tag);
  await expect(row).toBeVisible({ timeout: 10_000 });
  // The row's own menu entry, with no row selected and no detail panel open. The button clicked
  // straight after is a different control with the same words: the extraction prompt *inside* the
  // browser view, which is why it is scoped to the modal (filesystem-browser.md).
  await chooseRowAction(page, row, 'Browse filesystem…');
  const modal = filesystemBrowserModal(page, `Filesystem — ${tag}`);
  await modal.getByRole('button', { name: 'Browse filesystem…' }).click();
  const confirmHeading = page.getByRole('heading', { name: `Confirm: ${tag}` });
  await expect(confirmHeading).toBeVisible();
  await confirmHeading.locator('xpath=..').getByRole('button', { name: 'Extract' }).click();
  const progressDialog = page.getByRole('heading', { name: 'Extracting the filesystem' }).locator('xpath=..');
  // Re-pointed at the dialog's own dismissal: the completion is stated while it is still there, and
  // it then leaves with nothing pressed (progress_completion_autoclose/REQ-18, REQ-24). The `Close`
  // press that used to be here would now race that dismissal.
  await expectCompletedThenSelfDismissed(progressDialog, 20_000);
  // Every fixture file lives under /data; expanding it once exposes them all to the row locators below.
  await treeRow(modal, 'data').locator('.ui-tree-view__caret').click();
  await expect(treeRow(modal, 'hello.txt')).toBeVisible();
  return modal;
}

const TAG = `vexel-e2e-fsops-${Date.now()}:v1`;

test.beforeAll(async () => {
  await buildImage(
    TAG,
    [
      'FROM alpine:3.20',
      'RUN mkdir -p /data/nested',
      "RUN printf 'hello world' > /data/hello.txt",
      "RUN printf '\\000\\001binarycontent' > /data/binary.bin",
      "RUN yes 'line of readable text content for the truncation bound test' | head -c 300000 > /data/big.txt",
      // An absolute symlink target (REQ-62): must be shown/served as this tree's own content, never
      // the host's, and never leak an absolute path into a produced archive.
      'RUN ln -s /etc/passwd /data/link-absolute',
      // A relative chain climbing past the tree root: must be refused at extraction time and
      // reported to the operator, never silently dropped.
      'RUN ln -s ../../../../etc/shadow /data/nested/link-escape',
      '',
    ].join('\n'),
  );
});

test.afterAll(async () => {
  await removeImageQuietly(TAG);
});

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-docker_management_app/REQ-58, plan-docker_management_app/REQ-62 — a selected entry shows its
// full metadata, a selected symlink additionally shows its (already-contained) target, and the
// operator is told an entry was refused for attempting to leave the extracted tree.
test('shows an entry\'s full metadata, a symlink\'s target, and the refusal notice for an escaping symlink', async ({ page }) => {
  const modal = await openAndExtract(page, TAG);

  await expect(modal.getByText(/refused because/)).toBeVisible();
  await expect(modal.getByText(/leave the extracted tree/)).toBeVisible();

  await treeRow(modal, 'hello.txt').click();
  await expect(modal.getByText('Path', { exact: true })).toBeVisible();
  await expect(modal.getByText('/data/hello.txt')).toBeVisible();
  await expect(modal.getByText('file', { exact: true })).toBeVisible();
  await expect(modal.getByText('Permissions', { exact: true })).toBeVisible();
  await expect(modal.getByText('Owner (uid:gid)', { exact: true })).toBeVisible();
  await expect(modal.getByText('Modified', { exact: true })).toBeVisible();

  await treeRow(modal, 'link-absolute').click();
  await expect(modal.getByText('Link target', { exact: true })).toBeVisible();
  await expect(modal.getByText('symlink', { exact: true })).toBeVisible();
});

// plan-docker_management_app/REQ-59 — a text file previews as text, overridable to hex, and an
// oversized file states its truncation.
test('previews a text file, overrides it to hex, and states the truncation of an oversized file', async ({ page }) => {
  const modal = await openAndExtract(page, TAG);

  await treeRow(modal, 'hello.txt').click();
  await expect(modal.getByText('hello world')).toBeVisible();

  await modal.getByRole('button', { name: 'Hex' }).click();
  await expect(modal.getByText(/68 65 6c 6c 6f/i)).toBeVisible();
  // Not "the words 'hello world' are gone from the dialog": a hex dump ends
  // each row with its own printable-ASCII column (content-viewer.md, "offset,
  // hex bytes, ASCII column per line"), so `|hello world|` is *expected* on
  // screen in hex mode — asserting its absence asserted against the contract.
  // What the override changes is the rendering, so the rendering is what is
  // checked: the line-numbered text view is no longer mounted.
  await expect(modal.locator('.ui-content-viewer__text')).toHaveCount(0);

  await treeRow(modal, 'big.txt').click();
  await expect(modal.getByText(/Truncated/)).toBeVisible();
});

// plan-docker_management_app/REQ-60 — searching by a name fragment reveals the matching entry in
// its position in the tree.
test('searching by a name fragment reveals the matching entry', async ({ page }) => {
  const modal = await openAndExtract(page, TAG);

  await modal.getByPlaceholder('Search files by name or path…').fill('hello');
  await expect(modal.getByText('/data/hello.txt')).toBeVisible();
});

// plan-docker_management_app/REQ-61, plan-docker_management_app/REQ-62 — a single file downloads
// through the browser under its own name, a subtree downloads as one archive with the outcome
// reported first, and no screen anywhere offers a host destination path.
test('downloads a single file and a subtree through the browser, reporting the archive outcome, with no destination-path field anywhere', async ({ page }) => {
  const modal = await openAndExtract(page, TAG);

  await treeRow(modal, 'hello.txt').click();
  const fileDownloadPromise = page.waitForEvent('download');
  await modal.getByRole('button', { name: 'Download', exact: true }).click();
  const fileDownload = await fileDownloadPromise;
  expect(fileDownload.suggestedFilename()).toBe('hello.txt');

  const subtreeDownloadPromise = page.waitForEvent('download');
  await modal.getByRole('button', { name: 'Download whole filesystem…' }).click();
  await expect(page.locator('.ui-toast-viewport')).toContainText('Archive ready');
  await expect(page.locator('.ui-toast-viewport')).toContainText(/files?,/);
  await subtreeDownloadPromise;

  // The withdrawn design offered a destination path typed by the operator; REQ-61/REQ-62 replace it
  // with a plain browser download, so no such field may exist anywhere in this screen.
  await expect(modal.getByPlaceholder(/destination|host path/i)).toHaveCount(0);
  await expect(modal.getByText(/destination path/i)).toHaveCount(0);
});
