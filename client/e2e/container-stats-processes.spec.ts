import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { closeContainerDetail, containerDetail, openContainerDetail } from './support/container-cards.js';

interface TrackedStream {
  url: string;
  closed: boolean;
  /** Samples delivered on this stream, so its own cadence can be told from the shared sampler's. */
  samples: number;
}

/** What the shared per-container sampler's gate is holding, counted apart from the panel's stream. */
interface GateLog {
  opened: number;
  closed: number;
}

declare global {
  interface Window {
    __statsStreams?: TrackedStream[];
    __gateSubscriptions?: GateLog;
  }
}

/** A container that burns CPU in a shell loop, so its readings are non-zero and keep moving. */
async function createBusyContainer(name: string): Promise<void> {
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(name),
    '--memory',
    '512m',
    '--entrypoint',
    'sh',
    'alpine:3.20',
    '-c',
    'i=0; while true; do i=$((i+1)); done',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

async function openTab(page: Page, name: string, tab: string) {
  await openContainerDetail(page, name);
  const detail = containerDetail(page);
  await expect(detail).toBeVisible();
  await detail.getByRole('tab', { name: tab }).click();
  return detail;
}

function statsStreams(page: Page) {
  return page.evaluate(() => window.__statsStreams ?? []);
}

/** How many of the shared sampler's subscriptions the page is holding right now. */
async function heldGateSubscriptions(page: Page): Promise<number> {
  const log = await page.evaluate(() => window.__gateSubscriptions ?? { opened: 0, closed: 0 });
  return log.opened - log.closed;
}

test.beforeEach(async ({ page }) => {
  // Records the stats subscriptions the page opens and closes: leaving the
  // Stats tab must close the one it opened (REQ-32).
  await page.addInitScript(() => {
    const tracked: TrackedStream[] = [];
    window.__statsStreams = tracked;
    const gate: GateLog = { opened: 0, closed: 0 };
    window.__gateSubscriptions = gate;
    const NativeEventSource = window.EventSource;
    class TrackedEventSource extends NativeEventSource {
      private entry: TrackedStream;
      private gated = false;

      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        this.entry = { url: String(url), closed: false, samples: 0 };
        if (this.entry.url.includes('/stats/stream')) {
          tracked.push(this.entry);
          this.addEventListener('sample', () => {
            this.entry.samples += 1;
          });
        }
        // The shared sampler's subscription is a different connection with a different lifecycle,
        // and this file exists to keep them apart
        // (plan-docker_management_app-containers_card_view/REQ-56).
        if (this.entry.url.includes('/containers/stats/subscription')) {
          this.gated = true;
          gate.opened += 1;
        }
      }

      close() {
        this.entry.closed = true;
        if (this.gated) {
          this.gated = false;
          gate.closed += 1;
        }
        super.close();
      }
    }
    window.EventSource = TrackedEventSource as unknown as typeof EventSource;
  });
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// These tests keep a container's detail panel open across several UI steps.
// DataTable virtualisation does not reserve extra space for an expanded row
// (ui-library/specs/data-table.md), so another worker's containers appearing
// mid-interaction can push the row out of the mounted window and reset the
// panel; serial mode keeps that window stable.
test.describe('Container stats and processes (REQ-32, REQ-33)', () => {
  test.describe.configure({ mode: 'serial' });

  // plan-docker_management_app/REQ-32 — the live resource usage is shown and keeps updating while the view is open
  test('the Stats tab shows the live CPU, memory, network and block-I/O usage and keeps updating it', async ({ page }) => {
    const name = `vexel-e2e-stats-live-${Date.now()}`;
    try {
      await createBusyContainer(name);
      const detail = await openTab(page, name, 'Stats');

      for (const label of ['CPU', 'Memory', 'Net I/O', 'Block I/O', 'PIDs']) {
        await expect(detail.getByText(label, { exact: true })).toBeVisible({ timeout: 20_000 });
      }
      await expect(detail.getByText(/Waiting for the first sample/i)).toHaveCount(0, { timeout: 20_000 });

      // The sparkline is drawn only from the second sample on: seeing a line
      // means the readings went on updating with no action from the operator.
      await expect
        .poll(async () => detail.locator('svg path').count(), { timeout: 30_000, message: 'expected the readings to keep arriving' })
        .toBeGreaterThan(0);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-32 — leaving the view stops the live stream
  test('leaving the Stats tab closes the live stats subscription', async ({ page }) => {
    const name = `vexel-e2e-stats-leave-${Date.now()}`;
    try {
      await createBusyContainer(name);
      const detail = await openTab(page, name, 'Stats');
      // Setup, not the contract: there has to be a subscription before leaving
      // the tab can be shown to close it. **Waited for, never sampled.** Reading
      // the count once asserts on whichever instant the read lands in — and the
      // instant before the tab's effect has run is a legitimate one, so the
      // assertion fails for a reason that has nothing to do with REQ-32. (An
      // absence check on "Waiting for the first sample" stood here and did not
      // establish this either: text that has not been rendered yet is absent
      // too.) The exact count is deliberately not asserted: how many
      // subscriptions the view constructs on its way to one is not promised
      // anywhere.
      await expect
        .poll(async () => (await statsStreams(page)).length, {
          timeout: 20_000,
          message: 'expected the Stats tab to open a live stats subscription',
        })
        .toBeGreaterThan(0);

      await detail.getByRole('tab', { name: 'Config' }).click();

      // The contract is that no subscription survives leaving the tab.
      const allClosed = async () => {
        const streams = await statsStreams(page);
        return streams.length > 0 && streams.every((stream) => stream.closed);
      };
      await expect
        .poll(allClosed, { timeout: 10_000, message: 'expected every stats subscription to be closed' })
        .toBe(true);
      // Nothing reopens one behind the closed tab.
      await page.waitForTimeout(2000);
      expect(await allClosed()).toBe(true);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-33 — the processes are listed with pid, user and command
  test('the Processes tab lists the processes running inside the container', async ({ page }) => {
    const name = `vexel-e2e-processes-${Date.now()}`;
    try {
      await createBusyContainer(name);
      const detail = await openTab(page, name, 'Processes');

      for (const heading of ['PID', 'User', 'Command']) {
        await expect(detail.getByText(heading, { exact: true })).toBeVisible({ timeout: 20_000 });
      }
      await expect(detail.getByText(/while true/)).toBeVisible({ timeout: 20_000 });
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-33 — the listing is refreshed on demand, and only then
  test('the process listing changes only when Refresh is used', async ({ page }) => {
    const name = `vexel-e2e-processes-refresh-${Date.now()}`;
    const marker = '424242';
    try {
      await createBusyContainer(name);
      const detail = await openTab(page, name, 'Processes');
      await expect(detail.getByText(/while true/)).toBeVisible({ timeout: 20_000 });

      await execFileAsync('docker', ['exec', '-d', name, 'sleep', marker]);
      // The listing is not polled: the new process stays invisible until asked for.
      await page.waitForTimeout(4000);
      await expect(detail.getByText(new RegExp(`sleep ${marker}`))).toHaveCount(0);

      await detail.getByRole('button', { name: 'Refresh' }).click();

      await expect(detail.getByText(new RegExp(`sleep ${marker}`))).toBeVisible({ timeout: 20_000 });
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app-containers_card_view/REQ-56 — the panel's own per-container stream is
  // untouched by the sampling gate: a different address, a rate of its own well inside the shared
  // sampler's ten seconds, and a lifecycle that is the panel's rather than the gate's. "We did not
  // touch it" is not an observation anyone can make in six months.
  test('the panel keeps its own per-container stream: its own address, its own rate and its own lifecycle', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const name = `vexel-e2e-stats-untouched-${Date.now()}`;
    try {
      await createBusyContainer(name);
      await openTab(page, name, 'Stats');

      await expect
        .poll(async () => (await statsStreams(page)).length, {
          timeout: 20_000,
          message: 'expected the Stats tab to open a per-container stream of its own',
        })
        .toBeGreaterThan(0);

      const opened = await statsStreams(page);
      for (const stream of opened) {
        expect(stream.url, 'the panel is reading the shared sampler instead of its own stream').toContain('/stats/stream');
        expect(stream.url).not.toContain('/containers/stats/subscription');
      }

      // The containers screen behind the panel is a consumer of the shared figures, and stays one:
      // the two connections coexist rather than replacing one another.
      expect(await heldGateSubscriptions(page), 'the screen behind the panel holds its own subscription').toBe(1);

      const samplesBefore = (await statsStreams(page)).reduce((total, stream) => total + stream.samples, 0);
      // One shared-sampler interval. The panel's stream carries the daemon's own cadence, so several
      // readings land inside it; a stream that had been folded into the sampler would deliver one.
      await page.waitForTimeout(10_000);
      const samplesAfter = (await statsStreams(page)).reduce((total, stream) => total + stream.samples, 0);

      expect(
        samplesAfter - samplesBefore,
        'the panel stream delivered no more readings than the shared ten-second sampler would',
      ).toBeGreaterThan(2);

      // Its lifecycle is the dialog's: dismissing the dialog ends it, and leaves the screen's own
      // subscription standing. Dismissed by the dialog's own close control now — `Escape` closes
      // nothing (detail_modal/REQ-11, REQ-23).
      await closeContainerDetail(page);

      await expect
        .poll(
          async () => {
            const streams = await statsStreams(page);
            return streams.length > 0 && streams.every((stream) => stream.closed);
          },
          { timeout: 10_000, message: 'expected the panel closing to end its own stream' },
        )
        .toBe(true);
      expect(await heldGateSubscriptions(page), 'closing the panel took the screen\'s subscription with it').toBe(1);
    } finally {
      await removeContainerQuietly(name);
    }
  });
});
