import { expect, test, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { containerCard, containerDetail, openContainerDetail } from './support/container-cards.js';

/** An idle container: its main process sleeps, so exec sessions run independently of it. */
async function createIdleContainer(name: string): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sh', 'alpine:3.20', '-c', 'sleep 300']);
}

/** A container whose own main process (no exec involved) keeps printing to stdout, for attach. */
async function createTickingContainer(name: string): Promise<void> {
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
    'i=0; while true; do i=$((i+1)); echo tick-$i; sleep 1; done',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

async function isRunning(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync('docker', ['inspect', '--format', '{{.State.Running}}', name]).catch(() => ({ stdout: 'false' }));
  return stdout.trim() === 'true';
}

function containerRow(page: Page, name: string) {
  return containerCard(page, name);
}

async function openTab(page: Page, name: string, tab: string) {
  await openContainerDetail(page, name);
  const detail = containerDetail(page);
  await expect(detail).toBeVisible();
  await detail.getByRole('tab', { name: tab }).click();
  return detail;
}

/**
 * Reads the terminal's rendered content back (xterm's DOM renderer draws each row as real text, not
 * canvas pixels) — **after bringing the terminal into view**, which is part of the reading and not
 * tidiness.
 *
 * xterm suspends painting while its host does not intersect the viewport. Measured on this suite:
 * with the attach session live and its frames arriving once a second (`tick-2` … `tick-13` all
 * landing on the socket, the host stable at 944×420 and never remounted), `.xterm-rows` held the
 * empty string for twelve seconds — because the host's box was `top=704` in a 720px-tall viewport.
 * Scrolling it into view made every line appear at once, none of them lost. So an assertion on
 * painted text that has not brought the surface into view is asserting on the fold, not on the
 * product. The card view (`plan-docker_management_app-containers_card_view`) is what pushed the
 * panel that far down; before it, the same assertion happened to sit above the fold.
 */
async function terminalText(detail: ReturnType<typeof containerRow>): Promise<string> {
  await detail
    .locator('.ui-terminal-host')
    .scrollIntoViewIfNeeded({ timeout: 5_000 })
    .catch(() => undefined);
  return (await detail.locator('.xterm-rows').textContent()) ?? '';
}

async function typeIntoTerminal(detail: ReturnType<typeof containerRow>, page: Page, text: string) {
  // xterm keeps refitting its host as the terminal's own layout settles, which
  // can make Playwright's stability check spin forever; a forced click still
  // reaches and focuses the host's hidden input. It also scrolls the host into
  // view, which is how these sessions used to get painted at all — an accident
  // the sessions that never type could not rely on, and no longer have to:
  // `terminalText` brings the terminal into view itself.
  await detail.locator('.ui-terminal-host').click({ force: true });
  // "Connected" only says the session opened; the shell inside the container
  // still has to start and draw its prompt, and anything typed before that is
  // swallowed — leaving a mangled command line rather than a clean failure.
  await expect
    .poll(async () => terminalText(detail), { timeout: 15_000, message: 'expected the shell prompt to be drawn before typing' })
    .toMatch(/[$#]\s*$/);
  // The prompt being drawn is still not safe: busybox ash follows it with an
  // ESC[6n cursor-position query, and xterm's automatic ESC[…R reply travels
  // the same stdin as our keystrokes. If the shell's first read lands after
  // both, it takes them as one batch into its 16-byte keycode buffer, matches
  // nothing, and discards the lot — the reply plus the first ~10 characters
  // typed. So the command is typed without its newline, its echo is polled for
  // (which is itself the proof the keystrokes reached the process), and only
  // then is Enter pressed; a swallowed head is cleared with Ctrl+U (busybox
  // lineedit: kill the line) and retyped, safely, since the poisoned reply
  // bytes cannot survive the first attempt.
  const command = text.replace(/\n$/, '');
  for (let attempt = 0; ; attempt++) {
    await page.keyboard.type(command);
    try {
      await expect
        .poll(async () => terminalText(detail), { timeout: 3_000, message: 'expected every typed keystroke to be echoed before submitting' })
        .toContain(command);
      break;
    } catch (error) {
      if (attempt >= 2) throw error;
      await page.keyboard.press('Control+U');
    }
  }
  await page.keyboard.press('Enter');
}

/**
 * Records the terminal-input frames the client sends over the session socket.
 *
 * Session I/O travels as binary frames (the JSON text frames carry resizes and
 * the server's notices), so the bytes themselves are what says a keystroke
 * reached the session rather than being swallowed on the way.
 */
async function installInputFrameRecorder(page: Page) {
  await page.addInitScript(() => {
    const recorded: number[][] = [];
    (window as unknown as { __inputFrames: number[][] }).__inputFrames = recorded;
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function patchedSend(this: WebSocket, data: unknown) {
      if (data instanceof Uint8Array) recorded.push(Array.from(data));
      else if (data instanceof ArrayBuffer) recorded.push(Array.from(new Uint8Array(data)));
      return originalSend.call(this, data as string);
    };
  });
}

async function takeInputFrames(page: Page): Promise<number[][]> {
  return page.evaluate(() => {
    const frames = (window as unknown as { __inputFrames: number[][] }).__inputFrames;
    return frames.splice(0, frames.length);
  });
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'containers');
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

      // The requirement is that the *chosen* shell runs, so the choice is made
      // explicitly: the fixture image ships `/bin/sh` and no bash, which is the
      // ordinary case for a small image.
      await detail.getByRole('combobox', { name: 'Shell' }).selectOption('/bin/sh');
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

  // detail_modal/REQ-12 (restating plan-docker_management_app-container_detail_close/REQ-8 on the dialog) — an Escape
  // typed into a live session inside the dialog reaches the session, and dismisses nothing anywhere. Both halves are
  // asserted: the dialog is still open *and* the keystroke was observed on the session's own channel — a session that
  // quietly stops receiving one key still looks like a working session.
  test('Escape typed in a live exec session reaches the session and leaves the dialog open', async ({ page }) => {
    const name = `vexel-e2e-exec-escape-${Date.now()}`;
    try {
      await installInputFrameRecorder(page);
      // The recorder is installed first, so the load it applies to is this one;
      // the screen is pinned rather than reached through a rail click the
      // Dashboard's cross-navigation tiles make ambiguous (REQ-115).
      await openApp(page, 'containers');
      await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
      await createIdleContainer(name);
      const detail = await openTab(page, name, 'Exec');
      // The fixture image ships `/bin/sh` and no bash, as small images do.
      await detail.getByRole('combobox', { name: 'Shell' }).selectOption('/bin/sh');
      await detail.getByRole('button', { name: 'Launch session' }).click();
      await expect(detail.getByText('Connected')).toBeVisible({ timeout: 15_000 });

      // The host owns the keystrokes typed inside it, so the key has to be typed
      // there: clicking it focuses the emulator's own hidden input.
      await detail.locator('.ui-terminal-host').click({ force: true });
      await expect
        .poll(async () => terminalText(detail), { timeout: 15_000, message: 'expected the shell prompt to be drawn before typing' })
        .toMatch(/[$#]\s*$/);
      // Everything the session has sent so far (the prompt's cursor-position
      // reply included) is dropped, so what is asserted below is this keystroke.
      await takeInputFrames(page);

      await page.keyboard.press('Escape');

      const seen: number[][] = [];
      await expect
        .poll(
          async () => {
            seen.push(...(await takeInputFrames(page)));
            return seen.some((frame) => frame.length === 1 && frame[0] === 0x1b);
          },
          { timeout: 10_000, message: 'expected the Escape keystroke to be sent on the session channel' },
        )
        .toBe(true);

      // Nothing around the session was dismissed by it, and the session is still live.
      await expect(containerDetail(page)).toBeVisible();
      await expect(detail.getByText('Connected')).toBeVisible();
      await expect(detail.locator('.ui-terminal-host')).toBeVisible();
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
      // The fixture image ships `/bin/sh` and no bash, as small images do. Left on the
      // control's own default the session launches `/bin/bash` and dies at once, so what
      // follows is asserted against a session that is already over.
      await detail.getByRole('combobox', { name: 'Shell' }).selectOption('/bin/sh');
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
/**
 * **Deliberately single-frame, and it must stay that way.** The two readings this feeds are taken
 * two seconds apart to prove the terminal is *not* growing while nothing resizes it: a settled
 * reader samples until consecutive readings agree, which is precisely how a slow growth would be
 * waited out and reported as stability (`support/settled.ts`, "what must not come here").
 */
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
      // The fixture image ships `/bin/sh` and no bash, as small images do. Left on the
      // control's own default the session launches `/bin/bash` and dies at once, so what
      // follows is asserted against a session that is already over.
      await detail.getByRole('combobox', { name: 'Shell' }).selectOption('/bin/sh');
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
      // The counter is installed first, so the load it applies to is this one;
      // the screen is pinned rather than reached through a rail click the
      // Dashboard's cross-navigation tiles make ambiguous (REQ-115).
      await openApp(page, 'containers');
      await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
      await createIdleContainer(name);
      const detail = await openTab(page, name, 'Exec');
      // The fixture image ships `/bin/sh` and no bash, as small images do. Left on the
      // control's own default the session launches `/bin/bash` and dies at once, so what
      // follows is asserted against a session that is already over.
      await detail.getByRole('combobox', { name: 'Shell' }).selectOption('/bin/sh');
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
      // The counter is installed first, so the load it applies to is this one;
      // the screen is pinned rather than reached through a rail click the
      // Dashboard's cross-navigation tiles make ambiguous (REQ-115).
      await openApp(page, 'containers');
      await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
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

  /** The container list's poll as the client declares it, unscaled (`use-containers.md`). */
  const SHIPPED_LIST_POLL_MS = 3_000;
  /** How long the open session is watched for. A wall-clock window, on no clock but the runner's. */
  const OBSERVATION_MS = 6_000;
  /**
   * What the daemon's own events may add on top of the polls. An attach session's
   * terminal settles into one or two `container resize` events, and each reaches
   * the list; measured on the trace of the run that reported this bound, the
   * event-driven reads arrived in one burst of three, 65–195 ms apart, against
   * ten polls spaced at exactly the scaled interval.
   */
  const EVENT_READS_ALLOWED = 5;

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

      // What the poll costs on the clock this process was configured with. The
      // figure is **asked of the running server** (`/api/timing-scale`, the same
      // source the browser itself reads the factor from) rather than written
      // here, so this spec still writes no scaled figure of its own
      // (plan-docker_management_app-timing_scale/REQ-18) and the bound follows
      // the configuration wherever it is set. Written as a constant, `10` was
      // two polls plus slack on the shipped clock and eleven polls' worth of
      // slack short of one on a fifth of it.
      const { scale } = (await (await page.request.get('/api/timing-scale')).json()) as { scale: number };
      const pollMs = Math.max(1, Math.round(SHIPPED_LIST_POLL_MS * scale));
      // A window of W holds at most floor(W / poll) + 1 polls: one may land the
      // instant it opens and one the instant it closes.
      const polls = Math.floor(OBSERVATION_MS / pollMs) + 1;
      const bound = polls + EVENT_READS_ALLOWED;

      listReads.length = 0;
      await page.waitForTimeout(OBSERVATION_MS);

      // The list re-reads on its poll (use-containers.md) plus the odd real
      // event: that many reads over the window, never hundreds. A refetch loop
      // is not bounded by any cadence, so it passes this figure inside the first
      // fraction of a second of the window.
      expect(
        listReads.length,
        `expected at most ${bound} container-list reads over ${OBSERVATION_MS}ms — ${polls} polls at ${pollMs}ms ` +
          `plus ${EVENT_READS_ALLOWED} event-driven reads — and got ${listReads.length}`,
      ).toBeLessThanOrEqual(bound);
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
      // The fixture image ships `/bin/sh` and no bash, as small images do. Left on the
      // control's own default the session launches `/bin/bash` and dies at once, so what
      // follows is asserted against a session that is already over.
      await detail.getByRole('combobox', { name: 'Shell' }).selectOption('/bin/sh');
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
