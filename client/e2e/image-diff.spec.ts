import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const execFileAsync = promisify(execFile);

// Every test compares the very same fixture pair; running serially avoids
// racing the single-pair comparison cache and keeps the two (~seconds-long)
// image builds to one run for the whole file.
test.describe.configure({ mode: 'serial' });

async function buildImage(tag: string, dockerfile: string): Promise<void> {
  const contextDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-diff-'));
  await writeFile(join(contextDir, 'Dockerfile'), dockerfile);
  await execFileAsync('docker', ['build', '-t', tag, contextDir]);
}

async function removeImageQuietly(tag: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
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

function diffModal(page: Page) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Compare filesystems' }) });
}

/** Confirms the cost-warning dialog, then waits for the comparison to end and closes the progress dialog. */
async function confirmAndFinishComparison(page: Page, modal: ReturnType<typeof diffModal>): Promise<void> {
  await modal.getByRole('button', { name: 'Compare' }).click();
  const confirmHeading = page.getByRole('heading', { name: /^Confirm: / });
  await expect(confirmHeading).toBeVisible();
  await confirmHeading.locator('xpath=..').getByRole('button', { name: 'Compare' }).click();

  const progressDialog = page.getByRole('heading', { name: 'Comparing filesystems' }).locator('xpath=..');
  await expect(progressDialog.getByRole('button', { name: 'Close' })).toBeVisible({ timeout: 30_000 });
  await progressDialog.getByRole('button', { name: 'Close' }).click();
}

// Two small scratch images: image A has a path only it has and a "changed.txt" with its own
// content, image B has a path only it has and "changed.txt" with different (same-length) content —
// enough to exercise an added, a removed and a changed path end to end (REQ-63, REQ-64), without
// duplicating the exhaustive per-nature coverage already exercised at the API level.
const TAG_A = `vexel-e2e-diff-a-${Date.now()}:v1`;
const TAG_B = `vexel-e2e-diff-b-${Date.now()}:v1`;
// A third image, deliberately never compared in the earlier tests: comparing it against A always
// starts a genuinely fresh, uncached extraction, so the cancel test below has a real window in
// which the progress dialog is still active — comparing the already-cached A/B pair again finishes
// near instantly and leaves no such window.
const TAG_C = `vexel-e2e-diff-c-${Date.now()}:v1`;

test.beforeAll(async () => {
  await buildImage(
    TAG_A,
    ['FROM registry:2 AS builder', "RUN mkdir -p /out && printf 'only-in-a' > /out/only-a.txt && printf 'content-A' > /out/changed.txt", 'FROM scratch', 'COPY --from=builder /out/ /', ''].join(
      '\n',
    ),
  );
  await buildImage(
    TAG_B,
    ['FROM registry:2 AS builder', "RUN mkdir -p /out && printf 'only-in-b' > /out/only-b.txt && printf 'content-B' > /out/changed.txt", 'FROM scratch', 'COPY --from=builder /out/ /', ''].join(
      '\n',
    ),
  );
  await buildImage(
    TAG_C,
    ['FROM registry:2 AS builder', "RUN mkdir -p /out && printf 'only-in-c' > /out/only-c.txt", 'FROM scratch', 'COPY --from=builder /out/ /', ''].join('\n'),
  );
});

test.afterAll(async () => {
  await removeImageQuietly(TAG_A);
  await removeImageQuietly(TAG_B);
  await removeImageQuietly(TAG_C);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Images & layers/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-docker_management_app/REQ-63, plan-docker_management_app/REQ-64 — starting a comparison from
// an image's own "Compare with…" action, picking the second side, warns about the cost, then shows
// the difference as a navigable tree; selecting the changed path states what changed and previews
// both sides side by side.
test('compares two images from "Compare with…", browses the diff tree, and previews a changed path side by side', async ({ page }) => {
  await searchField(page).fill(TAG_A);
  const rowA = imageRow(page, TAG_A);
  await expect(rowA).toBeVisible({ timeout: 10_000 });
  await selectRow(rowA);
  await page.getByRole('button', { name: 'Compare with…' }).click();

  const modal = diffModal(page);
  await expect(modal).toBeVisible();
  // "Compare with…" pre-picks this image as the first side (images/specs/image-diff-view.md).
  await expect(modal.getByLabel('First image')).toHaveValue(/./);
  await modal.getByLabel('Second image').selectOption({ label: TAG_B });

  await confirmAndFinishComparison(page, modal);

  await expect(modal.getByText('1 added · 1 removed · 1 changed')).toBeVisible();
  const treeRow = (name: string) => modal.locator('.ui-tree-view__row', { hasText: name });
  await expect(treeRow('only-a.txt')).toBeVisible();
  await expect(treeRow('only-b.txt')).toBeVisible();
  await expect(treeRow('changed.txt')).toBeVisible();

  await treeRow('changed.txt').click();
  // images/specs/image-diff-view.md — the changed aspects are named as badges (equal-size content differs -> "Content" alone here).
  await expect(modal.getByText('Content', { exact: true })).toBeVisible();
  await expect(modal.getByText('content-A')).toBeVisible();
  await expect(modal.getByText('content-B')).toBeVisible();
});

// plan-docker_management_app/REQ-63 — a two-image bulk selection opens the diff view with both
// images already picked, via the BulkActionBar's "Compare filesystems…" action.
test('starts a comparison from a two-image bulk selection, pre-picked with both', async ({ page }) => {
  await searchField(page).fill('vexel-e2e-diff-');
  await expect(imageRow(page, TAG_A)).toBeVisible({ timeout: 10_000 });
  await expect(imageRow(page, TAG_B)).toBeVisible({ timeout: 10_000 });
  await imageRow(page, TAG_A).getByRole('checkbox').click();
  await imageRow(page, TAG_B).getByRole('checkbox').click();

  await page.getByRole('button', { name: 'Compare filesystems…' }).click();

  const modal = diffModal(page);
  await expect(modal).toBeVisible();
  await expect(modal.getByLabel('First image')).toHaveValue(/./);
  await expect(modal.getByLabel('Second image')).toHaveValue(/./);

  await confirmAndFinishComparison(page, modal);

  await expect(modal.getByText('1 added · 1 removed · 1 changed')).toBeVisible();
});

// image-diff-view.md — Cancel discards the comparison run and returns to the "no comparison yet"
// picker, rather than leaving a half-finished result on screen.
test('cancelling the comparison progress dialog discards the run and returns to the picker', async ({ page }) => {
  await searchField(page).fill(TAG_A);
  const rowA = imageRow(page, TAG_A);
  await expect(rowA).toBeVisible({ timeout: 10_000 });
  await selectRow(rowA);
  await page.getByRole('button', { name: 'Compare with…' }).click();

  const modal = diffModal(page);
  await modal.getByLabel('Second image').selectOption({ label: TAG_C });
  await modal.getByRole('button', { name: 'Compare' }).click();
  const confirmHeading = page.getByRole('heading', { name: /^Confirm: / });
  await confirmHeading.locator('xpath=..').getByRole('button', { name: 'Compare' }).click();

  const progressHeading = page.getByRole('heading', { name: 'Comparing filesystems' });
  await expect(progressHeading).toBeVisible();
  await progressHeading.locator('xpath=..').getByRole('button', { name: 'Cancel' }).click();

  await expect(progressHeading).toHaveCount(0);
  await expect(modal.getByText('No comparison yet')).toBeVisible();
});
