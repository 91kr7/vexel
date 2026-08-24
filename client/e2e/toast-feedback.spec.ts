import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { boxesOf, type Rect } from './support/settled.js';
import { clickAt } from './support/pointer.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

// Unqualified REQ ids below belong to plan-docker_management_app-toast_feedback/requirements.md.

/** The width the plan's reference readings were taken at, and the one the maximum is stated at. */
test.use({ viewport: { width: 1280, height: 800 } });

/** Measured before the fix: a fixed 360px column whatever a toast held, and 106px tall on two lines. */
const PRE_FIX_WIDTH = 360;
const PRE_FIX_TWO_LINE_HEIGHT = 106;

/** "Materially shorter" (REQ-12): a tenth off is above subpixel and font-metric noise. */
const MATERIALLY_SHORTER_HEIGHT = PRE_FIX_TWO_LINE_HEIGHT * 0.9;

/** `--toast-min-width` / `--toast-max-width` (design-tokens.md): the floor and the maximum. */
const TOAST_MIN_WIDTH = 240;
const TOAST_MAX_WIDTH = 360;

/** `--space-6`, the clearance the stack keeps from the screen edges (REQ-16). */
const VIEWPORT_INSET = 24;

/** One padding is `--space-4` (16px) plus a hairline; the two it replaced measured 36px and 32px (REQ-11). */
const ONE_PADDING_CEILING = 20;

/** Half a pixel of subpixel noise is not a disagreement; a pixel is the coarsest thing asserted here. */
const TOLERANCE_PX = 1;

/** Committed rather than tagged, so the image has an id of its own. */
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

function toastCards(page: Page): Locator {
  return page.locator('.ui-toast-viewport .ui-surface');
}

function toastCardWith(page: Page, text: string): Locator {
  return toastCards(page).filter({ hasText: text });
}

interface ToastParts {
  surface: Rect;
  card: Rect;
  glyph: Rect;
  body: Rect;
  dismiss: Rect;
}

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

function paddingGaps(parts: ToastParts): { leading: number; trailing: number; top: number; bottom: number } {
  const children = [parts.glyph, parts.body, parts.dismiss];
  return {
    leading: Math.min(...children.map((child) => child.x)) - parts.surface.x,
    trailing: right(parts.surface) - Math.max(...children.map(right)),
    top: Math.min(...children.map((child) => child.y)) - parts.surface.y,
    bottom: bottom(parts.surface) - Math.max(...children.map(bottom)),
  };
}

/** Located by the field it holds, not by its heading: tagging an image changes the references the heading names. */
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

/** How far a colour departs from grey, with no reference to which hue it is. */
function channelSpread(value: string): number {
  const colour = parseColour(value);
  if (colour.alpha === 0) return 0;
  return Math.max(colour.red, colour.green, colour.blue) - Math.min(colour.red, colour.green, colour.blue);
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-113).
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// REQ-11, REQ-12, REQ-13, REQ-14, REQ-15, REQ-26 — measured: one padding, its own height, content width, shared edge.
test('the toast card is the size of what it holds, between the width floor and the maximum', async ({ page }) => {
  const runId = Date.now();
  const containerName = `vexel-e2e-toast-size-src-${runId}`;
  const sourceTag = `vexel-e2e-toast-size-${runId}:v1`;
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

    expect(short.card.width).toBeGreaterThanOrEqual(short.surface.width - 3);
    expect(short.card.height).toBeGreaterThanOrEqual(short.surface.height - 3);
    const gaps = paddingGaps(short);
    for (const [side, gap] of Object.entries(gaps)) {
      expect(gap, `the ${side} gap between the glass edge and the text is more than one padding`).toBeLessThanOrEqual(
        ONE_PADDING_CEILING,
      );
      expect(gap, `the ${side} gap between the glass edge and the text is negative`).toBeGreaterThanOrEqual(0);
    }
    expect(Math.abs(gaps.top - gaps.bottom)).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(gaps.leading - gaps.trailing)).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(short.surface.height).toBeLessThanOrEqual(MATERIALLY_SHORTER_HEIGHT);
    expect(short.surface.width).toBeGreaterThanOrEqual(TOAST_MIN_WIDTH - TOLERANCE_PX);
    expect(short.surface.width).toBeLessThan(PRE_FIX_WIDTH);

    await tagThroughTheRowMenu(page, row, longReference);
    const longToast = toastCardWith(page, longReference);
    await expect(longToast).toBeVisible({ timeout: 10_000 });
    const long = await measureToast(page, longToast, 'the long toast');

    expect(long.surface.width).toBeGreaterThan(short.surface.width);
    expect(long.surface.width).toBeLessThanOrEqual(TOAST_MAX_WIDTH + TOLERANCE_PX);
    expect(Math.abs(right(long.surface) - right(short.surface))).toBeLessThanOrEqual(TOLERANCE_PX);
    const longGaps = paddingGaps(long);
    expect(Math.abs(longGaps.top - longGaps.bottom)).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(longGaps.top).toBeLessThanOrEqual(ONE_PADDING_CEILING);
  } finally {
    await removeTagQuietly(shortReference);
    await removeTagQuietly(longReference);
    await removeStandaloneImage(sourceTag, containerName);
  }
});

// REQ-2, REQ-3, REQ-5 — the tone is painted as one badge before the text, on an untoned fill and a borderless card.
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

    const glyph = toast.locator('.ui-toast__glyph');
    await expect(glyph).toBeVisible();
    const parts = await measureToast(page, toast, 'the toned toast');
    expect(parts.glyph.width).toBeGreaterThanOrEqual(16);
    expect(parts.glyph.height).toBeGreaterThanOrEqual(16);
    expect(parts.glyph.x).toBeLessThan(parts.body.x);

    const painted = await page.evaluate(() => {
      const card = document.querySelector('.ui-toast-viewport .ui-toast')!;
      const style = getComputedStyle(card);
      const badge = card.querySelector('.ui-toast__glyph')!;
      const badgeStyle = getComputedStyle(badge);
      const title = card.querySelector('.ui-toast__title')!;
      const message = card.querySelector('.ui-toast__message')!;
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

    expect(painted.toneClasses).toEqual(['ui-toast--tone-success']);
    expect(painted.badgeMark).toBe('✓');
    expect(Math.max(channelSpread(painted.badgeInk), channelSpread(painted.badgeFill))).toBeGreaterThanOrEqual(20);

    expect(painted.borderWidths).toEqual([0, 0, 0, 0]);

    expect(channelSpread(painted.fill)).toBeLessThanOrEqual(12);
    expect(painted.titleColour).toBe(painted.primary);
    expect(painted.messageColour).toBe(painted.secondary);
  } finally {
    await removeTagQuietly(newReference);
    await removeStandaloneImage(sourceTag, containerName);
  }
});

// REQ-10 — the stack intercepts no pointer event outside the visible cards.
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

    const onTheCard = await whatTheClickReached(parts.surface.x + 20, middleOfTheCard);
    expect(onTheCard, 'a click on the toast reached nothing at all').not.toBeNull();
    expect(onTheCard!.insideTheStack, 'a click on the toast card itself did not reach the toast').toBe(true);
  } finally {
    await removeTagQuietly(shortReference);
    await removeStandaloneImage(sourceTag, containerName);
  }
});

// REQ-6, REQ-7, REQ-8, REQ-23, REQ-25 — a real pointer dismisses that toast alone; the survivor still expires.
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
    expect(bottom(older)).toBeLessThanOrEqual(newer.y + TOLERANCE_PX);
    expect(Math.abs(right(older) - right(newer))).toBeLessThanOrEqual(TOLERANCE_PX);

    const dismiss = newerToast.getByRole('button', { name: /^Dismiss notification: / });
    await expect(dismiss).toBeVisible();
    await clickAt(page, dismiss, 'the newer toast’s dismiss control');

    await expect(newerToast).toHaveCount(0, { timeout: 2_000 });
    await expect(olderToast).toHaveCount(1);
    const survivor = (await boxesOf(page, { survivor: olderToast }, 'the surviving toast')).survivor!;
    expect(Math.abs(survivor.width - older.width)).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(survivor.height - older.height)).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(right(survivor) - right(older))).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(Math.abs(bottom(survivor) - bottom(newer))).toBeLessThanOrEqual(TOLERANCE_PX);
    await expect(olderToast).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await firstDownload?.delete().catch(() => undefined);
    await secondDownload?.delete().catch(() => undefined);
    await removeStandaloneImage(tagA, containerA);
    await removeStandaloneImage(tagB, containerB);
  }
});

// REQ-16 — at a phone width a toast stays inside the screen, with its clearance and its text wrapped.
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

    await page.setViewportSize(phone);
    const parts = await measureToast(page, toast, 'the toast at a phone width');

    expect(parts.surface.width).toBeLessThanOrEqual(phone.width - VIEWPORT_INSET * 2 + TOLERANCE_PX);
    expect(parts.surface.x).toBeGreaterThanOrEqual(VIEWPORT_INSET - TOLERANCE_PX);
    expect(right(parts.surface)).toBeLessThanOrEqual(phone.width - VIEWPORT_INSET + TOLERANCE_PX);

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
