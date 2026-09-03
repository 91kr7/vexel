import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { closeContainerDetail, containerDetail, openContainerDetail } from './support/container-cards.js';
import { expectRegionAnswersToViewportHeight } from './support/pinned-region.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

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

/**
 * A container running many processes at once, so the process table has more rows
 * than any window of it can show: `count` background sleeps under one shell.
 * Nothing is fetched — the image is the one the run's own registry holds.
 */
async function createCrowdedContainer(name: string, count: number): Promise<void> {
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    ...ownershipArgs(name),
    '--entrypoint',
    'sh',
    'alpine:3.20',
    '-c',
    `i=0; while [ $i -lt ${count} ]; do sleep 100000 & i=$((i+1)); done; wait`,
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
  //
  // Two recorders, because the two connections are two transports: the panel's stream is server-sent
  // events and the gate is a WebSocket (…-stats_gate_websocket/REQ-1).
  await page.addInitScript(() => {
    const tracked: TrackedStream[] = [];
    window.__statsStreams = tracked;
    const gate: GateLog = { opened: 0, closed: 0 };
    window.__gateSubscriptions = gate;
    const NativeEventSource = window.EventSource;
    class TrackedEventSource extends NativeEventSource {
      private entry: TrackedStream;

      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        this.entry = { url: String(url), closed: false, samples: 0 };
        if (this.entry.url.includes('/stats/stream')) {
          tracked.push(this.entry);
          this.addEventListener('sample', () => {
            this.entry.samples += 1;
          });
        }
      }

      close() {
        this.entry.closed = true;
        super.close();
      }
    }
    window.EventSource = TrackedEventSource as unknown as typeof EventSource;

    const NativeWebSocket = window.WebSocket;
    class GateWebSocket extends NativeWebSocket {
      private gated = false;
      private ended = false;

      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (String(url).includes('/containers/stats/subscription')) {
          this.gated = true;
          gate.opened += 1;
          this.addEventListener('close', () => this.recordEnd());
        }
      }

      close(code?: number, reason?: string) {
        this.recordEnd();
        super.close(code, reason);
      }

      private recordEnd() {
        if (!this.gated || this.ended) return;
        this.ended = true;
        gate.closed += 1;
      }
    }
    window.WebSocket = GateWebSocket as unknown as typeof WebSocket;
  });
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// These tests keep a container's detail panel open across several UI steps.
// DataTable virtualisation does not reserve extra space for an expanded row
// (ui-library/specs/data-table.md), so serial mode keeps the mounted window
// stable across them.
test.describe('Container stats and processes (REQ-32, REQ-33)', () => {
  test.describe.configure({ mode: 'serial' });

  // plan-docker_management_app/REQ-32 — the live resource usage is shown and keeps updating while
  // the view is open. Re-asserted unchanged under
  // plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-41:
  // the recomposition of the Stats tab into two groups moves no sampling cadence and no liveness
  // gate. The stream still starts when Stats becomes the active tab, and the readings still arrive
  // with no action from the operator.
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

      // And the samples keep arriving on the tab's own cadence, with nothing operated: the gate
      // that opens the stream when Stats becomes active is where it was (REQ-41).
      const delivered = async () => (await statsStreams(page)).reduce((total, stream) => total + stream.samples, 0);
      const before = await delivered();
      await expect
        .poll(delivered, { timeout: 30_000, message: 'expected the sampling to go on with no action from the operator' })
        .toBeGreaterThan(before);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-32 — leaving the view stops the live stream. Re-asserted
  // unchanged under
  // plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-41:
  // the liveness gate is where it was, so the stream still ends the moment Stats stops being the
  // active tab.
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

  // plan-docker_management_app/REQ-33 — the listing is refreshed on demand, and that control still
  // works exactly as it did now that the tab also follows the container on its own
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-34). What the clock
  // does on its own is checked in `container-detail-clock.spec.ts`; here the subject is the control.
  test('the Refresh control re-reads the listing on demand', async ({ page }) => {
    const name = `vexel-e2e-processes-refresh-${Date.now()}`;
    const marker = '424242';
    try {
      await createBusyContainer(name);
      const detail = await openTab(page, name, 'Processes');
      await expect(detail.getByText(/while true/)).toBeVisible({ timeout: 20_000 });

      await execFileAsync('docker', ['exec', '-d', name, 'sleep', marker]);
      await detail.getByRole('button', { name: 'Refresh' }).click();

      await expect(detail.getByText(new RegExp(`sleep ${marker}`))).toBeVisible({ timeout: 20_000 });
    } finally {
      await removeContainerQuietly(name);
    }
  });

  /*
    tabs_composition_refactor/REQ-32 — "the process table takes the height its tab offers instead of
    the fixed 320px inherited from the inline panel: with the dialog at its stable height, the rows
    occupy what is left under the tab's own header row, and no band of empty surface stands beneath
    the table".

    Two halves, and the second is the one a "the table got taller" check would miss: the table's
    bottom edge is the region's bottom edge, so nothing is left standing under it. Both are viewport
    boxes (CLAUDE.md, "What a check drives, and what it measures"), and the third assertion is that
    what the table gained is a **window**, not a longer page: the rows still scroll and virtualise
    inside the one box that also holds the sticky header.
  */
  test('the process table takes the height its tab offers and leaves no band of surface beneath it', async ({ page }) => {
    test.setTimeout(120_000);
    const name = `vexel-e2e-processes-fill-${Date.now()}`;
    try {
      await createCrowdedContainer(name, 40);
      const detail = await openTab(page, name, 'Processes');
      // The count band, which is what says the listing arrived — and how many rows the table holds.
      const counted = await detail
        .getByText(/\d+ processes/)
        .first()
        .textContent({ timeout: 30_000 });
      const rowCount = Number.parseInt(/(\d+) processes/.exec(counted ?? '')?.[1] ?? '0', 10);
      expect(rowCount, `the fixture listed ${counted}, which is too few rows to overflow any window`).toBeGreaterThan(20);

      const table = detail.locator('.ui-data-table');
      // The region the active tab is drawn in: the one that absorbs the height the dialog's bands
      // leave. The view draws a second one inside it for its own count band, hence `.first()`.
      const region = detail.locator('.ui-band-stack__fill').first();
      expect(await region.locator('.ui-data-table').count(), 'the table is not drawn inside the tab’s region').toBe(1);

      // First half: the height is the tab's, not the table's own.
      await expectRegionAnswersToViewportHeight(page, table, 'the process table');

      // Second half, at both heights: the table ends where the region ends.
      const original = page.viewportSize()!;
      try {
        for (const height of [720, 1000]) {
          await page.setViewportSize({ width: original.width, height });
          await expect(table).toBeVisible();
          const boxes = await page.evaluate(() => {
            const region = document.querySelector('.ui-modal--size-large .ui-band-stack__fill');
            const table = document.querySelector('.ui-modal--size-large .ui-data-table');
            const rect = (element: Element | null) => (element === null ? null : element.getBoundingClientRect());
            return { region: rect(region), table: rect(table) };
          });
          const label = `${original.width}×${height}`;
          expect(boxes.region, `${label} — the tab draws no region`).not.toBeNull();
          expect(boxes.table, `${label} — the tab draws no table`).not.toBeNull();
          console.log(
            `[REQ-32] ${label}: the table ends at ${boxes.table!.bottom.toFixed(1)}px in a region ending at ${boxes.region!.bottom.toFixed(
              1,
            )}px`,
          );
          expect(
            Math.abs(boxes.table!.bottom - boxes.region!.bottom),
            `${label} — the table stops ${(boxes.region!.bottom - boxes.table!.bottom).toFixed(
              1,
            )}px short of the region it is placed in, leaving a band of surface beneath it`,
          ).toBeLessThanOrEqual(2);
        }
      } finally {
        await page.setViewportSize(original);
      }

      // What it took is a window: the rows scroll and virtualise inside the one box that also holds
      // the sticky header (`ui-library/specs/data-table.md`), rather than in a third of it.
      const box = await page.evaluate(() => {
        const table = document.querySelector('.ui-modal--size-large .ui-data-table');
        const boxes = table === null ? [] : [...table.querySelectorAll('.ui-scroll-area')];
        const scroller = boxes[0] ?? null;
        const header = table === null ? null : table.querySelector('.ui-data-table__header');
        return {
          scrollingBoxes: boxes.length,
          clientHeight: scroller === null ? 0 : scroller.clientHeight,
          scrollHeight: scroller === null ? 0 : scroller.scrollHeight,
          headerInside: scroller !== null && header !== null && scroller.contains(header),
          headerPosition: header === null ? null : getComputedStyle(header).position,
          mountedRows: table === null ? 0 : table.querySelectorAll('.ui-data-table__row').length,
        };
      });
      console.log(
        `[REQ-32] the table scrolls ${box.scrollHeight}px of rows through a ${box.clientHeight}px window, ${box.mountedRows} of ${rowCount} rows mounted`,
      );
      expect(box.scrollingBoxes, 'the table holds more than one scrolling box').toBe(1);
      expect(box.scrollHeight, 'the table has nothing to scroll, so this fixture proves nothing').toBeGreaterThan(box.clientHeight + 1);
      expect(box.mountedRows, 'every row is mounted, so the list stopped virtualising').toBeLessThan(rowCount);
      expect(box.headerInside, 'the column header left the box that scrolls').toBe(true);
      expect(box.headerPosition, 'the column header is no longer sticky at the top of that box').toBe('sticky');

      // And it scrolls under a real wheel, at the table's own coordinates.
      const centre = await table.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.wheel(0, 400);
      await expect
        .poll(
          async () =>
            await page.evaluate(() => document.querySelector('.ui-modal--size-large .ui-data-table .ui-scroll-area')?.scrollTop ?? 0),
          { timeout: 5000, message: 'a wheel over the process table scrolled nothing inside it' },
        )
        .toBeGreaterThan(0);

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  /*
    tabs_composition_refactor/REQ-33 — the `%CPU` column is the one that is toned, and "the `–` shown
    where the daemon reports no reading is unchanged … there is no reading to distinguish".

    The daemon's own `top` is asked for no `ps` arguments (REQ-41 admits no new capability), so a
    real listing carries no `%CPU` title and every reading is absent. That is exactly the state this
    check exists for: the column that gained a tone must draw its absences as every other column
    draws them. The threshold itself is driven by a stubbed payload, in
    `test/unit/container-processes-view.test.tsx`, since no real daemon produces a reading to cross
    it.
  */
  test('the %CPU column draws a reading the daemon does not report exactly as every other missing value', async ({ page }) => {
    const name = `vexel-e2e-processes-untoned-${Date.now()}`;
    try {
      await createBusyContainer(name);
      const detail = await openTab(page, name, 'Processes');
      await expect(detail.getByText(/while true/)).toBeVisible({ timeout: 20_000 });

      const cells = await detail.evaluate((dialog) => {
        const headers = [...dialog.querySelectorAll('.ui-data-table__header .ui-data-table__header-cell')].map(
          (cell) => cell.textContent?.trim() ?? '',
        );
        const cpu = headers.indexOf('%CPU');
        const memory = headers.indexOf('%MEM');
        const rows = [...dialog.querySelectorAll('.ui-data-table__body .ui-data-table__row')].map((row) => {
          const drawn = [...row.querySelectorAll('.ui-data-table__cell')].map((cell) => {
            const value = cell.querySelector('span') ?? cell;
            const style = getComputedStyle(value);
            return { text: value.textContent?.trim() ?? '', treatment: `${style.color} ${style.fontFamily} ${style.fontSize} ${style.textAlign}` };
          });
          return { cpu: drawn[cpu], memory: drawn[memory] };
        });
        return { headers, cpu, memory, rows };
      });

      expect(cells.cpu, `the table draws no %CPU column: ${cells.headers.join(', ')}`).toBeGreaterThanOrEqual(0);
      expect(cells.rows.length, 'the table drew no rows at all').toBeGreaterThan(0);
      let dashes = 0;
      for (const row of cells.rows) {
        if (row.cpu?.text !== '–') continue;
        dashes += 1;
        expect(
          row.cpu.treatment,
          `a %CPU cell reporting no reading is drawn "${row.cpu.treatment}" against "${row.memory?.treatment}" for the %MEM cell beside it`,
        ).toBe(row.memory?.treatment);
      }
      console.log(`[REQ-33] ${dashes} of ${cells.rows.length} %CPU cells report no reading, each drawn as the %MEM cell beside it`);

      await closeContainerDetail(page);
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

      // Asserted on the id the daemon gave this fixture, so the check can fail: the recorder's own
      // filter says nothing about which container is being read.
      const containerId = (await execFileAsync('docker', ['inspect', '-f', '{{.Id}}', name])).stdout.trim();
      const shortId = containerId.slice(0, 12);
      const opened = await statsStreams(page);
      expect(
        opened.map((stream) => stream.url),
        'the panel opened no stream at this container own address',
      ).toContain(`/api/containers/${containerId}/stats/stream`);
      for (const stream of opened) {
        expect(stream.url, 'the panel is reading a container that is not the one on screen').toContain(shortId);
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
