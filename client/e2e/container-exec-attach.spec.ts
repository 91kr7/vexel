import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';

const execFileAsync = promisify(execFile);

/** An idle container: its main process sleeps, so exec sessions run independently of it. */
async function createIdleContainer(name: string): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, '--entrypoint', 'sh', 'postgres:16', '-c', 'sleep 300']);
}

/** A container whose own main process (no exec involved) keeps printing to stdout, for attach. */
async function createTickingContainer(name: string): Promise<void> {
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    '--entrypoint',
    'sh',
    'postgres:16',
    '-c',
    'i=0; while true; do i=$((i+1)); echo tick-$i; sleep 1; done',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-f', name]).catch(() => undefined);
}

async function isRunning(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync('docker', ['inspect', '--format', '{{.State.Running}}', name]).catch(() => ({ stdout: 'false' }));
  return stdout.trim() === 'true';
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

/** Reads the terminal's rendered content back (xterm's DOM renderer draws each row as real text, not canvas pixels). */
async function terminalText(detail: ReturnType<typeof containerRow>): Promise<string> {
  return (await detail.locator('.xterm-rows').textContent()) ?? '';
}

async function typeIntoTerminal(detail: ReturnType<typeof containerRow>, page: Page, text: string) {
  // xterm keeps refitting its host as the terminal's own layout settles, which
  // can make Playwright's stability check spin forever; a forced click still
  // reaches and focuses the host's hidden input.
  await detail.locator('.ui-terminal-host').click({ force: true });
  await page.keyboard.type(text);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Containers/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// See client/e2e/container-logs.spec.ts for why detail-panel tests run serial:
// DataTable virtualisation can otherwise drop the expanded row out of view.
// Exec and attach are split into separate serial groups so a failure in one
// (e.g. an exec session that never connects) does not skip the other's
// independent tests.
test.describe('Container exec sessions (REQ-34, REQ-36)', () => {
  test.describe.configure({ mode: 'serial' });

  // plan-docker_management_app/REQ-34 — keystrokes reach the process and its output is rendered
  test('an exec session runs the chosen shell, and keystrokes reach the process with its output rendered', async ({ page }) => {
    const name = `vexel-e2e-exec-basic-${Date.now()}`;
    try {
      await createIdleContainer(name);
      const detail = await openTab(page, name, 'Exec');

      await detail.getByRole('button', { name: 'Launch session' }).click();
      await expect(detail.getByText('Connected')).toBeVisible({ timeout: 15_000 });

      await typeIntoTerminal(detail, page, 'echo hello-from-exec-e2e\n');

      await expect
        .poll(async () => terminalText(detail), { timeout: 15_000, message: 'expected the echoed line to be rendered in the terminal' })
        .toContain('hello-from-exec-e2e');
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-34 — the session runs the chosen command, as the chosen user, in the chosen working directory
  test('an exec session runs the chosen custom command as the chosen user and working directory', async ({ page }) => {
    const name = `vexel-e2e-exec-options-${Date.now()}`;
    try {
      await createIdleContainer(name);
      const detail = await openTab(page, name, 'Exec');

      await detail.getByRole('combobox', { name: 'Shell' }).selectOption('custom');
      await detail.getByRole('textbox', { name: 'Custom command' }).fill('whoami && pwd');
      await detail.getByRole('textbox', { name: 'User' }).fill('nobody');
      await detail.getByRole('textbox', { name: 'Working directory' }).fill('/tmp');
      await detail.getByRole('button', { name: 'Launch session' }).click();

      await expect
        .poll(async () => terminalText(detail), { timeout: 15_000, message: 'expected whoami/pwd output for the chosen user and working directory' })
        .toMatch(/nobody[\s\S]*\/tmp/);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-36 — leaving the Exec tab closes the session, and the operator returns to the launch form
  test('leaving the Exec tab closes the session and returns the tab to its pre-session state', async ({ page }) => {
    const name = `vexel-e2e-exec-leave-${Date.now()}`;
    try {
      await createIdleContainer(name);
      const detail = await openTab(page, name, 'Exec');
      await detail.getByRole('button', { name: 'Launch session' }).click();
      await expect(detail.getByText(/Connecting|Connected/)).toBeVisible({ timeout: 15_000 });

      await detail.getByRole('tab', { name: 'Config' }).click();
      await detail.getByRole('tab', { name: 'Exec' }).click();

      await expect(detail.getByRole('button', { name: 'Launch session' })).toBeVisible();
    } finally {
      await removeContainerQuietly(name);
    }
  });
});

test.describe('Container attach sessions (REQ-35, REQ-36)', () => {
  test.describe.configure({ mode: 'serial' });

  // plan-docker_management_app/REQ-35 — attach relays the running container's own stdio
  test('an attach session relays the running container\'s own output', async ({ page }) => {
    const name = `vexel-e2e-attach-basic-${Date.now()}`;
    try {
      await createTickingContainer(name);
      const detail = await openTab(page, name, 'Attach');

      await detail.getByRole('button', { name: 'Attach' }).click();
      await expect(detail.getByText('Connected')).toBeVisible({ timeout: 15_000 });

      await expect
        .poll(async () => terminalText(detail), { timeout: 15_000, message: "expected the container's own output over the attach session" })
        .toMatch(/tick-\d+/);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-35, REQ-36 — detaching stops neither the session's relay nor the container itself
  test('detaching from an attach session leaves the container running', async ({ page }) => {
    const name = `vexel-e2e-attach-detach-${Date.now()}`;
    try {
      await createTickingContainer(name);
      const detail = await openTab(page, name, 'Attach');
      await detail.getByRole('button', { name: 'Attach' }).click();
      await expect(detail.getByText('Connected')).toBeVisible({ timeout: 15_000 });

      // The live terminal keeps refitting itself (cursor blink, layout settling),
      // which can make Playwright's element-stability check spin forever on
      // anything overlapping it; forced clicks still reach these controls.
      await detail.getByRole('button', { name: 'Detach' }).click({ force: true });

      const endedOverlay = detail.locator('.ui-session-ended-overlay');
      await expect(endedOverlay).toBeVisible({ timeout: 10_000 });
      await endedOverlay.getByRole('button', { name: 'Close' }).click({ force: true });

      await expect(detail.getByRole('button', { name: 'Attach' })).toBeVisible();
      expect(await isRunning(name)).toBe(true);
    } finally {
      await removeContainerQuietly(name);
    }
  });
});

/** Reads the live terminal host's height and the containers table's scroll metrics. */
async function sessionLayout(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector('.ui-terminal-host') as HTMLElement | null;
    const scroll = document.querySelector('.ui-data-table .ui-scroll-area') as HTMLElement | null;
    return {
      terminalHeight: host ? Math.round(host.getBoundingClientRect().height) : 0,
      tableScrollHeight: scroll?.scrollHeight ?? 0,
      tableViewportHeight: scroll?.clientHeight ?? 0,
      windowHeight: window.innerHeight,
    };
  });
}

/** Counts the resize control frames the client sends over the session socket. */
async function installResizeFrameCounter(page: Page) {
  await page.addInitScript(() => {
    const recorded: string[] = [];
    (window as unknown as { __resizeFrames: string[] }).__resizeFrames = recorded;
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function patchedSend(this: WebSocket, data: unknown) {
      if (typeof data === 'string' && data.includes('"resize"')) recorded.push(data);
      return originalSend.call(this, data as string);
    };
  });
}

async function takeResizeFrames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const frames = (window as unknown as { __resizeFrames: string[] }).__resizeFrames;
    return frames.splice(0, frames.length);
  });
}

// A live session's terminal must settle at the size its surface offers. When it
// does not, every recomputed size is pushed to the daemon as a real resize
// request, and (for attach) each one comes back as a `container resize` daemon
// event that re-reads the container list — the "avalanche" an operator sees.
test.describe('Session terminal sizing (REQ-34, REQ-35)', () => {
  test.describe.configure({ mode: 'serial' });

  // ui-library/terminal.md — the host region is sized to fill its container; plan-docker_management_app/REQ-34 — the session follows the *available* terminal size
  test('the terminal settles at the size its surface offers instead of growing without bound', async ({ page }) => {
    const name = `vexel-e2e-term-size-${Date.now()}`;
    try {
      await createIdleContainer(name);
      const detail = await openTab(page, name, 'Exec');
      await detail.getByRole('button', { name: 'Launch session' }).click();
      await expect(detail.getByText('Connected')).toBeVisible({ timeout: 15_000 });

      await page.waitForTimeout(1_500);
      const first = await sessionLayout(page);
      await page.waitForTimeout(2_000);
      const second = await sessionLayout(page);

      expect(second.terminalHeight, 'the terminal must not keep growing while nothing resizes it').toBe(first.terminalHeight);
      expect(second.terminalHeight, 'a terminal taller than the browser window is not the available terminal size').toBeLessThanOrEqual(
        second.windowHeight,
      );
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-34 — the session follows the terminal size, so a settled layout stops resizing it
  test('an exec session stops sending resize requests once its terminal has settled', async ({ page }) => {
    const name = `vexel-e2e-term-resize-exec-${Date.now()}`;
    try {
      await installResizeFrameCounter(page);
      await page.goto('/');
      await page.getByRole('button', { name: /Containers/ }).click();
      await createIdleContainer(name);
      const detail = await openTab(page, name, 'Exec');
      await detail.getByRole('button', { name: 'Launch session' }).click();
      await expect(detail.getByText('Connected')).toBeVisible({ timeout: 15_000 });

      await page.waitForTimeout(2_000); // lets the initial fit settle
      await takeResizeFrames(page);
      await page.waitForTimeout(3_000);

      const frames = await takeResizeFrames(page);
      expect(frames.length, `expected a settled terminal to stop resizing, got ${frames.length} resize requests in 3s`).toBeLessThanOrEqual(2);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-35 — attaching relays the container's stdio; it must not drive the daemon with resize traffic
  test('an attach session stops sending resize requests once its terminal has settled', async ({ page }) => {
    const name = `vexel-e2e-term-resize-attach-${Date.now()}`;
    try {
      await installResizeFrameCounter(page);
      await page.goto('/');
      await page.getByRole('button', { name: /Containers/ }).click();
      await createTickingContainer(name);
      const detail = await openTab(page, name, 'Attach');
      await detail.getByRole('button', { name: 'Attach' }).click();
      await expect(detail.getByText('Connected')).toBeVisible({ timeout: 15_000 });

      await page.waitForTimeout(2_000);
      await takeResizeFrames(page);
      await page.waitForTimeout(3_000);

      const frames = await takeResizeFrames(page);
      expect(frames.length, `expected a settled terminal to stop resizing, got ${frames.length} resize requests in 3s`).toBeLessThanOrEqual(2);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-19 — the list re-reads on daemon events; an open attach session must not turn that into a refetch storm
  test('an open attach session does not flood the container list with refetches', async ({ page }) => {
    const name = `vexel-e2e-attach-calls-${Date.now()}`;
    const listReads: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/containers') listReads.push(request.url());
    });
    try {
      await createTickingContainer(name);
      const detail = await openTab(page, name, 'Attach');
      await detail.getByRole('button', { name: 'Attach' }).click();
      await expect(detail.getByText('Connected')).toBeVisible({ timeout: 15_000 });

      listReads.length = 0;
      await page.waitForTimeout(6_000);

      // The list polls every 3s (use-containers.md) plus the odd real event:
      // a handful of reads over 6s, never hundreds.
      expect(listReads.length, `expected a handful of container-list reads over 6s, got ${listReads.length}`).toBeLessThanOrEqual(10);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // ui-library/data-table.md — the table body is capped at `maxHeight` and scrolls; its scrollable
  // content must stay stable, otherwise the scrollbar thumb shrinks away as the content runs off
  test('the containers table keeps a stable scroll extent while a session is open', async ({ page }) => {
    const name = `vexel-e2e-table-scroll-${Date.now()}`;
    try {
      await createIdleContainer(name);
      const detail = await openTab(page, name, 'Exec');
      await detail.getByRole('button', { name: 'Launch session' }).click();
      await expect(detail.getByText('Connected')).toBeVisible({ timeout: 15_000 });

      await page.waitForTimeout(1_500);
      const first = await sessionLayout(page);
      await page.waitForTimeout(2_000);
      const second = await sessionLayout(page);

      expect(second.tableViewportHeight, 'the table body stays capped at its maxHeight').toBe(first.tableViewportHeight);
      expect(second.tableScrollHeight, 'the table\'s scrollable content must not keep growing on its own').toBe(first.tableScrollHeight);
    } finally {
      await removeContainerQuietly(name);
    }
  });
});
