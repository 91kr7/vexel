import { expect, test, type Page } from './support/test.js';
import { activeContextLabel, navEntry, openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/**
 * Opens the shell on a stated screen: the shell restores the persisted screen on
 * load (REQ-115, app-shell/specs/shell.md), so a test that depends on which
 * screen is showing states it instead of inheriting whatever a previous test
 * left behind. `openApp` owns the pin-and-load sequence, including the retry
 * that the single per-operator preference record makes necessary.
 */
async function openOnScreen(page: Page, screenId: string, screenLabel: string): Promise<void> {
  await openApp(page, screenId);
  await expect(page.getByRole('heading', { level: 1, name: screenLabel })).toBeVisible();
}

const groups: Record<string, string[]> = {
  Workloads: ['Dashboard', 'Containers', 'Compose'],
  Artifacts: ['Images & layers', 'Volumes & networks', 'Registries', 'Builders & cache'],
  Environment: ['Contexts', 'Plugins', 'System & prune'],
  'Full coverage': ['Raw console', 'About'],
};

const allScreenLabels = Object.values(groups).flat();

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the shell reopens on the last active screen by design
  // (REQ-115), so the file states its own starting point. The tests that are
  // deliberately screen-agnostic (the backdrop and blur ones) are unaffected by
  // which screen that is; the ones that are not pin their own.
  await openApp(page, 'dashboard');
});

// plan-docker_management_app/REQ-1, plan-docker_management_app/REQ-115
test('opens on the Vexel — Docker Control shell with the twelve entries grouped as in the mockups', async ({ page }) => {
  // The shell opens on the persisted screen, not on a fixed one (REQ-115).
  await openOnScreen(page, 'dashboard', 'Dashboard');

  await expect(page.getByText('Vexel', { exact: true })).toBeVisible();

  for (const [group, labels] of Object.entries(groups)) {
    await expect(page.getByText(group, { exact: true })).toBeVisible();
    for (const label of labels) {
      await expect(navEntry(page, label)).toBeVisible();
    }
    // The entries keep their place inside their group, in the order the navigation
    // data declares — the screen the application dedicates to itself being the last
    // of "Full coverage" (plan-docker_management_app-about_license_notice/REQ-1).
    const railGroup = page.locator(`div:has(> .ui-nav-group__label:text-is("${group}")) .ui-nav-group__items`);
    await expect(railGroup.locator('.ui-nav-item__label')).toHaveText(labels);
  }
  expect(allScreenLabels).toHaveLength(12);

  // The restored screen is the persisted one, and it is the one the rail marks active.
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.locator('[aria-current="page"]')).toHaveAccessibleName(/Dashboard/);
  await expect(page.getByText('Live · daemon events')).toBeVisible();

  // The footer names the context Docker itself reports as active, as `name (kind)`
  // (REQ-93, app-shell/specs/shell.md) — whichever context that is on this machine.
  const rail = page.getByRole('navigation');
  const footer = rail.locator('.ui-footer-status');
  await expect(footer.getByText('Active context')).toBeVisible();
  await expect(footer.locator('.ui-footer-status__value')).toHaveText(await activeContextLabel(), { timeout: 20_000 });
});

// plan-docker_management_app/REQ-2
test('activating a nav entry switches the main area and marks it active, keeping rail/header/footer', async ({ page }) => {
  await navEntry(page, 'Containers').click();

  // app-shell/specs/shell.md: the containers entry now shows the real
  // ContainersScreen — its own toolbar — not a placeholder.
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run container…' })).toBeVisible();
  await expect(page.getByText(/is not built yet/)).toHaveCount(0);

  const activeEntry = page.locator('[aria-current="page"]');
  await expect(activeEntry).toHaveCount(1);
  await expect(activeEntry).toHaveAccessibleName(/Containers/);

  // Rail and footer stay in place.
  await expect(page.getByText('Vexel', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation').getByText('Active context')).toBeVisible();

  // Switching again replaces the content without losing the rail. Since batch 30
  // every screen of the navigation data has content of its own (shell.md), so no
  // entry shows a placeholder any more — the last one to do so, the screen now
  // labelled "About", is checked here in its built form.
  await navEntry(page, 'About').click();
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Docker capability coverage' })).toBeVisible();
  await expect(page.getByText(/is not built yet/)).toHaveCount(0);
  await expect(navEntry(page, 'Containers')).toBeVisible();
});

// plan-docker_management_app/REQ-3, plan-docker_management_app/REQ-107
test('the backdrop is a single static image with nothing animated', async ({ page }) => {
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);

  const backdropImage = page.locator('img[alt=""]').first();
  await expect(backdropImage).toBeVisible();

  const animationName = await backdropImage.evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe('none');

  const parentAnimation = await backdropImage.evaluate((element) => getComputedStyle(element.parentElement as Element).animationName);
  expect(parentAnimation).toBe('none');
});

// plan-docker_management_app/REQ-108
test('no runtime blur is computed on the shell surfaces', async ({ page }) => {
  // The shell chrome is the subject here, whichever screen the preferences restore.
  const header = page.locator('header');
  const headerBackdropFilter = await header.evaluate((element) => getComputedStyle(element).backdropFilter);
  expect(headerBackdropFilter === 'none' || headerBackdropFilter === '').toBe(true);

  const nav = page.getByRole('navigation');
  const navBackdropFilter = await nav.evaluate((element) => getComputedStyle(element).backdropFilter);
  expect(navBackdropFilter === 'none' || navBackdropFilter === '').toBe(true);
});

// plan-docker_management_app/REQ-6
test('a destructive action asks for confirmation naming its target and does nothing when cancelled', async ({ page }) => {
  // The destructive-confirmation demo used to live on the last placeholder
  // screen, which batch 30 replaced with the coverage matrix. The flow is now
  // exercised on a real destructive action of the product: the per-category
  // prune of System & prune, which is always on the screen and which cancelling
  // provably performs nothing. Nothing is ever confirmed here — the prunes act
  // on the whole host, and confirming one is `system-prune-confirmed.spec.ts`.
  //
  // The category acted on is one this test made non-empty itself, so the
  // control is enabled whatever the operator's daemon holds; the fixture is
  // removed in the `finally`, whether the assertions passed or not.
  const name = `vexel-e2e-shell-req6-${process.pid}-${Date.now()}`;
  await execFileAsync('docker', ['create', '--name', name, ...ownershipArgs('shell-req6'), '--entrypoint', 'sleep', 'alpine:3.20', '300']);
  const pruneRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/system/prune')) pruneRequests.push(request.url());
  });
  try {
    await openOnScreen(page, 'system-prune', 'System & prune');

    const row = page.locator('.ui-storage-usage-row').filter({ hasText: 'Stopped containers' });
    await expect(row.getByRole('button', { name: 'Prune' })).toBeEnabled({ timeout: 30_000 });
    await row.getByRole('button', { name: 'Prune' }).click();

    const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: /^Confirm:/ }) });
    await expect(
      dialog.getByRole('heading', { name: /^Confirm:/ }),
      'The destructive action did not open a confirmation dialog naming its target (REQ-6).',
    ).toBeVisible({ timeout: 3000 });
    await expect(dialog).toContainText('Stopped containers');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    // "cancelling performs nothing": no prune was asked for, and the container is still there.
    expect(pruneRequests).toEqual([]);
    const { stdout } = await execFileAsync('docker', ['ps', '-aq', '--filter', `name=^${name}$`]);
    expect(stdout.trim().length).toBeGreaterThan(0);
  } finally {
    await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
  }
});
