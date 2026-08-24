/**
 * **Content that has arrived** — the third of the three waits this suite needs,
 * and the one a settle can never stand in for.
 *
 * The vocabulary, in one place, because eight lost runs came of confusing three
 * different questions that all look like "wait for the screen":
 *
 * | the question | the instrument |
 * |---|---|
 * | has the **layout** stopped moving? | `support/settled.ts` — `boxOf`, `readOnceSettled` |
 * | is the node under the pointer still the node I **aimed at**? | `support/delivered-press.ts` — `pressUntilItTakes` |
 * | has the **content** the surface is supposed to hold arrived? | here |
 *
 * They are not substitutes and no two of them are orderable as "stronger". A
 * panel that is still loading has a box, that box has stopped moving, and the
 * node under the pointer is perfectly stable: every instrument but this one says
 * the surface is ready. `list-row-columns.spec.ts` lost a run to exactly that —
 * the containers expansion settled at **226.6px** high while it drew "Loading
 * container details…", grew to **355.1px** when the inspect payload landed, and
 * the two measurements the check compares were taken on either side of that:
 * `x` and `width` agreed to the pixel and the height was out by 128.5px.
 *
 * **What "arrived" means here, and why it cannot pass on a half-drawn panel.**
 * Not "the panel is not empty" — a panel drawing `Loading container details…` is
 * not empty, and that is the whole trap. The product states its own incompleteness
 * and this reads that statement:
 *
 * - **no *pending* `EmptyState` inside the surface.** Every screen draws one while
 *   its payload is outstanding, and the product marks it in its own title: the
 *   pending ones end in an ellipsis — "Loading container details…", "Loading
 *   volume details…", "Loading image details…", "Reading the process list…" —
 *   and the settled ones do not: "No inspect data available", "No process is
 *   running in this container". So while the content is missing this condition is
 *   false **by construction**, and a panel that is legitimately complete *and*
 *   empty still passes. It is the product's own statement of its state, read
 *   rather than guessed, and if a settled state ever acquires an ellipsis this
 *   wait says which title it was waiting on instead of failing silently.
 * - **and the surface draws a body of its own**, meaning something after its tab
 *   strip, with a height. The two together are what distinguish "complete" from
 *   "between two commits, drawing neither the placeholder nor the content yet" —
 *   and neither of them is "the panel is not empty", which is the trap: a panel
 *   drawing `Loading container details…` is not empty, has a box, and has stopped
 *   moving.
 * - **then**, and only then, the box is settled through the shared sampler.
 */
import { expect, type Locator } from '@playwright/test';
import { boxOf, type SettleOptions } from './settled.js';

/** How long the content is given to arrive: a daemon read, not a frame. */
const ARRIVAL_TIMEOUT = 20_000;

interface Arrival {
  present: boolean;
  /** Titles ending in an ellipsis: the product saying this surface is still filling. */
  pending: string[];
  hasBody: boolean;
}

/**
 * Waits for a surface to hold the content it is supposed to hold, then for its
 * box to stop moving — and says which of the two it was still waiting for when
 * it gave up.
 */
export async function waitForArrivedContent(
  surface: Locator,
  what: string,
  options: SettleOptions & { timeout?: number } = {},
): Promise<void> {
  await expect(surface, `${what}: it is not on screen at all`).toBeVisible({ timeout: options.timeout ?? ARRIVAL_TIMEOUT });

  await expect
    .poll(async () => await readArrival(surface), {
      timeout: options.timeout ?? ARRIVAL_TIMEOUT,
      message:
        `${what}: its content never arrived. A title listed under \`pending\` is the product's own statement that ` +
        `the surface is still filling; \`hasBody: false\` is a surface drawing neither its placeholder nor its ` +
        `content. Measuring either is measuring a box the operator never sees (support/arrived.ts).`,
    })
    .toEqual({ present: true, pending: [], hasBody: true });

  // The layout half, last: settling a box that is still waiting for its content
  // measures the placeholder (`support/settled.ts`).
  await boxOf(surface, what, options);
}

/**
 * Everything the arrival test needs, read in one pass so no two of the three
 * conditions come from two different layouts.
 */
async function readArrival(surface: Locator): Promise<Arrival> {
  if ((await surface.count()) === 0) return { present: false, pending: [], hasBody: false };
  return await surface.first().evaluate((element) => {
    // The ellipsis is the product's own mark of a state that is still filling, and it is what
    // separates "Loading container details…" from "No process is running in this container" — a
    // panel that is complete and has nothing to show, which must not be waited for.
    const pending = Array.from(element.querySelectorAll('.ui-empty-state'))
      .map((state) => (state.querySelector('.ui-empty-state__title')?.textContent ?? '').trim())
      .filter((title) => title.endsWith('…'));
    // The body is whatever the surface draws **after its tab strip** — the
    // placeholder occupies that position while the payload is outstanding, so
    // this alone is not the test; it is the half that refuses a surface caught
    // between two commits, drawing neither.
    const tabs = element.querySelector('.ui-tabs');
    const body = tabs === null ? element.firstElementChild : tabs.nextElementSibling;
    const drawnBody =
      body !== null && (body as HTMLElement).getBoundingClientRect
        ? (body as HTMLElement).getBoundingClientRect().height > 0
        : false;
    return { present: true, pending, hasBody: drawnBody };
  });
}
