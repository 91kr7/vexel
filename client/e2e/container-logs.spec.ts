import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { ownershipArgs } from './support/fixtures.js';

const execFileAsync = promisify(execFile);

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
  return page.locator('.ui-data-table__row', { hasText: name });
}

async function openLogsTab(page: Page, name: string) {
  const row = containerRow(page, name);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByText(name, { exact: true }).click();
  const detail = page.locator('.ui-data-table__expanded');
  await expect(detail).toBeVisible();
  await detail.getByRole('tab', { name: 'Logs' }).click();
  return detail;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Containers/ }).click();
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

  // plan-docker_management_app/REQ-31 — the visible log can be copied
  test('copying the log puts the visible lines on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const name = `vexel-e2e-logs-copy-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 15_000 });

      await detail.getByRole('button', { name: 'Copy' }).click();

      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('hello-from-stdout');
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
