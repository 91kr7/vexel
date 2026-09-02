import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { expectCompletedThenSelfDismissed } from './support/progress-completion.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { TINY_IMAGE, TINY_IMAGE_FILE, ensureImage } from '../../server/test/support/base-images.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

async function createStandaloneImage(tag: string, containerName: string): Promise<void> {
  // Ensured at the point of use, not once for the run: a prune spec in this suite
  // prunes the host, so an image present at global setup may be gone by now.
  // Locally built, so putting it back costs a second and no network.
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), TINY_IMAGE]);
  await execFileAsync('docker', ['commit', containerName, tag]);
}

/**
 * How many entries the cancellation fixture carries, and why it is not the single-file image the
 * rest of this file uses.
 *
 * Cancelling contracts that a **running** extraction stops (REQ-8, REQ-24), so the run has to still
 * be running when the pointer reaches the Cancel control. Of the single-file image it is not: that
 * extraction is over in about a tenth of a second, and the check only passed because the press
 * landed inside that window — a margin a loaded machine takes away, and it takes it away as
 * `Cancel` timing out, which reads exactly like a defect in the flow this batch changed.
 *
 * So the fixture is made long-lived rather than the press made faster. The cost is paid in **tar
 * entries, not in bytes**: an extraction's duration is dominated by indexing the exported entries
 * one by one, so 40 000 empty files buy a long run for almost no disk. Measured on this machine,
 * against the product's own extraction: 6.7s end to end (0.4s creating and copying, the rest
 * indexing) for an image of **0.5 MB** — two orders of magnitude under the suite's fixture budget
 * (CLAUDE.md, "Fixtures stay small"), where a heavier base image would have bought seconds at the
 * price of hundreds of megabytes. `FROM scratch`, so nothing is pulled and no shell is needed.
 */
const CANCELLABLE_ENTRY_COUNT = 40_000;

/** An image whose extraction lasts long enough to be cancelled by a real pointer. */
async function createManyEntryImage(tag: string): Promise<void> {
  const contextDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-fsbrowser-'));
  try {
    await mkdir(join(contextDir, 'many'));
    for (let start = 0; start < CANCELLABLE_ENTRY_COUNT; start += 500) {
      await Promise.all(
        Array.from({ length: Math.min(500, CANCELLABLE_ENTRY_COUNT - start) }, (_, offset) =>
          writeFile(join(contextDir, 'many', `entry-${start + offset}.txt`), `entry ${start + offset}\n`),
        ),
      );
    }
    // An ENTRYPOINT so the image is one `docker create` accepts; it is never run, here or by the
    // extraction, which creates its intermediate container and never starts it (REQ-53).
    await writeFile(join(contextDir, 'Dockerfile'), ['FROM scratch', 'COPY many /many', 'ENTRYPOINT ["/none"]', ''].join('\n'));
    await execFileAsync('docker', ['build', ...ownershipArgs(tag), '-t', tag, contextDir], { timeout: 300_000 });
  } finally {
    await rm(contextDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Removes a fixture image **and the content behind it**, not merely its tag.
 *
 * `docker rmi -f <tag>` only untags an image some container still references, and one still does at
 * this point on the cancellation path: the intermediate extraction container is removed by the
 * server in its own `finally`, a moment after the run it belongs to was cancelled. The image was
 * then left dangling on the operator's host, once per run — labelled, so `test:sweep` could still
 * find it, but that is the sweep's job and not an excuse (CLAUDE.md, "What a test creates, it
 * destroys"). So the id is removed too, retried for as long as that removal takes.
 */
async function removeImageAndContent(tag: string): Promise<void> {
  const imageId = await execFileAsync('docker', ['image', 'inspect', '--format', '{{.Id}}', tag])
    .then(({ stdout }) => stdout.trim())
    .catch(() => '');
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
  if (!imageId) return;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const stillThere = await execFileAsync('docker', ['image', 'inspect', '--format', '{{.Id}}', imageId]).then(
      () => true,
      () => false,
    );
    if (!stillThere) return;
    await execFileAsync('docker', ['rmi', '-f', imageId]).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function removeStandaloneImage(tag: string, containerName: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
  await removeImageAndContent(tag);
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
 * (images/specs/images-screen.md).
 *
 * A real pointer at the visible controls' own coordinates, both of them: the row's overflow trigger
 * and then the menu entry (REQ-27). Nothing here calls an element's own `click()` nor dispatches an
 * event, and nothing aims at an element behind a control.
 */
async function chooseRowAction(page: Page, row: ReturnType<typeof imageRow>, label: string): Promise<void> {
  // Opening and choosing are one retried gesture, over a settled list: the list keeps re-reading
  // from the daemon's own events, and every one of the menu's specified dismissals
  // (ui-library/specs/menu.md) lands between the two halves when they are retried separately.
  await chooseFromRowOverflowMenu(page, row, label);
}

function filesystemBrowserModal(page: Page, title: string) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: title }) });
}

function confirmHeading(page: Page, tag: string): Locator {
  return page.getByRole('heading', { name: `Confirm: ${tag}` });
}

function progressHeading(page: Page): Locator {
  return page.getByRole('heading', { name: 'Extracting the filesystem' });
}

/**
 * The screen this fix removes, asserted gone (REQ-1, REQ-23): its heading, and the control inside
 * the surface that repeated the request the operator had just made.
 *
 * The `Browse filesystem…` control is scoped to the surface on purpose — the row's own menu entry
 * carries the same words legitimately, and this fix does not touch it (REQ-22).
 */
async function expectRemovedPromptAbsent(page: Page, modal: ReturnType<typeof filesystemBrowserModal>, at: string): Promise<void> {
  await expect(page.getByText('Filesystem not extracted yet'), `the removed empty state's heading is on screen ${at}`).toHaveCount(0);
  await expect(
    modal.getByRole('button', { name: 'Browse filesystem…' }),
    `the removed empty state's own "Browse filesystem…" control is inside the surface ${at}`,
  ).toHaveCount(0);
}

/** The entry count the surface states next to the freshly-extracted / from-cache marking. */
async function statedEntryCount(modal: ReturnType<typeof filesystemBrowserModal>): Promise<number> {
  const text = (await modal.locator('.ui-status-pill').first().textContent()) ?? '';
  const match = /(\d+)\s+entries/.exec(text);
  expect(match, `the surface states no entry count: read "${text}"`).not.toBeNull();
  return Number(match![1]);
}

/**
 * Records every request the page makes to the filesystem extraction stream, from now on.
 *
 * This is shape B's deterministic witness (REQ-25, REQ-26): "the tree turns up" is true of a product
 * that re-extracts at full cost every time, so what is asserted is that the extraction was **never
 * asked for**. The count is taken at the moment the listener is installed, so only what happens
 * after it belongs to the window under examination.
 */
function extractionStreamRequests(page: Page): { urls: string[] } {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/filesystem/stream')) urls.push(request.url());
  });
  return { urls };
}

/** Well past the window in which the two dialogs would have been raised, had they been raised at all. */
const SUSTAINED_ABSENCE_MS = 3_000;

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-docker_management_app-filesystem_browse_direct/REQ-1, REQ-2, REQ-3, REQ-23 — shape A, an
// image never extracted: the cost warning is the first thing on screen after the row action, the
// removed empty state is nowhere at that moment nor at any later one, and confirming reaches the
// freshly extracted tree. plan-docker_management_app/REQ-52, REQ-53 are still what the tree itself
// proves: the complete merged filesystem of an image nothing was ever run from, lazily expanded,
// with a selected entry's details.
test('opens the cost warning as the first thing after the row action, with the removed prompt nowhere, and confirming reaches the freshly extracted tree', async ({ page }) => {
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

    // The moment the whole fix is about, asserted in this order on purpose: **first** that nothing
    // on screen repeats the request just made — the assertion that has to fail on the delivered
    // product, and one placed after a locator the delivered product never reaches would never run
    // at all (REQ-1, REQ-23, REQ-30) — and then that what the row action lands on is the cost
    // warning itself, naming the image and quoting the estimate (REQ-2).
    await expectRemovedPromptAbsent(page, modal, 'at the moment the row action was chosen');
    const warning = confirmHeading(page, tag);
    await expect(warning).toBeVisible();
    const warningDialog = warning.locator('xpath=..');
    await expect(warningDialog).toContainText(/taking roughly \d+s/);
    await expect(warningDialog).toContainText(/copies out about/);

    await warningDialog.getByRole('button', { name: 'Extract' }).click();
    await expectRemovedPromptAbsent(page, modal, 'once the extraction was confirmed');

    await expect(progressHeading(page)).toBeVisible();
    const progressDialog = progressHeading(page).locator('xpath=..');
    // bug-1, untouched by this fix and still governing every dialog that is raised: the completion
    // stated while the dialog is still there, then the dialog gone with nothing pressed
    // (progress_completion_autoclose/REQ-13, REQ-18).
    await expectCompletedThenSelfDismissed(progressDialog, 15_000);

    // Where the keyboard is left once the dialog goes by itself (REQ-13): on the document, exactly
    // where a manual dismissal leaves it — the dialog's own controls having gone with the dialog —
    // and never on a control that no longer exists.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? null))
      .toBe('body');
    await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(0);

    // The outcome the operator's next look lands on: the view underneath, revealed intact.
    await expect(modal.getByText('Freshly extracted')).toBeVisible();
    expect(await statedEntryCount(modal), 'the freshly extracted tree states no entry count').toBeGreaterThan(0);
    await expectRemovedPromptAbsent(page, modal, 'once the tree had arrived');

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

    await expectRemovedPromptAbsent(page, modal, 'at the end of the flow');
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});

// plan-docker_management_app-filesystem_browse_direct/REQ-7, REQ-8, REQ-24 — the two ways out of
// shape A: declining the warning leaves nothing open and nothing extracted, and cancelling a
// started extraction returns the operator to the images list, never to a surface offering to start
// it again. plan-docker_management_app/REQ-55 is what the warning itself still serves.
test('declining the cost warning leaves nothing open and nothing extracted, and cancelling a started extraction returns to the images list', async ({ page }) => {
  // The largest budget in the suite, and it states what this case already permits itself.
  // 360s = 300 + 30 + 20 + 10 (REQ-64, REQ-65):
  //  300s — the `docker build` of the 40 000-entry fixture: the ceiling `createManyEntryImage`
  //         declares, and the largest single step this case runs;
  //   30s — the screen opened and pinned: `openApp` in this file's `beforeEach`, which spends the
  //         test's own budget;
  //   20s — the retried overflow-menu gesture after the warning has been declined;
  //   10s — the fixture image and the content behind it, removed in the `finally`:
  //         `removeImageAndContent` retries ten times, a second apart.
  test.setTimeout(360_000);
  const tag = `vexel-e2e-fsbrowser-cost-${Date.now()}:v1`;
  const extractions = extractionStreamRequests(page);
  try {
    // The many-entry fixture, not the single-file one the rest of this file uses: this is the one
    // test that has to press Cancel **while the extraction is still running**, and it is the run's
    // own length that makes that true rather than the speed of the press.
    await createManyEntryImage(tag);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await chooseRowAction(page, row, 'Browse filesystem…');
    const warning = confirmHeading(page, tag);
    await expect(warning).toBeVisible();
    const warningDialog = warning.locator('xpath=..');
    await expect(warningDialog).toContainText(/taking roughly \d+s/);

    await warningDialog.getByRole('button', { name: 'Cancel' }).click();

    // Nothing open: neither the warning, nor the progress dialog, nor a half-opened filesystem
    // surface left to dismiss (REQ-7).
    await expect(warning).toHaveCount(0);
    await expect(progressHeading(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: `Filesystem — ${tag}` })).toHaveCount(0);
    // Nothing extracted, said by the only thing that can say it deterministically: the extraction
    // was never asked for.
    expect(extractions.urls, 'declining the cost warning still requested an extraction').toEqual([]);

    // And the operator is back on the images list with the row action still available.
    await expect(row).toBeVisible();
    await expect(async () => {
      await row.getByRole('button', { name: /^More actions for / }).click();
      await expect(page.getByRole('menu')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByRole('menuitem', { name: 'Browse filesystem…', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);

    // Starting for real, then cancelling the progress dialog itself.
    await chooseRowAction(page, row, 'Browse filesystem…');
    await expect(warning).toBeVisible();
    await warningDialog.getByRole('button', { name: 'Extract' }).click();
    await expect(progressHeading(page)).toBeVisible();

    // The witness's own floor, and the reason the empty expectations above and in the shape B check
    // mean anything: an extraction that **is** asked for is recorded. Without this, `toEqual([])`
    // would also be satisfied by a recorder that never sees a request at all — the shape in which
    // shape B's deterministic assertion (REQ-25, REQ-26) would silently stop being able to fail.
    await expect
      .poll(() => extractions.urls.length, { message: 'the extraction-stream witness recorded nothing for an extraction that did start' })
      .toBe(1);

    // What is being cancelled is a **running** extraction (REQ-8), and this is what says so at the
    // moment of the press rather than hoping for it: the surface offers Cancel only while the
    // operation is active, and Close as soon as it is not
    // (ui-library/specs/transfer-progress-dialog.md). The many-entry fixture is what makes this
    // true with room to spare — a measured 6.7s of run against a press that arrives in a fraction
    // of a second — instead of by the press winning a race.
    const cancelAction = progressHeading(page).locator('xpath=..').getByRole('button', { name: 'Cancel' });
    await expect(cancelAction, 'the extraction was already over before it could be cancelled').toBeVisible();
    await expect(progressHeading(page).locator('xpath=..').getByRole('button', { name: 'Close' })).toHaveCount(0);
    await cancelAction.click();

    // Back on the images list, and on no surface offering to start it again (REQ-8).
    await expect(progressHeading(page)).toHaveCount(0);
    await expect(warning).toHaveCount(0);
    await expect(page.getByRole('heading', { name: `Filesystem — ${tag}` })).toHaveCount(0);
    await expect(page.getByText('Filesystem not extracted yet')).toHaveCount(0);
    await expect(row).toBeVisible();
  } finally {
    await removeImageAndContent(tag);
  }
});

// plan-docker_management_app-filesystem_browse_direct/REQ-4, REQ-5, REQ-15, REQ-25, REQ-26 — shape
// B, an image whose extraction is still kept: the second open raises **neither** dialog, asserted
// as a sustained absence across the window in which they would have appeared and backed by the
// deterministic witness — no request to the extraction stream at all — and the tree is there,
// marked as a reused result with its entry count. plan-docker_management_app/REQ-113 is what the
// reuse itself still serves; `Re-extract…` (REQ-10) is the one path that still warns.
test('opens a kept extraction straight into the tree, with no warning and no progress dialog at any point, and no extraction requested', async ({ page }) => {
  const containerName = `vexel-e2e-fsbrowser-cache-src-${Date.now()}`;
  const tag = `vexel-e2e-fsbrowser-cache-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // The kept result is made by this test, inside this test: the run's data directory is emptied
    // before every single test, so nothing here is inherited (CLAUDE.md, "Tests").
    await chooseRowAction(page, row, 'Browse filesystem…');
    const modal = filesystemBrowserModal(page, `Filesystem — ${tag}`);
    await confirmHeading(page, tag).locator('xpath=..').getByRole('button', { name: 'Extract' }).click();
    await expectCompletedThenSelfDismissed(progressHeading(page).locator('xpath=..'), 15_000);
    await expect(modal.getByText('Freshly extracted')).toBeVisible();
    const freshEntryCount = await statedEntryCount(modal);

    // Closes the browser's own Modal (overlay click, away from its content — the modal is still
    // covering the row underneath), which discards its client-side state entirely: only the open
    // view is rendered, so nothing of it survives the closing. What the second open then reads is
    // the server's kept result and nothing else (images/specs/images-screen.md).
    await page.locator('.ui-modal-overlay').click({ position: { x: 5, y: 5 } });
    await expect(modal).toHaveCount(0);

    const extractions = extractionStreamRequests(page);
    await chooseRowAction(page, imageRow(page, tag), 'Browse filesystem…');
    const reopened = filesystemBrowserModal(page, `Filesystem — ${tag}`);
    await expect(reopened).toBeVisible();

    // The whole claim of shape B, asserted as **one window** rather than as two assertions that
    // could each be true for the wrong reason (REQ-25):
    //
    // - neither dialog is on screen at any tick of it — sustained, not instantaneous, since an
    //   assertion made in the same tick as the open passes on a product that raises them a moment
    //   later;
    // - and the reused result arrives **within that same window, with nothing pressed**. This half
    //   is what fails on the delivered product, where the two dialogs are indeed absent — because
    //   the surface has stopped on a screen offering to start the work, and stays there for ever.
    //
    // The window lasts at least SUSTAINED_ABSENCE_MS even once the tree is up, so the dialogs are
    // still absent well past the moment they would have been raised.
    const floor = Date.now() + SUSTAINED_ABSENCE_MS;
    const deadline = Date.now() + 20_000;
    let arrived = false;
    while (Date.now() < deadline) {
      await expect(confirmHeading(page, tag), 'the cost warning was raised on an open that starts no operation').toHaveCount(0);
      await expect(progressHeading(page), 'the progress dialog was raised for an operation that never runs').toHaveCount(0);
      if (!arrived) arrived = await reopened.getByText('From cache').isVisible();
      if (arrived && Date.now() >= floor) break;
      await page.waitForTimeout(100);
    }
    expect(
      arrived,
      'the reused result never reached the operator on its own: neither dialog was raised, but the surface stopped on something that had to be pressed first',
    ).toBe(true);

    // The tree is there, marked as reused, carrying the same entry count as the extraction that
    // produced it — the reuse claim itself, and the reason the read answers with a summary rather
    // than a boolean (REQ-4, REQ-20).
    await expect(reopened.getByText('From cache')).toBeVisible();
    expect(await statedEntryCount(reopened), 'the reused result states a different entry count from the extraction that produced it').toBe(freshEntryCount);
    await expect(reopened.locator('.ui-tree-view__row', { hasText: TINY_IMAGE_FILE })).toBeVisible();
    await expectRemovedPromptAbsent(page, reopened, 'on the reused-result open');

    // The deterministic half of the claim: the whole open asked for no extraction whatsoever. This
    // is what fails on a product that silently re-extracts at full cost every time.
    expect(extractions.urls, 'the open of a kept result requested an extraction').toEqual([]);

    // `Re-extract…` is the one path where the cost is always real, and it still warns (REQ-10).
    await reopened.getByRole('button', { name: 'Re-extract…' }).click();
    await expect(confirmHeading(page, tag)).toBeVisible();
    await expect(confirmHeading(page, tag).locator('xpath=..')).toContainText(/taking roughly \d+s/);
    await confirmHeading(page, tag).locator('xpath=..').getByRole('button', { name: 'Cancel' }).click();

    // Declining *that* warning falls back to the tree it was asked from, not out of the surface:
    // what REQ-7 removes is the fall-back to a prompt with nothing behind it, and here there is
    // something behind it — the reused result the operator was already reading (REQ-10, REQ-11).
    await expect(confirmHeading(page, tag)).toHaveCount(0);
    await expect(reopened.getByText('From cache')).toBeVisible();
    expect(extractions.urls, 'declining the re-extraction still requested one').toEqual([]);
  } finally {
    await removeStandaloneImage(tag, containerName);
  }
});
