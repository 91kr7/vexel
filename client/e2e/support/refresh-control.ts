/**
 * **Pressing the top bar's refresh control, and returning when the reload has
 * ended** — the one way a spec asks the product to read the daemon again.
 *
 * Contexts and builders have no daemon event of their own
 * (`plan-docker_management_app-refresh_cache/REQ-12` lists the kinds that get
 * one, and neither is among them), so an object created from the CLI stays
 * invisible for a whole refresh period. The answer is the control the operator
 * has (`plan-docker_management_app-refresh_cache-manual_refresh/REQ-16`), driven
 * here exactly as they drive it.
 *
 * Three constraints shape what is below, and each rules out a shortcut:
 *
 * - **A real pointer at the control's own coordinates** (`CLAUDE.md`, "What a
 *   check drives, and what it measures"): `clickAtItsCentre`, never
 *   `element.click()` and never a dispatched event.
 * - **The endpoint behind the control is never called.** A spec that posts to
 *   `/api/refresh` itself proves the server reloads; it proves nothing about the
 *   screen in front of the operator, which is the half these specs then assert.
 * - **"Ended" is read from the control's own state**, `aria-busy`
 *   (`app-shell/specs/refresh-control.md`: busy from the press until both the
 *   server reload and every subscribed view's re-read have ended). No fixed
 *   delay anywhere: a delay would either be shorter than the reload — and hide
 *   the failure under a retrying assertion — or longer than it, and pay for it
 *   on every call.
 *
 * Why the busy window is **observed rather than polled**: the whole point of the
 * control is that it clears quickly, and a poll that samples every hundred
 * milliseconds can step straight over a window narrower than that. It would then
 * see "not busy", call the reload ended before it began, and read the list the
 * press was supposed to replace — a false pass, which is the failure mode a
 * check must never have. A `MutationObserver` installed before the click cannot
 * miss the transition however short it is.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { clickAtItsCentre } from './settled.js';

/** How long a reload may take before the press is a failure rather than a slow machine. */
const RELOAD_BUDGET_MS = 30_000;

/** The top bar's refresh control — the header's own, on whichever screen is active. */
export function refreshControl(page: Page): Locator {
  return page.locator('.ui-page-header').getByRole('button', { name: 'Refresh', exact: true });
}

/**
 * Presses the refresh control and returns once it has left its working state,
 * which is the product's own claim that the server has read every value again
 * and every mounted view has re-read.
 */
export async function refreshThroughTheControl(page: Page): Promise<void> {
  const control = refreshControl(page);
  await expect(control, 'the header carries no operable refresh control').toBeEnabled({ timeout: RELOAD_BUDGET_MS });

  await watchForTheBusyState(page);
  await clickAtItsCentre(page, control, 'the refresh control');

  await expect
    .poll(theBusyStateWasSeen(page), {
      message: 'the refresh control never entered its working state, so the press started no reload',
      timeout: RELOAD_BUDGET_MS,
    })
    .toBe(true);
  await expect(control, 'the refresh control never left its working state').not.toHaveAttribute('aria-busy', 'true', {
    timeout: RELOAD_BUDGET_MS,
  });
}

/**
 * Records, from before the click, that the header's control entered its working
 * state — however briefly. Reinstalled on every call, so a previous press cannot
 * answer for this one.
 */
async function watchForTheBusyState(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scope = window as unknown as { __vexelRefreshBusySeen?: boolean; __vexelRefreshBusyWatch?: MutationObserver };
    scope.__vexelRefreshBusyWatch?.disconnect();
    scope.__vexelRefreshBusySeen = document.querySelector('.ui-page-header [aria-busy="true"]') !== null;
    const watch = new MutationObserver(() => {
      if (document.querySelector('.ui-page-header [aria-busy="true"]') !== null) scope.__vexelRefreshBusySeen = true;
    });
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] });
    scope.__vexelRefreshBusyWatch = watch;
  });
}

function theBusyStateWasSeen(page: Page): () => Promise<boolean> {
  return async () => await page.evaluate(() => (window as unknown as { __vexelRefreshBusySeen?: boolean }).__vexelRefreshBusySeen === true);
}
