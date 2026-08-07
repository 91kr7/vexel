import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';

const execFileAsync = promisify(execFile);

// The tests that need an image to be missing locally share `hello-world`, a
// registry-facing resource, so this file runs serially rather than in
// Playwright's default fully-parallel mode.
test.describe.configure({ mode: 'serial' });

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-f', name]).catch(() => undefined);
}

async function removeHelloWorldImage(): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', 'hello-world:latest']).catch(() => undefined);
}

function containerRow(page: Page, name: string) {
  return page.locator('.ui-data-table__row', { hasText: name });
}

function imageField(page: Page) {
  return page.getByRole('combobox', { name: 'Image reference' });
}

function searchField(page: Page) {
  return page.getByPlaceholder('Search name, image or state…');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Containers/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// plan-docker_management_app/REQ-27 — a container is created from an image with its configuration and started immediately
test('running a container from the toolbar creates it with its configuration and starts it', async ({ page }) => {
  const name = `vexel-e2e-run-${Date.now()}`;
  try {
    await page.getByRole('button', { name: 'Run container…' }).click();
    await imageField(page).fill('postgres:16');
    await page.getByRole('textbox', { name: 'Container name' }).fill(name);
    await page.getByRole('textbox', { name: 'Entrypoint' }).fill('sleep');
    await page.getByRole('textbox', { name: 'Command' }).fill('300');
    await page.getByRole('button', { name: 'Add variable' }).click();
    await page.getByRole('textbox', { name: 'Key 1' }).first().fill('VEXEL_E2E');
    await page.getByRole('textbox', { name: 'Value 1' }).first().fill('on');
    await page.getByRole('button', { name: 'Add port mapping' }).click();
    await page.getByRole('textbox', { name: 'Container port 1' }).fill('5432');

    await page.getByRole('button', { name: 'Create and start' }).click();

    // The sheet closes on success and the new container shows up, running.
    await expect(imageField(page)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('.ui-toast-viewport')).toContainText(name, { timeout: 10_000 });
    await searchField(page).fill(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('running');
    await expect(row).toContainText('postgres:16');

    const { stdout } = await execFileAsync('docker', ['inspect', name, '--format', '{{.Config.Env}} {{.State.Running}}']);
    expect(stdout).toContain('VEXEL_E2E=on');
    expect(stdout).toContain('true');
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-27 — the same form creates the container without starting it
test('creating from an image without starting it leaves the container stopped in the list', async ({ page }) => {
  const name = `vexel-e2e-create-only-${Date.now()}`;
  try {
    await page.getByRole('button', { name: 'Create from image…' }).click();
    await imageField(page).fill('postgres:16');
    await page.getByRole('textbox', { name: 'Container name' }).fill(name);
    await page.getByRole('textbox', { name: 'Entrypoint' }).fill('sleep');
    await page.getByRole('textbox', { name: 'Command' }).fill('300');

    await page.getByRole('button', { name: 'Create only' }).click();

    await expect(imageField(page)).toHaveCount(0, { timeout: 30_000 });
    await searchField(page).fill(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('created');
    await expect(row.getByRole('button', { name: 'start' })).toBeVisible();
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-29 — a reference that is not present locally is pulled first, then the container is created
test('creating from a reference missing locally pulls the image first and then creates the container', async ({ page }) => {
  // A real registry pull runs before the creation: well beyond the default budget.
  test.setTimeout(120_000);
  const name = `vexel-e2e-pull-create-${Date.now()}`;
  try {
    await removeHelloWorldImage();

    await page.getByRole('button', { name: 'Create from image…' }).click();
    await imageField(page).fill('hello-world:latest');
    await page.getByRole('textbox', { name: 'Container name' }).fill(name);
    await page.getByRole('button', { name: 'Create only' }).click();

    await expect(imageField(page)).toHaveCount(0, { timeout: 60_000 });
    await searchField(page).fill(name);
    await expect(containerRow(page, name)).toBeVisible({ timeout: 15_000 });

    // The image the container was created from is now held locally: it was pulled.
    const { stdout } = await execFileAsync('docker', ['images', '-q', 'hello-world:latest']);
    expect(stdout.trim().length).toBeGreaterThan(0);
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-29, REQ-28 — the pull progress is shown, and a daemon refusal after it keeps the entered
// configuration in place with the daemon's own message
test('shows the pull progress and, on a daemon refusal, its own message with every entered value kept', async ({ page }) => {
  // A real registry pull runs before the refusal: well beyond the default budget.
  test.setTimeout(120_000);
  const takenName = `vexel-e2e-taken-${Date.now()}`;
  try {
    await execFileAsync('docker', ['create', '--name', takenName, '--entrypoint', 'sleep', 'postgres:16', '300']);
    await removeHelloWorldImage();

    await page.getByRole('button', { name: 'Run container…' }).click();
    await imageField(page).fill('hello-world:latest');
    await page.getByRole('textbox', { name: 'Container name' }).fill(takenName);
    await page.getByRole('textbox', { name: 'Command' }).fill('echo hello');
    await page.getByRole('button', { name: 'Create and start' }).click();

    // The image is missing locally, so it is pulled first, per layer.
    await expect(page.getByText('Pulling the image')).toBeVisible({ timeout: 30_000 });

    // The daemon then refuses the name, and says so in its own words.
    const banner = page.locator('.ui-error-banner');
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toContainText(takenName);
    await expect(banner).toContainText(/already in use/i);

    // Every entered value is still there, ready to be corrected.
    await expect(imageField(page)).toHaveValue('hello-world:latest');
    await expect(page.getByRole('textbox', { name: 'Container name' })).toHaveValue(takenName);
    await expect(page.getByRole('textbox', { name: 'Command' })).toHaveValue('echo hello');
    await expect(page.getByRole('button', { name: 'Create and start' })).toBeEnabled();
  } finally {
    await removeContainerQuietly(takenName);
  }
});

// plan-docker_management_app/REQ-28 — what the browser can check is checked before submitting: nothing is sent while it fails
test('refuses to submit an invalid container name, showing the reason on the field', async ({ page }) => {
  await page.getByRole('button', { name: 'Run container…' }).click();
  await imageField(page).fill('postgres:16');
  await page.getByRole('textbox', { name: 'Container name' }).fill('-not a valid name');

  await page.getByRole('button', { name: 'Create and start' }).click();

  await expect(page.getByText(/Use letters, digits/)).toBeVisible();
  // The sheet stays open, with the values in place and nothing created.
  await expect(imageField(page)).toHaveValue('postgres:16');
  await expect(page.locator('.ui-error-banner')).toHaveCount(0);
});

// plan-docker_management_app/REQ-28 — an image reference is required before anything is submitted
test('refuses to submit without an image reference', async ({ page }) => {
  await page.getByRole('button', { name: 'Run container…' }).click();

  await page.getByRole('button', { name: 'Create and start' }).click();

  await expect(page.getByText(/image reference is required/i)).toBeVisible();
  await expect(imageField(page)).toBeVisible();
});

// plan-docker_management_app/REQ-27 — cancelling the form creates nothing
test('cancelling the form creates no container', async ({ page }) => {
  const name = `vexel-e2e-cancel-${Date.now()}`;
  await page.getByRole('button', { name: 'Run container…' }).click();
  await imageField(page).fill('postgres:16');
  await page.getByRole('textbox', { name: 'Container name' }).fill(name);

  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(imageField(page)).toHaveCount(0);
  const { stdout } = await execFileAsync('docker', ['ps', '-a', '--filter', `name=${name}`, '--format', '{{.Names}}']);
  expect(stdout.trim()).toBe('');
});

// plan-docker_management_app/REQ-29 — an image can be run straight from its row on the images screen
test('running an image from its row opens the same form pre-filled with that reference', async ({ page }) => {
  const name = `vexel-e2e-image-run-${Date.now()}`;
  try {
    await page.getByRole('button', { name: /Images & layers/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
    await page.getByPlaceholder('Search reference or digest…').fill('postgres:16');
    const row = page.locator('.ui-data-table__row', { hasText: 'postgres:16' }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.getByRole('button', { name: 'run', exact: true }).click();

    await expect(imageField(page)).toHaveValue('postgres:16');

    // The pre-filled reference is what actually gets created.
    await page.getByRole('textbox', { name: 'Container name' }).fill(name);
    await page.getByRole('textbox', { name: 'Entrypoint' }).fill('sleep');
    await page.getByRole('textbox', { name: 'Command' }).fill('300');
    await page.getByRole('button', { name: 'Create and start' }).click();

    await expect(imageField(page)).toHaveCount(0, { timeout: 30_000 });
    const { stdout } = await execFileAsync('docker', ['inspect', name, '--format', '{{.Config.Image}}']);
    expect(stdout.trim()).toBe('postgres:16');
  } finally {
    await removeContainerQuietly(name);
  }
});
