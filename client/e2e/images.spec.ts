import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from './support/test.js';
import { navEntry, openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { boxOf } from './support/settled.js';
import { PULLABLE_REPOSITORY, TINY_IMAGE, ensureImage, ensurePullableImage } from '../../server/test/support/base-images.js';
import { containerCard } from './support/container-cards.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

// The tests of a file already run one at a time here (`workers: 1`,
// `fullyParallel: false`). What serial mode adds is what this file needs: its
// tests share one tag, each of them removing it, so a failure part-way through
// leaves that tag in a state nobody established — the tests after it are skipped
// rather than left to prove nothing, and a retry rebuilds it from the first.
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
 * Ensured at the point of use, not once for the run: a prune spec in this suite
 * prunes the host, so an image ensured earlier may be gone by now.
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

/**
 * The open menu's own geometry: whether the popup's scrolling list holds all of its content at once,
 * and how much of the last entry — `Remove`, the destructive one — is actually shown. The popup caps
 * its list rather than growing without bound, so "displayed in full" is this reading, not the
 * viewport's alone.
 */
async function openMenuGeometry(page: Page) {
  return page.evaluate(() => {
    const list = document.querySelector('.ui-menu__list');
    if (!list) return null;
    const listRect = list.getBoundingClientRect();
    const last = list.querySelector('[role="menuitem"][aria-label="Remove"]');
    const lastRect = last?.getBoundingClientRect();
    return {
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
      removeVisibleRatio: lastRect
        ? Number((Math.max(0, Math.min(lastRect.bottom, listRect.bottom) - Math.max(lastRect.top, listRect.top)) / lastRect.height).toFixed(3))
        : 0,
    };
  });
}

/**
 * The row's overflow menu opened and one of its entries chosen, as **one retried gesture**
 * (`support/row-overflow-menu.ts`). The menu dismisses itself on a scroll, a resize or a re-read
 * that replaces the row (`ui-library/specs/menu.md`), and a gesture split in two waits out its
 * whole budget on an entry that is already gone. Several entries reached this way are destructive,
 * so the retry stops at the first activation the browser delivers: `Remove` cannot run twice.
 */
async function chooseRowAction(page: Page, row: ReturnType<typeof imageRow>, label: string): Promise<void> {
  await chooseFromRowOverflowMenu(page, row, label);
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

test.beforeAll(async () => {
  await execFileAsync('docker', ['run', '-d', '-p', `${PUSH_REGISTRY_PORT}:5000`, ...ownershipArgs('registry'), 'registry:2']);
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
  // (ui-library/specs/data-table.md) and the status dot. The column of tag pills left with the
  // reference it repeated on every row (plan-ui-coherence-optimisation/REQ-57), and the size column
  // is named for the measurement behind it, against the panel's own (REQ-59).
  await expect(headers).toHaveText(['', '', 'REPOSITORY:TAG', 'DIGEST', 'PLATFORM', 'DISK USAGE', 'CREATED', 'ACTIONS']);
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

// plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-5, REQ-6, REQ-7, REQ-8 — the menu lists exactly
// ten entries, in three groups marked by separation and tone alone: the image's four analyses, then the operations on
// it, then Remove — set apart, in the destructive tone and carrying `rmi`, the menu's only hint. No section heading
test('the row menu lists exactly the four analyses, Run…, Tag…, Untag, Push…, Save and Remove, in that order', async ({ page }) => {
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
    await expect(entries).toHaveCount(10);
    await expect(entries.nth(0)).toHaveText('Explore layers…');
    await expect(entries.nth(1)).toHaveText('Efficiency & signals…');
    await expect(entries.nth(2)).toHaveText('Browse filesystem…');
    await expect(entries.nth(3)).toHaveText('Compare with…');
    await expect(entries.nth(4)).toHaveText('Run…');
    await expect(entries.nth(5)).toHaveText('Tag…');
    await expect(entries.nth(6)).toHaveText('Untag');
    await expect(entries.nth(7)).toHaveText('Push…');
    await expect(entries.nth(8)).toHaveText('Save');
    await expect(entries.nth(9)).toContainText('Remove');
    await expect(entries.nth(9)).toContainText('rmi');
    await expect(entries.nth(9)).toHaveClass(/destructive/);
    // Two boundaries: the one opening the operations group, and the one that already set Remove apart.
    const separators = page.getByRole('menu').locator('[role="separator"]');
    await expect(separators).toHaveCount(2);
    // No heading, no group label: the popup holds entries and separators and nothing else.
    await expect(page.getByRole('menu').getByRole('heading')).toHaveCount(0);
    const childRoles = await page.getByRole('menu').evaluate((list) => Array.from(list.children).map((child) => child.getAttribute('role')));
    expect(new Set(childRoles)).toEqual(new Set(['menuitem', 'separator']));
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});

// plan-docker_management_app-image_row_actions/REQ-12 — at most one row's menu is open at a time, and it is
// unambiguously attached to the row it belongs to
test('opening a second row menu closes the first', async ({ page }) => {
  const runId = Date.now();
  const aboveContainer = `vexel-e2e-onemenu-src-a-${runId}`;
  const belowContainer = `vexel-e2e-onemenu-src-b-${runId}`;
  // Which of the two is the row above is decided by the list's order, not by which was built first:
  // an image sorts by its lowest tag, repository before tag
  // (plan-docker_management_app-list_ordering/REQ-17), so `-a` is above `-b` whatever order the
  // daemon returns them in.
  const aboveTag = `vexel-e2e-onemenu-${runId}-a:v1`;
  const belowTag = `vexel-e2e-onemenu-${runId}-b:v1`;
  try {
    await createStandaloneImage(aboveTag, aboveContainer);
    await createStandaloneImage(belowTag, belowContainer);
    await page.reload();
    await searchField(page).fill(`vexel-e2e-onemenu-${runId}`);
    const above = imageRow(page, aboveTag);
    const below = imageRow(page, belowTag);
    await expect(above).toBeVisible({ timeout: 10_000 });
    await expect(below).toBeVisible({ timeout: 10_000 });

    // The second menu is opened on the row **above** the first one, and that is load-bearing: a
    // row's menu opens below its own trigger and covers the rows underneath it, so a click aimed at
    // a trigger below an open menu lands on the open menu instead — on `Remove`, at that. Driving it
    // the other way round is a click no operator could make.
    await openRowOverflow(page, below);
    await rowOverflow(above).click();

    await expect(page.getByRole('menu')).toHaveCount(1);
    await expect(page.getByRole('menu')).toHaveAccessibleName(`More actions for ${aboveTag}`);
    await expect(rowOverflow(below)).toHaveAttribute('aria-expanded', 'false');
  } finally {
    await removeStandaloneImage(aboveTag, aboveContainer);
    await removeStandaloneImage(belowTag, belowContainer);
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

    await chooseRowAction(page, row, 'Tag…');
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'New reference' })).toBeVisible();
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});

// plan-docker_management_app-image_row_actions/REQ-14, plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-10
// — an open menu is shown in full wherever its row sits, including the last rows of a list long enough to scroll, and is
// never clipped by the table, the card, the panel or any scroll container between it and the edge of the viewport
test('a menu opened on the last visible row of a scrolling list is shown in full', async ({ page }) => {
  const runId = Date.now();
  const stem = `vexel-e2e-clip-${runId}`;
  const fixtures = [1, 2, 3, 4].map((index) => ({ tag: `${stem}-${index}:v1`, containerName: `${stem}-src-${index}` }));
  const tags = fixtures.map((fixture) => fixture.tag);
  try {
    for (const fixture of fixtures) await createStandaloneImage(fixture.tag, fixture.containerName);
    await page.reload();
    // A short viewport, so the table has to scroll and the last row sits against the bottom edge —
    // the case the popup has to flip above its trigger for. Sized to hold the popup the menu now
    // opens: four more entries make it taller, and a viewport shorter than the popup itself would be
    // measuring the window rather than the clipping this requirement is about.
    await page.setViewportSize({ width: 1280, height: 700 });
    await searchField(page).fill(stem);
    const last = imageRow(page, tags[tags.length - 1]!);
    await expect(last).toBeVisible({ timeout: 10_000 });
    await last.scrollIntoViewIfNeeded();

    await openRowOverflow(page, last);

    // Not clipped by the containers it is opened inside: the popup is drawn past the table's own
    // scrolled body, which is what "never clipped by the table, the card or any scroll container
    // between it and the edge of the viewport" means.
    const reachesOutsideTheTable = await page.evaluate(() => {
      const popup = document.querySelector('.ui-menu__popup')?.getBoundingClientRect();
      const body = document.querySelector('.ui-data-table__body')?.getBoundingClientRect();
      if (!popup || !body) return false;
      return popup.top < body.top || popup.bottom > body.bottom;
    });
    expect(reachesOutsideTheTable, 'the popup is drawn past the table body that would otherwise clip it').toBe(true);

    // And shown in full: every entry of the ten, not merely the popup's first pixels
    // (panel_actions_to_menu/REQ-10).
    for (const label of ['Explore layers…', 'Efficiency & signals…', 'Browse filesystem…', 'Compare with…', 'Run…', 'Tag…', 'Untag', 'Push…', 'Save', 'Remove']) {
      await expect(menuEntry(page, label)).toBeInViewport({ ratio: 1 });
    }
    // In full inside the popup too: the list holds all ten at once instead of scrolling them, so
    // `Remove` is read without being looked for.
    const geometry = await openMenuGeometry(page);
    expect(geometry, 'the open menu\'s geometry').not.toBeNull();
    expect(geometry!.scrollHeight, 'the popup\'s list scrolls its own entries').toBeLessThanOrEqual(geometry!.clientHeight);
    expect(geometry!.removeVisibleRatio, 'how much of Remove is shown').toBe(1);
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
    await expect(menuEntry(page, 'Explore layers…')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menuEntry(page, 'Efficiency & signals…')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(menuEntry(page, 'Explore layers…')).toBeFocused();
    // Every one of the ten is walked to, across both group boundaries.
    for (const label of ['Efficiency & signals…', 'Browse filesystem…', 'Compare with…', 'Run…', 'Tag…', 'Untag', 'Push…', 'Save', 'Remove']) {
      await page.keyboard.press('ArrowDown');
      await expect(menuEntry(page, label)).toBeFocused();
    }

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(rowOverflow(row)).toBeFocused();

    // Activated from the keyboard alone, on an entry of the second group.
    await page.keyboard.press('Enter');
    for (let step = 0; step < 5; step += 1) await page.keyboard.press('ArrowDown');
    await expect(menuEntry(page, 'Tag…')).toBeFocused();
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
    // Neither bulk action moved into the row's menu: the row's own comparison entry is a different
    // operation (one operand, not two checked rows) and does not stand in for it.
    await openRowOverflow(page, imageRow(page, firstTag));
    await expect(page.getByRole('menuitem', { name: /tarball/ })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: 'Compare filesystems…', exact: true })).toHaveCount(0);
    await expect(menuEntry(page, 'Compare with…')).toBeVisible();
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

    await chooseRowAction(page, row, 'Tag…');
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

    await chooseRowAction(page, row, 'Untag');
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

    await chooseRowAction(page, row, 'Untag');

    await expect(page.locator('.ui-modal')).toHaveCount(0);
    await expect(imageRow(page, tag)).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-37 — a dangling image is marked as such and has no reference to untag or push
test('marks a dangling image with its status dot and disables its untag and push actions', async ({ page }) => {
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

    // images-screen.md — the dangling image "is marked as dangling by the leading status dot, which
    // is where that fact already was": the warning pill that repeated it sat in the column of tag
    // pills, and left with it (plan-ui-coherence-optimisation/REQ-57).
    await expect(row.locator('.ui-table-status-dot--tone-warning')).toHaveCount(1);
    await expect(row).toContainText('<none>');
    await expect(row, 'the row still states in words a fact its status dot already carries').not.toContainText('dangling');
    // The row carries the same single control a tagged row does (REQ-2).
    await expect(row.locator('.ui-action-button-group').getByRole('button')).toHaveCount(1);

    // The same ten entries, in the same order, with Untag and Push… disabled in place and saying
    // why they are unavailable rather than removed (REQ-8, REQ-9).
    await openRowOverflow(page, row);
    const entries = page.getByRole('menuitem');
    await expect(entries).toHaveCount(10);
    await expect(entries.nth(6)).toHaveAccessibleName('Untag');
    await expect(entries.nth(6)).toHaveAttribute('aria-disabled', 'true');
    await expect(entries.nth(6)).toHaveAccessibleDescription(/no tags to untag/i);
    await expect(entries.nth(7)).toHaveAccessibleName('Push…');
    await expect(entries.nth(7)).toHaveAttribute('aria-disabled', 'true');
    await expect(entries.nth(7)).toHaveAccessibleDescription(/no tags to push/i);
    // Everything else applies to a dangling image too — the four analyses included.
    for (const index of [0, 1, 2, 3, 4, 5, 8, 9]) {
      await expect(entries.nth(index)).not.toHaveAttribute('aria-disabled', 'true');
    }
    // The taller of the two states the menu is read in: two of its entries carry a reason line as
    // well as a label, and all ten are still shown in full rather than scrolled (REQ-9, REQ-10).
    const geometry = await openMenuGeometry(page);
    expect(geometry, 'the open menu\'s geometry on a dangling image').not.toBeNull();
    expect(geometry!.scrollHeight, 'the popup\'s list scrolls its own entries').toBeLessThanOrEqual(geometry!.clientHeight);
    expect(geometry!.removeVisibleRatio, 'how much of Remove is shown').toBe(1);
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
    await chooseRowAction(page, row, 'Remove');
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${tag}` });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(imageRow(page, tag)).toBeVisible();

    await chooseRowAction(page, row, 'Remove');
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

// plan-docker_management_app/REQ-3 asked the images table and the containers table to present
// identically. **On 2026-08-25 the containers screen stopped being a table**
// (plan-docker_management_app-containers_card_view/REQ-1), so one side of that comparison has no
// subject left. What survives is restated rather than dropped
// (plan-docker_management_app-containers_card_view/REQ-38, REQ-28):
//
//   - the images table still carries the treatment it carried — a header, a column typography, a row
//     height, a hover and a selected state that actually differ from a resting row (REQ-27 of
//     detail_modal: the images screen is untouched, and this half is unedited);
//   - and the containers card, which **wore that table's own material until 2026-08-26**, now wears
//     neither highlight: it is not an interactive surface and carries no selected state in any form
//     (detail_modal/REQ-7, REQ-8). Read as painted colour, in the browser, which is the only place
//     an absent highlight can be told from a declaration that no longer resolves.
//
// The library's own two declarations are untouched and are read where they are declared, by
// `test/unit/images-containers-table-alignment.test.tsx`; what changed is that the card stopped
// asking for them.
test('the images table keeps its treatment, and the containers card wears neither of its highlights', async ({
  page,
}) => {
  const containerName = `vexel-e2e-homogeneity-${Date.now()}`;
  const tag = `vexel-e2e-homogeneity-${Date.now()}:v1`;
  try {
    await execFileAsync('docker', ['run', '-d', '--name', containerName, ...ownershipArgs(containerName), '--entrypoint', 'sleep', 'alpine:3.20', '300']);
    await tagFromPostgres(tag);

    const measureImagesTable = async () => {
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
      // Read once the list has settled: a list measured mid-arrival is not measured.
      const rowBox = await boxOf(row, 'the first row of the list');
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
      // The pointer is taken off the row first: `.ui-data-table__row:hover` is one pseudo-class more
      // specific than `.ui-data-table__row--selected`, so a selected row still under the pointer
      // paints the **hover** colour — which is what this reading would otherwise report as the
      // selected one.
      await page.mouse.move(0, 0);
      const selected = table.locator('.ui-data-table__row--selected').first();
      const selectedBackground = await selected.evaluate((node) => getComputedStyle(node).backgroundColor);

      return { header, headerCell, rowHeight: rowBox?.height, restingBackground, hoverBackground, cell, selectedBackground };
    };

    // Scoped to the rail: the Dashboard's cross-navigation tiles name the same
    // screens, so an unscoped locator matches more than the entry meant here.
    await navEntry(page, 'Images & layers').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
    const imagesLook = await measureImagesTable();

    // The treatment is there and it is legible as a treatment: every reading is a value, the hover
    // changes the row, and a selected row differs from a resting one.
    for (const [what, value] of Object.entries({ ...imagesLook.header, ...imagesLook.headerCell, ...imagesLook.cell })) {
      expect(String(value), `the images table declares no ${what}`).not.toBe('');
    }
    expect(imagesLook.rowHeight).toBeGreaterThan(0);
    expect(imagesLook.hoverBackground).not.toBe(imagesLook.restingBackground);
    expect(imagesLook.selectedBackground).not.toBe(imagesLook.restingBackground);

    // …and the card wears neither highlight. It painted them **over** its fill rather than as its
    // fill (`ui-library/specs/surface.md`), so what is read is the colour it paints there: an empty
    // reading is the treatment being absent, not a token failing to resolve.
    await navEntry(page, 'Containers').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    const card = containerCard(page, containerName);
    await expect(card).toBeVisible({ timeout: 15_000 });

    const highlightOf = async () =>
      await card.evaluate((node) => /rgba?\([^)]*\)/.exec(getComputedStyle(node).backgroundImage)?.[0] ?? '');
    await card.hover();
    const cardHover = await highlightOf();
    await card.getByRole('heading', { name: containerName }).click();
    // Off the card before reading, as the row's own reading is taken.
    await page.mouse.move(0, 0);
    const cardSelected = await highlightOf();

    expect(cardHover, `the hovered card paints ${cardHover}, a hover treatment the card no longer asks for`).toBe('');
    expect(
      cardSelected,
      `clicking the card's body painted ${cardSelected}: the body is not a gesture and the card carries no selected state`,
    ).toBe('');
    await expect(card, 'the card still asks the library for the selectable treatment').not.toHaveClass(/ui-surface--selectable/);
    await expect(card, 'the card still carries a selected treatment').not.toHaveClass(/ui-surface--selected/);
    // The click on its body opened nothing, either: the corner control is the only route in (REQ-6).
    await expect(page.locator('.ui-modal--size-large')).toHaveCount(0);
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

    await chooseRowAction(page, row, 'Push…');
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

  test('the open panel carries no close control and no actions at all, and its row closes it', async ({ page }) => {
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
      // The four analysis actions are gone with it, and nothing takes their place: the action slot
      // is omitted rather than emptied, so no strip and no gap is kept where they sat
      // (panel_actions_to_menu REQ-1, REQ-2).
      await expect(detail.locator('.ui-detail-panel__actions')).toHaveCount(0);
      await expect(detail.locator('.ui-detail-panel__header')).toHaveCount(0);
      for (const label of ['Explore layers…', 'Efficiency & signals…', 'Browse filesystem…', 'Compare with…']) {
        await expect(detail.getByRole('button', { name: label })).toHaveCount(0);
        await expect(detail.getByRole('link', { name: label })).toHaveCount(0);
        await expect(detail.getByRole('tab', { name: label })).toHaveCount(0);
      }
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

      // Again, this time with the focus on a control inside the panel's own contents — one of its
      // collapsible sections, the four analysis actions having left the panel.
      await selectRow(row);
      await expect(detail).toBeVisible();
      const section = detail.getByRole('button', { name: /Environment/ });
      await section.focus();
      await expect(section).toBeFocused();

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

      await chooseRowAction(page, row, 'Tag…');
      const tagHeading = page.getByRole('heading', { name: `Tag ${tag}` });
      await expect(tagHeading).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(tagHeading).toBeVisible();
      await expect(detail).toBeVisible();
      await page.locator('.ui-modal').filter({ has: tagHeading }).getByRole('button', { name: 'Cancel' }).click();
      await expect(tagHeading).toHaveCount(0);
      await expect(detail).toBeVisible();

      await chooseRowAction(page, row, 'Remove');
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

      await chooseRowAction(page, row, 'Remove');
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

// images/specs/images-screen.md — the image's four analyses are views the **screen** presents: each opens from the row's
// own menu entry with no detail panel open anywhere, on the image whose menu opened it, one at a time, dismisses nothing
// beneath it and does not outlive its image
// (plan-docker_management_app-image_row_actions-panel_actions_to_menu/REQ-4, REQ-13, REQ-14, REQ-15, REQ-16, REQ-18,
// REQ-19, REQ-20, REQ-26, REQ-30).
test.describe('The four analysis views, opened from the row menu (REQ-4, REQ-13 … REQ-20, REQ-26, REQ-30)', () => {
  test.describe.configure({ mode: 'serial' });

  /** The way out every one of the four offers: the dialog's own overlay (`Modal` closes on an overlay click). */
  async function dismissView(page: Page): Promise<void> {
    await page.locator('.ui-modal-overlay').click({ position: { x: 5, y: 5 } });
  }

  /**
   * Every image detail panel currently rendered. Located by the panel's own element rather than by
   * the table's expanded region, since the layer explorer holds a table of its own that expands too.
   */
  function detailPanels(page: Page) {
    return page.locator('.ui-detail-panel');
  }

  /** What the browser currently holds the point of interaction on, described rather than located. */
  async function pointOfInteraction(page: Page) {
    return page.evaluate(() => {
      const active = document.activeElement;
      return {
        tag: active?.tagName ?? null,
        isDocument: active === null || active === document.body || active === document.documentElement,
        label: active?.getAttribute('aria-label') ?? null,
        insideImagesList: Boolean(active?.closest('.ui-data-table')),
        connected: Boolean(active?.isConnected),
      };
    });
  }

  test('opens each of the four from a row\'s menu with no panel open, on that row\'s image, one at a time', async ({ page }) => {
    const containerName = `vexel-e2e-views-src-${Date.now()}`;
    const tag = `vexel-e2e-views-${Date.now()}:v1`;
    try {
      await createStandaloneImage(tag, containerName);
      await page.reload();
      await searchField(page).fill(tag);
      const row = imageRow(page, tag);
      await expect(row).toBeVisible({ timeout: 10_000 });
      // No panel anywhere on the screen, for the whole test.
      await expect(detailPanels(page)).toHaveCount(0);

      const views = [
        { label: 'Explore layers…', heading: `Layer stack — ${tag}` },
        { label: 'Efficiency & signals…', heading: `Efficiency & signals — ${tag}` },
        // The filesystem browser opens straight onto its cost warning now, the image having never
        // been extracted (filesystem_browse_direct/REQ-2). The surface itself is open behind it, so
        // what this test is about — which view the row's entry hosts, and that only one is hosted
        // at a time — is asserted exactly as for the other three; only the way out differs, since
        // an overlay click can no longer choose between two stacked overlays.
        {
          label: 'Browse filesystem…',
          heading: `Filesystem — ${tag}`,
          dismiss: async () => {
            await page
              .getByRole('heading', { name: `Confirm: ${tag}` })
              .locator('xpath=..')
              .getByRole('button', { name: 'Cancel' })
              .click();
          },
        },
        { label: 'Compare with…', heading: 'Compare filesystems' },
      ];

      for (const view of views) {
        await chooseRowAction(page, row, view.label);

        const heading = page.getByRole('heading', { name: view.heading });
        await expect(heading).toBeVisible({ timeout: 15_000 });
        // Opening it opened no panel and selected no row (REQ-15).
        await expect(detailPanels(page)).toHaveCount(0);
        await expect(row).not.toHaveClass(/ui-data-table__row--selected/);
        // Two of the four are never on screen together (REQ-16).
        await expect(page.locator('.ui-modal--size-large')).toHaveCount(1);

        if ('dismiss' in view && view.dismiss) await view.dismiss();
        else await dismissView(page);
        await expect(heading).toHaveCount(0);
        await expect(detailPanels(page)).toHaveCount(0);
      }

      // The comparison names the image it was started from, by the reference the row shows (REQ-23).
      await chooseRowAction(page, row, 'Compare with…');
      await expect(page.getByText(`Started from ${tag}`, { exact: false })).toBeVisible();
      await dismissView(page);
    } finally {
      await removeStandaloneImage(tag, containerName);
    }
  });

  test('shows the invoked row\'s image while a panel is open on another, and leaves that panel exactly as it was', async ({ page }) => {
    const runId = Date.now();
    const panelContainer = `vexel-e2e-views-panel-src-a-${runId}`;
    const viewContainer = `vexel-e2e-views-panel-src-b-${runId}`;
    const panelTag = `vexel-e2e-views-panel-${runId}-a:v1`;
    const viewTag = `vexel-e2e-views-panel-${runId}-b:v1`;
    try {
      await createStandaloneImage(panelTag, panelContainer);
      await createStandaloneImage(viewTag, viewContainer);
      await page.reload();
      await searchField(page).fill(`vexel-e2e-views-panel-${runId}`);
      await expect(imageRow(page, panelTag)).toBeVisible({ timeout: 10_000 });
      await expect(imageRow(page, viewTag)).toBeVisible({ timeout: 10_000 });

      await selectRow(imageRow(page, panelTag));
      await expect(expandedPanel(page)).toBeVisible();
      // Waited out on purpose: the panel grows from its loading state to its full height when the
      // inspect payload lands, which moves every row below it. Opening the menu across that reflow
      // is a race of this test's own making, not a behaviour of the product.
      await expect(expandedPanel(page).getByText('Raw payload')).toBeVisible({ timeout: 15_000 });

      await imageRow(page, viewTag).scrollIntoViewIfNeeded();
      await chooseRowAction(page, imageRow(page, viewTag), 'Explore layers…');

      // The view is the invoked row's, not the selected image's (REQ-14).
      await expect(page.getByRole('heading', { name: `Layer stack — ${viewTag}` })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('heading', { name: `Layer stack — ${panelTag}` })).toHaveCount(0);
      expect(await panelOwner(page)).toContain(panelTag);

      await dismissView(page);

      // The panel the operator had opened is exactly as they left it (REQ-15).
      await expect(page.getByRole('heading', { name: `Layer stack — ${viewTag}` })).toHaveCount(0);
      await expect(expandedPanel(page)).toHaveCount(1);
      expect(await panelOwner(page)).toContain(panelTag);
      await expect(imageRow(page, panelTag)).toHaveClass(/ui-data-table__row--selected/);
    } finally {
      await removeStandaloneImage(panelTag, panelContainer);
      await removeStandaloneImage(viewTag, viewContainer);
    }
  });

  // REQ-18 — the case the product has not had before: one of the four open with no panel beneath it. The open view holds
  // the innermost claim on the key and consumes it, so nothing underneath is dismissed by it.
  //
  // Driven through `Explore layers…` rather than the filesystem browser: that browser now opens
  // with its cost warning already on screen (filesystem_browse_direct/REQ-2), and `Escape` there
  // correctly answers the *warning* — an innermost claim of its own. The hosting rule this test
  // exists for is unchanged and keeps its coverage on a view whose first surface is not a dialog;
  // the filesystem flow's own `Escape` behaviour is not what this test is about.
  test('Escape with one of the four open dismisses nothing beneath it', async ({ page }) => {
    const containerName = `vexel-e2e-views-escape-src-${Date.now()}`;
    const tag = `vexel-e2e-views-escape-${Date.now()}:v1`;
    try {
      await createStandaloneImage(tag, containerName);
      await page.reload();
      await searchField(page).fill(tag);
      const row = imageRow(page, tag);
      await expect(row).toBeVisible({ timeout: 10_000 });

      // First with no panel at all: nothing on the images list moves.
      await chooseRowAction(page, row, 'Explore layers…');
      const heading = page.getByRole('heading', { name: `Layer stack — ${tag}` });
      await expect(heading).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(heading).toBeVisible();
      await expect(detailPanels(page)).toHaveCount(0);
      await expect(row).not.toHaveClass(/ui-data-table__row--selected/);
      await dismissView(page);

      // Then with a panel open underneath: it is still open and the selection is unchanged.
      await selectRow(row);
      await expect(expandedPanel(page)).toBeVisible();
      await chooseRowAction(page, row, 'Explore layers…');
      await expect(heading).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(heading).toBeVisible();
      await expect(expandedPanel(page)).toBeVisible();
      await expect(row).toHaveClass(/ui-data-table__row--selected/);

      // The order already applied is unchanged: the panel takes the key once the view has gone.
      await dismissView(page);
      await expect(heading).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(expandedPanel(page)).toHaveCount(0);
    } finally {
      await removeStandaloneImage(tag, containerName);
    }
  });

  // REQ-19, softened during development after this measurement (see `batches.md`, "Settled during
  // development"): while one of the four is open with no panel open, the point of interaction is the
  // row control that opened it, and it is never on an element that no longer exists. Where it lands
  // *after* the flow is dismissed is `Modal`'s established behaviour and is not this change's
  // business, so nothing is asserted about it here.
  test('leaves the point of interaction on the row control that opened the view, with no panel open', async ({ page }) => {
    const containerName = `vexel-e2e-views-focus-src-${Date.now()}`;
    const tag = `vexel-e2e-views-focus-${Date.now()}:v1`;
    try {
      await createStandaloneImage(tag, containerName);
      await page.reload();
      await searchField(page).fill(tag);
      const row = imageRow(page, tag);
      await expect(row).toBeVisible({ timeout: 10_000 });
      await expect(detailPanels(page)).toHaveCount(0);

      await chooseRowAction(page, row, 'Explore layers…');
      const heading = page.getByRole('heading', { name: `Layer stack — ${tag}` });
      await expect(heading).toBeVisible({ timeout: 15_000 });

      // The menu handed the focus back to the row's own trigger before the view opened, and the
      // trigger outlives the view: still in the images list, still part of the document.
      const whileOpen = await pointOfInteraction(page);
      expect(whileOpen, `the point of interaction while the view is open — measured ${JSON.stringify(whileOpen)}`).toMatchObject({
        isDocument: false,
        insideImagesList: true,
        connected: true,
        label: `More actions for ${tag}`,
      });
    } finally {
      await removeStandaloneImage(tag, containerName);
    }
  });

  // REQ-20 — none of the four outlives its image: removed in the operator's own terminal while a view is open on it,
  // the view resolves itself instead of standing there showing an image that no longer exists.
  test('resolves an open view when its image is removed from another terminal', async ({ page }) => {
    const containerName = `vexel-e2e-views-gone-src-${Date.now()}`;
    const tag = `vexel-e2e-views-gone-${Date.now()}:v1`;
    try {
      await createStandaloneImage(tag, containerName);
      await page.reload();
      await searchField(page).fill(tag);
      const row = imageRow(page, tag);
      await expect(row).toBeVisible({ timeout: 10_000 });

      await chooseRowAction(page, row, 'Explore layers…');
      const heading = page.getByRole('heading', { name: `Layer stack — ${tag}` });
      await expect(heading).toBeVisible({ timeout: 15_000 });

      // Removed outside the application, exactly as the daemon's own events reach it.
      await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
      await removeTagQuietly(tag);

      await expect(heading).toHaveCount(0, { timeout: 20_000 });
      await expect(imageRow(page, tag)).toHaveCount(0);
    } finally {
      await removeStandaloneImage(tag, containerName);
    }
  });

  // REQ-26 — the comparison's availability follows the live list: an image appearing from outside the application is
  // offered as the second side at the next opening, with no reload.
  test('offers an image that appeared while the screen was open as the comparison\'s second side', async ({ page }) => {
    const runId = Date.now();
    const containerName = `vexel-e2e-views-live-src-${runId}`;
    const laterContainer = `vexel-e2e-views-live-src-b-${runId}`;
    const tag = `vexel-e2e-views-live-${runId}-a:v1`;
    const laterTag = `vexel-e2e-views-live-${runId}-b:v1`;
    try {
      await createStandaloneImage(tag, containerName);
      await page.reload();
      await searchField(page).fill(`vexel-e2e-views-live-${runId}`);
      const row = imageRow(page, tag);
      await expect(row).toBeVisible({ timeout: 10_000 });
      await expect(imageRow(page, laterTag)).toHaveCount(0);

      // Built from outside the application, with the screen open and never reloaded.
      await createStandaloneImage(laterTag, laterContainer);
      await expect(imageRow(page, laterTag)).toBeVisible({ timeout: 20_000 });

      await openRowOverflow(page, row);
      const compare = menuEntry(page, 'Compare with…');
      await expect(compare).not.toHaveAttribute('aria-disabled', 'true');
      await compare.click();

      const modal = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Compare filesystems' }) });
      await expect(modal).toBeVisible();
      await modal.getByLabel('Second image').selectOption({ label: laterTag });
      await expect(modal.getByLabel('Second image')).toHaveValue(/./);
    } finally {
      await removeStandaloneImage(laterTag, laterContainer);
      await removeStandaloneImage(tag, containerName);
    }
  });
});
