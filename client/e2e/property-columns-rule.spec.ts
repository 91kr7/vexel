import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

/**
 * **The rule itself, measured a second way.** REQ ids belong to
 * `plan-docker_management_app-detail_property_columns`.
 *
 * The specs beside this one measure the two reported surfaces at the viewports
 * the requirement names. This one measures **the rule they are supposed to be an
 * instance of**, and it does so with a measurement of its own — its own boxes,
 * its own line-box count, its own calibration of the viewport onto a stated
 * section width — so that a shared helper that measured the wrong thing could not
 * make both agree.
 *
 * Three of its cases exist because they are the ones a check written per viewport
 * cannot state:
 *
 * - **The section width is calibrated, not hoped for** (REQ-20). The requirement
 *   states counts at 600 / 900 / 1300 / 1700px **of section**, and the viewport
 *   that produces each is a fact about the frame, not about the rule: it is
 *   measured, corrected and re-measured until the section is within 20px of the
 *   width the requirement names.
 * - **The count never falls as the section widens** (REQ-2), which is a statement
 *   about the whole interval and not about four points on it: the window is swept
 *   from 2560 down to 720 and every step is measured.
 * - **A ~400px section** (REQ-24, REQ-7), which is the width the caller-stated
 *   surfaces already misbehave at, and which no viewport of the two reported
 *   panels produces: the daemon cards of `System & prune` and `Contexts` are that
 *   width at an ordinary window.
 *
 * Everything asserted here is a box the browser reports, and the count is deduced
 * from measured band tops — bands sharing a top edge are one line — never from a
 * class, an attribute or a prop (REQ-39). Content assertions stand beside them and
 * never instead of them (REQ-40). Every interaction is a real pointer at the
 * visible control's own coordinates (REQ-41).
 *
 * The one fixture it creates — a tag long enough to make a value wrap — is
 * removed in a `finally`; the image it is a tag of is the suite's mirrored
 * `alpine:3.20`, which no test here removes and no test here pulls from Docker
 * Hub (REQ-44). Nothing assumes an empty daemon: the row is searched for.
 */

/** The gap between bands, `--space-6` (batches.md), and the short-scalar minimum band width (REQ-3). */
const COLUMN_GAP_PX = 24;
const SHORT_SCALAR_MIN_PX = 360;

/** The count the arithmetic of the plan states for a short-scalar section of a given width. */
function derivedColumns(sectionWidth: number): number {
  return Math.max(1, Math.floor((sectionWidth + COLUMN_GAP_PX) / (SHORT_SCALAR_MIN_PX + COLUMN_GAP_PX)));
}

/**
 * The widths at which a short-scalar section gains a column — 744 / 1128 / 1512px
 * and onwards, from the same arithmetic — and the clearance a count needs from
 * one: asserting on a transition is asserting on a rounding rule.
 */
const TRANSITIONS_PX = Array.from({ length: 7 }, (_, index) => (index + 2) * (SHORT_SCALAR_MIN_PX + COLUMN_GAP_PX) - COLUMN_GAP_PX);
const TRANSITION_CLEARANCE_PX = 40;

function onATransition(width: number): boolean {
  return TRANSITIONS_PX.some((transition) => Math.abs(width - transition) < TRANSITION_CLEARANCE_PX);
}

/** The widths of section the requirement states a count for, and the count it states. */
const STATED_WIDTHS = [
  { sectionWidth: 600, columns: 1 },
  { sectionWidth: 900, columns: 2 },
  { sectionWidth: 1300, columns: 3 },
  { sectionWidth: 1700, columns: 4 },
];

interface Band {
  label: string;
  top: number;
  left: number;
  right: number;
  bottom: number;
  height: number;
  /** How many line boxes the value is drawn over: 2 or more is a wrapped value, measured rather than inferred. */
  valueLines: number;
  valueInsideBand: boolean;
  labelOverValue: boolean;
  insideSection: boolean;
  hasLabel: boolean;
  hasValue: boolean;
}

interface Measurement {
  width: number;
  height: number;
  bands: Band[];
  columns: number;
  lines: number;
  /** From the rightmost band's right edge to the section's own (REQ-11). */
  rightEdgeGap: number;
  /** The band heights of each line, in order: a line reads as a line only if its heights are one (REQ-9). */
  heightsByLine: number[][];
  insideContainer: boolean;
}

/**
 * One property section, measured in a single pass so that every number belongs to
 * the same layout. Written here rather than taken from the shared helper: two
 * measurements of the same surface that agree are evidence, and one measurement
 * used twice is not.
 */
async function measure(section: Locator): Promise<Measurement> {
  await expect(section, 'the section is not on screen, so nothing about its arrangement can be measured').toBeVisible();
  return section.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const containerBox = (element.parentElement ?? element).getBoundingClientRect();
    const bands = Array.from(element.children)
      .map((band) => ({ band, rect: band.getBoundingClientRect() }))
      .filter(({ rect }) => rect.height > 0)
      .map(({ band, rect }) => {
        const label = band.querySelector('.ui-definition-list__label');
        const value = band.querySelector('.ui-definition-list__value');
        const labelBox = label?.getBoundingClientRect();
        const valueBox = value?.getBoundingClientRect();
        return {
          label: label?.textContent ?? band.textContent?.slice(0, 30) ?? '(no label)',
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          height: rect.height,
          // The number of line boxes the value's own text is drawn over: what "the value wrapped"
          // actually means, rather than a height compared with a neighbour's. The text of any
          // control inside the band is left out — a control is not a second line of the value.
          // Written when every `Id` band held a copy affordance, which left on 2026-08-14
          // (plan-docker_management_app-remove_copy_controls); the exclusion is generic and stays.
          valueLines: value
            ? (() => {
                const range = document.createRange();
                const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT);
                let lines = 0;
                while (walker.nextNode()) {
                  const node = walker.currentNode;
                  if (!node.nodeValue?.trim()) continue;
                  if (node.parentElement?.closest('button')) continue;
                  range.selectNodeContents(node);
                  lines += range.getClientRects().length;
                }
                return Math.max(1, lines);
              })()
            : 1,
          valueInsideBand: valueBox
            ? valueBox.left >= rect.left - 0.5 && valueBox.right <= rect.right + 0.5 && valueBox.top >= rect.top - 0.5 && valueBox.bottom <= rect.bottom + 0.5
            : true,
          labelOverValue:
            !!labelBox && !!valueBox && labelBox.left < valueBox.right - 0.5 && labelBox.right > valueBox.left + 0.5 && labelBox.top < valueBox.bottom - 0.5 && labelBox.bottom > valueBox.top + 0.5,
          insideSection: rect.left >= box.left - 0.5 && rect.right <= box.right + 0.5,
          hasLabel: !!labelBox,
          hasValue: !!valueBox,
        };
      });

    const tops: number[] = [];
    for (const band of bands) if (!tops.some((top) => Math.abs(top - band.top) <= 1)) tops.push(band.top);
    tops.sort((a, b) => a - b);
    const lineOf = (band: (typeof bands)[number]) => tops.findIndex((top) => Math.abs(top - band.top) <= 1);

    return {
      width: box.width,
      height: box.height,
      bands,
      columns: bands.filter((band) => lineOf(band) === 0).length,
      lines: tops.length,
      rightEdgeGap: bands.length === 0 ? Number.NaN : box.right - Math.max(...bands.map((band) => band.right)),
      heightsByLine: tops.map((_, line) => bands.filter((band) => lineOf(band) === line).map((band) => Math.round(band.height))),
      insideContainer: box.left >= containerBox.left - 0.5 && box.right <= containerBox.right + 0.5,
    };
  });
}

function describeMeasurement(label: string, measurement: Measurement): string {
  return `${label}: ${measurement.width.toFixed(1)}×${measurement.height.toFixed(1)}px — ${measurement.columns} column(s) × ${measurement.lines} line(s) over ${measurement.bands.length} bands`;
}

/** The invariants that hold at every width on every screen (REQ-8, REQ-24). */
function expectNothingClippedOrOverlapped(measurement: Measurement, evidence: string): void {
  expect(
    measurement.bands.filter((band) => !band.valueInsideBand).map((band) => band.label),
    `${evidence} — value(s) drawn outside their own band`,
  ).toEqual([]);
  expect(
    measurement.bands.filter((band) => band.labelOverValue).map((band) => band.label),
    `${evidence} — label box(es) drawn over their own value`,
  ).toEqual([]);
  expect(
    measurement.bands.filter((band) => !band.insideSection).map((band) => band.label),
    `${evidence} — band(s) drawn outside the section they belong to`,
  ).toEqual([]);
  expect(measurement.insideContainer, `${evidence} — the section's own box is not inside its container's`).toBe(true);
}

function propertySection(page: Page): Locator {
  return page.locator('.ui-detail-panel .ui-definition-list').first();
}

/** Opens the image panel the operator's way: the row's own first cell, clicked at its coordinates (REQ-41). */
async function openImagePanel(page: Page, viewportWidth: number, viewportHeight = 900): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await page.setViewportSize({ width: viewportWidth, height: viewportHeight });
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 20_000 });
  // The operator's own daemon holds images of their own: the row is found, never assumed to be the
  // first one (REQ-44).
  await page.getByPlaceholder('Search reference or digest…').fill(ALPINE_IMAGE);
  const row = page.locator('.ui-data-table__row', { hasText: ALPINE_IMAGE }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator('.ui-data-table__cell').first().click();
  await expect(propertySection(page)).toBeVisible({ timeout: 20_000 });
}

// REQ-20, REQ-2, REQ-39 — the counts the requirement states, at the section widths it states them
// for. The viewport that produces a given section width is a fact about the frame, so it is
// calibrated against the measurement instead of being written into the test as a guess.
test('shows the stated count at the stated section width, the width itself calibrated and reported', async ({ page }) => {
  const evidence: string[] = [];
  await openImagePanel(page, 1000);

  for (const stated of STATED_WIDTHS) {
    // The frame takes a constant width of any window: measure what it takes, then ask for the
    // window that leaves the section the width the requirement names.
    let viewportWidth = stated.sectionWidth + 340;
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    let measurement = await measure(propertySection(page));
    for (let attempt = 0; attempt < 4 && Math.abs(measurement.width - stated.sectionWidth) > 20; attempt += 1) {
      viewportWidth = Math.round(viewportWidth + (stated.sectionWidth - measurement.width));
      await page.setViewportSize({ width: viewportWidth, height: 900 });
      measurement = await measure(propertySection(page));
    }

    const description = describeMeasurement(`section calibrated to ${stated.sectionWidth}px (window ${viewportWidth}px)`, measurement);
    evidence.push(description);
    expect(
      Math.abs(measurement.width - stated.sectionWidth),
      `${description} — the section could not be brought within 20px of the ${stated.sectionWidth}px the requirement states a count for`,
    ).toBeLessThanOrEqual(20);
    // Asserting on a transition is asserting on a rounding rule.
    expect(onATransition(measurement.width), `${description} — the calibrated width lands on a transition (744 / 1128 / 1512px)`).toBe(false);
    expect(measurement.columns, `${description} — the requirement states exactly ${stated.columns} column(s) at ${stated.sectionWidth}px of section`).toBe(stated.columns);
    expectNothingClippedOrOverlapped(measurement, description);
    // REQ-11 — it fills the width it is given: no dead margin re-appearing on the right.
    expect(measurement.rightEdgeGap, `${description} — ${measurement.rightEdgeGap.toFixed(1)}px of dead margin on the right`).toBeLessThanOrEqual(COLUMN_GAP_PX + 1);
  }
  console.log(`[REQ-20] ${evidence.join('\n[REQ-20] ')}`);
});

// REQ-2 — "the count rises as the section widens and never falls as it widens" is a statement about
// the whole interval, not about four points on it. The window is swept the way the human's own
// acceptance sweeps it — 2560 all the way down to 720 — and every step is measured.
test('never gains a column as it narrows, at any step of the way from 2560 to 720', async ({ page }) => {
  await openImagePanel(page, 2560, 1440);
  const steps: { section: number; columns: number; height: number }[] = [];

  for (let viewportWidth = 2560; viewportWidth >= 720; viewportWidth -= 60) {
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    const measurement = await measure(propertySection(page));
    const description = describeMeasurement(`window ${viewportWidth}px`, measurement);
    expectNothingClippedOrOverlapped(measurement, description);
    // Away from a transition the count is the one the plan's arithmetic states; on one it is a
    // rounding rule, and nothing is asserted about it.
    if (!onATransition(measurement.width)) {
      expect(measurement.columns, `${description} — a section of ${measurement.width.toFixed(1)}px carries ${derivedColumns(measurement.width)} bands of the stated minimum`).toBe(
        derivedColumns(measurement.width),
      );
    }
    steps.push({ section: Math.round(measurement.width), columns: measurement.columns, height: Math.round(measurement.height) });
  }
  console.log(`[REQ-2] ${steps.map((step) => `${step.section}px→${step.columns}c/${step.height}px`).join(' ')}`);

  for (const [index, step] of steps.entries()) {
    if (index === 0) continue;
    const wider = steps[index - 1]!;
    expect(step.section, `the section grew as the window narrowed: ${wider.section}px → ${step.section}px`).toBeLessThanOrEqual(wider.section);
    expect(step.columns, `the section gained a column as it narrowed: ${wider.section}px→${wider.columns} then ${step.section}px→${step.columns}`).toBeLessThanOrEqual(wider.columns);
  }
  expect(steps.at(-1)!.columns, 'the section is not a single column below the 720px breakpoint, where the delivered build is one (REQ-12)').toBe(1);
  expect(steps[0]!.columns, 'the section shows no more columns at 2560 than at 720, so it does not respond to width at all (REQ-23)').toBeGreaterThan(steps.at(-1)!.columns);
});

// REQ-21, REQ-23 — the height ceilings, against a delivered figure this spec derives for itself: the
// delivered build is one column at every viewport (REQ-42), and the corrected build still is below
// 720px — with the same nine bands, the same band step and nothing wrapped. That one-column height is
// therefore the height the delivered build has at every one of the three viewports, measured on this
// machine rather than taken from the plan's ~330px, which is asserted beside it.
test('measures at most 65% / 45% / 35% of its own one-column height at 1280, 1920 and 2560', async ({ page }) => {
  await openImagePanel(page, 720, 800);
  const stacked = await measure(propertySection(page));
  const stackedEvidence = describeMeasurement('one column at a 720px window (what the delivered build shows at every width)', stacked);
  expect(stacked.columns, `${stackedEvidence} — this is not the one-column presentation, so it is not the delivered build's height`).toBe(1);
  expect(
    stacked.bands.filter((band) => band.valueLines > 1).map((band) => band.label),
    `${stackedEvidence} — a value wraps here, so this height is not comparable with the delivered build's`,
  ).toEqual([]);

  const delivered = stacked.height;
  const measured: string[] = [`delivered-equivalent height ${delivered.toFixed(1)}px over ${stacked.bands.length} bands (the plan states ~330px)`];
  const heights: number[] = [];
  const counts: number[] = [];

  for (const [viewport, fraction] of [
    [{ width: 1280, height: 720 }, 0.65],
    [{ width: 1920, height: 1080 }, 0.45],
    [{ width: 2560, height: 1440 }, 0.35],
  ] as const) {
    await page.setViewportSize(viewport);
    const measurement = await measure(propertySection(page));
    const description = describeMeasurement(`${viewport.width}×${viewport.height}`, measurement);
    measured.push(`${description} — ${((measurement.height / delivered) * 100).toFixed(1)}% of the delivered height, ceiling ${fraction * 100}%`);
    expect(measurement.height, `${description} — over the ${(delivered * fraction).toFixed(1)}px ceiling (${fraction * 100}% of the delivered ${delivered.toFixed(1)}px)`).toBeLessThanOrEqual(
      delivered * fraction,
    );
    // And against the figure the requirement itself states for the delivered build, so that a
    // machine whose frame differs cannot make the ceiling more generous than the requirement.
    expect(measurement.height, `${description} — over the ${(330 * fraction).toFixed(1)}px ceiling the requirement's own ~330px states`).toBeLessThanOrEqual(330 * fraction);
    heights.push(measurement.height);
    counts.push(measurement.columns);
  }
  console.log(`[REQ-21] ${measured.join('\n[REQ-21] ')}`);

  // REQ-23 — the cleanest red available: on the delivered build these three are the same height and
  // the same one column.
  expect(heights[2], `the section is not shorter at 2560 (${heights[2]!.toFixed(1)}px) than at 1280 (${heights[0]!.toFixed(1)}px)`).toBeLessThan(heights[0]!);
  expect(counts[2], `the section carries no more columns at 2560 (${counts[2]}) than at 1280 (${counts[0]})`).toBeGreaterThan(counts[0]!);
  expect(heights[1], 'the section does not get shorter between 1280 and 1920').toBeLessThan(heights[0]!);
});

// REQ-9, REQ-8 — a line of the grid reads as a line, checked with a value that genuinely wraps: the
// wrap is counted in line boxes, not inferred from a height, so a band that is taller for holding a
// control cannot be mistaken for one and neither can the reverse.
test('keeps every band of a line at one height when a value wraps, and truncates nothing', async ({ page }) => {
  await ensureImage(ALPINE_IMAGE);
  const longTag = `vexel-e2e-bug4-rule-a-reference-long-enough-to-wrap-inside-its-own-band-${Date.now()}:v1`;
  await execFileAsync('docker', ['tag', ALPINE_IMAGE, longTag]);
  try {
    await openImagePanel(page, 1920, 1080);
    const measurement = await measure(propertySection(page));
    const description = describeMeasurement('1920×1080 with a wrapping value', measurement);
    console.log(`[REQ-9] ${description} — value line boxes [${measurement.bands.map((band) => `${band.label}:${band.valueLines}`).join(', ')}]`);

    const wrapped = measurement.bands.filter((band) => band.valueLines > 1);
    expect(wrapped.map((band) => band.label), `${description} — no value is drawn over more than one line box, so this check would certify nothing`).not.toEqual([]);
    for (const [line, heights] of measurement.heightsByLine.entries()) {
      const distinct = [...new Set(heights)];
      expect(distinct, `${description} — line ${line} holds bands of ${distinct.length} heights (${heights.join(', ')}px), so it does not read as a line`).toHaveLength(1);
    }
    expectNothingClippedOrOverlapped(measurement, description);
    // Beside the geometry (REQ-8, REQ-31): the long value wrapped inside its band, it was not
    // shortened, ellipsised or moved behind a disclosure.
    await expect(propertySection(page)).toContainText(longTag.split(':')[0]!);
  } finally {
    await execFileAsync('docker', ['rmi', '-f', longTag]).catch(() => undefined);
  }
});

/**
 * REQ-16 — the collapsible sections by their own class, on a fixture that has
 * enough of them to tell the classes apart.
 *
 * The suite's `alpine:3.20` declares **one** environment variable and no labels
 * at all, and a section holding one band is one column whatever class it
 * declares — so on that fixture "Environment shows fewer columns than the
 * properties" is true of a build that ignores the class entirely. This test
 * builds an image with eight environment values and six labels, all past the 60
 * characters the long-single-line class exists for, so that the count it
 * measures is a fact about the class and not about the fixture.
 */
test('arranges Environment and Labels in columns of their own class, and History in none', async ({ page }) => {
  await ensureImage(TINY_IMAGE);
  const tag = `vexel-e2e-bug4-classes-${Date.now()}:v1`;
  const environment = Array.from({ length: 8 }, (_, index) => `VEXEL_LONG_VALUE_${index}=/usr/local/share/vexel/${index}/a-value-well-past-sixty-characters-so-it-belongs-to-the-long-class`);
  const labels = Array.from({ length: 6 }, (_, index) => `com.vexel.e2e.long-label-${index}=https://example.invalid/vexel/e2e/a-label-value-well-past-sixty-characters/${index}`);
  const contextDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-bug4-classes-'));
  await writeFile(join(contextDir, 'Dockerfile'), [`FROM ${TINY_IMAGE}`, ...environment.map((entry) => `ENV ${entry}`), ...labels.map((entry) => `LABEL ${entry}`), ''].join('\n'));
  await execFileAsync('docker', ['build', ...ownershipArgs(tag), '-t', tag, contextDir]);
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openApp(page, 'images-layers');
    await page.getByPlaceholder('Search reference or digest…').fill(tag.split(':')[0]!);
    const row = page.locator('.ui-data-table__row', { hasText: tag }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.locator('.ui-data-table__cell').first().click();
    const properties = await measure(propertySection(page));

    /** A collapsible section, opened with a real pointer on its own header (REQ-41). */
    const open = async (title: string): Promise<Measurement> => {
      const section = page
        .locator('.ui-detail-panel .ui-collapsible-section')
        .filter({ has: page.locator('.ui-collapsible-section__title', { hasText: new RegExp(`^${title}$`) }) })
        .first();
      await expect(section, `the ${title} section is not on the panel`).toBeVisible();
      await section.locator('.ui-collapsible-section__header').click();
      return measure(section.locator('.ui-definition-list').first());
    };

    const measured: string[] = [describeMeasurement('the nine properties at 1920×1080', properties)];
    for (const title of ['Environment', 'Labels']) {
      const section = await open(title);
      const description = describeMeasurement(`${title} at 1920×1080`, section);
      measured.push(description);
      // Non-degenerate first: a section of one band is one column on any build, class or no class.
      expect(section.bands.length, `${description} — the fixture put too few entries in ${title} for its arrangement to be measurable`).toBeGreaterThanOrEqual(4);
      expect(section.columns, `${description} — ${title} is a single column where the requirement puts it in columns`).toBeGreaterThan(1);
      expect(section.columns, `${description} — ${title} shows as many columns as the short-scalar section at the same width (${properties.columns}), so its own class is not honoured`).toBeLessThan(
        properties.columns,
      );
      expectNothingClippedOrOverlapped(section, description);
    }

    // Unbounded free text keeps one entry per line at the full width: a Dockerfile instruction
    // against a timestamp label is not a column.
    const history = await open('History');
    const historyDescription = describeMeasurement('History at 1920×1080', history);
    measured.push(historyDescription);
    expect(history.bands.length, `${historyDescription} — the fixture has too few history entries for one-per-line to mean anything`).toBeGreaterThan(1);
    expect(history.columns, `${historyDescription} — History is in columns, where it keeps one entry per line`).toBe(1);
    expect(history.lines, `${historyDescription} — History does not draw one line per entry`).toBe(history.bands.length);
    expect(history.rightEdgeGap, `${historyDescription} — History no longer fills the width it had`).toBeLessThanOrEqual(COLUMN_GAP_PX + 1);

    /**
     * REQ-7 — the case the requirement states in so many words, and the only
     * place in the product a section is narrower than its own class's minimum:
     * a long-single-line list, whose minimum is 560px, in a box of ~400px. It
     * must degrade to one column of the box's own width; a 560px track pushed
     * through it would answer a wasted-space report with a clipping defect.
     */
    await page.setViewportSize({ width: 460, height: 900 });
    const narrow = await measure(page.locator('.ui-detail-panel .ui-collapsible-section .ui-definition-list').first());
    const narrowDescription = describeMeasurement('Environment at a 460px window', narrow);
    measured.push(narrowDescription);
    expect(narrow.width, `${narrowDescription} — the section is not narrower than its class's 560px minimum, so the degrading case was never reached`).toBeLessThan(560);
    expect(narrow.columns, `${narrowDescription} — a section narrower than its own minimum is not one column`).toBe(1);
    expect(narrow.lines, `${narrowDescription} — the section does not draw one line per entry at a width that carries one`).toBe(narrow.bands.length);
    expectNothingClippedOrOverlapped(narrow, narrowDescription);
    console.log(`[REQ-16] ${measured.join('\n[REQ-16] ')}`);
  } finally {
    await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
    // The build context is this test's too, and it leaves nothing of its own behind.
    await rm(contextDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

// REQ-24, REQ-7, REQ-28 — the ~400px section, which is the width the requirement singles out and
// which no viewport of the two reported panels produces. The daemon cards of `System & prune` and of
// `Contexts` are that width at an ordinary window, and they hold a property section that states no
// count — so they are where a minimum wider than its container would show.
test('keeps a ~400px section inside its card, in one column, with nothing clipped', async ({ page }) => {
  const evidence: string[] = [];
  let narrowest = Number.POSITIVE_INFINITY;

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    for (const [screenId, heading] of [
      ['system-prune', 'System & prune'],
      ['contexts', 'Contexts'],
    ] as const) {
      await page.setViewportSize(viewport);
      await openApp(page, screenId);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 20_000 });
      const sections = page.locator('.ui-frame__content .ui-definition-list');
      await expect(sections.first()).toBeVisible({ timeout: 20_000 });

      for (let index = 0; index < (await sections.count()); index += 1) {
        const measurement = await measure(sections.nth(index));
        const description = describeMeasurement(`${heading} section ${index} @${viewport.width}×${viewport.height}`, measurement);
        evidence.push(description);
        narrowest = Math.min(narrowest, measurement.width);
        expectNothingClippedOrOverlapped(measurement, description);
        if (!onATransition(measurement.width)) {
          expect(measurement.columns, `${description} — a section of ${measurement.width.toFixed(1)}px does not carry ${measurement.columns} bands of the stated minimum`).toBe(
            derivedColumns(measurement.width),
          );
        }
        // Beside the geometry (REQ-31): every property is still a label and a value.
        for (const band of measurement.bands) {
          expect(band.hasLabel, `${description} — the \`${band.label}\` band draws no label`).toBe(true);
          expect(band.hasValue, `${description} — the \`${band.label}\` band draws no value`).toBe(true);
        }
      }
    }
  }
  console.log(`[REQ-24] ${evidence.join('\n[REQ-24] ')}`);
  // The case the requirement names is a section of ~400px: if none of these cards is that narrow on
  // this frame, this test has not exercised it and says so rather than passing.
  expect(narrowest, `the narrowest section measured was ${narrowest.toFixed(1)}px, so the ~400px case REQ-24 names was never reached`).toBeLessThanOrEqual(500);
});

// REQ-28 — the coverage matrix, the one screen of the sweep whose only property list is a
// caller-stated one. Its geometry is measured all the same: "unaffected" is a claim about boxes, and
// a screen left out of the sweep because of what it states is a screen not swept.
test('the coverage matrix presents its property lists free of clipping and overlap', async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await openApp(page, 'coverage-matrix');
    const lists = page.locator('.ui-frame__content .ui-definition-list');
    await expect(lists.first()).toBeVisible({ timeout: 20_000 });

    for (let index = 0; index < (await lists.count()); index += 1) {
      const measurement = await measure(lists.nth(index));
      const description = describeMeasurement(`coverage matrix list ${index} @${viewport.width}×${viewport.height}`, measurement);
      console.log(`[REQ-28] ${description}`);
      expectNothingClippedOrOverlapped(measurement, description);
      for (const band of measurement.bands) {
        expect(band.hasLabel, `${description} — the \`${band.label}\` band draws no label`).toBe(true);
        expect(band.hasValue, `${description} — the \`${band.label}\` band draws no value`).toBe(true);
      }
    }
  }
});
