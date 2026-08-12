import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './support/test.js';
import { navEntry, openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { PULLABLE_REPOSITORY, TINY_IMAGE, ensureImage, ensurePullableImage } from '../../server/test/support/base-images.js';

// Every test in this file exercises the daemon's real pull/tag/push/remove
// operations one at a time (a shared registry-facing resource), so they run
// serially rather than in Playwright's default fully-parallel mode.
test.describe.configure({ mode: 'serial' });

async function tagFromPostgres(tag: string): Promise<void> {
  await execFileAsync('docker', ['tag', 'alpine:3.20', tag]);
}

async function removeTagQuietly(tag: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
}

/** A standalone single-tag image (its own id, unrelated to any other locally tagged image). */
async function createStandaloneImage(tag: string, containerName: string): Promise<void> {
  await createFromTinyImage(containerName);
  await execFileAsync('docker', ['commit', containerName, tag]);
}

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

async function removeStandaloneImage(tag: string, containerName: string): Promise<void> {
  await removeTagQuietly(tag);
  await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
}

// The images list is a DataTable laid out like the containers table
// (images/specs/images-screen.md): one `.ui-data-table__row` per image, its
// actions inside the row, and the expanded detail panel as a sibling element
// after the row — not nested inside it.
function imageRow(page: Page, text: string) {
  return page.locator('.ui-data-table__row', { hasText: text });
}

/** Selects a row by clicking a non-action cell (the action group swallows its own clicks). */
async function selectRow(row: ReturnType<typeof imageRow>): Promise<void> {
  await row.locator('.ui-data-table__cell').first().click();
}

/**
 * The row's overflow control — the only control the action area carries now
 * (images/specs/images-screen.md). Matched by pattern rather than by the exact
 * title, because a row's title is the image's tags joined and the daemon's own
 * ordering of them is not this suite's to predict.
 */
function rowOverflow(row: ReturnType<typeof imageRow>) {
  return row.getByRole('button', { name: /^More actions for / });
}

function menuEntry(page: Page, label: string) {
  return page.getByRole('menuitem', { name: label, exact: true });
}

async function openRowOverflow(page: Page, row: ReturnType<typeof imageRow>): Promise<void> {
  await rowOverflow(row).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

function expandedPanel(page: Page) {
  return page.locator('.ui-data-table__expanded');
}

/** The row the open panel is rendered directly below — which image the panel is pointing at. */
async function panelOwner(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('.ui-data-table__expanded')?.previousElementSibling?.textContent ?? '');
}

function searchField(page: Page) {
  return page.getByPlaceholder('Search reference or digest…');
}

// A disposable, unauthenticated local registry: lets the push test below exercise a real registry
// round trip without depending on any external/authenticated registry.
const PUSH_REGISTRY_PORT = 5082;
let pushRegistryContainerId = '';

test.beforeAll(async () => {
  const { stdout } = await execFileAsync('docker', ['run', '-d', '-p', `${PUSH_REGISTRY_PORT}:5000`, ...ownershipArgs('registry'), 'registry:2']);
  pushRegistryContainerId = stdout.trim();
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      const response = await fetch(`http://localhost:${PUSH_REGISTRY_PORT}/v2/`);
      if (response.ok) return;
    } catch {
      // registry not ready yet
    }
    if (Date.now() > deadline) throw new Error('local test registry did not become ready in time');
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
});

test.afterAll(async () => {
  await execFileAsync('docker', ['rm', '-fv', pushRegistryContainerId]).catch(() => undefined);
});

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-docker_management_app/REQ-37 — the images screen lists local images with repository:tag, digest, platform, size and creation age
test('lists a local image in a table row with its reference, digest, platform, size and creation age', async ({ page }) => {
  // Built locally on purpose: a multi-platform image pulled as an index can be
  // stored by the daemon without a platform-specific config, and then reports
  // neither an architecture nor a creation date of its own.
  const containerName = `vexel-e2e-list-src-${Date.now()}`;
  const tag = `vexel-e2e-list-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();

    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(/ago/);
    await expect(row).toContainText(/B|KB|MB|GB/);
    await expect(row).toContainText('linux/');
    await expect(row).toContainText('sha256:');
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-37 — the columns are named by a header row, as on the containers table
test('shows a header row naming every image column', async ({ page }) => {
  const headers = page.locator('.ui-data-table__header-cell');

  // Two unnamed cells lead the row: the bulk-selection checkbox
  // (ui-library/specs/data-table.md) and the status dot.
  await expect(headers).toHaveText(['', '', 'REPOSITORY:TAG', 'TAGS', 'DIGEST', 'PLATFORM', 'SIZE', 'CREATED', 'ACTIONS']);
});

// plan-docker_management_app-image_row_actions/REQ-1, REQ-2, REQ-3 — the row's action area holds one control, the one
// that opens the row's menu: it names its own image, announces that it opens a menu and whether that menu is open, and
// no other action-bearing control is anywhere on the row
test('the row carries the overflow control alone, named after its image, in the last cell', async ({ page }) => {
  const containerName = `vexel-e2e-actions-src-${Date.now()}`;
  const tag = `vexel-e2e-actions-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // No row is expanded at this point: the control must already be there, without hovering.
    await expect(expandedPanel(page)).toHaveCount(0);
    const controls = row.locator('.ui-action-button-group').getByRole('button');
    await expect(controls).toHaveCount(1);
    await expect(controls.first()).toHaveAccessibleName(`More actions for ${tag}`);
    await expect(controls.first()).toHaveAttribute('aria-haspopup', 'menu');
    await expect(controls.first()).toHaveAttribute('aria-expanded', 'false');
    // The action area sits in the row's final cell, and it is the row's only one.
    await expect(row.locator('.ui-data-table__cell').last().locator('.ui-action-button-group')).toHaveCount(1);
    await expect(row.getByRole('button')).toHaveCount(1);
    for (const label of ['run', 'tag', 'untag', 'push', 'save', 'remove']) {
      await expect(row.getByRole('button', { name: label, exact: true })).toHaveCount(0);
    }

    // Opening the menu never also selects the row.
    await openRowOverflow(page, row);
    await expect(controls.first()).toHaveAttribute('aria-expanded', 'true');
    await expect(expandedPanel(page)).toHaveCount(0);
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});

// plan-docker_management_app-image_row_actions/REQ-4, REQ-5, REQ-6, REQ-7 — the menu lists exactly six entries, in the
// row's own order, with Remove last, set apart, in the destructive tone and carrying `rmi`; no other entry has a hint
test('the row menu lists exactly Run…, Tag…, Untag, Push…, Save and Remove, in that order', async ({ page }) => {
  const containerName = `vexel-e2e-entries-src-${Date.now()}`;
  const tag = `vexel-e2e-entries-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await openRowOverflow(page, row);

    const entries = page.getByRole('menuitem');
    await expect(entries).toHaveCount(6);
    await expect(entries.nth(0)).toHaveText('Run…');
    await expect(entries.nth(1)).toHaveText('Tag…');
    await expect(entries.nth(2)).toHaveText('Untag');
    await expect(entries.nth(3)).toHaveText('Push…');
    await expect(entries.nth(4)).toHaveText('Save');
    await expect(entries.nth(5)).toContainText('Remove');
    await expect(entries.nth(5)).toContainText('rmi');
    await expect(entries.nth(5)).toHaveClass(/destructive/);
    await expect(page.getByRole('menu').locator('[role="separator"]')).toHaveCount(1);
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});

// plan-docker_management_app-image_row_actions/REQ-12 — at most one row's menu is open at a time, and it is
// unambiguously attached to the row it belongs to
test('opening a second row menu closes the first', async ({ page }) => {
  const runId = Date.now();
  const firstContainer = `vexel-e2e-onemenu-src-a-${runId}`;
  const secondContainer = `vexel-e2e-onemenu-src-b-${runId}`;
  const firstTag = `vexel-e2e-onemenu-${runId}-a:v1`;
  const secondTag = `vexel-e2e-onemenu-${runId}-b:v1`;
  try {
    await createStandaloneImage(firstTag, firstContainer);
    await createStandaloneImage(secondTag, secondContainer);
    await page.reload();
    await searchField(page).fill(`vexel-e2e-onemenu-${runId}`);
    const first = imageRow(page, firstTag);
    const second = imageRow(page, secondTag);
    await expect(first).toBeVisible({ timeout: 10_000 });
    await expect(second).toBeVisible({ timeout: 10_000 });

    await openRowOverflow(page, first);
    await rowOverflow(second).click();

    await expect(page.getByRole('menu')).toHaveCount(1);
    await expect(page.getByRole('menu')).toHaveAccessibleName(`More actions for ${secondTag}`);
    await expect(rowOverflow(first)).toHaveAttribute('aria-expanded', 'false');
  } finally {
    await removeStandaloneImage(firstTag, firstContainer);
    await removeStandaloneImage(secondTag, secondContainer);
  }
});

// plan-docker_management_app-image_row_actions/REQ-13 — the menu closes on any dismissal and hands the focus back to
// the control that opened it
test('the row menu closes on Escape, on an outside click and on choosing an entry, with focus back on its control', async ({ page }) => {
  const containerName = `vexel-e2e-dismiss-src-${Date.now()}`;
  const tag = `vexel-e2e-dismiss-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    const menu = page.getByRole('menu');

    await openRowOverflow(page, row);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(rowOverflow(row)).toBeFocused();

    await openRowOverflow(page, row);
    await page.getByRole('heading', { level: 1, name: 'Images & layers' }).click();
    await expect(menu).toHaveCount(0);
    await expect(rowOverflow(row)).toBeFocused();

    await openRowOverflow(page, row);
    await menuEntry(page, 'Tag…').click();
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'New reference' })).toBeVisible();
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});

// plan-docker_management_app-image_row_actions/REQ-14 — an open menu is shown in full wherever its row sits, including
// the last rows of a list long enough to scroll, and is never clipped by the table
test('a menu opened on the last visible row of a scrolling list is shown in full', async ({ page }) => {
  const runId = Date.now();
  const stem = `vexel-e2e-clip-${runId}`;
  const fixtures = [1, 2, 3, 4].map((index) => ({ tag: `${stem}-${index}:v1`, containerName: `${stem}-src-${index}` }));
  const tags = fixtures.map((fixture) => fixture.tag);
  try {
    for (const fixture of fixtures) await createStandaloneImage(fixture.tag, fixture.containerName);
    await page.reload();
    // A short viewport, so the table has to scroll and the last row sits against
    // the bottom edge — the case the popup has to flip above its trigger for.
    await page.setViewportSize({ width: 1280, height: 520 });
    await searchField(page).fill(stem);
    const last = imageRow(page, tags[tags.length - 1]!);
    await expect(last).toBeVisible({ timeout: 10_000 });
    await last.scrollIntoViewIfNeeded();

    await openRowOverflow(page, last);

    // Every entry of it, not merely the popup's first pixels.
    for (const label of ['Run…', 'Tag…', 'Untag', 'Push…', 'Save', 'Remove']) {
      await expect(menuEntry(page, label)).toBeInViewport({ ratio: 1 });
    }
  } finally {
    for (const fixture of fixtures) await removeStandaloneImage(fixture.tag, fixture.containerName);
  }
});

// plan-docker_management_app-image_row_actions/REQ-15 — the menu is fully operable without a pointer: the control is
// reachable and activatable from the keyboard, the arrows walk the entries, and an entry is activated from there
test('the row menu is reachable, walked and activated from the keyboard alone', async ({ page }) => {
  const containerName = `vexel-e2e-keyboard-src-${Date.now()}`;
  const tag = `vexel-e2e-keyboard-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Tab from the control before it on the row: the overflow control is one stop in tab order.
    // Retried as a whole, because the list keeps re-reading from daemon events and a re-render
    // between the focus and the key drops the focus on the floor.
    await expect(async () => {
      await row.getByRole('checkbox').press('Tab');
      await expect(rowOverflow(row)).toBeFocused({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    await page.keyboard.press('Enter');
    await expect(menuEntry(page, 'Run…')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menuEntry(page, 'Tag…')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(menuEntry(page, 'Run…')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(rowOverflow(row)).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'New reference' })).toBeVisible();
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});

// plan-docker_management_app-image_row_actions/REQ-16, REQ-33 — the list keeps re-reading from daemon events while a
// menu is open, and the open menu stays bound to the image it was opened for
test('the list keeps updating while a menu is open and the menu stays bound to its own image', async ({ page }) => {
  const runId = Date.now();
  const stem = `vexel-e2e-live-${runId}`;
  const ownerContainer = `${stem}-src-owner`;
  const otherContainer = `${stem}-src-other`;
  const ownerTag = `${stem}-owner:v1`;
  const otherTag = `${stem}-other:v1`;
  try {
    await createStandaloneImage(ownerTag, ownerContainer);
    await createStandaloneImage(otherTag, otherContainer);
    await page.reload();
    await searchField(page).fill(stem);
    const owner = imageRow(page, ownerTag);
    await expect(owner).toBeVisible({ timeout: 10_000 });
    await expect(imageRow(page, otherTag)).toBeVisible({ timeout: 10_000 });

    await openRowOverflow(page, owner);

    // Untagged from outside the application, exactly as the daemon's own events reach it.
    await removeTagQuietly(otherTag);
    await expect(imageRow(page, otherTag)).toHaveCount(0, { timeout: 15_000 });

    // The menu is still the one opened for its own image, and acts on it.
    await expect(page.getByRole('menu')).toHaveAccessibleName(`More actions for ${ownerTag}`);
    await menuEntry(page, 'Tag…').click();
    await expect(page.getByRole('heading', { name: `Tag ${ownerTag}` })).toBeVisible();
  } finally {
    await removeStandaloneImage(ownerTag, ownerContainer);
    await removeStandaloneImage(otherTag, otherContainer);
  }
});

// plan-docker_management_app-image_row_actions/REQ-19 — the list's multi-selection is untouched: the leading checkbox
// column and the bulk action bar behave exactly as before, and neither moved into the row's menu
test('the checkbox column and the bulk action bar are untouched by the row menu', async ({ page }) => {
  const runId = Date.now();
  const firstContainer = `vexel-e2e-bulk-src-a-${runId}`;
  const secondContainer = `vexel-e2e-bulk-src-b-${runId}`;
  const firstTag = `vexel-e2e-bulk-${runId}-a:v1`;
  const secondTag = `vexel-e2e-bulk-${runId}-b:v1`;
  try {
    await createStandaloneImage(firstTag, firstContainer);
    await createStandaloneImage(secondTag, secondContainer);
    await page.reload();
    await searchField(page).fill(`vexel-e2e-bulk-${runId}`);
    await expect(imageRow(page, firstTag)).toBeVisible({ timeout: 10_000 });
    await expect(imageRow(page, secondTag)).toBeVisible({ timeout: 10_000 });

    await imageRow(page, firstTag).getByRole('checkbox').check();
    await expect(page.getByRole('button', { name: 'Save to tarball…' })).toBeEnabled();
    await imageRow(page, secondTag).getByRole('checkbox').check();

    await expect(page.getByRole('button', { name: 'Compare filesystems…' })).toBeEnabled();
    // Neither bulk action moved into the row's menu.
    await openRowOverflow(page, imageRow(page, firstTag));
    await expect(page.getByRole('menuitem', { name: /tarball|Compare/ })).toHaveCount(0);
  } finally {
    await removeStandaloneImage(firstTag, firstContainer);
    await removeStandaloneImage(secondTag, secondContainer);
  }
});

// plan-docker_management_app/REQ-41 — the image list can be text-searched by reference
test('searching narrows the list to images whose reference matches the search text', async ({ page }) => {
  const tag = `vexel-e2e-search-${Date.now()}:v1`;
  try {
    await tagFromPostgres(tag);

    await searchField(page).fill(tag);

    await expect(imageRow(page, tag)).toBeVisible({ timeout: 10_000 });
    const otherRows = page.locator('.ui-data-table__row').filter({ hasNotText: tag });
    await expect(otherRows).toHaveCount(0);
  } finally {
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-41 — the search also matches by digest
test('searching by digest also narrows the list to the matching image', async ({ page }) => {
  const { stdout } = await execFileAsync('docker', ['inspect', 'alpine:3.20', '--format', '{{index .RepoDigests 0}}']);
  const fullDigest = stdout.trim().split('@')[1]!; // e.g. sha256:f8e2cc2a36dd...
  const shortDigest = fullDigest.slice(0, 19); // "sha256:" (7) + 12 hex chars

  await searchField(page).fill(shortDigest);

  await expect(imageRow(page, 'alpine')).toBeVisible({ timeout: 10_000 });
});

// plan-docker_management_app/REQ-39 — an image can be tagged with a new reference, reflected in the list
test('tagging an image adds the new reference and confirms with a success toast', async ({ page }) => {
  const containerName = `vexel-e2e-tagsrc-${Date.now()}`;
  const sourceTag = `vexel-e2e-tagsrc-${Date.now()}:v1`;
  const newTag = `vexel-e2e-tagged-${Date.now()}:v1`;
  try {
    await createStandaloneImage(sourceTag, containerName);
    await page.reload();
    await searchField(page).fill(sourceTag);
    const row = imageRow(page, sourceTag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await openRowOverflow(page, row);
    await menuEntry(page, 'Tag…').click();
    const dialogHeading = page.getByRole('heading', { name: `Tag ${sourceTag}` });
    const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
    await dialog.getByRole('textbox', { name: 'New reference' }).fill(newTag);
    await dialog.getByRole('button', { name: 'Tag' }).click();

    await expect(page.locator('.ui-toast-viewport')).toContainText('Image tagged', { timeout: 10_000 });
    await searchField(page).fill(newTag);
    await expect(imageRow(page, newTag)).toBeVisible({ timeout: 10_000 });
  } finally {
    await removeTagQuietly(newTag);
    await removeStandaloneImage(sourceTag, containerName);
  }
});

// plan-docker_management_app/REQ-39 — untagging removes just the chosen reference, leaving the image's other tag in place.
// images-screen.md: with several tags the row's untag action asks which reference to drop.
test('untagging one of several tags removes just that reference, leaving the other tag in place', async ({ page }) => {
  const runId = Date.now();
  const containerName = `vexel-e2e-untag-src-${runId}`;
  const keptTag = `vexel-e2e-untag-${runId}-keep:v1`;
  const removedTag = `vexel-e2e-untag-${runId}-remove:v1`;
  try {
    // A standalone image with exactly the two references under test, so both
    // are visible on the row (the TAGS column shows two badges before it folds
    // the rest into a +N indicator).
    await createStandaloneImage(keptTag, containerName);
    await execFileAsync('docker', ['tag', keptTag, removedTag]);
    await page.reload();
    await searchField(page).fill(`vexel-e2e-untag-${runId}`);

    const row = imageRow(page, keptTag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(removedTag);

    await openRowOverflow(page, row);
    await menuEntry(page, 'Untag').click();
    const dialog = page.locator('.ui-modal');
    await dialog.getByRole('combobox', { name: 'Reference to untag' }).selectOption(removedTag);
    await dialog.getByRole('button', { name: 'Untag' }).click();

    await expect(row).not.toContainText(removedTag, { timeout: 10_000 });
    await expect(row).toContainText(keptTag);
  } finally {
    await removeTagQuietly(removedTag);
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await removeTagQuietly(keptTag);
  }
});

// plan-docker_management_app/REQ-39 — untagging an image that has a single tag needs no choice
test('untagging a single-tag image drops its reference straight away', async ({ page }) => {
  const containerName = `vexel-e2e-untag-solo-src-${Date.now()}`;
  const tag = `vexel-e2e-untag-solo-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await openRowOverflow(page, row);
    await menuEntry(page, 'Untag').click();

    await expect(page.locator('.ui-modal')).toHaveCount(0);
    await expect(imageRow(page, tag)).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-37 — a dangling image is marked as such and has no reference to untag or push
test('marks a dangling image with a dangling badge and disables its untag and push actions', async ({ page }) => {
  const containerName = `vexel-e2e-dangling-src-${Date.now()}`;
  const tag = `vexel-e2e-dangling-${Date.now()}:v1`;
  await createFromTinyImage(containerName);
  const { stdout: firstId } = await execFileAsync('docker', ['commit', '--change', 'LABEL step=1', containerName, tag]);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await execFileAsync('docker', ['commit', '--change', 'LABEL step=2', containerName, tag]);
  try {
    await page.reload();
    await searchField(page).fill(firstId.trim().slice(7, 19));
    const row = page.locator('.ui-data-table__row').first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    await expect(row).toContainText('dangling');
    await expect(row).toContainText('<none>');
    // The row carries the same single control a tagged row does (REQ-2).
    await expect(row.locator('.ui-action-button-group').getByRole('button')).toHaveCount(1);

    // The same six entries, in the same order, with Untag and Push… disabled in place and saying
    // why they are unavailable rather than removed (REQ-8, REQ-9).
    await openRowOverflow(page, row);
    const entries = page.getByRole('menuitem');
    await expect(entries).toHaveCount(6);
    await expect(entries.nth(2)).toHaveAccessibleName('Untag');
    await expect(entries.nth(2)).toHaveAttribute('aria-disabled', 'true');
    await expect(entries.nth(2)).toHaveAccessibleDescription(/no tags to untag/i);
    await expect(entries.nth(3)).toHaveAccessibleName('Push…');
    await expect(entries.nth(3)).toHaveAttribute('aria-disabled', 'true');
    await expect(entries.nth(3)).toHaveAccessibleDescription(/no tags to push/i);
    for (const index of [0, 1, 4, 5]) {
      await expect(entries.nth(index)).not.toHaveAttribute('aria-disabled', 'true');
    }
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await execFileAsync('docker', ['rmi', '-f', firstId.trim()]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-39, REQ-6 — removing an image asks for confirmation naming it and performs nothing on cancel
test('removing an image asks for confirmation, does nothing on cancel and removes it on confirm', async ({ page }) => {
  const containerName = `vexel-e2e-remove-src-${Date.now()}`;
  const tag = `vexel-e2e-remove-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Reached from the row's menu now; the confirmation in front of it is unchanged — the menu is
    // a step before it, not instead of it (REQ-11).
    await openRowOverflow(page, row);
    await menuEntry(page, 'Remove').click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${tag}` });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(imageRow(page, tag)).toBeVisible();

    await openRowOverflow(page, row);
    await menuEntry(page, 'Remove').click();
    await expect(confirmHeading).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Remove' }).click();

    await expect(imageRow(page, tag)).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-40 — an image's inspect data (config, env, labels, exposed ports, digest, history) is viewable
test('selecting an image expands its detail panel with structured inspect data and the raw payload', async ({ page }) => {
  const containerName = `vexel-e2e-inspect-src-${Date.now()}`;
  const tag = `vexel-e2e-inspect-${Date.now()}:v1`;
  await createFromTinyImage(containerName);
  await execFileAsync('docker', ['commit', '--change', 'LABEL team=vexel', '--change', 'EXPOSE 9999/tcp', containerName, tag]);
  try {
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await selectRow(row);

    const expanded = expandedPanel(page);
    await expect(expanded).toBeVisible();
    await expect(expanded).toContainText('9999/tcp');
    await expect(expanded).toContainText('vexel');
    await expect(expanded.getByText('History')).toBeVisible();
    await expect(expanded.getByText(/"team":\s*"vexel"/)).toBeVisible();
    // images-screen.md: the expanded region carries the detail panel alone, with no row control
    // of any kind inside it (REQ-1, REQ-17).
    await expect(expanded.locator('.ui-action-button-group')).toHaveCount(0);
    await expect(expanded.getByRole('button', { name: /^More actions for / })).toHaveCount(0);
    for (const label of ['run', 'tag', 'untag', 'push', 'save', 'remove']) {
      await expect(expanded.getByRole('button', { name: label, exact: true })).toHaveCount(0);
    }
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-3 — the images table and the containers table present identically:
// same header row treatment, same column typography, same row height, same hover and selected treatment.
test('the images table and the containers table present with the same header, typography, row height, hover and selected treatment', async ({
  page,
}) => {
  const containerName = `vexel-e2e-homogeneity-${Date.now()}`;
  const tag = `vexel-e2e-homogeneity-${Date.now()}:v1`;
  try {
    await execFileAsync('docker', ['run', '-d', '--name', containerName, ...ownershipArgs(containerName), '--entrypoint', 'sleep', 'alpine:3.20', '300']);
    await tagFromPostgres(tag);

    const measure = async () => {
      const table = page.locator('.ui-data-table');
      await expect(table.locator('.ui-data-table__row').first()).toBeVisible({ timeout: 15_000 });

      const header = await table.locator('.ui-data-table__header').evaluate((node) => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, padding: style.padding, borderBottom: style.borderBottom };
      });
      const headerCell = await table
        .locator('.ui-data-table__header-cell')
        .nth(1)
        .evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            letterSpacing: style.letterSpacing,
            textTransform: style.textTransform,
            color: style.color,
          };
        });
      const row = table.locator('.ui-data-table__row').first();
      const rowBox = await row.boundingBox();
      const restingBackground = await row.evaluate((node) => getComputedStyle(node).backgroundColor);
      await row.hover();
      const hoverBackground = await row.evaluate((node) => getComputedStyle(node).backgroundColor);
      const cell = await table
        .locator('.ui-data-table__cell')
        .nth(1)
        .evaluate((node) => {
          const style = getComputedStyle(node);
          return { fontSize: style.fontSize, color: style.color, padding: style.padding };
        });

      await row.locator('.ui-data-table__cell').first().click();
      const selected = table.locator('.ui-data-table__row--selected').first();
      const selectedBackground = await selected.evaluate((node) => getComputedStyle(node).backgroundColor);

      return { header, headerCell, rowHeight: rowBox?.height, restingBackground, hoverBackground, cell, selectedBackground };
    };

    // Scoped to the rail: the Dashboard's cross-navigation tiles name the same
    // screens, so an unscoped locator matches more than the entry meant here.
    await navEntry(page, 'Containers').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    const containersLook = await measure();

    await navEntry(page, 'Images & layers').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
    const imagesLook = await measure();

    expect(imagesLook).toEqual(containersLook);
    // A meaningful comparison: hovering must actually change the row, and the
    // selected row must differ from a resting one on both screens.
    expect(imagesLook.hoverBackground).not.toBe(imagesLook.restingBackground);
    expect(imagesLook.selectedBackground).not.toBe(imagesLook.restingBackground);
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-39 — an image can be pushed to a registry, showing per-layer progress until completion.
// Placed before the pull test below: both dialogs are expected to auto-close on completion per
// images-screen.md, and running push first keeps its verdict independent if that expectation fails.
test('pushing an image to a registry shows per-layer progress until it completes', async ({ page }) => {
  // Docker only pushes a reference the image is already locally tagged as, so the push target is
  // tagged directly, then selected in the push dialog (images-screen.md: pushing one of the image's
  // own existing tags).
  const containerName = `vexel-e2e-push-src-${Date.now()}`;
  const pushReference = `localhost:${PUSH_REGISTRY_PORT}/vexel-e2e-push-${Date.now()}:v1`;
  await createStandaloneImage(pushReference, containerName);
  try {
    await page.reload();
    await searchField(page).fill(pushReference);
    const row = imageRow(page, pushReference);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await openRowOverflow(page, row);
    await menuEntry(page, 'Push…').click();
    const dialogHeading = page.getByRole('heading', { name: `Push ${pushReference}` });
    const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
    await dialog.getByRole('button', { name: 'Push' }).click();

    await expect(page.getByText(/Pending|In progress|Done/).first()).toBeVisible({ timeout: 15_000 });
    await expect(dialogHeading).toHaveCount(0, { timeout: 30_000 });
  } finally {
    await removeStandaloneImage(pushReference, containerName);
  }
});

// plan-docker_management_app/REQ-38 — pulling an image by reference shows per-layer progress until completion
test('pulling an image by reference shows per-layer progress and the image appears once it completes', async ({ page }) => {
  // A real registry pull runs here, so the default per-test budget is not the
  // measure of anything this test is about.
  test.setTimeout(120_000);
  // The suite's own registry, on this machine: what is contracted is that the
  // product fetches a reference it does not hold, and a public registry giving
  // way says nothing about that. Removed locally first, so the pull is real.
  const reference = await ensurePullableImage();
  await execFileAsync('docker', ['rmi', '-f', reference]).catch(() => undefined);

  try {
    await page.getByRole('button', { name: 'Pull image…' }).click();
    const dialogHeading = page.getByRole('heading', { name: 'Pull image' });
    await expect(dialogHeading).toBeVisible();
    const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
    await dialog.getByRole('textbox', { name: 'Image reference' }).fill(reference);
    await dialog.getByRole('button', { name: 'Pull', exact: true }).click();

    await expect(page.getByText(/Pending|In progress|Done/).first()).toBeVisible({ timeout: 15_000 });
    // images-screen.md: the pull dialog closes on its own once the transfer ends, and the list re-reads.
    await expect(dialogHeading).toHaveCount(0, { timeout: 30_000 });
    await searchField(page).fill(PULLABLE_REPOSITORY);
    await expect(imageRow(page, reference)).toBeVisible({ timeout: 10_000 });
  } finally {
    // The pull was the point, not the image: the daemon is left holding no more
    // than it did before, so the next run's "missing locally" is genuine too.
    await removeTagQuietly(reference);
  }
});


// image-detail-panel.md, images-screen.md — the image panel has no close control any more: the row that opened it
// closes it, `Escape` closes it from the keyboard, and the selection does not outlive the image
// (plan-docker_management_app-image_row_actions/REQ-20 … REQ-25, REQ-28, REQ-29, REQ-30).
//
// Serial for the same reason as the rest of this file: these tests keep a panel open across several steps, and the
// table reserves no space for an expanded row.
test.describe('Image detail panel dismissal (REQ-20, REQ-21, REQ-22, REQ-23, REQ-24, REQ-25, REQ-28, REQ-29, REQ-30)', () => {
  test.describe.configure({ mode: 'serial' });

  test('the open panel carries no close control, keeps its four actions, and its row closes it', async ({ page }) => {
    const containerName = `vexel-e2e-panel-close-src-${Date.now()}`;
    const tag = `vexel-e2e-panel-close-${Date.now()}:v1`;
    try {
      await createStandaloneImage(tag, containerName);
      await page.reload();
      await searchField(page).fill(tag);
      const row = imageRow(page, tag);
      await expect(row).toBeVisible({ timeout: 10_000 });

      await selectRow(row);
      const detail = expandedPanel(page);
      await expect(detail).toBeVisible();

      // Gone from the rendered interface — not hidden, not disabled, not moved (REQ-20).
      await expect(page.getByRole('button', { name: 'Close detail' })).toHaveCount(0);
      await expect(detail.locator('.ui-detail-panel__close')).toHaveCount(0);
      // The four panel actions are untouched, in the same order (REQ-21).
      await expect(detail.locator('.ui-detail-panel__actions').getByRole('button')).toHaveText([
        'Explore layers…',
        'Efficiency & signals…',
        'Browse filesystem…',
        'Compare with…',
      ]);
      // The bond to the row is visible without acting (REQ-28).
      await expect(row).toHaveClass(/ui-data-table__row--selected/);

      await selectRow(row);

      await expect(detail).toHaveCount(0);
      await expect(row).not.toHaveClass(/ui-data-table__row--selected/);
    } finally {
      await removeStandaloneImage(tag, containerName);
    }
  });

  test('selecting another row keeps the panel open on that other image', async ({ page }) => {
    const runId = Date.now();
    const firstContainer = `vexel-e2e-panel-repoint-src-a-${runId}`;
    const secondContainer = `vexel-e2e-panel-repoint-src-b-${runId}`;
    const firstTag = `vexel-e2e-panel-repoint-${runId}-a:v1`;
    const secondTag = `vexel-e2e-panel-repoint-${runId}-b:v1`;
    try {
      await createStandaloneImage(firstTag, firstContainer);
      await createStandaloneImage(secondTag, secondContainer);
      await page.reload();
      await searchField(page).fill(`vexel-e2e-panel-repoint-${runId}`);
      await expect(imageRow(page, firstTag)).toBeVisible({ timeout: 10_000 });
      await expect(imageRow(page, secondTag)).toBeVisible({ timeout: 10_000 });

      await selectRow(imageRow(page, firstTag));
      await expect(expandedPanel(page)).toBeVisible();

      await selectRow(imageRow(page, secondTag));

      await expect(expandedPanel(page)).toHaveCount(1);
      await expect.poll(async () => panelOwner(page), { timeout: 10_000 }).toContain(secondTag);
      await expect(imageRow(page, secondTag)).toHaveClass(/ui-data-table__row--selected/);
      await expect(imageRow(page, firstTag)).not.toHaveClass(/ui-data-table__row--selected/);
    } finally {
      await removeStandaloneImage(firstTag, firstContainer);
      await removeStandaloneImage(secondTag, secondContainer);
    }
  });

  test('Escape closes the panel, from the screen and from inside the panel itself', async ({ page }) => {
    const containerName = `vexel-e2e-panel-escape-src-${Date.now()}`;
    const tag = `vexel-e2e-panel-escape-${Date.now()}:v1`;
    try {
      await createStandaloneImage(tag, containerName);
      await page.reload();
      await searchField(page).fill(tag);
      const row = imageRow(page, tag);
      await expect(row).toBeVisible({ timeout: 10_000 });
      const detail = expandedPanel(page);

      await selectRow(row);
      await expect(detail).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(detail).toHaveCount(0);

      // Again, this time with the focus on a control inside the panel's own contents.
      await selectRow(row);
      await expect(detail).toBeVisible();
      await detail.getByRole('button', { name: 'Explore layers…' }).focus();
      await expect(detail.getByRole('button', { name: 'Explore layers…' })).toBeFocused();

      await page.keyboard.press('Escape');

      await expect(detail).toHaveCount(0);
    } finally {
      await removeStandaloneImage(tag, containerName);
    }
  });

  test('with the row menu open, Escape closes only the menu and the next one closes the panel', async ({ page }) => {
    const containerName = `vexel-e2e-panel-escape-menu-src-${Date.now()}`;
    const tag = `vexel-e2e-panel-escape-menu-${Date.now()}:v1`;
    try {
      await createStandaloneImage(tag, containerName);
      await page.reload();
      await searchField(page).fill(tag);
      const row = imageRow(page, tag);
      await expect(row).toBeVisible({ timeout: 10_000 });
      const detail = expandedPanel(page);

      await selectRow(row);
      await expect(detail).toBeVisible();
      await openRowOverflow(page, row);

      await page.keyboard.press('Escape');

      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(detail).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(detail).toHaveCount(0);
    } finally {
      await removeStandaloneImage(tag, containerName);
    }
  });

  test('with the tag dialog or the remove confirmation open, Escape leaves the panel exactly as it was', async ({ page }) => {
    const containerName = `vexel-e2e-panel-escape-dialog-src-${Date.now()}`;
    const tag = `vexel-e2e-panel-escape-dialog-${Date.now()}:v1`;
    try {
      await createStandaloneImage(tag, containerName);
      await page.reload();
      await searchField(page).fill(tag);
      const row = imageRow(page, tag);
      await expect(row).toBeVisible({ timeout: 10_000 });
      const detail = expandedPanel(page);

      await selectRow(row);
      await expect(detail).toBeVisible();

      await openRowOverflow(page, row);
      await menuEntry(page, 'Tag…').click();
      const tagHeading = page.getByRole('heading', { name: `Tag ${tag}` });
      await expect(tagHeading).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(tagHeading).toBeVisible();
      await expect(detail).toBeVisible();
      await page.locator('.ui-modal').filter({ has: tagHeading }).getByRole('button', { name: 'Cancel' }).click();
      await expect(tagHeading).toHaveCount(0);
      await expect(detail).toBeVisible();

      await openRowOverflow(page, row);
      await menuEntry(page, 'Remove').click();
      const confirmHeading = page.getByRole('heading', { name: `Confirm: ${tag}` });
      await expect(confirmHeading).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(confirmHeading).toBeVisible();
      await expect(detail).toBeVisible();

      // The confirmation is closed the way it is meant to be, leaving the image in place.
      await page.locator('.ui-modal').filter({ has: confirmHeading }).getByRole('button', { name: 'Cancel' }).click();
      await expect(confirmHeading).toHaveCount(0);
      await expect(detail).toBeVisible();
      await expect(row).toBeVisible();
    } finally {
      await removeStandaloneImage(tag, containerName);
    }
  });

  // REQ-29 — an image id is a digest of its content, so the same content coming back reproduces the id: the panel
  // must not spring open by itself. Saved and loaded back, which is how the same id is genuinely reproduced here.
  test('removing the image whose panel is open takes row, panel and selection together, and the same image returning does not reopen it', async ({
    page,
  }) => {
    const containerName = `vexel-e2e-panel-gone-src-${Date.now()}`;
    const tag = `vexel-e2e-panel-gone-${Date.now()}:v1`;
    const tarDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'vexel-e2e-'));
    const tarPath = path.join(tarDirectory, 'image.tar');
    try {
      await createStandaloneImage(tag, containerName);
      await execFileAsync('docker', ['save', '-o', tarPath, tag]);
      await page.reload();
      await searchField(page).fill(tag);
      const row = imageRow(page, tag);
      await expect(row).toBeVisible({ timeout: 10_000 });

      await selectRow(row);
      await expect(expandedPanel(page)).toBeVisible();

      await openRowOverflow(page, row);
      await menuEntry(page, 'Remove').click();
      const confirmHeading = page.getByRole('heading', { name: `Confirm: ${tag}` });
      await expect(confirmHeading).toBeVisible();
      await page.locator('.ui-modal').filter({ has: confirmHeading }).getByRole('button', { name: 'Remove' }).click();

      await expect(imageRow(page, tag)).toHaveCount(0, { timeout: 15_000 });
      await expect(expandedPanel(page)).toHaveCount(0);

      // The same content, back on the daemon under the same id.
      await execFileAsync('docker', ['load', '-i', tarPath]);

      await expect(imageRow(page, tag)).toBeVisible({ timeout: 20_000 });
      await expect(expandedPanel(page)).toHaveCount(0);
      await expect(page.locator('.ui-data-table__row--selected')).toHaveCount(0);
    } finally {
      await removeStandaloneImage(tag, containerName);
      await fs.rm(tarDirectory, { recursive: true, force: true });
    }
  });

  // REQ-30 — the case REQ-29 must not be conflated with: an image hidden by the search has not left the list.
  test('a search that excludes the selected image hides its row and its panel, and clearing it restores both', async ({ page }) => {
    const containerName = `vexel-e2e-panel-search-src-${Date.now()}`;
    const tag = `vexel-e2e-panel-search-${Date.now()}:v1`;
    try {
      await createStandaloneImage(tag, containerName);
      await page.reload();
      const search = searchField(page);
      await search.fill(tag);
      const row = imageRow(page, tag);
      await expect(row).toBeVisible({ timeout: 10_000 });
      const detail = expandedPanel(page);

      await selectRow(row);
      await expect(detail).toBeVisible();

      await search.fill(`${tag}-excluded-by-this-search`);

      await expect(imageRow(page, tag)).toHaveCount(0);
      await expect(detail).toHaveCount(0);

      await search.fill(tag);

      await expect(imageRow(page, tag)).toBeVisible();
      await expect(detail).toBeVisible();
      expect(await panelOwner(page)).toContain(tag);
      await expect(imageRow(page, tag)).toHaveClass(/ui-data-table__row--selected/);
    } finally {
      await removeStandaloneImage(tag, containerName);
    }
  });
});
