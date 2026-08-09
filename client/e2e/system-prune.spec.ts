import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { openApp, ownershipArgs } from './support/fixtures.js';

const execFileAsync = promisify(execFile);
const RUN_ID = `${process.pid}-${Date.now()}`;

// Everything the System & prune screen can be established on without pruning
// the host: the breakdown it reads, the confirmations it demands, the
// shared-daemon warning (REQ-97) and the scope selection. No test here ever
// confirms a prune — the prunes act on the whole host and cannot be scoped, so
// they live in e2e/exclusive/system-prune.spec.ts.
//
// The daemon is the operator's own: assertions are made on the fixture this
// spec creates, never on host totals or on a category being empty.

function fixtureName(caseName: string): string {
  return `vexel-e2e-system-${caseName}-${RUN_ID}`;
}

/** A container in the `created` state — what a prune of stopped containers acts on — that never runs. */
async function createStoppedContainer(caseName: string): Promise<string> {
  const name = fixtureName(caseName);
  await execFileAsync('docker', ['create', '--name', name, ...ownershipArgs(caseName), '--entrypoint', 'sleep', 'alpine:3.20', '300']);
  return name;
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

async function containerExists(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync('docker', ['ps', '-aq', '--filter', `name=^${name}$`]).catch(() => ({ stdout: '' }));
  return stdout.trim().length > 0;
}

function reclaimPanel(page: Page) {
  return page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Reclaim disk space' }) });
}

function categoryRow(page: Page, title: string) {
  return reclaimPanel(page).locator('.ui-storage-usage-row').filter({ hasText: title });
}

function confirmDialog(page: Page) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: /^Confirm:/ }) });
}

/** Records every prune request the page issues, so a test can prove none was. */
function watchPruneRequests(page: Page): string[] {
  const issued: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/system/prune')) issued.push(`${request.method()} ${request.url()}`);
  });
  return issued;
}

async function openSystemScreen(page: Page): Promise<void> {
  // The last active screen survives by design (REQ-115): pin it rather than inherit it.
  await openApp(page, 'system-prune');
  await expect(page.getByRole('heading', { level: 1, name: 'System & prune' })).toBeVisible();
  await expect(categoryRow(page, 'Stopped containers')).toBeVisible({ timeout: 30_000 });
}

// plan-docker_management_app/REQ-95 — the reclaimable space is broken down by the five categories,
// each with its size and a description of what it contains, beside the daemon's information
test('the screen breaks the reclaimable space down by category, beside the daemon information', async ({ page }) => {
  await openSystemScreen(page);

  await expect(page.getByRole('heading', { level: 2, name: 'Daemon info' })).toBeVisible();
  await expect(page.getByText('Docker version', { exact: true })).toBeVisible();
  await expect(page.getByText('Storage driver', { exact: true })).toBeVisible();

  for (const title of ['Stopped containers', 'Dangling images', 'Unused volumes', 'Unused networks', 'Build cache']) {
    const row = categoryRow(page, title);
    await expect(row).toHaveCount(1);
    // Each row says what it holds and what it occupies: a size, or "—" for a category that could
    // not be read (system-screen.md).
    await expect(row.locator('.ui-storage-usage-row__size')).toHaveText(/^(—|\d+(\.\d+)?(B|KB|MB|GB|TB))$/);
    await expect(row.locator('.ui-storage-usage-row__description')).not.toBeEmpty();
  }

  // The panel header carries the total (system-screen.md, "the total reclaimable size in the header").
  await expect(reclaimPanel(page).locator('.ui-section-header__description').first()).toHaveText(/\d+(\.\d+)?(B|KB|MB|GB|TB)/);
});

// plan-docker_management_app/REQ-95 — what a category contains is what the daemon holds: a container
// this spec stopped is part of what a prune of stopped containers would take
test('a container this spec left stopped is counted among the stopped containers', async ({ page }) => {
  const name = await createStoppedContainer('listed');
  try {
    await openSystemScreen(page);

    await expect(categoryRow(page, 'Stopped containers').locator('.ui-storage-usage-row__description')).toHaveText(
      /\d+ containers? not running/,
      { timeout: 30_000 },
    );
    await expect(categoryRow(page, 'Stopped containers').getByRole('button', { name: 'Prune' })).toBeEnabled();
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-97 — before a prune, the application states that the daemon is
// shared and that other tools using it are affected; plan-docker_management_app/REQ-6 — cancelling
// performs nothing
test('a category prune states that the daemon is shared, and cancelling prunes nothing', async ({ page }) => {
  const name = await createStoppedContainer('confirm-cancel');
  const pruneRequests = watchPruneRequests(page);
  try {
    await openSystemScreen(page);

    // The standing warning is on the screen itself, before any dialog (system-screen.md).
    await expect(page.getByText(/other tools sharing this daemon are affected/i)).toBeVisible();

    await categoryRow(page, 'Stopped containers').getByRole('button', { name: 'Prune' }).click();

    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Stopped containers');
    await expect(dialog).toContainText(/cannot be brought back/i);
    await expect(dialog).toContainText(/daemon is shared/i);
    await expect(dialog).toContainText(/other tool/i);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    expect(pruneRequests).toEqual([]);
    expect(await containerExists(name)).toBe(true);
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-96 — a system-wide prune with a selectable scope;
// plan-docker_management_app/REQ-97 — the same shared-daemon statement is made
test('the system prune asks for its scope, states the shared daemon, and prunes nothing when cancelled', async ({ page }) => {
  const name = await createStoppedContainer('scope-cancel');
  const pruneRequests = watchPruneRequests(page);
  try {
    await openSystemScreen(page);

    await reclaimPanel(page).getByRole('button', { name: 'System prune…' }).click();

    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/daemon is shared/i);
    // One checkbox per category (system-screen.md).
    for (const title of ['Stopped containers', 'Dangling images', 'Unused volumes', 'Unused networks', 'Build cache']) {
      await expect(dialog.getByRole('checkbox', { name: title })).toHaveCount(1);
    }
    // Non-empty categories come pre-selected: this spec's own stopped container makes that one
    // non-empty.
    await expect(dialog.getByRole('checkbox', { name: 'Stopped containers' })).toBeChecked();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    expect(pruneRequests).toEqual([]);
    expect(await containerExists(name)).toBe(true);
  } finally {
    await removeContainerQuietly(name);
  }
});

// system/specs/system-screen.md — "cancelling, or confirming with nothing selected, prunes nothing":
// an empty scope cannot even be confirmed
test('the system prune cannot be confirmed once every category has been unselected', async ({ page }) => {
  const name = await createStoppedContainer('empty-scope');
  const pruneRequests = watchPruneRequests(page);
  try {
    await openSystemScreen(page);

    await reclaimPanel(page).getByRole('button', { name: 'System prune…' }).click();
    const dialog = confirmDialog(page);
    await expect(dialog).toBeVisible();

    for (const checkbox of await dialog.getByRole('checkbox').all()) {
      if (await checkbox.isChecked()) await checkbox.uncheck();
    }

    await expect(dialog.getByRole('button', { name: 'Prune selected' })).toBeDisabled();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(pruneRequests).toEqual([]);
    expect(await containerExists(name)).toBe(true);
  } finally {
    await removeContainerQuietly(name);
  }
});
