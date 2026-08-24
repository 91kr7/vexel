/**
 * **Reading a box, once it has stopped moving — the suite's one way of doing it.**
 *
 * A box read from a layout in motion is not a wrong number; it is a **right
 * number about a moment nobody sees**. That distinction is what made this class
 * of defect so expensive here: the reading is internally consistent, so
 * everything derived from it agrees with everything else, and the check either
 * fails citing the product or passes while measuring the wrong frame.
 *
 * Six lost runs, each diagnosed on its own, all of it one property:
 *
 * - a menu entry pressed at coordinates read before a reflow dismissed the menu;
 * - a compose panel measured before its file had arrived — "the panel draws no
 *   compose editor", on a snapshot whose own dump held the editor;
 * - a property section measured at a 1280px window that returned the
 *   `630.0×295.1px` box it had at 720px, identical to the decimal, because the
 *   panel still carried the inline pin the `ResizeObserver` had not yet
 *   recomputed;
 * - a builders toolbar whose bottom read 714px above a list whose top read
 *   592px — three `boundingBox()` calls in a row, compared to one another, taken
 *   at three different moments of one layout coming to rest.
 *
 * Each was repaired where it fell, by a settle primitive written on the spot:
 * twelve of them, in twelve files, each wired to the one site whose run had
 * failed. The lesson never generalised because **reading a box was unsafe by
 * default** and the safe reading was the one somebody had to remember to ask
 * for. So here it is once, and it takes the plain name.
 *
 * Two rules the sampling follows, both paid for:
 *
 * - **Consecutive readings must agree** before one is returned. What is measured
 *   is where the layout came to rest, which is the only state an operator sees.
 * - **The first frame is discarded.** A box read before the browser has re-laid
 *   the page out at all is stale *and stable*: two such samples agree with each
 *   other, and a loop that compares its first two readings returns the stale one
 *   as settled. That is not hypothetical — it is the shape of the 1280px failure
 *   above.
 *
 * **Three questions, three instruments, and no two of them are substitutes.**
 * This module answers the first; the other two are named here so that nobody
 * answers them by asking this one for a longer wait, which is what a reader
 * reaches for and what will not work:
 *
 * | the question | the instrument |
 * |---|---|
 * | has the **layout** stopped moving? | here — `boxOf`, `boxesOf`, `readOnceSettled` |
 * | is the node under the pointer still the node I **aimed at**? | `support/delivered-press.ts` |
 * | has the **content** the surface should hold arrived? | `support/arrived.ts` |
 *
 * **The first limit: a settled box is not a stable node.** Sampling proves the *layout* stopped moving; it proves nothing
 * whatever about the element under the pointer still being the element that was
 * aimed at. A list that re-reads on a poll or on a daemon event replaces its rows
 * with new nodes of **identical geometry**, so every reading agrees, the reader
 * returns immediately, and the press then goes to a node on its way out — or, if
 * `mousedown` and `mouseup` straddle the swap, to the nearest common ancestor of
 * the two, which is the table rather than the row. `compose-row-geometry.spec.ts`
 * lost a run that way with a press sent 57ms after the response that replaced the
 * row, and no settle of any length would have saved it. Anyone reaching for a
 * longer wait here is reaching for the wrong instrument: the question is answered
 * by observing the delivery, in `support/delivered-press.ts`.
 *
 * **The second limit: a settled box is not arrived content.** A panel still
 * waiting for its payload has a box, that box has stopped moving, and every
 * reading of it agrees — while what it is drawing is the word "Loading".
 * `list-row-columns.spec.ts` lost a run to it: the containers expansion settled
 * at **226.6px** high against the **355.1px** it reaches once the inspect payload
 * lands, `x` and `width` agreeing to the pixel and the height out by 128.5. The
 * remedy is to wait for the content the surface is supposed to hold and settle
 * the box afterwards, which is `support/arrived.ts`; no amount of sampling here
 * can reach it, because nothing is moving.
 *
 * What must **not** come here: a check whose subject is the unsettled state
 * itself. `support/surface-stability.ts` reads a surface's box before and after
 * an interaction precisely to catch a surface that moves (CLAUDE.md, "A check
 * that measures content cannot detect a defect that moves position"), and
 * settling either half of that pair would erase the defect it exists to find.
 * Those reads stay single-frame, and say so on the spot.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** A rectangle in viewport coordinates, as the browser reports it. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Two agreeing readings are the default; 30 attempts is ~1s of frames and is never reached at rest. */
const ATTEMPTS = 30;
/** Half a pixel: below what any assertion in this suite distinguishes, above float noise. */
const TOLERANCE_PX = 0.5;

export interface SettleOptions {
  /** How many samples may be taken before the last reading is returned anyway. */
  attempts?: number;
  /**
   * Set `false` to read a single frame at a site that measurably cannot afford
   * the frames — an opt-out that has to be written down, and justified where it
   * is written.
   */
  settle?: boolean;
}

/** One pair of animation frames: long enough for a `ResizeObserver` to have run and the frame to have been laid out. */
export async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/**
 * **The sampler every settled reading in the suite is built on** — a box, a list
 * geometry, a section's bands, a count.
 *
 * Local primitives compose this rather than re-implementing it, so that a
 * hardening of the sampling (the discarded first frame, for one) reaches all of
 * them at once instead of the one that was being repaired that day.
 */
export async function readOnceSettled<T>(
  page: Page,
  read: () => Promise<T>,
  same: (previous: T, current: T) => boolean,
  options: SettleOptions = {},
): Promise<T> {
  if (options.settle === false) return await read();
  await twoFrames(page);
  let previous = await read();
  for (let attempt = 0; attempt < (options.attempts ?? ATTEMPTS); attempt += 1) {
    await twoFrames(page);
    const current = await read();
    if (same(previous, current)) return current;
    previous = current;
  }
  return previous;
}

function sameRect(previous: Rect, current: Rect): boolean {
  return (
    Math.abs(previous.x - current.x) < TOLERANCE_PX &&
    Math.abs(previous.y - current.y) < TOLERANCE_PX &&
    Math.abs(previous.width - current.width) < TOLERANCE_PX &&
    Math.abs(previous.height - current.height) < TOLERANCE_PX
  );
}

/**
 * **One frame, whatever frame that is.** Reachable only by naming it, which is
 * the point: a site that reads a single frame is either measuring movement on
 * purpose or has not thought about it, and those two must not look the same in
 * the source.
 */
export async function boxThisFrame(target: Locator, description: string): Promise<Rect> {
  const box = await target.boundingBox();
  expect(box, `${description} has no box on screen, so nothing about its position can be measured`).not.toBeNull();
  return box as Rect;
}

/** The box of a control or a surface, once it has stopped moving. */
export async function boxOf(target: Locator, description: string, options: SettleOptions = {}): Promise<Rect> {
  return await readOnceSettled(target.page(), () => boxThisFrame(target, description), sameRect, options);
}

/**
 * **Several boxes in one settled layout**, which is not the same thing as several
 * settled boxes: a check comparing a header, a toolbar and a list to one another
 * needs the three read at *one* moment, and reading them one at a time is how a
 * toolbar's bottom edge came to be reported 122px below the top of the list it
 * sits above.
 */
export async function boxesOf(
  page: Page,
  targets: Record<string, Locator>,
  description: string,
  options: SettleOptions = {},
): Promise<Record<string, Rect>> {
  const names = Object.keys(targets);
  const readAll = async (): Promise<Record<string, Rect>> => {
    const reading: Record<string, Rect> = {};
    for (const name of names) reading[name] = await boxThisFrame(targets[name]!, `${description}: the ${name}`);
    return reading;
  };
  return await readOnceSettled(
    page,
    readAll,
    (previous, current) => names.every((name) => sameRect(previous[name]!, current[name]!)),
    options,
  );
}

/** The centre of a rectangle — where a pointer aimed at a control goes. */
export function centreOf(box: Rect): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * **A real pointer at the visible control's own coordinates, read once the
 * control has stopped moving** (CLAUDE.md, "What a check drives, and what it
 * measures"): never `element.click()`, never a dispatched event, never aimed at
 * the visually hidden input behind a control.
 *
 * The settle makes that guarantee *more* true, not less. A click at coordinates
 * read from a layout still moving lands where the control **was**; what it hits
 * is whatever has slid under the pointer, which is an activation of something
 * nobody asked for and reads afterwards as the product having ignored a click.
 */
export async function clickAtItsCentre(page: Page, target: Locator, what: string, options: SettleOptions = {}): Promise<void> {
  const box = await settledControlBox(target, what, options);
  const centre = centreOf(box);
  await page.mouse.click(centre.x, centre.y);
}

/** The same aim, without pressing: for a wheel delivered over a row, or a hover. */
export async function movePointerTo(page: Page, target: Locator, what: string, options: SettleOptions = {}): Promise<Rect> {
  const box = await settledControlBox(target, what, options);
  const centre = centreOf(box);
  await page.mouse.move(centre.x, centre.y);
  return box;
}

/**
 * A wheel is delivered over a **row**, near its leading edge rather than at its
 * centre: a row wider than the box it is read in has its own centre over some
 * other column, or over a control (`classic-table.md`). The idiom appeared in
 * seven files written out by hand; it is one thing.
 */
export async function movePointerOverTheRow(page: Page, row: Locator, what: string, options: SettleOptions = {}): Promise<Rect> {
  const box = await settledControlBox(row, what, options);
  await page.mouse.move(box.x + Math.min(60, box.width / 2), box.y + box.height / 2);
  return box;
}

/**
 * The box a pointer may be aimed at: brought into view, settled, and refused if
 * it sits above the top of the viewport — a control dragged out of the viewport
 * keeps every character it had, so its coordinates are the only thing that says
 * so.
 */
async function settledControlBox(target: Locator, what: string, options: SettleOptions): Promise<Rect> {
  await target.scrollIntoViewIfNeeded();
  const box = await boxOf(target, what, options);
  expect(box.y, `${what}: the control sits above the top of the viewport`).toBeGreaterThanOrEqual(0);
  return box;
}
