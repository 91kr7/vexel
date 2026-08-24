/**
 * **The efficiency & signals dialog, as a subject a check can drive** — its
 * fixture image, the operator's own path to it, and the analysis that fills its
 * three lists
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-21`).
 *
 * It lives here rather than inside one spec because **two of batch 4's checks
 * need the same dialog in the same state**: the criteria file measures its three
 * lists at three viewports, and the product-wide sweep walks into it as the one
 * converted list that does not live on a screen. A fixture written twice is a
 * fixture that will one day be two, and "the sweep measures what the criteria
 * measured" is only true while both are looking at the same rows.
 *
 * **Nothing here reaches Docker Hub** (CLAUDE.md, "No test reaches Docker
 * Hub"): the image is built `FROM` the suite's own mirrored base, which the
 * preliminary step of every run puts on the daemon, and it carries the ownership
 * labels so a killed run's leftovers are still sweepable. The caller removes it
 * in an `afterAll`.
 *
 * **Every interaction is a real pointer at the visible control's own
 * coordinates**, never `element.click()` and never a dispatched event: a
 * programmatic activation moves no focus and hit-tests nothing, and both are
 * what a defect of this kind hides behind (CLAUDE.md, "What a check drives, and
 * what it measures").
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page } from './test.js';
import { openApp, ownershipArgs } from './fixtures.js';
import { execFileAsync } from '../../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../../server/test/support/base-images.js';
import { expectCompletedThenSelfDismissed } from './progress-completion.js';
import { clickAt } from './pointer.js';
import { chooseFromRowOverflowMenu } from './row-overflow-menu.js';
import { LARGE_DIALOG_REGION } from './classic-table.js';

/**
 * A list of this dialog is named by a column only it carries — the three share
 * `PATH`, so none of them may be named by that.
 */
export const DIALOG_LISTS = {
  wasted: 'SUPERSEDED AT',
  duplicated: 'DUPLICATE',
  flagged: 'PATTERN',
} as const;

/** Read inside the dialog, which is the region these three lists live in. */
export const IN_THE_DIALOG = { region: LARGE_DIALOG_REGION };

/**
 * **Two findings of every kind, deliberately**, because one is not a list: the
 * criteria are about the junction between two rows, and a list of one row has
 * none to measure. So the image writes two files a later layer supersedes, two
 * pairs of identical content at four paths, and two credential-looking paths.
 */
const DOCKERFILE = [
  `FROM ${ALPINE_IMAGE}`,
  'RUN mkdir -p /data /root/.aws && \\',
  "    printf 'duplicate-payload-alpha-with-enough-bytes-to-be-a-file' > /data/dup-a1.bin && \\",
  '    cp /data/dup-a1.bin /data/dup-a2.bin && \\',
  "    printf 'duplicate-payload-beta-which-differs-from-the-first-one' > /data/dup-b1.bin && \\",
  '    cp /data/dup-b1.bin /data/dup-b2.bin && \\',
  "    printf 'first-version-of-a-file-later-overwritten-with-two-bytes' > /data/waste-overwritten.bin && \\",
  "    printf 'a-file-written-by-one-layer-and-deleted-by-the-next-one' > /data/waste-deleted.bin && \\",
  "    printf 'npm-token-placeholder' > /root/.npmrc && \\",
  "    printf 'aws-secret-placeholder' > /root/.aws/credentials",
  "RUN printf 'v2' > /data/waste-overwritten.bin && rm /data/waste-deleted.bin",
  '',
].join('\n');

/** Builds the fixture image, labelled for ownership, fetching nothing. */
export async function buildEfficiencyFixtureImage(tag: string, caseName: string): Promise<void> {
  // Ensured at the point of use, not once for the run: the exclusive project prunes the host.
  await ensureImage(ALPINE_IMAGE);
  const contextDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-efficiency-'));
  try {
    await writeFile(join(contextDir, 'Dockerfile'), DOCKERFILE, 'utf8');
    await execFileAsync('docker', ['build', ...ownershipArgs(caseName), '-t', tag, contextDir]);
  } finally {
    await rm(contextDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function removeEfficiencyFixtureImage(tag: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
}

/** Re-exported where its callers have always found it; it lives apart so this module can be imported by the one it uses. */
export { clickAt } from './pointer.js';

/** The efficiency & signals dialog, opened from the image row's own overflow menu. */
export async function openTheDialog(page: Page, image: string): Promise<Locator> {
  await page.getByPlaceholder('Search reference or digest…').fill(image);
  const row = page.locator('.ui-data-table__row', { hasText: image }).first();
  await expect(row, `the images list does not draw a row for ${image}`).toBeVisible({ timeout: 30_000 });

  // Opening and choosing are one retried gesture, over a settled list: the list
  // keeps re-reading from the daemon's own events, and every one of the menu's
  // specified dismissals (`ui-library/specs/menu.md`) lands between the two
  // halves when they are retried separately.
  await chooseFromRowOverflowMenu(page, row, 'Efficiency & signals…');

  const modal = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: /^Efficiency & signals/ }) });
  await expect(modal, 'the efficiency & signals dialog did not open').toBeVisible({ timeout: 20_000 });
  return modal;
}

/** Runs the analysis and waits for the findings to be readable behind the dialog that leaves on its own. */
export async function analyzeTheImage(page: Page, modal: Locator, image: string): Promise<void> {
  await clickAt(page, modal.getByRole('button', { name: 'Analyze layer efficiency…' }), 'the Analyze invitation');
  const confirmHeading = page.getByRole('heading', { name: `Confirm: ${image}` });
  await expect(confirmHeading, 'the cost warning did not open').toBeVisible({ timeout: 20_000 });
  await clickAt(page, confirmHeading.locator('xpath=..').getByRole('button', { name: 'Analyze', exact: true }), 'the Analyze confirmation');

  await expectCompletedThenSelfDismissed(page.getByRole('heading', { name: 'Analyzing layer efficiency' }).locator('xpath=..'), 180_000);
  await expect(modal.getByText('Efficiency score'), 'the analysis produced no result to measure').toBeVisible({ timeout: 30_000 });
}

/** The screen, the dialog and the analysis, in the one order an operator performs them. */
export async function openTheAnalysedDialog(page: Page, image: string): Promise<Locator> {
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 30_000 });
  const modal = await openTheDialog(page, image);
  await analyzeTheImage(page, modal, image);
  return modal;
}
