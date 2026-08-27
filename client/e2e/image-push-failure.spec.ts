/**
 * A push the daemon refuses, driven through the product's own interface
 * (plan-docker_management_app-push_failure_reporting/REQ-8, REQ-9, REQ-10).
 *
 * **This is a guard, not a demonstration.** The refusal exercised here is one
 * the daemon *states*, and the product as delivered already drew it: this file
 * passes on the correction and on the build before it alike. What it protects is
 * that the operator keeps being told — in the place the push's progress is
 * reported, with the daemon's own words in it. The half that fails without the
 * correction is the *unstated* end, which no daemon can be asked for on demand;
 * it is checked where it is observable, in
 * `server/test/unit/image-transfer-service.test.ts` and
 * `server/test/unit/image-transfer-outcome-endpoint.test.ts`.
 *
 * No network is reached: `localhost:1` answers nothing, and the daemon takes
 * either 30.1s or 60.2s to give up on it (measured, see the budget below). Every
 * budget here is therefore well above the forty-five seconds the plan grants —
 * never below — and no assertion here is that a stretch of time passed without
 * events.
 */
import { expect, test, type Page } from './support/test.js';
import { CASE_LABEL, OWNER_LABEL, RUN_ID, openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { clickAt } from './support/pointer.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

/** The address that answers nothing: the refusal is reproduced without reaching any network. */
const UNREACHABLE_REGISTRY = 'localhost:1';

/**
 * Well above the forty-five seconds the plan grants, and deliberately not tuned
 * to the fast case: measured on this daemon, the same refusal is stated at
 * either 30.1s or 60.2s — one dial attempt or two — over six consecutive runs,
 * three of each. A budget between those two values fails half the time on a
 * refusal the product reported perfectly.
 */
const REFUSAL_BUDGET = 150_000;

test.describe.configure({ mode: 'serial' });

function imageRow(page: Page, text: string) {
  return page.locator('.ui-data-table__row', { hasText: text });
}

function searchField(page: Page) {
  return page.getByPlaceholder('Search reference or digest…');
}

/**
 * A standalone single-tag image carrying the ownership labels: its own id, so
 * the row and the push dialog name this reference and no other tag of some
 * image that happens to share it.
 */
async function createStandaloneImage(reference: string, containerName: string): Promise<void> {
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), TINY_IMAGE]);
  await execFileAsync('docker', [
    'commit',
    '--change',
    `LABEL ${OWNER_LABEL}=${RUN_ID}`,
    '--change',
    `LABEL ${CASE_LABEL}=${containerName}`,
    containerName,
    reference,
  ]);
}

async function removeStandaloneImage(reference: string, containerName: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', reference]).catch(() => undefined);
  await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
}

test.beforeEach(async ({ page }) => {
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-docker_management_app-push_failure_reporting/REQ-1, REQ-2, REQ-3, REQ-4, REQ-8, REQ-9, REQ-10
test('a push to an address that answers nothing is shown as a failure, with the daemon’s own words, and stays until dismissed', async ({ page }) => {
  // The daemon's own refusal is what is waited for, so the default per-test
  // budget is not the measure of anything this test is about.
  test.setTimeout(240_000);
  const containerName = `vexel-e2e-push-refused-${Date.now()}`;
  const reference = `${UNREACHABLE_REGISTRY}/vexel-e2e-push-refused-${Date.now()}:v1`;
  await createStandaloneImage(reference, containerName);
  try {
    await page.reload();
    await searchField(page).fill(reference);
    const row = imageRow(page, reference);
    await expect(row).toBeVisible({ timeout: 15_000 });

    await chooseFromRowOverflowMenu(page, row, 'Push…');
    const dialogHeading = page.getByRole('heading', { name: `Push ${reference}` });
    const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
    await expect(dialog).toBeVisible();

    // Watched from here on: the assertions below start before the push does, so
    // nothing that happens while the daemon is giving up can be missed.
    await clickAt(page, dialog.getByRole('button', { name: 'Push', exact: true }), 'the push dialog’s Push button');

    const banner = dialog.locator('.ui-error-banner');
    await expect(banner.locator('.ui-error-banner__title'), 'the push’s own dialog states that the push failed').toHaveText('Push failed', {
      timeout: REFUSAL_BUDGET,
    });

    // REQ-1: the daemon's own message, naming the address and the cause — not a wording of the application's own.
    const detail = (await banner.locator('.ui-error-banner__detail').textContent()) ?? '';
    expect(detail.trim(), 'the failure is shown with the daemon’s message in it').not.toBe('');
    expect(detail, `the message shown does not name the address the daemon refused: “${detail}”`).toContain(UNREACHABLE_REGISTRY);

    // REQ-2 as the operator sees it: nothing is left presented as a push in progress.
    await expect(dialog.getByRole('button', { name: 'Working…' }), 'the dialog still presents the push as running').toHaveCount(0);

    // REQ-4: it stays there, and goes only when the operator closes it.
    await page.waitForTimeout(3_000);
    await expect(banner, 'the failure was taken off the screen before the operator dismissed it').toBeVisible();
    await expect(dialogHeading).toBeVisible();

    await clickAt(page, dialog.getByRole('button', { name: 'Cancel' }), 'the push dialog’s Cancel button');
    await expect(dialogHeading).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await removeStandaloneImage(reference, containerName);
  }
});
