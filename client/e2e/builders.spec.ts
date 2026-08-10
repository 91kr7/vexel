import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, localBuilderDriverArgs, mirroredImage } from '../../server/test/support/base-images.js';

const RUN_ID = `${process.pid}-${Date.now()}`;

function fixtureName(caseName: string): string {
  return `vexel-e2e-builder-${caseName}-${RUN_ID}`;
}

async function createBuilderQuietly(name: string): Promise<void> {
  // Booted from the run's own registry, on the host network: buildx contacts a
  // registry on every bootstrap, whatever the daemon already holds.
  await execFileAsync('docker', ['buildx', 'create', '--name', name, '--driver', 'docker-container', ...(await localBuilderDriverArgs())]);
}

async function removeBuilderQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['buildx', 'rm', name]).catch(() => undefined);
}

/** The builder `docker buildx build` currently defaults to, so a test that switches it can restore it: the active builder is global daemon state, not a fixture of any one test. */
async function currentActiveBuilder(): Promise<string | undefined> {
  const { stdout } = await execFileAsync('docker', ['buildx', 'ls', '--format', 'json']);
  const lines = stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  for (const line of lines) {
    const parsed = JSON.parse(line) as { Name: string; Current: boolean };
    if (parsed.Current) return parsed.Name;
  }
  return undefined;
}

async function useBuilderQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['buildx', 'use', name]).catch(() => undefined);
}

function builderRow(page: Page, name: string) {
  return page.locator('.ui-card-list > .ui-surface', { has: page.locator('.ui-card-list__item', { hasText: name }) });
}

/** Scopes assertions to the screen's own content, excluding the nav rail — whose "Builders & cache" label itself contains the substring "Build". */
function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

// The last active screen survives by design (REQ-115), so the screen this suite
// needs is pinned rather than inherited from whichever spec ran before.
test.beforeEach(async ({ page }) => {
  await openApp(page, 'builders-cache');
  await expect(page.getByRole('heading', { level: 1, name: 'Builders & cache' })).toBeVisible();
});

// plan-docker_management_app/REQ-89, plan-docker_management_app/REQ-88 — a builder can be created
// with a name, driver and platforms, and is listed with those fields
test('creating a builder through the form lists it with its driver and platform', async ({ page }) => {
  const name = fixtureName('create');
  try {
    await page.getByRole('button', { name: 'Create builder' }).click();
    const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Create builder' }) });
    await dialog.getByLabel('Builder name').fill(name);
    // Driver defaults to docker-container already, matching the fixture's own creation elsewhere in this suite.
    await dialog.getByLabel('Platforms').fill('linux/amd64');
    await dialog.getByLabel('Platforms').press('Enter');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    const row = builderRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('docker-container');
    await expect(row).toContainText('linux/amd64');
  } finally {
    await removeBuilderQuietly(name);
  }
});

// plan-docker_management_app/REQ-89 — a builder can be removed, with confirmation
test('removing a builder asks for confirmation and then removes it from the list', async ({ page }) => {
  const name = fixtureName('remove');
  await createBuilderQuietly(name);
  try {
    await page.reload();
    const row = builderRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.getByRole('button', { name: 'Remove' }).click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmDialog).toBeHidden();
    // Cancelling performs nothing: the builder stays listed.
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Remove' }).click();
    await expect(confirmHeading).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Remove' }).click();
    await expect(row).toBeHidden({ timeout: 15_000 });
  } finally {
    await removeBuilderQuietly(name);
  }
});

// plan-docker_management_app/REQ-88 — another builder can be selected as the active one, marked
// with an "in use" badge, the others offering a "use" action
test('selecting a builder through its "use" badge marks it as the active one', async ({ page }) => {
  const name = fixtureName('use');
  await createBuilderQuietly(name);
  const originalActive = await currentActiveBuilder();
  try {
    await page.reload();
    const row = builderRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByRole('button', { name: 'use' })).toBeVisible();

    await row.getByRole('button', { name: 'use' }).click();

    await expect(row.getByText('in use', { exact: true })).toBeVisible({ timeout: 15_000 });
  } finally {
    if (originalActive) await useBuilderQuietly(originalActive);
    await removeBuilderQuietly(name);
  }
});

// batch-builders-build-cache.md — "This screen observes builders and their cache; it does not run
// builds" (REQ-90 withdrawn) and "nor does it export or import the cache" (withdrawn half of REQ-91)
test('offers no build-launch affordance and no cache export/import affordance', async ({ page }) => {
  const content = screenContent(page);
  await expect(content.getByRole('heading', { level: 2, name: 'buildx builders' })).toBeVisible();
  await expect(content.getByRole('heading', { level: 2, name: 'Build cache' })).toBeVisible();

  await expect(content.getByRole('button', { name: 'Build', exact: true })).toHaveCount(0);
  await expect(content.getByRole('button', { name: /launch build/i })).toHaveCount(0);
  await expect(content.getByRole('button', { name: /export/i })).toHaveCount(0);
  await expect(content.getByRole('button', { name: /import/i })).toHaveCount(0);
});

// plan-docker_management_app/REQ-91 — the build cache is listed record by record with its type,
// size and usage state
test('lists a build-cache record with its type, size and usage state', async ({ page }) => {
  const name = fixtureName('cache-list');
  await createBuilderQuietly(name);
  const dir = await mkdtemp(join(tmpdir(), 'vexel-e2e-builder-'));
  const originalActive = await currentActiveBuilder();
  try {
    // BuildKit inside a container has an image store of its own and resolves
    // every `FROM` against a registry: the run's own, never Docker Hub.
    await writeFile(join(dir, 'Dockerfile'), `FROM ${await mirroredImage(ALPINE_IMAGE)}\nRUN echo vexel-e2e-cache-marker > /tmp/marker\n`, 'utf8');
    await execFileAsync('docker', ['buildx', 'build', '--builder', name, dir]);

    await openApp(page, 'builders-cache');
    const row = builderRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: 'use' }).click();
    await expect(row.getByText('in use', { exact: true })).toBeVisible({ timeout: 15_000 });

    // plan-docker_management_app/REQ-88 — now that this builder is running and has built
    // something, its row carries its status and its own cache size.
    await expect(row).toContainText('running', { timeout: 15_000 });
    await expect(row).toContainText(/\d+(\.\d+)?\s*(B|kB|KB|KiB|MB|MiB|GB|GiB)/, { timeout: 15_000 });

    const cacheCard = screenContent(page).locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Build cache' }) });
    const cacheRows = cacheCard.locator('.ui-card-list__item');
    await expect.poll(() => cacheRows.count(), { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(cacheRows.first()).toHaveText(/shared|in use|reclaimable/);
    // REQ-91 — each record carries its own size and type alongside that usage state.
    await expect(cacheRows.first()).toHaveText(/\d+(\.\d+)?\s*(B|kB|KB|KiB|MB|MiB|GB|GiB)/);
  } finally {
    if (originalActive) await useBuilderQuietly(originalActive);
    await removeBuilderQuietly(name);
    await rm(dir, { recursive: true, force: true });
  }
});
