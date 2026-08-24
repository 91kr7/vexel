import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { expectCompletedThenSelfDismissed } from './support/progress-completion.js';
import { readOnceSettled } from './support/settled.js';
import { boxOf, clickAndExpectSurfaceUnmoved } from './support/surface-stability.js';
import { expectBandIsTheHeightOfItsControl, measureSearchBand } from './support/search-band-axis.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

/**
 * **The filesystem browser's interior, measured.** REQ ids belong to
 * `plan-docker_management_app-filesystem_browser_layout/requirements.md`.
 *
 * Everything here is a viewport box the browser reports (REQ-29). "The tree is
 * visible", "13 entries are listed" and "522 entries" are all true of the
 * screenshot in the bug report, so a check built on them passes on the delivered
 * defect; content assertions stand beside these where they answer a different
 * symptom, never instead of them (REQ-30). Every interaction is delivered by a
 * real pointer at the visible control's own coordinates (REQ-31).
 *
 * The fixture is the suite's mirrored `alpine:3.20` — thirteen root entries,
 * which is what makes a count of visible rows mean anything (REQ-33) — ensured
 * from the run's own registry and never from Docker Hub (REQ-36). Its extracted
 * state is established by the test itself: the run's data directory is emptied
 * before every single test, so nothing here is inherited. The image is shared
 * infrastructure the suite does not own, so nothing removes it; the intermediate
 * container the extraction creates is removed server-side by the run that made
 * it, and each test's own state is torn down in a `finally`.
 */

/** The viewport the report's numbers were taken at, and the one the floors are stated for. */
const DESKTOP = { width: 1280, height: 720 };
/** The taller viewport the region has to answer to (REQ-15): the delivered build measures the same 480px at both. */
const TALL = { width: 1280, height: 1000 };

/** The delivered row height, which this report does not change (REQ-18). */
const ROW_HEIGHT_PX = 32;
/** No interior gap of the body may exceed this, at any viewport size (REQ-1). */
const MAX_INTERIOR_GAP_PX = 32;
/** The floor for rows visible without scrolling the tree, at 1280 × 720 (REQ-13). */
const VISIBLE_ROWS_FLOOR = 10;
/** The same floor with both conditional bands present (REQ-13). */
const VISIBLE_ROWS_FLOOR_WITH_NOTES = 8;

test.use({ viewport: DESKTOP });

interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface BandGeometry {
  className: string;
  /** The band's own border box. */
  box: Rect;
  /** The band's **drawn** extent: the union of the boxes of what it holds — where a void inside a band shows up. */
  contentTop: number;
  contentBottom: number;
}

interface ScrollContainer {
  className: string;
  scrollHeight: number;
  clientHeight: number;
}

interface BodyGeometry {
  /** The dialog card: the glass surface's content, and the element the 85vh cap is on. */
  card: Rect;
  /** The card's inner height — its content box, what a card of that size actually offers. */
  cardInnerHeight: number;
  /** Whether the card itself has become a scroll container: the second scrollbar of the report (REQ-6). */
  cardScrolls: boolean;
  bodyScrolls: boolean;
  bandStackClassName: string;
  bands: BandGeometry[];
  /** The distance between what one band draws and what the next one draws, in order (REQ-1). */
  gaps: number[];
  /** The gap between the status row and the note under it — the surface's own band spacing (REQ-1). */
  statusToNoteGap: number;
  searchBand: { isDirectChildOfBandStack: boolean; parentClassName: string } | null;
  /** The tree-and-detail region (REQ-14). */
  region: Rect | null;
  /** Rows fully visible inside the tree's scrollport, the card's clipping box and the viewport at once (REQ-13). */
  visibleRowCount: number;
  /** Every row height measured, so a density change would be seen rather than assumed (REQ-18). */
  rowHeights: number[];
  /** Rows currently mounted, against the rows the tree currently holds — virtualisation, still working (REQ-25). */
  mountedRowCount: number;
  treeRowCapacity: number;
  scrollContainers: ScrollContainer[];
  treeScrollTop: number;
  cardScrollTop: number;
  viewportHeight: number;
}

/**
 * Measures the whole interior in one pass, so every number belongs to the same
 * layout.
 *
 * A band's **drawn** extent is the union of its children's boxes, not its own
 * border box, and that distinction is the whole of REQ-1: the delivered voids
 * are inside the search band's own box — a 240px band holding a 34px control —
 * so a measurement taken between band boxes reports a tidy 16px gap on a surface
 * with 103px of nothing above and below the control.
 */
/**
 * The browser dialog's layout, **once it has come to rest**: this is read after the window is resized under an open dialog, after a tree row is revealed and after text is typed into the search field.
 *
 * The pass below is what stops two figures coming from two frames; the sampler is
 * what stops the whole reading coming from a frame nobody sees (`support/settled.ts`).
 */
async function measureBody(page: Page): Promise<BodyGeometry> {
  return await readOnceSettled(
    page,
    () => measureBodyThisFrame(page),
    (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
  );
}

/** **One frame, and no test calls it**: the reader above is built out of it. */
async function measureBodyThisFrame(page: Page): Promise<BodyGeometry> {
  return page.evaluate((rowHeight) => {
    const rect = (element: Element): Rect => {
      const box = element.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
    };

    const card = document.querySelector('.ui-modal--size-large');
    if (!card) throw new Error('no large dialog is open to measure');
    const body = card.querySelector('.ui-modal__body');
    if (!body) throw new Error('the open dialog has no body');
    const bandStack = body.firstElementChild;
    if (!bandStack) throw new Error('the dialog body holds no band stack to measure');

    const scrolls = (element: Element): boolean => {
      const style = getComputedStyle(element);
      const scrollable = /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflowX}`);
      return scrollable && (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1);
    };

    const drawnExtent = (element: Element): { contentTop: number; contentBottom: number } => {
      const children = Array.from(element.children)
        .map((child) => child.getBoundingClientRect())
        .filter((box) => box.height > 0);
      if (children.length === 0) {
        const own = element.getBoundingClientRect();
        return { contentTop: own.top, contentBottom: own.bottom };
      }
      return {
        contentTop: Math.min(...children.map((box) => box.top)),
        contentBottom: Math.max(...children.map((box) => box.bottom)),
      };
    };

    const bands = Array.from(bandStack.children)
      .filter((band) => band.getBoundingClientRect().height > 0)
      .map((band) => ({ className: band.className, box: rect(band), ...drawnExtent(band) }));

    const gaps: number[] = [];
    for (let index = 1; index < bands.length; index += 1) gaps.push(bands[index]!.contentTop - bands[index - 1]!.contentBottom);

    const searchBandElement = card.querySelector('.ui-stream-search');
    const regionElement = card.querySelector('.ui-split-pane');
    const scrollport = card.querySelector('.ui-tree-view .ui-scroll-area');

    // What the operator can actually see of the tree: inside its own scrollport,
    // inside the card's clipping box (a card that has overflowed clips at its
    // padding edge) and inside the viewport, all three at once.
    const cardStyle = getComputedStyle(card);
    const cardBox = card.getBoundingClientRect();
    const clipTop = cardBox.top + Number.parseFloat(cardStyle.borderTopWidth);
    const clipBottom = cardBox.bottom - Number.parseFloat(cardStyle.borderBottomWidth);
    const rows = Array.from(card.querySelectorAll('.ui-tree-view__row'));
    const scrollportBox = scrollport?.getBoundingClientRect();
    const visibleTop = Math.max(clipTop, 0, scrollportBox?.top ?? 0);
    const visibleBottom = Math.min(clipBottom, window.innerHeight, scrollportBox?.bottom ?? window.innerHeight);
    const visibleRowCount = rows.filter((row) => {
      const box = row.getBoundingClientRect();
      return box.height > 0 && box.top >= visibleTop - 0.5 && box.bottom <= visibleBottom + 0.5;
    }).length;

    return {
      card: rect(card),
      cardInnerHeight:
        card.clientHeight - Number.parseFloat(cardStyle.paddingTop) - Number.parseFloat(cardStyle.paddingBottom),
      cardScrolls: scrolls(card),
      bodyScrolls: scrolls(body),
      bandStackClassName: bandStack.className,
      bands,
      gaps,
      statusToNoteGap: gaps[0] ?? Number.NaN,
      searchBand: searchBandElement
        ? {
            isDirectChildOfBandStack: searchBandElement.parentElement === bandStack,
            parentClassName: searchBandElement.parentElement?.className ?? '(none)',
          }
        : null,
      region: regionElement ? rect(regionElement) : null,
      visibleRowCount,
      rowHeights: rows.map((row) => row.getBoundingClientRect().height),
      mountedRowCount: rows.length,
      treeRowCapacity: scrollport ? Math.round(scrollport.scrollHeight / rowHeight) : 0,
      scrollContainers: Array.from(body.querySelectorAll('*'))
        .filter((element) => scrolls(element))
        .map((element) => ({ className: element.className, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight })),
      treeScrollTop: scrollport?.scrollTop ?? Number.NaN,
      cardScrollTop: card.scrollTop,
      viewportHeight: window.innerHeight,
    };
  }, ROW_HEIGHT_PX);
}

/** Every measurement of a run is wanted, not only the first one that disagrees: the numbers are the evidence (REQ-32). */
function report(label: string, geometry: BodyGeometry): string {
  return [
    `${label}: viewport ${geometry.viewportHeight}px`,
    `card ${geometry.card.height.toFixed(1)}px (inner ${geometry.cardInnerHeight.toFixed(1)}px, scrolls=${geometry.cardScrolls})`,
    `region ${geometry.region ? geometry.region.height.toFixed(1) : 'absent'}px`,
    `bands [${geometry.bands.map((band) => `${band.className}=${band.box.height.toFixed(1)}`).join(', ')}]`,
    `gaps [${geometry.gaps.map((gap) => gap.toFixed(1)).join(', ')}]`,
    `visible rows ${geometry.visibleRowCount}`,
    `scroll containers [${geometry.scrollContainers.map((container) => container.className).join(' | ') || 'none'}]`,
  ].join(' — ');
}

function imageRow(page: Page, text: string): Locator {
  return page.locator('.ui-data-table__row', { hasText: text }).first();
}

function browserDialog(page: Page): Locator {
  return page.locator('.ui-modal--size-large').filter({ has: page.getByRole('heading', { name: `Filesystem — ${ALPINE_IMAGE}` }) });
}

/**
 * Opens the browser through bug-2's delivered flow, with a real pointer at each
 * visible control: the row's overflow trigger, the menu entry, then the cost
 * warning's own button (REQ-31). Nothing calls an element's `click()` and
 * nothing aims at a hidden element.
 */
async function openBrowsedFilesystem(page: Page): Promise<Locator> {
  await ensureImage(ALPINE_IMAGE);
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
  await page.getByPlaceholder('Search reference or digest…').fill(ALPINE_IMAGE);
  const row = imageRow(page, ALPINE_IMAGE);
  await expect(row).toBeVisible({ timeout: 20_000 });

  // Opening and choosing retried as one gesture, over a settled list: the list keeps re-reading from
  // the daemon's own events, and any of the menu's specified dismissals (ui-library/specs/menu.md)
  // takes the entry away between two separately retried halves.
  await chooseFromRowOverflowMenu(page, row, 'Browse filesystem…');

  const dialog = browserDialog(page);
  await expect(dialog).toBeVisible();
  const warning = page.getByRole('heading', { name: `Confirm: ${ALPINE_IMAGE}` });
  await expect(warning).toBeVisible();
  await warning.locator('xpath=..').getByRole('button', { name: 'Extract' }).click();
  await expectCompletedThenSelfDismissed(page.getByRole('heading', { name: 'Extracting the filesystem' }).locator('xpath=..'), 120_000);

  await expect(dialog.getByText(/Freshly extracted/)).toBeVisible();
  await expect(dialog.locator('.ui-tree-view__row').first()).toBeVisible({ timeout: 20_000 });
  return dialog;
}

/** Closes the browser the way an operator does: a pointer on the dimmed scrim, well away from the card. */
async function closeBrowser(page: Page, dialog: Locator): Promise<void> {
  await page.locator('.ui-modal-overlay').click({ position: { x: 4, y: 4 } });
  await expect(dialog).toHaveCount(0);
}

/** Expands a root directory with a real pointer on its own caret, and waits for its children to arrive. */
async function expandRootDirectory(dialog: Locator, name: string, childName: string): Promise<void> {
  await dialog.locator('.ui-tree-view__row', { hasText: name }).first().locator('.ui-tree-view__caret').click();
  await expect(dialog.locator('.ui-tree-view__row', { hasText: childName }).first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Brings a row into the tree's window with the wheel, the way an operator
 * reaches one: the tree is virtualised, so a row far down the list is not in the
 * document at all until it is scrolled to, and no locator can wait for it.
 *
 * The pointer is placed over the tree before the wheel turns, so it is the tree
 * that receives the gesture and not whatever else is under the cursor.
 */
async function revealTreeRow(page: Page, dialog: Locator, name: string): Promise<Locator> {
  const row = dialog.locator('.ui-tree-view__row', { hasText: name }).first();
  const scrollport = await boxOf(dialog.locator('.ui-tree-view .ui-scroll-area'), "the tree's scrollport");
  // Near the top of the scrollport rather than at its centre: on a build whose
  // body overflows the dialog, the centre of a 480px region can lie below the
  // card's clipping edge — and a wheel turned there reaches nothing.
  await page.mouse.move(scrollport.x + scrollport.width / 2, scrollport.y + 16);
  for (let turn = 0; turn < 40 && (await row.count()) === 0; turn += 1) {
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(60);
  }
  await expect(row, `"${name}" never came into the tree's window`).toBeVisible({ timeout: 10_000 });
  return row;
}

/**
 * The index, among the tree's mounted expandable carets, of one whose **row lies wholly inside the
 * tree's scrollport** — a directory the operator can actually see and click — or `-1` when the tree
 * currently shows none.
 *
 * A virtualised tree mounts an overscan row or two past the fold: they are in the document, a
 * locator finds them, and a click on one is a click on a control nobody can see, which the runner
 * reaches by scrolling the tree first. Any measurement of "what moved the tree" would then be a
 * measurement of the harness (CLAUDE.md, "a real pointer at the visible control's own coordinates").
 */
async function visibleExpandableCaretIndex(dialog: Locator): Promise<number> {
  return dialog.evaluate((element) => {
    const scrollport = element.querySelector('.ui-tree-view .ui-scroll-area');
    if (!scrollport) throw new Error('the tree has no scrollport');
    const port = scrollport.getBoundingClientRect();
    return Array.from(element.querySelectorAll('.ui-tree-view__row .ui-tree-view__caret--expandable')).findIndex((caret) => {
      const row = caret.parentElement?.getBoundingClientRect();
      return row !== undefined && row.height > 0 && row.top >= port.top - 0.5 && row.bottom <= port.bottom + 0.5;
    });
  });
}

// REQ-1, REQ-2, REQ-3, REQ-6, REQ-13, REQ-14, REQ-15, REQ-18, REQ-25 — the height the dialog has is
// distributed by intent: intrinsic chrome, one elastic region, no interior void, one scroll
// container, and a region that answers to the viewport it is drawn in.
test('gives its height to the tree: no interior void, one elastic region, one scroll container, and more rows on a taller screen', async ({ page }) => {
  // The surface is established by the test itself — an extraction included — before a single
  // measurement is taken; the default per-test budget is for a single interaction.
  test.setTimeout(120_000);
  const dialog = await openBrowsedFilesystem(page);
  try {
    // A directory expanded first, so the tree genuinely has more rows than its
    // region can show: "exactly one scroll container" is only a claim about the
    // product where something actually scrolls.
    await expandRootDirectory(dialog, 'etc', 'hostname');

    const desktop = await measureBody(page);
    const evidence = report('1280 × 720', desktop);

    // (a) REQ-1 — no interior void: every gap between what two consecutive bands
    // draw, against the surface's own band spacing and against 32px absolute.
    expect(desktop.gaps.length, `${evidence} — the body holds fewer than two bands, so no gap could be measured`).toBeGreaterThan(0);
    for (const [index, gap] of desktop.gaps.entries()) {
      expect
        .soft(gap, `${evidence} — gap ${index} measures ${gap.toFixed(1)}px, over the ${MAX_INTERIOR_GAP_PX}px absolute bound`)
        .toBeLessThanOrEqual(MAX_INTERIOR_GAP_PX);
      expect
        .soft(
          gap,
          `${evidence} — gap ${index} measures ${gap.toFixed(1)}px, over twice the surface's own status-row-to-note spacing of ${desktop.statusToNoteGap.toFixed(1)}px`,
        )
        .toBeLessThanOrEqual(2 * desktop.statusToNoteGap);
    }

    // (b) REQ-2, REQ-3 — the band is a band of the stack itself, not a wrapper's
    // child: a call-site `Row` around it closes the void, breaks no rule and
    // leaves the shared control still wrong for the next surface.
    expect(desktop.searchBand, `${evidence} — the search band is not on screen at all`).not.toBeNull();
    expect.soft(
      desktop.searchBand!.isDirectChildOfBandStack,
      `${evidence} — the search band's root sits inside "${desktop.searchBand!.parentClassName}" instead of being a band of "${desktop.bandStackClassName}" itself: the void was closed at the call site, not in the control`,
    ).toBe(true);
    expectBandIsTheHeightOfItsControl('1280 × 720, the filesystem browser', await measureSearchBand(dialog.locator('.ui-stream-search')));

    // (c) REQ-14 — the region is at least half of what the dialog offers.
    expect(desktop.region, `${evidence} — there is no tree-and-detail region to measure`).not.toBeNull();
    expect.soft(
      desktop.region!.height / desktop.cardInnerHeight,
      `${evidence} — the tree-and-detail region takes ${desktop.region!.height.toFixed(1)}px of the dialog's ${desktop.cardInnerHeight.toFixed(1)}px inner height`,
    ).toBeGreaterThanOrEqual(0.5);

    // (d) REQ-13, REQ-18 — rows the operator can actually see, and the delivered density.
    expect.soft(
      desktop.visibleRowCount,
      `${evidence} — only ${desktop.visibleRowCount} tree rows are fully visible inside the tree's scrollport, the card and the viewport at once`,
    ).toBeGreaterThanOrEqual(VISIBLE_ROWS_FLOOR);
    for (const height of desktop.rowHeights) {
      expect.soft(height, `${evidence} — a tree row measures ${height.toFixed(1)}px against the delivered ${ROW_HEIGHT_PX}px`).toBeCloseTo(ROW_HEIGHT_PX, 0);
    }

    // (e) REQ-6 — one scroll container in the body, and the dialog is not one.
    expect.soft(
      desktop.scrollContainers.map((container) => container.className),
      `${evidence} — the body holds ${desktop.scrollContainers.length} scroll containers; exactly one, the tree's, is expected`,
    ).toHaveLength(1);
    expect(desktop.scrollContainers[0]!.className, `${evidence} — the one scrolling region of the body is not the tree's`).toContain('ui-scroll-area');
    expect.soft(desktop.bodyScrolls, `${evidence} — the dialog's own body element has become a scroll container`).toBe(false);
    expect.soft(desktop.cardScrolls, `${evidence} — the dialog card itself scrolls: the body overflows the surface meant to contain it`).toBe(false);

    // REQ-25 — a bounded, definite height is what keeps the tree virtualised:
    // "grow to fit" would mount every row of the expanded tree.
    expect.soft(
      desktop.treeRowCapacity,
      `${evidence} — the expanded tree holds only ${desktop.treeRowCapacity} rows, too few for virtualisation to be observable`,
    ).toBeGreaterThan(desktop.visibleRowCount * 2);
    expect.soft(
      desktop.mountedRowCount,
      `${evidence} — every one of the tree's ${desktop.treeRowCapacity} rows is mounted: the region stopped bounding the tree`,
    ).toBeLessThan(desktop.treeRowCapacity);

    // REQ-15 — the region answers to the screen it is drawn on. The delivered
    // build measures the same 480px at both heights.
    await page.setViewportSize(TALL);
    await expect(dialog).toBeVisible();
    const tall = await measureBody(page);
    const bothEvidence = `${evidence} || ${report('1280 × 1000', tall)}`;

    expect.soft(
      tall.region!.height,
      `${bothEvidence} — the region measures ${tall.region!.height.toFixed(1)}px on the taller screen against ${desktop.region!.height.toFixed(1)}px on the shorter one`,
    ).toBeGreaterThan(desktop.region!.height);
    expect.soft(
      tall.visibleRowCount,
      `${bothEvidence} — ${tall.visibleRowCount} rows are visible on the taller screen against ${desktop.visibleRowCount} on the shorter one`,
    ).toBeGreaterThan(desktop.visibleRowCount);
    for (const [index, gap] of tall.gaps.entries()) {
      expect.soft(gap, `${bothEvidence} — gap ${index} at 1280 × 1000 measures ${gap.toFixed(1)}px`).toBeLessThanOrEqual(MAX_INTERIOR_GAP_PX);
    }
    expect.soft(tall.cardScrolls, `${bothEvidence} — the dialog card scrolls at 1280 × 1000`).toBe(false);
  } finally {
    await closeBrowser(page, dialog);
  }
});

// REQ-11, REQ-12, REQ-26 — what an interaction may move, and what it may not: a selection moves
// neither the tree nor the row under the pointer, a long preview scrolls inside its own pane, and a
// search hit or a keyboard step scrolls the tree and never the dialog.
test('a selection, a long preview, a search hit and a keyboard step move the tree and never the dialog', async ({ page }) => {
  // Four interactions on one established surface, each with its own pointer work: the default
  // per-test budget is for a single one.
  test.setTimeout(150_000);
  const dialog = await openBrowsedFilesystem(page);
  try {
    await expandRootDirectory(dialog, 'etc', 'hostname');
    const tree = dialog.locator('.ui-tree-view');
    const scrollport = dialog.locator('.ui-tree-view .ui-scroll-area');

    // REQ-11 — the row the operator just clicked is still under the pointer, and
    // the tree neither moved nor changed width to make room for the detail pane.
    const treeBefore = await boxOf(tree, "the browser's tree");
    const rowBefore = await boxOf(dialog.locator('.ui-tree-view__row').first(), 'the first tree row');
    const stability = await clickAndExpectSurfaceUnmoved({
      page,
      surface: tree,
      surfaceName: "the browser's tree",
      control: dialog.locator('.ui-tree-view__row').first(),
      controlName: 'the first tree row',
    });
    const treeAfter = await boxOf(tree, "the browser's tree");
    expect(
      { width: treeAfter.width, x: treeAfter.x },
      `selecting an entry re-laid the tree out: it was ${treeBefore.width.toFixed(1)}px wide at x=${treeBefore.x.toFixed(1)} and is now ${treeAfter.width.toFixed(
        1,
      )}px wide at x=${treeAfter.x.toFixed(1)}`,
    ).toEqual({ width: treeBefore.width, x: treeBefore.x });
    expect(
      { x: stability.controlAfter.x, y: stability.controlAfter.y },
      `the clicked row moved out from under the pointer: from y=${rowBefore.y.toFixed(1)} to y=${stability.controlAfter.y.toFixed(1)}`,
    ).toEqual({ x: stability.controlBefore.x, y: stability.controlBefore.y });

    // REQ-12 — a long preview lengthens no dialog and moves no tree: it scrolls
    // inside the pane that holds it.
    const dialogBefore = await boxOf(dialog, 'the filesystem dialog');
    await (await revealTreeRow(page, dialog, 'passwd')).click();
    await expect(dialog.getByText('/etc/passwd')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.locator('.ui-content-viewer, .ui-code-viewer').first()).toBeVisible({ timeout: 15_000 });
    const withPreview = await measureBody(page);
    const previewEvidence = report('with a long preview open', withPreview);
    const dialogAfter = await boxOf(dialog, 'the filesystem dialog');
    const treeWithPreview = await boxOf(tree, "the browser's tree");

    expect(
      { y: dialogAfter.y, height: dialogAfter.height },
      `${previewEvidence} — the dialog changed box when a long preview was opened: ${dialogBefore.height.toFixed(1)}px at y=${dialogBefore.y.toFixed(
        1,
      )} became ${dialogAfter.height.toFixed(1)}px at y=${dialogAfter.y.toFixed(1)}`,
    ).toEqual({ y: dialogBefore.y, height: dialogBefore.height });
    expect(
      { y: treeWithPreview.y, height: treeWithPreview.height },
      `${previewEvidence} — the tree moved when a long preview was opened`,
    ).toEqual({ y: treeAfter.y, height: treeAfter.height });
    expect(withPreview.cardScrolls, `${previewEvidence} — the dialog card scrolls with a preview open`).toBe(false);
    expect(
      withPreview.scrollContainers.map((container) => container.className).join(' | '),
      `${previewEvidence} — the long preview does not scroll inside the pane holding it`,
    ).toContain('ui-split-pane__end');

    // REQ-26 — a search hit moves the highlighted row, and what scrolls to reach
    // it is the tree, never the dialog.
    const searchInput = dialog.locator('.ui-stream-search input');
    await searchInput.click();
    await searchInput.fill('e');
    await expect(dialog.locator('.ui-stream-search__indicator')).toBeVisible({ timeout: 20_000 });
    const next = dialog.getByRole('button', { name: 'Next' });
    const beforeSearch = await scrollport.evaluate((element) => element.scrollTop);
    let searchScrollTop = beforeSearch;
    for (let press = 0; press < 12 && searchScrollTop === beforeSearch; press += 1) {
      await next.click();
      await page.waitForTimeout(250);
      searchScrollTop = await scrollport.evaluate((element) => element.scrollTop);
      expect(await dialog.evaluate((element) => element.scrollTop), 'pressing Next scrolled the dialog').toBe(0);
    }
    expect(
      searchScrollTop,
      `no search hit ever scrolled the tree to reach the row it highlighted: its scrollTop stayed at ${beforeSearch}`,
    ).not.toBe(beforeSearch);
    const dialogAfterSearch = await boxOf(dialog, 'the filesystem dialog');
    expect({ y: dialogAfterSearch.y }, 'the dialog moved while the search navigated between matches').toEqual({ y: dialogBefore.y });

    // The same for the keyboard: ArrowDown walks past the fold and the tree is
    // what follows the selection. Wound back to the top of the tree first, with
    // the wheel, so what the walk produces is a change this test caused.
    await searchInput.fill('');
    await scrollport.evaluate((element) => element.scrollTo({ top: 0 }));
    await dialog.locator('.ui-tree-view__row').first().click();
    const beforeKeyboard = await scrollport.evaluate((element) => element.scrollTop);
    await tree.press('ArrowDown');
    for (let step = 0; step < 30; step += 1) await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    const afterKeyboard = await scrollport.evaluate((element) => element.scrollTop);
    expect(afterKeyboard, `walking down the tree with the keyboard never scrolled it: scrollTop stayed at ${beforeKeyboard}`).toBeGreaterThan(beforeKeyboard);
    expect(await dialog.evaluate((element) => element.scrollTop), 'walking down the tree with the keyboard scrolled the dialog').toBe(0);
  } finally {
    await closeBrowser(page, dialog);
  }
});

// REQ-16, REQ-26 and `ui-library/specs/tree-view.md` — **the other half of the reveal the fill mode
// introduces: what it may not move.** The rule reads "a selection or a search hit is brought into
// this container's window … so an operator's own scroll position is never overruled", and expanding
// a directory is neither of those two things: the operator asked for that directory's children, at
// the place in the tree they had scrolled to, and the tree they were looking at is where the answer
// has to appear. The delivered build revealed nothing at all and so moved nothing here; this check
// states what the mode is contracted to keep.
test('expanding a directory leaves the tree where the operator scrolled it', async ({ page }) => {
  test.setTimeout(120_000);
  const dialog = await openBrowsedFilesystem(page);
  const scrollport = dialog.locator('.ui-tree-view .ui-scroll-area');
  try {
    // A tree with more rows than its region can show, and a selection made near the top of it —
    // both with a real pointer at the control's own coordinates (REQ-31).
    await expandRootDirectory(dialog, 'etc', 'hostname');
    await dialog.locator('.ui-tree-view__row').first().click();
    await expect(dialog.locator('.ui-tree-view__row--selected')).toHaveCount(1);

    // The operator scrolls away from their selection, the way they reach a directory further down,
    // and stops as soon as one is **on screen**: the wheel turns until a caret's own row lies wholly
    // inside the tree's scrollport. A virtualised tree also mounts an overscan row or two beyond the
    // fold, and aiming at one of those is aiming at a control no operator can see or click — the
    // harness would then scroll the tree itself to reach it, and that scrolling, not the product's,
    // is what the comparison would be made of.
    const scrollportBox = await boxOf(scrollport, "the tree's scrollport");
    await page.mouse.move(scrollportBox.x + scrollportBox.width / 2, scrollportBox.y + 16);
    let caretIndex = -1;
    for (let turn = 0; turn < 12 && caretIndex === -1; turn += 1) {
      await page.mouse.wheel(0, 160);
      await page.waitForTimeout(150);
      caretIndex = await visibleExpandableCaretIndex(dialog);
    }
    expect(caretIndex, 'no expandable directory came fully into the tree’s scrollport, so there is nothing an operator could have expanded').toBeGreaterThanOrEqual(0);

    const scrolledTo = await scrollport.evaluate((element) => element.scrollTop);
    expect(scrolledTo, 'the tree never scrolled away from the selection, so nothing is being checked').toBeGreaterThan(ROW_HEIGHT_PX);

    // ...and expands the directory they can see, on its own caret, at its own coordinates: the click
    // lands where the control already is and scrolls nothing to get there (REQ-31).
    const caret = dialog.locator('.ui-tree-view__row .ui-tree-view__caret--expandable').nth(caretIndex);
    const expandedRowBefore = await boxOf(caret.locator('xpath=..'), 'the directory row being expanded');
    const port = await boxOf(scrollport, "the tree's scrollport");
    expect(
      expandedRowBefore.y >= port.y - 0.5 && expandedRowBefore.y + expandedRowBefore.height <= port.y + port.height + 0.5,
      `the directory this check is about to expand is at y=${expandedRowBefore.y.toFixed(1)}..${(expandedRowBefore.y + expandedRowBefore.height).toFixed(
        1,
      )} against a scrollport of ${port.y.toFixed(1)}..${(port.y + port.height).toFixed(1)}: it is not on screen, and the click would scroll the tree itself to reach it`,
    ).toBe(true);
    await caret.click();
    await page.waitForTimeout(1_500);

    expect(
      await scrollport.evaluate((element) => element.scrollTop),
      `expanding a directory scrolled the tree back from ${scrolledTo}px to the row selected earlier: the operator's own scroll position was overruled`,
    ).toBe(scrolledTo);
    const expandedRowAfter = await boxOf(caret.locator('xpath=..'), 'the directory row being expanded');
    expect(
      { y: expandedRowAfter.y },
      `the directory the operator expanded moved from y=${expandedRowBefore.y.toFixed(1)} to y=${expandedRowAfter.y.toFixed(1)}: its children were fetched onto a screen it is no longer on`,
    ).toEqual({ y: expandedRowBefore.y });
  } finally {
    await closeBrowser(page, dialog);
  }
});

// REQ-13, REQ-34 — the state no screenshot of the report contains: both conditional bands present at
// once. The floor drops to 8 and no further.
test('keeps 8 rows visible with both the refused-entries and the truncated-matches bands present', async ({ page }) => {
  test.setTimeout(120_000);
  const dialog = await openBrowsedFilesystem(page);
  try {
    await closeBrowser(page, dialog);

    // The refused-entries band, raised by the response alone: the extraction is
    // the one this test just ran, and only what the browser is told about it is
    // rewritten. Nothing on the daemon is touched.
    await page.route('**/filesystem/kept', async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { kept: boolean; summary?: Record<string, unknown> };
      if (body.kept && body.summary) body.summary.refusedCount = 3;
      await route.fulfill({ response, json: body });
    });

    const row = imageRow(page, ALPINE_IMAGE);
    await chooseFromRowOverflowMenu(page, row, 'Browse filesystem…');

    const reopened = browserDialog(page);
    await expect(reopened).toBeVisible();
    await expect(reopened.getByText(/entries were refused because/)).toBeVisible({ timeout: 20_000 });
    await expect(reopened.locator('.ui-tree-view__row').first()).toBeVisible({ timeout: 20_000 });

    // The truncated-matches band, raised by a fragment matching more entries
    // than the listing bound.
    const searchInput = reopened.locator('.ui-stream-search input');
    await searchInput.click();
    await searchInput.fill('e');
    await expect(reopened.getByText(/Showing the first \d+ of \d+ matches/)).toBeVisible({ timeout: 20_000 });

    const geometry = await measureBody(page);
    const evidence = report('1280 × 720, both conditional bands present', geometry);
    expect.soft(geometry.bands.length, `${evidence} — fewer bands than the two conditional ones plus the chrome`).toBeGreaterThanOrEqual(6);
    expect.soft(
      geometry.visibleRowCount,
      `${evidence} — only ${geometry.visibleRowCount} rows are fully visible with both conditional bands present`,
    ).toBeGreaterThanOrEqual(VISIBLE_ROWS_FLOOR_WITH_NOTES);
    for (const [index, gap] of geometry.gaps.entries()) {
      expect.soft(gap, `${evidence} — gap ${index} measures ${gap.toFixed(1)}px`).toBeLessThanOrEqual(MAX_INTERIOR_GAP_PX);
    }
    expect.soft(geometry.cardScrolls, `${evidence} — the dialog card scrolls with both conditional bands present`).toBe(false);

    await closeBrowser(page, reopened);
  } finally {
    await page.unroute('**/filesystem/kept').catch(() => undefined);
  }
});

test.describe('below the library’s narrow breakpoint', () => {
  // 600px of width: under the product's existing 720px phone breakpoint, and no new one is invented
  // for this surface (REQ-9).
  test.use({ viewport: { width: 600, height: 900 } });

  // REQ-9, REQ-16, REQ-34 — the two panes stack, the tree keeps the larger share, and every control
  // is still there.
  test('stacks the two panes with the tree first, keeping every control', async ({ page }) => {
    test.setTimeout(120_000);
    const dialog = await openBrowsedFilesystem(page);
    try {
      const panes = await dialog.evaluate((element) => {
        const start = element.querySelector('.ui-split-pane__start');
        const end = element.querySelector('.ui-split-pane__end');
        if (!start || !end) throw new Error('the dialog has no two-pane region');
        const startBox = start.getBoundingClientRect();
        const endBox = end.getBoundingClientRect();
        return {
          start: { top: startBox.top, bottom: startBox.bottom, height: startBox.height, left: startBox.left, right: startBox.right },
          end: { top: endBox.top, bottom: endBox.bottom, height: endBox.height, left: endBox.left, right: endBox.right },
        };
      });
      const evidence = `start ${panes.start.height.toFixed(1)}px at y=${panes.start.top.toFixed(1)}, end ${panes.end.height.toFixed(
        1,
      )}px at y=${panes.end.top.toFixed(1)}`;

      expect.soft(panes.end.top, `${evidence} — the detail pane still begins beside the tree rather than below it`).toBeGreaterThanOrEqual(panes.start.bottom - 1);
      expect.soft(panes.start.height, `${evidence} — the tree does not keep the larger share of the stacked height`).toBeGreaterThan(panes.end.height);

      // Content assertions, standing beside the geometry and never instead of it (REQ-30).
      await expect(dialog.getByRole('button', { name: 'Re-extract…' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Download whole filesystem…' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Next' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Previous' })).toBeVisible();
      await expect(dialog.locator('.ui-stream-search input')).toBeVisible();
      await expect(dialog.locator('.ui-tree-view__row').first()).toBeVisible();
    } finally {
      await closeBrowser(page, dialog);
    }
  });
});
