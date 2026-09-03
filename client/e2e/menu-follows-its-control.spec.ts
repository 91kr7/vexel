/**
 * **An open overflow menu follows its control instead of closing on a scroll**
 * (`plan-docker_management_app-container_row_actions/REQ-27`, `REQ-28`, `REQ-29`, `REQ-30`).
 *
 * The gestures are the operator's own (`REQ-32`): a scroll is **the wheel**, delivered with the
 * pointer over the card region, never a programmed `scrollBy`; a press is a **real pointer at the
 * visible control's own coordinates**, never `element.click()` and never a dispatched event.
 *
 * **Position, not content.** A popup left standing where its control no longer is keeps every entry
 * and every character it had; what it loses is its coordinates. So the popup's box and the control's
 * are read together, before and after the scroll, and what is asserted is the offset between them —
 * read once the layout has stopped moving (`support/settled.ts`).
 *
 * The region has to scroll without a single container of the operator's: this file makes its own
 * cards, from the image the reset that opens this file has just put back on the daemon, and narrows
 * the screen to them by its own search. Nothing here asserts on totals, counts or a list being
 * empty, and the reset that opens the next file is what removes the cards.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { boxOf, boxesOf, centreOf, clickAtItsCentre, movePointerTo, type Rect } from './support/settled.js';
import { containerCards, overflowTrigger } from './support/container-cards.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/**
 * Three tracks of cards, and a viewport short enough that four rows of them have to scroll — but tall
 * enough to leave room below a first-row card for its popup: the popup flips above its trigger when
 * there is no room below it (`ui-library/specs/menu.md`), and a scroll that crosses that boundary
 * re-places the popup legitimately, which is not what REQ-28 is about.
 */
const VIEWPORT = { width: 1280, height: 1000 };

/** Half a pixel: below what any assertion here distinguishes, above the browser's own float noise. */
const TOLERANCE = 0.5;

/** Twelve cards over four rows: enough scrollable height to carry the first row out of the region. */
const STEM = `vexel-e2e-menu-scroll-${Date.now()}`;
const NAMES = Array.from({ length: 12 }, (_, index) => `${STEM}-${String(index).padStart(2, '0')}`);

async function createSleepingContainer(name: string): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sleep', ALPINE_IMAGE, '300']);
}

/**
 * The cards are made once for the file — twelve `docker run` calls are the expensive setup it shares
 * — and the daemon reset that opens the next file removes them. No test here inherits application
 * state from another: each opens the screen for itself.
 */
test.beforeAll(async () => {
  await ensureImage(ALPINE_IMAGE);
  await Promise.all(NAMES.map(createSleepingContainer));
});

/** The screen, narrowed by its own search to this file's cards: the operator's containers are none of its business. */
async function openNarrowedToTheFixtures(page: Page): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  await page.getByPlaceholder('Search name, image or state…').fill(STEM);
  await expect(containerCards(page)).toHaveCount(NAMES.length, { timeout: 20_000 });
  // A banner between the toolbar and the grid moves every card while it stands, and a box read then
  // belongs to another layout.
  await expect(page.locator('.ui-error-banner'), 'the screen is showing an error banner').toHaveCount(0, { timeout: 20_000 });
}

/** The region the cards are scrolled in. */
function cardRegion(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

function theMenuOf(page: Page, name: string): Locator {
  return page.getByRole('menu', { name: `More actions for ${name}`, exact: true });
}

/** The card's overflow control pressed with a real pointer at its own coordinates. */
async function openTheMenuOn(page: Page, name: string): Promise<Locator> {
  await clickAtItsCentre(page, overflowTrigger(page, name), `the overflow control on the card of ${name}`);
  const menu = theMenuOf(page, name);
  await expect(menu, `the menu never appeared on the card of ${name}`).toBeVisible();
  return menu;
}

/**
 * Puts the pointer where the operator's wheel will land: inside the card region and away from the
 * open popup, which scrolls its own entries and would swallow the turn.
 */
async function pointerOverTheRegion(page: Page, popupBox: Rect | null): Promise<void> {
  const region = await boxOf(cardRegion(page), 'the card region');
  const point = { x: region.x + 24, y: region.y + region.height - 24 };
  if (popupBox !== null) {
    const onThePopup =
      point.x >= popupBox.x && point.x <= popupBox.x + popupBox.width && point.y >= popupBox.y && point.y <= popupBox.y + popupBox.height;
    expect(onThePopup, 'the wheel would land on the open popup instead of on the region').toBe(false);
  }
  await page.mouse.move(point.x, point.y);
}

/** The popup's box against its control's, the one quantity a popup that stopped following would lose. */
function offsetBetween(reading: Record<string, Rect>): { dx: number; dy: number } {
  return { dx: reading.popup.x - reading.trigger.x, dy: reading.popup.y - reading.trigger.y };
}

/** How far the region and the page have been scrolled, read in one pass. */
async function scrollOffsets(page: Page): Promise<{ region: number; page: number }> {
  return await page.evaluate(() => {
    const region = document.querySelector('.ui-frame__content');
    return { region: region === null ? Number.NaN : region.scrollTop, page: window.scrollY };
  });
}

// REQ-27, REQ-28 — the operator wheels the region with the control staying in view: the menu is still
// open, and the popup holds the same position against the control's box.
test('an open menu follows its control as the operator wheels the card region', async ({ page }) => {
  await openNarrowedToTheFixtures(page);
  const name = NAMES[0];
  const trigger = overflowTrigger(page, name);
  const menu = await openTheMenuOn(page, name);

  const before = await boxesOf(page, { trigger, popup: menu }, 'the open menu and its control');
  const held = offsetBetween(before);
  expect(held.dy, 'the popup opened above its control, so this scroll would cross the flip boundary').toBeGreaterThan(0);
  await pointerOverTheRegion(page, before.popup);
  await page.mouse.wheel(0, 120);

  await expect(menu, 'the menu closed on a scroll that left its control in view').toBeVisible();
  await expect(trigger, 'the wheel carried the control out of view, which is not the case under test').toBeInViewport();
  const after = await boxesOf(page, { trigger, popup: menu }, 'the open menu and its control after the scroll');
  expect(Math.abs(after.trigger.y - before.trigger.y), 'the wheel scrolled the region by nothing at all').toBeGreaterThan(1);
  const moved = offsetBetween(after);
  const drift = `the popup stopped holding its position against its control: ${JSON.stringify({ held, moved })}`;
  expect(Math.abs(moved.dx - held.dx), drift).toBeLessThan(TOLERANCE);
  expect(Math.abs(moved.dy - held.dy), drift).toBeLessThan(TOLERANCE);
});

// REQ-29 — the same region wheeled far enough to take the control out of it: the menu is gone, and it
// is the control's departure that closed it, the card itself being still in the list.
test('the menu is gone once the operator has wheeled its control out of the region', async ({ page }) => {
  await openNarrowedToTheFixtures(page);
  const name = NAMES[0];
  const trigger = overflowTrigger(page, name);
  const menu = await openTheMenuOn(page, name);

  const popup = await boxOf(menu, 'the open popup');
  await pointerOverTheRegion(page, popup);
  // The operator keeps scrolling, in turns of the wheel, until the first row is behind them.
  for (let turn = 0; turn < 5; turn += 1) await page.mouse.wheel(0, 400);

  await expect(trigger, 'the control is still in view, so this check never reached the case it exists for').not.toBeInViewport();
  await expect(trigger, 'the card left the list, so the close cannot be read as the control being scrolled away').toHaveCount(1);
  await expect(page.getByRole('menu'), 'the popup is still standing over the cards that have taken its place').toHaveCount(0);
});

// REQ-30 — the press that opens a menu scrolls nothing: neither the region holding the control nor
// the page moves as the menu opens.
test('opening a menu scrolls neither the card region nor the page', async ({ page }) => {
  await openNarrowedToTheFixtures(page);
  await pointerOverTheRegion(page, null);
  await page.mouse.wheel(0, 250);

  // The lowest card of the list: its control sits near the bottom edge, where a browser scrolling a
  // freshly focused element into view would show most plainly.
  const name = NAMES[NAMES.length - 1];
  const box = await movePointerTo(page, overflowTrigger(page, name), `the overflow control on the card of ${name}`);
  const before = await scrollOffsets(page);
  expect(before.region, 'the region is not scrolled at all, so the press is not made at a scrolled position').toBeGreaterThan(0);

  const aim = centreOf(box);
  await page.mouse.click(aim.x, aim.y);

  await expect(theMenuOf(page, name), `the menu never appeared on the card of ${name}`).toBeVisible();
  const after = await scrollOffsets(page);
  expect(Math.abs(after.region - before.region), `the card region scrolled as the menu opened: ${before.region} → ${after.region}`).toBeLessThan(
    TOLERANCE,
  );
  expect(Math.abs(after.page - before.page), `the page scrolled as the menu opened: ${before.page} → ${after.page}`).toBeLessThan(TOLERANCE);
});
