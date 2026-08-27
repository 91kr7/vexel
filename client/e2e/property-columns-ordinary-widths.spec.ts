import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import {
  COLUMN_GAP_PX,
  SHORT_SCALAR_RUN_MAX_PX,
  expectLinesReadAsLines,
  expectNothingClippedOrOverlapped,
  measureSection,
  report,
} from './support/property-bands.js';

/**
 * **The half of REQ-26 that is about the ordinary width, not the narrow one.**
 * REQ ids belong to `plan-docker_management_app-detail_property_columns`.
 *
 * REQ-26 makes two statements about the surfaces that used to state their own
 * count. The narrow one — one column and nothing wrapped at ~400px — is measured
 * by `property-columns-derived-count.spec.ts`. The second is *"at ordinary widths
 * their visible outcome is the same count or a better one"*, and it is the one a
 * derived count can quietly cost: the caller-stated count was two **at every
 * width**, so any width at which the derived rule yields one is a density the
 * operator had and no longer has.
 *
 * **They were five, and four of them were the swarm screen's panels**; they left
 * with the area on 2026-08-27 (plan-docker_management_app-swarm_removal/REQ-1),
 * and with them the pinned geometry the amendment to REQ-26 was re-read against.
 * The About screen's coverage baseline is the surface that remains, it needs no
 * cluster, and REQ-26's second clause is asserted on it here in full.
 *
 * Nothing assumes an empty daemon; each test passes on its own.
 */

/** What the surface stated for itself, at every width, before the count was derived. */
const CALLER_STATED_COLUMNS = 2;

const ORDINARY_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

/**
 * REQ-26 on the surface that remains: the About screen's coverage baseline. It has the content width to itself, so its ordinary-width
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
