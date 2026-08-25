import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { expectBandFillsItsRow, expectBandIsTheHeightOfItsControl, measureSearchBand } from './support/search-band-axis.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { containerCard, containerDetail } from './support/container-cards.js';

// A tiny, already-cached image whose entrypoint is overridden to `sh`: the
// container prints one line on each stream, then keeps ticking so the tail is
// live while the test looks at it.
const LOG_SCRIPT = 'echo hello-from-stdout; echo boom-from-stderr 1>&2; i=0; while true; do i=$((i+1)); echo tick-$i; sleep 1; done';

async function createLoggingContainer(name: string): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sh', 'alpine:3.20', '-c', LOG_SCRIPT]);
}

/** Prints `count` numbered lines at once, then stays alive: a log of a known, stable size. */
async function createBulkLoggingContainer(name: string, count: number): Promise<void> {
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    '--entrypoint',
    'sh',
    'alpine:3.20',
    '-c',
    `for i in $(seq 1 ${count}); do echo bulk-$i; done; sleep 300`,
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

function containerRow(page: Page, name: string) {
  return containerCard(page, name);
}

async function openLogsTab(page: Page, name: string) {
  const row = containerRow(page, name);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByText(name, { exact: true }).click();
  const detail = containerDetail(page);
  await expect(detail).toBeVisible();
  await detail.getByRole('tab', { name: 'Logs' }).click();
  return detail;
}

test.beforeEach(async ({ page }) => {
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
test.describe('Container logs (REQ-30, REQ-31)', () => {
  test.describe.configure({ mode: 'serial' });

  // plan-docker_management_app/REQ-30 — a container's logs can be viewed, with both streams and a live follow
  test('the Logs tab shows the container output from both streams and keeps following it live', async ({ page }) => {
    const name = `vexel-e2e-logs-live-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openLogsTab(page, name);

      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 15_000 });
      await expect(detail.getByText('boom-from-stderr')).toBeVisible();
      // New output appears on its own, with no manual refresh.
      await expect(detail.getByText('tick-3', { exact: true })).toBeVisible({ timeout: 20_000 });
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-30 — the streams shown are selectable
  test('turning stdout off leaves only the stderr output on screen', async ({ page }) => {
    const name = `vexel-e2e-logs-streams-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 15_000 });

      await detail.getByRole('button', { name: 'stdout', exact: true }).click();

      await expect(detail.getByText('boom-from-stderr')).toBeVisible({ timeout: 15_000 });
      await expect(detail.getByText('hello-from-stdout')).toHaveCount(0);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-30 — timestamps can be turned on
  test('turning timestamps on shows the instant of each line', async ({ page }) => {
    const name = `vexel-e2e-logs-timestamps-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 15_000 });
      await expect(detail.locator('.ui-log-stream__timestamp')).toHaveCount(0);

      // The toggle's input is visually hidden behind its track, as a real
      // operator sees it; the label is what gets clicked.
      await detail.getByText('Timestamps', { exact: true }).click();
      await expect(detail.getByRole('checkbox', { name: 'Timestamps' })).toBeChecked();

      const firstTimestamp = detail.locator('.ui-log-stream__timestamp').first();
      await expect(firstTimestamp).toBeVisible({ timeout: 15_000 });
      await expect(firstTimestamp).toHaveText(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-30 — the tail size bounds the log to that many trailing lines
  test('picking a tail size reloads the log bounded to that many trailing lines', async ({ page }) => {
    const name = `vexel-e2e-logs-tail-${Date.now()}`;
    try {
      // 200 lines at once: the search match count is what makes the loaded
      // window observable to the operator.
      await createBulkLoggingContainer(name, 200);
      const detail = await openLogsTab(page, name);
      await detail.getByRole('textbox', { name: 'Search the stream' }).fill('bulk-');
      await expect(detail.getByText(/^1\/200$/)).toBeVisible({ timeout: 20_000 });

      await detail.getByRole('combobox', { name: 'Tail size' }).selectOption('last 100 lines');

      await expect(detail.getByText(/^1\/100$/)).toBeVisible({ timeout: 20_000 });
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-31 — the displayed logs can be text-searched with the matches highlighted
  test('searching the log highlights the matches, counts them and moves between them', async ({ page }) => {
    const name = `vexel-e2e-logs-search-${Date.now()}`;
    try {
      // 20 lines, of which bulk-1, bulk-10 … bulk-19 match "bulk-1": a match
      // count that does not move while the test looks at it.
      await createBulkLoggingContainer(name, 20);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('bulk-20', { exact: true })).toBeVisible({ timeout: 20_000 });

      await detail.getByRole('textbox', { name: 'Search the stream' }).fill('bulk-1');

      await expect(detail.locator('mark').first()).toBeVisible();
      await expect(detail.getByText('1/11')).toBeVisible();

      await detail.getByRole('button', { name: 'Next' }).click();
      await expect(detail.getByText('2/11')).toBeVisible();

      await detail.getByRole('button', { name: 'Previous' }).click();
      await expect(detail.getByText('1/11')).toBeVisible();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app-filesystem_browser_layout/REQ-4, REQ-27, REQ-35 — **the row axis of
  // the shared search band**, measured on the one screen that uses it that way.
  //
  // The band is corrected for a column by the filesystem-browser layout report, and the correction
  // lives in the band itself rather than at either call site. This is the check that goes red if the
  // column is fixed by breaking the row: the band keeps its 240px floor, keeps growing to the end of
  // the row it is in — asserted on the box, so "grow" is measured and not read off a stylesheet —
  // and is the height of the control it holds here exactly as it must become there.
  //
  // Geometry, with a real pointer at the visible control's coordinates (REQ-29, REQ-31).
  test('the search band keeps its row-axis behaviour: at least 240px wide, filling its row, and the height of its control', async ({ page }) => {
    const name = `vexel-e2e-logs-band-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 15_000 });

      // A real pointer on the visible field before it is measured: the band is
      // read in the state an operator leaves it in, never through its markup.
      await detail.getByRole('textbox', { name: 'Search the stream' }).click();
      const geometry = await measureSearchBand(detail.locator('.ui-stream-search'));

      expectBandFillsItsRow('Containers → Logs, the stream search band', geometry);
      expectBandIsTheHeightOfItsControl('Containers → Logs, the stream search band', geometry);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-31 — the visible log can be downloaded
  test('downloading the log saves it as <container name>-logs.txt', async ({ page }) => {
    const name = `vexel-e2e-logs-download-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 15_000 });

      const downloadPromise = page.waitForEvent('download');
      await detail.getByRole('button', { name: 'Download' }).click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toBe(`${name}-logs.txt`);
    } finally {
      await removeContainerQuietly(name);
    }
  });
});
