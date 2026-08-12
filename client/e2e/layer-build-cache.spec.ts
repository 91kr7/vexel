import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

const RUN_ID = `${process.pid}-${Date.now()}`;

interface RawCacheRecord {
  ID: string;
  Description?: string;
}

/**
 * A locally built image is the only thing that can have a build-cache record
 * behind one of its layers, so REQ-68's forward path needs one. Its single RUN
 * step carries a marker unique to this run, which is what makes the record it
 * leaves in the host-wide build cache identifiable as this spec's own — and
 * removable afterwards by its own id, without touching anybody else's.
 */
interface BuiltFixture {
  tag: string;
  marker: string;
  cacheRecordIds: string[];
}

async function buildFixtureImage(caseName: string): Promise<BuiltFixture> {
  const marker = `vexel-e2e-trace-${caseName}-${RUN_ID}`;
  const tag = `${marker}:1`;
  const contextDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-trace-'));
  try {
    await writeFile(join(contextDir, 'Dockerfile'), ['FROM alpine:3.20', `RUN mkdir -p /${marker}`, ''].join('\n'), 'utf8');
    await execFileAsync('docker', ['build', ...ownershipArgs(caseName), '-t', tag, contextDir]);
  } finally {
    await rm(contextDir, { recursive: true, force: true });
  }
  return { tag, marker, cacheRecordIds: await cacheRecordIdsCarrying(marker) };
}

/** The build-cache records whose recorded step carries this fixture's marker: this spec's own, and nobody else's. */
async function cacheRecordIdsCarrying(marker: string): Promise<string[]> {
  const { stdout } = await execFileAsync('docker', ['buildx', 'du', '--format', 'json']).catch(() => ({ stdout: '' }));
  return stdout
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as RawCacheRecord)
    .filter((raw) => (raw.Description ?? '').includes(marker))
    .map((raw) => raw.ID);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function removeFixture(fixture: BuiltFixture): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', fixture.tag]).catch(() => undefined);
  // The build cache is host-wide and outlives the image: each record this spec
  // created is removed by its own id, so nothing of the operator's is touched.
  // `buildx prune` acts on whichever builder is active, so the removal is
  // verified and retried rather than assumed.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const remaining = await cacheRecordIdsCarrying(fixture.marker);
    if (remaining.length === 0) return;
    for (const id of remaining) {
      await execFileAsync('docker', ['buildx', 'prune', '--force', '--all', '--filter', `id=${id}`]).catch(() => undefined);
    }
    await delay(500);
  }
}

function imageRow(page: Page, text: string) {
  return page.locator('.ui-data-table__row', { hasText: text });
}

async function selectRow(row: ReturnType<typeof imageRow>): Promise<void> {
  await row.locator('.ui-data-table__cell').first().click();
}

function searchField(page: Page) {
  return page.getByPlaceholder('Search reference or digest…');
}

function layerExplorerModal(page: Page, title: string) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: title }) });
}

/**
 * Opens the layer explorer of a named image from the Images & layers screen, through the row's own
 * overflow menu — the entry point it has now that the explorer is the screen's view rather than the
 * detail panel's (images/specs/images-screen.md). No row is selected and no panel is open.
 */
async function openLayerExplorer(page: Page, reference: string) {
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
  await searchField(page).fill(reference);
  const row = imageRow(page, reference);
  await expect(row).toBeVisible({ timeout: 15_000 });
  // The opening is retried as a whole: the list keeps re-reading from the daemon's own events —
  // loudly so, right after this spec's own `docker build` — and a re-read that replaces the row
  // takes its trigger, and with it the menu, as it is meant to (ui-library/specs/menu.md).
  await expect(async () => {
    await row.getByRole('button', { name: /^More actions for / }).click();
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('menuitem', { name: 'Explore layers…', exact: true }).click();
  const modal = layerExplorerModal(page, `Layer stack — ${reference}`);
  await expect(modal.locator('.ui-data-table__row').first()).toBeVisible({ timeout: 20_000 });
  return modal;
}

function buildCacheCard(page: Page) {
  return page.locator('.ui-frame__content').locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Build cache' }) });
}

// plan-docker_management_app/REQ-68 — from a layer of an image, the build step and the build-cache
// entry responsible for it can be reached: for a locally built image the association exists, and
// following it lands on that record on the Builders & cache screen (layer-explorer.md, REQ-69's
// arrival clause in builders-screen.md).
test('reaches the build step and the cache record behind a locally built layer, in one move', async ({ page }) => {
  const fixture = await buildFixtureImage('layer-cache-forward');
  try {
    const modal = await openLayerExplorer(page, fixture.tag);

    // layer-explorer.md — the layer table carries the build-cache reference as its own column.
    await expect(modal.locator('.ui-data-table__header-cell').filter({ hasText: 'CACHE' })).toBeVisible();

    const builtLayerRow = modal.locator('.ui-data-table__row', { hasText: fixture.marker });
    await expect(builtLayerRow).toBeVisible();
    const reference = builtLayerRow.locator('.ui-cross-reference--navigable');
    await expect(reference).toBeVisible();

    // layer-explorer.md — the expanded section names the layer's full recorded command and its
    // cache record's type, usage state and size.
    await selectRow(builtLayerRow);
    const expanded = modal.locator('.ui-data-table__expanded');
    await expect(expanded).toContainText('Build step & build cache');
    await expect(expanded).toContainText(fixture.marker);
    await expect(expanded).toContainText('regular');

    // layer-explorer.md — following the reference closes the explorer and reaches that record on
    // the Builders & cache screen, which opens it on its related images and layers.
    await expanded.locator('.ui-cross-reference--navigable').first().click();

    await expect(modal).toBeHidden({ timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Builders & cache' })).toBeVisible({ timeout: 15_000 });
    const selectedRecord = buildCacheCard(page).locator('.ui-card-list__item', { hasText: fixture.marker });
    await expect(selectedRecord).toBeVisible({ timeout: 20_000 });
    await expect(buildCacheCard(page)).toContainText('Related images & layers', { timeout: 20_000 });
  } finally {
    await removeFixture(fixture);
  }
});

// plan-docker_management_app/REQ-68 — "when it is not, the reason is stated rather than left
// blank": a registry-pulled image was never built on this host, so the explorer explains why
// instead of showing an empty panel.
test('states why a registry-pulled image has no build-cache association, instead of showing an empty panel', async ({ page }) => {
  const modal = await openLayerExplorer(page, 'registry:2');

  const firstLayerRow = modal.locator('.ui-data-table__row').first();
  // layer-explorer.md — in the cache column, `unavailable` with the reason as its tooltip.
  await expect(firstLayerRow.locator('.ui-cross-reference--navigable')).toHaveCount(0);
  await expect(firstLayerRow).toContainText('unavailable');

  await selectRow(firstLayerRow);
  const expanded = modal.locator('.ui-data-table__expanded');
  await expect(expanded).toContainText('Build step & build cache');
  // Never an empty panel: the section carries the full sentence stating why, and no followable
  // reference at all.
  await expect(expanded.locator('.ui-cross-reference--navigable')).toHaveCount(0);
  const reason = await expanded.locator('.ui-cross-reference--unavailable, .ui-table-meta-cell--unavailable').first().textContent();
  expect((reason ?? '').trim().split(/\s+/).length).toBeGreaterThan(4);
});

// plan-docker_management_app/REQ-69 — from a build-cache entry, the images and layers it is
// associated with can be reached: selecting the record opens them, and following one reaches that
// layer inside the Images & layers screen (builders-screen.md).
test('reaches the images and layers a build-cache record relates to, and follows one back to its layer', async ({ page }) => {
  const fixture = await buildFixtureImage('cache-usage-reverse');
  try {
    await openApp(page, 'builders-cache');
    await expect(page.getByRole('heading', { level: 1, name: 'Builders & cache' })).toBeVisible();

    // builders-screen.md — the record's recorded build step is one of its subtitle lines, which is
    // what identifies this spec's own record among the host's.
    const ownRecord = buildCacheCard(page).locator('.ui-card-list__item', { hasText: fixture.marker });
    await expect(ownRecord).toBeVisible({ timeout: 20_000 });

    await ownRecord.click();

    await expect(buildCacheCard(page)).toContainText('Related images & layers', { timeout: 20_000 });
    const relatedReference = buildCacheCard(page).locator('.ui-cross-reference--navigable', { hasText: fixture.tag });
    await expect(relatedReference.first()).toBeVisible({ timeout: 20_000 });

    await relatedReference.first().click();

    // builders-screen.md — the image is selected and its layer explorer opens at that layer.
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 15_000 });
    const modal = layerExplorerModal(page, `Layer stack — ${fixture.tag}`);
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await expect(modal.locator('.ui-data-table__expanded')).toContainText(fixture.marker, { timeout: 20_000 });
  } finally {
    await removeFixture(fixture);
  }
});
