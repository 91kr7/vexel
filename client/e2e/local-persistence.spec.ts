import { expect, test } from '@playwright/test';
import { openApp } from './support/fixtures.js';

// The first test of this file deliberately persists a screen; every test starts
// from the default one anyway, so neither inherits the other's leftover.
test.beforeEach(async ({ page }) => {
  await openApp(page);
});

// plan-docker_management_app/REQ-115 — the last active screen survives a reload
test('the last active screen survives a page reload', async ({ page }) => {
  await page.getByRole('button', { name: /Containers/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();

  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// app-shell/specs/shell.md — the shell exposes the analysis-cache size with a Clear action, which
// empties the cache and is disabled once there is nothing left to clear
test('the Local storage card shows the analysis-cache size and clearing it disables the Clear action', async ({ page }) => {
  await expect(page.getByText('Local storage')).toBeVisible();
  await expect(page.getByText('Analysis cache')).toBeVisible();

  const clearButton = page.getByRole('button', { name: 'Clear' });
  await expect(clearButton).toBeVisible();

  // The empty state is established here rather than assumed: any spec that
  // analysed an image earlier in the run leaves entries in this same cache.
  if (await clearButton.isEnabled()) {
    await clearButton.click();
  }

  await expect(clearButton).toBeDisabled();
});
