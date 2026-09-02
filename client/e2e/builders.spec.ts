import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { boxOf, centreOf } from './support/settled.js';
import { refreshThroughTheControl } from './support/refresh-control.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, localBuilderDriverArgs, mirroredImage } from '../../server/test/support/base-images.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

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

/**
 * The region a list is read in, named by the section header titling it.
 *
 * Named by **what it holds** rather than by the surface it used to be: each
 * section's header and toolbar sit **above** the one unpadded card holding its
 * list (`builders-screen.md`, and
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`),
 * so a card can no longer be found by the heading it used to hold. A panel is
 * the innermost region carrying both the heading and the list; every region
 * matching contains the same heading and is therefore an ancestor of the next,
 * so the last in document order is the panel's own — and on a screen still drawn
 * the old way that is its card.
 */
function panel(page: Page, title: 'buildx builders' | 'Build cache') {
  return screenContent(page)
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: title }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

/**
 * A builder's row of the object list, so the assertions cover everything the row
 * carries (`plan-ui-coherence-optimisation/REQ-39`; the hand-built card list this
 * screen used is deleted).
 */
function builderRow(page: Page, name: string) {
  return panel(page, 'buildx builders').locator('.ui-data-table__row', { hasText: name }).first();
}

/** Scopes assertions to the screen's own content, excluding the nav rail — whose "Builders & cache" label itself contains the substring "Build". */
function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

/** The cell of a row belonging to the column whose header names it. */
async function cellOf(page: Page, row: ReturnType<typeof builderRow>, header: RegExp): Promise<{ text: string; controls: number }> {
  const headers = await panel(page, 'buildx builders').locator('.ui-data-table__header-cell').allTextContents();
  const index = headers.findIndex((label) => header.test(label.trim()));
  expect(index, `no column of the builders list is headed ${header} — headers are ${JSON.stringify(headers)}`).toBeGreaterThanOrEqual(0);
  const cell = row.locator('.ui-data-table__cell').nth(index);
  return { text: ((await cell.textContent()) ?? '').replace(/\s+/g, ' ').trim(), controls: await cell.locator('button, [role="button"], a').count() };
}

/** Clicks a control with a real pointer at its own coordinates, after checking the point belongs to it. */
async function clickAtItsOwnCentre(page: Page, control: ReturnType<typeof builderRow>, expectedLabel: string): Promise<void> {
  // The hit test is the point of this helper, and it is only worth anything against a **settled**
  // box: a point taken from a layout in motion belongs to whatever has since slid under it, which
  // this check would then report as the control being covered (`support/settled.ts`).
  await control.scrollIntoViewIfNeeded();
  const centre = centreOf(await boxOf(control, `the "${expectedLabel}" control`));
  const hit = await page.evaluate(({ x, y }) => (document.elementFromPoint(x, y)?.closest('button')?.textContent ?? '').trim(), centre);
  expect(hit, `the point at the centre of "${expectedLabel}" belongs to something else`).toBe(expectedLabel);
  await page.mouse.click(centre.x, centre.y);
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
    // Docker publishes no builder event, so the press is what puts the new builder on
    // screen (plan-docker_management_app-refresh_cache-manual_refresh/REQ-16).
    await refreshThroughTheControl(page);
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
// "in use", the others offering the action that switches to them;
// plan-ui-coherence-optimisation/REQ-27, REQ-39 — that action is an action of the row's cluster,
// with the appearance of a control, and the marker is a reading in a column of its own. Driven with
// a real pointer at the control's own coordinates.
test('selecting a builder through its Use action marks it as the active one', async ({ page }) => {
  const name = fixtureName('use');
  await createBuilderQuietly(name);
  const originalActive = await currentActiveBuilder();
  try {
    // Docker publishes no builder event, so the press is what puts the new builder on
    // screen (plan-docker_management_app-refresh_cache-manual_refresh/REQ-16).
    await refreshThroughTheControl(page);
    const row = builderRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    const useAction = row.getByRole('button', { name: 'Use', exact: true });
    await expect(useAction).toBeVisible();
    // The action lives in the cluster, and the cluster is a cell of the row.
    await expect(row.locator('.ui-action-button-group').getByRole('button', { name: 'Use', exact: true })).toHaveCount(1);

    await clickAtItsOwnCentre(page, useAction, 'Use');

    await expect(row.getByText('in use', { exact: true })).toBeVisible({ timeout: 15_000 });
    // …and what marks the active builder is a reading, not a second control offering to re-select it.
    await expect(row.getByRole('button', { name: 'Use', exact: true })).toHaveCount(0);
  } finally {
    if (originalActive) await useBuilderQuietly(originalActive);
    await removeBuilderQuietly(name);
  }
});

// plan-ui-coherence-optimisation/REQ-40 — "A builder's name appears once per row"; REQ-39 — the
// row's mixed trailing run becomes a status column plus an action cluster, so "a state is never a
// control and a control never reads as a state" (builders-screen.md). Measured against the daemon's
// own inventory, with one builder of this spec's making in it.
test('a builder’s row states its name once, its status as a reading and its actions as controls', async ({ page }) => {
  const name = fixtureName('shape');
  await createBuilderQuietly(name);
  try {
    // Docker publishes no builder event, so the press is what puts the new builder on
    // screen (plan-docker_management_app-refresh_cache-manual_refresh/REQ-16).
    await refreshThroughTheControl(page);
    const row = builderRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    const rowText = ((await row.textContent()) ?? '').replace(/\s+/g, ' ').trim();
    console.log(`[REQ-40] the ${name} row reads: ${rowText}`);
    expect(rowText.split(name).length - 1, 'the row states the builder’s name more than once').toBe(1);

    // Every value in the column naming it, and no control in any of them.
    const builderCell = await cellOf(page, row, /^BUILDER$/i);
    expect(builderCell.text, 'the builder column does not lead with the builder').toContain(name);
    const statusCell = await cellOf(page, row, /^STATUS$/i);
    expect(statusCell.text, 'the status column states nothing').not.toBe('');
    expect(statusCell.controls, 'the status reading is a control').toBe(0);
    expect((await cellOf(page, row, /^CACHE$/i)).controls, 'the cache size is a control').toBe(0);
    expect((await cellOf(page, row, /^ENDPOINT$/i)).controls, 'the endpoint is a control').toBe(0);

    // …and every control the row carries is an action of its cluster.
    const cluster = row.locator('.ui-action-button-group');
    await expect(cluster, 'the row draws no action cluster').toHaveCount(1);
    expect(await row.locator('button, [role="button"], a').count(), 'a control of the row sits outside its action cluster').toBe(
      await cluster.locator('button, [role="button"], a').count(),
    );
    await expect(cluster.locator('xpath=ancestor::*[contains(@class, "ui-data-table__cell")]'), 'the cluster is not a cell of the row').toHaveCount(1);
  } finally {
    await removeBuilderQuietly(name);
  }
});

// plan-ui-coherence-optimisation/REQ-41 — "Page-level actions exist where the screen has them, in
// the toolbar under the header rather than in a card header, and every operation available on the
// delivered build still performs the same operation."
test('the screen’s page-level actions are in each card’s toolbar', async ({ page }) => {
  for (const [title, label] of [
    ['buildx builders', 'Create builder'],
    ['Build cache', 'Prune'],
  ] as const) {
    const card = panel(page, title);
    const toolbar = card.locator('.ui-screen-toolbar').first();
    await expect(toolbar, `the ${title} card draws no screen toolbar`).toBeVisible();
    await expect(toolbar.getByRole('button', { name: label }), `${label} is not a control of the ${title} toolbar`).toHaveCount(1);
    expect(await card.getByRole('button', { name: label }).count(), `${label} is stated more than once on the ${title} card`).toBe(1);
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
  // Same shape as `build-cache-prune.spec.ts`, and the same reason: a
  // real `buildx` build inside the body, then waits allowed 15s each, against a
  // default budget of 30s. That spec ran out of it; this one has never been
  // measured with any margin to spare either.
  test.setTimeout(60_000);
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
    // The builder and the cache records it produced were made from the CLI, and Docker publishes no
    // event for either, so the press is what puts them on screen — the same reason as the three
    // checks above (plan-docker_management_app-refresh_cache-manual_refresh/REQ-16).
    await refreshThroughTheControl(page);
    const row = builderRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await clickAtItsOwnCentre(page, row.getByRole('button', { name: 'Use', exact: true }), 'Use');
    await expect(row.getByText('in use', { exact: true })).toBeVisible({ timeout: 15_000 });

    // plan-docker_management_app/REQ-88 — now that this builder is running and has built
    // something, its row carries its status and its own cache size.
    await expect(row).toContainText('running', { timeout: 15_000 });
    await expect(row).toContainText(/\d+(\.\d+)?\s*(B|kB|KB|KiB|MB|MiB|GB|GiB)/, { timeout: 15_000 });

    // The records are rows of the object list now (REQ-39), the hand-built card list deleted.
    const cacheRows = panel(page, 'Build cache').locator('.ui-data-table__row');
    await expect.poll(() => cacheRows.count(), { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(cacheRows.first()).toHaveText(/shared|in use|reclaimable/);
    // REQ-91 — each record carries its own size and type alongside that usage state.
    await expect(cacheRows.first()).toHaveText(/\d+(\.\d+)?\s*(B|kB|KB|KiB|MB|MiB|GB|GiB)/);
    await expect(screenContent(page).locator('.ui-card-list'), 'the screen still draws a hand-built card list').toHaveCount(0);
  } finally {
    if (originalActive) await useBuilderQuietly(originalActive);
    await removeBuilderQuietly(name);
    await rm(dir, { recursive: true, force: true });
  }
});
