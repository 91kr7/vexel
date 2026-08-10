import { expect, test, type Page } from '../support/test.js';
import { openApp, ownershipArgs } from '../support/fixtures.js';
import { execFileAsync } from '../../../server/test/support/docker-cli.js';

const RUN_ID = `${process.pid}-${Date.now()}`;

// The only spec that lets the raw console actually execute a destructive command. It is scoped as
// tightly as such a thing can be: the command names a container this spec created, labelled as its
// own, and the container is removed in a `finally` whether the run passed or not. Nothing global —
// no prune, no unscoped removal — is ever typed here. It lives in the exclusive project because
// what it exercises is the destructive half of the console's contract (REQ-112).
test.describe.configure({ mode: 'serial' });

const BASE_IMAGE = 'alpine:3.20';

function fixtureName(caseName: string): string {
  return `vexel-e2e-console-${caseName}-${RUN_ID}`;
}

async function createSleepingContainer(caseName: string): Promise<string> {
  const name = fixtureName(caseName);
  await execFileAsync('docker', [
    'run', '-d', '--name', name,
    ...ownershipArgs(caseName),
    '--entrypoint', 'sleep', BASE_IMAGE, '300',
  ]);
  return name;
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

async function containerExists(name: string): Promise<boolean> {
  const { stdout } = await execFileAsync('docker', ['ps', '-aq', '--filter', `name=^${name}$`]).catch(() => ({ stdout: '' }));
  return stdout.trim().length > 0;
}

function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

// plan-docker_management_app/REQ-112 — a destructive entry goes through the same explicit
// confirmation as the rest of the application, naming the command about to be executed;
// raw-console-screen.md — "A confirmed command runs exactly as it was typed"
test('a confirmed destructive entry runs exactly as typed, and removes only what it named', async ({ page }) => {
  let name = '';
  let bystander = '';
  try {
    name = await createSleepingContainer('destructive-target');
    bystander = await createSleepingContainer('destructive-bystander');
    const command = `docker rm -f ${name}`;

    await openApp(page, 'raw-console');
    await expect(screenContent(page).getByRole('heading', { name: 'Raw command & API console' })).toBeVisible();

    const prompt = page.getByLabel('Console prompt');
    await prompt.fill(command);
    await prompt.press('Enter');

    // The confirmation names the exact command, before anything runs.
    const dialog = page.locator('.ui-modal');
    await expect(page.getByRole('heading', { name: `Confirm: ${command}` })).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toContainText(/forc|remov/i);
    expect(await containerExists(name)).toBe(true);

    await dialog.getByRole('button', { name: 'Run' }).click();

    const entry = page.locator('.ui-console-surface__entry', {
      has: page.locator('.ui-console-surface__command', { hasText: command }),
    });
    await expect(entry).toContainText('exit 0', { timeout: 30_000 });

    // What it named is gone, and nothing else is.
    expect(await containerExists(name)).toBe(false);
    expect(await containerExists(bystander)).toBe(true);
  } finally {
    if (name) await removeContainerQuietly(name);
    if (bystander) await removeContainerQuietly(bystander);
  }
});
