/**
 * A push the daemon refuses, driven through the product's own interface
 * (plan-docker_management_app-push_failure_reporting/REQ-8, REQ-9, REQ-10).
 *
 * **This is a guard, not a demonstration.** The refusal exercised here is one
 * the daemon *states*, and the product as delivered already drew it: this file
 * passes on the correction and on the build before it alike. What it protects is
 * that the operator keeps being told — as a toast carrying the daemon's own words
 * (plan-docker_management_app-inline_error_panels/REQ-5, /REQ-7), the dialog stating
 * none of it. The half that fails without the
 * correction is the *unstated* end, which no daemon can be asked for on demand;
 * it is checked where it is observable, in
 * `server/test/unit/image-transfer-service.test.ts` and
 * `server/test/unit/image-transfer-outcome-endpoint.test.ts`.
 *
 * No network is reached: nothing listens on port 1 of the loopback, and the daemon says so at once.
 * The address is written **`127.0.0.1:1` and never `localhost:1`**, and that is the difference
 * between a tenth of a second and thirty seconds. `localhost` resolves to `::1` first inside the
 * daemon's own VM, and `[::1]:1` does not refuse the connection — it swallows it, so the daemon
 * spends its entire dial timeout before giving up: `dial tcp [::1]:1: i/o timeout`, measured at
 * 30.14s / 30.10s / 30.09s over three consecutive pushes. The IPv4 loopback answers
 * `connect: connection refused` in 0.06–0.08s over the same three, and is covered by the same
 * `127.0.0.0/8` entry of the daemon's insecure-registry list, so the registry is treated
 * identically. That also retires the "30.1s or 60.2s, one dial attempt or two" this file used to
 * record: the slow mode was two whole dial timeouts, not a daemon of two minds, and there is no
 * bimodality left to budget for.
 *
 * A refusal is also what REQ-1 is written about — "when the daemon **refuses** a push" — so what is
 * reproduced here is now the requirement's own case rather than its unreachable neighbour. No
 * assertion here is that a stretch of time passed without events.
 */
import { expect, test, type Page } from './support/test.js';
import { CASE_LABEL, OWNER_LABEL, RUN_ID, openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { clickAt } from './support/pointer.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/**
 * The address that refuses: nothing listens on port 1, and the IPv4 loopback states that rather
 * than timing out on it. Never `localhost:1` — see the note at the top of this file.
 */
const UNREACHABLE_REGISTRY = '127.0.0.1:1';

/**
 * The refusal itself costs 0.06–0.08s, measured over three consecutive pushes. What this budget
 * covers is everything between it and the toast — the daemon's stream, the server's own
 * translation of it and the render — with a wide margin, and it stays well above the refusal time
 * as REQ-10's first clause requires. It is not tuned to a fast path that has a slow twin: with the
 * connection refused instead of blackholed there is only the one path.
 */
const REFUSAL_BUDGET = 15_000;

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

// plan-docker_management_app-push_failure_reporting/REQ-1, REQ-2, REQ-3, REQ-8, REQ-9, REQ-10.
// REQ-4's "stays until dismissed" is superseded: the report is a toast and keeps the toast
// component's own auto-dismiss (plan-docker_management_app-inline_error_panels/REQ-5, /REQ-8).
test('a push to an address that answers nothing is reported as a toast, with the daemon’s own words', async ({ page }) => {
  // Above the default, because the fixture image is committed inside the test — not because the
  // refusal is slow: it is not.
  test.setTimeout(60_000);
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

    // The failure is a toast now, in the failure tone, and no panel states it
    // (plan-docker_management_app-inline_error_panels/REQ-5, /REQ-7).
    const toast = page.locator('.ui-toast-viewport .ui-toast').first();
    await expect(toast, 'the push’s failure was not reported to the operator').toBeVisible({ timeout: REFUSAL_BUDGET });
    await expect(toast).toHaveClass(/ui-toast--tone-danger/);

    // REQ-1: the daemon's own message, naming the address and the cause — not a wording of the application's own.
    const reported = (await toast.textContent()) ?? '';
    expect(reported.trim(), 'the failure is shown with the daemon’s message in it').not.toBe('');
    expect(reported, `the message shown does not name the address the daemon refused: “${reported}”`).toContain(UNREACHABLE_REGISTRY);
    await expect(toast.getByRole('button'), 'the toast carries a control other than its dismissal').toHaveCount(1);
    await expect(dialog.locator('.ui-error-banner'), 'the dialog stated the failure itself').toHaveCount(0);

    // REQ-2 as the operator sees it: nothing is left presented as a push in progress.
    await expect(dialog.getByRole('button', { name: 'Working…' }), 'the dialog still presents the push as running').toHaveCount(0);

    // The dialog stays open on the failure, so the push can be submitted again.
    await expect(dialogHeading).toBeVisible();

    await clickAt(page, dialog.getByRole('button', { name: 'Cancel' }), 'the push dialog’s Cancel button');
    await expect(dialogHeading).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await removeStandaloneImage(reference, containerName);
  }
});
