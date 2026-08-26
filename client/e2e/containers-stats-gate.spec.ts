/**
 * **The sampling gate, driven through the interface**
 * (`plan-docker_management_app-containers_card_view/REQ-42`, `REQ-43`, `REQ-45`, `REQ-47`,
 * `REQ-48`, `REQ-51`, `REQ-54`, `REQ-55`).
 *
 * **What this file can and cannot see, stated once.** The requirement F2 is written as *traffic
 * reaching the daemon*, and a browser cannot count that: the count of stats requests leaving for
 * the Engine API is asserted in `server/test/unit/stats-subscription-endpoint.test.ts` and
 * `server/test/unit/containers-stats-sampling.test.ts`, which is where this batch's measurement
 * genuinely lives. What the interface can be held to is the other half, and this file holds it to
 * exactly that, with two observables and no third:
 *
 * - **the subscription connection itself** — the requirement's own mechanism ("a consumer proves it
 *   exists by holding a connection"), recorded by wrapping the browser's `EventSource` before the
 *   application loads. It is an instrument over a standard browser API, not a surface added to the
 *   product for a test's benefit;
 * - **the figures on the card** — which, past the staleness bound, state *no sample* rather than
 *   redisplaying a number nobody measured. So a screen still showing a measured figure **after more
 *   than thirty seconds** is a screen the daemon has gone on being sampled for, and that is how the
 *   two-tab case is asserted without counting anything.
 *
 * Every navigation is driven with a **real pointer at the visible control's own coordinates**.
 * Fixtures are this file's own, labelled, removed in a `finally`, and the list is narrowed to them
 * by the screen's own search.
 */
import { expect, test, type Page } from './support/test.js';
import { navEntry, openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { clickAt } from './support/pointer.js';
import { closeContainerDetail, containerCard, containerCards, containerDetail, openContainerDetail } from './support/container-cards.js';

/** The staleness bound is three intervals; past it a figure reaches no consumer. */
const STALENESS_BOUND_MS = 30_000;
/** Comfortably past it, so nothing measured before a gate closed can still be standing. */
const PAST_STALENESS_MS = 36_000;
/**
 * What "promptly" is allowed to cost: the immediate sample the gate takes on opening, plus the
 * list poll that carries it to the screen. Below one sampling interval on purpose — a figure that
 * only appeared after ten seconds would mean no prompt sample was taken.
 */
const PROMPT_MS = 8_000;
/** One sampling interval and one list poll: what a figure may cost when the gate was already open. */
const ONE_INTERVAL_MS = 16_000;

interface SubscriptionLog {
  opened: number;
  closed: number;
}

/**
 * Records the subscription connections the page opens and closes, before the application loads.
 * The daemon event stream uses `EventSource` too, so the URL is the filter.
 */
async function recordSubscriptions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const NativeEventSource = window.EventSource;
    const log = { opened: 0, closed: 0 };
    (window as unknown as { __statsSubscriptions: typeof log }).__statsSubscriptions = log;

    class RecordedEventSource extends NativeEventSource {
      private isSubscription = false;
      private alreadyClosed = false;

      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        if (String(url).includes('/api/containers/stats/subscription')) {
          this.isSubscription = true;
          log.opened += 1;
        }
      }

      override close(): void {
        if (this.isSubscription && !this.alreadyClosed) {
          this.alreadyClosed = true;
          log.closed += 1;
        }
        super.close();
      }
    }

    window.EventSource = RecordedEventSource as unknown as typeof EventSource;
  });
}

async function subscriptionLog(page: Page): Promise<SubscriptionLog> {
  return await page.evaluate(
    () => (window as unknown as { __statsSubscriptions?: SubscriptionLog }).__statsSubscriptions ?? { opened: 0, closed: 0 },
  );
}

/** How many subscriptions this page is holding open right now. */
async function heldSubscriptions(page: Page): Promise<number> {
  const log = await subscriptionLog(page);
  return log.opened - log.closed;
}

async function expectHeld(page: Page, expected: number, what: string): Promise<void> {
  await expect(async () => {
    expect(await heldSubscriptions(page), what).toBe(expected);
  }).toPass({ timeout: 10_000 });
}

/**
 * Hides or shows the tab.
 *
 * Headless Chromium reports every page as visible whatever the automation does to it — neither the
 * page lifecycle (`Page.setWebLifecycleState: frozen`) nor bringing another tab to the front moves
 * `document.visibilityState`, measured on this environment. So the browser's own signal is produced
 * directly. This is not the forbidden case of a dispatched event standing in for a pointer: there is
 * no control to press, and a backgrounded tab is a browser state rather than an interaction.
 */
async function setTabVisibility(page: Page, state: 'visible' | 'hidden'): Promise<void> {
  await page.evaluate((visibility) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

/** A container doing measurable work every second, so its CPU reading is a live number. */
async function createWorkingContainer(name: string): Promise<void> {
  await execFileAsync('docker', [
    'run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sh', ALPINE_IMAGE,
    '-c', 'while :; do dd if=/dev/zero of=/dev/null bs=1M count=200 2>/dev/null; sleep 1; done',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** Opens the containers screen narrowed to one fixture, so the operator's own containers are none of this file's business. */
async function openContainersNarrowedTo(page: Page, name: string): Promise<void> {
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  await page.getByPlaceholder('Search name, image or state…').fill(name);
  await expect(containerCards(page)).toHaveCount(1, { timeout: 20_000 });
}

/** The card is showing a measurement rather than the *no sample* state. */
async function expectAMeasuredFigure(page: Page, name: string, timeout = PROMPT_MS): Promise<void> {
  await expect(containerCard(page, name), `${name} is showing no measured figure`).not.toContainText('no sample', {
    timeout,
  });
}

/**
 * The container's row in the dashboard's activity list, showing a measured CPU reading.
 *
 * The list is virtualised and how far down this file's own container sits depends on how many the
 * operator is running, so the row is scrolled to rather than assumed to be mounted.
 */
async function expectACpuReading(page: Page, name: string): Promise<void> {
  const panel = page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Container activity' }) });
  const row = panel.locator('.ui-data-table__row').filter({ hasText: name });
  await expect
    .poll(
      async () => {
        if ((await row.count()) > 0 && /\d+% cpu/.test((await row.first().innerText()).replace(/\n/g, ' '))) return true;
        await panel.locator('.ui-scroll-area').evaluate((node) => {
          node.scrollTop += 200;
        });
        return false;
      },
      { message: `the dashboard never showed a CPU reading for ${name}`, timeout: 30_000 },
    )
    .toBe(true);
}

function fixtureName(what: string): string {
  return `vexel-e2e-gate-${what}-${Date.now()}`;
}

test.beforeAll(async () => {
  await ensureImage(ALPINE_IMAGE);
});

// REQ-42, REQ-48 — the screen that displays the figures holds the subscription while it is shown,
// and the figures on it are measurements.
//
// The figure is allowed one whole interval here, deliberately: whether the gate opens *from zero*
// when this test starts depends on whatever the run has just closed, and promptness is a claim
// about that transition. It is asserted in the test below, which makes the transition itself.
test('the containers screen holds one subscription and shows measured figures', async ({ page }) => {
  test.setTimeout(60_000);
  const name = fixtureName('open');
  try {
    await createWorkingContainer(name);
    await recordSubscriptions(page);
    await openContainersNarrowedTo(page, name);

    await expectHeld(page, 1, 'the containers screen holds exactly one subscription');
    await expectAMeasuredFigure(page, name, ONE_INTERVAL_MS);
  } finally {
    await removeContainerQuietly(name);
  }
});

// detail_modal/REQ-22 — an open detail dialog does not close the gate: the screen is still the
// screen being shown while the dialog stands over it, so the daemon goes on being sampled at its
// certified cadence, and dismissing the dialog blanks no card.
test('an open detail dialog leaves the subscription held, and closing it blanks no card', async ({ page }) => {
  test.setTimeout(90_000);
  const name = fixtureName('dialog');
  try {
    await createWorkingContainer(name);
    await recordSubscriptions(page);
    await openContainersNarrowedTo(page, name);
    await expectHeld(page, 1, 'the containers screen holds exactly one subscription');
    await expectAMeasuredFigure(page, name, ONE_INTERVAL_MS);

    await openContainerDetail(page, name);
    await expect(containerDetail(page)).toBeVisible();

    // Longer than one sampling interval, with the dialog standing: the gate is still open and the
    // sampler is still delivering.
    await expectHeld(page, 1, 'the open dialog closed the sampling gate');
    await page.waitForTimeout(ONE_INTERVAL_MS);
    await expectHeld(page, 1, 'the gate closed while the dialog stood over the screen');

    await closeContainerDetail(page);

    await expectHeld(page, 1, 'dismissing the dialog took the screen’s own subscription with it');
    // Immediately, not after another interval: a card blanked by the dismissal would read *no sample*.
    await expectAMeasuredFigure(page, name, PROMPT_MS);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-42, REQ-48, REQ-51, REQ-52 — moving to a section that shows none of these figures releases the
// subscription, and coming back after the staleness bound has passed is served a fresh figure
// promptly rather than an interval later.
test('leaving for a section that shows no figures releases the subscription, and returning is served promptly', async ({
  page,
}) => {
  // Waiting the staleness bound out is what the assertion is made of, not slack.
  test.setTimeout(120_000);
  const name = fixtureName('section');
  try {
    await createWorkingContainer(name);
    await recordSubscriptions(page);
    await openContainersNarrowedTo(page, name);
    await expectHeld(page, 1, 'the containers screen holds a subscription');

    await clickAt(page, navEntry(page, 'Volumes & networks'), 'the Volumes & networks rail entry');
    await expect(page.getByRole('heading', { level: 1, name: /Volumes/ })).toBeVisible();

    await expectHeld(page, 0, 'a section that displays none of these figures holds no subscription');

    // Long enough that anything measured before the gate closed is past the staleness bound, so
    // what appears on return is a fresh reading and not a redisplayed one.
    await page.waitForTimeout(PAST_STALENESS_MS);
    await expectHeld(page, 0, 'nothing re-opened a subscription while the section was away');

    await clickAt(page, navEntry(page, 'Containers'), 'the Containers rail entry');
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    await page.getByPlaceholder('Search name, image or state…').fill(name);

    await expectHeld(page, 1, 'returning to the screen re-opens exactly one subscription');
    await expectAMeasuredFigure(page, name);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-43, REQ-51, REQ-54 — the tab going away closes the gate; the tab coming back opens exactly one
// subscription, never a second beside the first.
test('hiding the tab releases the subscription and returning re-opens exactly one', async ({ page }) => {
  test.setTimeout(90_000);
  const name = fixtureName('visibility');
  try {
    await createWorkingContainer(name);
    await recordSubscriptions(page);
    await openContainersNarrowedTo(page, name);
    await expectHeld(page, 1, 'the visible tab holds a subscription');

    await setTabVisibility(page, 'hidden');
    await expectHeld(page, 0, 'a hidden tab is not a consumer');

    await setTabVisibility(page, 'visible');
    await expectHeld(page, 1, 'the tab coming back holds exactly one subscription, not two');
    await expectAMeasuredFigure(page, name, ONE_INTERVAL_MS);

    // Hiding and returning repeatedly is the drift case: a session's worth of them still holds one.
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await setTabVisibility(page, 'hidden');
      await expectHeld(page, 0, `cycle ${cycle} left a subscription behind a hidden tab`);
      await setTabVisibility(page, 'visible');
      await expectHeld(page, 1, `cycle ${cycle} holds one subscription, not one more`);
    }
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-47 — two tabs are two consumers: one of them closing does not stop the sampling the other is
// reading. Measured on the surviving tab past the staleness bound, where a stopped sampler would
// show as *no sample* rather than as a number.
test('one of two tabs closing leaves the other reading measured figures past the staleness bound', async ({
  page,
  context,
}) => {
  // The surviving tab is watched for longer than the staleness bound on purpose.
  test.setTimeout(120_000);
  const name = fixtureName('two-tabs');
  const second = await context.newPage();
  try {
    await createWorkingContainer(name);
    await recordSubscriptions(page);
    await recordSubscriptions(second);
    await openContainersNarrowedTo(page, name);
    await openContainersNarrowedTo(second, name);
    await expectHeld(page, 1, 'the first tab holds a subscription');
    await expectHeld(second, 1, 'the second tab holds one of its own');
    await expectAMeasuredFigure(page, name, ONE_INTERVAL_MS);

    await second.close();

    // The surviving tab keeps reading for longer than the bound past which an unrefreshed figure is
    // withheld: it is still a measurement, so the sampling never stopped.
    await page.waitForTimeout(STALENESS_BOUND_MS + 6_000);
    await expectHeld(page, 1, 'the surviving tab still holds its subscription');
    await expect(containerCard(page, name), 'the surviving tab fell back to the no-sample state').not.toContainText(
      'no sample',
      { timeout: 5_000 },
    );
  } finally {
    if (!second.isClosed()) await second.close();
    await removeContainerQuietly(name);
  }
});

// REQ-54 — the gate neither leaks nor wedges: repeated section changes and a reload leave exactly
// one subscription held, one per visit and never one more.
test('repeated section changes and a reload leave exactly one subscription held', async ({ page }) => {
  test.setTimeout(120_000);
  const name = fixtureName('cycles');
  try {
    await createWorkingContainer(name);
    await recordSubscriptions(page);
    await openContainersNarrowedTo(page, name);
    await expectHeld(page, 1, 'the screen holds one subscription before the cycles begin');
    const { opened: opensBeforeCycles, closed: closesBeforeCycles } = await subscriptionLog(page);

    for (let cycle = 1; cycle <= 3; cycle += 1) {
      await clickAt(page, navEntry(page, 'Volumes & networks'), 'the Volumes & networks rail entry');
      await expect(page.getByRole('heading', { level: 1, name: /Volumes/ })).toBeVisible();
      await expectHeld(page, 0, `cycle ${cycle} left a subscription behind`);

      await clickAt(page, navEntry(page, 'Containers'), 'the Containers rail entry');
      await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
      await expectHeld(page, 1, `cycle ${cycle} holds exactly one subscription`);
    }

    const afterCycles = await subscriptionLog(page);
    expect(afterCycles.opened - opensBeforeCycles, 'each visit opened exactly one subscription, and not one more').toBe(3);
    expect(afterCycles.closed - closesBeforeCycles, 'each departure closed exactly one, and not one fewer').toBe(3);

    // A reload takes the page's whole world with it, the recorder included: what the reloaded page
    // must hold is one, counted afresh.
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    await expectHeld(page, 1, 'the reloaded page holds exactly one subscription');

    await page.getByPlaceholder('Search name, image or state…').fill(name);
    await expectAMeasuredFigure(page, name, ONE_INTERVAL_MS);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-55 — the list poll keeps its delivered cadence: a container started outside the product still
// appears without a manual refresh, within the window it appeared in before this change.
test('a container started outside the product still appears within the list poll window', async ({ page }) => {
  const stem = fixtureName('poll');
  const first = `${stem}-a`;
  const second = `${stem}-b`;
  try {
    await createWorkingContainer(first);
    await recordSubscriptions(page);
    await openApp(page, 'containers');
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    await page.getByPlaceholder('Search name, image or state…').fill(stem);
    await expect(containerCards(page)).toHaveCount(1, { timeout: 20_000 });

    await createWorkingContainer(second);

    await expect(containerCard(page, second), 'the new container did not appear within the poll window').toBeVisible({
      timeout: PROMPT_MS,
    });
  } finally {
    await removeContainerQuietly(first);
    await removeContainerQuietly(second);
  }
});

// REQ-45 — the gate is on consumers, not on one named screen: the dashboard is a consumer too, and
// its CPU reading keeps working across the same cycle.
test('the dashboard holds a subscription of its own and keeps its CPU reading across the cycle', async ({ page }) => {
  test.setTimeout(150_000);
  const name = fixtureName('dashboard');
  try {
    await createWorkingContainer(name);
    await recordSubscriptions(page);
    await openApp(page, 'dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

    await expectHeld(page, 1, 'the dashboard holds a subscription of its own');

    await expectACpuReading(page, name);

    await clickAt(page, navEntry(page, 'Volumes & networks'), 'the Volumes & networks rail entry');
    await expect(page.getByRole('heading', { level: 1, name: /Volumes/ })).toBeVisible();
    await expectHeld(page, 0, 'leaving the dashboard released its subscription');

    await page.waitForTimeout(PAST_STALENESS_MS);

    await clickAt(page, navEntry(page, 'Dashboard'), 'the Dashboard rail entry');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expectHeld(page, 1, 'returning to the dashboard re-opens one subscription');

    await expectACpuReading(page, name);
  } finally {
    await removeContainerQuietly(name);
  }
});
