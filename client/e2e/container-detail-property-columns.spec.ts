import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import {
  COLUMN_GAP_PX,
  expectNothingClippedOrOverlapped,
  measureEntries,
  measureSection,
  measureValueBands,
  report,
} from './support/property-bands.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

/**
 * **The container detail panel, measured** — the other half of what the human
 * reported. REQ ids belong to `plan-docker_management_app-detail_property_columns`.
 *
 * Two things are checked here that the image panel cannot check:
 *
 * - **The `Config` tab fails a viewport-keyed implementation** (REQ-4). Its
 *   runtime-configuration list sits at half the panel while the `Inspect` tab's
 *   sits at the whole of it, at the **same viewport** — so a count keyed to the
 *   window is necessarily wrong for one of the two, and wrong on the narrow one,
 *   which is where a too-high count clips. This is the second-likeliest wrong fix
 *   and it reads correct in review, because the human said "based on the device
 *   size".
 * - **The `Config` tab's own two-column split** (REQ-18): the mocked shape at
 *   desktop widths, stacking below the narrow breakpoint instead of handing each
 *   side ~180px, and its environment · mounts list arranging itself by the width
 *   its own column has (REQ-19).
 *
 * The editing form is **not opened and not touched** (REQ-34): this report is
 * about the read view.
 *
 * The fixture is a container created (never started) from the suite's own
 * `vexel-test-tiny:1`, carrying the ownership labels, with environment of its own
 * so the environment · mounts list has something to arrange, and removed with
 * `docker rm -fv` in a `finally` (REQ-44). Every interaction is a real pointer at
 * the visible control's coordinates: the row's first cell, and the tab's own
 * control (REQ-41).
 */

/**
 * The delivered build's own numbers, measured on it before the correction existed
 * (2026-08-14, this environment): the `Inspect` tab's ten properties measured
 * **390px, one column, ten lines at 1280 × 720, 1920 × 1080 and 2560 × 1440
 * alike**; the `Config` tab's runtime list 220px and one column at all three,
 * its column measuring 443 / 763 / 1083px; and its environment · mounts list
 * **one entry per line at every one of the three**.
 *
 * The ceilings are stated against the plan's ~366px — ten bands at the delivered
 * 37px step — because it is the stricter of the two figures.
 */
const DELIVERED_INSPECT_HEIGHT_PX = 366;
const HEIGHT_CEILINGS = [
  { viewport: { width: 1280, height: 720 }, fraction: 0.65 },
  { viewport: { width: 1920, height: 1080 }, fraction: 0.45 },
  { viewport: { width: 2560, height: 1440 }, fraction: 0.35 },
];

const CLIPPING_VIEWPORTS = [
  { width: 720, height: 800 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

/**
 * Two environment lines of the shape the long-single-line class exists for — a
 * PATH-style value past 60 characters, and a short one. `vexel-test-tiny:1` is
 * built `FROM scratch` and declares none of its own, so what the panel shows is
 * exactly what the fixture states.
 */
const FIXTURE_ENV = ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NODE_ENV=production'];

function containerRow(page: Page, name: string): Locator {
  return page.locator('.ui-data-table__row', { hasText: name }).first();
}

/** The first definition list of the open panel: the runtime list on Config, the ten properties on Inspect. */
function firstSection(page: Page): Locator {
  return page.locator('.ui-detail-panel .ui-definition-list').first();
}

async function createFixtureContainer(name: string): Promise<void> {
  // Ensured at the point of use, not once for the run: the exclusive project prunes the host, so an
  // image present at global setup may be gone by now. Locally built, so putting it back costs a
  // second and no network (REQ-44).
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', [
    'create',
    '--name',
    name,
    ...ownershipArgs(name),
    '--label',
    'org.opencontainers.image.description=a label value long enough to belong to the long-single-line class',
    ...FIXTURE_ENV.flatMap((entry) => ['-e', entry]),
    TINY_IMAGE,
  ]);
}

async function removeFixtureContainer(name: string): Promise<void> {
  // `-v` and not just `-f`: without it an image's anonymous volumes outlive the container carrying
  // no label of ours, invisible to any later sweep.
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** Opens the panel on the row the test created, with a real pointer on the row's own first cell. */
async function openContainerPanel(page: Page, name: string, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  const row = containerRow(page, name);
  await expect(row, 'the fixture container never appeared in the list').toBeVisible({ timeout: 20_000 });
  await row.locator('.ui-data-table__cell').first().click();
  await expect(firstSection(page)).toBeVisible({ timeout: 20_000 });
}

/**
 * The Config tab's two-column split. Located by the grid element itself and not
 * by the named arrangement's own class: the element is the same one before this
 * batch's correction and after it, so the check can be red on the delivered
 * build instead of merely failing to find anything there.
 */
function configSplit(page: Page): Locator {
  return page.locator('.ui-detail-panel .ui-grid').first();
}

/**
 * The environment · mounts entries themselves — the pills an operator counts per
 * line. Measured directly rather than through whatever element holds them, for
 * the same reason.
 */
function environmentEntries(page: Page): Locator {
  return page.locator('.ui-detail-panel .ui-table-meta-cell');
}

/** A tab of the open panel, selected with a real pointer at its own coordinates (REQ-41). */
async function selectTab(page: Page, label: string): Promise<void> {
  await page.locator('.ui-detail-panel').getByRole('tab', { name: label, exact: true }).click();
  await expect(firstSection(page)).toBeVisible({ timeout: 20_000 });
}

// REQ-22, REQ-23, REQ-20 — the ten properties on the same rule as the image panel's nine: the count
// follows the section's own measured width, and the height clears the three ceilings against the
// delivered build's own 390px, which it measured identically at all three viewports.
test('Inspect: the ten properties spread with the width and clear the three height ceilings', async ({ page }) => {
  const name = `vexel-e2e-bug4-inspect-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    const measured: string[] = [];
    let narrow: Awaited<ReturnType<typeof measureSection>> | undefined;
    let wide: Awaited<ReturnType<typeof measureSection>> | undefined;

    for (const ceiling of HEIGHT_CEILINGS) {
      await openContainerPanel(page, name, ceiling.viewport);
      await selectTab(page, 'Inspect');
      const geometry = await measureSection(firstSection(page), 'the Inspect tab property section');
      const evidence = report(`Inspect at ${ceiling.viewport.width}×${ceiling.viewport.height}`, geometry);
      measured.push(evidence);

      const bound = DELIVERED_INSPECT_HEIGHT_PX * ceiling.fraction;
      expect(
        geometry.box.height,
        `${evidence} — the section measures ${geometry.box.height.toFixed(1)}px, over the ${bound.toFixed(1)}px ceiling (${ceiling.fraction * 100}% of the delivered ${DELIVERED_INSPECT_HEIGHT_PX}px, which the delivered build measured identically at all three viewports)`,
      ).toBeLessThanOrEqual(bound);
      // No transition guard here, and deliberately: what this test asserts is a **height** against
      // the delivered build's, at the three viewports the requirement names. The guard belongs to a
      // count assertion, where landing on a transition would make it an assertion about a rounding
      // rule — and 1920 × 1080 puts this section at 1550px, 38px past the 1512px transition.
      expectNothingClippedOrOverlapped(geometry, evidence);

      if (ceiling.viewport.width === 1280) narrow = geometry;
      if (ceiling.viewport.width === 2560) wide = geometry;
    }
    console.log(`[REQ-22] ${measured.join('\n[REQ-22] ')}`);

    // REQ-23 — on the delivered build these two are identical, which is the red.
    expect(wide!.box.height, 'the Inspect section is not shorter at 2560 × 1440 than at 1280 × 720').toBeLessThan(narrow!.box.height);
    expect(wide!.columns, 'the Inspect section does not carry more columns at 2560 × 1440 than at 1280 × 720').toBeGreaterThan(narrow!.columns);
  } finally {
    await removeFixtureContainer(name);
  }
});

// REQ-4 — the check that fails a viewport-keyed implementation: two sections, one viewport, one
// panel, one tab click apart — one at half the panel and one at the whole of it — showing different
// counts, both deduced from measured band positions.
test('Config and Inspect show different counts at one viewport, because the width that decides is each section’s own', async ({ page }) => {
  const name = `vexel-e2e-bug4-halves-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    // 1920 × 1080 throughout: the viewport never changes between the two measurements, so a rule
    // keyed to it could not produce two different counts.
    await openContainerPanel(page, name, { width: 1920, height: 1080 });
    const half = await measureSection(firstSection(page), 'the Config tab runtime-configuration section');
    const halfEvidence = report('Config runtime configuration at 1920 × 1080', half);

    await selectTab(page, 'Inspect');
    const full = await measureSection(firstSection(page), 'the Inspect tab property section');
    const fullEvidence = report('Inspect at 1920 × 1080', full);
    console.log(`[REQ-4] ${halfEvidence}\n[REQ-4] ${fullEvidence}`);

    expect(half.box.width, `${halfEvidence} / ${fullEvidence} — the two sections are the same width, so this comparison would prove nothing`).toBeLessThan(full.box.width - 200);
    expect(
      half.columns,
      `${halfEvidence} / ${fullEvidence} — both sections show ${half.columns} column(s) at one viewport, which is what a rule keyed to the window produces`,
    ).not.toBe(full.columns);
  } finally {
    await removeFixtureContainer(name);
  }
});

// REQ-18 — the Config tab's own split: the mocked two columns at desktop widths, stacked below the
// narrow breakpoint with each column at full width rather than ~180px each.
test('Config: two equal columns at desktop widths, stacked at full width below 720px', async ({ page }) => {
  const name = `vexel-e2e-bug4-split-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    await openContainerPanel(page, name, { width: 1280, height: 720 });
    const desktop = await measureValueBands(configSplit(page), "the Config tab's two-column split");
    console.log(`[REQ-18] desktop 1280×720: split ${desktop.box.width.toFixed(1)}px, columns [${desktop.bands.map((band) => band.width.toFixed(1)).join(', ')}], ${desktop.perLine} per line`);
    expect(desktop.perLine, 'the Config tab is not two columns at a desktop width, where its mockup is').toBe(2);
    const [left, right] = desktop.bands;
    expect(Math.abs(left!.width - right!.width), 'the two columns of the Config tab are not equal').toBeLessThanOrEqual(2);

    await openContainerPanel(page, name, { width: 700, height: 900 });
    const narrow = await measureValueBands(configSplit(page), "the Config tab's two-column split");
    console.log(`[REQ-18] narrow 700×900: split ${narrow.box.width.toFixed(1)}px, columns [${narrow.bands.map((band) => band.width.toFixed(1)).join(', ')}], ${narrow.perLine} per line`);
    expect(narrow.perLine, 'the Config tab keeps two columns below the narrow breakpoint, where each side is squeezed to ~180px').toBe(1);
    for (const column of narrow.bands) {
      expect(column.width, `a stacked column measures ${column.width.toFixed(1)}px instead of the split's full ${narrow.box.width.toFixed(1)}px`).toBeGreaterThanOrEqual(narrow.box.width - 2);
    }
  } finally {
    await removeFixtureContainer(name);
  }
});

// REQ-19 — the environment · mounts list, measured where the count actually changes. The delivered
// build shows one entry per row at every width; the correction is a wide-screen one, and that is
// honest rather than a shortfall: the column is ~763px at 1920, which is legitimately one entry, and
// ~1083px at 2560, which is two.
test('Config: the environment · mounts entries flow by their own column’s width', async ({ page }) => {
  const name = `vexel-e2e-bug4-env-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    await openContainerPanel(page, name, { width: 1920, height: 1080 });
    const atWide = await measureEntries(environmentEntries(page), 'the environment · mounts list');
    console.log(`[REQ-19] 1920×1080: entries spread over ${atWide.spread.toFixed(1)}px, ${atWide.perLine} per line over ${atWide.lines} line(s)`);
    expect(atWide.boxes.length, 'the environment · mounts list draws none of the fixture’s own entries').toBe(FIXTURE_ENV.length);

    await openContainerPanel(page, name, { width: 2560, height: 1440 });
    const atWider = await measureEntries(environmentEntries(page), 'the environment · mounts list');
    console.log(`[REQ-19] 2560×1440: entries spread over ${atWider.spread.toFixed(1)}px, ${atWider.perLine} per line over ${atWider.lines} line(s)`);

    expect(
      atWider.perLine,
      `the environment · mounts entries span ${atWider.spread.toFixed(1)}px at 2560 × 1440 and still sit ${atWider.perLine} per line, exactly as the delivered build does at every width`,
    ).toBeGreaterThan(atWide.perLine);

    // Beside the geometry (REQ-40, REQ-31): the entries keep their wording and their values in full.
    for (const entry of FIXTURE_ENV) await expect(page.locator('.ui-detail-panel')).toContainText(entry);

    // REQ-34 — the editing form was never opened, and this states it: the read view's own action is
    // still there, unpressed.
    await expect(page.locator('.ui-detail-panel').getByRole('button', { name: 'Edit configuration' })).toBeVisible();
  } finally {
    await removeFixtureContainer(name);
  }
});

// REQ-17, REQ-24, REQ-12 — the Inspect tab's collapsible sections and the whole panel free of
// clipping and overlap at the four widths, the narrow end included.
//
// **Of the three sections REQ-17 names, this fixture exhibits only `Labels`**, and the title says so:
// the container is created and never started, so it has joined no network and declares no health
// check, and `Networks` and `Health` hold nothing to arrange. `property-columns-rule.spec.ts`
// measures all three on a fixture that has them. The title used to name the three and measure one;
// it was renamed to what it measures, because a title claiming more than its assertion is the same
// defect as a fixture that cannot fail, and the comment withdrawing the claim only hid it.
//
// REQ-7's degrading case — a minimum wider than the container it is given — is likewise **not**
// asserted here and is not reachable from any viewport this file uses: it lives in that same spec,
// on a section constrained to ~400px.
test('Inspect: the tab’s property section and its Labels section follow the rule, and nothing clips at 720 / 1280 / 1920 / 2560', async ({ page }) => {
  const name = `vexel-e2e-bug4-sections-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    const measured: string[] = [];
    for (const viewport of CLIPPING_VIEWPORTS) {
      await openContainerPanel(page, name, viewport);
      await selectTab(page, 'Inspect');
      const geometry = await measureSection(firstSection(page), 'the Inspect tab property section');
      const evidence = report(`Inspect at ${viewport.width}×${viewport.height}`, geometry);
      measured.push(evidence);
      expectNothingClippedOrOverlapped(geometry, evidence);
      expect(geometry.rightEdgeGap, `${evidence} — ${geometry.rightEdgeGap.toFixed(1)}px of dead margin on the right`).toBeLessThanOrEqual(COLUMN_GAP_PX + 1);
      if (viewport.width === 720) {
        expect(geometry.columns, `${evidence} — the section is in columns below the 720px breakpoint, where the delivered build is one`).toBe(1);
      }
    }
    console.log(`[REQ-24] ${measured.join('\n[REQ-24] ')}`);

    // The Labels section, on a fixture that carries a label long enough to belong to its class.
    await openContainerPanel(page, name, { width: 1920, height: 1080 });
    await selectTab(page, 'Inspect');
    const properties = await measureSection(firstSection(page), 'the Inspect tab property section');
    // Located by its own title: the header button's accessible name carries the chevron glyph too.
    const labelsSection = page
      .locator('.ui-detail-panel .ui-collapsible-section')
      .filter({ has: page.locator('.ui-collapsible-section__title', { hasText: /^Labels$/ }) })
      .first();
    await labelsSection.locator('.ui-collapsible-section__header').click();
    const labels = labelsSection.locator('.ui-definition-list').first();
    const labelsGeometry = await measureSection(labels, 'the Labels section');
    const labelsEvidence = report('Labels at 1920 × 1080', labelsGeometry);
    console.log(`[REQ-17] ${report('properties', properties)}\n[REQ-17] ${labelsEvidence}`);
    expectNothingClippedOrOverlapped(labelsGeometry, labelsEvidence);
    expect(
      labelsGeometry.columns,
      `${labelsEvidence} — Labels shows as many columns as the short-scalar section at the same width (${properties.columns}), so its content class is not being honoured`,
    ).toBeLessThan(properties.columns);
  } finally {
    await removeFixtureContainer(name);
  }
});
