import { expect, test, type Locator, type Page } from './support/test.js';
import { activeContextLabel, navEntry, openApp } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

const RUN_ID = `${process.pid}-${Date.now()}`;

// The raw console (F28) runs whatever is typed with the server's own privileges, so every command
// this spec submits is read-only: `docker version`, a `docker ps` filtered on a label nothing
// carries, a GET on the Engine API. The destructive path is only ever taken as far as the
// confirmation, which is then cancelled — the command it names never runs (and names a container
// that does not exist, so a mistake here could still destroy nothing). Executing a destructive
// entry belongs to `exclusive/raw-console-destructive.spec.ts`, against a fixture it creates.

/** A command line unique to one test, so an assertion never reads another test's entry. */
function marker(caseName: string): string {
  return `vexel-e2e-console-${caseName}-${RUN_ID}`;
}

function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

function prompt(page: Page): Locator {
  return page.getByLabel('Console prompt');
}

function transcript(page: Page): Locator {
  return page.locator('.ui-console-surface__transcript');
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

async function daemonVersion(): Promise<string> {
  const { stdout } = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}']);
  return stdout.trim();
}

/**
 * Opens the console and waits for the startup history read to have landed.
 *
 * The last active screen survives by design (REQ-115), so the screen this suite needs is pinned
 * rather than inherited from whichever spec ran before. Waiting for the read settles what the
 * transcript already holds when a spec starts typing, so an assertion on the entries never races
 * the load. The read landing late is a case of its own — the session's entries must survive it —
 * and is pinned deterministically in `client/test/unit/use-console.test.tsx`.
 */
async function openConsole(page: Page): Promise<void> {
  const historyRead = page.waitForResponse(
    (response) => response.url().includes('/api/console/history') && response.request().method() === 'GET',
  );
  await openApp(page, 'raw-console');
  await historyRead;
  await expect(screenContent(page).getByRole('heading', { name: 'Raw command & API console' })).toBeVisible();
}

/**
 * The application's own write of a history entry.
 *
 * REQ-114 promises the history comes back after a restart, not that it survives a reload racing
 * the write: the entry is persisted by a write the console fires and does not await, so reloading
 * without awaiting it destroys the page while the write is still queued. The queue is the
 * browser's, not the server's — the daemon event stream holds one connection for ever, and six
 * requests in flight are the HTTP/1.1 per-origin limit, so this one waits its turn behind whatever
 * the screen is loading, seconds at a time when the daemon is busy. Cause established in
 * plan-docker_management_app-single_process_serving.
 */
function persistedHistoryEntry(page: Page, command: string): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/api/console/history') &&
      (response.request().postData() ?? '').includes(command),
  );
}

test.beforeEach(async ({ page }) => {
  await openConsole(page);
});

// plan-docker_management_app/REQ-100, plan-ui-coherence-optimisation/REQ-15 /
// app-shell/specs/shell.md — "Selecting a `NavItem` sets it active … and replaces the content area
// with its screen". The route this test used to drive was the header's own "Console" button, which
// offered the same destination as the rail entry beside it as a different kind of thing; the entry
// is the single route to the screen now, so what is restated here is that the screen is still
// reached — and still usable on arrival.
test('the raw console is opened from its navigation entry', async ({ page }) => {
  await openApp(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  await navEntry(page, 'Raw console').click();

  await expect(page.getByRole('heading', { level: 1, name: 'Raw console' })).toBeVisible();
  await expect(prompt(page)).toBeVisible();
});

// plan-docker_management_app/REQ-104 — the console states which channel each entry runs on and that
// it executes with the full privileges of the daemon and of the local user;
// raw-console-screen.md — the notice names the active context and what the channel dials
test('states the channel, the privileges and the context every entry runs against', async ({ page }) => {
  const notice = screenContent(page).locator('.ui-state-summary-bar');
  const contextName = (await activeContextLabel()).split(' (')[0]!;

  await expect(notice).toContainText('docker CLI');
  await expect(notice).toContainText(/full privileges of the Docker daemon and of the user the server runs as/i);
  await expect(notice).toContainText(/local docker process/i);
  await expect(notice).toContainText(contextName);

  await screenContent(page).getByRole('button', { name: 'Engine API' }).click();
  await expect(notice).toContainText('Engine API');
  await expect(notice).toContainText(/direct Engine API call/i);
  await expect(notice).toContainText(contextName);
});

// plan-docker_management_app/REQ-100 — an arbitrary Docker CLI command is entered and executed
// against the active context, with its stdout and exit code coming back into the console
test('runs a docker command line and shows its output and exit status', async ({ page }) => {
  const command = 'docker version --format {{.Server.Version}}';
  await submit(page, command);

  const entry = entryFor(page, command);
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toContainText(await daemonVersion(), { timeout: 20_000 });
  await expect(entry).toContainText('exit 0');
  // REQ-104 — the entry states the channel it ran on.
  await expect(entry).toContainText('docker CLI');
  // The prompt is cleared once the line is actually running.
  await expect(prompt(page)).toHaveValue('');
});

// plan-docker_management_app/REQ-100 — stderr and a non-zero exit code are shown too
test('shows the error output and the non-zero exit status of a command that failed', async ({ page }) => {
  const command = `docker inspect ${marker('absent')}`;
  await submit(page, command);

  const entry = entryFor(page, command);
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toContainText(/exit [1-9]/, { timeout: 20_000 });
  await expect(entry.locator('.ui-console-surface__line--stderr').first()).toBeVisible();
});

// plan-docker_management_app/REQ-100 — the console runs the Docker CLI, not a shell on the server:
// a line that is not a docker command is refused, and the metacharacters of one that is reach the
// process as literal arguments
test('refuses a line that is not a docker command, and never lets a metacharacter act', async ({ page }) => {
  // A line that is not a docker command at all. Chosen so that even the refusal
  // is harmless: it carries nothing destructive to be confirmed.
  const notDocker = `echo ${marker('not-docker')}`;
  await submit(page, notDocker);
  const refused = entryFor(page, notDocker);
  await expect(refused).toBeVisible({ timeout: 20_000 });
  await expect(refused).toContainText('failed', { timeout: 20_000 });
  await expect(refused).toContainText(/docker/i);

  // The separator is an argument of `docker`, not the start of a second command:
  // the echo a shell would have run produces no line of its own.
  const chained = `docker ps; echo ${marker('chain')}`;
  await submit(page, chained);
  const entry = entryFor(page, chained);
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toContainText(/exit [1-9]/, { timeout: 20_000 });
  await expect(entry.locator('.ui-console-surface__line', { hasText: marker('chain') })).toHaveCount(0);
});

// plan-docker_management_app/REQ-101 — an arbitrary Engine API call is issued and its raw status and
// response body are shown
test('issues an Engine API call and shows the daemon\'s raw status and body', async ({ page }) => {
  await screenContent(page).getByRole('button', { name: 'Engine API' }).click();
  await submit(page, 'GET /version');

  const entry = entryFor(page, 'GET /version');
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toContainText('HTTP 200', { timeout: 20_000 });
  await expect(entry).toContainText(await daemonVersion());
  await expect(entry).toContainText('Engine API');
});

// plan-docker_management_app/REQ-101 / console-api-service.md — "a 404 ... is a result to show, not
// a failure to raise"
// plan-docker_management_app/REQ-101, REQ-103 — the Engine API starting points include a call with
// a body, offered in the form the entry grammar takes as typed (unquoted, quotes and spacing its
// own). Clicking it only prefills: nothing is created here.
test('offers a body-bearing Engine API starting point that only prefills the prompt', async ({ page }) => {
  await screenContent(page).getByRole('button', { name: 'Engine API' }).click();
  const withBody = screenContent(page).locator('.ui-chip--clickable').filter({ hasText: '{"Image"' });
  await expect(withBody).toHaveCount(1);

  const before = await transcript(page).locator('.ui-console-surface__entry').count();
  await withBody.click();

  await expect(prompt(page)).toHaveValue(/^POST \/containers\/create\?name=\S+ \{"Image":/);
  await expect(transcript(page).locator('.ui-console-surface__entry')).toHaveCount(before);
});

test('shows a daemon 404 as the entry\'s status rather than as a failure', async ({ page }) => {
  await screenContent(page).getByRole('button', { name: 'Engine API' }).click();
  const command = `GET /containers/${marker('absent-api')}/json`;
  await submit(page, command);

  const entry = entryFor(page, command);
  await expect(entry).toBeVisible({ timeout: 20_000 });
  await expect(entry).toContainText('HTTP 404', { timeout: 20_000 });
});

// plan-docker_management_app/REQ-112 — a console entry recognised as destructive goes through the
// application's explicit confirmation, naming the command that is about to be executed. The
// confirmation is cancelled: nothing destructive is ever run from this project.
test('asks for confirmation naming the exact command before a destructive entry, and cancelling runs nothing', async ({ page }) => {
  const command = `docker rm -f ${marker('never-run')}`;
  await submit(page, command);

  const dialog = page.locator('.ui-modal');
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: `Confirm: ${command}` })).toBeVisible();
  await expect(dialog).toContainText(command);
  await expect(dialog).toContainText(/remov/i);
  await expect(dialog).toContainText(/daemon of the active context/i);

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  // Nothing ran, and the line is still in the prompt.
  await expect(entryFor(page, command)).toHaveCount(0);
  await expect(prompt(page)).toHaveValue(command);
});

// plan-docker_management_app/REQ-112 — a read-only command is not made to ask
test('runs a non-destructive command without asking for a confirmation', async ({ page }) => {
  const command = `docker ps --filter label=${marker('no-confirm')}`;
  await submit(page, command);

  await expect(entryFor(page, command)).toContainText('exit 0', { timeout: 20_000 });
  await expect(page.locator('.ui-modal')).toHaveCount(0);
});

// plan-docker_management_app/REQ-103 — the long-tail commands the console is the intended escape
// hatch for are offered as one-click starting points
test('offers the long-tail commands as starting points that only prefill the prompt', async ({ page }) => {
  const startingPoints = screenContent(page).locator('.ui-chip--clickable');

  for (const fragment of ['manifest', 'trust', 'scout', 'sbom', 'buildx bake', 'context inspect', 'plugin install', 'events', 'system df', 'checkpoint']) {
    await expect(startingPoints.filter({ hasText: fragment }).first()).toBeVisible();
  }
  // The four capabilities no screen of its own carries stay reachable here.
  for (const fragment of ['docker build -t', 'stack deploy', '--cache-to', 'context create']) {
    await expect(startingPoints.filter({ hasText: fragment }).first()).toBeVisible();
  }

  const before = await transcript(page).locator('.ui-console-surface__entry').count();
  await startingPoints.filter({ hasText: 'manifest' }).first().click();

  await expect(prompt(page)).toHaveValue(/^docker manifest/);
  // A starting point never runs on its own.
  await expect(transcript(page).locator('.ui-console-surface__entry')).toHaveCount(before);
});

// plan-docker_management_app/REQ-102 — the console keeps the session's history, and allows
// recalling and re-running a previous entry. Copying an entry left on 2026-08-14 with every other
// copy affordance (plan-docker_management_app-remove_copy_controls); the recall and the re-run
// around it are untouched, and the transcript they act on is still asserted (REQ-30).
test('recalls and re-runs a previous entry with its output', async ({ page }) => {
  const command = `docker ps --filter label=${marker('recall')}`;
  await submit(page, command);
  const entry = entryFor(page, command);
  await expect(entry).toContainText('exit 0', { timeout: 20_000 });

  // Recall: the arrow keys walk the previous commands back into the prompt.
  await prompt(page).press('ArrowUp');
  await expect(prompt(page)).toHaveValue(command);
  await prompt(page).fill('');

  // The entry still carries its command and the prompt symbol beside it — what the copy used to be
  // read for, asserted where it is actually drawn (REQ-30).
  await expect(entry.locator('.ui-console-surface__command')).toHaveText(command);
  await expect(entry.locator('.ui-console-surface__symbol')).toHaveText('$');

  // Re-run: the same command runs again, as a second entry.
  await entry.getByRole('button', { name: 'Re-run' }).click();
  await expect(entryFor(page, command)).toHaveCount(2, { timeout: 20_000 });
});

// plan-docker_management_app/REQ-114 — the command history survives an application restart
test('keeps the history across a reload of the application', async ({ page }) => {
  const command = `docker ps --filter label=${marker('persisted')}`;
  const persisted = persistedHistoryEntry(page, command);
  await submit(page, command);
  await expect(entryFor(page, command)).toContainText('exit 0', { timeout: 20_000 });
  // The write the reload below must not overtake — see `persistedHistoryEntry`.
  await persisted;

  await openConsole(page);

  // Exactly once: the read that restores the history merges under what is already there, so no
  // reload may show the same entry twice (use-console.md).
  await expect(entryFor(page, command)).toHaveCount(1, { timeout: 20_000 });
  // Recall reaches the commands from before the restart too.
  await prompt(page).press('ArrowUp');
  await expect(prompt(page)).toHaveValue(command);

  // A second reload adds nothing either.
  await openConsole(page);
  await expect(entryFor(page, command)).toHaveCount(1, { timeout: 20_000 });
});

// plan-docker_management_app/REQ-104 / console-history-store.md — a command that could carry a
// credential stays in the session, marked, and never reaches the history file. The command below
// carries no real credential and contacts no registry: `--token` is enough to be recognised, and
// the CLI refuses the flag locally.
test('marks a command that could carry a credential as not kept, and drops it on reload', async ({ page }) => {
  const secret = `docker version --token ${marker('secret')}`;
  const kept = `docker ps --filter label=${marker('kept')}`;

  await submit(page, kept);
  await expect(entryFor(page, kept)).toContainText('exit 0', { timeout: 20_000 });
  await submit(page, secret);
  const secretEntry = entryFor(page, secret);
  await expect(secretEntry).toBeVisible({ timeout: 20_000 });
  await expect(secretEntry).toContainText('not kept in history');

  await openConsole(page);

  await expect(entryFor(page, kept)).toHaveCount(1, { timeout: 20_000 });
  await expect(entryFor(page, secret)).toHaveCount(0);
});
