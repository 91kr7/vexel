import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import {
  COLUMN_GAP_PX,
  SHORT_SCALAR_RUN_MAX_PX,
  expectClearOfTransition,
  expectLinesReadAsLines,
  expectNothingClippedOrOverlapped,
  measureSection,
  report,
  valueWraps,
} from './support/property-bands.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

/**
 * **The image detail panel, measured** — the surface of the bug report itself.
 * REQ ids belong to `plan-docker_management_app-detail_property_columns`.
 *
 * The defect is that the section **does not respond to width at all**: nine
 * full-width bands, ~330px tall, the same at 1280px as at 2560px, each with its
 * label at one edge and its value a metre away. Every character on the surface is
 * identical before and after the correction, so nothing about presence, labels,
 * values or counts can certify it (REQ-40) — every assertion here is a measured
 * box, and the count is deduced from measured band positions (REQ-39).
 *
 * Every interaction is a **real pointer at the visible control's own
 * coordinates** (REQ-41): the image row's own cell, and a collapsible section's
 * own header. Never `element.click()`, never a dispatched event, never a hidden
 * target.
 *
 * The fixture is the suite's mirrored `alpine:3.20` — nine properties, a
 * 30-character `Created`, an em dash for `Entrypoint` — ensured from the run's
 * own registry and never from Docker Hub (REQ-44). It is shared infrastructure
 * the suite does not own, so nothing here removes it; the one test that needs a
 * value long enough to wrap adds a tag of its own and removes it in a `finally`.
 * No test assumes an empty daemon: each finds its own row through the screen's
 * search field.
 */

/**
 * The delivered build's own numbers, measured on it before this spec's
 * correction existed (2026-08-14, this environment): **343px, one column, nine
 * lines — identical at 1280 × 720, 1920 × 1080 and 2560 × 1440**, with the
 * `Created` band's label→value run measuring 886 / 1526 / 2166px at the three.
 *
 * The ceilings are stated against the plan's ~330px, which is also the band-step
 * arithmetic (nine bands at the delivered 37px step), because it is the stricter
 * of the two figures — a ceiling computed from the 343px actually measured would
 * be 3.9% more generous at every viewport.
 */
const DELIVERED_SECTION_HEIGHT_PX = 330;
const HEIGHT_CEILINGS = [
  { viewport: { width: 1280, height: 720 }, fraction: 0.65 },
  { viewport: { width: 1920, height: 1080 }, fraction: 0.45 },
  { viewport: { width: 2560, height: 1440 }, fraction: 0.35 },
];

/**
 * Viewports chosen so the **measured** section width lands comfortably inside a
 * band rather than on a transition; the width each produced when this spec was
 * written is recorded beside it, and the spec asserts the measurement rather than
 * trusting it. The frame takes ~330px of any viewport below 1024px (a 220px
 * rail) and ~370px above it (a 260px rail).
 */
const COUNT_CASES = [
  { viewport: { width: 930, height: 800 }, expectedWidth: 600, columns: 1 },
  { viewport: { width: 1270, height: 800 }, expectedWidth: 900, columns: 2 },
  { viewport: { width: 1670, height: 900 }, expectedWidth: 1300, columns: 3 },
  { viewport: { width: 2070, height: 900 }, expectedWidth: 1700, columns: 4 },
];

/** The four widths the sweep for clipping and overlap is run at (REQ-24). */
const CLIPPING_VIEWPORTS = [
  { width: 720, height: 800 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

function imageRow(page: Page, text: string): Locator {
  return page.locator('.ui-data-table__row', { hasText: text }).first();
}

/** The panel's own property section: the first definition list inside the expanded detail panel. */
function propertySection(page: Page): Locator {
  return page.locator('.ui-detail-panel .ui-definition-list').first();
}

/**
 * Opens the panel the way the operator does: the row's own first cell, clicked
 * with a real pointer at its own coordinates (REQ-41). The action area swallows
 * its own clicks, so the first cell is the one an operator aims at.
 */
async function openImagePanel(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await page.setViewportSize(viewport);
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
  // The operator's own daemon holds images of their own: the row is found, never assumed to be the
  // only one or the first one (REQ-44).
  await page.getByPlaceholder('Search reference or digest…').fill(ALPINE_IMAGE);
  const row = imageRow(page, ALPINE_IMAGE);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator('.ui-data-table__cell').first().click();
  await expect(propertySection(page)).toBeVisible({ timeout: 20_000 });
}

/**
 * A collapsible section, located by its own title rather than by the header
 * button's accessible name — which carries the chevron glyph beside the title
 * and so does not start with it.
 */
function collapsibleSection(page: Page, title: string): Locator {
  return page
    .locator('.ui-detail-panel .ui-collapsible-section')
    .filter({ has: page.locator('.ui-collapsible-section__title', { hasText: new RegExp(`^${title}$`) }) })
    .first();
}

/** Opens one with a real pointer on its own header, and returns the list inside it (REQ-41). */
async function openCollapsibleSection(page: Page, title: string): Promise<Locator> {
  const section = collapsibleSection(page, title);
  await expect(section, `the ${title} section is not on the panel`).toBeVisible();
  await section.locator('.ui-collapsible-section__header').click();
  return section.locator('.ui-definition-list').first();
}

// (a) REQ-20, REQ-2, REQ-39 — the count follows the section's own measured width, at four widths
// separated by whole bands. A count written into feature code fails three of these four.
test('shows one, two, three and four columns as its own measured width grows', async ({ page }) => {
  const measured: string[] = [];
  for (const singleCase of COUNT_CASES) {
    await openImagePanel(page, singleCase.viewport);
    const geometry = await measureSection(propertySection(page), 'the image panel property section');
    const evidence = report(`viewport ${singleCase.viewport.width}×${singleCase.viewport.height}`, geometry);
    measured.push(evidence);

    // Asserting on a transition is asserting on a rounding rule: the run fails rather than passing
    // for the wrong reason.
    expectClearOfTransition(geometry.box.width, evidence);
    expect(geometry.box.width, `${evidence} — the section did not measure the width this case was chosen for (${singleCase.expectedWidth}px)`).toBeGreaterThan(
      singleCase.expectedWidth - 60,
    );
    expect(geometry.columns, `${evidence} — expected exactly ${singleCase.columns} column(s) at a measured width of ${geometry.box.width.toFixed(1)}px`).toBe(singleCase.columns);
  }
  // The numbers are the evidence, whether the run passes or fails (REQ-42).
  console.log(`[REQ-20] ${measured.join('\n[REQ-20] ')}`);
});

// (b) REQ-21 — height against the delivered build's at the same viewport. Delivered: 343px measured,
// ~330px by the band-step arithmetic, at all three viewports alike.
test('measures at most 65% / 45% / 35% of the delivered height at 1280, 1920 and 2560', async ({ page }) => {
  const measured: string[] = [];
  for (const ceiling of HEIGHT_CEILINGS) {
    await openImagePanel(page, ceiling.viewport);
    const geometry = await measureSection(propertySection(page), 'the image panel property section');
    const evidence = report(`viewport ${ceiling.viewport.width}×${ceiling.viewport.height}`, geometry);
    measured.push(evidence);
    const bound = DELIVERED_SECTION_HEIGHT_PX * ceiling.fraction;
    expect(
      geometry.box.height,
      `${evidence} — the section measures ${geometry.box.height.toFixed(1)}px, over the ${bound.toFixed(1)}px ceiling (${ceiling.fraction * 100}% of the delivered ${DELIVERED_SECTION_HEIGHT_PX}px, which the delivered build measured identically at all three viewports)`,
    ).toBeLessThanOrEqual(bound);
  }
  console.log(`[REQ-21] ${measured.join('\n[REQ-21] ')}`);
});

// (c) REQ-23 — the cleanest red available: on the delivered build the height and the count are
// *identical* at 1280 and at 2560. Not "smaller than a ceiling" — strictly less, and strictly more.
test('is shorter and wider-spread at 2560 × 1440 than at 1280 × 720, instead of identical', async ({ page }) => {
  await openImagePanel(page, { width: 1280, height: 720 });
  const narrow = await measureSection(propertySection(page), 'the image panel property section');
  const narrowEvidence = report('1280 × 720', narrow);

  await openImagePanel(page, { width: 2560, height: 1440 });
  const wide = await measureSection(propertySection(page), 'the image panel property section');
  const wideEvidence = report('2560 × 1440', wide);
  console.log(`[REQ-23] ${narrowEvidence}\n[REQ-23] ${wideEvidence}`);

  expect(wide.box.height, `${narrowEvidence} / ${wideEvidence} — the section is not shorter on the bigger screen`).toBeLessThan(narrow.box.height);
  expect(wide.columns, `${narrowEvidence} / ${wideEvidence} — the section does not carry more columns on the bigger screen`).toBeGreaterThan(narrow.columns);
});

// (d) REQ-1 — the empty middle. Delivered: 886 / 1526 / 2166px from the `Created` label's left edge
// to its value's right edge, at the three viewports.
test('keeps every label→value run within a hand’s width, at every width', async ({ page }) => {
  const measured: string[] = [];
  for (const viewport of CLIPPING_VIEWPORTS) {
    await openImagePanel(page, viewport);
    const geometry = await measureSection(propertySection(page), 'the image panel property section');
    const evidence = report(`viewport ${viewport.width}×${viewport.height}`, geometry);
    const created = geometry.bands.find((band) => band.label.startsWith('Created'));
    measured.push(`${evidence} — Created run ${created?.run?.toFixed(1) ?? 'not measured'}px`);
    expect(created, `${evidence} — the section draws no \`Created\` band, and the report's own measurement is taken on it`).toBeDefined();
    for (const band of geometry.bands) {
      expect
        .soft(band.run ?? 0, `${evidence} — the \`${band.label}\` band's label→value run measures ${(band.run ?? 0).toFixed(1)}px, over the ${SHORT_SCALAR_RUN_MAX_PX}px bound`)
        .toBeLessThanOrEqual(SHORT_SCALAR_RUN_MAX_PX);
    }
  }
  console.log(`[REQ-1] ${measured.join('\n[REQ-1] ')}`);
});

// (e) REQ-24, REQ-8 — nothing clipped, nothing overlapped, at four widths, and (h) REQ-11 — the
// section fills the width it is given: no dead margin re-appearing on the right.
test('clips nothing, overlaps nothing and leaves no dead margin, at 720 / 1280 / 1920 / 2560', async ({ page }) => {
  const measured: string[] = [];
  for (const viewport of CLIPPING_VIEWPORTS) {
    await openImagePanel(page, viewport);
    const geometry = await measureSection(propertySection(page), 'the image panel property section');
    const evidence = report(`viewport ${viewport.width}×${viewport.height}`, geometry);
    measured.push(evidence);
    expectNothingClippedOrOverlapped(geometry, evidence);
    expect(geometry.rightEdgeGap, `${evidence} — ${geometry.rightEdgeGap.toFixed(1)}px of the section's width is left empty on the right, over the one-gap bound`).toBeLessThanOrEqual(
      COLUMN_GAP_PX + 1,
    );
  }
  console.log(`[REQ-24] ${measured.join('\n[REQ-24] ')}`);
});

// (f) REQ-9 — a line reads as a line, checked with a value long enough to wrap: a wrapped two-line
// value must not leave its neighbours as short pills against a tall one. The fixture's own values
// are all short, so this test makes one long, on a tag of its own, and removes it in a `finally`.
test('keeps the bands of one line at one height, with a wrapped value present', async ({ page }) => {
  await ensureImage(ALPINE_IMAGE);
  // Long enough to pass the ~500px run bound in a ~420px band and therefore to wrap (REQ-8).
  const longTag = `vexel-e2e-bug4-a-deliberately-long-image-reference-for-the-wrapping-check-${Date.now()}:v1`;
  await execFileAsync('docker', ['tag', ALPINE_IMAGE, longTag]);
  try {
    await openImagePanel(page, { width: 2560, height: 1440 });
    const geometry = await measureSection(propertySection(page), 'the image panel property section');
    const evidence = report('2560 × 1440 with a wrapping value', geometry);
    console.log(`[REQ-9] ${evidence}`);

    // A band holding a control is legitimately taller than its neighbours, so the wrap is measured
    // on the value itself, against the label beside it.
    const wrapped = geometry.bands.filter(valueWraps);
    expect(wrapped.map((band) => band.label), `${evidence} — no value wrapped, so this check would certify nothing: the long tag did not reach the panel`).not.toEqual([]);
    expectLinesReadAsLines(geometry, evidence);
    // Beside the geometry, never instead of it (REQ-40): the long value is present in full, not
    // truncated to make it fit.
    await expect(propertySection(page)).toContainText(longTag.split(':')[0]!);
    expectNothingClippedOrOverlapped(geometry, evidence);
  } finally {
    await execFileAsync('docker', ['rmi', '-f', longTag]).catch(() => undefined);
  }
});

// (g) REQ-10, REQ-14 — reading order preserved, deduced from measured positions, and the accessible
// order is the same one: a grid reading left-to-right visually while its markup reads column-first
// is a functional regression invisible in every screenshot.
test('fills left to right then down, and hands assistive technology that same order', async ({ page }) => {
  await openImagePanel(page, { width: 1920, height: 1080 });
  const geometry = await measureSection(propertySection(page), 'the image panel property section');
  const evidence = report('1920 × 1080', geometry);
  console.log(`[REQ-10] ${evidence} — positional order [${geometry.positionalOrder.join(', ')}]`);

  expect(geometry.positionalOrder, `${evidence} — the order the positions read is not the order the markup declares`).toEqual(geometry.documentOrder);
  expect(geometry.positionalOrder[0], `${evidence} — \`Id\` is no longer the first band`).toBe('Id');
  expect(geometry.positionalOrder.at(-1), `${evidence} — \`Exposed ports\` is no longer the last band`).toBe('Exposed ports');

  // Beside the geometry (REQ-40): the `Id` band holds its value and nothing else. **Inverted, not
  // deleted** — this asserted that a copy affordance *was* inside the band, under REQ-32's fence
  // reserving it for bug-5; bug-5 removed it on 2026-08-14, so the record of what changed lives in
  // the check itself (plan-docker_management_app-remove_copy_controls/REQ-24).
  const idBand = propertySection(page).locator('.ui-definition-list__row').filter({ hasText: 'Id' }).first();
  await expect(idBand.locator('.ui-definition-list__value')).toBeVisible();
  await expect(idBand.getByRole('button')).toHaveCount(0);
});

// (i) REQ-16 — the collapsible sections follow the same rule, each by its own content class, and
// none of them changes its default open/closed state.
//
// **The `Environment` comparison below is degenerate on this fixture, and the load-bearing
// measurement for REQ-16 is not here.** `alpine:3.20` declares one environment value and no labels,
// so what is measured is a one-band section — which is one column on any build, content class
// honoured or ignored. `property-columns-rule.spec.ts` carries the real case, on an image built with
// eight long environment values and six long labels, where the class shows as 2 columns against the
// properties' 4. What stays useful here is the `History` half and the open/closed states, which this
// fixture does exhibit.
test('arranges Environment by its own class and keeps History one entry per line at full width', async ({ page }) => {
  await openImagePanel(page, { width: 1920, height: 1080 });
  const properties = await measureSection(propertySection(page), 'the image panel property section');

  // Closed by default, and still closed: what had to be opened was not open already (REQ-16).
  await expect(page.locator('.ui-detail-panel .ui-definition-list')).toHaveCount(1);

  const environment = await openCollapsibleSection(page, 'Environment');
  const environmentGeometry = await measureSection(environment, 'the Environment section');
  const environmentEvidence = report('Environment at 1920 × 1080', environmentGeometry);

  const history = await openCollapsibleSection(page, 'History');
  const historyGeometry = await measureSection(history, 'the History section');
  const historyEvidence = report('History at 1920 × 1080', historyGeometry);
  console.log(`[REQ-16] ${report('properties', properties)}\n[REQ-16] ${environmentEvidence}\n[REQ-16] ${historyEvidence}`);

  // Longer values, so fewer of them fit at the same section width.
  expect(
    environmentGeometry.columns,
    `${environmentEvidence} — Environment shows as many columns as the short-scalar section at the same width (${properties.columns}), so its content class is not being honoured`,
  ).toBeLessThan(properties.columns);

  // A Dockerfile instruction against a timestamp label is not a column (REQ-16).
  expect(historyGeometry.columns, `${historyEvidence} — History is in columns, where it must stay one entry per line`).toBe(1);
  expect(historyGeometry.lines, `${historyEvidence} — History does not draw one line per entry`).toBe(historyGeometry.bands.length);
  expect(historyGeometry.rightEdgeGap, `${historyEvidence} — History no longer occupies the full width it had`).toBeLessThanOrEqual(COLUMN_GAP_PX + 1);

  expectNothingClippedOrOverlapped(environmentGeometry, environmentEvidence);
  expectNothingClippedOrOverlapped(historyGeometry, historyEvidence);

  // `alpine:3.20` declares no labels of its own, so the panel draws **no** Labels section at all
  // (`plan-ui-coherence-optimisation/REQ-60`): a section with a count of `0` is absent rather than
  // present-and-empty. **Inverted, not deleted** — this asserted the empty section was visible and
  // opened it, which is what the delivered build drew until 2026-08-15. Its arrangement is measured
  // on the container panel, whose fixture carries labels of the suite's own.
  await expect(collapsibleSection(page, 'Labels'), 'an empty Labels section is still drawn on the panel').toHaveCount(0);
});

// (j) REQ-12, REQ-7 — the narrow end, where a columns fix breaks and nobody looks: below the
// library's existing 720px breakpoint the section is one column and is exactly what is delivered.
test('is a single column below the 720px breakpoint, exactly as delivered', async ({ page }) => {
  await openImagePanel(page, { width: 720, height: 800 });
  const geometry = await measureSection(propertySection(page), 'the image panel property section');
  const evidence = report('720 × 800', geometry);
  console.log(`[REQ-12] ${evidence}`);

  expect(geometry.columns, `${evidence} — the section is in columns at a width where the delivered build is one`).toBe(1);
  expect(geometry.lines, `${evidence} — the section does not draw one line per property, as the delivered build does at this width`).toBe(geometry.bands.length);
  // Nothing wraps that did not wrap on the delivered build. Measured on the values themselves,
  // which is now belt and braces rather than a necessity: while this spec was written the `Id` band
  // measured 43px against its neighbours' 33px because it held the copy control, so a band-height
  // comparison would have read that as a wrap and called the delivered presentation a regression
  // against itself. That control left on 2026-08-14 and every band is 33px
  // (plan-docker_management_app-remove_copy_controls/REQ-14) — the value-line measurement stays
  // because it is the correct definition of "the value wrapped" whatever a band happens to hold.
  const wrapped = geometry.bands.filter(valueWraps);
  expect(wrapped.map((band) => band.label), `${evidence} — ${wrapped.length} value(s) wrap here, where the delivered build wraps none`).toEqual([]);
  expectNothingClippedOrOverlapped(geometry, evidence);
});
