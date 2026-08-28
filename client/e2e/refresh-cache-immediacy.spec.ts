import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page, type Response } from './support/test.js';
import { CASE_LABEL, OWNER_LABEL, RUN_ID, openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

/**
 * What the operator's own action costs them, on the four screens the batch acts from
 * (`plan-docker_management_app-refresh_cache/REQ-13`). The lists are answered from values the server
 * holds and refreshes on periods of 20 s to 30 s, so a write route that succeeds without marking its
 * kind due leaves the row describing the old state until the next period — the one regression this
 * plan must not ship.
 *
 * Every case therefore measures **from the moment the write has finished** (the response's body
 * complete, not merely its headers) to the moment the screen shows the result, and refuses anything
 * a period-length wait could explain. The client polls its lists every 3 s, so two polls is the
 * budget: a screen that had to wait for the server's own timer would blow it by an order of
 * magnitude.
 */
const VISIBLE_WITHIN_MS = 6_000;

const BASE_IMAGE = 'alpine:3.20';

async function createSleepingContainer(name: string): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sleep', BASE_IMAGE, '300']);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/**
 * Waits for the write the gesture triggers to be **finished**, so the measurement starts at the
 * server's answer and never at its headers: the compose lifecycle endpoints answer with a stream
 * whose result arrives last.
 */
async function writeFinished(page: Page, matches: (response: Response) => boolean, act: () => Promise<void>): Promise<void> {
  const pending = page.waitForResponse(matches, { timeout: 60_000 });
  await act();
  const response = await pending;
  expect(response.status(), `the write answered ${response.status()}`).toBeLessThan(400);
  // A 204 carries no body at all, so its headers are the whole answer; anything
  // else is read to the end before the clock starts.
  if (response.status() !== 204) await response.body();
}

/** The elapsed time an expectation took to hold, so a failure reports the wait rather than only its verdict. */
async function timeUntil(what: string, hold: (budgetMs: number) => Promise<void>): Promise<number> {
  const startedAt = Date.now();
  await hold(VISIBLE_WITHIN_MS);
  const elapsed = Date.now() - startedAt;
  expect(elapsed, `${what} took ${elapsed} ms after the write finished`).toBeLessThan(VISIBLE_WITHIN_MS);
  return elapsed;
}

function containerCard(page: Page, name: string): Locator {
  return page.locator('.ui-frame__content .ui-grid--cards > .ui-surface').filter({ hasText: name });
}

// The volumes and the networks panels share one screen, so every action is scoped to its own panel:
// each carries a create and a prune of its own.
function panelOf(page: Page, heading: string): Locator {
  return page
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: heading }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

function rowIn(panel: Locator, name: string): Locator {
  return panel.locator('.ui-data-table__row', { hasText: name });
}

// REQ-13 — the operator stops a container from its screen and the card states it at once.
test('stopping a container from its card updates the card without a period-length wait', async ({ page }) => {
  const name = `vexel-e2e-refresh-stop-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    await openApp(page, 'containers');
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();

    const card = containerCard(page, name);
    await expect(card).toBeVisible({ timeout: 20_000 });
    const stop = card.getByRole('button', { name: 'Stop', exact: true });
    await expect(stop).toBeVisible();

    await writeFinished(
      page,
      (response) => response.request().method() === 'POST' && /\/api\/containers\/[^/]+\/stop$/.test(new URL(response.url()).pathname),
      // A real pointer at the visible control's own coordinates.
      async () => await stop.click(),
    );

    const elapsed = await timeUntil('the card reporting the container stopped', async (budgetMs) => {
      await expect(card.getByRole('button', { name: 'Start', exact: true })).toBeVisible({ timeout: budgetMs });
      await expect(card.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
    });
    console.log(`[REQ-13] container stop visible after ${elapsed} ms`);
  } finally {
    await removeContainerQuietly(name);
  }
});

// REQ-13 — the operator removes a volume from its row and the list states it at once.
test('removing a volume from its row updates the list without a period-length wait', async ({ page }) => {
  const name = `vexel-e2e-refresh-volume-${Date.now()}`;
  try {
    await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(name), name]);
    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();

    const panel = panelOf(page, 'Volumes');
    const row = rowIn(panel, name);
    await expect(row).toBeVisible({ timeout: 20_000 });

    await row.getByRole('button', { name: 'Remove', exact: true }).click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
    await expect(confirmHeading).toBeVisible();
    const dialog = page.locator('.ui-modal').filter({ has: confirmHeading });

    await writeFinished(
      page,
      (response) => response.request().method() === 'DELETE' && new URL(response.url()).pathname === `/api/volumes/${name}`,
      async () => await dialog.getByRole('button', { name: 'Remove' }).click(),
    );

    const elapsed = await timeUntil('the volume leaving the list', async (budgetMs) => {
      await expect(rowIn(panel, name)).toHaveCount(0, { timeout: budgetMs });
    });
    console.log(`[REQ-13] volume removal visible after ${elapsed} ms`);
  } finally {
    await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
  }
});

// REQ-13 — the operator removes a network from its row and the list states it at once.
test('removing a network from its row updates the list without a period-length wait', async ({ page }) => {
  const name = `vexel-e2e-refresh-network-${Date.now()}`;
  try {
    await execFileAsync('docker', ['network', 'create', ...ownershipArgs(name), name]);
    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();

    const panel = panelOf(page, 'Networks');
    const row = rowIn(panel, name);
    await expect(row).toBeVisible({ timeout: 20_000 });

    await row.getByRole('button', { name: 'Remove', exact: true }).click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
    await expect(confirmHeading).toBeVisible();
    const dialog = page.locator('.ui-modal').filter({ has: confirmHeading });

    await writeFinished(
      page,
      (response) => response.request().method() === 'DELETE' && new URL(response.url()).pathname.startsWith('/api/networks/'),
      async () => await dialog.getByRole('button', { name: 'Remove' }).click(),
    );

    const elapsed = await timeUntil('the network leaving the list', async (budgetMs) => {
      await expect(rowIn(panel, name)).toHaveCount(0, { timeout: budgetMs });
    });
    console.log(`[REQ-13] network removal visible after ${elapsed} ms`);
  } finally {
    await execFileAsync('docker', ['network', 'rm', name]).catch(() => undefined);
  }
});

// REQ-13 — the operator brings a compose project up from its row and the list states it at once.
test('bringing a compose project up from its row updates the row without a period-length wait', async ({ page }) => {
  const caseName = 'refresh-up';
  const projectName = `vexel-e2e-compose-${caseName}-${RUN_ID}`;
  const dir = await mkdtemp(join(tmpdir(), 'vexel-e2e-refresh-compose-'));
  const filePath = join(dir, 'docker-compose.yml');
  try {
    await writeFile(
      filePath,
      [
        'services:',
        '  web:',
        `    image: ${BASE_IMAGE}`,
        '    pull_policy: never',
        '    command: ["sleep", "300"]',
        '    labels:',
        `      - "${OWNER_LABEL}=${RUN_ID}"`,
        `      - "${CASE_LABEL}=${caseName}"`,
        '',
      ].join('\n'),
      'utf8',
    );
    // Registered without being started, so the row offers `Up` and the lifecycle
    // endpoint can resolve the project's config file.
    await execFileAsync('docker', ['compose', '-f', filePath, '-p', projectName, 'create']);

    await openApp(page, 'compose');
    await expect(page.getByRole('heading', { level: 1, name: 'Compose' })).toBeVisible();

    const row = page
      .locator('.ui-frame__content .ui-data-table__body')
      .first()
      .locator(':scope > .ui-data-table__row')
      .filter({ hasText: projectName });
    await expect(row).toBeVisible({ timeout: 20_000 });
    const up = row.getByRole('button', { name: 'Up' });
    await expect(up).toBeVisible();

    await writeFinished(
      page,
      (response) => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/compose/projects/${projectName}/up`,
      async () => await up.click(),
    );

    const elapsed = await timeUntil('the project row reporting the stack up', async (budgetMs) => {
      await expect(row.getByRole('button', { name: 'Down' })).toBeVisible({ timeout: budgetMs });
    });
    console.log(`[REQ-13] compose up visible after ${elapsed} ms`);
  } finally {
    const { stdout } = await execFileAsync('docker', ['ps', '-aq', '--filter', `label=com.docker.compose.project=${projectName}`]).catch(() => ({ stdout: '' }));
    const ids = stdout.split('\n').filter((id) => id.length > 0);
    if (ids.length > 0) await execFileAsync('docker', ['rm', '-fv', ...ids]).catch(() => undefined);
    const networks = await execFileAsync('docker', ['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${projectName}`]).catch(() => ({ stdout: '' }));
    const networkIds = networks.stdout.split('\n').filter((id) => id.length > 0);
    if (networkIds.length > 0) await execFileAsync('docker', ['network', 'rm', ...networkIds]).catch(() => undefined);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});
