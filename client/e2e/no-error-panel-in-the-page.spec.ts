/**
 * The batch's acceptance scenarios, driven through the browser: a screen that loaded no data says
 * so in one wording carrying no cause and no control, a read that fails on a working daemon is told
 * by a toast and by nothing in the page, and the retry is the header's
 * (plan-docker_management_app-inline_error_panels/REQ-1, /REQ-2, /REQ-3, /REQ-4).
 *
 * Nothing here touches the operator's daemon. The lost connection is severed in the browser — the
 * live channel is refused — and a read that fails on a working daemon is refused the same way, at
 * the one request the scenario is about, with the daemon answering every other one.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { refreshThroughTheControl } from './support/refresh-control.js';
import { REGISTRY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/** The one wording a screen shows in place of data its read could not load (…/REQ-3). */
const FAILED_READ_WORDING = 'This data could not be loaded';

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

/** The placeholders standing in the place of data a read could not load. */
function failedReadPlaceholders(page: Page): Locator {
  return page.locator('.ui-empty-state').filter({ hasText: FAILED_READ_WORDING });
}

/** The live channel, refused for the whole run of a test. */
async function refuseTheChannel(page: Page): Promise<void> {
  await page.route('**/api/live', (route) => route.abort());
}

// Scenario: a screen with no data says so, without an error panel (…/REQ-1, /REQ-2, /REQ-3, /REQ-13)
test('a screen with no data states it in one wording, with no cause, no control and no toast', async ({ page }) => {
  // 30s for the application to come up with the channel refused, then the 10s window below.
  test.setTimeout(90_000);
  await refuseTheChannel(page);

  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });

  const placeholder = failedReadPlaceholders(page).first();
  await expect(placeholder, 'the screen does not say its data could not be loaded').toBeVisible({ timeout: 20_000 });

  // No cause: the sentence is the whole of it, and the lost connection is named nowhere in the body.
  await expect(placeholder).toHaveText(FAILED_READ_WORDING);
  await expect(pageBody(page), 'the page body reported the lost connection').not.toContainText(/unreachable/i);
  await expect(pageBody(page).locator('.ui-error-banner'), 'a panel in the page reported the failure').toHaveCount(0);

  // No control: nothing to press inside the placeholder (…/REQ-4).
  await expect(placeholder.locator('button, a'), 'the placeholder carries a control').toHaveCount(0);

  // The header is the only place the lost connection is stated (…/REQ-2, /REQ-13).
  await expect(header(page).getByText(/unreachable/i), 'the header did not report the lost connection').toBeVisible({
    timeout: 20_000,
  });
  await expect(header(page).getByRole('button', { name: 'Retry' })).toBeVisible();

  // Long enough for a retry of the channel to have failed again, each failure a chance to raise one.
  await page.waitForTimeout(10_000);
  await expect(toasts(page), 'the lost connection raised a toast').toHaveCount(0);
});

// Scenario: a read that fails on a working daemon (…/REQ-1, /REQ-5)
test('a read that fails on a working daemon raises a toast, and the page shows no panel', async ({ page }) => {
  test.setTimeout(90_000);
  await ensureImage(REGISTRY_IMAGE);

  // The layer stack alone is refused: the build-cache association under it, and every other read of
  // the screen, still reach the daemon.
  await page.route(
    (url) => url.pathname.startsWith('/api/images/') && url.pathname.endsWith('/layers'),
    (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'the layer stack could not be read' }) }),
  );

  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 20_000 });

  const row = page.locator('.ui-data-table__row', { hasText: REGISTRY_IMAGE }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await chooseFromRowOverflowMenu(page, row, 'Explore layers…');

  const explorer = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Layer stack — ${REGISTRY_IMAGE}` }) });
  await expect(explorer).toBeVisible();

  const toast = toasts(page).first();
  await expect(toast, 'the failed read was not reported as a toast').toBeVisible({ timeout: 20_000 });
  await expect(toast, 'the failure was not reported in the failure tone').toHaveClass(/ui-toast--tone-danger/);
  await expect(toast).toContainText('the layer stack could not be read');

  // The page states none of it: no panel, no message, and the placeholder in the stack's place.
  await expect(page.locator('.ui-error-banner'), 'a panel in the page reported the failure').toHaveCount(0);
  await expect(explorer, 'the explorer stated the cause itself').not.toContainText('the layer stack could not be read');
  const placeholder = failedReadPlaceholders(page).first();
  await expect(placeholder, 'nothing stands in the layer stack’s place').toBeVisible();
  await expect(placeholder.locator('button, a'), 'the placeholder carries a control').toHaveCount(0);
});

// Scenario: retry without leaving the screen (…/REQ-4)
test('the header’s refresh reads the failed data again, without leaving the screen', async ({ page }) => {
  test.setTimeout(90_000);
  // Refused once, then allowed: the first reading fails, and the one the operator asks for succeeds.
  let refused = false;
  await page.route('**/api/system/disk-usage', async (route) => {
    if (refused) return route.continue();
    refused = true;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'the disk usage could not be read' }) });
  });

  await openApp(page, 'system-prune');
  await expect(page.getByRole('heading', { level: 1, name: 'System & prune' })).toBeVisible({ timeout: 20_000 });

  const placeholder = failedReadPlaceholders(page).first();
  await expect(placeholder, 'the screen does not say its data could not be loaded').toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.ui-error-banner'), 'a panel in the page reported the failure').toHaveCount(0);

  await refreshThroughTheControl(page);

  await expect(failedReadPlaceholders(page), 'the placeholder outlived the reading that succeeded').toHaveCount(0, {
    timeout: 20_000,
  });
  await expect(page.locator('.ui-storage-usage-row').first(), 'the screen did not show its data again').toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('heading', { level: 1, name: 'System & prune' }), 'the screen changed under the operator').toBeVisible();
});
