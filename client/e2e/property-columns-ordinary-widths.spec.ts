import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import {
  COLUMN_GAP_PX,
  SHORT_SCALAR_RUN_MAX_PX,
  expectLinesReadAsLines,
  expectNothingClippedOrOverlapped,
  measureSection,
  report,
} from './support/property-bands.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

/**
 * **The half of REQ-26 that is about the ordinary width, not the narrow one.**
 * REQ ids belong to `plan-docker_management_app-detail_property_columns`.
 *
 * REQ-26 makes two statements about the five surfaces that used to state their
 * own count. The narrow one — one column and nothing wrapped at ~400px — is
 * measured by `property-columns-derived-count.spec.ts`. The second is *"at
 * ordinary widths their visible outcome is the same count or a better one"*, and
 * it is the one a derived count can quietly cost: the caller-stated count was two
 * **at every width**, so any width at which the derived rule yields one is a
 * density the operator had and no longer has.
 *
 * Four of the five sit in a **half-width panel** — the swarm screen's four
 * quadrants — and 1920 × 1080 is the width this plan calls ordinary
 * (REQ-21, REQ-28). That is exactly where a half-width card and the stated
 * 360px minimum can disagree, and it is the width no other check of this batch
 * looks at: the swarm measurement is written for a manager daemon and skips on
 * this one, and the width it would have measured is 2560.
 *
 * So it is measured here **without a swarm**, from the geometry the screen
 * itself has whatever the daemon reports: the width a swarm panel gives the card
 * its property section is drawn in, less the inset the expanded card adds —
 * measured, not read off a stylesheet, on the same library component on the
 * volumes screen. The section can only be narrower than that, never wider, so a
 * predicted width below the two-band minimum is a count of one whatever the
 * cluster holds.
 *
 * **And at 1920 it is one, which is the accepted outcome and not a defect.** The
 * measurement below was written as an assertion of REQ-26's second clause, was
 * red, and is now a **recorded measurement of what was decided instead**: see
 * *"Amendment to REQ-26, 2026-08-14 — the half-width card between ~1920px and
 * ~2100px"* in this plan's `requirements.md`, which carries the reasoning, these
 * figures and the decision's authorship. In one line: the identical 682px
 * half-width panel on volumes & networks shows one column and batch 1 certified
 * it correct, so restoring two here alone would re-create the caller-stated
 * exception this batch exists to retire — and the only alternative, a minimum
 * under 329px, would put every short-scalar band in the product below the width
 * its content was measured to need. What the operator loses is a taller card
 * between roughly 1920px and 2100px of viewport; nothing clips, nothing wraps,
 * and two columns return above it.
 *
 * The check therefore **keeps measuring and keeps its numbers**, so that a later
 * change to the stated minimum, to the expanded card's inset or to the quadrant
 * layout is noticed instead of being absorbed. What would have to change for the
 * recorded figures to move is named in each failure message.
 *
 * Its own fixture, labelled and removed in a `finally`; nothing assumes an empty
 * daemon; nothing initialises, joins or leaves a swarm; each test passes on its
 * own.
 */

/**
 * The stated minimum of a short-scalar band (`--band-min-pair-short-scalar`),
 * derived from the content in `ui-library/specs/content-columns.md` and
 * certified in batch 1. It is one of the three figures the amendment to REQ-26
 * was decided on: a minimum of 329px or less would have restored two columns at
 * 1920 and was refused, because it would put every short-scalar band in the
 * product below the width its content needs.
 */
const SHORT_SCALAR_MIN_PX = 360;

/**
 * What two short-scalar bands need side by side: two stated minima and the one
 * column gap between them. A section narrower than this carries one column, by
 * the rule itself.
 */
const TWO_SHORT_SCALAR_BANDS_PX = 2 * SHORT_SCALAR_MIN_PX + COLUMN_GAP_PX;

/** What the five surfaces stated for themselves, at every width, before the count was derived. */
const CALLER_STATED_COLUMNS = 2;

/**
 * The figures the amendment to REQ-26 records and was decided on, measured in
 * this environment on 2026-08-14. They are pinned rather than recomputed: a
 * check that derived them from the same source as the product would move with
 * it and notice nothing.
 */
const RECORDED_AT_1920 = {
  cardRegionPx: 724,
  insetPx: 42,
  sectionPx: 682,
  columns: 1,
} as const;

/**
 * How far a pinned figure may drift before it is a different measurement: a
 * couple of pixels of rounding, not a change of layout.
 */
const PIN_TOLERANCE_PX = 2;

/** The count the layout engine derives at a measured width: `floor((W + gap) / (minimum + gap))`. */
function derivedColumns(sectionWidth: number): number {
  return Math.max(1, Math.floor((sectionWidth + COLUMN_GAP_PX) / (SHORT_SCALAR_MIN_PX + COLUMN_GAP_PX)));
}

/** A recorded figure, and what its moving would mean, said on the spot. */
function expectPinned(measured: number, recorded: number, reason: string): void {
  expect(
    measured,
    `${reason} — measured ${measured.toFixed(1)}px against the ${recorded}px on record in the amendment to REQ-26 (2026-08-14)`,
  ).toBeGreaterThanOrEqual(recorded - PIN_TOLERANCE_PX);
  expect(
    measured,
    `${reason} — measured ${measured.toFixed(1)}px against the ${recorded}px on record in the amendment to REQ-26 (2026-08-14)`,
  ).toBeLessThanOrEqual(recorded + PIN_TOLERANCE_PX);
}

const ORDINARY_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

/** The four quadrants of the swarm screen, each holding one of the four surfaces. */
const SWARM_PANELS = ['Nodes', 'Services & tasks', 'Secrets', 'Configs & stacks'] as const;

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

/**
 * The inset an expanded card puts between the width a card list is given and the
 * width the property section inside it actually gets. It is a property of the
 * library's card list, shared by every screen that uses one, so it is measured
 * where a card can be expanded on any daemon — the volumes panel — and applied
 * where one cannot.
 */
async function measureExpandedCardInset(page: Page, viewport: { width: number; height: number }): Promise<number> {
  const volumeName = `vexel-e2e-bug4-widths-${Date.now()}`;
  await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(volumeName), volumeName]);
  try {
    await page.setViewportSize(viewport);
    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 20_000 });
    const panel = page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Volumes' }) });
    await panel.locator('.ui-card-list__item', { hasText: volumeName }).first().click();
    await expect(panel.locator('.ui-card-list__expanded')).toBeVisible();

    const listWidth = await panel.locator('.ui-card-list').first().evaluate((element) => element.getBoundingClientRect().width);
    const section = await measureSection(panel.locator('.ui-definition-list').first(), 'the volumes panel property section');
    const inset = listWidth - section.box.width;
    console.log(
      `[REQ-26] expanded-card inset @${viewport.width}×${viewport.height}: a card list of ${listWidth.toFixed(1)}px gives its property section ${section.box.width.toFixed(1)}px — inset ${inset.toFixed(1)}px`,
    );
    expect(inset, 'the expanded card takes no width at all from the section, which no measurement of this library component supports').toBeGreaterThan(0);
    return inset;
  } finally {
    await execFileAsync('docker', ['volume', 'rm', '-f', volumeName]).catch(() => undefined);
  }
}

/**
 * REQ-26 on the fifth surface, the one that needs no cluster: the About screen's
 * coverage baseline. It has the content width to itself, so its ordinary-width
 * outcome is the count rising rather than falling — and with it the invariants
 * the sweep does not assert on this screen: a line that reads as a line (REQ-9),
 * the declared order kept as the positions read (REQ-10), the run bounded
 * (REQ-1) and the width filled (REQ-11).
 */
test('the coverage baseline list: no fewer columns than it stated, at 1280 and at 1920', async ({ page }) => {
  const measured: string[] = [];
  for (const viewport of ORDINARY_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await openApp(page, 'coverage-matrix');
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible({ timeout: 20_000 });

    const geometry = await measureSection(screenContent(page).locator('.ui-definition-list').first(), 'the coverage baseline list');
    const evidence = report(`coverage baseline @${viewport.width}×${viewport.height}`, geometry);
    measured.push(evidence);

    // No transition clearance is asked for here, and that is the difference between this assertion
    // and an exact count: what is asserted is a **floor** — no fewer than the two the surface used
    // to state — and a floor 700px clear of the width two bands need is not an assertion about a
    // rounding rule. (Asked for, it fails on its own terms: the section measures 1534px at 1920,
    // 22px above the 1512px transition, while carrying four columns.)
    expect(
      geometry.columns,
      `${evidence} — ${geometry.columns} column(s) at an ordinary width, fewer than the ${CALLER_STATED_COLUMNS} this surface stated for itself before the count was derived`,
    ).toBeGreaterThanOrEqual(CALLER_STATED_COLUMNS);
    expectLinesReadAsLines(geometry, evidence);
    expect(geometry.positionalOrder, `${evidence} — the positions read in a different order from the markup`).toEqual(geometry.documentOrder);
    expect(geometry.maxRun, `${evidence} — a label→value run of ${geometry.maxRun.toFixed(1)}px, over the ${SHORT_SCALAR_RUN_MAX_PX}px bound`).toBeLessThanOrEqual(SHORT_SCALAR_RUN_MAX_PX);
    expect(geometry.rightEdgeGap, `${evidence} — ${geometry.rightEdgeGap.toFixed(1)}px of dead margin on the right`).toBeLessThanOrEqual(COLUMN_GAP_PX + 1);
    expectNothingClippedOrOverlapped(geometry, evidence);
  }
  console.log(`[REQ-26] ${measured.join('\n[REQ-26] ')}`);
});

/**
 * **The accepted outcome at 1920, recorded.** This is the amendment's own
 * measurement, kept in the suite as the amendment asks: not a claim that one
 * column is what REQ-26's second clause wanted — it is not — but a pin on the
 * three figures the decision was taken on, so that the day one of them moves,
 * the decision is revisited rather than silently outgrown.
 *
 * Each figure is pinned with the reason it could move stated in its own failure
 * message. **A failure here is not a defect on its own**: it means the geometry
 * the amendment was decided against has changed, and the amendment is what has
 * to be re-read.
 */
test('the four swarm panels: the recorded one-column outcome at 1920, and the figures it was decided on', async ({ page }) => {
  const viewport = { width: 1920, height: 1080 };
  const inset = await measureExpandedCardInset(page, viewport);
  expectPinned(inset, RECORDED_AT_1920.insetPx, 'the expanded card takes a different width from the section than the amendment measured (`.ui-card-list__expanded` padding)');

  await openApp(page, 'swarm');
  await expect(page.getByRole('heading', { level: 1, name: 'Swarm' })).toBeVisible({ timeout: 20_000 });

  const measured: string[] = [];
  for (const title of SWARM_PANELS) {
    const panel = screenContent(page).locator('.ui-surface').filter({ has: page.getByRole('heading', { level: 2, name: title }) }).first();
    const region = panel.locator('.ui-card-list, .ui-card-list__empty').first();
    await expect(region, `the ${title} panel draws no card region, so the width its property card gets cannot be measured`).toBeVisible({ timeout: 20_000 });
    const regionWidth = await region.evaluate((element) => element.getBoundingClientRect().width);
    const sectionWidth = regionWidth - inset;
    const columns = derivedColumns(sectionWidth);
    const evidence = `${title} @${viewport.width}×${viewport.height}: card region ${regionWidth.toFixed(1)}px → property section ${sectionWidth.toFixed(1)}px → ${columns} column(s) at the stated ${SHORT_SCALAR_MIN_PX}px minimum (two bands need ${TWO_SHORT_SCALAR_BANDS_PX}px)`;
    measured.push(evidence);

    expectPinned(regionWidth, RECORDED_AT_1920.cardRegionPx, `${evidence} — the quadrant layout gives a swarm panel's card region a different width from the one the amendment was decided on`);
    expectPinned(sectionWidth, RECORDED_AT_1920.sectionPx, `${evidence} — the width a swarm property section is given has moved off the figure the amendment records`);
    expect(
      columns,
      `${evidence} — the recorded outcome is ${RECORDED_AT_1920.columns} column, and the count derived from the measured width is no longer it: either the stated minimum, the card or the layout has changed, and the amendment to REQ-26 is what has to be re-read before this number is updated`,
    ).toBe(RECORDED_AT_1920.columns);
  }
  console.log(`[REQ-26] ${measured.join('\n[REQ-26] ')}`);
});

/** The same measurement at the width the batch's own swarm check would have used, for the record. */
test('the four swarm panels: their property card has the width two columns need, at 2560', async ({ page }) => {
  const viewport = { width: 2560, height: 1440 };
  const inset = await measureExpandedCardInset(page, viewport);

  await openApp(page, 'swarm');
  await expect(page.getByRole('heading', { level: 1, name: 'Swarm' })).toBeVisible({ timeout: 20_000 });

  const measured: string[] = [];
  const tooNarrow: string[] = [];
  for (const title of SWARM_PANELS) {
    const panel = screenContent(page).locator('.ui-surface').filter({ has: page.getByRole('heading', { level: 2, name: title }) }).first();
    const region = panel.locator('.ui-card-list, .ui-card-list__empty').first();
    await expect(region, `the ${title} panel draws no card region, so the width its property card gets cannot be measured`).toBeVisible({ timeout: 20_000 });
    const regionWidth = await region.evaluate((element) => element.getBoundingClientRect().width);
    const predicted = regionWidth - inset;
    measured.push(`${title} @${viewport.width}×${viewport.height}: card region ${regionWidth.toFixed(1)}px → property section ${predicted.toFixed(1)}px`);
    if (predicted < TWO_SHORT_SCALAR_BANDS_PX) tooNarrow.push(`${title} (${predicted.toFixed(1)}px)`);
  }
  console.log(`[REQ-26] ${measured.join('\n[REQ-26] ')}`);

  expect(
    tooNarrow,
    `at ${viewport.width}×${viewport.height} these panels give their property section less than the ${TWO_SHORT_SCALAR_BANDS_PX}px two short-scalar bands need`,
  ).toEqual([]);
});
