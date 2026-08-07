import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';

const execFileAsync = promisify(execFile);

// Every test in this file exercises the daemon's real pull/tag/push/remove
// operations one at a time (a shared registry-facing resource), so they run
// serially rather than in Playwright's default fully-parallel mode.
test.describe.configure({ mode: 'serial' });

async function tagFromPostgres(tag: string): Promise<void> {
  await execFileAsync('docker', ['tag', 'postgres:16', tag]);
}

async function removeTagQuietly(tag: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
}

/** A standalone single-tag image (its own id, unrelated to any other locally tagged image). */
async function createStandaloneImage(tag: string, containerName: string): Promise<void> {
  await execFileAsync('docker', ['create', '--name', containerName, 'hello-world']);
  await execFileAsync('docker', ['commit', containerName, tag]);
}

async function removeStandaloneImage(tag: string, containerName: string): Promise<void> {
  await removeTagQuietly(tag);
  await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => undefined);
}

// CardList renders each item as its own glass card (a Surface direct child of .ui-card-list), with
// the clickable header row and any expanded content as siblings inside it
// (ui-library/specs/card-list.md) — so a card's action buttons and detail panel are found by scoping
// to that per-row Surface, not to the header row alone (and not to the list's own outer Surface).
function imageRow(page: Page, text: string) {
  return page.locator('.ui-card-list > .ui-surface').filter({ hasText: text });
}

function rowHeader(row: ReturnType<typeof imageRow>) {
  return row.locator('.ui-card-list__item');
}

// A disposable, unauthenticated local registry: lets the push test below exercise a real registry
// round trip without depending on any external/authenticated registry.
const PUSH_REGISTRY_PORT = 5082;
let pushRegistryContainerId = '';

test.beforeAll(async () => {
  const { stdout } = await execFileAsync('docker', ['run', '-d', '-p', `${PUSH_REGISTRY_PORT}:5000`, 'registry:2']);
  pushRegistryContainerId = stdout.trim();
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      const response = await fetch(`http://localhost:${PUSH_REGISTRY_PORT}/v2/`);
      if (response.ok) return;
    } catch {
      // registry not ready yet
    }
    if (Date.now() > deadline) throw new Error('local test registry did not become ready in time');
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
});

test.afterAll(async () => {
  await execFileAsync('docker', ['rm', '-f', pushRegistryContainerId]).catch(() => undefined);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Images & layers/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-docker_management_app/REQ-37 — the images screen lists local images with repository:tag, size and creation age
test('lists a local image with its tag, size and creation age', async ({ page }) => {
  const tag = `vessel-e2e-list-${Date.now()}:v1`;
  try {
    await tagFromPostgres(tag);

    await page.getByPlaceholder('Search reference or digest…').fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(/ago/);
    await expect(row).toContainText(/B$|KB$|MB$|GB$/);
  } finally {
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-41 — the image list can be text-searched by reference
test('searching narrows the list to images whose reference matches the search text', async ({ page }) => {
  const tag = `vessel-e2e-search-${Date.now()}:v1`;
  try {
    await tagFromPostgres(tag);

    await page.getByPlaceholder('Search reference or digest…').fill(tag);

    await expect(imageRow(page, tag)).toBeVisible({ timeout: 10_000 });
    const otherRows = page.locator('.ui-card-list__item').filter({ hasNotText: tag });
    await expect(otherRows).toHaveCount(0);
  } finally {
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-41 — the search also matches by digest
test('searching by digest also narrows the list to the matching image', async ({ page }) => {
  const { stdout } = await execFileAsync('docker', ['inspect', 'postgres:16', '--format', '{{index .RepoDigests 0}}']);
  const fullDigest = stdout.trim().split('@')[1]!; // e.g. sha256:f8e2cc2a36dd...
  const shortDigest = fullDigest.slice(0, 19); // "sha256:" (7) + 12 hex chars

  await page.getByPlaceholder('Search reference or digest…').fill(shortDigest);

  await expect(imageRow(page, 'postgres')).toBeVisible({ timeout: 10_000 });
});

// plan-docker_management_app/REQ-39 — an image can be tagged with a new reference, reflected in the list
test('tagging an image adds the new reference and confirms with a success toast', async ({ page }) => {
  const containerName = `vessel-e2e-tagsrc-${Date.now()}`;
  const sourceTag = `vessel-e2e-tagsrc-${Date.now()}:v1`;
  const newTag = `vessel-e2e-tagged-${Date.now()}:v1`;
  try {
    await createStandaloneImage(sourceTag, containerName);
    await page.reload();
    await page.getByPlaceholder('Search reference or digest…').fill(sourceTag);
    const row = imageRow(page, sourceTag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await rowHeader(row).click();
    await row.getByRole('button', { name: 'tag', exact: true }).click();
    const dialogHeading = page.getByRole('heading', { name: `Tag ${sourceTag}` });
    const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
    await dialog.getByRole('textbox', { name: 'New reference' }).fill(newTag);
    await dialog.getByRole('button', { name: 'Tag' }).click();

    await expect(page.locator('.ui-toast-viewport')).toContainText('Image tagged', { timeout: 10_000 });
    await page.getByPlaceholder('Search reference or digest…').fill(newTag);
    await expect(imageRow(page, newTag)).toBeVisible({ timeout: 10_000 });
  } finally {
    await removeTagQuietly(newTag);
    await removeStandaloneImage(sourceTag, containerName);
  }
});

// plan-docker_management_app/REQ-39 — a single per-tag untag action removes just that reference, leaving the image's other tag in place
test('untagging one of several tags removes just that reference, leaving the other tag in place', async ({ page }) => {
  const runId = Date.now();
  const keptTag = `vessel-e2e-untag-${runId}-keep:v1`;
  const removedTag = `vessel-e2e-untag-${runId}-remove:v1`;
  try {
    await tagFromPostgres(keptTag);
    await tagFromPostgres(removedTag);
    await page.getByPlaceholder('Search reference or digest…').fill(`vessel-e2e-untag-${runId}`);

    const row = imageRow(page, keptTag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(removedTag);
    await rowHeader(row).click();

    await row.getByRole('button', { name: `untag ${removedTag}` }).click();

    await expect(row).not.toContainText(removedTag, { timeout: 10_000 });
    await expect(row).toContainText(keptTag);
  } finally {
    await removeTagQuietly(removedTag);
    await removeTagQuietly(keptTag);
  }
});

// plan-docker_management_app/REQ-39, REQ-6 — removing an image asks for confirmation naming it and performs nothing on cancel
test('removing an image asks for confirmation, does nothing on cancel and removes it on confirm', async ({ page }) => {
  const containerName = `vessel-e2e-remove-src-${Date.now()}`;
  const tag = `vessel-e2e-remove-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await page.getByPlaceholder('Search reference or digest…').fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await rowHeader(row).click();

    await row.getByRole('button', { name: 'remove' }).click();
    await expect(page.getByRole('heading', { name: `Confirm: ${tag}` })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(imageRow(page, tag)).toBeVisible();

    await row.getByRole('button', { name: 'remove' }).click();
    await expect(page.getByRole('heading', { name: `Confirm: ${tag}` })).toBeVisible();
    await page.getByRole('button', { name: 'Remove' }).last().click();

    await expect(imageRow(page, tag)).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-39 — dangling images can be pruned in one bulk action, reporting the removed count and reclaimed space
test('pruning dangling images removes them and reports the outcome', async ({ page }) => {
  const containerName = `vessel-e2e-prune-src-${Date.now()}`;
  const danglingTag = `vessel-e2e-prune-dangling-${Date.now()}:v1`;
  await execFileAsync('docker', ['create', '--name', containerName, 'hello-world']);
  const { stdout: firstId } = await execFileAsync('docker', ['commit', '--change', 'LABEL step=1', containerName, danglingTag]);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await execFileAsync('docker', ['commit', '--change', 'LABEL step=2', containerName, danglingTag]);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();

    const pruneButton = page.getByRole('button', { name: 'Prune dangling' });
    await expect(pruneButton).toBeEnabled({ timeout: 10_000 });
    await pruneButton.click();
    await expect(page.getByRole('heading', { name: 'Confirm: dangling images' })).toBeVisible();
    await page.getByRole('button', { name: 'Prune dangling' }).last().click();

    await expect(page.locator('.ui-toast-viewport')).toContainText(/removed/i, { timeout: 15_000 });
    await page.getByPlaceholder('Search reference or digest…').fill(firstId.trim().slice(7, 19));
    await expect(page.locator('.ui-card-list__item')).toHaveCount(0);
  } finally {
    await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => undefined);
    await removeTagQuietly(danglingTag);
  }
});

// plan-docker_management_app/REQ-40 — an image's inspect data (config, env, labels, exposed ports, digest, history) is viewable
test('selecting an image expands its detail panel with structured inspect data and the raw payload', async ({ page }) => {
  const containerName = `vessel-e2e-inspect-src-${Date.now()}`;
  const tag = `vessel-e2e-inspect-${Date.now()}:v1`;
  await execFileAsync('docker', ['create', '--name', containerName, 'hello-world']);
  await execFileAsync('docker', ['commit', '--change', 'LABEL team=vessel', '--change', 'EXPOSE 9999/tcp', containerName, tag]);
  try {
    await page.reload();
    await page.getByPlaceholder('Search reference or digest…').fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await rowHeader(row).click();

    const expanded = row.locator('.ui-card-list__expanded');
    await expect(expanded).toBeVisible();
    await expect(expanded).toContainText('9999/tcp');
    await expect(expanded).toContainText('vessel');
    await expect(expanded.getByText('History')).toBeVisible();
    await expect(expanded.getByText(/"team":\s*"vessel"/)).toBeVisible();
  } finally {
    await execFileAsync('docker', ['rm', '-f', containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-39 — an image can be pushed to a registry, showing per-layer progress until completion.
// Placed before the pull test below: both dialogs are expected to auto-close on completion per
// images-screen.md, and running push first keeps its verdict independent if that expectation fails.
test('pushing an image to a registry shows per-layer progress until it completes', async ({ page }) => {
  // Docker only pushes a reference the image is already locally tagged as, so the push target is
  // tagged directly, then selected in the push dialog (images-screen.md: pushing one of the image's
  // own existing tags).
  const containerName = `vessel-e2e-push-src-${Date.now()}`;
  const pushReference = `localhost:${PUSH_REGISTRY_PORT}/vessel-e2e-push-${Date.now()}:v1`;
  await createStandaloneImage(pushReference, containerName);
  try {
    await page.reload();
    await page.getByPlaceholder('Search reference or digest…').fill(pushReference);
    const row = imageRow(page, pushReference);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await rowHeader(row).click();

    await row.getByRole('button', { name: 'push' }).click();
    const dialogHeading = page.getByRole('heading', { name: `Push ${pushReference}` });
    const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
    await dialog.getByRole('button', { name: 'Push' }).click();

    await expect(page.getByText(/Pending|In progress|Done/).first()).toBeVisible({ timeout: 15_000 });
    await expect(dialogHeading).toHaveCount(0, { timeout: 30_000 });
  } finally {
    await removeStandaloneImage(pushReference, containerName);
  }
});

// plan-docker_management_app/REQ-38 — pulling an image by reference shows per-layer progress until completion
test('pulling an image by reference shows per-layer progress and the image appears once it completes', async ({ page }) => {
  await execFileAsync('docker', ['rmi', '-f', 'hello-world:latest']).catch(() => undefined);

  await page.getByRole('button', { name: 'Pull image…' }).click();
  const dialogHeading = page.getByRole('heading', { name: 'Pull image' });
  await expect(dialogHeading).toBeVisible();
  await page.getByRole('textbox', { name: 'Image reference' }).fill('hello-world:latest');
  await page.getByRole('button', { name: 'Pull', exact: true }).click();

  await expect(page.getByText(/Pending|In progress|Done/).first()).toBeVisible({ timeout: 15_000 });
  // images-screen.md: the pull dialog closes on its own once the transfer ends, and the list re-reads.
  await expect(dialogHeading).toHaveCount(0, { timeout: 30_000 });
  await page.getByPlaceholder('Search reference or digest…').fill('hello-world');
  await expect(imageRow(page, 'hello-world:latest')).toBeVisible({ timeout: 10_000 });
});
