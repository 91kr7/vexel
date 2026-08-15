import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { managerSwarmFixture, stubSwarmReading } from './support/swarm-reading.js';
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
 * ---
 *
 * **Relocated, and the figures re-taken, on 2026-08-15 — batch 12 of
 * `plan-ui-coherence-optimisation` (REQ-52 … REQ-55) deleted the surface the
 * original decision was measured on.**
 *
 * Everything above was measured on the swarm screen's **half-width quadrant card
 * and the hand-built card list inside it**. Batch 12 deleted both: the
 * inventories are stacked at the content column's full width, `QuadPanelLayout`
 * left the client with them, and a row's reveal is a `DetailPanel`. The
 * measurement could not stay where it was, and pointing it at the card list's
 * last remaining sites would have bought one batch — that component is deleted
 * in batch 13 — and cost the same work twice.
 *
 * So the same rule is measured **where property columns now live**, on
 * `DetailPanel`'s own property section, and the amendment's figures are re-taken
 * on the geometry that survives batch 13. Three things did **not** change, and
 * they are what makes this a relocation rather than a loosening:
 *
 * - the rule — the count is derived from the section's own box against the
 *   content class's stated minimum, and no caller states a count;
 * - the method — the count is deduced from measured band positions, never from a
 *   class name or a prop;
 * - the discipline — the figures stay **pinned**, so a later change to a minimum,
 *   to the panel's width or to the layout is noticed instead of absorbed.
 *
 * The 360px short-scalar minimum is no longer named in this file, and its absence
 * is not a loosening: it was the minimum these swarm measurements were read
 * against, no swarm section is short-scalar any more, and the figure is still
 * stated and still certified where it belongs — `ui-library/specs/content-columns.md`
 * and batch 1's own checks. The amendment's refusal of a minimum under 329px is
 * untouched by everything below, which moves no minimum at all.
 *
 * Two things did change, both consequences of what the panels now hold:
 *
 * - **the class**, from short-scalar to `long-single-line`. The bands carry an
 *   image reference, environment lines, an address and the "never displayed"
 *   sentence — 56 to 60 character single-line values — and the class follows the
 *   content (`ui-library/specs/content-columns.md`; see also
 *   `test/unit/property-columns-contract.test.tsx`). So the minimum a column is
 *   measured against here is **560px, not 360px**;
 * - **the outcome at 1920**. The amendment recorded one column on a 682px
 *   half-width card and named what it cost: *"a taller card between roughly
 *   1920px and 2100px of viewport ... two columns return above it."* The card is
 *   gone and the section is the content column's width, so that cost is
 *   **repaid** rather than re-decided — the count at 1920 is what the rule derives
 *   from the width the section now has, and it is measured below rather than
 *   asserted from the old figure. The amendment's *reasoning* is untouched: it
 *   refused a minimum under 329px, and no minimum moved here.
 *
 * The cluster is answered **in the browser** (`support/swarm-reading.ts`), which
 * is what lets the real section be measured instead of predicted from a probe:
 * nothing initialises, joins or leaves a swarm, and the daemon is not touched.
 * Nothing assumes an empty daemon; each test passes on its own.
 */

/**
 * The stated minimum of a **long-single-line** pair band
 * (`--band-min-pair-long-single-line`), derived from the content in
 * `ui-library/specs/content-columns.md`: 435px of ink for a 60-character value,
 * plus 24px of band padding, plus the ~100px label run — 559px, taken to 560px.
 * It is the minimum the swarm sections are measured against since batch 12, for
 * the reason recorded in this file's header.
 */
const LONG_SINGLE_LINE_MIN_PX = 560;

/** What two long-single-line bands need side by side, by the rule itself. */
const TWO_LONG_SINGLE_LINE_BANDS_PX = 2 * LONG_SINGLE_LINE_MIN_PX + COLUMN_GAP_PX;

/** What the five surfaces stated for themselves, at every width, before the count was derived. */
const CALLER_STATED_COLUMNS = 2;

/**
 * The swarm property section, **re-taken on `DetailPanel`** at the three
 * viewports this plan is written against — the geometry that survives batch 13.
 *
 * Pinned rather than recomputed: a check that derived these from the same source
 * as the product would move with it and notice nothing. What each figure's moving
 * would mean is said in its own failure message.
 */
const RECORDED_ON_THE_PANEL: Record<number, { panelPx: number; sectionPx: number; columns: number }> = {
  1440: { panelPx: 1012, sectionPx: 1012, columns: 1 },
  1280: { panelPx: 852, sectionPx: 852, columns: 1 },
  375: { panelPx: 229, sectionPx: 229, columns: 1 },
};

/**
 * The ordinary widths the amendment to REQ-26 was argued at, re-taken on the same
 * panel.
 *
 * **The count at 1920 is 2 where the amendment recorded 1, and that is the loss
 * it named being repaid rather than its reasoning being overturned.** The
 * amendment accepted one column on a **682px half-width quadrant card** and wrote
 * down what it cost: *"a taller card between roughly 1920px and 2100px of
 * viewport ... two columns return above it."* Batch 12 deleted the card; the
 * section is the content column's width, 1492px at 1920, and the same rule
 * derives two. No minimum moved, no caller states a count, and the refusal of a
 * sub-329px minimum the amendment turned on is untouched.
 */
const RECORDED_AT_ORDINARY_WIDTHS: Record<number, { panelPx: number; sectionPx: number; columns: number }> = {
  1920: { panelPx: 1492, sectionPx: 1492, columns: 2 },
  2560: { panelPx: 2132, sectionPx: 2132, columns: 3 },
};

/**
 * How far a pinned figure may drift before it is a different measurement: a
 * couple of pixels of rounding, not a change of layout.
 */
const PIN_TOLERANCE_PX = 2;

/**
 * The count the layout engine derives at a measured width:
 * `floor((W + gap) / (minimum + gap))`, bounded below at one.
 *
 * The minimum is a **parameter** since batch 12: the coverage baseline is short
 * scalar and the swarm sections are long single-line, and one function that
 * assumed the first would silently mis-predict the second.
 */
function derivedColumns(sectionWidth: number, minimum: number): number {
  return Math.max(1, Math.floor((sectionWidth + COLUMN_GAP_PX) / (minimum + COLUMN_GAP_PX)));
}

/** A recorded figure, and what its moving would mean, said on the spot. */
function expectPinned(measured: number, recorded: number, reason: string): void {
  expect(
    measured,
    `${reason} — measured ${measured.toFixed(1)}px against the ${recorded}px on record (re-taken on DetailPanel, 2026-08-15)`,
  ).toBeGreaterThanOrEqual(recorded - PIN_TOLERANCE_PX);
  expect(
    measured,
    `${reason} — measured ${measured.toFixed(1)}px against the ${recorded}px on record (re-taken on DetailPanel, 2026-08-15)`,
  ).toBeLessThanOrEqual(recorded + PIN_TOLERANCE_PX);
}

const ORDINARY_VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

/**
 * The four swarm surfaces that state a property section, and the row a section is
 * opened from on each.
 *
 * `Stacks` is the fifth card and is deliberately absent: a stack's services are
 * carried by its own row rather than by a selection, so it reveals no property
 * section at all (`swarm/specs/swarm-configs-stacks-panel.md`).
 */
const SWARM_PANELS = ['Nodes', 'Services & tasks', 'Secrets', 'Configs'] as const;

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

/**
 * The swarm screen at `viewport`, with a cluster answered in the browser.
 *
 * The reading is stubbed for the reason `support/swarm-reading.ts` records: swarm
 * mode is a property of the whole daemon and this one is the operator's. What it
 * buys this file is that the property section can be **measured** rather than
 * predicted from a probe — the indirection the delivered version needed existed
 * only because the section could not be reached on a non-manager daemon at all.
 */
async function openSwarmScreen(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await stubSwarmReading(page, managerSwarmFixture());
  await openApp(page, 'swarm');
  await expect(page.getByRole('heading', { level: 1, name: 'Swarm' })).toBeVisible({ timeout: 20_000 });
  // The shell's own connection probe starts unreachable and settles asynchronously; a screen read
  // before it settles is read under a banner that is about to go, and every box below it belongs to
  // the runner's timing rather than to the layout.
  await expect(
    screenContent(page).locator('.ui-error-banner').filter({ hasText: 'Daemon unreachable' }),
    'the application could not reach the daemon, so nothing below measures the screen',
  ).toHaveCount(0, { timeout: 30_000 });
  await expect(screenContent(page).getByRole('heading', { level: 2, name: 'Stacks' })).toBeVisible({ timeout: 20_000 });
  await expect(screenContent(page).locator('.ui-data-table__row').first()).toBeVisible({ timeout: 20_000 });
}

/**
 * Opens the first row of one swarm inventory and returns the panel it reveals,
 * with the property section inside it.
 *
 * A row is selected **on its first cell, with a real pointer**: below the desktop
 * breakpoint the row is wider than the box it is read in, so its own centre can
 * sit over another column — or over a control (CLAUDE.md, "What a check drives,
 * and what it measures").
 */
async function openPropertySection(page: Page, title: string): Promise<{ panel: Locator; section: Locator }> {
  const card = screenContent(page)
    .locator('.ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: title, exact: true }) })
    .first();
  const cell = card.locator('.ui-data-table__row').first().locator('.ui-data-table__cell').first();
  await expect(cell, `the ${title} inventory lists nothing to open, so its property section cannot be measured`).toBeVisible({
    timeout: 20_000,
  });
  await cell.scrollIntoViewIfNeeded();
  const box = (await cell.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  const panel = card.locator('.ui-detail-panel');
  await expect(panel, `the ${title} row opened no detail panel`).toHaveCount(1, { timeout: 20_000 });
  return { panel, section: panel.locator('.ui-definition-list').first() };
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
 * **REQ-26's outcome on the swarm property section, re-taken on `DetailPanel` at
 * the three viewports this plan is written against.**
 *
 * This replaces the amendment's measurement of a half-width quadrant card, which
 * batch 12 deleted (see this file's header). It is the same rule on the surface
 * that now carries it, and it is pinned for the same reason the old one was: so
 * that the day the panel's width, the stated minimum or the layout moves, the
 * decision is revisited rather than silently outgrown.
 *
 * **A failure here is not a defect on its own.** It means the geometry REQ-26's
 * amendment is read against has changed again, and the amendment is what has to
 * be re-read.
 */
test('the four swarm panels: the property section on the detail panel, at 1440, 1280 and 375', async ({ page }) => {
  test.setTimeout(180_000);
  const measured: string[] = [];

  for (const width of [1440, 1280, 375]) {
    const viewport = { width, height: width === 375 ? 812 : width === 1280 ? 800 : 1000 };
    const recorded = RECORDED_ON_THE_PANEL[width]!;
    await openSwarmScreen(page, viewport);

    for (const title of SWARM_PANELS) {
      const { panel, section } = await openPropertySection(page, title);
      const panelWidth = await panel.evaluate((element) => element.getBoundingClientRect().width);
      const geometry = await measureSection(section, `the ${title} property section`);
      const predicted = derivedColumns(geometry.box.width, LONG_SINGLE_LINE_MIN_PX);
      const evidence = report(`${title} @${viewport.width}\u00d7${viewport.height}`, geometry);
      measured.push(
        `${evidence} — panel ${panelWidth.toFixed(1)}px — the rule derives ${predicted} column(s) at the ${LONG_SINGLE_LINE_MIN_PX}px long-single-line minimum (two bands need ${TWO_LONG_SINGLE_LINE_BANDS_PX}px)`,
      );

      // The panel is the width the stacked card gives it: the figure batch 12 bought, and the one
      // the section's own width follows from.
      expectPinned(
        panelWidth,
        recorded.panelPx,
        `${title} @${viewport.width}\u00d7${viewport.height} — the stacked card gives a swarm detail panel a different width from the one on record`,
      );
      expectPinned(
        geometry.box.width,
        recorded.sectionPx,
        `${title} @${viewport.width}\u00d7${viewport.height} — the width a swarm property section is given has moved off the figure on record`,
      );

      // **The count is what the rule derives from the measured width**, not a number written down:
      // the pin above is what notices the width moving, and this is what notices the arrangement
      // disagreeing with its own rule.
      expect(
        geometry.columns,
        `${evidence} — ${geometry.columns} column(s) drawn where the rule derives ${predicted} from the measured ${geometry.box.width.toFixed(1)}px at the ${LONG_SINGLE_LINE_MIN_PX}px minimum`,
      ).toBe(predicted);
      expect(
        geometry.columns,
        `${evidence} — the recorded outcome is ${recorded.columns} column(s), and the count drawn is no longer it: either the stated minimum, the panel or the layout has changed, and REQ-26's amendment is what has to be re-read before this number is updated`,
      ).toBe(recorded.columns);

      // The invariants that hold at every width on every consuming surface.
      expectLinesReadAsLines(geometry, evidence);
      expect(geometry.positionalOrder, `${evidence} — the positions read in a different order from the markup`).toEqual(geometry.documentOrder);
      expectNothingClippedOrOverlapped(geometry, evidence);

      // One detail is open at a time, so the row is closed again before the next inventory.
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0, { timeout: 20_000 });
    }
  }
  console.log(`[REQ-26] ${measured.join('\n[REQ-26] ')}`);
});

/**
 * **The ordinary widths the amendment was argued at, re-taken on the same panel.**
 *
 * The amendment recorded one column at 1920 on a 682px half-width card, and named
 * what it cost: *"a taller card between roughly 1920px and 2100px of viewport ...
 * two columns return above it."* That card is gone. What is measured here is the
 * count the **same rule** derives from the width the section now has, and whether
 * the density the caller-stated count used to give is back — which is REQ-26's
 * second clause, *"at ordinary widths their visible outcome is the same count or a
 * better one"*, on the surface that now carries the section.
 */
test('the four swarm panels: the ordinary-width outcome, at 1920 and 2560', async ({ page }) => {
  test.setTimeout(180_000);
  const measured: string[] = [];

  for (const width of [1920, 2560]) {
    const viewport = { width, height: width === 2560 ? 1440 : 1080 };
    const recorded = RECORDED_AT_ORDINARY_WIDTHS[width]!;
    await openSwarmScreen(page, viewport);

    for (const title of SWARM_PANELS) {
      const { panel, section } = await openPropertySection(page, title);
      const panelWidth = await panel.evaluate((element) => element.getBoundingClientRect().width);
      const geometry = await measureSection(section, `the ${title} property section`);
      const predicted = derivedColumns(geometry.box.width, LONG_SINGLE_LINE_MIN_PX);
      const evidence = report(`${title} @${viewport.width}\u00d7${viewport.height}`, geometry);
      measured.push(
        `${evidence} — panel ${panelWidth.toFixed(1)}px — the rule derives ${predicted} column(s) at the ${LONG_SINGLE_LINE_MIN_PX}px long-single-line minimum`,
      );

      expectPinned(
        panelWidth,
        recorded.panelPx,
        `${title} @${viewport.width}\u00d7${viewport.height} — the stacked card gives a swarm detail panel a different width from the one on record`,
      );
      expectPinned(
        geometry.box.width,
        recorded.sectionPx,
        `${title} @${viewport.width}\u00d7${viewport.height} — the width a swarm property section is given at an ordinary width has moved off the figure on record`,
      );
      expect(
        geometry.columns,
        `${evidence} — ${geometry.columns} column(s) drawn where the rule derives ${predicted} from the measured ${geometry.box.width.toFixed(1)}px`,
      ).toBe(predicted);
      expect(
        geometry.columns,
        `${evidence} — the recorded outcome is ${recorded.columns} column(s), and the count drawn is no longer it: REQ-26's amendment is what has to be re-read before this number is updated`,
      ).toBe(recorded.columns);

      // REQ-26's second clause, on the surface that carries the section now: the count the operator
      // sees is the caller-stated two, or better. The amendment recorded this as the one place it
      // was not, on a card the migration has since deleted.
      expect(
        geometry.columns,
        `${evidence} — ${geometry.columns} column(s) at an ordinary width, fewer than the ${CALLER_STATED_COLUMNS} this surface stated for itself before the count was derived`,
      ).toBeGreaterThanOrEqual(CALLER_STATED_COLUMNS);
      expect(
        geometry.box.width,
        `${evidence} — the section is given less than the ${TWO_LONG_SINGLE_LINE_BANDS_PX}px two long-single-line bands need`,
      ).toBeGreaterThanOrEqual(TWO_LONG_SINGLE_LINE_BANDS_PX);

      expectLinesReadAsLines(geometry, evidence);
      expectNothingClippedOrOverlapped(geometry, evidence);

      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0, { timeout: 20_000 });
    }
  }
  console.log(`[REQ-26] ${measured.join('\n[REQ-26] ')}`);
});
