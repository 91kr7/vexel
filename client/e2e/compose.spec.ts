import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { CASE_LABEL, OWNER_LABEL, RUN_ID } from './support/fixtures.js';

const execFileAsync = promisify(execFile);
const BASE_IMAGE = 'alpine:3.20';

function projectName(caseName: string): string {
  return `vexel-e2e-compose-${caseName}-${RUN_ID}`;
}

/** One service block, labelled for ownership, `pull_policy: never` so the offline suite never hits the network. */
function serviceBlock(serviceName: string, caseName: string, command: string, extra = ''): string {
  return [
    `  ${serviceName}:`,
    `    image: ${BASE_IMAGE}`,
    '    pull_policy: never',
    `    command: ${command}`,
    '    labels:',
    `      - "${OWNER_LABEL}=${RUN_ID}"`,
    `      - "${CASE_LABEL}=${caseName}"`,
    extra,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

interface ComposeFixture {
  dir: string;
  name: string;
  filePaths: string[];
}

async function writeComposeFixture(caseName: string, files: { filename: string; yaml: string }[]): Promise<ComposeFixture> {
  const dir = await mkdtemp(join(tmpdir(), 'vexel-e2e-compose-'));
  const filePaths: string[] = [];
  for (const file of files) {
    const filePath = join(dir, file.filename);
    await writeFile(filePath, file.yaml, 'utf8');
    filePaths.push(filePath);
  }
  return { dir, name: projectName(caseName), filePaths };
}

async function bringUp(fixture: ComposeFixture): Promise<void> {
  const args = fixture.filePaths.flatMap((path) => ['-f', path]);
  await execFileAsync('docker', ['compose', ...args, '-p', fixture.name, 'up', '-d']);
}

async function createOnly(fixture: ComposeFixture): Promise<void> {
  const args = fixture.filePaths.flatMap((path) => ['-f', path]);
  await execFileAsync('docker', ['compose', ...args, '-p', fixture.name, 'create']);
}

/**
 * Removes every container and network of a project by its own `docker compose`
 * project label, so teardown never depends on the fixture's own compose file
 * still being intact or even present on disk.
 */
async function removeComposeProjectQuietly(fixture: ComposeFixture): Promise<void> {
  const containers = await execFileAsync('docker', [
    'ps',
    '-aq',
    '--filter',
    `label=com.docker.compose.project=${fixture.name}`,
  ]).catch(() => ({ stdout: '' }));
  const containerIds = containers.stdout.split('\n').filter((id) => id.length > 0);
  if (containerIds.length > 0) await execFileAsync('docker', ['rm', '-fv', ...containerIds]).catch(() => undefined);

  const networks = await execFileAsync('docker', [
    'network',
    'ls',
    '-q',
    '--filter',
    `label=com.docker.compose.project=${fixture.name}`,
  ]).catch(() => ({ stdout: '' }));
  const networkIds = networks.stdout.split('\n').filter((id) => id.length > 0);
  if (networkIds.length > 0) await execFileAsync('docker', ['network', 'rm', ...networkIds]).catch(() => undefined);

  await rm(fixture.dir, { recursive: true, force: true }).catch(() => undefined);
}

async function runningContainerCount(...filterLabels: string[]): Promise<number> {
  const filters = filterLabels.flatMap((label) => ['--filter', label]);
  const { stdout } = await execFileAsync('docker', ['ps', '-q', ...filters]).catch(() => ({ stdout: '' }));
  return stdout.split('\n').filter((id) => id.length > 0).length;
}

function projectGroup(page: Page, name: string) {
  return page.locator('.ui-grouped-rows-panel > .ui-surface', { has: page.locator('.ui-grouped-rows-panel__title', { hasText: name }) });
}

function editorCard(page: Page) {
  return page.locator('.ui-surface', { has: page.locator('.ui-code-editor') });
}

function logsCard(page: Page) {
  return page.locator('.ui-surface', { has: page.locator('.ui-log-stream') });
}

async function selectProject(page: Page, name: string): Promise<void> {
  const group = projectGroup(page, name);
  await expect(group).toBeVisible({ timeout: 15_000 });
  await group.locator('.ui-grouped-rows-panel__title').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Compose/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Compose' })).toBeVisible();
});

// plan-docker_management_app/REQ-75, plan-docker_management_app/REQ-116 — compose projects are
// discovered and listed with their project name, discovered compose file path and per-service
// state, and no path is ever typed by the operator anywhere on the screen
test('lists a running project with its discovered file path and services, with no path ever typed', async ({ page }) => {
  const caseName = 'list';
  const fixture = await writeComposeFixture(caseName, [
    { filename: 'docker-compose.yml', yaml: `services:\n${serviceBlock('web', caseName, '["sleep", "300"]')}\n${serviceBlock('worker', caseName, '["sleep", "300"]')}\n` },
  ]);
  try {
    await bringUp(fixture);

    await page.reload();
    const group = projectGroup(page, fixture.name);
    await expect(group).toBeVisible({ timeout: 15_000 });
    await expect(group).toContainText(fixture.filePaths[0]!);
    await expect(group.getByText('Up', { exact: true })).toBeVisible();
    await expect(group).toContainText('web');
    await expect(group).toContainText('worker');
    await expect(group).toContainText(BASE_IMAGE);

    // REQ-116 — the compose file path is discovered, never operator-typed: no
    // input field exists anywhere on the Compose screen to type one.
    await expect(page.locator('.ui-grid').locator('input')).toHaveCount(0);
  } finally {
    await removeComposeProjectQuietly(fixture);
  }
});

// plan-docker_management_app/REQ-77 — the compose file of a project is displayed, tabbed by file
// name when the project has several, and can be validated on demand
test('shows the compose file in a tabbed editor and validates it on demand', async ({ page }) => {
  const caseName = 'files';
  const base = `services:\n${serviceBlock('web', caseName, '["sleep", "300"]')}\n${serviceBlock('worker', caseName, '["sleep", "300"]')}\n`;
  const override = 'services:\n  web:\n    environment:\n      - EXTRA=1\n';
  const fixture = await writeComposeFixture(caseName, [
    { filename: 'docker-compose.yml', yaml: base },
    { filename: 'docker-compose.override.yml', yaml: override },
  ]);
  try {
    await bringUp(fixture);

    await page.reload();
    await selectProject(page, fixture.name);

    const card = editorCard(page);
    const tabs = card.getByRole('tab');
    await expect(tabs).toHaveCount(2);
    await expect(tabs.first()).toHaveText('docker-compose.yml');
    await expect(card.getByRole('textbox', { name: 'docker-compose.yml' })).toHaveValue(base);

    await tabs.nth(1).click();
    await expect(card.getByRole('textbox', { name: 'docker-compose.override.yml' })).toHaveValue(override);

    await card.getByRole('button', { name: 'Validate' }).click();
    const statusLine = card.locator('.ui-code-editor__status');
    await expect(statusLine).toBeVisible({ timeout: 10_000 });
    await expect(statusLine).toContainText(/valid/i);
    await expect(statusLine).toContainText('2 services');
  } finally {
    await removeComposeProjectQuietly(fixture);
  }
});

// plan-docker_management_app/REQ-77 — the compose file can be edited and saved back to its location
// on disk after an explicit confirmation
test('editing the compose file and confirming Save writes it back to disk', async ({ page }) => {
  const caseName = 'save';
  const yaml = `services:\n${serviceBlock('web', caseName, '["sleep", "300"]')}\n${serviceBlock('worker', caseName, '["sleep", "300"]')}\n`;
  const fixture = await writeComposeFixture(caseName, [{ filename: 'docker-compose.yml', yaml }]);
  try {
    await bringUp(fixture);

    await page.reload();
    await selectProject(page, fixture.name);

    const card = editorCard(page);
    const editorTextbox = card.getByRole('textbox', { name: 'docker-compose.yml' });
    await expect(editorTextbox).toHaveValue(yaml, { timeout: 10_000 });
    const updated = `${yaml}    hostname: e2e-marker\n`;
    await editorTextbox.fill(updated);

    await expect(card.getByText('Unsaved', { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Save' }).click();

    const confirmHeading = page.getByRole('heading', { name: 'Confirm: docker-compose.yml' });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await confirmDialog.getByRole('button', { name: 'Save' }).click();
    await expect(confirmDialog).toBeHidden();

    await expect.poll(() => readFile(fixture.filePaths[0]!, 'utf8'), { timeout: 10_000 }).toBe(updated);
    await expect(card.getByText('Unsaved', { exact: true })).toHaveCount(0);
  } finally {
    await removeComposeProjectQuietly(fixture);
  }
});

// plan-docker_management_app/REQ-76 — a stack can be brought up and brought down (confirmation
// required only for bringing it down), with the resulting state reflected in the list
test('bringing a stopped project up and back down asks for confirmation only on the way down', async ({ page }) => {
  const caseName = 'lifecycle';
  const fixture = await writeComposeFixture(caseName, [
    { filename: 'docker-compose.yml', yaml: `services:\n${serviceBlock('web', caseName, '["sleep", "300"]')}\n${serviceBlock('worker', caseName, '["sleep", "300"]')}\n` },
  ]);
  try {
    await createOnly(fixture);

    await page.reload();
    const group = projectGroup(page, fixture.name);
    await expect(group).toBeVisible({ timeout: 15_000 });
    await expect(group.getByRole('button', { name: 'Up' })).toBeVisible();

    await group.getByRole('button', { name: 'Up' }).click();
    await expect(group.getByRole('button', { name: 'Down' })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => runningContainerCount(`label=com.docker.compose.project=${fixture.name}`), { timeout: 15_000 }).toBe(2);

    await group.getByRole('button', { name: 'Down' }).click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${fixture.name}` });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmDialog).toBeHidden();
    // Cancelling performs nothing: the stack stays up.
    await expect.poll(() => runningContainerCount(`label=com.docker.compose.project=${fixture.name}`)).toBe(2);

    await group.getByRole('button', { name: 'Down' }).click();
    await expect(confirmHeading).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Down' }).click();
    await expect.poll(() => runningContainerCount(`label=com.docker.compose.project=${fixture.name}`), { timeout: 15_000 }).toBe(0);
  } finally {
    await removeComposeProjectQuietly(fixture);
  }
});

// plan-docker_management_app/REQ-76 — a service can be scaled to a chosen number of replicas
// through its replicas stepper, with the resulting state reflected in the list
test("scaling a service's replicas through its stepper changes its running container count", async ({ page }) => {
  const caseName = 'scale';
  const fixture = await writeComposeFixture(caseName, [
    { filename: 'docker-compose.yml', yaml: `services:\n${serviceBlock('web', caseName, '["sleep", "300"]')}\n${serviceBlock('sidekick', caseName, '["sleep", "300"]')}\n` },
  ]);
  try {
    await bringUp(fixture);

    await page.reload();
    const group = projectGroup(page, fixture.name);
    await expect(group).toBeVisible({ timeout: 15_000 });
    await expect(group).toContainText('web');

    await group.getByRole('button', { name: 'Increase web replicas' }).click();

    await expect
      .poll(() => runningContainerCount(`label=com.docker.compose.service=web`, `label=com.docker.compose.project=${fixture.name}`), { timeout: 15_000 })
      .toBe(2);
  } finally {
    await removeComposeProjectQuietly(fixture);
  }
});

// plan-docker_management_app/REQ-78 — the aggregated live logs of every service of a stack are
// shown, each line labelled with the service it comes from
test('shows aggregated logs labelled with the service each line comes from', async ({ page }) => {
  const caseName = 'logs';
  const fixture = await writeComposeFixture(caseName, [
    {
      filename: 'docker-compose.yml',
      yaml: [
        'services:',
        serviceBlock('alpha', caseName, '["sh", "-c", "for i in $(seq 1 60); do echo alpha-tick-$i; sleep 0.2; done"]'),
        serviceBlock('beta', caseName, '["sh", "-c", "for i in $(seq 1 60); do echo beta-tick-$i; sleep 0.2; done"]'),
        '',
      ].join('\n'),
    },
  ]);
  try {
    await bringUp(fixture);

    await page.reload();
    await selectProject(page, fixture.name);

    const sources = logsCard(page).locator('.ui-log-stream__source');
    await expect.poll(async () => {
      const texts = await sources.allTextContents();
      return new Set(texts);
    }, { timeout: 20_000 }).toEqual(new Set(['alpha', 'beta']));
  } finally {
    await removeComposeProjectQuietly(fixture);
  }
});
