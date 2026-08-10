import { expect, test, type Page } from './support/test.js';
import { navEntry, openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { PULLABLE_REPOSITORY, TINY_IMAGE, ensureImage, ensurePullableImage } from '../../server/test/support/base-images.js';

// Every test in this file exercises the daemon's real pull/tag/push/remove
// operations one at a time (a shared registry-facing resource), so they run
// serially rather than in Playwright's default fully-parallel mode.
test.describe.configure({ mode: 'serial' });

async function tagFromPostgres(tag: string): Promise<void> {
  await execFileAsync('docker', ['tag', 'alpine:3.20', tag]);
}

async function removeTagQuietly(tag: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
}

/** A standalone single-tag image (its own id, unrelated to any other locally tagged image). */
async function createStandaloneImage(tag: string, containerName: string): Promise<void> {
  await createFromTinyImage(containerName);
  await execFileAsync('docker', ['commit', containerName, tag]);
}

/**
 * Creates (but never starts) a container from the suite's own single-file image.
 *
 * Ensured at the point of use, not once for the run: the exclusive project
 * prunes the host, so an image present at global setup may be gone by now.
 * Locally built, so putting it back costs a second and no network.
 */
async function createFromTinyImage(containerName: string): Promise<void> {
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), TINY_IMAGE]);
}

async function removeStandaloneImage(tag: string, containerName: string): Promise<void> {
  await removeTagQuietly(tag);
  await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
}

// The images list is a DataTable laid out like the containers table
// (images/specs/images-screen.md): one `.ui-data-table__row` per image, its
// actions inside the row, and the expanded detail panel as a sibling element
// after the row — not nested inside it.
function imageRow(page: Page, text: string) {
  return page.locator('.ui-data-table__row', { hasText: text });
}

/** Selects a row by clicking a non-action cell (the action group swallows its own clicks). */
async function selectRow(row: ReturnType<typeof imageRow>): Promise<void> {
  await row.locator('.ui-data-table__cell').first().click();
}

function expandedPanel(page: Page) {
  return page.locator('.ui-data-table__expanded');
}

function searchField(page: Page) {
  return page.getByPlaceholder('Search reference or digest…');
}

// A disposable, unauthenticated local registry: lets the push test below exercise a real registry
// round trip without depending on any external/authenticated registry.
const PUSH_REGISTRY_PORT = 5082;
let pushRegistryContainerId = '';

test.beforeAll(async () => {
  const { stdout } = await execFileAsync('docker', ['run', '-d', '-p', `${PUSH_REGISTRY_PORT}:5000`, ...ownershipArgs('registry'), 'registry:2']);
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
  await execFileAsync('docker', ['rm', '-fv', pushRegistryContainerId]).catch(() => undefined);
});

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-docker_management_app/REQ-37 — the images screen lists local images with repository:tag, digest, platform, size and creation age
test('lists a local image in a table row with its reference, digest, platform, size and creation age', async ({ page }) => {
  // Built locally on purpose: a multi-platform image pulled as an index can be
  // stored by the daemon without a platform-specific config, and then reports
  // neither an architecture nor a creation date of its own.
  const containerName = `vexel-e2e-list-src-${Date.now()}`;
  const tag = `vexel-e2e-list-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();

    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(/ago/);
    await expect(row).toContainText(/B|KB|MB|GB/);
    await expect(row).toContainText('linux/');
    await expect(row).toContainText('sha256:');
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-37 — the columns are named by a header row, as on the containers table
test('shows a header row naming every image column', async ({ page }) => {
  const headers = page.locator('.ui-data-table__header-cell');

  // Two unnamed cells lead the row: the bulk-selection checkbox
  // (ui-library/specs/data-table.md) and the status dot.
  await expect(headers).toHaveText(['', '', 'REPOSITORY:TAG', 'TAGS', 'DIGEST', 'PLATFORM', 'SIZE', 'CREATED', 'ACTIONS']);
});

// plan-docker_management_app/REQ-37 — the four per-image actions are on every row, visible without expanding it
test('shows tag, untag, push and remove on the row itself, without expanding it', async ({ page }) => {
  const tag = `vexel-e2e-actions-${Date.now()}:v1`;
  try {
    await tagFromPostgres(tag);
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    // No row is expanded at this point: the actions must already be there.
    await expect(expandedPanel(page)).toHaveCount(0);
    for (const label of ['tag', 'untag', 'push', 'remove']) {
      await expect(row.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
  } finally {
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-41 — the image list can be text-searched by reference
test('searching narrows the list to images whose reference matches the search text', async ({ page }) => {
  const tag = `vexel-e2e-search-${Date.now()}:v1`;
  try {
    await tagFromPostgres(tag);

    await searchField(page).fill(tag);

    await expect(imageRow(page, tag)).toBeVisible({ timeout: 10_000 });
    const otherRows = page.locator('.ui-data-table__row').filter({ hasNotText: tag });
    await expect(otherRows).toHaveCount(0);
  } finally {
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-41 — the search also matches by digest
test('searching by digest also narrows the list to the matching image', async ({ page }) => {
  const { stdout } = await execFileAsync('docker', ['inspect', 'alpine:3.20', '--format', '{{index .RepoDigests 0}}']);
  const fullDigest = stdout.trim().split('@')[1]!; // e.g. sha256:f8e2cc2a36dd...
  const shortDigest = fullDigest.slice(0, 19); // "sha256:" (7) + 12 hex chars

  await searchField(page).fill(shortDigest);

  await expect(imageRow(page, 'alpine')).toBeVisible({ timeout: 10_000 });
});

// plan-docker_management_app/REQ-39 — an image can be tagged with a new reference, reflected in the list
test('tagging an image adds the new reference and confirms with a success toast', async ({ page }) => {
  const containerName = `vexel-e2e-tagsrc-${Date.now()}`;
  const sourceTag = `vexel-e2e-tagsrc-${Date.now()}:v1`;
  const newTag = `vexel-e2e-tagged-${Date.now()}:v1`;
  try {
    await createStandaloneImage(sourceTag, containerName);
    await page.reload();
    await searchField(page).fill(sourceTag);
    const row = imageRow(page, sourceTag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: 'tag', exact: true }).click();
    const dialogHeading = page.getByRole('heading', { name: `Tag ${sourceTag}` });
    const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
    await dialog.getByRole('textbox', { name: 'New reference' }).fill(newTag);
    await dialog.getByRole('button', { name: 'Tag' }).click();

    await expect(page.locator('.ui-toast-viewport')).toContainText('Image tagged', { timeout: 10_000 });
    await searchField(page).fill(newTag);
    await expect(imageRow(page, newTag)).toBeVisible({ timeout: 10_000 });
  } finally {
    await removeTagQuietly(newTag);
    await removeStandaloneImage(sourceTag, containerName);
  }
});

// plan-docker_management_app/REQ-39 — untagging removes just the chosen reference, leaving the image's other tag in place.
// images-screen.md: with several tags the row's untag action asks which reference to drop.
test('untagging one of several tags removes just that reference, leaving the other tag in place', async ({ page }) => {
  const runId = Date.now();
  const containerName = `vexel-e2e-untag-src-${runId}`;
  const keptTag = `vexel-e2e-untag-${runId}-keep:v1`;
  const removedTag = `vexel-e2e-untag-${runId}-remove:v1`;
  try {
    // A standalone image with exactly the two references under test, so both
    // are visible on the row (the TAGS column shows two badges before it folds
    // the rest into a +N indicator).
    await createStandaloneImage(keptTag, containerName);
    await execFileAsync('docker', ['tag', keptTag, removedTag]);
    await page.reload();
    await searchField(page).fill(`vexel-e2e-untag-${runId}`);

    const row = imageRow(page, keptTag);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(removedTag);

    await row.getByRole('button', { name: 'untag', exact: true }).click();
    const dialog = page.locator('.ui-modal');
    await dialog.getByRole('combobox', { name: 'Reference to untag' }).selectOption(removedTag);
    await dialog.getByRole('button', { name: 'Untag' }).click();

    await expect(row).not.toContainText(removedTag, { timeout: 10_000 });
    await expect(row).toContainText(keptTag);
  } finally {
    await removeTagQuietly(removedTag);
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await removeTagQuietly(keptTag);
  }
});

// plan-docker_management_app/REQ-39 — untagging an image that has a single tag needs no choice
test('untagging a single-tag image drops its reference straight away', async ({ page }) => {
  const containerName = `vexel-e2e-untag-solo-src-${Date.now()}`;
  const tag = `vexel-e2e-untag-solo-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: 'untag', exact: true }).click();

    await expect(page.locator('.ui-modal')).toHaveCount(0);
    await expect(imageRow(page, tag)).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-37 — a dangling image is marked as such and has no reference to untag or push
test('marks a dangling image with a dangling badge and disables its untag and push actions', async ({ page }) => {
  const containerName = `vexel-e2e-dangling-src-${Date.now()}`;
  const tag = `vexel-e2e-dangling-${Date.now()}:v1`;
  await createFromTinyImage(containerName);
  const { stdout: firstId } = await execFileAsync('docker', ['commit', '--change', 'LABEL step=1', containerName, tag]);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await execFileAsync('docker', ['commit', '--change', 'LABEL step=2', containerName, tag]);
  try {
    await page.reload();
    await searchField(page).fill(firstId.trim().slice(7, 19));
    const row = page.locator('.ui-data-table__row').first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    await expect(row).toContainText('dangling');
    await expect(row).toContainText('<none>');
    await expect(row.getByRole('button', { name: 'untag', exact: true })).toBeDisabled();
    await expect(row.getByRole('button', { name: 'push', exact: true })).toBeDisabled();
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await execFileAsync('docker', ['rmi', '-f', firstId.trim()]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-39, REQ-6 — removing an image asks for confirmation naming it and performs nothing on cancel
test('removing an image asks for confirmation, does nothing on cancel and removes it on confirm', async ({ page }) => {
  const containerName = `vexel-e2e-remove-src-${Date.now()}`;
  const tag = `vexel-e2e-remove-${Date.now()}:v1`;
  try {
    await createStandaloneImage(tag, containerName);
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: 'remove', exact: true }).click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${tag}` });
    await expect(confirmHeading).toBeVisible();
    // The dialog's own actions: every row behind it carries a "remove" of its own,
    // which accessible-name matching finds case-insensitively.
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(imageRow(page, tag)).toBeVisible();

    await row.getByRole('button', { name: 'remove', exact: true }).click();
    await expect(confirmHeading).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Remove' }).click();

    await expect(imageRow(page, tag)).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-40 — an image's inspect data (config, env, labels, exposed ports, digest, history) is viewable
test('selecting an image expands its detail panel with structured inspect data and the raw payload', async ({ page }) => {
  const containerName = `vexel-e2e-inspect-src-${Date.now()}`;
  const tag = `vexel-e2e-inspect-${Date.now()}:v1`;
  await createFromTinyImage(containerName);
  await execFileAsync('docker', ['commit', '--change', 'LABEL team=vexel', '--change', 'EXPOSE 9999/tcp', containerName, tag]);
  try {
    await page.reload();
    await searchField(page).fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await selectRow(row);

    const expanded = expandedPanel(page);
    await expect(expanded).toBeVisible();
    await expect(expanded).toContainText('9999/tcp');
    await expect(expanded).toContainText('vexel');
    await expect(expanded.getByText('History')).toBeVisible();
    await expect(expanded.getByText(/"team":\s*"vexel"/)).toBeVisible();
    // images-screen.md: the expanded region carries the detail panel alone.
    await expect(expanded.getByRole('button', { name: 'remove', exact: true })).toHaveCount(0);
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    await removeTagQuietly(tag);
  }
});

// plan-docker_management_app/REQ-3 — the images table and the containers table present identically:
// same header row treatment, same column typography, same row height, same hover and selected treatment.
test('the images table and the containers table present with the same header, typography, row height, hover and selected treatment', async ({
  page,
}) => {
  const containerName = `vexel-e2e-homogeneity-${Date.now()}`;
  const tag = `vexel-e2e-homogeneity-${Date.now()}:v1`;
  try {
    await execFileAsync('docker', ['run', '-d', '--name', containerName, ...ownershipArgs(containerName), '--entrypoint', 'sleep', 'alpine:3.20', '300']);
    await tagFromPostgres(tag);

    const measure = async () => {
      const table = page.locator('.ui-data-table');
      await expect(table.locator('.ui-data-table__row').first()).toBeVisible({ timeout: 15_000 });

      const header = await table.locator('.ui-data-table__header').evaluate((node) => {
        const style = getComputedStyle(node);
        return { background: style.backgroundColor, padding: style.padding, borderBottom: style.borderBottom };
      });
      const headerCell = await table
        .locator('.ui-data-table__header-cell')
        .nth(1)
        .evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            letterSpacing: style.letterSpacing,
            textTransform: style.textTransform,
            color: style.color,
          };
        });
      const row = table.locator('.ui-data-table__row').first();
      const rowBox = await row.boundingBox();
      const restingBackground = await row.evaluate((node) => getComputedStyle(node).backgroundColor);
      await row.hover();
      const hoverBackground = await row.evaluate((node) => getComputedStyle(node).backgroundColor);
      const cell = await table
        .locator('.ui-data-table__cell')
        .nth(1)
        .evaluate((node) => {
          const style = getComputedStyle(node);
          return { fontSize: style.fontSize, color: style.color, padding: style.padding };
        });

      await row.locator('.ui-data-table__cell').first().click();
      const selected = table.locator('.ui-data-table__row--selected').first();
      const selectedBackground = await selected.evaluate((node) => getComputedStyle(node).backgroundColor);

      return { header, headerCell, rowHeight: rowBox?.height, restingBackground, hoverBackground, cell, selectedBackground };
    };

    // Scoped to the rail: the Dashboard's cross-navigation tiles name the same
    // screens, so an unscoped locator matches more than the entry meant here.
    await navEntry(page, 'Containers').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    const containersLook = await measure();

    await navEntry(page, 'Images & layers').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
    const imagesLook = await measure();

    expect(imagesLook).toEqual(containersLook);
    // A meaningful comparison: hovering must actually change the row, and the
    // selected row must differ from a resting one on both screens.
    expect(imagesLook.hoverBackground).not.toBe(imagesLook.restingBackground);
    expect(imagesLook.selectedBackground).not.toBe(imagesLook.restingBackground);
  } finally {
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
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
  const containerName = `vexel-e2e-push-src-${Date.now()}`;
  const pushReference = `localhost:${PUSH_REGISTRY_PORT}/vexel-e2e-push-${Date.now()}:v1`;
  await createStandaloneImage(pushReference, containerName);
  try {
    await page.reload();
    await searchField(page).fill(pushReference);
    const row = imageRow(page, pushReference);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: 'push', exact: true }).click();
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
  // A real registry pull runs here, so the default per-test budget is not the
  // measure of anything this test is about.
  test.setTimeout(120_000);
  // The suite's own registry, on this machine: what is contracted is that the
  // product fetches a reference it does not hold, and a public registry giving
  // way says nothing about that. Removed locally first, so the pull is real.
  const reference = await ensurePullableImage();
  await execFileAsync('docker', ['rmi', '-f', reference]).catch(() => undefined);

  try {
    await page.getByRole('button', { name: 'Pull image…' }).click();
    const dialogHeading = page.getByRole('heading', { name: 'Pull image' });
    await expect(dialogHeading).toBeVisible();
    const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
    await dialog.getByRole('textbox', { name: 'Image reference' }).fill(reference);
    await dialog.getByRole('button', { name: 'Pull', exact: true }).click();

    await expect(page.getByText(/Pending|In progress|Done/).first()).toBeVisible({ timeout: 15_000 });
    // images-screen.md: the pull dialog closes on its own once the transfer ends, and the list re-reads.
    await expect(dialogHeading).toHaveCount(0, { timeout: 30_000 });
    await searchField(page).fill(PULLABLE_REPOSITORY);
    await expect(imageRow(page, reference)).toBeVisible({ timeout: 10_000 });
  } finally {
    // The pull was the point, not the image: the daemon is left holding no more
    // than it did before, so the next run's "missing locally" is genuine too.
    await removeTagQuietly(reference);
  }
});
