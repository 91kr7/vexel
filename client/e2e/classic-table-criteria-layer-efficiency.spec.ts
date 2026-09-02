/**
 * **The classic-table criteria on the three lists batch 4 converts — the only
 * ones in the plan that live inside a dialog**: the efficiency & signals view's
 * deleted-later/overwritten files, duplicated content and flagged paths
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-2`
 * … `REQ-5`, `REQ-8` … `REQ-13`, `REQ-21`, `REQ-29`, `REQ-30`, `REQ-32`,
 * `REQ-36`, `REQ-39`, `REQ-40`).
 *
 * **The same instrument as batches 1 to 3, extended rather than copied**:
 * everything that measures a list lives in `support/classic-table.ts`, which the
 * other three criteria files use too. What this batch needed and did not find
 * there is a **region** — the boundary "one enclosing surface" is counted
 * against. For a screen list that is the shell's content column; for these three
 * it is the dialog, because the surface a dialog draws is *the dialog*: every
 * dialog in the product draws one, no list took it, and no list could give it up
 * without the library changing. So the count inside the dialog is REQ-4's, and
 * the count to the screen is asserted to be **exactly one more** — a section that
 * wrapped its list in a surface of its own would show up as two rather than being
 * absorbed by the boundary (`expectListInsideADialog`).
 *
 * **This screen's slot is the other one** (REQ-10, and the analysis's own
 * enumeration corrected in the plan): these lists carry **no** row content. What
 * a finding row carries below its cells is an **expansion** — drawn for the
 * selected row alone, directly under it, inside the same table — and the route
 * out of every finding is the button inside it. So what is driven here is not a
 * chip but `View layer n`, on all three lists, with a real pointer, and the
 * navigation it performs is followed to the layer explorer and read there.
 *
 * **The dialog is the case no other converted list has**: `size="large"`,
 * `max-height: 85vh`, scrolling vertically on its own. A list that pans
 * horizontally inside a surface that scrolls vertically is the one arrangement
 * in this plan that can swallow the pan, so at 1280×800 and at 375×812 each list
 * is panned with a **real wheel** and measured for it: the pan happens inside the
 * list, no column resolves to zero, nothing is cut off by the dialog's own edge,
 * and the list grows no vertical scrollbar of its own inside a dialog that has
 * one.
 *
 * **And every criterion is observed failing when its *subject* is absent**: the
 * first test below points the whole instrument at a dialog that was never opened
 * and asserts that it goes red rather than quietly measuring the screen behind
 * it. A guard whose premise can go empty is indistinguishable from a guard that
 * passes, and this plan has now met that shape three times.
 *
 * **Test discipline** (REQ-32): the analysis runs against an image **this file
 * builds, labels and removes** — `FROM alpine:3.20`, the suite's own mirrored
 * base, so nothing is fetched from Docker Hub — with the run's own data
 * directory, emptied before every test, so no analysis result is inherited from
 * another. The reference lists' own fixtures are two labelled containers and one
 * labelled tag; the daemon reset that opens every file is what removes them.
 * Nothing is asserted about a total, a count of the machine's objects, or a list
 * being empty.
 *
 * Every interaction is driven with a **real pointer at the visible control's own
 * coordinates**, never `element.click()` and never a dispatched event (CLAUDE.md,
 * "What a check drives, and what it measures").
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
// The dialog itself — its fixture image, the operator's path to it and the
// analysis that fills it — is `support/layer-efficiency-dialog.ts`, shared with
// the product-wide sweep so that both look at the same rows.
import {
  DIALOG_LISTS,
  IN_THE_DIALOG,
  analyzeTheImage,
  buildEfficiencyFixtureImage,
  clickAt,
  openTheAnalysedDialog,
  openTheDialog,
} from './support/layer-efficiency-dialog.js';
import { boxOf } from './support/settled.js';
import {
  LARGE_DIALOG_REGION,
  VIEWPORTS,
  expectClassicTable,
  expectListInsideADialog,
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
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

const DESKTOP: Viewport = VIEWPORTS[0];
const LAPTOP: Viewport = VIEWPORTS[1];
const PHONE: Viewport = VIEWPORTS[2];

/**
 * A list is named by a column only it carries — which is what makes the locator
 * survive the surface recomposition, the section header naming a list no longer
 * being inside its card (REQ-40). Inside this dialog the three lists share
 * `PATH`, so each is named by one of its own: `SUPERSEDED AT` for the wasted
 * files, `DUPLICATE` for the duplicated content, `PATTERN` for the flagged paths.
 */
const LISTS = {
  ...DIALOG_LISTS,
  images: 'DISK USAGE',
} as const;

// ---------------------------------------------------------------------------
// The fixtures: one image carrying at least two findings of each kind, and the
// reference lists' own rows.
// ---------------------------------------------------------------------------

const CASE_NAME = 'classic-table-layer-efficiency';
const RUN_SUFFIX = `${process.pid}-${Date.now()}`.slice(-12);
const FIXTURE_IMAGE = `vexel-e2e-efficiency-${RUN_SUFFIX}:v1`;
const referenceContainers = [`vexel-e2e-eff-ref-a-${RUN_SUFFIX}`, `vexel-e2e-eff-ref-b-${RUN_SUFFIX}`];
const referenceImage = `vexel-e2e-eff-ref-${RUN_SUFFIX}:1`;

test.beforeAll(async () => {
  await buildEfficiencyFixtureImage(FIXTURE_IMAGE, CASE_NAME);
  await ensureImage(ALPINE_IMAGE);
  for (const name of referenceContainers) {
    await execFileAsync('docker', [
      'run',
      '-d',
      '--name',
      name,
      ...ownershipArgs(CASE_NAME),
      '--entrypoint',
      'sleep',
      ALPINE_IMAGE,
      '900',
    ]);
  }
  await execFileAsync('docker', ['tag', ALPINE_IMAGE, referenceImage]);
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
  reportList(at, 'images (reference)', images, 'b4');

  return [{ name: 'images', list: images }];
}

/** The three lists of the open dialog, each measured in a pass of its own, inside the dialog. */
async function readTheThreeLists(page: Page, at: string): Promise<Record<string, ListGeometry>> {
  const wasted = await settledList(page, LISTS.wasted, IN_THE_DIALOG);
  const duplicated = await settledList(page, LISTS.duplicated, IN_THE_DIALOG);
  const flagged = await settledList(page, LISTS.flagged, IN_THE_DIALOG);
  const measured = { 'wasted files': wasted, 'duplicated content': duplicated, 'flagged paths': flagged };
  for (const [name, list] of Object.entries(measured)) reportList(at, name, list, 'b4');
  console.log(
    `[b4/REQ-40] ${at}: the dialog's own box is ${
      wasted.regionBox ? `${round(wasted.regionBox.width)}×${round(wasted.regionBox.height)} at x=${round(wasted.regionBox.x)}` : 'not on screen'
    }; each list holds ${JSON.stringify(
      Object.values(measured).map((list) => `${list.scrollWidth}px of row in ${list.clientWidth}px, inner scroll ${list.innerScroll.scrollHeight}/${list.innerScroll.clientHeight}`),
    )}`,
  );
  return measured;
}

/**
 * REQ-8, REQ-39 — **every line the row shows, painted in full inside the
 * reference's own fixed-height row**, judged on the rows the dialog is actually
 * showing.
 *
 * A row scrolled past the dialog's own window paints nothing, and a row straddling
 * its edge paints part: that is the window's doing and not the row's, exactly as
 * the shared instrument says of a screen's own viewport. What REQ-8 is about is a
 * line lost **inside** a row that is on screen, so the rows judged are the ones
 * lying wholly inside the dialog's box — and the count of them is asserted first,
 * because a filter that selected nothing would turn this into an assertion that
 * passes on any build.
 */
function expectRowsInTheWindowPaintedInFull(at: string, name: string, list: ListGeometry): void {
  const window = list.regionBox!;
  const onScreen = list.rows.filter((row) => row.box.y >= window.y - 0.5 && row.box.bottom <= window.bottom + 0.5);
  expect(
    onScreen.length,
    `${at} ${name}: the dialog is showing none of this list's ${list.rows.length} row(s) in full, so there is nothing to judge — ` +
      `its window is y=${round(window.y)}→${round(window.bottom)} and the rows are ${JSON.stringify(
        list.rows.map((row) => `${round(row.box.y)}→${round(row.box.bottom)}`),
      )}`,
  ).toBeGreaterThan(0);
  for (const row of onScreen) {
    expect(row.fullyVisible, `${at} ${name}: the row "${row.label}" is painted short of its own box`).toBe(true);
  }
  console.log(
    `[b4/REQ-8] ${at} ${name}: ${onScreen.length} of ${list.rows.length} row(s) lie wholly inside the dialog's window, each painted in full`,
  );
}

// ---------------------------------------------------------------------------
// The guard's own premise, first: red when the subject is absent.
// ---------------------------------------------------------------------------

/**
 * **The check goes red when there is no dialog to measure** — the second
 * counter-practice this plan carries, executed rather than claimed.
 *
 * A probe scoped to "the dialog" that quietly fell back to the document would
 * measure the images list *behind* the dialog and report a converted screen list
 * as though it were one of the three. That is not hypothetical: this plan has met
 * the empty-premise shape three times, the third by reading rather than running.
 * So the instrument is pointed at a dialog that was never opened, and both halves
 * are asserted — the measurement says it found nothing, and the expectation
 * written on that measurement **throws**.
 */
test('the criteria go red when the dialog they are about is not open — 1440×1000', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(DESKTOP);
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 30_000 });
  // The screen behind is genuinely drawing a converted list of its own, so what
  // is asserted below is the probe refusing to measure it, not an empty page.
  const behind = await settledList(page, LISTS.images);
  expect(behind.found, 'the images list is not on screen, so this test proves nothing about scoping').toBe(true);
  expect(behind.rows.length, 'the images list draws no row, so this test proves nothing about scoping').toBeGreaterThan(0);

  const absent = await measureList(page, LISTS.wasted, IN_THE_DIALOG);
  console.log(
    `[b4/REQ-29] with no dialog open: region matches ${absent.regionMatches}, list found ${absent.found}, rows ${absent.rows.length}`,
  );
  expect(absent.regionMatches, 'a dialog region was matched with no dialog open').toBe(0);
  expect(absent.found, 'the probe found a list inside a dialog that is not open').toBe(false);
  expect(absent.rows.length, 'the probe measured rows inside a dialog that is not open').toBe(0);
  expect(
    () => expectListInsideADialog('no dialog', 'wasted files', absent),
    'the dialog expectation passes on a dialog that was never opened',
  ).toThrow();
  expect(
    () => expectClassicTable('no dialog', 'wasted files', absent),
    'the classic-table criteria pass on a list that is not on screen',
  ).toThrow();
});

// ---------------------------------------------------------------------------
// The criteria, at the three viewports.
// ---------------------------------------------------------------------------

for (const viewport of VIEWPORTS) {
  const at = `${viewport.width}×${viewport.height}`;

  // REQ-2 … REQ-5, REQ-8, REQ-12, REQ-13, REQ-21, REQ-39, REQ-40 — the whole of
  // the criteria on the dialog's three lists, with the two reference lists read
  // in the same run so the equality is a comparison and not a coincidence.
  test(`the efficiency dialog's three lists are the reference table, not a table like it — ${at}`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize(viewport);

    const references = await readTheReference(page, at);
    const modal = await openTheAnalysedDialog(page, FIXTURE_IMAGE);
    const measured = await readTheThreeLists(page, at);

    for (const [name, list] of Object.entries(measured)) {
      // The premise of every junction below: two rows, so there is a junction at all.
      expect(list.rows.length, `${at} ${name}: the fixture image produced fewer than two findings of this kind`).toBeGreaterThan(1);
      expectClassicTable(at, name, list);
      expectSameTableAsReference(at, name, list, references);
      expectListInsideADialog(at, name, list);
      // REQ-8, REQ-39 — the reference's own two-line cell, carrying a title
      // alone, sits unclipped inside the reference's fixed-height row: a long
      // path is truncated on its line, never answered with a taller row.
      expectRowsInTheWindowPaintedInFull(at, name, list);
      // **REQ-8's own subject is absent here, and the check says so rather than
      // passing quietly.** These lists draw a title and no subtitle
      // (`layer-efficiency-view.md`: "`PATH` and `DUPLICATE` are the reference's
      // own two-line cell carrying a title alone"), so "both lines survive" has
      // nothing to quantify over on this screen — and a guard whose premise can
      // go empty is indistinguishable from one that passes. What is asserted
      // instead is the fact that makes it empty: no row of these lists shows a
      // second line, which is also REQ-13's claim that no value left the row.
      expect(
        list.rows.filter((row) => row.twoLine !== null).map((row) => row.label),
        `${at} ${name}: a row draws a subtitle, so this screen does have REQ-8's subject after all and it is going unmeasured`,
      ).toEqual([]);
      // REQ-12 — no column of any of them is drawn at no width at all.
      expect(list.zeroWidthCells, `${at} ${name}: a cell is in the DOM and nowhere on screen`).toEqual([]);
      // REQ-10 — the slot these lists use is the expansion, not the row content:
      // nothing is drawn below the cells of a row that was not selected.
      expect(
        list.rowContentBlocks,
        `${at} ${name}: ${list.rowContentBlocks} block(s) of row content under ${list.rows.length} row(s), where this screen's slot is the expansion`,
      ).toBe(0);
    }

    // Beside the boxes, the values the human reads (REQ-13): the columns each
    // list states, in order, and the findings this fixture image put there.
    expect(measured['wasted files'].headers, `${at}: the wasted files list does not state its columns in order`).toEqual([
      'PATH',
      'WRITTEN AT',
      'REASON',
      'SUPERSEDED AT',
      'SIZE',
    ]);
    expect(measured['duplicated content'].headers, `${at}: the duplicated content list does not state its columns in order`).toEqual([
      'DUPLICATE',
      'PATHS',
      'WASTED',
    ]);
    expect(measured['flagged paths'].headers, `${at}: the flagged paths list does not state its columns in order`).toEqual([
      'PATH',
      'PATTERN',
      'INTRODUCED AT',
      'REMOVED AT',
    ]);
    await expect(modal.getByText('data/waste-overwritten.bin'), `${at}: the overwritten file is not reported`).toBeVisible();
    await expect(modal.getByText('data/waste-deleted.bin').first(), `${at}: the deleted file is not reported`).toBeVisible();
    await expect(modal.getByText('root/.aws/credentials').first(), `${at}: the credential-looking path is not flagged`).toBeVisible();
    // …and the heuristic disclaimer the dialog is read under, which this batch does not touch.
    await expect(modal.getByText(/heuristic/i), `${at}: the heuristic disclaimer is gone`).toBeVisible();
  });
}

// ---------------------------------------------------------------------------
// The dialog case: a list that pans inside a surface that scrolls.
// ---------------------------------------------------------------------------

/**
 * REQ-12, REQ-21 — **the arrangement no other converted list is in**: a list
 * panning horizontally inside a dialog that scrolls vertically.
 *
 * At the two viewports the plan names for it, and driven by a **real wheel** over
 * a row of the list — never by assigning `scrollLeft`, which moves the grid to a
 * position no operator can reach. What is measured is that the pan happens
 * **inside the list**: the dialog itself gains no horizontal scroll of its own,
 * the last column arrives in view, no column resolves to zero, and nothing is cut
 * off by the dialog's own edge.
 */
for (const viewport of [LAPTOP, PHONE]) {
  const at = `${viewport.width}×${viewport.height}`;

  test(`each list pans inside the dialog, with nothing clipped by its edge — ${at}`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize(viewport);
    await openTheAnalysedDialog(page, FIXTURE_IMAGE);
    const measured = await readTheThreeLists(page, at);

    for (const [name, column] of [
      ['wasted files', LISTS.wasted],
      ['duplicated content', LISTS.duplicated],
      ['flagged paths', LISTS.flagged],
    ] as const) {
      const list = measured[name];
      expectListInsideADialog(at, name, list);
      expect(list.zeroWidthCells, `${at} ${name}: a cell is in the DOM and nowhere on screen`).toEqual([]);

      if (list.scrollWidth > list.clientWidth) {
        await expectPanReachesLastColumn(page, column, `${at} ${name}`, 'b4');
      } else {
        console.log(`[b4/REQ-12] ${at} ${name}: ${list.scrollWidth}px of row fits ${list.clientWidth}px, nothing to pan`);
      }

      // …and the pan stayed in the list: the dialog scrolls vertically and only
      // vertically, so a list that overflowed it sideways would be cut off by it
      // rather than panned.
      const dialog = await page.locator(LARGE_DIALOG_REGION).evaluate((element) => ({
        clientWidth: (element as HTMLElement).clientWidth,
        scrollWidth: (element as HTMLElement).scrollWidth,
        clientHeight: (element as HTMLElement).clientHeight,
        scrollHeight: (element as HTMLElement).scrollHeight,
      }));
      console.log(
        `[b4/REQ-12] ${at} ${name}: the dialog holds ${dialog.scrollWidth}px in ${dialog.clientWidth}px across and ${dialog.scrollHeight}px in ${dialog.clientHeight}px down`,
      );
      expect(
        dialog.scrollWidth,
        `${at} ${name}: the dialog itself holds ${dialog.scrollWidth}px in ${dialog.clientWidth}px, so the pan escaped the list`,
      ).toBeLessThanOrEqual(dialog.clientWidth + 1);

      // …and after the pan, the rows the dialog is showing are still drawn in
      // full. Read through `settledList`, which brings the list back into the
      // dialog's window first: the lists are read in turn and the dialog scrolls,
      // so a list measured where the previous one left the scroll would be judged
      // on rows the operator is not being shown.
      const panned = await settledList(page, column, IN_THE_DIALOG);
      expectRowsInTheWindowPaintedInFull(`${at} after the pan`, name, panned);
      expect(panned.zeroWidthCells, `${at} ${name}: after the pan a cell is in the DOM and nowhere on screen`).toEqual([]);
      for (const edge of panned.columnEdges) {
        expect(
          edge.worstDelta,
          `${at} ${name}: after the pan the ${edge.header || 'unnamed'} column drifts ${round(edge.worstDelta)}px from its header`,
        ).toBeLessThanOrEqual(0.5);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// The expansion: this screen's own slot, and the route out of every finding.
// ---------------------------------------------------------------------------

/** The table of one of the dialog's lists, and its rows, inside the dialog. */
function dialogList(page: Page, column: string): Locator {
  return tableWithColumn(page, column, IN_THE_DIALOG);
}

/**
 * Selects a row with a **real pointer on its own first cell** — the row's centre
 * can sit over another column, or over a control — and returns what the list
 * drew for it.
 */
async function selectRowAndReadTheExpansion(
  page: Page,
  column: string,
  index: number,
): Promise<{ expansions: number; underLabel: string; insideTheTable: boolean; insideTheDialog: boolean; gapAbove: number; buttons: string[] }> {
  const table = dialogList(page, column);
  const row = table.locator('.ui-data-table__row').nth(index);
  await clickAt(page, row.locator('.ui-data-table__cell').first(), `the row #${index + 1} of the ${column} list`);
  await expect(table.locator('.ui-data-table__expanded'), 'selecting the row opened no expansion').toBeVisible({ timeout: 20_000 });

  return await table.evaluate((element) => {
    const expansions = Array.from(element.querySelectorAll('.ui-data-table__expanded')).filter(
      (candidate) => candidate.closest('.ui-data-table') === element,
    );
    const expansion = expansions[0]!;
    const above = expansion.previousElementSibling;
    return {
      expansions: expansions.length,
      underLabel: (above?.textContent ?? '').trim().slice(0, 60),
      insideTheTable: expansion.closest('.ui-data-table') === element,
      insideTheDialog: expansion.closest('.ui-modal--size-large') !== null,
      gapAbove: expansion.getBoundingClientRect().top - (above?.getBoundingClientRect().bottom ?? Number.NaN),
      buttons: Array.from(expansion.querySelectorAll('button')).map((button) => (button.textContent ?? '').trim()),
    };
  });
}

/**
 * REQ-10, REQ-11, REQ-21 — **the expansion is this screen's slot**, and the
 * route out of a finding is the button inside it.
 *
 * On each of the three lists: selecting a finding opens its panel directly under
 * that row and inside the same table, a second selection on another row leaves
 * exactly one open and moves it there, and the button names the layer the row's
 * own column names.
 */
test('a finding expands under its own row inside the dialog, one at a time, on all three lists — 1440×1000', async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize(DESKTOP);
  await openTheAnalysedDialog(page, FIXTURE_IMAGE);

  for (const [name, column] of [
    ['wasted files', LISTS.wasted],
    ['duplicated content', LISTS.duplicated],
    ['flagged paths', LISTS.flagged],
  ] as const) {
    const list = await settledList(page, column, IN_THE_DIALOG);
    expect(list.rows.length, `${name}: fewer than two findings, so "opening another closes the first" has no subject`).toBeGreaterThan(1);
    const first = list.rows[0].label;
    const second = list.rows[1].label;

    const opened = await selectRowAndReadTheExpansion(page, column, 0);
    console.log(
      `[b4/REQ-10] 1440×1000 ${name}: selecting "${first}" opened ${opened.expansions} panel(s) under "${opened.underLabel}", ` +
        `${round(opened.gapAbove)}px below it, inside the table: ${opened.insideTheTable}, inside the dialog: ${opened.insideTheDialog}; ` +
        `it offers ${JSON.stringify(opened.buttons)}`,
    );
    expect(opened.expansions, `${name}: more than one panel is open in one list`).toBe(1);
    expect(opened.insideTheTable, `${name}: the panel is drawn outside the table its row belongs to`).toBe(true);
    expect(opened.insideTheDialog, `${name}: the panel is drawn outside the dialog`).toBe(true);
    expect(opened.underLabel, `${name}: the panel did not open directly below the row it belongs to`).toContain(first.slice(0, 20));
    expect(Math.abs(opened.gapAbove), `${name}: ${round(opened.gapAbove)}px of gap between the row and the panel it opened`).toBeLessThanOrEqual(0.5);
    expect(opened.buttons.length, `${name}: the finding offers no route to its layer at all`).toBeGreaterThan(0);
    expect(
      opened.buttons.every((label) => /layer \d+/i.test(label)),
      `${name}: a route out of the finding names no layer: ${JSON.stringify(opened.buttons)}`,
    ).toBe(true);

    // …and opening another closes the first.
    const moved = await selectRowAndReadTheExpansion(page, column, 1);
    console.log(`[b4/REQ-10] 1440×1000 ${name}: selecting "${second}" left ${moved.expansions} panel(s), under "${moved.underLabel}"`);
    expect(moved.expansions, `${name}: opening a second panel left the first one open`).toBe(1);
    expect(moved.underLabel, `${name}: the panel did not follow the row that was selected`).toContain(second.slice(0, 20));

    // The row's own columns still say what they said, and the button names the
    // same layer they do (REQ-13).
    const stated = await dialogList(page, column)
      .locator('.ui-data-table__row')
      .nth(1)
      .evaluate((row) => Array.from(row.querySelectorAll('.ui-data-table__cell')).map((cell) => (cell.textContent ?? '').trim()));
    console.log(`[b4/REQ-13] 1440×1000 ${name}: the selected row states ${JSON.stringify(stated)}`);
    const layersNamedByTheRow = stated.flatMap((value) => [...value.matchAll(/layer (\d+)/gi)].map((match) => match[1]));
    const layersNamedByTheButtons = moved.buttons.flatMap((label) => [...label.matchAll(/layer (\d+)/gi)].map((match) => match[1]));
    expect(layersNamedByTheButtons.length, `${name}: the panel's routes name no layer`).toBeGreaterThan(0);
    // The duplicated-content list names its layers in the expansion's own
    // buttons, one per path, where the row states the paths rather than their
    // layers; the other two state the layer in a column of their own, and that
    // is the one the button must name.
    if (layersNamedByTheRow.length > 0) {
      expect(
        layersNamedByTheButtons.some((layer) => layersNamedByTheRow.includes(layer)),
        `${name}: the row names layer(s) ${JSON.stringify(layersNamedByTheRow)} and its routes name ${JSON.stringify(layersNamedByTheButtons)}`,
      ).toBe(true);
    }
  }
});

/**
 * REQ-10, REQ-21 — **and the route is a route**: the button in the expansion
 * closes this view and opens the layer explorer at the layer it names.
 *
 * Driven on all three lists, because the three panels are three different
 * renderings — one button on a wasted file, one per path on a duplicate group,
 * one on a flagged path — and it is the finding's only way out. The layer the
 * explorer lands on is read from its own `#` column, which states the layer's
 * number padded to two digits.
 */
test('the route out of a finding opens the layer explorer at the layer it names — 1440×1000', async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize(DESKTOP);
  await openTheAnalysedDialog(page, FIXTURE_IMAGE);

  for (const [name, column] of [
    ['wasted files', LISTS.wasted],
    ['duplicated content', LISTS.duplicated],
    ['flagged paths', LISTS.flagged],
  ] as const) {
    const table = dialogList(page, column);
    await clickAt(page, table.locator('.ui-data-table__row').first().locator('.ui-data-table__cell').first(), `the first row of the ${name} list`);
    const route = table.locator('.ui-data-table__expanded button').first();
    await expect(route, `${name}: the finding offers no route to its layer`).toBeVisible({ timeout: 20_000 });
    const label = (await route.textContent())!.trim();
    const named = /layer (\d+)/i.exec(label)![1];

    await clickAt(page, route, `the "${label}" route of the ${name} list`);

    const explorer = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Layer stack — ${FIXTURE_IMAGE}` }) });
    await expect(explorer, `${name}: "${label}" opened no layer explorer`).toBeVisible({ timeout: 30_000 });
    const selected = explorer.locator('.ui-data-table__row--selected').first();
    await expect(selected, `${name}: the layer explorer opened with no layer selected`).toBeVisible({ timeout: 30_000 });
    const index = (await selected.locator('.ui-data-table__cell').first().innerText()).trim();
    console.log(`[b4/REQ-10] 1440×1000 ${name}: "${label}" opened the layer explorer at layer ${index}`);
    expect(index, `${name}: "${label}" opened the layer explorer at layer ${index}`).toBe(String(named).padStart(2, '0'));

    // Back to the dialog for the next list: the explorer is dismissed on its own
    // overlay, and the efficiency view — which the route closed — is opened again
    // from the row. Its second analysis is served from the shared changeset cache.
    await page.locator('.ui-modal-overlay').first().click({ position: { x: 5, y: 5 } });
    await expect(explorer).toHaveCount(0, { timeout: 20_000 });
    if (name !== 'flagged paths') {
      const modal = await openTheDialog(page, FIXTURE_IMAGE);
      await analyzeTheImage(page, modal, FIXTURE_IMAGE);
    }
  }
});

// ---------------------------------------------------------------------------
// The certified predecessors on this screen, named rather than assumed.
// ---------------------------------------------------------------------------

/**
 * REQ-36 — the certified predecessors this batch could disturb, asserted rather
 * than assumed: no row of these lists offers a copy affordance
 * (`plan-docker_management_app-copy_affordance_absence`), and the dialog holding
 * them stays inside the viewport at every viewport, which is the sizing rule
 * three new cards inside it could break
 * (`plan-docker_management_app-filesystem_browser_layout/REQ-20`,
 * `dialog-sizing.spec.ts`).
 */
test('no finding offers a copy, and the dialog stays inside the viewport at all three viewports', async ({ page }) => {
  test.setTimeout(900_000);
  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}×${viewport.height}`;
    await page.setViewportSize(viewport);
    await openTheAnalysedDialog(page, FIXTURE_IMAGE);

    const dialog = await boxOf(page.locator(LARGE_DIALOG_REGION), `${at}: the large dialog`);
    console.log(
      `[b4/REQ-36] ${at}: the dialog is ${round(dialog.width)}×${round(dialog.height)} at y=${round(dialog.y)} in a ${viewport.height}px viewport`,
    );
    expect(dialog.y, `${at}: the dialog starts above the top of the viewport`).toBeGreaterThanOrEqual(0);
    expect(
      round(dialog.y + dialog.height),
      `${at}: the dialog ends at y=${round(dialog.y + dialog.height)} in a ${viewport.height}px viewport`,
    ).toBeLessThanOrEqual(viewport.height + 1);
    expect(
      round(dialog.height),
      `${at}: the dialog is ${round(dialog.height)}px tall against its own 85vh cap of ${round(viewport.height * 0.85)}px`,
    ).toBeLessThanOrEqual(round(viewport.height * 0.85) + 1);

    const copyControls = await page.locator(LARGE_DIALOG_REGION).evaluate((element) => {
      const inside = Array.from(element.querySelectorAll<HTMLElement>('.ui-data-table__row *, .ui-data-table__expanded *'));
      return inside
        .filter((candidate) =>
          /copy/i.test(`${candidate.getAttribute('aria-label') ?? ''} ${candidate.getAttribute('title') ?? ''} ${candidate.textContent ?? ''}`),
        )
        .map((candidate) => `${candidate.tagName.toLowerCase()} "${(candidate.textContent ?? '').trim().slice(0, 40)}"`);
    });
    expect(copyControls, `${at}: a finding of these lists offers a copy affordance`).toEqual([]);
  }
});

// ---------------------------------------------------------------------------
// REQ-29 — the delivered figures, on record, before the change.
// ---------------------------------------------------------------------------

/** The figures each list is judged by. */
function figures(list: ListGeometry): {
  rows: number;
  gaps: number[];
  worstCarrierRadius: number;
  rowsOnASurface: number;
  surfacesInside: number;
  modifiers: string[];
  heights: number[];
  alignItems: string[];
  enclosingSurfacesInTheDialog: number;
  enclosingSurfacesToTheScreen: number;
  cardHolds: string[];
  tableInsetInItsCard: number;
  sectionHeaderInsideTheCard: boolean;
} {
  return {
    rows: list.rows.length,
    gaps: list.rowJunctions.map((junction) => round(junction.gap)),
    worstCarrierRadius: Math.max(0, ...list.rows.map((row) => row.carrierRadius)),
    rowsOnASurface: list.rows.filter((row) => row.isSurface).length,
    surfacesInside: list.surfacesInside,
    modifiers: [...new Set(list.rows.flatMap((row) => row.modifiers))],
    heights: [...new Set(list.rows.map((row) => round(row.height)))],
    alignItems: [...new Set(list.rows.map((row) => row.alignItems))],
    enclosingSurfacesInTheDialog: list.enclosingSurfaces,
    enclosingSurfacesToTheScreen: list.enclosingSurfacesToTheScreen,
    cardHolds: list.cardHolds,
    tableInsetInItsCard: round(list.table.x - (list.card?.x ?? Number.NaN)),
    sectionHeaderInsideTheCard: list.sectionHeaderInsideCard,
  };
}

// plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-29, REQ-39, REQ-40 —
// the dialog's three lists, against the reference read in the same run.
test('the dialog’s three lists hold the criteria, with the reference’s own figures beside them', async ({ page, baseURL }) => {
  test.setTimeout(1_800_000);
  expect(baseURL, 'this run has no origin of its own').toBeTruthy();
  await page.setViewportSize(DESKTOP);
  const references = await readTheReference(page, 'after');
  await openTheAnalysedDialog(page, FIXTURE_IMAGE);
  for (const viewport of VIEWPORTS.slice(1)) {
    await page.setViewportSize(viewport);
    const at = `after ${viewport.width}×${viewport.height}`;
    const reading = await readTheThreeLists(page, at);
    for (const [name, list] of Object.entries(reading)) {
      console.log(`[b4/REQ-29] ${at} ${name}: ${JSON.stringify(figures(list))}`);
      expectListInsideADialog(at, name, list);
    }
  }
  await page.setViewportSize(DESKTOP);
  const after = await readTheThreeLists(page, 'after');

  for (const [name, list] of Object.entries(after)) {
    expectClassicTable('after', name, list);
    expectSameTableAsReference('after', name, list, references);
    expectListInsideADialog('after', name, list);
  }

  const reference = references[0].list.rows[0];
  for (const [name, list] of Object.entries(after)) {
    const reading = figures(list);
    console.log(
      `[b4/REQ-39] ${name}: inter-row gaps ${JSON.stringify(reading.gaps)}; worst row corner ${round(reading.worstCarrierRadius)}px; ` +
        `rows on a surface of their own ${reading.rowsOnASurface}; surfaces inside the table ${reading.surfacesInside}; ` +
        `row heights ${JSON.stringify(reading.heights)} against the reference row's ${round(reference.height)}px; ` +
        `align-items ${JSON.stringify(reading.alignItems)} against ${reference.alignItems}; ` +
        `modifiers ${JSON.stringify(reading.modifiers)} against ${JSON.stringify(reference.modifiers)}`,
    );
    console.log(
      `[b4/REQ-40] ${name}: ${reading.enclosingSurfacesInTheDialog} enclosing surface(s) inside the dialog ` +
        `(${reading.enclosingSurfacesToTheScreen} to the screen); the table inset in its own surface ` +
        `${round(reading.tableInsetInItsCard)}px; that surface holds [${reading.cardHolds.join(', ')}]`,
    );
    expect(list.rows.length, `${name}: the list reports no finding at all`).toBeGreaterThan(0);
  }
});
