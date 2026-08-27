import { expect, test, type Locator, type Page } from './support/test.js';
import { navEntry, openApp } from './support/fixtures.js';
import {
  COLUMN_GAP_PX,
  expectNothingClippedOrOverlapped,
  measureSection,
  measureSectionOnceSettled,
  report,
  type BandGeometry,
  type SectionGeometry,
} from './support/property-bands.js';

/**
 * **The surface that stated its own count, measured where the count was wrong.**
 * REQ ids belong to `plan-docker_management_app-detail_property_columns`
 * (REQ-25, REQ-26, REQ-27).
 *
 * It was five: the other four were the swarm screen's panels, and they left with
 * the area on 2026-08-27 (plan-docker_management_app-swarm_removal/REQ-1). The
 * About screen's coverage baseline is the one that remains, and it is the one
 * available on any daemon.
 *
 * This file **replaces** batch 1's `property-columns-untouched-guard.spec.ts`,
 * which asserted the opposite of what is asserted here — two columns at every
 * width, the ~400px card included — because until the caller-stated count was
 * retired, that was the delivered behaviour and leaving it attributable was worth
 * a check of its own. That guard is deleted, not relaxed: two files disagreeing
 * about the same surface is how a plan's record stops being true.
 *
 * **What is measured, and why it is the narrow width and not the wide one.** At
 * ordinary widths these five looked acceptable; the defect is the card nobody
 * opens — half a screen, or a phone-width window — where a fixed two-track grid
 * hands each pair a cell of ~165px and a 19-character id is drawn over three
 * lines. So each surface is measured **with its own section near 400px**: exactly
 * one column, deduced from measured band positions, and **no band whose content
 * fits the band it is given drawn over more than one line**. Then at a wide
 * width, **at least the two columns the caller used to state** — the operator
 * loses no density by the count ceasing to be guessed (REQ-2).
 *
 * **Two premises are asserted before any of that means anything**, because this
 * plan has already shipped checks whose fixtures could not make them false:
 *
 * - the section's own **measured** width is inside the ~400px window this check
 *   is about. A card that measures 600px gives the same green and proves
 *   nothing;
 * - the section holds at least one band whose text **fits on one line in the
 *   one-column band and could not have fitted a two-column cell of the same
 *   section**. That band is the digest of the report: it is the one the
 *   arrangement, and only the arrangement, decides the line count of. With none
 *   of them the surface cannot exhibit the defect and the check says so and
 *   fails, instead of passing quietly.
 *
 * Bands whose content genuinely exceeds any band at this width — a joined label
 * set, a sentence — wrap, as REQ-8 says they must, and are reported rather than
 * asserted on.
 *
 * Nothing assumes an empty daemon, nothing reaches Docker Hub, and each test
 * passes on its own.
 */

/** What the surface used to state for itself, and the floor the derived count must not fall below at a wide width. */
const CALLER_STATED_COLUMNS = 2;

/**
 * The ~400px window: the section's **measured** width must land inside it, or the
 * measurement is not the one this check is about and the run fails saying so.
 */
const NARROW_SECTION_PX = { min: 355, max: 445 };

/** The band's own horizontal padding (2 × `--space-3`) and the label→value gap (`--space-4`). */
const BAND_PADDING_PX = 24;
const LABEL_VALUE_GAP_PX = 16;

/**
 * The narrow window. Below the 720px breakpoint the rail is a drawer, so the
 * whole width belongs to the content and a card lands near 400px — the width the
 * delivered fixed grid misbehaves at.
 */
const NARROW_VIEWPORT = { width: 505, height: 900 };

/**
 * The wide window for a section that has the content width to itself (the About
 * screen's baseline list).
 */
const WIDE_VIEWPORT = { width: 1920, height: 1080 };

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

/** The one-line width a band's own text needs: the ink of the label, the gap, and the ink of the value. */
function oneLineRun(band: BandGeometry): number {
  return band.labelInk + LABEL_VALUE_GAP_PX + band.valueInk;
}

/**
 * The bands whose line count the **arrangement** decides: their text fits on one
 * line in the band they are given, and could not have fitted a cell of the
 * two-track grid this section used to be. A surface with none of them cannot be
 * made to fail by this fixture, whatever it renders.
 */
function bandsTheArrangementDecides(geometry: SectionGeometry): BandGeometry[] {
  const oneColumnContent = geometry.box.width - BAND_PADDING_PX;
  const twoColumnContent = (geometry.box.width - COLUMN_GAP_PX) / 2 - BAND_PADDING_PX;
  return geometry.bands.filter((band) => oneLineRun(band) > twoColumnContent && oneLineRun(band) <= oneColumnContent);
}

/** Every number this check rests on, in one line, for the before and the after (REQ-42). */
function describe(label: string, geometry: SectionGeometry): string {
  const bands = geometry.bands.map((band) => `${band.label.trim()} ${band.labelLines}L/${band.valueLines}L run ${oneLineRun(band).toFixed(0)}px in ${band.box.width.toFixed(0)}px`);
  return `${report(label, geometry)} — bands [${bands.join(' | ')}]`;
}

/**
 * The measurement REQ-26 states, at a section measured near 400px: one column,
 * and nothing wrapped that the arrangement is what wrapped.
 */
function expectOneColumnNothingWrapped(geometry: SectionGeometry, evidence: string): void {
  expect(
    geometry.box.width,
    `${evidence} — the section measures ${geometry.box.width.toFixed(1)}px, outside the ${NARROW_SECTION_PX.min}–${NARROW_SECTION_PX.max}px window this check is about: a card of another width gives the same green and states nothing about the one that misbehaves`,
  ).toBeGreaterThanOrEqual(NARROW_SECTION_PX.min);
  expect(geometry.box.width, `${evidence} — the section measures ${geometry.box.width.toFixed(1)}px, above the ~400px window this check is about`).toBeLessThanOrEqual(NARROW_SECTION_PX.max);

  const decided = bandsTheArrangementDecides(geometry);
  expect(
    decided.map((band) => band.label.trim()),
    `${evidence} — no band on this surface needs more than a ${((geometry.box.width - COLUMN_GAP_PX) / 2 - BAND_PADDING_PX).toFixed(0)}px cell, so the delivered two-track grid could not have wrapped one and a green here would certify nothing`,
  ).not.toEqual([]);

  expect(geometry.columns, `${evidence} — the section shows ${geometry.columns} columns at ${geometry.box.width.toFixed(1)}px, where one band of the stated minimum is all that fits`).toBe(1);

  const wrapped = decided.filter((band) => band.labelLines > 1 || band.valueLines > 1);
  expect(
    wrapped.map((band) => `${band.label.trim()} (${band.labelLines} label line(s), ${band.valueLines} value line(s), needing ${oneLineRun(band).toFixed(0)}px of the ${(band.box.width - BAND_PADDING_PX).toFixed(0)}px its band gives it)`),
    `${evidence} — band(s) drawn over more than one line by the arrangement, not by their own content`,
  ).toEqual([]);

  // Beside the geometry, and never instead of it (REQ-40, REQ-31): every property is still there,
  // with its label and its value — a section that arranged itself into emptiness would pass every
  // assertion above.
  for (const band of geometry.bands) {
    expect(band.labelBox, `${evidence} — the \`${band.label}\` band draws no label`).not.toBeNull();
    expect(band.valueBox, `${evidence} — the \`${band.label}\` band draws no value`).not.toBeNull();
  }
  expectNothingClippedOrOverlapped(geometry, evidence);
}

/** REQ-2, verified on these five: at a wide width the derived count is at least the one the caller used to state. */
function expectNoFewerColumnsThanStated(geometry: SectionGeometry, evidence: string): void {
  expect(
    geometry.columns,
    `${evidence} — the section shows ${geometry.columns} column(s) at ${geometry.box.width.toFixed(1)}px, fewer than the ${CALLER_STATED_COLUMNS} it stated for itself before the count was derived`,
  ).toBeGreaterThanOrEqual(CALLER_STATED_COLUMNS);
  expectNothingClippedOrOverlapped(geometry, evidence);
}

// REQ-26, REQ-2 — the surface, available on any daemon: the About screen's
// coverage baseline. Opened with a real pointer on the rail's own entry (REQ-41), then the window is
// narrowed the way the operator narrows it.
test('the About screen’s baseline list: one column and nothing wrapped at ~400px, no fewer columns than it stated when wide', async ({ page }) => {
  await page.setViewportSize(WIDE_VIEWPORT);
  await openApp(page, null);
  await navEntry(page, 'About').click();
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible({ timeout: 20_000 });

  const section = screenContent(page).locator('.ui-definition-list').first();
  const wide = await measureSection(section, 'the About screen’s coverage baseline list');
  const wideEvidence = describe(`coverage baseline @${WIDE_VIEWPORT.width}×${WIDE_VIEWPORT.height}`, wide);
  console.log(`[REQ-2] ${wideEvidence}`);
  expectNoFewerColumnsThanStated(wide, wideEvidence);

  await page.setViewportSize(NARROW_VIEWPORT);
  // The window is resized under a section already on screen, with no navigation in between, so the
  // read waits for the layout to come to rest: a box read in the frame the size changed is the
  // previous layout's, whole and self-consistent (see `measureSectionOnceSettled`).
  const narrow = await measureSectionOnceSettled(section, 'the About screen’s coverage baseline list, narrowed');
  const narrowEvidence = describe(`coverage baseline @${NARROW_VIEWPORT.width}×${NARROW_VIEWPORT.height}`, narrow);
  console.log(`[REQ-26] ${narrowEvidence}`);
  expectOneColumnNothingWrapped(narrow, narrowEvidence);
});
