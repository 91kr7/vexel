import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from './support/test.js';

import { openApp, ownershipArgs } from './support/fixtures.js';
import { expectCompletedThenSelfDismissed } from './support/progress-completion.js';
import { expectRegionPinnedAcrossViewportHeights } from './support/pinned-region.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

// Every test compares the very same fixture pair; running serially avoids
// racing the single-pair comparison cache and keeps the two (~seconds-long)
// image builds to one run for the whole file.
test.describe.configure({ mode: 'serial' });

async function buildImage(tag: string, dockerfile: string): Promise<void> {
  const contextDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-diff-'));
  await writeFile(join(contextDir, 'Dockerfile'), dockerfile);
  await execFileAsync('docker', ['build', ...ownershipArgs(tag), '-t', tag, contextDir]);
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
 * Opens one of the image's four analyses from the row's own overflow menu — the entry point they all
 * have now that they are the screen's views rather than the detail panel's
 * (images/specs/images-screen.md).
 */
async function chooseRowAction(page: Page, row: ReturnType<typeof imageRow>, label: string): Promise<void> {
  // Opening and choosing are one retried gesture, over a settled list: the list keeps re-reading
  // from the daemon's own events, and every one of the menu's specified dismissals
  // (ui-library/specs/menu.md) lands between the two halves when they are retried separately.
  await chooseFromRowOverflowMenu(page, row, label);
}

/** The image id the daemon holds a reference under — what the view's pick-lists carry as their value. */
async function imageIdOf(reference: string): Promise<string> {
  const { stdout } = await execFileAsync('docker', ['image', 'inspect', reference, '--format', '{{.Id}}']);
  return stdout.trim();
}

function diffModal(page: Page) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Compare filesystems' }) });
}

/** Confirms the cost-warning dialog, then waits for the comparison to end and for its dialog to go. */
async function confirmAndFinishComparison(page: Page, modal: ReturnType<typeof diffModal>): Promise<void> {
  await modal.getByRole('button', { name: 'Compare' }).click();
  const confirmHeading = page.getByRole('heading', { name: /^Confirm: / });
  await expect(confirmHeading).toBeVisible();
  await confirmHeading.locator('xpath=..').getByRole('button', { name: 'Compare' }).click();

  const progressDialog = page.getByRole('heading', { name: 'Comparing filesystems' }).locator('xpath=..');
  // Re-pointed at the dialog's own dismissal: the completion is stated while it is still there, and
  // it then leaves with nothing pressed (progress_completion_autoclose/REQ-18, REQ-24). The `Close`
  // press that used to be here would now race that dismissal.
  await expectCompletedThenSelfDismissed(progressDialog, 30_000);
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

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'images-layers');
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

  // Started from the row's own menu entry, with no row selected and no detail panel open — the case
  // that did not exist while this view was the panel's (panel_actions_to_menu/REQ-13, REQ-30).
  await chooseRowAction(page, rowA, 'Compare with…');

  const modal = diffModal(page);
  await expect(modal).toBeVisible();
  await expect(page.locator('.ui-detail-panel')).toHaveCount(0);
  // "Compare with…" pre-picks this image as the first side (images/specs/image-diff-view.md).
  await expect(modal.getByLabel('First image')).toHaveValue(await imageIdOf(TAG_A));
  // REQ-23 — and the view **states** which image that is, by the reference the row shows, so the
  // operator reads which side is theirs rather than inferring it from a pre-filled control.
  await expect(modal.getByText(`Started from ${TAG_A}`, { exact: false })).toBeVisible();
  // The right-hand operand starts unchosen, and is picked inside the view (REQ-23, REQ-24).
  await expect(modal.getByLabel('Second image')).toHaveValue('');
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

  // plan-docker_management_app-filesystem_browser_layout/REQ-20 — this dialog is deliberately out of
  // that report's scope: its two-pane region is still pinned in feature code (`maxHeight="480px"`,
  // and `"360px"` on the side-by-side viewer) and must measure the same at both viewport heights.
  // See `support/pinned-region.ts` for the recorded breach and for when this assertion is deleted.
  await expectRegionPinnedAcrossViewportHeights(page, modal.locator('.ui-split-pane').first(), 'Images & layers → Compare filesystems');
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
  // Selected first, then started from that same row's menu: a panel open underneath changes nothing
  // about which image the comparison is started from (panel_actions_to_menu/REQ-13, REQ-14).
  await selectRow(rowA);
  await chooseRowAction(page, rowA, 'Compare with…');

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

// plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-35 — one view serves both shapes of the
// operation, in either order and repeatedly, and neither leaves its operands behind for a later opening of the other:
// the row shape supplies the first operand alone and says so, the bulk shape supplies both and says nothing.
test('serves the row shape and the bulk shape one after the other, neither leaking its operands into the other', async ({ page }) => {
  const idA = await imageIdOf(TAG_A);
  const idB = await imageIdOf(TAG_B);
  await searchField(page).fill('vexel-e2e-diff-');
  await expect(imageRow(page, TAG_A)).toBeVisible({ timeout: 10_000 });
  await expect(imageRow(page, TAG_B)).toBeVisible({ timeout: 10_000 });
  const modal = diffModal(page);

  // The row shape: one operand, stated in words, the second unchosen.
  await chooseRowAction(page, imageRow(page, TAG_A), 'Compare with…');
  await expect(modal.getByLabel('First image')).toHaveValue(idA);
  await expect(modal.getByLabel('Second image')).toHaveValue('');
  await expect(modal.getByText(`Started from ${TAG_A}`, { exact: false })).toBeVisible();
  await page.locator('.ui-modal-overlay').click({ position: { x: 5, y: 5 } });
  await expect(modal).toHaveCount(0);

  // The bulk shape, straight after it: both operands pre-chosen, and no "started from" line — the
  // comparison was not started from a row, and the second operand is genuinely the checked one, not
  // a leftover of the opening before.
  await imageRow(page, TAG_A).getByRole('checkbox').click();
  await imageRow(page, TAG_B).getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Compare filesystems…' }).click();
  await expect(modal.getByLabel('First image')).toHaveValue(idA);
  await expect(modal.getByLabel('Second image')).toHaveValue(idB);
  await expect(modal.getByText('Started from', { exact: false })).toHaveCount(0);
  await page.locator('.ui-modal-overlay').click({ position: { x: 5, y: 5 } });
  await expect(modal).toHaveCount(0);

  // And the row shape again, from the other image: the bulk shape's second operand did not survive.
  await chooseRowAction(page, imageRow(page, TAG_B), 'Compare with…');
  await expect(modal.getByLabel('First image')).toHaveValue(idB);
  await expect(modal.getByLabel('Second image')).toHaveValue('');
  await expect(modal.getByText(`Started from ${TAG_B}`, { exact: false })).toBeVisible();
});
