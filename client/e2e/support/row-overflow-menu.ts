/**
 * **Choosing an entry from a list row's overflow menu, as one gesture — and at
 * most one activation of it.**
 *
 * The menu closes on a scroll anywhere between its trigger and the viewport, on
 * a resize, and with its trigger when the row is replaced
 * (`ui-library/specs/menu.md`); choosing an entry closes it too. Those are the
 * contract, not a flake — so a check that opens the menu in one retried step and
 * reaches for an entry in a separate, unretried one has written a race into
 * itself: any of the specified dismissals lands between the two steps and the
 * entry click then waits out its whole budget for something that is gone,
 * failing on a timeout that says nothing about the product.
 *
 * Two runs have been lost to exactly that, with the same signature —
 * `container-create-privileged.spec.ts` (the menu opened on the first attempt,
 * the entry click hung 59.7s of a 60s budget) and `layer-build-cache.spec.ts`
 * (29.3s of 30s) — and in both the snapshot at the timeout showed the row
 * present and no menu at all.
 *
 * So the opening **and** the choosing are retried as one unit. Which raises the
 * hazard this module's second half exists for: several of the entries reached
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
import { expect, type Locator, type Page } from '@playwright/test';
import { settledList } from './classic-table.js';
import { clickAt } from './pointer.js';

/**
 * How long one attempt may wait for a control. Short on purpose: an attempt that
 * finds the menu gone must end quickly enough for the next one to start.
 */
const ATTEMPT_TIMEOUT = 2_000;

/** Where the page keeps what it saw. Namespaced so nothing of the product's can collide with it. */
const ACTIVATION_KEY = '__vexelMenuActivations';

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
      if (activated.length > 0) {
        throw new Error(
          `The “${entry}” gesture failed after the browser had already delivered an activation ` +
            `(${JSON.stringify(activated)}), so its action may have run. Refusing to press again: ` +
            `retrying here would run a destructive entry twice. Original failure: ${String(error)}`,
        );
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `The “${entry}” gesture never reached the entry in ${attempt} attempt(s): the menu opened and ` +
            `was dismissed before the press each time, and no activation was ever delivered. ` +
            `Last failure: ${String(error)}`,
        );
      }
    }
  }
}
