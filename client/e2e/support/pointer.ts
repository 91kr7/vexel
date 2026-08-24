/**
 * **A real pointer at a visible control's own coordinates** — the one way an
 * interaction a human performs with a mouse is driven here (CLAUDE.md, "What a
 * check drives, and what it measures"). Never `element.click()`, never a
 * dispatched event, never aimed at the visually hidden input behind a control.
 *
 * The aiming itself lives in `settled.ts`, with the rest of the suite's box
 * reading: the coordinates are read **once the control has stopped moving**,
 * because a click at coordinates taken from a layout in motion lands where the
 * control was and presses whatever has since slid under the pointer.
 *
 * This module stays as the name its callers already import, and as the place a
 * timeout-bounded aim belongs — `row-overflow-menu.ts` needs one, since it
 * drives a gesture inside a retry loop.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { boxOf, boxThisFrame, centreOf, type Rect, type SettleOptions } from './settled.js';

/**
 * A click at the visible control's settled coordinates.
 *
 * `timeout` bounds the wait for the control to be there at all. A caller that
 * drives a gesture inside a retry loop must bound it: the loop can only start
 * another attempt once this one has returned, so a default-length wait on a
 * control that a specified dismissal has just removed spends the whole budget
 * inside a single attempt instead of retrying the gesture. When it is given, the
 * settle is skipped — the point of that caller is to fail fast and try again,
 * and it re-reads the control from scratch on the next attempt anyway.
 */
export async function clickAt(
  page: Page,
  target: Locator,
  what: string,
  options: { timeout?: number } & SettleOptions = {},
): Promise<void> {
  await target.scrollIntoViewIfNeeded({ timeout: options.timeout });
  const box =
    options.timeout === undefined && options.settle !== false
      ? await boxOf(target, what, options)
      : await boundedBox(target, what, options.timeout);
  // Beside its own box: a control dragged out of the viewport keeps every character it had.
  expect(box.y, `${what}: the control sits above the top of the viewport`).toBeGreaterThanOrEqual(0);
  const centre = centreOf(box);
  await page.mouse.click(centre.x, centre.y);
}

async function boundedBox(target: Locator, what: string, timeout: number | undefined): Promise<Rect> {
  if (timeout === undefined) return await boxThisFrame(target, what);
  const box = await target.boundingBox({ timeout });
  expect(box, `${what}: the control has no box on screen at all`).not.toBeNull();
  return box as Rect;
}
