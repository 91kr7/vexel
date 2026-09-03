/**
 * The batch's acceptance scenarios, driven through the browser: a failure that is not the lost
 * connection is told by a toast and by nothing in the page, and the lost connection is told by the
 * header alone (plan-docker_management_app-inline_error_panels/REQ-5, /REQ-6, /REQ-7, /REQ-8,
 * /REQ-13).
 *
 * Every refusal below is one the daemon states, and none of it touches the machine beyond the
 * fixtures the file creates: an invalid volume name creates nothing, a mounted volume refuses its
 * own removal, and the pull is aimed at `127.0.0.1:1`, where nothing listens and the daemon says so
 * at once. The lost connection is severed at the boundary — the channel is aborted in the browser —
 * so the operator's daemon is neither stopped nor touched (`CLAUDE.md`).
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { clickAt } from './support/pointer.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/** Nothing listens on port 1 of the IPv4 loopback, and the daemon refuses in under a tenth of a second. */
const UNREACHABLE_REGISTRY = '127.0.0.1:1';

/** The toast component's own cap on how many are on screen at once (…/REQ-8). */
const VISIBLE_TOAST_CAP = 3;

function header(page: Page): Locator {
  return page.locator('header.ui-page-header');
}

/** The page body: the content area the active screen owns, header and toast stack excluded. */
function pageBody(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

function toasts(page: Page): Locator {
  return page.locator('.ui-toast-viewport .ui-toast');
}

async function createNamedVolume(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(name), name]);
}

async function removeVolumeQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
}

async function createContainerMounting(name: string, volume: string): Promise<void> {
  await execFileAsync('docker', [
    'run', '-d', '--name', name, ...ownershipArgs(name), '-v', `${volume}:/data`, '--entrypoint', 'sleep', 'alpine:3.20', '300',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** The volumes panel of the screen, as opposed to the networks panel under it, which has a create and a prune of its own. */
function volumesPanel(page: Page): Locator {
  return page
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Volumes' }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

function volumeRow(page: Page, name: string): Locator {
  return volumesPanel(page).locator('.ui-data-table__row', { hasText: name });
}

/** The live channel, refused for the whole run of a test. */
async function refuseTheChannel(page: Page): Promise<void> {
  await page.route('**/api/live', (route) => route.abort());
}

test.describe('a failure that is not the lost connection', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();
  });

  // Scenario: a failed action is reported by a toast and by nothing in the page (…/REQ-5, /REQ-7)
  test('a refused removal is told by one danger toast carrying the daemon message, and by nothing in the page', async ({ page }) => {
    test.setTimeout(90_000);
    const volume = `vexel-e2e-refused-remove-${Date.now()}`;
    const holder = `${volume}-holder`;
    try {
      await createNamedVolume(volume);
      await createContainerMounting(holder, volume);
      await page.reload();
      const row = volumeRow(page, volume);
      await expect(row).toBeVisible({ timeout: 20_000 });

      await clickAt(page, row.getByRole('button', { name: 'Remove', exact: true }), 'the volume row’s Remove control');
      const confirmHeading = page.getByRole('heading', { name: `Confirm: ${volume}` });
      await expect(confirmHeading).toBeVisible();
      const confirmation = page.locator('.ui-modal').filter({ has: confirmHeading });
      await clickAt(page, confirmation.getByRole('button', { name: 'Remove' }), 'the confirmation’s Remove control');

      const toast = toasts(page).first();
      await expect(toast, 'the refusal was not reported as a toast').toBeVisible({ timeout: 20_000 });
      await expect(toast, 'the failure was not reported in the failure tone').toHaveClass(/ui-toast--tone-danger/);
      // The daemon's own words, naming the volume it refused to remove.
      await expect(toast).toContainText(volume);
      await expect(toast).toContainText(/in use|Error response from daemon/i);

      // The only control on it is its dismissal (…/REQ-7).
      const controls = toast.getByRole('button');
      await expect(controls).toHaveCount(1);
      await expect(controls.first()).toHaveAccessibleName(/^Dismiss notification: /);

      // Bottom-right corner, and outside the page body altogether.
      const viewport = page.viewportSize()!;
      const box = (await toast.boundingBox())!;
      expect(box.x + box.width / 2, 'the toast is not in the right half of the viewport').toBeGreaterThan(viewport.width / 2);
      expect(box.y + box.height / 2, 'the toast is not in the bottom half of the viewport').toBeGreaterThan(viewport.height / 2);

      // No panel anywhere in the page reports it (…/REQ-5).
      await expect(pageBody(page).locator('.ui-error-banner'), 'a panel in the page reported the failure').toHaveCount(0);
      await expect(pageBody(page), 'the page body reported the failure').not.toContainText('Could not remove');
      await expect(row, 'the volume the daemon kept left the list').toBeVisible();
    } finally {
      await removeContainerQuietly(holder);
      await removeVolumeQuietly(volume);
    }
  });

  // Scenario: the same failure happens four times (…/REQ-6, /REQ-8)
  test('four repetitions of one failure raise four toasts, three on screen and the first gone', async ({ page }) => {
    test.setTimeout(90_000);
    // A name the daemon refuses outright: nothing is created, and the dialog stays open to be
    // submitted again, so the same failure repeats with one press each time.
    const refusedName = 'vexel e2e invalid name';

    await clickAt(page, volumesPanel(page).getByRole('button', { name: 'Create volume…' }), 'the volumes toolbar’s create control');
    const form = page.locator('.ui-modal').filter({ has: page.getByRole('textbox', { name: 'Volume name' }) });
    await form.getByRole('textbox', { name: 'Volume name' }).fill(refusedName);
    const submit = form.getByRole('button', { name: 'Create' });

    await clickAt(page, submit, 'the create dialog’s Create control');
    await expect(toasts(page)).toHaveCount(1, { timeout: 20_000 });
    await expect(toasts(page).first()).toContainText(/invalid characters|Error response from daemon/i);
    // Marked, because the four toasts carry the same words: this is what says which one left.
    await toasts(page).first().evaluate((toast) => toast.setAttribute('data-ordinal', 'first'));
    const first = page.locator('[data-ordinal="first"]');

    // A repetition of the same failure raises another toast rather than replacing the standing one.
    await clickAt(page, submit, 'the create dialog’s Create control');
    await expect(toasts(page)).toHaveCount(2);

    await clickAt(page, submit, 'the create dialog’s Create control');
    await expect(toasts(page)).toHaveCount(VISIBLE_TOAST_CAP);

    await clickAt(page, submit, 'the create dialog’s Create control');
    // Still three: the fourth was raised and the oldest left to make room. Fewer than three here
    // would mean the four presses took longer than the toasts' own timer, not that the cap held.
    await expect(toasts(page), 'the fourth failure did not leave three toasts on screen').toHaveCount(VISIBLE_TOAST_CAP);
    await expect(first, 'the oldest toast did not make room for the fourth').toHaveCount(0);
  });
});

// Scenario: an image pull fails while it runs (…/REQ-5, /REQ-7)
test('a pull the daemon refuses is told by a toast, and the dialog states none of it', async ({ page }) => {
  test.setTimeout(90_000);
  const reference = `${UNREACHABLE_REGISTRY}/vexel-e2e-pull-refused:v1`;
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();

  await clickAt(page, page.getByRole('button', { name: 'Pull image…' }), 'the images toolbar’s pull control');
  const dialogHeading = page.getByRole('heading', { name: 'Pull image' });
  const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Image reference' }).fill(reference);

  await clickAt(page, dialog.getByRole('button', { name: 'Pull', exact: true }), 'the pull dialog’s Pull control');

  const toast = toasts(page).first();
  await expect(toast, 'the refused pull was not reported as a toast').toBeVisible({ timeout: 30_000 });
  await expect(toast).toHaveClass(/ui-toast--tone-danger/);
  await expect(toast, 'the toast does not carry the address the daemon refused').toContainText(UNREACHABLE_REGISTRY);
  await expect(toast.getByRole('button'), 'the toast carries a control other than its dismissal').toHaveCount(1);

  // The dialog states no failure of its own and stays open, so the reference can be corrected.
  await expect(dialog.locator('.ui-error-banner'), 'the dialog stated the failure itself').toHaveCount(0);
  await expect(dialogHeading, 'the dialog closed on the failure').toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Pull', exact: true })).toBeVisible();
});

// Scenario: the daemon is unreachable and the page says nothing (…/REQ-13, /REQ-2)
test('the lost connection is told by the header alone, and raises no toast', async ({ page }) => {
  test.setTimeout(90_000);
  await refuseTheChannel(page);

  await openApp(page, 'containers');

  await expect(header(page).getByText('Server unreachable'), 'the header did not report the lost connection').toBeVisible({
    timeout: 30_000,
  });
  await expect(header(page).getByRole('button', { name: 'Retry' })).toBeVisible();

  // Long enough for a retry of the channel to have failed again, each failure a chance to raise one.
  await page.waitForTimeout(10_000);
  await expect(toasts(page), 'the lost connection raised a toast').toHaveCount(0);

  // The unreachable-daemon panel the Shell used to draw in the content area is gone
  // (…/REQ-13, app-shell/specs/shell.md). What a screen still draws for a listing it could not
  // load is another batch's subject (…/REQ-2, /REQ-3, closed in batch 2), so the body is neither
  // asserted empty nor asserted free of a retry of the screen's own.
  await expect(pageBody(page), 'the shell drew the unreachable panel in the page body').not.toContainText('Server unreachable');
});
