/**
 * F1 — every navigation destination is reachable, at every viewport
 * (plan-ui-coherence-optimisation/REQ-1 … REQ-5).
 *
 * Two rules of `CLAUDE.md` decide the shape of every check in this file, and
 * both were paid for by a shipped defect:
 *
 * - **A real pointer, at the visible control's own coordinates.** The delivered
 *   defect is precisely that the click does not reach the control, which
 *   `HTMLElement.click()` and a dispatched event cannot see: they need no hit
 *   test and move no focus. Every activation of a navigation entry below is
 *   `page.mouse.click()` at the entry's measured centre — never the element's
 *   own `click()`, never an event.
 * - **Geometry, not content.** All thirteen entries were in the DOM throughout
 *   the defect, at their laid-out coordinates, merely clipped away and never
 *   painted: a count of rendered entries passed the whole time. What is asserted
 *   here is therefore boxes — the entry inside the viewport, inside the region
 *   that clips it, clear of the footer card — and a hit test at the centre of
 *   each one.
 *
 * REQ-2 is written in the form the batch restates it in: its literal form (the
 * entries' and the card's boxes must not intersect) is unsatisfiable while the
 * entries overflow, since an un-scrolled scroll region lays its overflowing
 * content out beyond its own box while never painting it there. What is
 * satisfiable, and what an operator can observe, is that **each entry, scrolled
 * into view, is hit-testable at its own centre, inside the viewport, clear of
 * the card, and navigates when clicked** — and that the region that clips the
 * entries never intersects the card.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { navEntry, openApp } from './support/fixtures.js';
import { boxOf } from './support/settled.js';

/** A rectangle in viewport coordinates, as the browser reports it. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Viewport {
  width: number;
  height: number;
}

/**
 * The twelve destinations REQ-1 names, in the order the rail lists them. The
 * screen each one opens carries a level-1 heading of the same words, which is
 * how "the click actually changes the screen" is observed.
 */
const DESTINATIONS = [
  'Dashboard',
  'Containers',
  'Compose',
  'Images & layers',
  'Volumes & networks',
  'Registries',
  'Builders & cache',
  'Contexts',
  'Plugins',
  'System & prune',
  'Raw console',
  'About',
] as const;

/** The screen the sweep starts on: the last of the twelve, so that every one of the twelve clicks is a change. */
const STARTING_SCREEN = { id: 'coverage-matrix', label: 'About' };

/** Below this width the rail has left the flex flow and is the off-canvas drawer (frame.md). */
const PHONE_BREAKPOINT = 720;

const VIEWPORTS: Viewport[] = [
  { width: 1440, height: 1000 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
  { width: 375, height: 667 },
];

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function describeBox(box: Box): string {
  return `x=${round(box.x)}, y=${round(box.y)}, ${round(box.width)}×${round(box.height)} (y ${round(box.y)}–${round(box.y + box.height)})`;
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Whether `inner` lies wholly within `outer`; one pixel of tolerance absorbs sub-pixel layout. */
function contains(outer: Box, inner: Box, tolerance = 1): boolean {
  return (
    inner.x >= outer.x - tolerance &&
    inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
  );
}

/**
 * The element's box once it has stopped moving.
 *
 * The drawer slides in on a `transform` transition, so a box read the instant
 * it opens is a box of a surface still in flight — and every assertion here is
 * about where a surface actually is.
 */
async function stableBox(target: Locator, description: string): Promise<Box> {
  // One of the settle primitives this suite had grown a dozen of; it now asks the shared reader
  // (`support/settled.ts`), which samples on frames rather than on a 50ms timer and discards its
  // first reading.
  return await boxOf(target, description);
}

/** What the browser finds at a point, and whether it is the control an operator is aiming at. */
async function hitTestAtCentre(entry: Locator, centre: { x: number; y: number }): Promise<{ hit: boolean; found: string }> {
  return await entry.evaluate((node, point) => {
    const element = document.elementFromPoint(point.x, point.y);
    if (element === null) return { hit: false, found: 'nothing at all' };
    const classes = typeof element.className === 'string' && element.className.trim().length > 0 ? `.${element.className.trim().split(/\s+/).join('.')}` : '';
    return { hit: element === node || node.contains(element), found: `${element.tagName.toLowerCase()}${classes}` };
  }, centre);
}

/** Opens the off-canvas drawer at the phone breakpoint, waiting for it to have arrived. */
async function openDrawer(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  await expect(toggle, 'the phone breakpoint offers no control that opens the navigation drawer').toBeVisible();
  await toggle.click();
  await expect(page.locator('.ui-frame__rail--open')).toBeVisible();
}

/**
 * Drives the thirteen destinations at one viewport and returns the measurements
 * taken, so the run reports figures rather than a bare pass (REQ-90).
 */
async function everyDestinationReachable(page: Page, viewport: Viewport): Promise<string[]> {
  const phone = viewport.width < PHONE_BREAKPOINT;
  const at = `@${viewport.width}×${viewport.height}`;
  const viewportBox: Box = { x: 0, y: 0, width: viewport.width, height: viewport.height };

  await page.setViewportSize(viewport);
  await openApp(page, STARTING_SCREEN.id);
  await expect(page.getByRole('heading', { level: 1, name: STARTING_SCREEN.label })).toBeVisible({ timeout: 20_000 });

  const rail = page.locator('.ui-nav-rail');
  const region = page.locator('.ui-nav-rail__groups');
  const card = rail.locator('.ui-footer-status');

  const measurements: string[] = [];
  let reached = 0;

  for (const label of DESTINATIONS) {
    if (phone) await openDrawer(page);

    // The rail card is wholly on screen, at every breakpoint: docked it is
    // bounded by the frame, and as the drawer it is bounded by its two insets
    // — which is the half REQ-4 names, the delivered drawer hanging its bottom
    // below the viewport.
    const railBox = await stableBox(rail, 'the rail card');
    expect(
      contains(viewportBox, railBox),
      `${at}: the rail card is not wholly inside the viewport — ${describeBox(railBox)} against a ${viewport.width}×${viewport.height} viewport (REQ-2, REQ-4)`,
    ).toBe(true);

    const cardBox = await stableBox(card, 'the active-context footer card');
    const regionBox = await stableBox(region, 'the entry region');

    // The footer card keeps its size and its place at the bottom of the rail
    // and is never overlapped: the region that clips the entries and the card
    // are two boxes that do not meet (REQ-2).
    expect(contains(viewportBox, cardBox), `${at}: the footer card is not wholly inside the viewport — ${describeBox(cardBox)} (REQ-2)`).toBe(true);
    expect(contains(railBox, cardBox), `${at}: the footer card is painted outside the rail card — ${describeBox(cardBox)} against ${describeBox(railBox)} (REQ-2)`).toBe(true);
    expect(contains(railBox, regionBox), `${at}: the entry region is painted outside the rail card — ${describeBox(regionBox)} against ${describeBox(railBox)} (REQ-2)`).toBe(true);
    expect(
      intersects(regionBox, cardBox),
      `${at}: the region holding the entries and the footer card overlap — ${describeBox(regionBox)} against ${describeBox(cardBox)} (REQ-2)`,
    ).toBe(false);

    const entry = navEntry(page, label);
    // Reaching an entry beyond the cut is a scroll, not a resize
    // (navigation-primitives.md): the scroll is what an operator does, and the
    // measurement is taken after it, never instead of it.
    await entry.scrollIntoViewIfNeeded();
    const entryBox = await stableBox(entry, `the "${label}" entry`);
    const centre = { x: entryBox.x + entryBox.width / 2, y: entryBox.y + entryBox.height / 2 };

    expect(
      contains(viewportBox, entryBox),
      `${at}: the "${label}" entry is not inside the viewport once scrolled into view — ${describeBox(entryBox)} against a ${viewport.width}×${viewport.height} viewport (REQ-1, REQ-4)`,
    ).toBe(true);
    expect(
      contains(regionBox, entryBox),
      `${at}: the "${label}" entry is not inside the region that clips the entries — ${describeBox(entryBox)} against ${describeBox(regionBox)} (REQ-2, REQ-4)`,
    ).toBe(true);
    expect(
      intersects(entryBox, cardBox),
      `${at}: the "${label}" entry and the footer card paint over each other — ${describeBox(entryBox)} against ${describeBox(cardBox)} (REQ-2)`,
    ).toBe(false);

    const { hit, found } = await hitTestAtCentre(entry, centre);
    expect(
      hit,
      `${at}: a hit test at the centre of the "${label}" entry (${round(centre.x)}, ${round(centre.y)}) returns ${found}, not the entry — the click cannot reach the control (REQ-1)`,
    ).toBe(true);

    // A real pointer at the control's own coordinates. Never `element.click()`,
    // never a dispatched event: a programmatic activation needs no hit test and
    // is blind to this defect (REQ-1, REQ-88).
    await page.mouse.click(centre.x, centre.y);

    await expect(
      page.getByRole('heading', { level: 1, name: label }),
      `${at}: a real click at the centre of the "${label}" entry did not change the screen (REQ-1)`,
    ).toBeVisible({ timeout: 20_000 });
    const active = page.locator('[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active, `${at}: the screen changed but the rail does not mark "${label}" active (REQ-1)`).toHaveAccessibleName(new RegExp(label));

    reached += 1;
    measurements.push(`${at} "${label}": entry ${describeBox(entryBox)}, card ${describeBox(cardBox)}, hit ${found}`);
  }

  expect(reached, `${at}: only ${reached} of the thirteen destinations could be reached with a real pointer (REQ-1)`).toBe(DESTINATIONS.length);
  measurements.push(`${at}: ${reached}/${DESTINATIONS.length} destinations reachable by a real pointer click at the entry's own centre`);
  return measurements;
}

for (const viewport of VIEWPORTS) {
  // plan-ui-coherence-optimisation/REQ-1, REQ-2, REQ-4
  test(`every one of the thirteen destinations is hit-testable and navigates at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    // Thirteen screen loads against the real daemon, each preceded by a scroll
    // and six box measurements: well past the default per-test budget.
    test.setTimeout(180_000);

    const measurements = await everyDestinationReachable(page, viewport);
    console.log(`[REQ-1] ${measurements.join('\n[REQ-1] ')}`);
  });
}

// plan-ui-coherence-optimisation/REQ-3 — the opposite symptom of the same
// construction, which must not survive the repair.
//
// What is asserted is the **anchoring**, not a bound on the gap. The card stays
// pinned to the bottom of a full-height rail and the space left over sits above
// it, growing with the viewport by design (navigation-primitives.md, and the
// batch's own record: 36px at 1440×1000, 436px at 1440×1400). A check bounding
// that space by a fraction of the rail would fail on the design the plan
// deliberately chose, and the next reader would repair the anchoring to satisfy
// it. Once the footer is provably at the bottom of the rail, the space is not
// unexplained — it is the space above a pinned footer, bounded by the rail
// itself — and what remains to assert is that nothing overlaps it.
//
// Run at both heights, so the tall case is covered by the check rather than
// left for someone to discover.
test('the footer card stays anchored to the bottom of the rail, with the entries clear of it', async ({ page }) => {
  test.setTimeout(90_000);

  const rail = page.locator('.ui-nav-rail');
  const region = page.locator('.ui-nav-rail__groups');
  const reported: string[] = [];

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1440, height: 1400 },
  ]) {
    const at = `@${viewport.width}×${viewport.height}`;
    await page.setViewportSize(viewport);
    await openApp(page, 'dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

    // The last entry as an operator sees it: the region scrolled to its end, so
    // the space measured is the one below the last entry there is. A no-op at a
    // height where every entry fits.
    await region.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    const railBox = await stableBox(rail, 'the rail card');
    const regionBox = await stableBox(region, 'the entry region');
    const cardBox = await stableBox(rail.locator('.ui-footer-status'), 'the active-context footer card');
    const lastEntry = await stableBox(navEntry(page, DESTINATIONS[DESTINATIONS.length - 1]), 'the last entry');

    // The rail's own content bottom: where a bottom-anchored child ends.
    const inset = await rail.evaluate((element) => {
      const style = getComputedStyle(element);
      return Number.parseFloat(style.paddingBottom) + Number.parseFloat(style.borderBottomWidth);
    });
    const contentBottom = railBox.y + railBox.height - inset;
    const cardBottom = cardBox.y + cardBox.height;
    const gap = cardBox.y - (lastEntry.y + lastEntry.height);

    reported.push(
      `${at}: rail ${describeBox(railBox)}, content bottom ${round(contentBottom)} (inset ${round(inset)}px), card ${describeBox(cardBox)}, last entry ${describeBox(lastEntry)}, space above the card ${round(gap)}px`,
    );

    expect(
      Math.abs(cardBottom - contentBottom),
      `${at}: the footer card is not anchored to the bottom of the rail — it ends at ${round(cardBottom)} where the rail's content ends at ${round(contentBottom)}, ${round(cardBottom - contentBottom)}px away (REQ-2, REQ-3)`,
    ).toBeLessThanOrEqual(1);

    expect(
      intersects(regionBox, cardBox),
      `${at}: the entry region and the anchored footer card overlap — ${describeBox(regionBox)} against ${describeBox(cardBox)} (REQ-2, REQ-3)`,
    ).toBe(false);

    expect(
      gap,
      `${at}: the last entry runs into the anchored footer card, overlapping it by ${round(-gap)}px (REQ-2, REQ-3)`,
    ).toBeGreaterThanOrEqual(0);
  }

  console.log(`[REQ-3] ${reported.join('\n[REQ-3] ')}`);
});

// plan-ui-coherence-optimisation/REQ-1 — the half a scroll alone does not
// discharge. Where the platform draws overlay scrollbars there is no scrollbar
// to see, so a region that scrolls silently reads as a complete list and the
// entries beyond the cut are invisible rather than merely off screen. The
// contract (navigation-primitives.md) is that the region **states where its
// content is cut**, on whichever edge still holds entries beyond it, and states
// nothing when nothing is cut — so the indication must differ between the two
// ends of the scroll, and be absent when the entries fit.
test('the entry region states where its content is cut, and states nothing when nothing is cut', async ({ page }) => {
  test.setTimeout(90_000);

  const region = page.locator('.ui-nav-rail__groups');
  const reported: string[] = [];

  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1280, height: 800 },
  ]) {
    const at = `@${viewport.width}×${viewport.height}`;
    await page.setViewportSize(viewport);
    await openApp(page, 'dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

    const readState = async (): Promise<{ scrollHeight: number; clientHeight: number; scrollTop: number; mask: string }> =>
      await region.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          scrollTop: element.scrollTop,
          mask: `${style.maskImage} | ${style.webkitMaskImage}`,
        };
      });

    await region.evaluate((element) => {
      element.scrollTop = 0;
    });
    const atTop = await readState();
    const overflowing = atTop.scrollHeight > atTop.clientHeight + 1;

    await region.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const atBottom = await readState();

    reported.push(`${at}: scrollHeight ${atTop.scrollHeight} / clientHeight ${atTop.clientHeight} — ${overflowing ? 'cut' : 'everything fits'}; mask at top "${atTop.mask}", at bottom "${atBottom.mask}"`);

    if (overflowing) {
      expect(
        atTop.mask,
        `${at}: the entry region cuts its content (${atTop.scrollHeight}px of entries in ${atTop.clientHeight}px) and says nothing about it — thirteen entries read as the ten that are painted (REQ-1)`,
      ).not.toBe('none | none');
      expect(
        atBottom.mask,
        `${at}: the region shows the same indication at both ends of its scroll ("${atTop.mask}"), so it does not state which edge still holds entries beyond the cut (REQ-1)`,
      ).not.toBe(atTop.mask);
    } else {
      expect(
        atTop.mask,
        `${at}: every entry fits (${atTop.scrollHeight}px in ${atTop.clientHeight}px) and the region still fades its content — a cut is announced where there is none (REQ-3, navigation-primitives.md)`,
      ).toBe('none | none');
    }

    // Whatever the indication is, it is not a blur and computes no filter: the
    // rail is main view above the phone breakpoint (REQ-5).
    const filters = await region.evaluate((element) => {
      const style = getComputedStyle(element);
      return { filter: style.filter, backdropFilter: style.backdropFilter };
    });
    expect(
      `${filters.filter} | ${filters.backdropFilter}`,
      `${at}: the entry region computes a filter (${filters.filter} / ${filters.backdropFilter}) — the fold indication may not be a blur (REQ-5)`,
    ).toBe('none | none');
  }

  console.log(`[REQ-1] ${reported.join('\n[REQ-1] ')}`);
});

// plan-ui-coherence-optimisation/REQ-5 — making the rail scroll changes nothing
// about its material: the drawer still carries the overlay glass on its own
// `::before` at the single allowed value, the docked rail still computes no
// blur at all, and neither does the region now doing the scrolling.
test('the rail keeps its blur exactly as delivered: the drawer blurs, the docked rail does not', async ({ page }) => {
  test.setTimeout(60_000);

  const rail = page.locator('.ui-nav-rail');
  const region = page.locator('.ui-nav-rail__groups');
  const computed = async (target: Locator, pseudo: string | null) =>
    await target.evaluate((element, selector) => {
      const style = getComputedStyle(element, selector);
      return { filter: style.filter, backdropFilter: style.backdropFilter };
    }, pseudo);

  // Docked: main view, and it blurs nothing — the rail, its layers and the
  // scrolling region alike.
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

  for (const [name, target, pseudo] of [
    ['the docked rail', rail, null],
    ['the docked rail ::before layer', rail, '::before'],
    ['the entry region', region, null],
    ['the entry region ::before layer', region, '::before'],
  ] as [string, Locator, string | null][]) {
    const { filter, backdropFilter } = await computed(target, pseudo);
    expect(
      `${filter} | ${backdropFilter}`,
      `@1280×800: ${name} computes a blur (${filter} / ${backdropFilter}); above the phone breakpoint the rail is main view and blurs nothing (REQ-5)`,
    ).toBe('none | none');
  }

  // The drawer: the one place the rail carries the overlay glass material, on
  // the surface's own `::before`, at the one legal value.
  await page.setViewportSize({ width: 375, height: 812 });
  await openDrawer(page);
  await stableBox(rail, 'the drawer card');

  // The blur component alone is what the allow-list values: the delivered
  // overlay glass is a blur *and* a saturation (`overlay-glass.md`), and REQ-5
  // asks for that material exactly as delivered — what it forbids is a blur
  // length written anywhere but the `--blur-overlay` token, which is 20px.
  const drawerLayer = await computed(rail, '::before');
  const blurComponents = [...drawerLayer.backdropFilter.matchAll(/blur\(([^)]*)\)/g)].map((match) => match[1]);
  expect(
    blurComponents,
    `@375×812: the open drawer no longer carries the overlay glass blur on its own ::before — it computes "${drawerLayer.backdropFilter}", where the allow-list values it at the --blur-overlay token, 20px (REQ-5)`,
  ).toEqual(['20px']);

  const drawerSurface = await computed(rail, null);
  expect(
    drawerSurface.backdropFilter,
    `@375×812: the drawer surface itself carries a backdrop-filter (${drawerSurface.backdropFilter}); it belongs on the ::before layer, or every surface nested inside stops blurring (REQ-5)`,
  ).toBe('none');

  const drawerRegion = await computed(region, null);
  expect(
    `${drawerRegion.filter} | ${drawerRegion.backdropFilter}`,
    `@375×812: the scrolling entry region computes a filter (${drawerRegion.filter} / ${drawerRegion.backdropFilter}) — no surface joins the allow-list in this batch (REQ-5)`,
  ).toBe('none | none');

  // The scrim spans the viewport and is not on the allow-list, and never will
  // be: behind an open drawer the application stays sharp and merely dimmed.
  const scrim = page.locator('.ui-frame__scrim');
  if ((await scrim.count()) > 0) {
    const scrimFilters = await computed(scrim.first(), null);
    expect(
      `${scrimFilters.filter} | ${scrimFilters.backdropFilter}`,
      `@375×812: the drawer's scrim computes a filter (${scrimFilters.filter} / ${scrimFilters.backdropFilter}) — blurring a full-viewport scrim blurs the whole main view (REQ-5)`,
    ).toBe('none | none');
  }
});
