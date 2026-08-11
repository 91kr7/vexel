import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
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

function contextRow(page: Page, name: string) {
  return page.locator('.ui-card-list > .ui-surface', { has: page.locator('.ui-card-list__item', { hasText: name }) });
}

function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

function daemonPanel(page: Page) {
  return screenContent(page).locator('.ui-surface', {
    has: page.getByRole('heading', { level: 2, name: 'Daemon of active context' }),
  });
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
// is active; contexts-screen.md — "name (kind) as title, its endpoint URL in monospace below ...
// and its description on a further line when it has one"
test('lists a context with its name, kind, endpoint and description, and marks the active one', async ({ page }) => {
  const name = fixtureName('list');
  await createContextQuietly(name, 'ssh://operator@build-host', ['--description', 'an e2e fixture']);
  try {
    await page.reload();
    const row = contextRow(page, name);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(`${name} (ssh)`);
    await expect(row).toContainText('ssh://operator@build-host');
    await expect(row).toContainText('an e2e fixture');
    // Not the active one: it offers the switch instead of the marker.
    await expect(row.getByText('use', { exact: true })).toBeVisible();
    await expect(row.getByText('active', { exact: true })).toHaveCount(0);

    // The context Docker itself has selected is the one carrying the marker.
    const activeRow = contextRow(page, await currentContextName());
    await expect(activeRow.getByText('active', { exact: true })).toBeVisible();
  } finally {
    await removeContextQuietly(name);
  }
});

// plan-docker_management_app/REQ-92 — "whatever their endpoint kind"; contexts-screen.md — "A
// TCP+TLS context created outside the application is shown exactly like the others: never filtered
// out, never greyed out, never marked unsupported", its endpoint "suffixed with (tls)"
test('shows an externally created TCP+TLS context like any other, suffixed (tls) and offering "use"', async ({ page }) => {
  const name = fixtureName('tls');
  const certDir = await createTlsContextQuietly(name);
  try {
    await page.reload();
    const row = contextRow(page, name);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(`${name} (tcp)`);
    await expect(row).toContainText('tcp://198.51.100.7:2376 (tls)');
    await expect(row.getByText('use', { exact: true })).toBeVisible();
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
    await expect(row).toContainText(`${name} (local)`);
    await expect(row).toContainText('unix://');
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
    await expect(row).toContainText(`${name} (ssh)`);
    await expect(row).toContainText('ssh://operator@build-host');
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

// plan-docker_management_app/REQ-94 — the daemon of the active context reports its version, Engine
// API version, BuildKit version, storage driver, cgroup driver, OS/architecture, root directory and
// container counts; contexts-screen.md — the panel's rows, with "not reported" standing in for an
// absent buildx plugin
test('shows the daemon readings of the active context', async ({ page }) => {
  const panel = daemonPanel(page);
  await expect(panel).toBeVisible();

  for (const label of ['Docker version', 'Engine API', 'BuildKit', 'Storage driver', 'Cgroup driver', 'OS / Arch', 'Root directory', 'Containers (running)']) {
    await expect(panel.getByText(label, { exact: true })).toBeVisible({ timeout: 20_000 });
  }

  const { stdout: version } = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}|{{.Server.APIVersion}}']);
  const [daemonVersion, daemonApiVersion] = version.trim().split('|');
  const { stdout: info } = await execFileAsync('docker', ['info', '--format', '{{.Driver}}|{{.DockerRootDir}}|{{.Architecture}}']);
  const [driver, rootDir, architecture] = info.trim().split('|');

  await expect(panel).toContainText(daemonVersion!);
  await expect(panel).toContainText(daemonApiVersion!);
  await expect(panel).toContainText(driver!);
  await expect(panel).toContainText(rootDir!);
  await expect(panel).toContainText(architecture!);
  // The buildx plugin's version, or the stated absence of one — never a blank row.
  const buildx = await execFileAsync('docker', ['buildx', 'version']).catch(() => undefined);
  if (!buildx) await expect(panel).toContainText('not reported');
});

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
  try {
    await page.reload();
    const row = contextRow(page, name);
    await expect(row).toBeVisible({ timeout: 20_000 });

    await row.getByText('use', { exact: true }).click();

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
    // The previously active context is no longer the one in use.
    await expect(contextRow(page, originalActive).getByText('use', { exact: true })).toBeVisible();

    // The daemon panel keeps answering for the context now in use (REQ-93, REQ-94).
    const { stdout: version } = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}']);
    await expect(daemonPanel(page)).toContainText(version.trim(), { timeout: 20_000 });

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
    await contextRow(page, originalActive).getByText('use', { exact: true }).click();
    await switchedBack;
    await expect(page.getByRole('navigation')).toContainText(originalActive, { timeout: footerBudget });
  } finally {
    await useContextQuietly(originalActive);
    await removeContextQuietly(name);
  }
});
