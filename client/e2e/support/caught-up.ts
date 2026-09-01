/**
 * **The screen stating what the daemon states** — the fourth wait of this suite, and the one none of
 * the other three can stand in for.
 *
 * `support/arrived.ts` names three questions: has the layout stopped moving, is the node under the
 * pointer the one I aimed at, has the content arrived. This is a fourth, and **`arrived.ts` is not
 * its instrument**: the screen these checks look at is not loading and is not half-drawn. It holds a
 * complete, correct, settled snapshot — of a moment **before** the fixture the test has just
 * finished creating. Every instrument of the other three says the screen is ready, and it is; it is
 * simply older than the fixture.
 *
 * | the question | the instrument |
 * |---|---|
 * | has the **layout** stopped moving? | `support/settled.ts` |
 * | is the node under the pointer still the node I **aimed at**? | `support/delivered-press.ts` |
 * | has the **content** the surface is supposed to hold arrived? | `support/arrived.ts` |
 * | is the snapshot on screen **as new as the fixture**? | here |
 *
 * **Why a burst of fixture creation produces such a snapshot.** The lists are served from a snapshot
 * the server holds, and a daemon event starts the read that fills it: the first event of a window is
 * read at once and every event of the grouping window after it is deferred to that window's end
 * (`EVENT_GROUPING_WINDOW_MS`, `server/src/refresh-cache/refresh-cache.ts`). So the read a `create`
 * event starts is aimed at the instant *between* the calls a test's `docker run` / `docker create`
 * loop is making, and whatever it finds there is then served for a whole window. A container
 * publishes its ports when it **starts**; a volume gains its mounts one `docker create` at a time; an
 * image gains its second tag after the commit that made it. Each of those intermediate states is a
 * true snapshot of a real instant, and none of them is what the test arranged.
 *
 * The product is not being worked around: holding the snapshot is a decision it states
 * (`plan-docker_management_app-refresh_cache/REQ-60`), and it catches up within one window — the
 * window being five times shorter since `VEXEL_TIMING_SCALE` (`plan-docker_management_app-timing_scale`),
 * which is why the intermediate states an older, wider window used to swallow became observable.
 *
 * So the daemon is asked what it holds and the screen is waited on until it says the same. The
 * daemon's answer is read again on every attempt rather than stated here: this is a wait for the two
 * to agree, not an assertion about either, and every check that follows still asserts, in full, what
 * its own requirement claims.
 */
import { expect, type Page } from '@playwright/test';
import { execFileAsync } from '../../../server/test/support/docker-cli.js';
import { containerCards } from './container-cards.js';

/**
 * How long the two are given to agree. 8s = the window that defers the read the last event marked
 * due (0.75s, `EVENT_GROUPING_WINDOW_MS`) + the list poll that carries it to the screen (3s, the
 * `POLL_INTERVAL_MS` of the screen's own hook) + 4.25s slack, which is more than a second window and
 * poll cost. Both figures are the product's unscaled ones, so the budget holds at any
 * `VEXEL_TIMING_SCALE`: the suite's own 0.2 only makes the product reach agreement sooner.
 *
 * Running out means the screen and the daemon disagree about this test's own fixtures for longer
 * than the product says it takes to agree: a corrected count, or a defect.
 */
export const CATCH_UP_TIMEOUT_MS = 8_000;

export interface CatchUpOptions {
  /** What the two are being compared about, for the failure message: "the volume's mounting containers". */
  what: string;
  /** What the daemon holds, read afresh on every attempt, and always before `screen`. */
  daemon: () => Promise<string[]>;
  /** What the screen states about the same thing, in whatever wording the screen uses. */
  screen: () => Promise<string[]>;
  timeout?: number;
}

/**
 * Waits until the screen states what the daemon states. Both lists are sorted before they are
 * compared: two listings of one set, and the order either of them came in says nothing.
 */
export async function waitUntilTheScreenStatesWhatTheDaemonStates({
  what,
  daemon,
  screen,
  timeout = CATCH_UP_TIMEOUT_MS,
}: CatchUpOptions): Promise<void> {
  await expect
    .poll(
      async () => {
        const stated = [...(await daemon())].sort();
        const drawn = [...(await screen())].sort();
        return { agreed: JSON.stringify(stated) === JSON.stringify(drawn), daemon: stated, screen: drawn };
      },
      {
        timeout,
        message:
          `the screen never came to state what the daemon states about ${what}: it is a snapshot older than this ` +
          'test’s own fixtures, and a check reading it measures something the fixture has already moved on from ' +
          '(`EVENT_GROUPING_WINDOW_MS`, server/src/refresh-cache/refresh-cache.ts).',
      },
    )
    .toMatchObject({ agreed: true });
}

/**
 * **The containers list saying what the daemon says about the fixtures under `stem`** — and a count
 * of cards cannot stand in for it.
 *
 * A run was lost to exactly that: the grid check's fourth card drew `none` where its four
 * publications belong, off a snapshot read 36ms before the test opened the app and served for the
 * 640ms the whole test body took. A count is satisfied by that snapshot, and a settle on geometry is
 * identical either way, the PORTS row being the same height with `none` as with its chips.
 *
 * The state is what is compared, and the ports come with it: both are read off the daemon in one
 * pass, so a card that has caught up with the state its fixture is in is a card drawn from a
 * snapshot taken after the `docker run` that put it there.
 */
export async function waitForTheListToCatchUp(page: Page, stem: string): Promise<void> {
  await waitUntilTheScreenStatesWhatTheDaemonStates({
    what: `the containers under ${stem}`,
    daemon: async () => {
      const { stdout } = await execFileAsync('docker', ['ps', '--all', '--filter', `name=${stem}`, '--format', '{{.Names}} {{.State}}']);
      return stdout
        .trim()
        .split('\n')
        .filter((line) => line !== '');
    },
    screen: async () =>
      containerCards(page).evaluateAll((cards) =>
        cards.map((card) => {
          const name = (card.querySelector('.ui-section-header__title')?.textContent ?? '').trim();
          const state = (card.querySelector('.ui-badge')?.textContent ?? '').trim().toLowerCase();
          return `${name} ${state}`;
        }),
      ),
  });
}
