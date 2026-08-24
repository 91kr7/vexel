import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { clickAtItsCentre } from './support/settled.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

const RUN_ID = `${process.pid}-${Date.now()}`;

// A Docker context is host-level configuration and carries no label, so every
// fixture is recognised by its name alone and removed by the spec that made it,
// pass or fail. The active context is the operator's own global state: the spec
// that switches it switches only to a context pointing at the daemon that was
// already active, and puts the original back either way.
function fixtureName(caseName: string): string {
  return `vexel-e2e-ctx-${caseName}-${RUN_ID}`;
}

async function createContextQuietly(name: string, host: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync('docker', ['context', 'create', name, '--docker', `host=${host}`, ...extraArgs]);
}

async function removeContextQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['context', 'rm', '-f', name]).catch(() => undefined);
}

async function currentContextName(): Promise<string> {
  const { stdout } = await execFileAsync('docker', ['context', 'show']);
  return stdout.trim();
}

async function contextEndpoint(name: string): Promise<string> {
  const { stdout } = await execFileAsync('docker', ['context', 'inspect', name, '--format', '{{.Endpoints.docker.Host}}']);
  return stdout.trim();
}

async function useContextQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['context', 'use', name]).catch(() => undefined);
}

/** A TCP+TLS context of the kind this application no longer creates but must still list and offer for use: made outside the application, with real certificate files. */
async function createTlsContextQuietly(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'vexel-e2e-ctx-tls-'));
  await execFileAsync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', join(dir, 'key.pem'),
    '-out', join(dir, 'cert.pem'),
    '-days', '1', '-subj', '/CN=vexel-e2e',
  ]);
  await execFileAsync('cp', [join(dir, 'cert.pem'), join(dir, 'ca.pem')]);
  await execFileAsync('docker', [
    'context', 'create', name,
    '--docker', `host=tcp://198.51.100.7:2376,ca=${join(dir, 'ca.pem')},cert=${join(dir, 'cert.pem')},key=${join(dir, 'key.pem')}`,
  ]);
  return dir;
}

/**
 * A context's row.
 *
 * The list is the object list — the same table containers and images ship
 * (`plan-ui-coherence-optimisation/REQ-42`, and the classic-table plan's
 * `REQ-17`) — so a row is a `.ui-data-table__row`
 * and each value of a context is a cell of its own — the kind under the name,
 * TLS and the state in columns rather than a `(kind)` suffix on the title and a
 * `(tls)` one on the endpoint.
 */
function contextRow(page: Page, name: string) {
  return screenContent(page).locator('.ui-data-table__row', { hasText: name }).first();
}

/** The cell of a row belonging to the column whose header matches `header`, read through that header. */
async function cellOf(page: Page, row: ReturnType<typeof contextRow>, header: RegExp) {
  const headers = await screenContent(page).locator('.ui-data-table__header-cell').allInnerTexts();
  const index = headers.findIndex((label) => header.test(label.trim()));
  expect(index, `no column is headed ${header} — headers are ${JSON.stringify(headers)}`).toBeGreaterThanOrEqual(0);
  return row.locator('.ui-data-table__cell').nth(index);
}

/** The switch a row offers: an action of its cluster, weighing primary, since REQ-43. */
function switchControl(row: ReturnType<typeof contextRow>) {
  return row.getByRole('button', { name: 'Use', exact: true });
}

/**
 * Clicks a control with a **real pointer at its own visible coordinates**.
 *
 * A programmatic activation moves no focus and hit-tests nothing, so it cannot
 * detect a defect only hit-testing can trigger (CLAUDE.md, "What a check drives,
 * and what it measures") — and this is the most consequential click in the
 * product.
 */
async function clickAtItsOwnCentre(page: Page, control: ReturnType<typeof switchControl>): Promise<void> {
  // …and read once the control has stopped moving: this control's own defect was a hidden input
  // 1346px away from it, so coordinates taken from a layout still settling are exactly the mistake
  // the check exists to refuse (`support/settled.ts`).
  await clickAtItsCentre(page, control, 'the context switch');
}

function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

/**
 * Removes any context this suite left behind, whatever the run. A context
 * carries no label, so its name prefix is the only handle there is — and a spec
 * killed by its own timeout never reaches its `finally`, which is exactly when
 * a leftover appears. The e2e suite runs single-worker, so no other run can own
 * a name under this prefix.
 */
test.afterAll(async () => {
  const { stdout } = await execFileAsync('docker', ['context', 'ls', '--format', '{{.Name}}']).catch(() => ({ stdout: '' }));
  const leftovers = stdout.split('\n').filter((name) => name.startsWith('vexel-e2e-ctx-'));
  for (const name of leftovers) await removeContextQuietly(name);
});

// The last active screen survives by design (REQ-115), so the screen this suite
// needs is pinned rather than inherited from whichever spec ran before.
test.beforeEach(async ({ page }) => {
  await openApp(page, 'contexts');
  await expect(screenContent(page).getByRole('heading', { level: 2, name: 'Docker contexts' })).toBeVisible();
});

// plan-docker_management_app/REQ-92 — Docker contexts are listed with name, endpoint and which one
// is active; contexts-screen.md — "One row per context ... in aligned columns: a marker on the
// context in use, the context's name over its kind, its endpoint, whether it carries TLS material,
// its description, and the state Docker reports for it"
test('lists a context with its name, kind, endpoint and description, and marks the active one', async ({ page }) => {
  const name = fixtureName('list');
  await createContextQuietly(name, 'ssh://operator@build-host', ['--description', 'an e2e fixture']);
  try {
    await page.reload();
    const row = contextRow(page, name);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(await cellOf(page, row, /^CONTEXT$/i)).toContainText(name);
    await expect(await cellOf(page, row, /^CONTEXT$/i)).toContainText('ssh');
    await expect(await cellOf(page, row, /^ENDPOINT$/i)).toHaveText('ssh://operator@build-host');
    await expect(await cellOf(page, row, /^DESCRIPTION$/i)).toHaveText('an e2e fixture');
    // Not the active one: it offers the switch instead of the marker.
    await expect(switchControl(row)).toBeVisible();
    await expect(row.getByText('active', { exact: true })).toHaveCount(0);

    // The context Docker itself has selected is the one carrying the marker, and is offered no
    // switch to itself (contexts-screen.md).
    const activeRow = contextRow(page, await currentContextName());
    await expect(activeRow.getByText('active', { exact: true })).toBeVisible();
    await expect(switchControl(activeRow)).toHaveCount(0);
  } finally {
    await removeContextQuietly(name);
  }
});

// plan-docker_management_app/REQ-92 — "whatever their endpoint kind"; contexts-screen.md — "A
// TCP+TLS context created outside the application is shown exactly like the others: never filtered
// out, never greyed out, never marked unsupported", TLS being "a column rather than the delivered
// `(tls)` suffix on the endpoint" — the suffix rode on the value the row truncates first
test('shows an externally created TCP+TLS context like any other, its TLS in a column and its switch offered', async ({ page }) => {
  const name = fixtureName('tls');
  const certDir = await createTlsContextQuietly(name);
  try {
    await page.reload();
    const row = contextRow(page, name);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(await cellOf(page, row, /^CONTEXT$/i)).toContainText('tcp');
    await expect(await cellOf(page, row, /^ENDPOINT$/i)).toHaveText('tcp://198.51.100.7:2376');
    await expect(await cellOf(page, row, /^TLS$/i)).toHaveText('tls');
    await expect(switchControl(row)).toBeVisible();
    await expect(row).not.toContainText(/unsupported/i);
  } finally {
    await removeContextQuietly(name);
    await rm(certDir, { recursive: true, force: true });
  }
});

// plan-docker_management_app/REQ-92 — a context can be created for a local socket;
// contexts-screen.md — "the form's local kind states which socket it uses instead of asking for it",
// and offers no TCP+TLS kind, no TLS-material input and no path input
test('creates a local-socket context from a form that asks for no path and offers no TCP+TLS kind', async ({ page }) => {
  const name = fixtureName('create-local');
  try {
    await page.getByRole('button', { name: 'Create context' }).click();
    const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Create context' }) });
    await expect(dialog).toBeVisible();

    // Exactly two endpoint kinds, local socket and SSH.
    const kindSelector = dialog.getByLabel('Endpoint kind');
    await expect(kindSelector.locator('option')).toHaveCount(2);
    await expect(kindSelector.locator('option')).toHaveText(['Local socket', 'SSH']);
    // The local kind states its socket rather than asking for one.
    await expect(dialog).toContainText(/socket of the machine running/i);
    await expect(dialog.getByLabel(/path/i)).toHaveCount(0);
    await expect(dialog.getByLabel(/certificate|ca |client key/i)).toHaveCount(0);

    await dialog.getByLabel('Context name').fill(name);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    const row = contextRow(page, name);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(await cellOf(page, row, /^CONTEXT$/i)).toContainText('local');
    await expect(await cellOf(page, row, /^ENDPOINT$/i)).toContainText('unix://');
  } finally {
    await removeContextQuietly(name);
  }
});

// plan-docker_management_app/REQ-92 — a context can be created for an SSH endpoint;
// contexts-screen.md — "the endpoint group (kind, and the SSH destination when the SSH kind is
// chosen)" and "cannot be submitted without a name, nor with the SSH kind and no destination"
test('creates an SSH context, the destination appearing only once the SSH kind is chosen', async ({ page }) => {
  const name = fixtureName('create-ssh');
  try {
    await page.getByRole('button', { name: 'Create context' }).click();
    const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Create context' }) });
    await expect(dialog.getByLabel('SSH destination')).toHaveCount(0);

    await dialog.getByLabel('Endpoint kind').selectOption('ssh');
    const destination = dialog.getByLabel('SSH destination');
    await expect(destination).toBeVisible();

    // Neither a nameless form nor an SSH one with no destination can be submitted.
    const submit = dialog.getByRole('button', { name: 'Create' });
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('Context name').fill(name);
    await expect(submit).toBeDisabled();

    await destination.fill('operator@build-host');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    const row = contextRow(page, name);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(await cellOf(page, row, /^CONTEXT$/i)).toContainText('ssh');
    await expect(await cellOf(page, row, /^ENDPOINT$/i)).toHaveText('ssh://operator@build-host');
  } finally {
    await removeContextQuietly(name);
  }
});

// plan-docker_management_app/REQ-92 — a context can be removed; contexts-screen.md — "asks for
// confirmation, naming the context and stating that only the local entry goes, not the daemon it
// points at"
test('removing a context asks for confirmation naming it, then drops it from the list', async ({ page }) => {
  const name = fixtureName('remove');
  await createContextQuietly(name, 'ssh://operator@build-host');
  try {
    await page.reload();
    const row = contextRow(page, name);
    await expect(row).toBeVisible({ timeout: 20_000 });

    await row.getByRole('button', { name: 'Remove' }).click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await expect(confirmDialog).toContainText(/daemon it points at is left untouched|only the local|from the local Docker configuration/i);
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmDialog).toBeHidden();
    // Cancelling performs nothing: the context stays listed.
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Remove' }).click();
    await expect(confirmHeading).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Remove' }).click();
    await expect(row).toBeHidden({ timeout: 20_000 });
  } finally {
    await removeContextQuietly(name);
  }
});

// The daemon-readings test that stood here is **removed, not neutered**
// (`plan-ui-coherence-optimisation/REQ-45`, batch 9 INT-6): the eight-property
// block it covered is gone from this screen, having described the daemon rather
// than a context, and the same eight readings are covered where they now live
// alone — `system-prune.spec.ts`, on System & prune. `contexts-row-geometry.spec.ts`
// asserts the other half, that none of the eight is stated here any longer.

// plan-docker_management_app/REQ-93 — selecting another context re-points every screen at the newly
// selected daemon, and the active-context indicator in the shell updates; contexts-screen.md — "A
// toast confirms the switch". The fixture points at the daemon that was already active, so nothing
// outside this spec can notice; the operator's own context is restored either way.
test('switching the active context marks the row, confirms with a toast and renames the shell footer', async ({ page }) => {
  // The footer follows the switch itself, not the inventory poll behind it
  // (use-contexts.md: "whoever announces a switch, every instance re-reads"), so
  // it gets the same budget as any other assertion here — a poll-wide one would
  // hide a return to the lag this once had.
  const footerBudget = 5_000;
  const name = fixtureName('use');
  const originalActive = await currentContextName();
  const endpoint = await contextEndpoint(originalActive);
  // The kind the row and the footer name it by, derived from the endpoint URL as the contract does.
  const kind = endpoint.startsWith('ssh://') ? 'ssh' : /^(tcp|http|https):\/\//.test(endpoint) ? 'tcp' : 'local';
  await createContextQuietly(name, endpoint);
  // When each read of the inventory was **issued**: the announcement's own effect is a read that
  // starts after the switch, so the two are told apart by time. The window asserted below is the
  // footer's own budget, an order of magnitude inside the 15s poll (use-contexts.ts), so a read
  // landing in it is the announcement and not the poll.
  const inventoryReads: number[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/contexts') inventoryReads.push(Date.now());
  });
  try {
    await page.reload();
    const row = contextRow(page, name);
    await expect(row).toBeVisible({ timeout: 20_000 });

    const switchedAt = Date.now();

    // A **real pointer at the control's own coordinates** (CLAUDE.md): this is
    // the most consequential click in the product — it re-points the whole
    // application at another daemon — and a programmatic activation would
    // neither move focus nor hit-test the box the operator aims at.
    await clickAtItsOwnCentre(page, switchControl(row));

    // The toast is asserted first because it is the one of the two that expires:
    // it is pushed the instant the POST answers and lives five seconds, while
    // the row's `active` marker only arrives with the re-read the switch
    // announces — a fresh `docker context ls` plus an inspect per context,
    // seconds of it under load, which is why that marker gets a 20s budget at
    // all. Waiting for the marker first therefore spends the toast's whole life
    // before looking for it. The marker is state and waits; the toast does not.
    await expect(page.getByText('Active context switched')).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText('active', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('navigation')).toContainText(`${name} (${kind})`, { timeout: footerBudget });
    // The previously active context is no longer the one in use: it is offered the switch again.
    await expect(switchControl(contextRow(page, originalActive))).toBeVisible();

    // The announcement the switch carries is unchanged by the migration (batch 9's constraint:
    // "nothing in this migration may change when that broadcast fires or what it carries"). What
    // it does is stated in use-contexts.md — "whoever announces a switch, every instance re-reads"
    // — so the observable is a fresh read of the inventory *after* the POST answered, not a
    // same-tick reading of state the click had not yet produced.
    await expect
      .poll(() => inventoryReads.filter((at) => at > switchedAt).length, {
        message: 'the switch announced nothing: no view re-read the inventory after it',
        timeout: footerBudget,
      })
      .toBeGreaterThan(0);

    // Switching back through the application restores the operator's own context.
    // The switch is daemon-bound — some six CLI spawns, seconds of them under
    // load — so the footer's tight budget runs from the POST's response, the
    // instant the switch is announced to every cached view, and not from the
    // click. The row's `active` marker cannot serve as that anchor: an
    // in-flight read of either hook instance can deliver it before the
    // announcement, leaving the other instance still on the older payload.
    const switchedBack = page.waitForResponse(
      (response) => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/contexts/${originalActive}/use`,
    );
    await clickAtItsOwnCentre(page, switchControl(contextRow(page, originalActive)));
    await switchedBack;
    await expect(page.getByRole('navigation')).toContainText(originalActive, { timeout: footerBudget });
  } finally {
    await useContextQuietly(originalActive);
    await removeContextQuietly(name);
  }
});
