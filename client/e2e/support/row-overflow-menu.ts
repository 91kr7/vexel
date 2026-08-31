/**
 * **Choosing an entry from a list row's overflow menu, as one gesture — and at
 * most one activation of it.**
 *
 * The menu goes with its trigger when the row is replaced or dropped under the
 * gesture (`ui-library/specs/menu.md`), and choosing an entry closes it too.
 * That is the contract, not a flake — so a check that opens the menu in one
 * retried step and reaches for an entry in a separate, unretried one has written
 * a race into itself: the row is re-read between the two steps and the entry
 * click then waits out its whole budget for something that is gone, failing on a
 * timeout that says nothing about the product.
 *
 * So the opening **and** the choosing are retried as one unit.
 *
 * **What the retry no longer absorbs.** The other dismissal this module was
 * written against — a menu that closed itself on any scroll, whoever produced it
 * — was repaired in the product
 * (`plan-docker_management_app-container_row_actions/REQ-27`): an open menu
 * follows its trigger. A retry whose stated cause has been repaired is how the
 * next regression of it passes unnoticed, so an attempt that finds **no menu
 * while the trigger it pressed is still there, the same node at the same box**
 * ends the gesture and names it, instead of trying again (`REQ-33`). A trigger
 * whose node was replaced, or which has moved or gone, is the surviving case and
 * still deserves another attempt.
 *
 * Which raises the hazard this module's second half exists for: several of the entries reached
 * this way are destructive (`Kill`, `Remove`, `Untag`), and a retry that
 * re-presses an entry whose action already ran runs it twice. **A menu that has
 * gone is not evidence that nothing happened** — it is equally the signature of
 * a dismissal. So the retry is not governed by what is on screen afterwards but
 * by whether the browser ever delivered an activating `click` to a menu entry,
 * observed at the document's own capture phase:
 *
 * - the attempt **succeeds** only when that activation was delivered, to the
 *   entry that was asked for — which is also what makes a press that landed
 *   somewhere else a failure rather than a silent success;
 * - the gesture is **retried only while no activation has been delivered at
 *   all**, which is the only state in which nothing can have run;
 * - an attempt that failed *after* an activation was delivered stops the whole
 *   gesture and says so, rather than pressing anything a second time.
 *
 * The recorder observes; it never drives. Every click here is a real pointer at
 * the visible control's own coordinates, never `element.click()` and never a
 * dispatched event.
 *
 * Two limits, stated because they decide what this can be trusted for:
 *
 * - It errs towards **stopping**, never towards pressing again. A `click` the
 *   recorder saw whose React handler did not run — the entry's fiber unmounting
 *   inside that very dispatch — ends the gesture with the message below instead
 *   of retrying it. That is a check failing on a gesture that did not happen,
 *   which is a report to read; the opposite mistake is a `Remove` running twice.
 * - It is **per document**: a full page load empties it. No entry reached this
 *   way navigates the document — they open a dialog, a form or a confirmation —
 *   so nothing here crosses that boundary; a caller that ever makes one do so
 *   must not use this.
 */
import { expect, type ElementHandle, type Locator, type Page } from '@playwright/test';
import { settledList } from './classic-table.js';
import { clickAt } from './pointer.js';
import type { Rect } from './settled.js';

/**
 * How long one attempt may wait for a control. Short on purpose: an attempt that
 * finds the menu gone must end quickly enough for the next one to start.
 */
const ATTEMPT_TIMEOUT = 2_000;

/** Where the page keeps what it saw. Namespaced so nothing of the product's can collide with it. */
const ACTIVATION_KEY = '__vexelMenuActivations';

/** Half a pixel: below what "the same box" distinguishes, above the browser's own float noise. */
const SAME_BOX_PX = 0.5;

export interface RowOverflowMenuOptions {
  /** The whole gesture's budget, retries included. */
  budget?: number;
  /** The region the list is read in, when it is not the screen's content column. */
  region?: string;
  /** The list's position in that region, when the row is not in the first one. */
  listIndex?: number;
  /** How long the settle step may wait for the list to stop changing. */
  settleBudget?: number;
  /** Skips the settle step, for a caller that has already established the layout has stopped moving. */
  settle?: boolean;
  /** The row's trigger, when it is not addressed by the name every list row gives it. */
  trigger?: string | RegExp;
}

/**
 * Waits for the list holding the row to stop changing shape, so the menu is not
 * opened over a layout still being sized — the suite's own settle primitive, not
 * a variant of it.
 */
export async function settleRowList(page: Page, options: RowOverflowMenuOptions = {}): Promise<void> {
  await settledList(page, { index: options.listIndex ?? 0 }, { region: options.region, budget: options.settleBudget ?? 8_000 });
}

/**
 * Installs (once) and resets the activation recorder.
 *
 * A capture-phase listener on the document sees an entry's `click` on its way
 * in, before the application's own root handler acts on it, so what it records
 * is the very event that runs the entry's `onSelect` — not a proxy for it.
 */
async function armActivationRecorder(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const store = window as unknown as Record<string, unknown>;
    store[key] = [];
    if (store[`${key}:armed`] === true) return;
    store[`${key}:armed`] = true;
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const item = target.closest('[role="menuitem"]');
        if (item === null) return;
        (store[key] as string[]).push((item.getAttribute('aria-label') ?? item.textContent ?? '').trim());
      },
      true,
    );
  }, ACTIVATION_KEY);
}

/** What the page has seen activated since the recorder was last reset. */
async function activationsSoFar(page: Page): Promise<string[]> {
  return await page.evaluate((key) => ((window as unknown as Record<string, unknown>)[key] as string[]) ?? [], ACTIVATION_KEY);
}

/**
 * The trigger as it was pressed — the node itself and where it sat. Both halves
 * are needed to tell the two dismissals apart: a re-read list replaces a row with
 * a new node of identical geometry, so the box alone would read that as the
 * trigger having stayed put.
 */
interface PressedTrigger {
  node: ElementHandle<SVGElement | HTMLElement>;
  box: Rect;
}

async function readTrigger(trigger: Locator): Promise<PressedTrigger | null> {
  const node = await trigger.elementHandle({ timeout: ATTEMPT_TIMEOUT }).catch(() => null);
  if (node === null) return null;
  const box = await node.boundingBox().catch(() => null);
  if (box === null) {
    await node.dispose();
    return null;
  }
  return { node, box };
}

/** The very node that was pressed, still in the document and still at the box it was pressed at. */
async function stayedPut(pressed: PressedTrigger | null): Promise<boolean> {
  if (pressed === null) return false;
  const stillInTheDocument = await pressed.node.evaluate((element) => element.isConnected).catch(() => false);
  if (!stillInTheDocument) return false;
  const box = await pressed.node.boundingBox().catch(() => null);
  return box !== null && Math.abs(box.x - pressed.box.x) < SAME_BOX_PX && Math.abs(box.y - pressed.box.y) < SAME_BOX_PX;
}

/** An activation is the entry that was asked for when its accessible name is that entry, hint text aside. */
function isTheEntry(activated: string, entry: string): boolean {
  return activated === entry || activated.startsWith(entry);
}

/**
 * Opens the row's overflow menu and chooses `entry` — the whole gesture retried,
 * never half of it, and never twice over an activation that was delivered.
 *
 * The loop is written out rather than left to `expect(...).toPass`, which cannot
 * be stopped early: the one state that must end the gesture immediately, instead
 * of retrying it, is an activation already delivered.
 */
export async function chooseFromRowOverflowMenu(
  page: Page,
  row: Locator,
  entry: string,
  options: RowOverflowMenuOptions = {},
): Promise<void> {
  if (options.settle !== false) await settleRowList(page, options);

  const trigger = row.getByRole('button', { name: options.trigger ?? /^More actions for / });
  const deadline = Date.now() + (options.budget ?? 30_000);
  let attempt = 0;

  for (;;) {
    attempt += 1;
    await armActivationRecorder(page);
    const pressed = await readTrigger(trigger);
    try {
      await clickAt(page, trigger, `the row’s overflow menu (attempt ${attempt})`, { timeout: ATTEMPT_TIMEOUT });
      await expect(page.getByRole('menu')).toBeVisible({ timeout: ATTEMPT_TIMEOUT });
      // Playwright's own click for the entry, and deliberately not `clickAt`: it is a real pointer at
      // the control's coordinates just the same, but it re-checks actionability up to the moment it
      // presses and refuses a target that detached in between, and its hit-target check keeps a press
      // aimed at a vanished entry from reaching whatever the menu was covering.
      await page.getByRole('menuitem', { name: entry, exact: true }).click({ timeout: ATTEMPT_TIMEOUT });

      const activated = await activationsSoFar(page);
      expect(
        activated.length === 1 && isTheEntry(activated[0]!, entry),
        `the press was not delivered to “${entry}”: the page saw ${JSON.stringify(activated)}`,
      ).toBe(true);
      // Choosing an entry closes the menu (`ui-library/specs/menu.md`), so its absence beside a
      // delivered activation is what says the gesture completed as the contract describes it.
      await expect(page.getByRole('menu')).toHaveCount(0, { timeout: ATTEMPT_TIMEOUT });
      return;
    } catch (error) {
      const activated = await activationsSoFar(page).catch(() => ['<the page could not be asked>']);
      if (activated.length === 0 && (await page.getByRole('menu').count().catch(() => 1)) === 0 && (await stayedPut(pressed))) {
        throw new Error(
          `The “${entry}” gesture found no menu while the trigger it pressed was still on screen, ` +
            `the same node at the same box (${JSON.stringify(pressed?.box)}). A menu that goes while its ` +
            `control stays put is the dismissal repaired in ` +
            `plan-docker_management_app-container_row_actions/REQ-27, and REQ-33 refuses to absorb it ` +
            `here: not retried. Original failure: ${String(error)}`,
        );
      }
      if (activated.length > 0) {
        throw new Error(
          `The “${entry}” gesture failed after the browser had already delivered an activation ` +
            `(${JSON.stringify(activated)}), so its action may have run. Refusing to press again: ` +
            `retrying here would run a destructive entry twice. Original failure: ${String(error)}`,
        );
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `The “${entry}” gesture never reached the entry in ${attempt} attempt(s): the row was replaced ` +
            `under the gesture each time, and no activation was ever delivered. ` +
            `Last failure: ${String(error)}`,
        );
      }
    } finally {
      await pressed?.node.dispose().catch(() => undefined);
    }
  }
}
