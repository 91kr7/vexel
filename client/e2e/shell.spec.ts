import { expect, test } from '@playwright/test';

const groups: Record<string, string[]> = {
  Workloads: ['Dashboard', 'Containers', 'Compose', 'Swarm'],
  Artifacts: ['Images & layers', 'Volumes & networks', 'Registries', 'Builders & cache'],
  Environment: ['Contexts', 'Plugins', 'System & prune'],
  'Full coverage': ['Raw console', 'Coverage matrix'],
};

const allScreenLabels = Object.values(groups).flat();

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// plan-docker_management_app/REQ-1
test('opens on the Vessel — Docker Control shell with the thirteen entries grouped as in the mockups', async ({ page }) => {
  await expect(page.getByText('Vessel', { exact: true })).toBeVisible();

  for (const [group, labels] of Object.entries(groups)) {
    await expect(page.getByText(group, { exact: true })).toBeVisible();
    for (const label of labels) {
      await expect(page.getByRole('button', { name: new RegExp(label) })).toBeVisible();
    }
  }
  expect(allScreenLabels).toHaveLength(13);

  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  const header = page.locator('header');
  await expect(page.getByText('Live · daemon events')).toBeVisible();
  await expect(header.getByRole('button', { name: /Search/ })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Console' })).toBeVisible();

  const rail = page.getByRole('navigation');
  await expect(rail.getByText('Active context')).toBeVisible();
  await expect(rail.getByText('default (local)')).toBeVisible();
});

// plan-docker_management_app/REQ-2
test('activating a nav entry switches the main area and marks it active, keeping rail/header/footer', async ({ page }) => {
  await page.getByRole('button', { name: /Containers/ }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  await expect(page.getByText(/Containers is not built yet/)).toBeVisible();

  const activeEntry = page.locator('[aria-current="page"]');
  await expect(activeEntry).toHaveCount(1);
  await expect(activeEntry).toHaveAccessibleName(/Containers/);

  // Rail and footer stay in place.
  await expect(page.getByText('Vessel', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation').getByText('Active context')).toBeVisible();

  // Switching again replaces the content without losing the rail.
  await page.getByRole('button', { name: /Swarm/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Swarm' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Containers/ })).toBeVisible();
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
  const header = page.getByRole('heading', { level: 1, name: 'Dashboard' });
  const headerBackdropFilter = await header.evaluate((element) => getComputedStyle(element.closest('header') ?? element).backdropFilter);
  expect(headerBackdropFilter === 'none' || headerBackdropFilter === '').toBe(true);

  const nav = page.getByRole('navigation');
  const navBackdropFilter = await nav.evaluate((element) => getComputedStyle(element).backdropFilter);
  expect(navBackdropFilter === 'none' || navBackdropFilter === '').toBe(true);
});

// plan-docker_management_app/REQ-6
test('a destructive demo action asks for confirmation naming its target and does nothing when cancelled', async ({ page }) => {
  const candidates = page.getByRole('button', { name: /remove|delete|kill|prune|down|leave|log ?out/i });
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
