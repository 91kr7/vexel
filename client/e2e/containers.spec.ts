import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';

const execFileAsync = promisify(execFile);

// A tiny, already-cached image whose entrypoint is overridden to `sleep` so the
// container starts instantly and needs no network pull or app init.
async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...extraArgs, '--entrypoint', 'sleep', 'postgres:16', '300']);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-f', name]).catch(() => undefined);
}

function containerRow(page: Page, name: string) {
  return page.locator('.ui-data-table__row', { hasText: name });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Containers/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// plan-docker_management_app/REQ-19 — the containers screen lists a container with name, state, image and published ports
test('lists a running container with its name, state, image and published ports without a manual refresh', async ({ page }) => {
  const name = `vexel-e2e-list-${Date.now()}`;
  try {
    await createSleepingContainer(name, ['-p', '0:5432']);

    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('postgres:16');
    await expect(row).toContainText('running');
    await expect(row).toContainText('→5432');
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-20 — a non-destructive lifecycle action applies to the daemon and the row reflects the resulting state
test('stopping a running container updates its row to the stopped state and its available actions', async ({ page }) => {
  const name = `vexel-e2e-stop-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.getByRole('button', { name: 'stop' }).click();

    await expect(row).toContainText('exited', { timeout: 10_000 });
    await expect(row.getByRole('button', { name: 'start' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'stop' })).toHaveCount(0);
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-20, REQ-6 — a destructive lifecycle action asks for confirmation naming the container and performs nothing on cancel
test('killing a container asks for confirmation naming it, does nothing on cancel and applies on confirm', async ({ page }) => {
  const name = `vexel-e2e-kill-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.getByRole('button', { name: 'kill' }).click();
    await expect(page.getByRole('heading', { name: `Confirm: ${name}` })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(row).toContainText('running');

    await row.getByRole('button', { name: 'kill' }).click();
    await expect(page.getByRole('heading', { name: `Confirm: ${name}` })).toBeVisible();
    await page.getByRole('button', { name: 'kill' }).last().click();

    await expect(row).toContainText('exited', { timeout: 10_000 });
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-21 — a container can be renamed and the change is reflected in the list
test('renaming a container replaces the name cell and the new name is reflected in the list', async ({ page }) => {
  const name = `vexel-e2e-rename-${Date.now()}`;
  const newName = `${name}-renamed`;
  try {
    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.getByRole('button', { name: 'rename' }).click();
    // The name cell is replaced by the input while renaming, so it stops matching the
    // row locator's text filter; query the field by its accessible name at the page level.
    const field = page.getByRole('textbox', { name: `New name for ${name}` });
    await expect(field).toHaveValue(name);
    await field.fill(newName);
    await field.press('Enter');

    await expect(containerRow(page, newName)).toBeVisible({ timeout: 10_000 });
  } finally {
    await removeContainerQuietly(newName);
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-22 — stopped containers are pruned in one bulk action, reporting the removed count and reclaimed space
test('pruning stopped containers removes them from the list and reports the outcome', async ({ page }) => {
  const name = `vexel-e2e-prune-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'stop' }).click();
    await expect(row).toContainText('exited', { timeout: 10_000 });

    const pruneButton = page.getByRole('button', { name: 'Prune stopped' });
    await expect(pruneButton).toBeEnabled();
    await pruneButton.click();
    await expect(page.getByRole('heading', { name: /^Confirm:/ })).toBeVisible();
    const confirmButtons = page.getByRole('button', { name: 'Prune stopped' });
    await confirmButtons.last().click();

    await expect(containerRow(page, name)).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText(/removed/i)).toBeVisible();
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-23 — the container list can be text-searched by name
test('searching narrows the list to containers whose name matches the search text', async ({ page }) => {
  const name = `vexel-e2e-search-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder('Search name, image or state…').fill(name);

    await expect(containerRow(page, name)).toBeVisible();
    const otherRows = page.locator('.ui-data-table__row').filter({ hasNotText: name });
    await expect(otherRows).toHaveCount(0);
  } finally {
    await removeContainerQuietly(name);
  }
});

function openDetail(page: Page, name: string) {
  return containerRow(page, name).getByText(name, { exact: true }).click();
}

// These tests keep a container's detail panel open across several UI steps
// (tab switch, edit, save). DataTable virtualisation does not reserve extra
// space for an expanded row (ui-library/specs/data-table.md), so another
// worker's containers appearing mid-interaction can push the row out of the
// mounted window and reset the panel; serial mode keeps that window stable.
test.describe('Container detail panel (REQ-24, REQ-25, REQ-26)', () => {
  test.describe.configure({ mode: 'serial' });

  // plan-docker_management_app/REQ-24 — selecting a container opens a detail view with its inspect data organised in tabs
  test('selecting a container row opens its detail panel with Config and Inspect tabs', async ({ page }) => {
    const name = `vexel-e2e-detail-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const row = containerRow(page, name);
      await expect(row).toBeVisible({ timeout: 15_000 });

      await openDetail(page, name);

      const detail = page.locator('.ui-data-table__expanded');
      await expect(detail).toBeVisible();
      await expect(detail.getByRole('tab', { name: 'Config' })).toBeVisible();
      await expect(detail.getByRole('tab', { name: 'Inspect' })).toBeVisible();
      await expect(detail.getByRole('button', { name: 'Edit configuration' })).toBeVisible();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-26 — the raw inspect payload is viewable and copyable as-is
  test('the Inspect tab shows the raw payload and its copy affordance confirms the copy', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const name = `vexel-e2e-inspect-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const row = containerRow(page, name);
      await expect(row).toBeVisible({ timeout: 15_000 });
      await openDetail(page, name);

      const detail = page.locator('.ui-data-table__expanded');
      await detail.getByRole('tab', { name: 'Inspect' }).click();
      await expect(detail.getByText(/"Image":\s*"postgres:16"/)).toBeVisible();

      await detail.getByRole('button', { name: 'Copy' }).last().click();
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('"postgres:16"');
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-25 — restart policy and/or resource limits alone are applied in place, no warning
  test('editing only the restart policy saves in place without asking for confirmation', async ({ page }) => {
    const name = `vexel-e2e-config-inplace-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const row = containerRow(page, name);
      await expect(row).toBeVisible({ timeout: 15_000 });
      await openDetail(page, name);

      const detail = page.locator('.ui-data-table__expanded');
      await detail.getByRole('button', { name: 'Edit configuration' }).click();
      await detail.getByRole('combobox', { name: 'Restart policy' }).selectOption('always');
      await detail.getByRole('button', { name: 'Save changes' }).click();

      await expect(page.getByRole('heading', { name: /^Confirm:/ })).toHaveCount(0);
      await expect(page.locator('.ui-toast-viewport')).toContainText('Configuration updated', { timeout: 10_000 });
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-25 — an environment, port, mount or health-check change asks for confirmation before a
  // recreate; declining leaves the container and its configuration unchanged
  test('editing an environment variable asks for confirmation before recreating, and cancelling leaves it unchanged', async ({ page }) => {
    const name = `vexel-e2e-config-decline-${Date.now()}`;
    try {
      await createSleepingContainer(name, ['-e', 'FOO=bar']);
      const row = containerRow(page, name);
      await expect(row).toBeVisible({ timeout: 15_000 });
      await openDetail(page, name);

      const detail = page.locator('.ui-data-table__expanded');
      await detail.getByRole('button', { name: 'Edit configuration' }).click();
      await detail.getByRole('textbox', { name: 'Value 1' }).fill('baz');
      await detail.getByRole('button', { name: 'Save changes' }).click();

      const dialogHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
      await expect(dialogHeading).toBeVisible();
      const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
      await dialog.getByRole('button', { name: 'Cancel' }).click();

      await expect(dialogHeading).toHaveCount(0);
      await expect(containerRow(page, name)).toBeVisible();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-25 — confirming a Docker-required recreate replaces the container, preserving its name,
  // and the outcome is reported
  test('confirming a recreate replaces the container while preserving its name and reports the outcome', async ({ page }) => {
    const name = `vexel-e2e-config-recreate-${Date.now()}`;
    try {
      await createSleepingContainer(name, ['-e', 'FOO=bar']);
      const row = containerRow(page, name);
      await expect(row).toBeVisible({ timeout: 15_000 });
      await openDetail(page, name);

      const detail = page.locator('.ui-data-table__expanded');
      await detail.getByRole('button', { name: 'Edit configuration' }).click();
      await detail.getByRole('textbox', { name: 'Value 1' }).fill('baz');
      await detail.getByRole('button', { name: 'Save changes' }).click();

      const dialogHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
      await expect(dialogHeading).toBeVisible();
      const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
      await dialog.getByRole('button', { name: 'Recreate container' }).click();

      await expect(page.locator('.ui-toast-viewport')).toContainText('Container recreated', { timeout: 15_000 });
      await expect(containerRow(page, name)).toBeVisible({ timeout: 15_000 });
    } finally {
      await removeContainerQuietly(name);
    }
  });
});
