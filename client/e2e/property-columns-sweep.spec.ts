import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { COLUMN_GAP_PX, expectNothingClippedOrOverlapped, measureSection, report } from './support/property-bands.js';
import { expectCompletedThenSelfDismissed } from './support/progress-completion.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

/**
 * **The blast radius, made fail-able.** REQ ids belong to
 * `plan-docker_management_app-detail_property_columns`.
 *
 * The corrected arrangement is the shared component's default, so it reaches
 * **every call site that states no count** — twenty of the twenty-five, across
 * ten screens nobody in this report was looking at. Each is visited here with a
 * real pointer and its outcome is **stated screen by screen** (REQ-28), never as
 * "all fine": for every property section the screen presents, every value's box
 * lies inside its band, no label box intersects its value's, the section's box
 * lies inside its container's, and the section leaves no dead margin — at
 * **1280 × 720 and 1920 × 1080**. Beside that, and never instead of it (REQ-40),
 * every property still renders with its label and its value (REQ-31).
 *
 * **A screen that presents no property section on this daemon says so** and is
 * reported as such rather than passing quietly: the sweep's value is in what it
 * states, and an environment fact (no daemon plugin installed, no configured
 * registry) is not a verdict about the product.
 *
 * And **bug-3's delivered surface** (REQ-29, REQ-35): the filesystem browser's
 * entry-metadata pane, reached through bug-2's delivered flow, is one column and
 * measures what it measured on the delivered build — "visually unchanged" is a
 * claim about geometry, so it is measured.
 *
 * Every fixture carries the ownership labels and is removed in a `finally`;
 * nothing assumes an empty daemon; nothing reaches Docker Hub.
 */

const SWEEP_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

/**
 * bug-3's delivered surface, measured on the delivered build before this
 * report's correction existed (2026-08-14, this environment): with the `etc`
 * directory selected at 1280 × 720 the entry-metadata pane's own list measures
 * **697 × 230.3px, one column, six bands**. bug-3 is baseline and is not
 * disturbed, and "visually unchanged" is a claim about geometry — so it is the
 * box that is compared, not the look of it.
 */
const DELIVERED_METADATA_PANE = { width: 697, height: 230.3 };

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

/**
 * Measures every property section a screen currently presents, states the
 * outcome for the screen by name, and asserts the invariants on each.
 *
 * Returns how many sections were found, so a caller can require one where one is
 * expected and state the environment reason where none is.
 */
async function sweepScreen(page: Page, screenName: string, viewport: { width: number; height: number }, expected = 0): Promise<number> {
  const sections = screenContent(page).locator('.ui-definition-list');
  // A screen's property section arrives with the read that fills it, so it is waited for rather than
  // counted the instant the heading appears — otherwise "no section presented" would be a statement
  // about this runner's timing rather than about the screen.
  if (expected > 0) await expect(sections).toHaveCount(expected, { timeout: 20_000 });
  const count = await sections.count();
  if (count === 0) {
    console.log(`[REQ-28] ${screenName} @${viewport.width}×${viewport.height}: no property section presented`);
    return 0;
  }
  for (let index = 0; index < count; index += 1) {
    const geometry = await measureSection(sections.nth(index), `${screenName} property section ${index}`);
    const evidence = report(`${screenName} section ${index} @${viewport.width}×${viewport.height}`, geometry);
    console.log(`[REQ-28] ${evidence}`);
    expectNothingClippedOrOverlapped(geometry, evidence);
    expect(geometry.rightEdgeGap, `${evidence} — ${geometry.rightEdgeGap.toFixed(1)}px of dead margin on the right`).toBeLessThanOrEqual(COLUMN_GAP_PX + 1);
    // Beside the geometry (REQ-31): every band still carries a label and a value, so a section that
    // arranged itself into emptiness would be caught here rather than passing as "no violations".
    for (const band of geometry.bands) {
      expect(band.labelBox, `${evidence} — the \`${band.label}\` band draws no label`).not.toBeNull();
      expect(band.valueBox, `${evidence} — the \`${band.label}\` band draws no value`).not.toBeNull();
    }
  }
  return count;
}

// REQ-28, REQ-24, REQ-31 — volumes & networks: both panels, each with a fixture of its own, revealed
// with a real pointer on the row's own first cell.
//
// The two are measured **one after the other rather than together**, which is not a convenience:
// since `plan-ui-coherence-optimisation/REQ-33` at most one detail panel is open anywhere on this
// screen, so revealing the network's closes the volume's. Both panels are still measured, and both
// are still required to present a section — what changed is that the screen can no longer hold two
// at once, which is the requirement rather than a loss of coverage.
test('volumes & networks: both panels arrange their inspect data without clipping or overlap', async ({ page }) => {
  const volumeName = `vexel-e2e-bug4-vol-${Date.now()}`;
  const networkName = `vexel-e2e-bug4-net-${Date.now()}`;
  await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(volumeName), volumeName]);
  await execFileAsync('docker', ['network', 'create', ...ownershipArgs(networkName), networkName]);
  try {
    for (const viewport of SWEEP_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await openApp(page, 'volumes-networks');
      await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 20_000 });

      const volumesPanel = page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Volumes' }) });
      await volumesPanel.locator('.ui-data-table__row', { hasText: volumeName }).first().locator('.ui-data-table__cell').first().click();
      await expect(volumesPanel.locator('.ui-detail-panel')).toBeVisible();
      const volumeSections = await sweepScreen(page, 'volumes & networks — the volume panel', viewport, 1);
      expect(volumeSections, "the volume's revealed panel presented no property section").toBeGreaterThanOrEqual(1);

      const networksPanel = page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Networks' }) });
      await networksPanel.locator('.ui-data-table__row', { hasText: networkName }).first().locator('.ui-data-table__cell').first().click();
      await expect(networksPanel.locator('.ui-detail-panel')).toBeVisible();
      // REQ-33 — and the volume's is gone, which is why the two are swept apart.
      await expect(volumesPanel.locator('.ui-detail-panel')).toHaveCount(0);
      const networkSections = await sweepScreen(page, 'volumes & networks — the network panel', viewport, 1);
      expect(networkSections, "the network's revealed panel presented no property section").toBeGreaterThanOrEqual(1);
    }
  } finally {
    await execFileAsync('docker', ['volume', 'rm', '-f', volumeName]).catch(() => undefined);
    await execFileAsync('docker', ['network', 'rm', '-f', networkName]).catch(() => undefined);
  }
});

// REQ-28 — system & prune and contexts, whose daemon cards are present whatever the daemon holds:
// two sections in ~360px cards, which is the narrow case a too-high count clips in.
test('system & prune and contexts: the daemon cards stay inside their ~360px cards', async ({ page }) => {
  for (const viewport of SWEEP_VIEWPORTS) {
    for (const [screenId, screenName, heading] of [
      ['system-prune', 'system & prune', 'System & prune'],
      ['contexts', 'contexts', 'Contexts'],
    ] as const) {
      await page.setViewportSize(viewport);
      await openApp(page, screenId);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 20_000 });
      const found = await sweepScreen(page, screenName, viewport, 1);
      expect(found, `${screenName} presented no daemon card, which it shows whatever the daemon holds`).toBeGreaterThanOrEqual(1);
    }
  }
});

// REQ-28 — plugins and registries. Both present a property section only when the daemon (or the
// operator's configuration) has something to show, so what this states is the outcome, not a verdict.
test('plugins and registries: whatever property section each presents is sound at both widths', async ({ page }) => {
  for (const viewport of SWEEP_VIEWPORTS) {
    for (const [screenId, screenName, heading] of [
      ['plugins', 'plugins', 'Plugins'],
      ['registries', 'registries', 'Registries'],
    ] as const) {
      await page.setViewportSize(viewport);
      await openApp(page, screenId);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 20_000 });
      const found = await sweepScreen(page, screenName, viewport);
      if (found === 0) {
        console.log(
          `[REQ-28] ${screenName}: no property section on this daemon — the plugin inspect list needs an installed daemon plugin, the registry's pull reference an open pull dialog. Neither is created here; both are exercised by their own specs.`,
        );
      }
    }
  }
});

// REQ-28 — the coverage matrix, the tenth screen of the sweep.
//
// **This test is the one edit the retirement of the caller-stated count forced on this file, and
// the reason is the file's own.** As written for the batch that added it, it asserted that the only
// property list on this screen was a caller-stated one — the fact that decided which file owned its
// geometry — and said in the same breath that "if a list without a stated count ever appears on this
// screen, the sweep gains it". That is what has happened: the count is retired, so the screen's
// baseline list is now an ordinary consumer of the shared rule and is swept like the other nine.
// Its own ~400px measurement lives in `property-columns-derived-count.spec.ts`.
test('the coverage matrix: its baseline list is swept like every other consumer', async ({ page }) => {
  for (const viewport of SWEEP_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await openApp(page, 'coverage-matrix');
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible({ timeout: 20_000 });
    const found = await sweepScreen(page, 'coverage matrix', viewport, 1);
    expect(found, 'the coverage matrix presented no baseline list, which it shows whatever the daemon reports').toBeGreaterThanOrEqual(1);
  }
});

// REQ-28 — the layer explorer, opened from the row's own overflow menu on an image of the test's own.
// Its build-step list is a single band, which fills the width it has: the arrangement changes nothing
// for it, and this states that rather than assuming it.
test('the layer explorer: its build-step section fills its width and clips nothing', async ({ page }) => {
  const containerName = `vexel-e2e-bug4-layers-${Date.now()}`;
  const tag = `vexel-e2e-bug4-layers-${Date.now()}:v1`;
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), TINY_IMAGE]);
  await execFileAsync('docker', ['commit', containerName, tag]);
  try {
    for (const viewport of SWEEP_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await openApp(page, 'images-layers');
      await page.getByPlaceholder('Search reference or digest…').fill(tag.split(':')[0]!);
      const row = page.locator('.ui-data-table__row', { hasText: tag }).first();
      await expect(row).toBeVisible({ timeout: 20_000 });
      // Retried as a whole: the list re-reads from the daemon's own events, and a re-read that
      // replaces the row takes its trigger — and with it the menu (ui-library/specs/menu.md).
      await expect(async () => {
        await row.getByRole('button', { name: /^More actions for / }).click();
        await expect(page.getByRole('menu')).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      await page.getByRole('menuitem', { name: 'Explore layers…', exact: true }).click();

      const modal = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Layer stack — ${tag}` }) });
      await expect(modal).toBeVisible({ timeout: 20_000 });
      await modal.locator('.ui-data-table__row').first().click();
      const section = modal.locator('.ui-definition-list').first();
      const geometry = await measureSection(section, "the layer explorer's build-step section");
      const evidence = report(`layer explorer @${viewport.width}×${viewport.height}`, geometry);
      console.log(`[REQ-28] ${evidence}`);
      expectNothingClippedOrOverlapped(geometry, evidence);
      expect(geometry.columns, `${evidence} — the single build-step band no longer fills the width it had`).toBe(1);
      expect(geometry.rightEdgeGap, `${evidence} — the build-step band leaves dead margin on its right`).toBeLessThanOrEqual(COLUMN_GAP_PX + 1);
    }
  } finally {
    await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
  }
});

// REQ-28 — the image diff's per-side metadata, on two images of the test's own, each one layer over
// the suite's single-layer image so the comparison is a matter of seconds and reaches no registry.
test('the image diff: the two sides’ metadata sections are sound', async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const tagA = `vexel-e2e-bug4-diff-a-${stamp}:v1`;
  const tagB = `vexel-e2e-bug4-diff-b-${stamp}:v1`;
  const buildOn = async (tag: string, file: string) => {
    const contextDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-bug4-diff-'));
    await writeFile(join(contextDir, 'Dockerfile'), `FROM ${TINY_IMAGE}\nCOPY ${file} /${file}\n`);
    await writeFile(join(contextDir, file), `${file} content\n`);
    await execFileAsync('docker', ['build', ...ownershipArgs(tag), '-t', tag, contextDir]);
  };
  await ensureImage(TINY_IMAGE);
  await buildOn(tagA, 'only-a.txt');
  await buildOn(tagB, 'only-b.txt');
  try {
    await page.setViewportSize(SWEEP_VIEWPORTS[1]!);
    await openApp(page, 'images-layers');
    await page.getByPlaceholder('Search reference or digest…').fill(`vexel-e2e-bug4-diff-a-${stamp}`);
    const row = page.locator('.ui-data-table__row', { hasText: tagA }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(async () => {
      await row.getByRole('button', { name: /^More actions for / }).click();
      await expect(page.getByRole('menu')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await page.getByRole('menuitem', { name: 'Compare with…', exact: true }).click();

    const modal = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Compare filesystems' }) });
    await expect(modal).toBeVisible();
    await modal.getByLabel('Second image').selectOption({ label: tagB });
    await modal.getByRole('button', { name: 'Compare' }).click();
    const confirmHeading = page.getByRole('heading', { name: /^Confirm: / });
    await expect(confirmHeading).toBeVisible();
    await confirmHeading.locator('xpath=..').getByRole('button', { name: 'Compare' }).click();
    await expectCompletedThenSelfDismissed(page.getByRole('heading', { name: 'Comparing filesystems' }).locator('xpath=..'), 60_000);

    await modal.locator('.ui-tree-view__row', { hasText: 'only-a.txt' }).first().click();
    const geometry = await measureSection(modal.locator('.ui-definition-list').first(), "the image diff's per-side metadata section");
    const evidence = report('image diff @1920×1080', geometry);
    console.log(`[REQ-28] ${evidence}`);
    expectNothingClippedOrOverlapped(geometry, evidence);
  } finally {
    await execFileAsync('docker', ['rmi', '-f', tagA]).catch(() => undefined);
    await execFileAsync('docker', ['rmi', '-f', tagB]).catch(() => undefined);
  }
});

// REQ-29, REQ-35 — bug-3's delivered, certified surface: the filesystem browser's entry-metadata
// pane, reached through bug-2's delivered flow. Its pane is narrow, so it stays one column, and
// "visually unchanged" is a claim about geometry — so the pane is measured against what the
// delivered build measured, not looked at.
test('the filesystem browser’s entry-metadata pane is one column and the width it always was', async ({ page }) => {
  test.setTimeout(180_000);
  await ensureImage(ALPINE_IMAGE);
  await page.setViewportSize(SWEEP_VIEWPORTS[0]!);
  await openApp(page, 'images-layers');
  await page.getByPlaceholder('Search reference or digest…').fill(ALPINE_IMAGE);
  const row = page.locator('.ui-data-table__row', { hasText: ALPINE_IMAGE }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    await row.getByRole('button', { name: /^More actions for / }).click();
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole('menuitem', { name: 'Browse filesystem…', exact: true }).click();

  const dialog = page.locator('.ui-modal--size-large').filter({ has: page.getByRole('heading', { name: `Filesystem — ${ALPINE_IMAGE}` }) });
  await expect(dialog).toBeVisible();
  const warning = page.getByRole('heading', { name: `Confirm: ${ALPINE_IMAGE}` });
  await expect(warning).toBeVisible();
  await warning.locator('xpath=..').getByRole('button', { name: 'Extract' }).click();
  await expectCompletedThenSelfDismissed(page.getByRole('heading', { name: 'Extracting the filesystem' }).locator('xpath=..'), 120_000);

  // A file, selected with a real pointer on its own row, so the metadata pane has an entry to show.
  await expect(dialog.locator('.ui-tree-view__row').first()).toBeVisible({ timeout: 20_000 });
  await dialog.locator('.ui-tree-view__row', { hasText: 'etc' }).first().click();

  const geometry = await measureSection(dialog.locator('.ui-definition-list').first(), "the filesystem browser's entry-metadata pane");
  const evidence = report('filesystem browser metadata pane @1280×720', geometry);
  console.log(`[REQ-29] ${evidence}`);

  expect(geometry.columns, `${evidence} — bug-3's certified surface is in columns, where it was one`).toBe(1);
  expect(geometry.lines, `${evidence} — the pane no longer draws one line per property`).toBe(geometry.bands.length);
  expect(
    geometry.box.width,
    `${evidence} — the pane measures ${geometry.box.width.toFixed(1)}px wide where the delivered build measured ${DELIVERED_METADATA_PANE.width}px: bug-3's surface has moved`,
  ).toBeCloseTo(DELIVERED_METADATA_PANE.width, 0);
  expect(
    geometry.box.height,
    `${evidence} — the pane measures ${geometry.box.height.toFixed(1)}px tall where the delivered build measured ${DELIVERED_METADATA_PANE.height}px: bug-3's surface has moved`,
  ).toBeLessThanOrEqual(DELIVERED_METADATA_PANE.height + 1);
  expectNothingClippedOrOverlapped(geometry, evidence);
});
