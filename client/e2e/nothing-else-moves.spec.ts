/**
 * The sweep that closes the plan's guardrails
 * (plan-docker_management_app-refresh_cache/REQ-20, REQ-22, REQ-23).
 *
 * The plan moved every list onto values the server keeps current. Nothing an
 * operator sees was meant to move with them, and the three requirements above
 * say so from three angles: every screen still shows what it showed and is
 * operated the same way, a detail view is still the daemon's answer at the
 * moment it is opened, and the live streams still start, stream and stop.
 *
 * Two rules of `CLAUDE.md` decide the shape of what is asserted here.
 *
 * - **A real pointer at the visible control's own coordinates.** Every dialog,
 *   panel and tab below is opened by `page.mouse` at the control's settled
 *   centre — never `element.click()`, never a dispatched event.
 * - **Geometry, not content.** A surface dragged out of the viewport keeps every
 *   child and every character it had; what it loses is its coordinates. So each
 *   interaction that opens a dialog or a panel is straddled by a reading of the
 *   surface's **viewport box**, and the content assertions sit beside that one
 *   rather than instead of it.
 *
 * The screens are read with the operator's own daemon behind them and with
 * fixtures of this spec's own on it: no assertion is made on a total, on a row
 * count or on a list being empty.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from './support/test.js';
import { CASE_LABEL, OWNER_LABEL, RUN_ID, navEntry, openApp, ownershipArgs } from './support/fixtures.js';
import { boxOf, centreOf, type Rect } from './support/settled.js';
import { clickAt } from './support/pointer.js';
import { containerDetail, openContainerDetail, closeContainerDetail } from './support/container-cards.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/** One live server-sent stream the page opened, and what became of it. */
interface TrackedStream {
  url: string;
  closed: boolean;
  messages: number;
}

declare global {
  interface Window {
    __sweepStreams?: TrackedStream[];
  }
}

const BASE_IMAGE = 'alpine:3.20';

async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync('docker', [
    'run', '-d', '--name', name, ...ownershipArgs(name), ...extraArgs,
    '--entrypoint', 'sleep', BASE_IMAGE, '300',
  ]);
}

async function createTickingContainer(name: string): Promise<void> {
  await execFileAsync('docker', [
    'run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sh', BASE_IMAGE,
    '-c', 'i=0; while true; do i=$((i+1)); echo sweep-tick-$i; sleep 1; done',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

async function removeVolumeQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
}

async function removeNetworkQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['network', 'rm', name]).catch(() => undefined);
}

/** The streams the page has opened whose url matches, newest last. */
async function streams(page: Page, marker: string): Promise<TrackedStream[]> {
  const all = await page.evaluate(() => window.__sweepStreams ?? []);
  return all.filter((stream) => stream.url.includes(marker));
}

/** Records every server-sent stream the page opens, and whether it is closed again. */
async function trackStreams(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tracked: TrackedStream[] = [];
    window.__sweepStreams = tracked;
    const NativeEventSource = window.EventSource;
    class TrackedEventSource extends NativeEventSource {
      private entry: TrackedStream;

      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        this.entry = { url: String(url), closed: false, messages: 0 };
        tracked.push(this.entry);
        this.addEventListener('message', () => {
          this.entry.messages += 1;
        });
        for (const named of ['line', 'sample']) {
          this.addEventListener(named, () => {
            this.entry.messages += 1;
          });
        }
      }

      close() {
        this.entry.closed = true;
        super.close();
      }
    }
    window.EventSource = TrackedEventSource as unknown as typeof EventSource;
  });
}

/** The application's own content region: what a screen draws below the shell's chrome. */
function contentRegion(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

function expectWithinViewport(page: Page, box: Rect, what: string): void {
  const viewport = page.viewportSize();
  expect(viewport, 'this run has no viewport size to measure against').not.toBeNull();
  const { width, height } = viewport as { width: number; height: number };
  expect(box.width, `${what} is drawn with no width`).toBeGreaterThan(0);
  expect(box.height, `${what} is drawn with no height`).toBeGreaterThan(0);
  expect(box.x, `${what} sits left of the viewport, at x=${box.x}`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${what} sits above the viewport, at y=${box.y}`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${what} runs past the right edge of the ${width}px viewport`).toBeLessThanOrEqual(width + 1);
  expect(box.y, `${what} starts below the bottom of the ${height}px viewport`).toBeLessThan(height);
}

/** The twelve destinations of the rail, and the level-1 heading each screen draws. */
const SCREENS = [
  'Dashboard',
  'Containers',
  'Compose',
  'Images & layers',
  'Volumes & networks',
  'Registries',
  'Builders & cache',
  'Contexts',
  'Plugins',
  'System & prune',
  'Raw console',
  'About',
] as const;

test.describe('nothing else moves', () => {
  test.describe.configure({ mode: 'serial' });

  // REQ-20 — no screen changes what it shows or how it is operated. Every one of the twelve is
  // reached the way an operator reaches it (a real pointer on the rail), draws its own heading and
  // paints a content region inside the viewport; and the three screens fed by the lists this plan
  // moved onto the server show this spec's own fixtures, with nothing operated to make them appear.
  test('every screen is reached from the rail, draws its own content, and shows the objects on the daemon', async ({ page }) => {
    const stamp = Date.now();
    const container = `vexel-e2e-sweep-container-${stamp}`;
    const volume = `vexel-e2e-sweep-volume-${stamp}`;
    const network = `vexel-e2e-sweep-network-${stamp}`;
    try {
      await createSleepingContainer(container);
      await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(volume), volume]);
      await execFileAsync('docker', ['network', 'create', ...ownershipArgs(network), network]);

      // The last of the twelve, so every click of the walk below is a change of screen.
      await openApp(page, 'coverage-matrix');
      await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible({ timeout: 20_000 });

      for (const screen of SCREENS) {
        await clickAt(page, navEntry(page, screen), `the rail entry for ${screen}`);
        await expect(
          page.getByRole('heading', { level: 1, name: screen, exact: true }),
          `the rail entry for ${screen} did not open it`,
        ).toBeVisible({ timeout: 20_000 });

        const box = await boxOf(contentRegion(page), `the content region of ${screen}`);
        expectWithinViewport(page, box, `the content region of ${screen}`);
        expect(
          (await contentRegion(page).textContent())?.trim().length ?? 0,
          `${screen} draws an empty content region`,
        ).toBeGreaterThan(0);

        // The application's own failure report: a screen answered from a value the server holds
        // must not be a screen reporting a failure.
        await expect(page.getByRole('alert').filter({ hasText: /could not|failed|unreachable/i })).toHaveCount(0);

        if (screen === 'Containers') {
          await expect(page.getByText(container, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
        }
        if (screen === 'Volumes & networks') {
          await expect(page.getByText(volume, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
          await expect(page.getByText(network, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
        }
      }
    } finally {
      await removeContainerQuietly(container);
      await removeVolumeQuietly(volume);
      await removeNetworkQuietly(network);
    }
  });

  // REQ-20 — a dialog is opened and operated the way it was: it opens inside the viewport, and the
  // surface keeps its own viewport box while its tabs are operated with a real pointer.
  test("a container's detail opens inside the viewport and keeps its box while its tabs are operated", async ({ page }) => {
    const name = `vexel-e2e-sweep-dialog-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await openApp(page, 'containers');
      await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });

      await openContainerDetail(page, name);
      const detail = containerDetail(page);
      const opened = await boxOf(detail, "the container's detail dialog");
      expectWithinViewport(page, opened, "the container's detail dialog");

      for (const tab of ['Inspect', 'Config']) {
        const control = detail.getByRole('tab', { name: tab, exact: true });
        const before = await boxOf(detail, "the container's detail dialog");
        const centre = centreOf(await boxOf(control, `the ${tab} tab`));
        await page.mouse.click(centre.x, centre.y);
        await expect(control).toHaveAttribute('aria-selected', 'true');

        const after = await boxOf(detail, "the container's detail dialog");
        expect(
          { x: Math.round(after.x), y: Math.round(after.y) },
          `the detail dialog moved when the ${tab} tab was pressed with a real pointer`,
        ).toEqual({ x: Math.round(before.x), y: Math.round(before.y) });
        expectWithinViewport(page, after, `the detail dialog after the ${tab} tab was pressed`);
        expectWithinViewport(page, await boxOf(control, `the ${tab} tab`), `the ${tab} tab after it was pressed`);
      }

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // REQ-22 — detail reads stay direct, with no value held on the server for them: what a detail
  // view shows is what the daemon answers at the moment it is opened, not a value read earlier.
  test("a container's detail shows the daemon's answer at the moment it is opened", async ({ page }) => {
    const name = `vexel-e2e-sweep-direct-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await openApp(page, 'containers');
      await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });

      await openContainerDetail(page, name);
      await expect(containerDetail(page).getByText('running', { exact: false }).first()).toBeVisible({ timeout: 20_000 });
      await closeContainerDetail(page);

      // The daemon is moved on behind the application's back, and the detail is opened again at
      // once: a held value would answer with the state read before this.
      await execFileAsync('docker', ['stop', '-t', '0', name]);

      await openContainerDetail(page, name);
      await expect(
        containerDetail(page).getByText(/exited/i).first(),
        'the detail answered with a state the daemon had left behind',
      ).toBeVisible({ timeout: 20_000 });
      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // REQ-23 — the container log stream keeps its behaviour: it starts when the view is opened,
  // streams while it is open, and stops when it is left.
  test('the container log stream starts, streams and stops', async ({ page }) => {
    const name = `vexel-e2e-sweep-logs-${Date.now()}`;
    try {
      await trackStreams(page);
      await createTickingContainer(name);
      await openApp(page, 'containers');
      await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });

      await openContainerDetail(page, name);
      const detail = containerDetail(page);
      await clickAt(page, detail.getByRole('tab', { name: 'Logs', exact: true }), 'the Logs tab');

      await expect(detail.getByText('sweep-tick-1', { exact: true })).toBeVisible({ timeout: 20_000 });
      // It goes on arriving with nothing operated.
      await expect(detail.getByText('sweep-tick-4', { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(async () => (await streams(page, '/logs/stream')).length, {
          timeout: 20_000,
          message: 'the Logs tab opened no log stream',
        })
        .toBeGreaterThan(0);

      await closeContainerDetail(page);

      await expect
        .poll(async () => (await streams(page, '/logs/stream')).every((stream) => stream.closed), {
          timeout: 15_000,
          message: 'a log stream survived the detail being closed',
        })
        .toBe(true);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // REQ-23 — the container statistics stream keeps its behaviour, on the same three counts.
  test('the container statistics stream starts, streams and stops', async ({ page }) => {
    const name = `vexel-e2e-sweep-stats-${Date.now()}`;
    try {
      await trackStreams(page);
      await createSleepingContainer(name);
      await openApp(page, 'containers');
      await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });

      await openContainerDetail(page, name);
      const detail = containerDetail(page);
      await clickAt(page, detail.getByRole('tab', { name: 'Stats', exact: true }), 'the Stats tab');

      const delivered = async () =>
        (await streams(page, '/stats/stream')).reduce((total, stream) => total + stream.messages, 0);
      await expect
        .poll(delivered, { timeout: 30_000, message: 'no statistics sample ever arrived' })
        .toBeGreaterThan(0);
      const seen = await delivered();
      await expect
        .poll(delivered, { timeout: 30_000, message: 'the statistics stopped arriving with the tab open' })
        .toBeGreaterThan(seen);

      await clickAt(page, detail.getByRole('tab', { name: 'Config', exact: true }), 'the Config tab');

      await expect
        .poll(async () => (await streams(page, '/stats/stream')).every((stream) => stream.closed), {
          timeout: 15_000,
          message: 'a statistics stream survived the Stats tab being left',
        })
        .toBe(true);

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // REQ-23 — the compose log stream keeps its behaviour: it is opened by the panel's own view,
  // streams while that view is shown, and stops when the panel is left.
  test('the compose log stream starts, streams and stops', async ({ page }) => {
    const caseName = `sweep-compose-${Date.now()}`;
    const dir = await mkdtemp(join(tmpdir(), 'vexel-e2e-sweep-compose-'));
    const projectName = `vexel-e2e-${caseName}`;
    const composeFile = join(dir, 'docker-compose.yml');
    try {
      await trackStreams(page);
      await writeFile(
        composeFile,
        [
          'services:',
          '  ticker:',
          `    image: ${BASE_IMAGE}`,
          '    pull_policy: never',
          '    command: ["sh", "-c", "for i in $(seq 1 120); do echo sweep-compose-tick-$i; sleep 0.5; done"]',
          '    labels:',
          `      - "${OWNER_LABEL}=${RUN_ID}"`,
          `      - "${CASE_LABEL}=${caseName}"`,
          '',
        ].join('\n'),
        'utf8',
      );
      await execFileAsync('docker', ['compose', '-f', composeFile, '-p', projectName, 'up', '-d']);

      await openApp(page, 'compose');
      await expect(page.getByRole('heading', { level: 1, name: 'Compose' })).toBeVisible({ timeout: 20_000 });

      const row = page
        .locator('.ui-frame__content .ui-data-table__body')
        .first()
        .locator(':scope > .ui-data-table__row')
        .filter({ hasText: projectName });
      await expect(row, 'the compose project this spec brought up is not listed').toBeVisible({ timeout: 30_000 });

      const panel = page.locator('.ui-detail-panel');
      await clickAt(page, row.locator('.ui-data-table__cell').first(), `the row of ${projectName}`);
      await expect(panel).toBeVisible({ timeout: 20_000 });
      // The panel is a surface opened by an interaction, so it is measured like the dialog above.
      expectWithinViewport(page, await boxOf(panel, "the compose project's detail panel"), "the compose project's detail panel");

      await clickAt(page, panel.getByRole('tab', { name: 'Aggregated logs', exact: true }), 'the Aggregated logs view');

      await expect(panel.locator('.ui-log-stream__source').first()).toBeVisible({ timeout: 30_000 });
      const delivered = async () =>
        (await streams(page, '/logs/stream')).reduce((total, stream) => total + stream.messages, 0);
      await expect
        .poll(delivered, { timeout: 30_000, message: 'no compose log line ever arrived' })
        .toBeGreaterThan(0);
      const seen = await delivered();
      await expect
        .poll(delivered, { timeout: 30_000, message: 'the compose logs stopped arriving with the view open' })
        .toBeGreaterThan(seen);

      // The subscription "begins when a project's panel is opened and ends when it closes"
      // (compose-screen.md), so it is the panel that is closed here — by the row that opened it.
      await clickAt(page, row.locator('.ui-data-table__cell').first(), `the row of ${projectName}`);
      await expect(panel).toHaveCount(0, { timeout: 15_000 });

      await expect
        .poll(async () => (await streams(page, '/logs/stream')).every((stream) => stream.closed), {
          timeout: 15_000,
          message: 'a compose log stream survived the view being left',
        })
        .toBe(true);
    } finally {
      const containers = await execFileAsync('docker', [
        'ps', '-aq', '--filter', `label=com.docker.compose.project=${projectName}`,
      ]).catch(() => ({ stdout: '' }));
      const ids = containers.stdout.split('\n').filter((id) => id.length > 0);
      if (ids.length > 0) await execFileAsync('docker', ['rm', '-fv', ...ids]).catch(() => undefined);
      const networks = await execFileAsync('docker', [
        'network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${projectName}`,
      ]).catch(() => ({ stdout: '' }));
      const networkIds = networks.stdout.split('\n').filter((id) => id.length > 0);
      if (networkIds.length > 0) await execFileAsync('docker', ['network', 'rm', ...networkIds]).catch(() => undefined);
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
