import { expect, test, type Page } from '@playwright/test';
import { activeContextLabel } from './support/fixtures.js';

/**
 * Pins the persisted `lastScreenId` and reloads: the shell restores the
 * persisted screen on load (REQ-115, app-shell/specs/shell.md), so a test that
 * depends on which screen is showing states it instead of inheriting whatever
 * a previous run left behind. The preference is a single per-operator record
 * on the server, which any other test navigating the rail also writes, so the
 * pin-and-load pair is retried as a whole rather than assumed to win the race.
 */
async function openOnScreen(page: Page, screenId: string, screenLabel: string): Promise<void> {
  await expect(async () => {
    await page.request.put('/api/persistence/preferences', { data: { lastScreenId: screenId } });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: screenLabel })).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

const groups: Record<string, string[]> = {
  Workloads: ['Dashboard', 'Containers', 'Compose', 'Swarm'],
  Artifacts: ['Images & layers', 'Volumes & networks', 'Registries', 'Builders & cache'],
  Environment: ['Contexts', 'Plugins', 'System & prune'],
  'Full coverage': ['Raw console', 'Coverage matrix'],
};

const allScreenLabels = Object.values(groups).flat();

/**
 * A screen's own entry in the navigation rail.
 *
 * Scoped to the rail on purpose: the landing screen is the Dashboard, whose
 * cross-navigation tiles name the same screens ("Running containers — open the
 * Containers screen"), so an unscoped locator matches several controls.
 */
function navEntry(page: Page, label: string) {
  return page.getByRole('navigation').getByRole('button', { name: new RegExp(label) });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// plan-docker_management_app/REQ-1, plan-docker_management_app/REQ-115
test('opens on the Vexel — Docker Control shell with the thirteen entries grouped as in the mockups', async ({ page }) => {
  // The shell opens on the persisted screen, not on a fixed one (REQ-115).
  await openOnScreen(page, 'dashboard', 'Dashboard');

  await expect(page.getByText('Vexel', { exact: true })).toBeVisible();

  for (const [group, labels] of Object.entries(groups)) {
    await expect(page.getByText(group, { exact: true })).toBeVisible();
    for (const label of labels) {
      await expect(navEntry(page, label)).toBeVisible();
    }
  }
  expect(allScreenLabels).toHaveLength(13);

  // The restored screen is the persisted one, and it is the one the rail marks active.
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.locator('[aria-current="page"]')).toHaveAccessibleName(/Dashboard/);
  const header = page.locator('header');
  await expect(page.getByText('Live · daemon events')).toBeVisible();
  await expect(header.getByRole('button', { name: /Search/ })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Console' })).toBeVisible();

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

  // Switching again replaces the content without losing the rail; a screen with
  // no feature batch yet still shows its placeholder (shell.md, placeholder-screen.md).
  // Swarm was that screen until batch 27 built it, hence Plugins.
  await navEntry(page, 'Plugins').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible();
  await expect(page.getByText(/Plugins is not built yet/)).toBeVisible();
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
test('a destructive demo action asks for confirmation naming its target and does nothing when cancelled', async ({ page }) => {
  // The destructive-confirmation demo lives on a screen with no feature batch
  // yet (placeholder-screen.md), so the screen is stated rather than inherited.
  // The Dashboard has been a real screen since batch 25 and carries no demo;
  // Plugins is still a placeholder, and Swarm stopped being one in batch 27.
  await openOnScreen(page, 'plugins', 'Plugins');

  // Scoped to the screen's own content: the rail names a "System & prune"
  // entry, which reads like a destructive control to an unscoped locator and is
  // merely a navigation entry.
  const candidates = page
    .locator('.ui-frame__content')
    .getByRole('button', { name: /remove|delete|kill|prune|down|leave|log ?out/i });
  const candidateCount = await candidates.count();
  expect(
    candidateCount,
    'No control on the shell looks like a destructive action to exercise REQ-6 end-to-end.',
  ).toBeGreaterThan(0);

  await candidates.first().click();

  await expect(
    page.getByRole('heading', { name: /^Confirm:/ }),
    'Activating the destructive-looking control did not open a confirmation dialog naming its target (REQ-6).',
  ).toBeVisible({ timeout: 3000 });
});
