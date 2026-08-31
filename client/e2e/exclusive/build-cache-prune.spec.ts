import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '../support/test.js';
import { openApp } from '../support/fixtures.js';
import { refreshThroughTheControl } from '../support/refresh-control.js';
import { execFileAsync } from '../../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, localBuilderDriverArgs, mirroredImage } from '../../../server/test/support/base-images.js';

const RUN_ID = `${process.pid}-${Date.now()}`;

// Pruning the build cache (build-cache-service.md) reclaims whichever builder
// is currently active, host-wide and unscopable — exactly like the volume/
// container/image prune specs in this same folder. It lives apart and runs
// alone. See batch-test-isolation.md, INT-4.
//
// What it reclaims depends on which builder is active, so the spec makes a
// builder of its own the active one and only prunes once it has established,
// against buildx directly, that every record the app is about to reclaim is
// that builder's own. That check is an assertion, not a skip: a select-active
// that did not take effect is a defect to surface, and no prune is issued
// under the doubt.
test.describe.configure({ mode: 'serial' });

function fixtureName(caseName: string): string {
  return `vexel-e2e-builder-${caseName}-${RUN_ID}`;
}

async function createBuilderQuietly(name: string): Promise<void> {
  // Booted from the run's own registry, on the host network: buildx contacts a
  // registry on every bootstrap, whatever the daemon already holds, and a public
  // one giving way here would fail an assertion about pruning.
  await execFileAsync('docker', ['buildx', 'create', '--name', name, '--driver', 'docker-container', ...(await localBuilderDriverArgs())]);
}

async function removeBuilderQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['buildx', 'rm', name]).catch(() => undefined);
}

/** The builder `docker buildx build` currently defaults to, so this spec can restore it: the active builder is global daemon state, not a fixture of any one test. */
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

/** The fixture builder's own build-cache record ids, queried directly and scoped with `--builder` — the one way to attribute a cache record to a specific builder. */
async function ownCacheRecordIds(builderName: string): Promise<Set<string>> {
  const { stdout } = await execFileAsync('docker', ['buildx', 'du', '--builder', builderName, '--format', 'json']);
  const lines = stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return new Set(lines.map((line) => (JSON.parse(line) as { ID: string }).ID));
}

function builderRow(page: Page, name: string) {
  return page.locator('.ui-data-table__row', { hasText: name });
}

/** Scopes assertions to the screen's own content, excluding the nav rail — whose "Builders & cache" label itself contains the substring "Build". */
function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

// plan-docker_management_app/REQ-91 — the build cache can be pruned, reporting the space reclaimed,
// after confirmation
test('pruning the build cache reclaims space and reports it, after confirmation', async ({ page }) => {
  // A real `buildx` build runs here, and the three waits below are each allowed
  // 15s on their own — more than the default per-test budget of 30s can hold
  // together with it. Measured on a warm machine: ~8s of Docker work, ~7s for
  // the builder row to appear, ~8s for the "in use" badge, ~5s for the prune
  // round trip. That left no margin at all, and this test failed with the prune
  // already done and its toast already on screen, killed a tenth of a second
  // after the product had finished.
  test.setTimeout(60_000);
  const name = fixtureName('prune');
  await createBuilderQuietly(name);
  const dir = await mkdtemp(join(tmpdir(), 'vexel-e2e-builder-prune-'));
  const originalActive = await currentActiveBuilder();
  try {
    // BuildKit inside a container has an image store of its own and resolves
    // every `FROM` against a registry: the run's own, never Docker Hub.
    await writeFile(join(dir, 'Dockerfile'), `FROM ${await mirroredImage(ALPINE_IMAGE)}\nRUN echo vexel-e2e-prune-marker > /tmp/marker\n`, 'utf8');
    await execFileAsync('docker', ['buildx', 'build', '--builder', name, dir]);
    const ownIds = await ownCacheRecordIds(name);
    expect(ownIds.size).toBeGreaterThan(0);

    // The last active screen survives by design (REQ-115): pin it rather than inherit it.
    await openApp(page, 'builders-cache');
    await expect(page.getByRole('heading', { level: 1, name: 'Builders & cache' })).toBeVisible();

    // Docker announces no builder, so on a server already holding the builder inventory the
    // builder created above stays invisible for a whole period. The press is what puts it on
    // screen, and no budget below is lengthened for it
    // (plan-docker_management_app-refresh_cache/REQ-64, REQ-66, REQ-67).
    await refreshThroughTheControl(page);

    const row = builderRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // `Use` is an action of the row's own cluster since the builders migration
    // (`plan-ui-coherence-optimisation/REQ-39`, REQ-27: bare text is never a control).
    await row.getByRole('button', { name: 'Use', exact: true }).click();
    // The switch has to have landed before anything is pruned: prune reclaims the active
    // builder's cache, and the "in use" badge is how the screen says which builder that is.
    await expect(row.getByText('in use', { exact: true })).toBeVisible({ timeout: 15_000 });

    // plan-docker_management_app-refresh_cache/REQ-65 — the records the application reports
    // after the selection are the fixture builder's own: `buildx du` answers for the active
    // builder, so choosing one changes whose records this inventory holds, and the first read
    // after it must already be the new builder's rather than the previous builder's.
    // It is at the same time the guard on the prune below, which is host-wide: it is never
    // issued unless every record it would reclaim is this spec's own.
    const beforeResponse = await page.request.get('/api/builders/cache');
    const before = (await beforeResponse.json()) as { id: string }[];
    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((record) => !ownIds.has(record.id))).toEqual([]);

    // The screen must be showing that cache before the operator prunes it (builders-screen.md,
    // "Shows: every build-cache record").
    // The innermost region carrying both the heading and the list: the section header and the
    // toolbar sit above the one unpadded card holding it, so a card can no longer be found by the
    // heading it used to hold
    // (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`).
    const cacheCard = screenContent(page)
      .locator('.ui-stack, .ui-surface')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Build cache' }) })
      .filter({ has: page.locator('.ui-data-table') })
      .last();
    await expect(cacheCard.locator('.ui-data-table__row').first()).toBeVisible({ timeout: 15_000 });

    await cacheCard.getByRole('button', { name: 'Prune' }).click();
    const confirmHeading = page.getByRole('heading', { name: /^Confirm:/ });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    const prunePromise = page.waitForResponse((response) => response.url().includes('/api/builders/cache/prune') && response.request().method() === 'POST');
    await confirmDialog.getByRole('button', { name: 'Prune' }).click();
    await expect(confirmDialog).toBeHidden();

    // REQ-91 — the space reclaimed is reported, and it is a real figure: this spec's own build
    // left reclaimable records behind, so zero would not be a report of what happened.
    const pruneResponse = await prunePromise;
    expect(pruneResponse.status()).toBe(200);
    const pruneResult = (await pruneResponse.json()) as { reclaimedBytes: number };
    expect(pruneResult.reclaimedBytes).toBeGreaterThan(0);

    // and it reaches the operator: the toast carries a size.
    await expect(page.locator('.ui-toast-viewport')).toContainText(/\d+(\.\d+)?\s*(B|kB|KB|KiB|MB|MiB|GB|GiB)/, { timeout: 20_000 });

    // and the records it reclaimed are gone.
    const afterResponse = await page.request.get('/api/builders/cache');
    const after = (await afterResponse.json()) as { id: string }[];
    expect(after.filter((record) => ownIds.has(record.id))).toEqual([]);
  } finally {
    if (originalActive) await useBuilderQuietly(originalActive);
    await removeBuilderQuietly(name);
    await rm(dir, { recursive: true, force: true });
  }
});
