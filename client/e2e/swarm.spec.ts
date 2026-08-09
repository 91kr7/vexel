import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './support/fixtures.js';

// The Swarm screen in a real browser, against the operator's own daemon
// (REQ-79 to REQ-84).
//
// Nothing here initialises, joins or leaves a swarm, and nothing is created:
// this file drives the path that is available whatever the daemon is, and — on
// the daemon this project is developed against, which is outside a swarm — that
// path *is* the requirement. A screen that meets no cluster must say what the
// daemon is, offer the way in, and state in every panel why it has nothing to
// list, instead of showing four empty panels or an error. What needs a cluster
// is driven in `e2e/exclusive/swarm-cluster.spec.ts`, which puts the daemon
// back the way it found it.
const execFileAsync = promisify(execFile);

const { stdout: swarmInfo } = await execFileAsync('docker', ['info', '--format', '{{.Swarm.LocalNodeState}} {{.Swarm.ControlAvailable}}']);
const [LOCAL_NODE_STATE = 'inactive'] = swarmInfo.trim().split(' ');
const IN_SWARM = LOCAL_NODE_STATE !== 'inactive';

function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

function panel(page: Page, title: string) {
  return screenContent(page).locator('.ui-surface').filter({ has: page.getByRole('heading', { level: 2, name: title }) });
}

const PANELS = ['Nodes', 'Services & tasks', 'Secrets', 'Configs & stacks'];

// The last active screen survives by design (REQ-115), so the screen this suite
// needs is pinned rather than inherited from whichever spec ran before.
test.beforeEach(async ({ page }) => {
  await openApp(page, 'swarm');
  await expect(page.getByRole('heading', { level: 1, name: 'Swarm' })).toBeVisible({ timeout: 20_000 });
});

// plan-docker_management_app/REQ-79 — the swarm state of the active daemon is shown, and a swarm can
// be initialised or joined. swarm-screen.md — "outside a swarm: that this daemon is not part of one"
// and the two ways in.
test('states that the daemon is outside a swarm and offers the way in', async ({ page }) => {
  test.skip(IN_SWARM, 'this daemon is in a swarm; the way in is only offered to one that is not');

  await expect(screenContent(page).getByText('Swarm inactive')).toBeVisible({ timeout: 20_000 });
  await expect(screenContent(page).getByRole('button', { name: 'Initialise swarm' })).toBeVisible();
  await expect(screenContent(page).getByRole('button', { name: 'Join swarm' })).toBeVisible();
  // The token action is offered on a manager only, and there is nothing to leave.
  await expect(screenContent(page).getByRole('button', { name: 'Join tokens' })).toHaveCount(0);
  await expect(screenContent(page).getByRole('button', { name: 'Leave swarm' })).toHaveCount(0);
});

// plan-docker_management_app/REQ-81 to REQ-84 — nodes, services, stacks, secrets and configs.
// swarm-screen.md — "The screen never shows an empty panel or an unhandled error when the daemon is
// not a swarm manager ... every panel carries the reason it has nothing to list."
test('shows the four panels, each stating the reason it has nothing to list', async ({ page }) => {
  for (const title of PANELS) {
    await expect(panel(page, title)).toBeVisible({ timeout: 20_000 });
  }
  test.skip(IN_SWARM, 'the stated reason belongs to a daemon that is not a manager');

  for (const title of PANELS) {
    // The reason names the situation and what to do about it, and no panel
    // reports the situation as a failure.
    await expect(panel(page, title)).toContainText(/not part of a swarm/i);
    await expect(panel(page, title)).toContainText(/initialise|join/i);
  }
  await expect(screenContent(page).getByText(/^Error|failed|unexpected/i)).toHaveCount(0);
});

// plan-docker_management_app/REQ-79, REQ-80 — a swarm is joined using a join token.
// swarm-screen.md — "the join token (entered masked, never displayed back)". Nothing is submitted:
// this daemon's membership of a swarm is not this suite's to change.
test('asks for the join token in a masked field with no reveal, and joins nothing', async ({ page }) => {
  test.skip(IN_SWARM, 'the join form is reached from a daemon that is outside a swarm');

  await screenContent(page).getByRole('button', { name: 'Join swarm' }).click();
  const dialog = page.locator('.ui-modal');
  await expect(dialog).toBeVisible();

  await expect(dialog.getByLabel(/manager address/i)).toBeVisible();
  const token = dialog.getByLabel(/token/i);
  await expect(token).toBeVisible();
  await expect(token).toHaveAttribute('type', 'password');
  await expect(dialog.getByRole('button', { name: /show|reveal/i })).toHaveCount(0);

  // What is typed is dropped with the form, and is nowhere in the page after it closes.
  await token.fill('SWMTKN-1-e2e-typed-never-submitted');
  await dialog.getByRole('button', { name: /cancel/i }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.content()).not.toContain('SWMTKN-1-e2e-typed-never-submitted');
});

// Departure Three (2026-08-07), plan-docker_management_app/REQ-83 — "This screen observes and
// removes stacks; it does not deploy them." swarm-screen.md — "The screen offers no deploy
// affordance, no compose-file path input and no compose editor."
test('offers nothing anywhere that would deploy a stack', async ({ page }) => {
  const content = screenContent(page);
  await expect(content.getByRole('heading', { level: 2, name: 'Configs & stacks' })).toBeVisible({ timeout: 20_000 });

  await expect(content.getByRole('button', { name: /deploy/i })).toHaveCount(0);
  await expect(content.getByRole('button', { name: /compose/i })).toHaveCount(0);
  await expect(content.getByRole('button', { name: /upload/i })).toHaveCount(0);
  await expect(content.locator('input[type="file"]')).toHaveCount(0);
  // No compose editor and no path to type one in.
  await expect(content.locator('textarea')).toHaveCount(0);
  await expect(content.getByText(/compose|\.ya?ml|stack file/i)).toHaveCount(0);
});
