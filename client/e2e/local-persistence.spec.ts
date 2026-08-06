import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// plan-docker_management_app/REQ-115 — the last active screen survives a reload
test('the last active screen survives a page reload', async ({ page }) => {
  await page.getByRole('button', { name: /Containers/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();

  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// app-shell/specs/shell.md — the shell exposes the analysis-cache size with a Clear action, disabled while the cache is empty
test('the Local storage card shows the analysis-cache size and disables Clear while the cache is empty', async ({ page }) => {
  await expect(page.getByText('Local storage')).toBeVisible();
  await expect(page.getByText('Analysis cache')).toBeVisible();

  const clearButton = page.getByRole('button', { name: 'Clear' });
  await expect(clearButton).toBeVisible();
  await expect(clearButton).toBeDisabled();
});
