/**
 * Counts the `progress` events an analysis stream actually delivers to the page.
 *
 * It exists for one contract: an analysis served from the shared cache
 * **short-circuits straight to its end, with no progress events at all**
 * (`image-analysis/specs/changeset-service.md`), and the progress dialog it
 * still raises must state `Completed` rather than the wording a caller's
 * `formatCaption` falls back to when no phase has been reported
 * (`ui-library/specs/transfer-progress-dialog.md`,
 * `plan-docker_management_app-progress_completion_autoclose/REQ-2`, REQ-22).
 *
 * That scenario is the one bug-1 was certified on, relocated here by
 * `plan-docker_management_app-filesystem_browse_direct/REQ-28`. Without a
 * witness, a relocated check only says "the dialog completed and left", which is
 * true of an ordinary uncached run too — and the coverage that certified the
 * sibling fix would have been retired with the suite green.
 *
 * The counting is done in the page, by wrapping `EventSource` — the only channel
 * these streams are read through (`client/src/data/use-image-*.ts`) — before the
 * application's own code loads. The wrapper adds a listener and nothing else: it
 * neither suppresses nor reorders what the application receives.
 */
import type { Page } from './test.js';

/** The window property the counts are accumulated on, named once for both halves. */
const COUNTER = '__vexelStreamProgressEvents';

/**
 * Installs the counter. It applies from the **next navigation** onwards (a Playwright init script),
 * so the caller reloads after calling it, and the counts start empty at that reload.
 */
export async function countStreamProgressEvents(page: Page): Promise<void> {
  await page.addInitScript((counter: string) => {
    const store: Record<string, number> = {};
    (window as unknown as Record<string, unknown>)[counter] = store;
    const NativeEventSource = window.EventSource;
    class CountingEventSource extends NativeEventSource {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        this.addEventListener('progress', () => {
          const key = String(url);
          store[key] = (store[key] ?? 0) + 1;
        });
      }
    }
    window.EventSource = CountingEventSource as unknown as typeof EventSource;
  }, COUNTER);
}

/** How many `progress` events every stream whose URL contains `urlFragment` has delivered so far. */
export async function progressEventsSeen(page: Page, urlFragment: string): Promise<number> {
  return page.evaluate(
    ([counter, fragment]) => {
      const store = ((window as unknown as Record<string, unknown>)[counter] ?? {}) as Record<string, number>;
      return Object.entries(store)
        .filter(([url]) => url.includes(fragment))
        .reduce((total, [, count]) => total + count, 0);
    },
    [COUNTER, urlFragment] as const,
  );
}
