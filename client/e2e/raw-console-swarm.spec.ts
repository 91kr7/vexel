import { execFile } from 'node:child_process';
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { clickAtItsCentre } from './support/settled.js';

/**
 * **The escape hatch is intact: swarm left the screens, not the console.**
 * REQ ids belong to `plan-docker_management_app-swarm_removal`.
 *
 * Three things, and they are the three the requirements state. A swarm command
 * typed into the console **runs**, is neither refused nor rewritten, and its
 * answer is shown as the daemon gives it (REQ-10) — which is checked against the
 * daemon's own answer to the same command, run from here in the same window,
 * rather than against words written into an assertion. A destructive swarm
 * command still raises the console's warning **before** it runs (REQ-11). And a
 * payload defined as a faithful reproduction still renders whatever Docker puts
 * in it, its swarm fields included (REQ-15).
 *
 * **Nothing here initialises, joins or leaves a swarm**, by the human's decision
 * of 2026-08-27: no check of this project ever does. The commands below are the
 * read-only ones, and the one destructive entry is taken as far as the
 * confirmation and then **cancelled** — so it never runs, on this daemon or any
 * other. Nothing is created, so there is nothing to clean up.
 *
 * The interactions a human performs with a mouse — the channel switch, the
 * dialog's own buttons — are driven with a **real pointer at the visible
 * control's own coordinates** (CLAUDE.md, "What a check drives, and what it
 * measures").
 */

interface CliAnswer {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * The daemon's own answer to a command, exit code included.
 *
 * `support/docker-cli.ts` throws on a non-zero exit, and a non-zero exit is
 * precisely the ordinary answer here — `docker node ls` outside a cluster fails,
 * and REQ-10 is about that answer reaching the operator unaltered. So the child
 * is run directly and its three outputs are kept.
 */
function daemonAnswerTo(args: readonly string[]): Promise<CliAnswer> {
  return new Promise((resolve) => {
    execFile('docker', [...args], { timeout: 30_000 }, (error, stdout, stderr) => {
      const code = (error as { code?: number } | null)?.code ?? 0;
      resolve({ stdout: String(stdout), stderr: String(stderr), code: typeof code === 'number' ? code : 1 });
    });
  });
}

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

function prompt(page: Page): Locator {
  return page.getByLabel('Console prompt');
}

/** The transcript entry whose command is exactly this line. */
function entryFor(page: Page, command: string): Locator {
  return page.locator('.ui-console-surface__entry', {
    has: page.locator('.ui-console-surface__command', { hasText: command }),
  });
}

async function submit(page: Page, command: string): Promise<void> {
  await prompt(page).fill(command);
  await prompt(page).press('Enter');
}

/**
 * Opens the console and waits for the startup history read to have landed, so no
 * assertion on the transcript races the load. The screen is pinned rather than
 * inherited: the last active one survives by design (REQ-115).
 */
async function openConsole(page: Page): Promise<void> {
  const historyRead = page.waitForResponse(
    (response) => response.url().includes('/api/console/history') && response.request().method() === 'GET',
  );
  await openApp(page, 'raw-console');
  await historyRead;
  await expect(screenContent(page).getByRole('heading', { name: 'Raw command & API console' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openConsole(page);
});

// REQ-10 — "swarm commands stay issuable through the raw console, unfiltered and unchanged: the
// console refuses none of them, alters none of them, and shows the daemon's answer as the daemon
// gives it". `docker node ls` is the command the acceptance scenario names, and it is read-only on
// any daemon: outside a cluster it lists nothing and says why.
test('a swarm command typed into the console runs, unaltered, and shows the daemon’s own answer', async ({ page }) => {
  const command = 'docker node ls';
  const daemon = await daemonAnswerTo(['node', 'ls']);

  await submit(page, command);

  const entry = entryFor(page, command);
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toContainText(/exit \d/, { timeout: 20_000 });

  // Not rewritten: the transcript carries the line exactly as it was typed.
  await expect(entry.locator('.ui-console-surface__command')).toHaveText(command);
  // Not refused: it ran on the CLI channel, and it reached the daemon rather than being turned back
  // by the console (REQ-104 states the channel on the entry).
  await expect(entry).toContainText('docker CLI');
  await expect(entry).toContainText(`exit ${daemon.code}`);

  // …and the answer is the daemon's own, line for line: every non-empty line Docker produced is in
  // the transcript, whichever stream it came out of.
  const produced = [...daemon.stdout.split('\n'), ...daemon.stderr.split('\n')].map((line) => line.trim()).filter((line) => line.length > 0);
  expect(produced.length, 'the daemon answered this command with nothing at all, so nothing below is a comparison').toBeGreaterThan(0);
  const shown = await entry.innerText();
  for (const line of produced) {
    expect(shown, `the console did not show the daemon's own line: "${line}"`).toContain(line);
  }
});

// REQ-10 — the same, on the other channel: the Engine API half of the console reaches the daemon's
// swarm addresses, which is what "the capability is withdrawn from the product, not from Docker"
// means. `/nodes` is read-only and answers on any daemon, with a list or with the reason there is
// none. The channel is switched with a real pointer.
test('the console’s Engine API channel still reaches a swarm address of the daemon', async ({ page }) => {
  await clickAtItsCentre(page, screenContent(page).getByRole('button', { name: 'Engine API' }), 'the Engine API channel control');

  const command = 'GET /nodes';
  await submit(page, command);

  const entry = entryFor(page, command);
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toContainText(/HTTP \d{3}/, { timeout: 20_000 });
  await expect(entry.locator('.ui-console-surface__command')).toHaveText(command);
  await expect(entry).toContainText('Engine API');
  // The daemon's own status, whatever it is: a 503 outside a cluster is a result to show, not a
  // refusal by the console (console-api-service.md).
  expect(await entry.innerText(), 'the console refused the address instead of issuing it').not.toMatch(/not supported|unavailable in this build/i);
});

// REQ-11 — "the console's warning before a destructive command still covers the swarm commands that
// remain executable, by the same mechanism that covers prune and forced removals"; the acceptance
// scenario's own command. The confirmation is **cancelled**: nothing destructive is ever run from
// this project, and this one would act on the operator's own daemon.
test('a destructive swarm command is announced before it runs, and cancelling runs nothing', async ({ page }) => {
  const command = 'docker swarm leave --force';
  await submit(page, command);

  const dialog = page.locator('.ui-modal');
  await expect(dialog, 'the console ran a destructive swarm command without warning').toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: `Confirm: ${command}` })).toBeVisible();
  await expect(dialog, 'the warning does not name the command it is about to run').toContainText(command);
  await expect(dialog, 'the warning does not say what the command will do').toContainText(/leav|remov|forc/i);
  await expect(dialog, 'the warning does not say which daemon it acts on').toContainText(/daemon of the active context/i);

  await clickAtItsCentre(page, dialog.getByRole('button', { name: 'Cancel' }), 'the confirmation’s Cancel control');
  await expect(dialog).toBeHidden();

  // Nothing ran, and the line is still in the prompt.
  await expect(entryFor(page, command)).toHaveCount(0);
  await expect(prompt(page)).toHaveValue(command);
});

// REQ-11 — the same mechanism, and only where it belongs: a read-only swarm command is not made to
// ask. Without this the test above would pass on a build that warned about everything.
test('a read-only swarm command is not made to ask', async ({ page }) => {
  const command = 'docker node ls';
  await submit(page, command);

  await expect(entryFor(page, command)).toContainText(/exit \d/, { timeout: 20_000 });
  await expect(page.locator('.ui-modal')).toHaveCount(0);
});

// REQ-15 — "views defined as faithful reproductions of the daemon's answer — inspect payloads, raw
// console output — still render whatever Docker puts in them, swarm fields included: nothing is
// filtered out of them". `GET /info` is the payload that carries the daemon's swarm section on
// every daemon, in a cluster or out of one, so it is the one that can state this.
test('an inspect payload is rendered whole, the daemon’s swarm fields included', async ({ page }) => {
  await clickAtItsCentre(page, screenContent(page).getByRole('button', { name: 'Engine API' }), 'the Engine API channel control');

  const command = 'GET /info';
  await submit(page, command);

  const entry = entryFor(page, command);
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toContainText('HTTP 200', { timeout: 20_000 });

  const shown = await entry.innerText();
  // The daemon's own reading of the fields the removal might have filtered, asked of Docker itself.
  const state = (await daemonAnswerTo(['info', '--format', '{{.Swarm.LocalNodeState}}'])).stdout.trim();
  expect(state.length, 'the daemon reports no swarm state at all, so nothing below is a comparison').toBeGreaterThan(0);

  expect(shown, 'the payload no longer carries the daemon’s swarm section').toContain('"Swarm"');
  expect(shown, 'the payload’s swarm section was emptied of the state the daemon reports').toContain(`"LocalNodeState":"${state}"`);
  for (const field of ['"NodeID"', '"ControlAvailable"', '"RemoteManagers"']) {
    expect(shown, `the payload was filtered: ${field} is not in it`).toContain(field);
  }
});
