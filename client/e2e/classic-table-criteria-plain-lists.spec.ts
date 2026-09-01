/**
 * **The classic-table criteria, on the lists batch 2 converts** — builders and
 * build cache, contexts and both plugin inventories. Swarm's nodes, services and
 * secrets, and the nested tasks list beside them, left with the area on
 * 2026-08-27 (plan-docker_management_app-swarm_removal/REQ-1)
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-2`
 * … `REQ-5`, `REQ-8` … `REQ-13`, `REQ-16`, `REQ-17`, `REQ-18`, `REQ-20`,
 * `REQ-29`, `REQ-30`, `REQ-32`, `REQ-36`, `REQ-39`, `REQ-40`).
 *
 * **The same instrument as batch 1's check, not a second one**: everything that
 * measures a list and everything that says what "it is the containers table"
 * means lives in `support/classic-table.ts`, which `classic-table-criteria.spec.ts`
 * uses too. A criterion restated twice is a criterion that will one day be two,
 * and this plan exists because a target was described rather than pointed at.
 *
 * **The named case is the CLI plugins list's `WHY UNAVAILABLE` column**, which
 * the reference analysis read roughly 1100px from the values under it. It is
 * asserted as boxes, at 1440×1000 (REQ-18, REQ-29).
 *
 * **The inventories are stubbed at the browser's own request**, as the
 * per-screen geometry specs already stub them, and for the same reasons: a
 * daemon will not produce a builder whose endpoint is its own name or a managed
 * plugin on demand, and obtaining either would move state on the operator's own
 * machine (`docker plugin ls` is host-wide and no label can scope it). Nothing
 * here creates, changes or reads anything on the daemon **except** the two
 * fixtures the reference lists need — one container and one image tag, both
 * labelled and both removed in an `afterAll`, the container with `docker rm -fv`
 * (REQ-32). No assertion anywhere is about a total, a count of the machine's own
 * objects, or a list being empty.
 *
 * Every interaction is driven with a **real pointer at the visible control's own
 * coordinates**, never `element.click()` and never a dispatched event
 * (CLAUDE.md, "What a check drives, and what it measures").
 */
import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { stubTheInventories } from './support/screen-inventories.js';
import { boxOf, boxThisFrame, movePointerOverTheRow } from './support/settled.js';
import {
  VIEWPORTS,
  expectBothLinesUnclipped,
  expectClassicTable,
  expectPanReachesLastColumn,
  expectSameTableAsReference,
  measureList,
  reportList,
  round,
  settledList,
  tableWithColumn,
  type ListGeometry,
  type Viewport,
} from './support/classic-table.js';

const DESKTOP: Viewport = VIEWPORTS[0];
const PHONE: Viewport = VIEWPORTS[2];

/**
 * A list is named by a column only it has, which is what makes the locator
 * survive the surface recomposition: the section header naming the panel is no
 * longer inside the list's card (REQ-40), so a card can no longer be found by
 * the heading it used to hold.
 */
const LISTS = {
  builders: 'PLATFORMS',
  buildCache: 'BUILD STEP',
  contexts: 'TLS',
  cliPlugins: 'WHY UNAVAILABLE',
  daemonPlugins: 'INTERFACE',
  images: 'DISK USAGE',
} as const;

// ---------------------------------------------------------------------------
// The inventories, answered in the page.
//
// **Moved to `support/screen-inventories.ts` on 2026-08-16, by batch 4's own
// coverage** (`INT-4`): its product-wide sweep walks these same screens and owes
// them the same rows, and a fixture copied into a second file is a fixture that
// will one day be two. The data and the routing are unchanged — including why
// only readings are answered and every mutation is refused — and this file's
// measurements are taken through exactly the same stub as before.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The reference lists' own fixtures: one container and one image tag.
// ---------------------------------------------------------------------------

const RUN_ID = `${process.pid}-${Date.now()}`;
const referenceContainer = `vexel-e2e-plain-ref-${RUN_ID}`;
const referenceImage = `vexel-e2e-plain-ref-${RUN_ID}:1`;

test.beforeAll(async () => {
  // Ensured at the point of use, not once for the run: a prune spec in this suite prunes the host.
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    referenceContainer,
    ...ownershipArgs(referenceContainer),
    '--entrypoint',
    'sleep',
    ALPINE_IMAGE,
    '600',
  ]);
  await execFileAsync('docker', ['tag', ALPINE_IMAGE, referenceImage]);
});

test.afterAll(async () => {
  // `-fv` and not `-f`: without it an image's anonymous volumes outlive the container.
  await execFileAsync('docker', ['rm', '-fv', referenceContainer]).catch(() => undefined);
  await execFileAsync('docker', ['rmi', '-f', referenceImage]).catch(() => undefined);
});

/**
 * The reference list, read from the tree in this same run and in this same browser.
 *
 * **It was two, and the containers list left it on 2026-08-25**
 * (`plan-docker_management_app-containers_card_view/REQ-1`): that screen deliberately draws one card
 * per container now, and is the single named exception to the classic table
 * (`.../containers_card_view/REQ-63`). A screen that draws no table cannot be the table every other
 * list is compared against. The images list — still the classic table, and already the second
 * reference here — is what remains, and the comparison it takes part in is unchanged: each converted
 * list is measured against a reference row of this spec's own making, never against a total and
 * never against an emptiness.
 */
async function readTheReference(page: Page, at: string): Promise<{ name: string; list: ListGeometry }[]> {
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 20_000 });
  // The row this file created is what the reference is read on: never a total, never an emptiness.
  await expect(
    page.locator('.ui-data-table__row', { hasText: referenceImage }).first(),
    `${at}: the image this spec created is not listed, so the reference row may be anybody's`,
  ).toBeVisible({ timeout: 20_000 });
  const images = await settledList(page, LISTS.images);
  reportList(at, 'images (reference)', images, 'b2');

  return [{ name: 'images', list: images }];
}

/** The four screens this batch converts, measured in one pass each. */
async function readTheConvertedLists(page: Page, at: string): Promise<Record<string, ListGeometry>> {
  await openApp(page, 'builders-cache');
  await expect(page.getByRole('heading', { level: 1, name: 'Builders & cache' })).toBeVisible({ timeout: 20_000 });
  const builders = await settledList(page, LISTS.builders);
  const buildCache = await settledList(page, LISTS.buildCache);

  await openApp(page, 'contexts');
  await expect(page.getByRole('heading', { level: 1, name: 'Contexts' })).toBeVisible({ timeout: 20_000 });
  const contexts = await settledList(page, LISTS.contexts);

  await openApp(page, 'plugins');
  await expect(page.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible({ timeout: 20_000 });
  const cliPlugins = await settledList(page, LISTS.cliPlugins);
  const daemonPlugins = await settledList(page, LISTS.daemonPlugins);

  const measured = { builders, 'build cache': buildCache, contexts, 'CLI plugins': cliPlugins, 'daemon plugins': daemonPlugins };
  for (const [name, list] of Object.entries(measured)) reportList(at, name, list, 'b2');
  return measured;
}

for (const viewport of VIEWPORTS) {
  const at = `${viewport.width}×${viewport.height}`;

  // REQ-2 … REQ-5, REQ-8, REQ-12, REQ-16, REQ-17, REQ-18, REQ-20, REQ-39, REQ-40 —
  // the whole of the criteria on the five screen lists, with the two reference
  // lists read in the same run so the equality is a comparison and not a
  // coincidence.
  test(`the plain lists are the reference table, not a table like it — ${at}`, async ({ page }) => {
    test.setTimeout(420_000);
    await page.setViewportSize(viewport);
    await stubTheInventories(page);

    const references = await readTheReference(page, at);
    const measured = await readTheConvertedLists(page, at);

    for (const [name, list] of Object.entries(measured)) {
      expectClassicTable(at, name, list);
      expectSameTableAsReference(at, name, list, references);
    }

    // REQ-8 — "**Every row that shows a title over a subtitle** … shows every
    // line it shows today, unclipped and not hidden by overflow". Quantified over
    // the rows that draw two lines rather than over the lists, since only some of
    // these do: a builder's name over its driver and a context's over its kind
    // are the two-line cells here, and the same component, at the same size, sits
    // unclipped inside the reference's fixed-height row. A second line is not a
    // reason for a taller row (REQ-39), and this is where that is checked rather
    // than assumed.
    const twoLineLists = Object.entries(measured).filter(([, list]) => list.rows.some((row) => row.twoLine !== null));
    // The premise, so the loop cannot quietly become vacuous the day a cell
    // changes shape: there really are two-line rows to judge.
    expect(
      twoLineLists.map(([name]) => name).sort(),
      `${at}: the lists drawing a title over a subtitle are not the ones this batch converts`,
    ).toEqual(['builders', 'contexts']);
    for (const [name, list] of twoLineLists) expectBothLinesUnclipped(at, name, list);
    // …and beside the boxes, the values the human reads (REQ-13): every one of
    // them still on the row it belongs to.
    expect(
      measured.contexts.rows.some((row) => row.twoLine?.title === 'vexel-e2e-remote-prod'),
      `${at}: the contexts list lost the row naming a stubbed context`,
    ).toBe(true);
    expect(
      measured['CLI plugins'].headers,
      `${at}: the CLI plugins list does not state its four columns in order`,
    ).toEqual(['PLUGIN', 'VERSION', 'AVAILABILITY', 'WHY UNAVAILABLE']);
    expect(measured.builders.headers.includes('CACHE'), `${at}: the builders list lost its cache column`).toBe(true);

    // REQ-12 — below the desktop breakpoint the lists pan, and no column is drawn at no width.
    for (const [name, list] of Object.entries(measured)) {
      expect(list.zeroWidthCells, `${at} ${name}: a cell is in the DOM and nowhere on screen`).toEqual([]);
      console.log(`[b2/REQ-12] ${at} ${name}: holds ${list.scrollWidth}px of row in ${list.clientWidth}px`);
    }
  });
}

/**
 * REQ-12 — a list wider than the box it is read in pans under a **real wheel**,
 * and the pan brings its last column into view.
 *
 * At the phone breakpoint, where there is a pan at all, and screen by screen:
 * the wheel is delivered over a row of the list being panned, so the pointer has
 * to be on the screen that holds it.
 */
test('every converted list pans to its last column under a real wheel — 375×812', async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize(PHONE);
  await stubTheInventories(page);

  for (const [screen, heading, columns] of [
    ['builders-cache', 'Builders & cache', [LISTS.builders, LISTS.buildCache]],
    ['contexts', 'Contexts', [LISTS.contexts]],
    ['plugins', 'Plugins', [LISTS.cliPlugins, LISTS.daemonPlugins]],
  ] as const) {
    await openApp(page, screen);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({ timeout: 20_000 });
    for (const column of columns) {
      const list = await settledList(page, column);
      expect(list.found, `375×812 ${column}: the list is not on screen`).toBe(true);
      // A list whose columns fit the box it is read in has nothing to pan and
      // reaches every one of them already; one wider than its box must pan, and
      // the pan must arrive at the last column.
      if (list.scrollWidth > list.clientWidth) {
        await expectPanReachesLastColumn(page, column, `375×812 ${column}`, 'b2');
      } else {
        console.log(`[b2/REQ-12] 375×812 ${column}: ${list.scrollWidth}px of row fits ${list.clientWidth}px, nothing to pan`);
      }
    }
  }
});

/**
 * REQ-5 — "at every horizontal scroll offset": a header inset separately from
 * its rows drifts as soon as the two pan, which is the retired presentation's
 * own signature. Driven by a real wheel, at the one viewport where there is a
 * pan at all.
 */
test('the columns of a converted list hold their header at every pan offset — 375×812', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize(PHONE);
  await stubTheInventories(page);
  await openApp(page, 'contexts');
  await expect(page.getByRole('heading', { level: 1, name: 'Contexts' })).toBeVisible({ timeout: 20_000 });

  const rested = await settledList(page, LISTS.contexts);
  expect(rested.scrollWidth, 'contexts: there is no pan to measure a drift against').toBeGreaterThan(rested.clientWidth);

  const table = tableWithColumn(page, LISTS.contexts);
  const row = table.locator('.ui-data-table__row').first();
  await movePointerOverTheRow(page, row, 'the contexts row the wheel is delivered over');

  const offsets: string[] = [];
  for (let step = 0; step < 8; step += 1) {
    await page.mouse.wheel(120, 0);
    await page.waitForTimeout(200);
    const panned = await measureList(page, LISTS.contexts);
    const offset = await table.evaluate((element) => Math.round((element as HTMLElement).scrollLeft));
    offsets.push(`scrollLeft ${offset} → ${panned.columnEdges.map((edge) => `${edge.header || '·'}=${round(edge.worstDelta)}`).join(', ')}`);
    for (const edge of panned.columnEdges) {
      expect(
        edge.worstDelta,
        `contexts: at scrollLeft ${offset} the ${edge.header || 'unnamed'} column drifts ${round(edge.worstDelta)}px from its header`,
      ).toBeLessThanOrEqual(0.5);
    }
    if (offset >= rested.scrollWidth - rested.clientWidth) break;
  }
  console.log(`[b2/REQ-5] 375×812 contexts: ${offsets.join(' | ')}`);
  expect(offsets.length, 'contexts: a wheel over the list moved it to no offset at all').toBeGreaterThan(1);
});

/**
 * The named case, in the two figures it is actually made of.
 *
 * REQ-18 states it as a left edge — "the `WHY UNAVAILABLE` value and the header
 * naming it share one left edge, **measured as boxes**" — and that is asserted
 * below. But the ~1100px the human read is **not** that number, and this file
 * says so rather than letting a later reader take a green left-edge assertion
 * for the repair of what was reported. The analysis is explicit about both
 * halves: the `–` floated "roughly 1100px from the label that names it, **with
 * the row's own card boundary — a gap and two rounded corners — cutting the line
 * of sight between them**", and it records separately that the retired
 * presentation's header carried a **compensating inset** whose stated purpose
 * was to keep those left edges together (`data-table.css:122`, "the hybrid's own
 * confession"). A compensated header measures 0px of left drift while the value
 * is still unreadable as belonging to its column.
 *
 * So what the named case is measured as:
 *
 * - the **left edge** of the header cell against its column's, which REQ-18
 *   requires to be one edge and REQ-5 requires to hold by construction rather
 *   than by a compensation;
 * - the **vertical run** from the header to the last value it names, and the
 *   number of **surfaces cut across it** — the gap and the two rounded corners
 *   per row that the analysis names as what severed the line of sight. That is
 *   the 1100px, and it is what the conversion actually changes.
 */
function namedCase(list: ListGeometry): { headerX: number; leftDrift: number; verticalRun: number; surfacesBetween: number; gaps: number[] } {
  const column = list.columnEdges.find((candidate) => candidate.header === 'WHY UNAVAILABLE');
  const lastRow = list.rows[list.rows.length - 1];
  return {
    headerX: column?.headerX ?? Number.NaN,
    leftDrift: column?.worstDelta ?? Number.NaN,
    verticalRun: lastRow && list.headerBox ? lastRow.box.bottom - list.headerBox.bottom : Number.NaN,
    surfacesBetween: list.surfacesInside,
    gaps: list.rowJunctions.map((junction) => round(junction.gap)),
  };
}

function reportNamedCase(at: string, measured: ReturnType<typeof namedCase>, rows: number): void {
  console.log(
    `[b2/REQ-18] ${at} CLI plugins: WHY UNAVAILABLE header at x=${round(measured.headerX)}, its values ${round(
      measured.leftDrift,
    )}px from that edge; the column runs ${round(measured.verticalRun)}px from the label to the last value it names, ` +
      `across ${measured.surfacesBetween} surface(s) and ${measured.gaps.filter((gap) => gap > 0.5).length} gap(s), over ${rows} row(s)`,
  );
}

test('the WHY UNAVAILABLE column and its values share one left edge — 1440×1000', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize(DESKTOP);
  await stubTheInventories(page);
  await openApp(page, 'plugins');
  await expect(page.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible({ timeout: 20_000 });

  const cli = await settledList(page, LISTS.cliPlugins);
  const measured = namedCase(cli);
  expect(Number.isNaN(measured.leftDrift), '1440×1000: the CLI plugins list states no WHY UNAVAILABLE column at all').toBe(false);
  reportNamedCase('1440×1000', measured, cli.rows.length);

  expect(
    measured.leftDrift,
    `1440×1000: the WHY UNAVAILABLE value is ${round(measured.leftDrift)}px from the header naming it`,
  ).toBeLessThanOrEqual(0.5);
  // …and it is one edge because the two grids are laid on one set of tracks, not
  // because a header inset was tuned to hide the difference: nothing is drawn
  // between the label and the values it names.
  expect(
    measured.surfacesBetween,
    `1440×1000: ${measured.surfacesBetween} surface(s) cut the line of sight between WHY UNAVAILABLE and its values`,
  ).toBe(0);
  expect(
    measured.gaps.filter((gap) => gap > 0.5),
    '1440×1000: the column is interrupted by a gap between one value and the next',
  ).toEqual([]);

  // Beside the boxes: the column still says what it said — a reason on the
  // refused plugin, a dash on every plugin the installation runs (REQ-13).
  const refused = cli.rows.find((row) => row.label.includes('refused'));
  expect(refused, '1440×1000: the refused plugin is not listed').toBeDefined();
  const reason = await tableWithColumn(page, LISTS.cliPlugins)
    .locator('.ui-data-table__row', { hasText: 'refused' })
    .first()
    .locator('.ui-data-table__cell')
    .last()
    .textContent();
  expect(reason ?? '', '1440×1000: the refused plugin explains nothing').toContain('permission denied');
});

/**
 * REQ-36 — the certified predecessors on these screens, asserted rather than
 * assumed.
 *
 * **The switch that must not drag its surface out of the viewport** (bug-2 of
 * `plan-docker_management_app-detail_panel_density`) is the one that matters
 * here: the plugins list draws a `Toggle` in a column of every daemon row, and
 * the defect it was paid for was a control whose visually hidden input sat
 * 1346px from the switch it belongs to, so that focusing it scrolled the surface
 * off the screen. It is therefore driven with a **real pointer at the visible
 * control's own coordinates**, and what is measured is the surface's viewport
 * box before and after — not its content, which a surface carried off screen
 * keeps in full.
 *
 * And beside it, the absence of any copy affordance on these rows
 * (`plan-docker_management_app-copy_affordance_absence`).
 */
test('the switch does not move the surface it sits on, and no row offers a copy — 1440×1000', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize(DESKTOP);
  await stubTheInventories(page);
  await openApp(page, 'plugins');
  await expect(page.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible({ timeout: 20_000 });

  const daemon = tableWithColumn(page, LISTS.daemonPlugins);
  const row = daemon.locator('.ui-data-table__row').first();
  await expect(row).toBeVisible({ timeout: 20_000 });

  // The part of a switch a human actually clicks: the track. Never the visually
  // hidden input behind it, whose position is frequently the very thing under
  // examination.
  const track = row.locator('.ui-toggle__track').first();
  await track.scrollIntoViewIfNeeded();
  // **Single-frame on purpose, both halves.** What is under examination here is a *displacement*
  // across the interaction (CLAUDE.md, "A check that measures content cannot detect a defect that
  // moves position"), so the before and after readings are taken as they stand and are never
  // settled: a reading that waits for the layout to come back to rest is a reading of a different
  // question. The aim of the click below is the opposite case and is settled, because a pointer
  // sent to a stale box presses whatever has slid under it.
  const before = await boxThisFrame(daemon, 'the daemon plugins list before the switch');
  const trackBox = await boxOf(track, 'the switch track');
  expect(trackBox.y, 'the switch sits above the top of the viewport before it is even used').toBeGreaterThanOrEqual(0);
  await page.mouse.click(trackBox.x + trackBox.width / 2, trackBox.y + trackBox.height / 2);
  await page.waitForTimeout(500);

  const after = await boxThisFrame(daemon, 'the daemon plugins list after the switch');
  const trackAfter = await boxThisFrame(track, 'the switch track after it was used');
  console.log(
    `[b2/REQ-36] 1440×1000 daemon plugins: the list at y=${round(before.y)} before the switch and y=${round(after.y)} after; ` +
      `the switch itself at y=${round(trackBox.y)} → ${round(trackAfter.y)}`,
  );
  expect(
    Math.abs(after.y - before.y),
    `the switch moved the list it sits on by ${round(after.y - before.y)}px`,
  ).toBeLessThanOrEqual(1);
  expect(trackAfter.y, 'the switch dragged itself above the top of the viewport').toBeGreaterThanOrEqual(0);
  expect(trackAfter.y + trackAfter.height, 'the switch dragged itself below the bottom of the viewport').toBeLessThanOrEqual(DESKTOP.height);

  // …and nothing on these rows offers a copy.
  const copyControls = await page.evaluate(() => {
    const inside = Array.from(document.querySelectorAll<HTMLElement>('.ui-data-table__row *'));
    return inside
      .filter((element) =>
        /copy/i.test(`${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''} ${element.textContent ?? ''}`),
      )
      .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 40)}"`);
  });
  expect(copyControls, 'a row of these lists offers a copy affordance').toEqual([]);
});

// plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-29, REQ-18 — the
// converted lists, and the named case, against the reference read in the same run.
test('the converted lists hold the criteria, and the named case runs unbroken from its label', async ({ page, baseURL }) => {
  test.setTimeout(900_000);
  expect(baseURL, 'this run has no origin of its own').toBeTruthy();
  await page.setViewportSize(DESKTOP);
  await stubTheInventories(page);
  const references = await readTheReference(page, 'after');
  const after = await readTheConvertedLists(page, 'after');

  for (const [name, list] of Object.entries(after)) {
    expectClassicTable('after', name, list);
    expectSameTableAsReference('after', name, list, references);
  }

  const afterNamedCase = namedCase(after['CLI plugins']);
  reportNamedCase('after', afterNamedCase, after['CLI plugins'].rows.length);
  console.log(
    `[b2/REQ-18] the named case: left edge ${round(afterNamedCase.leftDrift)}px; the column's run from its label to its ` +
      `last value ${round(afterNamedCase.verticalRun)}px; surfaces cut across it ${afterNamedCase.surfacesBetween}; ` +
      `gaps between one value and the next ${afterNamedCase.gaps.filter((gap) => gap > 0.5).length}`,
  );

  expect(afterNamedCase.leftDrift, 'the WHY UNAVAILABLE column drifts from the header naming it').toBeLessThanOrEqual(0.5);
  expect(afterNamedCase.surfacesBetween, 'a surface still cuts the line of sight from the label to its values').toBe(0);
  expect(
    afterNamedCase.gaps.filter((gap) => gap > 0.5).length,
    'the WHY UNAVAILABLE column is still broken by a gap between one value and the next',
  ).toBe(0);
});
