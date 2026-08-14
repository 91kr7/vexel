import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from './support/test.js';

import { openApp, ownershipArgs } from './support/fixtures.js';
import { countStreamProgressEvents, progressEventsSeen } from './support/analysis-progress-events.js';
import { expectCompletedThenSelfDismissed } from './support/progress-completion.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

async function buildImage(tag: string, dockerfile: string): Promise<void> {
  const contextDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-signals-'));
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

function signalsModal(page: Page, title: RegExp) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: title }) });
}

/**
 * Scopes to the Nth findings list in the view (0: wasted files, 1: duplicated content, 2: flagged
 * paths — the fixed order the sections appear in). A path can legitimately appear in more than one
 * category at once (e.g. a credential-looking file later deleted is both wasted bytes, REQ-65, and a
 * secret-pattern finding, REQ-67), so assertions below are scoped per section rather than searched
 * across the whole modal.
 */
function findingsSection(modal: ReturnType<typeof signalsModal>, index: number) {
  return modal.locator('.ui-card-list').nth(index);
}

// A small fixture image (built on the already-local `alpine:3.20`, no network pull needed) with,
// across two RUN layers: a file overwritten by the second layer (waste, REQ-65), two files sharing
// identical content in the same layer (duplicate content, REQ-66), and a credential-looking path
// removed by the second layer (secret-pattern signal, REQ-67) — the same fixture shape verified at
// the REST API level, exercised here through the operator's own path in the browser.
const TAG = `vexel-e2e-signals-${Date.now()}:v1`;
const DOCKERFILE = [
  'FROM alpine:3.20',
  "RUN mkdir -p /data /root/.aws && \\",
  "    printf 'duplicate-payload' > /data/dup1.bin && \\",
  '    cp /data/dup1.bin /data/dup2.bin && \\',
  "    printf 'first-version-of-the-file-with-more-bytes' > /data/waste.bin && \\",
  "    printf 'npm-token-placeholder' > /root/.npmrc && \\",
  "    printf 'aws-secret-placeholder' > /root/.aws/credentials",
  "RUN printf 'v2' > /data/waste.bin && rm /root/.npmrc",
  '',
].join('\n');

/**
 * A second image, sharing the fixture's own base layer and carrying no analysis of its own: what the
 * findings map must **not** be applied to. Its single layer is the base one, the same index the
 * fixture's own findings fall on, so a map left unscoped would mark it.
 */
const OTHER_TAG = `vexel-e2e-signals-other-${Date.now()}:v1`;
const OTHER_DOCKERFILE = ['FROM alpine:3.20', 'LABEL vexel.e2e=signals-other', ''].join('\n');

test.beforeAll(async () => {
  await buildImage(TAG, DOCKERFILE);
  await buildImage(OTHER_TAG, OTHER_DOCKERFILE);
});

test.afterAll(async () => {
  await removeImageQuietly(TAG);
  await removeImageQuietly(OTHER_TAG);
});

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-docker_management_app/REQ-65, plan-docker_management_app/REQ-66, plan-docker_management_app/REQ-67 —
// the efficiency/signals view surfaces a heuristic disclaimer, then, once analysed, all three
// findings categories for the fixture image; drilling down from a finding reaches the layer explorer
// pre-selected at the layer it concerns, which in turn marks that layer as carrying findings.
test('analyzes layer efficiency and secret signals, then navigates from a finding to its layer', async ({ page }) => {
  await searchField(page).fill(TAG);
  const row = imageRow(page, TAG);
  await expect(row).toBeVisible({ timeout: 10_000 });

  // Opened from the row's own menu with no row selected and no detail panel open — the case that
  // did not exist while this view was the panel's (panel_actions_to_menu/REQ-13, REQ-30).
  await chooseRowAction(page, row, 'Efficiency & signals…');
  const modal = signalsModal(page, /^Efficiency & signals/);
  await expect(modal).toBeVisible();
  await expect(page.locator('.ui-detail-panel')).toHaveCount(0);

  // layer-efficiency-view.md — the heuristic disclaimer is shown before any analysis has run.
  await expect(modal.getByText(/heuristic/i)).toBeVisible();
  await expect(modal.getByText(/security/i)).toBeVisible();

  await modal.getByRole('button', { name: 'Analyze layer efficiency…' }).click();
  const confirmHeading = page.getByRole('heading', { name: `Confirm: ${TAG}` });
  await expect(confirmHeading).toBeVisible();
  await confirmHeading.locator('xpath=..').getByRole('button', { name: 'Analyze', exact: true }).click();

  const progressDialog = page.getByRole('heading', { name: 'Analyzing layer efficiency' }).locator('xpath=..');
  // The second of the two dialogs the human reported, as the same sequence over time: the
  // completion stated while the dialog is still there, then the dialog gone with nothing pressed
  // (progress_completion_autoclose/REQ-18). The `Close` press that used to be here would now race
  // the dialog's own dismissal.
  await expectCompletedThenSelfDismissed(progressDialog, 60_000);

  // The efficiency signals, readable behind the dialog that left on its own (REQ-13).
  const wasteSection = findingsSection(modal, 0);
  const duplicatesSection = findingsSection(modal, 1);
  const secretsSection = findingsSection(modal, 2);

  // plan-docker_management_app/REQ-65 — the overwritten data/waste.bin is reported wasted.
  await expect(wasteSection.getByText('data/waste.bin')).toBeVisible();
  // plan-docker_management_app/REQ-66 — dup1.bin and dup2.bin share identical content.
  await expect(duplicatesSection.getByText('data/dup1.bin', { exact: false })).toBeVisible();
  await expect(duplicatesSection.getByText('data/dup2.bin', { exact: false })).toBeVisible();
  // plan-docker_management_app/REQ-67 — both the removed and the surviving credential-looking
  // paths are flagged, as secret-pattern findings specifically (root/.npmrc, since removed, is also
  // counted among the wasted files above — expected, its bytes are gone too).
  await expect(secretsSection.getByText('root/.npmrc')).toBeVisible();
  await expect(secretsSection.getByText('root/.aws/credentials')).toBeVisible();

  // Drilling down from the wasted file navigates to the layer explorer, pre-selected at the layer
  // that wrote the now-dead bytes, already analyzing — the hand-off the screen holds now (images-screen.md).
  await wasteSection.getByText('data/waste.bin').click();
  await wasteSection.getByRole('button', { name: /View layer/i }).click();

  const layerModal = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Layer stack — ${TAG}` }) });
  await expect(layerModal).toBeVisible();
  // layer-explorer.md — layers carrying a signals finding show a "findings · <count>" marker; the
  // fixture's base image itself carries a few heuristic matches too (REQ-67 is explicitly a
  // heuristic, not an exhaustive verdict), so more than one layer may legitimately show one.
  await expect(layerModal.getByText(/findings · \d+/).first()).toBeVisible({ timeout: 15_000 });
  // A row is already selected and its changeset already shown (autoAnalyze, no cost warning), since
  // this layer's changesets were already computed as part of the shared job.
  await expect(layerModal.locator('.ui-data-table__row--selected').first()).toBeVisible({ timeout: 15_000 });
  await expect(layerModal.getByText('Changesets not analyzed yet')).toHaveCount(0);

  // images-screen.md — the findings map marks the layers carrying findings **for that image alone**.
  // Now that it is the screen's state rather than the panel's, another image's explorer opened right
  // after must carry none of it (panel_actions_to_menu/REQ-17).
  await page.locator('.ui-modal-overlay').click({ position: { x: 5, y: 5 } });
  await expect(layerModal).toHaveCount(0);
  await searchField(page).fill(OTHER_TAG);
  const otherRow = imageRow(page, OTHER_TAG);
  await expect(otherRow).toBeVisible({ timeout: 10_000 });

  await chooseRowAction(page, otherRow, 'Explore layers…');

  const otherModal = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Layer stack — ${OTHER_TAG}` }) });
  await expect(otherModal.locator('.ui-data-table__row').first()).toBeVisible({ timeout: 20_000 });
  await expect(otherModal.getByText(/findings · \d+/)).toHaveCount(0);
});

// **bug-1's cached-run coverage, relocated here — it was not deleted**
// (plan-docker_management_app-filesystem_browse_direct/REQ-28).
//
// It moved here because this fix removes the dialog from the cached filesystem path: the filesystem
// browser now opens a kept result straight into the tree, raising no progress dialog at all, so the
// scenario that certified bug-1's hardest case had nowhere left to live there.
//
// The case itself: a run **served from the shared changeset cache, for which no phase is ever
// reported**. The dialog's caption has nothing to describe, and it must state `Completed` all the
// same — not the "no phase yet" wording it used to be left on under a full bar — and then leave on
// its own, with nothing pressed
// (plan-docker_management_app-progress_completion_autoclose/REQ-2, REQ-22).
//
// Both runs are this test's own: the run's data directory — the analysis cache included — is
// emptied before every single test, so the cache hit is created here, within the test, and nothing
// is inherited from the test above.
test('states the completion and leaves on its own for a cached analysis, which reports no phase at all', async ({ page }) => {
  // The witness of the scenario itself: how many phases each run actually reported. "The dialog
  // completed and left" is true of an ordinary uncached run too, so without this the relocated
  // check would no longer be bug-1's hardest case at all — merely a second copy of the test above.
  // Installed as an init script, so the reload below is what arms it.
  await countStreamProgressEvents(page);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();

  await searchField(page).fill(TAG);
  const row = imageRow(page, TAG);
  await expect(row).toBeVisible({ timeout: 10_000 });

  // First run: genuinely uncached, and the one that populates the changeset cache.
  await chooseRowAction(page, row, 'Efficiency & signals…');
  const modal = signalsModal(page, /^Efficiency & signals/);
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Analyze layer efficiency…' }).click();
  await page.getByRole('heading', { name: `Confirm: ${TAG}` }).locator('xpath=..').getByRole('button', { name: 'Analyze', exact: true }).click();
  await expectCompletedThenSelfDismissed(page.getByRole('heading', { name: 'Analyzing layer efficiency' }).locator('xpath=..'), 60_000);
  await expect(modal.getByText('Efficiency score')).toBeVisible();

  // The witness's own floor: a run that really did the work reports phases, so the zero asserted
  // after the second run is a fact about that run and not about a counter that never counts.
  const phasesOnTheFirstRun = await progressEventsSeen(page, '/signals/stream');
  expect(phasesOnTheFirstRun, 'the uncached analysis reported no phase either: the phase witness counts nothing').toBeGreaterThan(0);

  // Closes the view's own Modal (overlay click, away from its content), which discards its
  // client-side state entirely: only the open view is rendered, so nothing of it survives the
  // closing (images/specs/images-screen.md). Re-opened from the row, the view is back on its own
  // `Not analyzed yet` screen — deliberately left to its own report and untouched by this fix
  // (filesystem_browse_direct/REQ-22) — which is what makes the second run a genuine question to
  // the server's cache.
  await page.locator('.ui-modal-overlay').click({ position: { x: 5, y: 5 } });
  await expect(modal).toHaveCount(0);

  await chooseRowAction(page, imageRow(page, TAG), 'Efficiency & signals…');
  const reopened = signalsModal(page, /^Efficiency & signals/);
  await expect(reopened.getByText('Not analyzed yet')).toBeVisible();

  await reopened.getByRole('button', { name: 'Analyze layer efficiency…' }).click();
  await page.getByRole('heading', { name: `Confirm: ${TAG}` }).locator('xpath=..').getByRole('button', { name: 'Analyze', exact: true }).click();

  const cachedProgressDialog = page.getByRole('heading', { name: 'Analyzing layer efficiency' }).locator('xpath=..');
  await expectCompletedThenSelfDismissed(cachedProgressDialog, 15_000);

  await expect(reopened.getByText('Efficiency score')).toBeVisible({ timeout: 15_000 });

  // And the second run is the case itself: served from the shared changeset cache, it reported no
  // phase at all — so the completion the dialog stated above replaced the "no phase reported yet"
  // wording under a full bar, which is precisely what bug-1 was certified on
  // (progress_completion_autoclose/REQ-2, REQ-22).
  expect(
    await progressEventsSeen(page, '/signals/stream'),
    'the second analysis reported phases of its own: it was not served from the cache, so the relocated scenario never exercised the no-phase case',
  ).toBe(phasesOnTheFirstRun);
});
