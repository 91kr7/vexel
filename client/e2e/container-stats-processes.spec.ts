import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';

const execFileAsync = promisify(execFile);

interface TrackedStream {
  url: string;
  closed: boolean;
}

declare global {
  interface Window {
    __statsStreams?: TrackedStream[];
  }
}

/** A container that burns CPU in a shell loop, so its readings are non-zero and keep moving. */
async function createBusyContainer(name: string): Promise<void> {
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    '--memory',
    '512m',
    '--entrypoint',
    'sh',
    'postgres:16',
    '-c',
    'i=0; while true; do i=$((i+1)); done',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-f', name]).catch(() => undefined);
}

function containerRow(page: Page, name: string) {
  return page.locator('.ui-data-table__row', { hasText: name });
}

async function openTab(page: Page, name: string, tab: string) {
  const row = containerRow(page, name);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByText(name, { exact: true }).click();
  const detail = page.locator('.ui-data-table__expanded');
  await expect(detail).toBeVisible();
  await detail.getByRole('tab', { name: tab }).click();
  return detail;
}

function statsStreams(page: Page) {
  return page.evaluate(() => window.__statsStreams ?? []);
}

test.beforeEach(async ({ page }) => {
  // Records the stats subscriptions the page opens and closes: leaving the
  // Stats tab must close the one it opened (REQ-32).
  await page.addInitScript(() => {
    const tracked: TrackedStream[] = [];
    window.__statsStreams = tracked;
    const NativeEventSource = window.EventSource;
    class TrackedEventSource extends NativeEventSource {
      private entry: TrackedStream;

      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        this.entry = { url: String(url), closed: false };
        if (this.entry.url.includes('/stats/stream')) tracked.push(this.entry);
      }

      close() {
        this.entry.closed = true;
        super.close();
      }
    }
    window.EventSource = TrackedEventSource as unknown as typeof EventSource;
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Containers/ }).click();
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
      await expect(detail.getByText(/Waiting for the first sample/i)).toHaveCount(0, { timeout: 20_000 });
      // At least one subscription is live while the tab is open. The exact count
      // is not part of the contract: React remounts effects in development, so
      // several may have been constructed and all but one already discarded.
      expect((await statsStreams(page)).length).toBeGreaterThan(0);

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
});
