import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { boxesOf, type Rect } from './support/settled.js';
import { clickAt } from './support/pointer.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

/**
 * The toast stack measured in a real browser: the card is the size of what it
 * holds, the tone is painted — one badge, before a word is read — the operator can close a
 * toast with a pointer, and the corner is transparent to a click that is not on
 * a card. REQ ids belong to
 * `plan-docker_management_app-toast_feedback/requirements.md`.
 *
 * jsdom lays nothing out — `getBoundingClientRect` returns zeros there — so the
 * size half of this plan can only be verified here, and only on measured boxes
 * (REQ-26). The tone half is asserted here on what the browser actually paints;
 * the structural half of it, including the `neutral` case no screen can raise,
 * is `client/test/unit/toast.test.tsx` (REQ-27).
 *
 * Every toast is raised the way an operator raises one — Images & layers, on a
 * fixture image the test builds and destroys itself. Nothing here asserts on a
 * total, a count of the daemon's own objects or an empty daemon.
 */

/** Where the plan's own reference numbers were taken, and the width the maximum is stated at. */
test.use({ viewport: { width: 1280, height: 800 } });

/**
 * Today's readings, from the plan's preamble: the stack was a fixed 360px column
 * whatever a toast held, and a two-line toast measured 106px tall for roughly
 * 40px of text. Both are what the size correction is measured against.
 */
const PRE_FIX_WIDTH = 360;
const PRE_FIX_TWO_LINE_HEIGHT = 106;

/**
 * "Materially shorter" (REQ-12), fixed here rather than left to each assertion:
 * a tenth of the old height is below any subpixel or font-metric noise and well
 * above the difference a rounding could produce.
 */
const MATERIALLY_SHORTER_HEIGHT = PRE_FIX_TWO_LINE_HEIGHT * 0.9;

/** `--toast-min-width` / `--toast-max-width` (design-tokens.md): the floor and the maximum. */
const TOAST_MIN_WIDTH = 240;
const TOAST_MAX_WIDTH = 360;

/** `--space-6`, the clearance the stack keeps from the screen edges (REQ-16). */
const VIEWPORT_INSET = 24;

/**
 * The ceiling on the gap between the glass edge and the text: one padding is a
 * single step of the spacing scale (`--space-4`, 16px, plus the surface's own
 * hairline). The two paddings this fix removes measured 36px horizontally and
 * 32px vertically, so this separates "one padding" from "two" with room to
 * spare (REQ-11).
 */
const ONE_PADDING_CEILING = 20;

/** Half a pixel of subpixel noise is not a disagreement; a pixel is the coarsest thing asserted here. */
const TOLERANCE_PX = 1;

/** A standalone single-tag image of the suite's own making, with an id of its own. */
async function createStandaloneImage(tag: string, containerName: string): Promise<void> {
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), TINY_IMAGE]);
  await execFileAsync('docker', ['commit', containerName, tag]);
}

async function removeStandaloneImage(tag: string, containerName: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
  await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
}

async function removeTagQuietly(tag: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
}

function searchField(page: Page): Locator {
  return page.getByPlaceholder('Search reference or digest…');
}

function imageRow(page: Page, text: string): Locator {
  return page.locator('.ui-data-table__row', { hasText: text });
}

/** The glass card of a toast — the surface whose box the size requirements are stated about. */
function toastCards(page: Page): Locator {
  return page.locator('.ui-toast-viewport .ui-surface');
}

/**
 * One toast, picked out by the text it carries. Text is how a toast is
 * *identified* here; every size claim below is made about its box (REQ-26).
 */
function toastCardWith(page: Page, text: string): Locator {
  return toastCards(page).filter({ hasText: text });
}

interface ToastParts {
  /** The glass surface: what the plan's 360x106 reading was taken of. */
  surface: Rect;
  /** The card inside it, which carries the toast's one padding. */
  card: Rect;
  glyph: Rect;
  body: Rect;
  dismiss: Rect;
}

/** Every part of one toast, read in a single settled layout (`support/settled.ts`). */
async function measureToast(page: Page, toast: Locator, what: string): Promise<ToastParts> {
  const boxes = await boxesOf(
    page,
    {
      surface: toast,
      card: toast.locator('.ui-toast'),
      glyph: toast.locator('.ui-toast__glyph'),
      body: toast.locator('.ui-toast__body'),
      dismiss: toast.locator('.ui-toast__dismiss'),
    },
    what,
  );
  return { surface: boxes.surface!, card: boxes.card!, glyph: boxes.glyph!, body: boxes.body!, dismiss: boxes.dismiss! };
}

function right(box: Rect): number {
  return box.x + box.width;
}

function bottom(box: Rect): number {
  return box.y + box.height;
}

/** The gap between the glass edge and the outermost thing the card holds, on each side. */
function paddingGaps(parts: ToastParts): { leading: number; trailing: number; top: number; bottom: number } {
  const children = [parts.glyph, parts.body, parts.dismiss];
  return {
    leading: Math.min(...children.map((child) => child.x)) - parts.surface.x,
    trailing: right(parts.surface) - Math.max(...children.map(right)),
    top: Math.min(...children.map((child) => child.y)) - parts.surface.y,
    bottom: bottom(parts.surface) - Math.max(...children.map(bottom)),
  };
}

/**
 * The tag dialog, driven the way the screen offers it: the row's overflow menu,
 * opened and chosen as one retried gesture (`support/row-overflow-menu.ts`).
 *
 * The dialog is located by the field it holds rather than by its heading: the
 * heading names the image's references, and tagging an image changes them.
 */
async function tagThroughTheRowMenu(page: Page, row: Locator, reference: string): Promise<void> {
  await chooseFromRowOverflowMenu(page, row, 'Tag…');
  const field = page.getByRole('textbox', { name: 'New reference' });
  const dialog = page.locator('.ui-modal').filter({ has: field });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('textbox', { name: 'New reference' }).fill(reference);
  await dialog.getByRole('button', { name: 'Tag', exact: true }).click();
}

interface Colour {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function parseColour(value: string): Colour {
  const channels = value.match(/[\d.]+/g) ?? [];
  return {
    red: Number(channels[0] ?? 0),
    green: Number(channels[1] ?? 0),
    blue: Number(channels[2] ?? 0),
    alpha: channels.length > 3 ? Number(channels[3]) : 1,
  };
}

/** How far a colour departs from grey — how *toned* it is, with no reference to which hue it is. */
function channelSpread(value: string): number {
  const colour = parseColour(value);
  if (colour.alpha === 0) return 0;
  return Math.max(colour.red, colour.green, colour.blue) - Math.min(colour.red, colour.green, colour.blue);
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design, and the
  // Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile an unscoped rail click matches too.
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-26 — the card is the size of what it holds: one
// padding, a height of its own text, a width that follows its content between the floor and the
// maximum, and the corner edge shared by toasts of differing widths. Measured, never read.
test('the toast card is the size of what it holds, between the width floor and the maximum', async ({ page }) => {
  const runId = Date.now();
  const containerName = `vexel-e2e-toast-size-src-${runId}`;
  const sourceTag = `vexel-e2e-toast-size-${runId}:v1`;
  // The toast's message is the reference it was given, so the two references below are how this
  // test controls the width of the toast it measures.
  const shortReference = `vxt${runId % 100000}:1`;
  const longReference = `vexel-e2e-toast-a-deliberately-long-image-reference-${runId}:v1`;
  try {
    await createStandaloneImage(sourceTag, containerName);
    await page.reload();
    await searchField(page).fill(sourceTag);
    const row = imageRow(page, sourceTag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await tagThroughTheRowMenu(page, row, shortReference);
    const shortToast = toastCardWith(page, shortReference);
    await expect(shortToast).toBeVisible({ timeout: 10_000 });
    const short = await measureToast(page, shortToast, 'the short toast');

    // REQ-11 — the glass carries no padding of its own any more, so the card fills it and the one
    // remaining padding is the whole gap between the glass edge and the text.
    expect(short.card.width).toBeGreaterThanOrEqual(short.surface.width - 3);
    expect(short.card.height).toBeGreaterThanOrEqual(short.surface.height - 3);
    const gaps = paddingGaps(short);
    for (const [side, gap] of Object.entries(gaps)) {
      expect(gap, `the ${side} gap between the glass edge and the text is more than one padding`).toBeLessThanOrEqual(
        ONE_PADDING_CEILING,
      );
      expect(gap, `the ${side} gap between the glass edge and the text is negative`).toBeGreaterThanOrEqual(0);
    }
    // REQ-12 — no band of empty glass above or below the text: the two vertical gaps agree.
    expect(Math.abs(gaps.top - gaps.bottom)).toBeLessThanOrEqual(TOLERANCE_PX);
    // REQ-11 — and the padding is symmetric: the same spacing token on the leading edge as on the
    // trailing one, on a toned toast exactly as on an untoned one.
    expect(Math.abs(gaps.leading - gaps.trailing)).toBeLessThanOrEqual(TOLERANCE_PX);
    // REQ-12 — the two-line toast that measured 106px is materially shorter than that.
    expect(short.surface.height).toBeLessThanOrEqual(MATERIALLY_SHORTER_HEIGHT);
    // REQ-14 — and never below the floor, so a short toast still reads as a card.
    expect(short.surface.width).toBeGreaterThanOrEqual(TOAST_MIN_WIDTH - TOLERANCE_PX);
    // REQ-13 — a short toast is no longer drawn in the fixed column of a long one.
    expect(short.surface.width).toBeLessThan(PRE_FIX_WIDTH);

    await tagThroughTheRowMenu(page, row, longReference);
    const longToast = toastCardWith(page, longReference);
    await expect(longToast).toBeVisible({ timeout: 10_000 });
    const long = await measureToast(page, longToast, 'the long toast');

    // REQ-13 — width follows content up to the maximum, which is today's 360px.
    expect(long.surface.width).toBeGreaterThan(short.surface.width);
    expect(long.surface.width).toBeLessThanOrEqual(TOAST_MAX_WIDTH + TOLERANCE_PX);
    // REQ-15 — both are aligned on the edge nearest their corner, whatever they measure.
    expect(Math.abs(right(long.surface) - right(short.surface))).toBeLessThanOrEqual(TOLERANCE_PX);
    // REQ-12 — the taller card is still the height of its own text, with no empty band.
    const longGaps = paddingGaps(long);
    expect(Math.abs(longGaps.top - longGaps.bottom)).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(longGaps.top).toBeLessThanOrEqual(ONE_PADDING_CEILING);
  } finally {
    await removeTagQuietly(shortReference);
    await removeTagQuietly(longReference);
    await removeStandaloneImage(sourceTag, containerName);
  }
});

// REQ-2, REQ-3, REQ-5 — the tone is actually painted: one mark, a round badge before the text,
// carrying the tone's own shape and its own family, while the card itself keeps no border on any
// edge and its fill stays untoned, so the title and the message read no worse than on an untoned
// toast.
test('a success toast is painted with its glyph badge, on an untoned fill and a card with no border', async ({ page }) => {
  const runId = Date.now();
  const containerName = `vexel-e2e-toast-tone-src-${runId}`;
  const sourceTag = `vexel-e2e-toast-tone-${runId}:v1`;
  const newReference = `vexel-e2e-toast-tone-${runId}-tagged:v1`;
  try {
    await createStandaloneImage(sourceTag, containerName);
    await page.reload();
    await searchField(page).fill(sourceTag);
    const row = imageRow(page, sourceTag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await tagThroughTheRowMenu(page, row, newReference);
    const toast = toastCardWith(page, newReference);
    await expect(toast).toBeVisible({ timeout: 10_000 });

    // The badge is drawn, not merely present in the markup: it has a box of its own.
    const glyph = toast.locator('.ui-toast__glyph');
    await expect(glyph).toBeVisible();
    const parts = await measureToast(page, toast, 'the toned toast');
    expect(parts.glyph.width).toBeGreaterThanOrEqual(16);
    expect(parts.glyph.height).toBeGreaterThanOrEqual(16);
    // It leads the text, which is where the tone has to be to be seen before a word is read.
    expect(parts.glyph.x).toBeLessThan(parts.body.x);

    const painted = await page.evaluate(() => {
      const card = document.querySelector('.ui-toast-viewport .ui-toast')!;
      const style = getComputedStyle(card);
      const badge = card.querySelector('.ui-toast__glyph')!;
      const badgeStyle = getComputedStyle(badge);
      const title = card.querySelector('.ui-toast__title')!;
      const message = card.querySelector('.ui-toast__message')!;
      // The library's own text colours, resolved by the page itself: what is asserted below is
      // that the tone treatment left the text on them, not that they hold any particular value.
      const probe = document.createElement('span');
      card.appendChild(probe);
      probe.style.color = 'var(--color-text-primary)';
      const primary = getComputedStyle(probe).color;
      probe.style.color = 'var(--color-text-secondary)';
      const secondary = getComputedStyle(probe).color;
      probe.remove();
      return {
        toneClasses: [...card.classList].filter((name) => name.startsWith('ui-toast--tone-')),
        badgeMark: (badge.textContent ?? '').trim(),
        badgeInk: badgeStyle.color,
        badgeFill: badgeStyle.backgroundColor,
        borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(
          (width) => Number.parseFloat(width),
        ),
        fill: style.backgroundColor,
        titleColour: getComputedStyle(title).color,
        messageColour: getComputedStyle(message).color,
        primary,
        secondary,
      };
    });

    // REQ-2, REQ-3 — the card is marked as the tone it was pushed with, and the mark itself is the
    // tone's own shape: a channel that is not colour, and the one that survives a greyscale screen.
    expect(painted.toneClasses).toEqual(['ui-toast--tone-success']);
    expect(painted.badgeMark).toBe('✓');
    // REQ-2 — and the badge is drawn in the tone's own family, so the outcome reads at a glance.
    expect(Math.max(channelSpread(painted.badgeInk), channelSpread(painted.badgeFill))).toBeGreaterThanOrEqual(20);

    // toast.md — the card carries no border of its own on any edge: the tone is one mark, and the
    // edge accent delivered beside it was withdrawn, which is also what keeps the padding
    // symmetric (REQ-11).
    expect(painted.borderWidths).toEqual([0, 0, 0, 0]);

    // REQ-5 — nothing tones the card's fill: the text stands on the same glass an untoned toast
    // gives it, and is drawn in the same two text colours.
    expect(channelSpread(painted.fill)).toBeLessThanOrEqual(12);
    expect(painted.titleColour).toBe(painted.primary);
    expect(painted.messageColour).toBe(painted.secondary);
  } finally {
    await removeTagQuietly(newReference);
    await removeStandaloneImage(sourceTag, containerName);
  }
});

// REQ-10 — the stack intercepts no pointer event outside the visible cards: a click beside a
// narrow toast reaches the screen underneath, while a click on the card itself is the stack's.
test('a click beside a narrow toast reaches the screen underneath', async ({ page }) => {
  const runId = Date.now();
  const containerName = `vexel-e2e-toast-hit-src-${runId}`;
  const sourceTag = `vexel-e2e-toast-hit-${runId}:v1`;
  const shortReference = `vxh${runId % 100000}:1`;
  try {
    await createStandaloneImage(sourceTag, containerName);
    await page.reload();
    await searchField(page).fill(sourceTag);
    const row = imageRow(page, sourceTag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await tagThroughTheRowMenu(page, row, shortReference);
    const toast = toastCardWith(page, shortReference);
    await expect(toast).toBeVisible({ timeout: 10_000 });
    const parts = await measureToast(page, toast, 'the narrow toast');
    // Narrow enough for there to be a beside at all: the point aimed at below is inside the fixed
    // 360px column the stack used to occupy whatever it held.
    expect(parts.surface.width).toBeLessThan(PRE_FIX_WIDTH);

    const middleOfTheCard = parts.surface.y + parts.surface.height / 2;
    const besideTheCard = parts.surface.x - 30;
    expect(besideTheCard).toBeGreaterThan(right(parts.surface) - PRE_FIX_WIDTH);

    const whatTheClickReached = async (x: number, y: number) => {
      await page.evaluate(() => {
        (window as unknown as Record<string, unknown>).__toastHitTest = null;
        document.addEventListener(
          'click',
          (event) => {
            const target = event.target as Element;
            (window as unknown as Record<string, unknown>).__toastHitTest = {
              insideTheStack: target.closest('.ui-toast-viewport') !== null,
              description: `${target.tagName.toLowerCase()}.${target.className}`,
            };
          },
          { capture: true, once: true },
        );
      });
      await page.mouse.click(x, y);
      return await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__toastHitTest as { insideTheStack: boolean; description: string } | null,
      );
    };

    const beside = await whatTheClickReached(besideTheCard, middleOfTheCard);
    expect(beside, 'a click beside the toast reached nothing at all').not.toBeNull();
    expect(beside!.insideTheStack, `the stack swallowed a click beside a toast, at ${beside!.description}`).toBe(false);

    // The other half of the same rule: where a toast actually is, the toast takes the click.
    const onTheCard = await whatTheClickReached(parts.surface.x + 20, middleOfTheCard);
    expect(onTheCard, 'a click on the toast reached nothing at all').not.toBeNull();
    expect(onTheCard!.insideTheStack, 'a click on the toast card itself did not reach the toast').toBe(true);
  } finally {
    await removeTagQuietly(shortReference);
    await removeStandaloneImage(sourceTag, containerName);
  }
});

// REQ-6, REQ-7, REQ-8, REQ-25 — the dismiss control, operated with a real pointer at its own
// visible coordinates, removes that toast alone: the survivor keeps its box, its order and its
// corner, and the stack closes up in place.
test('a real pointer on the dismiss control removes that toast alone, leaving the others standing', async ({ page }) => {
  const runId = Date.now();
  const containerA = `vexel-e2e-toast-dismiss-src-a-${runId}`;
  const containerB = `vexel-e2e-toast-dismiss-src-b-${runId}`;
  const tagA = `vexel-e2e-toast-dismiss-${runId}-a-with-a-long-reference:v1`;
  const tagB = `vexel-e2e-toast-dismiss-${runId}-b:v1`;
  let firstDownload: { delete(): Promise<void> } | null = null;
  let secondDownload: { delete(): Promise<void> } | null = null;
  try {
    await createStandaloneImage(tagA, containerA);
    await createStandaloneImage(tagB, containerB);
    await page.reload();
    await searchField(page).fill(`vexel-e2e-toast-dismiss-${runId}`);
    await expect(imageRow(page, tagA)).toBeVisible({ timeout: 10_000 });
    await expect(imageRow(page, tagB)).toBeVisible({ timeout: 10_000 });

    // Two toasts, raised a moment apart from the bulk bar: one click each, so both are still
    // standing while their boxes are compared. Each announces the tarball of **one** image, whose
    // reference is the toast's own message — which is how the two come out at two different
    // widths, and how each is told from the other. The selection is stated in full before each
    // save rather than added to: the screen clears it once a save has started, so a second image
    // checked on top of the first is a selection of one, not of two. The tarball each toast
    // announces is the runner's to keep, and is handed back in the `finally`.
    await imageRow(page, tagA).getByRole('checkbox').check();
    const first = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save to tarball…' }).click();
    firstDownload = await first;

    await imageRow(page, tagA).getByRole('checkbox').uncheck();
    await imageRow(page, tagB).getByRole('checkbox').check();
    const second = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save to tarball…' }).click();
    secondDownload = await second;

    const olderToast = toastCardWith(page, `${tagA}.tar`);
    const newerToast = toastCardWith(page, `${tagB}.tar`);
    await expect(olderToast).toBeVisible();
    await expect(newerToast).toBeVisible();

    const boxes = await boxesOf(page, { older: olderToast, newer: newerToast }, 'the two standing toasts');
    const older = boxes.older!;
    const newer = boxes.newer!;
    // Newest last, in the corner they live in, sharing the edge nearest it (REQ-8, REQ-15).
    expect(bottom(older)).toBeLessThanOrEqual(newer.y + TOLERANCE_PX);
    expect(Math.abs(right(older) - right(newer))).toBeLessThanOrEqual(TOLERANCE_PX);

    // REQ-25 — a real pointer at the control's own visible coordinates: never `element.click()`,
    // never a dispatched event, never the hidden element behind a control.
    const dismiss = newerToast.getByRole('button', { name: /^Dismiss notification: / });
    await expect(dismiss).toBeVisible();
    await clickAt(page, dismiss, 'the newer toast’s dismiss control');

    // REQ-6 — it goes at once, long before its own timeout. The one dismissed is the newest, so
    // its going cannot be the stack expiring in the order it arrived.
    await expect(newerToast).toHaveCount(0, { timeout: 2_000 });
    // REQ-7, REQ-8 — the other is still standing, and the stack closed up in place: same card,
    // same edge, now at the corner the dismissed one had.
    await expect(olderToast).toHaveCount(1);
    const survivor = (await boxesOf(page, { survivor: olderToast }, 'the surviving toast')).survivor!;
    expect(Math.abs(survivor.width - older.width)).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(survivor.height - older.height)).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(right(survivor) - right(older))).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(bottom(survivor) - bottom(newer))).toBeLessThanOrEqual(TOLERANCE_PX);
    // REQ-23 — and the survivor still goes on its own when its time comes: dismissing one toast
    // did not take the other's auto-dismissal with it. Bounded well above the 5s default on
    // purpose: what is asserted here is that it happens at all, since the default itself is timed
    // under fake timers in `client/test/unit/toast.test.tsx`.
    await expect(olderToast).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await firstDownload?.delete().catch(() => undefined);
    await secondDownload?.delete().catch(() => undefined);
    await removeStandaloneImage(tagA, containerA);
    await removeStandaloneImage(tagB, containerB);
  }
});

// REQ-16 — at a phone-width window no toast exceeds the viewport, each keeps the clearance from
// the screen edges it keeps today, and long text wraps inside the card instead of overflowing it.
test('at a phone width a long toast stays inside the screen, with its clearance and its text wrapped', async ({ page }) => {
  const runId = Date.now();
  const containerName = `vexel-e2e-toast-phone-src-${runId}`;
  const sourceTag = `vexel-e2e-toast-phone-${runId}:v1`;
  const longReference = `vexel-e2e-toast-phone-a-deliberately-long-image-reference-${runId}:v1`;
  const phone = { width: 390, height: 844 };
  try {
    await createStandaloneImage(sourceTag, containerName);
    await page.reload();
    await searchField(page).fill(sourceTag);
    const row = imageRow(page, sourceTag);
    await expect(row).toBeVisible({ timeout: 10_000 });

    await tagThroughTheRowMenu(page, row, longReference);
    const toast = toastCardWith(page, longReference);
    await expect(toast).toBeVisible({ timeout: 10_000 });

    // The window is narrowed with the toast already standing: the clamp is a property of the
    // stack's own width, and driving a row menu at 390px would be measuring the images table
    // instead of the toast.
    await page.setViewportSize(phone);
    const parts = await measureToast(page, toast, 'the toast at a phone width');

    expect(parts.surface.width).toBeLessThanOrEqual(phone.width - VIEWPORT_INSET * 2 + TOLERANCE_PX);
    expect(parts.surface.x).toBeGreaterThanOrEqual(VIEWPORT_INSET - TOLERANCE_PX);
    expect(right(parts.surface)).toBeLessThanOrEqual(phone.width - VIEWPORT_INSET + TOLERANCE_PX);

    // The reference wraps inside the card rather than pushing past its edge.
    expect(right(parts.body)).toBeLessThanOrEqual(right(parts.surface) + TOLERANCE_PX);
    const overflow = await page.evaluate(() => {
      const message = document.querySelector('.ui-toast-viewport .ui-toast__message')!;
      return message.scrollWidth - message.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(TOLERANCE_PX);
  } finally {
    await removeTagQuietly(longReference);
    await removeStandaloneImage(sourceTag, containerName);
  }
});
