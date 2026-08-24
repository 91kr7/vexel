import { expect, test, type Locator, type Page } from '../support/test.js';
import { CASE_LABEL, OWNER_LABEL, RUN_ID, openApp } from '../support/fixtures.js';
import { clickAtItsCentre } from '../support/settled.js';
import { execFileAsync } from '../../../server/test/support/docker-cli.js';

// The Swarm screen driven against a real cluster (REQ-79 to REQ-84): the state
// bar of an active swarm, the nodes panel, the join-token dialog and a secret
// created through the interface.
//
// **What this file does to the host, and how it puts it back.** Swarm mode is a
// property of the whole daemon, which no label can scope — hence `exclusive/`.
// It runs only against a daemon it can prove is *outside* a swarm, and then it
// is the one that put it in one: `beforeAll` runs `docker swarm init`, and
// `afterAll` runs `docker swarm leave --force` whether the run passed or failed,
// removing the objects it created first and the `docker_gwbridge` network swarm
// mode leaves behind, when that network was not already there. On a daemon
// already in a swarm — the operator's own cluster — every test here skips: this
// file will not read, rotate or remove anything of theirs.

const SECRET_NAME = `vexel-e2e-secret-${RUN_ID}`;
const SECRET_VALUE = 'e2e-secret-value-never-displayed-back';

let ownSwarm = false;
let manager = false;
let gwBridgeExisted = false;

async function daemonSwarmState(): Promise<{ localNodeState: string; manager: boolean }> {
  const { stdout } = await execFileAsync('docker', ['info', '--format', '{{.Swarm.LocalNodeState}} {{.Swarm.ControlAvailable}}']);
  const [localNodeState = 'inactive', controlAvailable = 'false'] = stdout.trim().split(' ');
  return { localNodeState, manager: controlAvailable === 'true' };
}

function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

/**
 * One inventory of the screen, by the section header titling it.
 *
 * Named by **what it holds** rather than by the surface it used to be: a
 * converted panel's section header and toolbar sit above the one unpadded card
 * holding its list (`swarm-nodes-panel.md`, `swarm-secrets-panel.md`, and
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`),
 * so a card can no longer be found by the heading it used to hold. The panel is
 * the innermost region carrying both the heading and the list — the same region
 * on an inventory still drawn the old way, its card.
 */
function panel(page: Page, title: string) {
  return screenContent(page)
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: title, exact: true }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

/**
 * The row an object is listed on, since batch 12 put these inventories on the
 * object list (`plan-ui-coherence-optimisation/REQ-55`).
 */
function row(card: Locator, name: string): Locator {
  return card.locator('.ui-data-table__row').filter({ hasText: name });
}

/**
 * A real pointer at the visible control's own coordinates, never
 * `element.click()`; a **row** is clicked on its first cell, because below the
 * desktop breakpoint the row is wider than the box it is read in (CLAUDE.md,
 * "What a check drives, and what it measures").
 */
async function clickAtItsOwnCentre(page: Page, target: Locator): Promise<void> {
  // The coordinates are read once the control has stopped moving: a click aimed at a box taken from
  // a layout in motion lands where the control **was** (`support/settled.ts`).
  await clickAtItsCentre(page, target, 'the control');
}

test.beforeAll(async () => {
  const { stdout: networks } = await execFileAsync('docker', ['network', 'ls', '--format', '{{.Name}}']);
  gwBridgeExisted = networks.split('\n').some((name) => name.trim() === 'docker_gwbridge');

  const initial = await daemonSwarmState();
  if (initial.localNodeState === 'inactive') {
    await execFileAsync('docker', ['swarm', 'init', '--advertise-addr', '127.0.0.1']);
    ownSwarm = true;
  }
  manager = (await daemonSwarmState()).manager;
});

test.afterAll(async () => {
  await execFileAsync('docker', ['secret', 'rm', SECRET_NAME]).catch(() => undefined);
  if (ownSwarm) await execFileAsync('docker', ['swarm', 'leave', '--force']).catch(() => undefined);
  if (!gwBridgeExisted) await execFileAsync('docker', ['network', 'rm', 'docker_gwbridge']).catch(() => undefined);
});

test.beforeEach(async ({ page }) => {
  test.skip(!manager, 'this daemon is not a swarm manager, and this file will not make the operator’s one into a fixture');
  await openApp(page, 'swarm');
  await expect(page.getByRole('heading', { level: 1, name: 'Swarm' })).toBeVisible({ timeout: 20_000 });
});

// plan-docker_management_app/REQ-79 — the swarm state is shown with cluster id, node count and raft
// health. plan-docker_management_app/REQ-81 — nodes are listed with hostname, role, availability and
// status.
test('shows an active swarm with its cluster facts, and the node the daemon is', async ({ page }) => {
  await expect(screenContent(page).getByText('Swarm active')).toBeVisible({ timeout: 20_000 });
  await expect(screenContent(page).getByText(/cluster id/i)).toBeVisible();
  await expect(screenContent(page).getByText(/raft/i)).toBeVisible();

  // The hostname is the machine's, so it is asked of Docker rather than written down.
  const { stdout } = await execFileAsync('docker', ['node', 'inspect', 'self', '--format', '{{.Description.Hostname}}']);
  const nodes = panel(page, 'Nodes');
  await expect(nodes).toContainText(stdout.trim(), { timeout: 20_000 });
  await expect(nodes).toContainText('this node');
  await expect(nodes.getByText('leader', { exact: true })).toBeVisible();
  await expect(nodes.getByText('active', { exact: true })).toBeVisible();
});

// plan-docker_management_app/REQ-80 — the join tokens can be displayed. swarm-screen.md — "each
// hidden until asked for and each rotatable on the spot; the tokens are read when the dialog opens
// and dropped when it closes"; the clause naming a copy affordance went with the affordance itself
// on 2026-08-14 (`plan-docker_management_app-remove_copy_controls`/REQ-21). Nothing is rotated here:
// a rotation invalidates the token for everyone, and the browser has nothing to add to what the
// server suite already proves.
test('shows the join tokens only after an explicit reveal, and drops them when the dialog closes', async ({ page }) => {
  await screenContent(page).getByRole('button', { name: 'Join tokens' }).click();
  const dialog = page.locator('.ui-modal');
  await expect(dialog).toBeVisible();

  // Read when the dialog opens, and shown by nothing until asked for.
  await expect(dialog.getByRole('button', { name: 'Show' }).first()).toBeEnabled({ timeout: 20_000 });
  expect(await page.content()).not.toContain('SWMTKN-');

  await dialog.getByRole('button', { name: 'Show' }).first().click();
  await expect(dialog.getByText(/SWMTKN-/).first()).toBeVisible();

  await dialog.getByRole('button', { name: /close|cancel|done/i }).first().click();
  await expect(dialog).toHaveCount(0);
  expect(await page.content()).not.toContain('SWMTKN-');
});

// plan-docker_management_app/REQ-84 — secrets are created and inspected as metadata, never revealing
// a secret's value. Probed the way an operator's browser would see it: the value is typed once and
// then hunted for in the page and in every answer the browser received.
test('creates a secret whose value is displayed by nothing, then removes it', async ({ page }) => {
  const bodies: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/swarm')) {
      void response
        .text()
        .then((text) => bodies.push(text))
        .catch(() => undefined);
    }
  });

  try {
    const secrets = panel(page, 'Secrets');
    await secrets.getByRole('button', { name: 'New secret' }).click();
    const dialog = page.locator('.ui-modal');
    await dialog.getByLabel(/secret name/i).fill(SECRET_NAME);
    const value = dialog.getByLabel(/value/i);
    await expect(value).toHaveAttribute('type', 'password');
    await value.fill(SECRET_VALUE);

    // Every fixture carries the ownership labels (CLAUDE.md), and the creation
    // form is where a swarm object gets them: typed here rather than added
    // behind the application's back.
    // The label editor names its rows after the field they belong to, so the
    // dialog holds no two controls with the same accessible name.
    await dialog.getByRole('button', { name: 'Add label' }).click();
    await dialog.getByLabel('Labels Key 1').fill(OWNER_LABEL);
    await dialog.getByLabel('Labels Value 1').fill(RUN_ID);
    await dialog.getByRole('button', { name: 'Add label' }).click();
    await dialog.getByLabel('Labels Key 2').fill(CASE_LABEL);
    await dialog.getByLabel('Labels Value 2').fill('swarm-cluster-secret');

    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // It is listed, by name and age alone...
    await expect(secrets.getByText(SECRET_NAME)).toBeVisible({ timeout: 20_000 });

    // ...and it is recognisable as this run's own, which is what makes it
    // sweepable if the browser dies before the cleanup below (REQ-84's labels
    // invariant in swarm-endpoints.md, and CLAUDE.md's ownership rule).
    const { stdout: owned } = await execFileAsync('docker', ['secret', 'ls', '--filter', `label=${OWNER_LABEL}=${RUN_ID}`, '--format', '{{.Name}}']);
    expect(owned.split('\n').map((name) => name.trim())).toContain(SECRET_NAME);
    // ...and opening it — on the row's first cell, with a real pointer — reveals
    // its metadata in the detail panel, saying the value cannot be read back.
    const secretRow = row(secrets, SECRET_NAME);
    await clickAtItsOwnCentre(page, secretRow.locator('.ui-data-table__cell').first());
    await expect(secrets.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
    await expect(secrets.locator('.ui-detail-panel').getByText(/never displayed|cannot be read|not read/i)).toBeVisible();

    // The value is nowhere: not on the page, not in any answer the browser got.
    expect(await page.content()).not.toContain(SECRET_VALUE);
    await expect(page.getByRole('button', { name: /show|reveal/i })).toHaveCount(0);
    for (const body of bodies) {
      expect(body).not.toContain(SECRET_VALUE);
    }

    // ...and it is removed through the interface, from its own row's action
    // cluster, confirmation and all.
    await clickAtItsOwnCentre(page, secretRow.getByRole('button', { name: 'Remove' }));
    const confirmation = page.locator('.ui-modal');
    await expect(confirmation).toContainText(SECRET_NAME);
    await confirmation.getByRole('button', { name: /remove|confirm/i }).click();
    await expect(secrets.getByText(SECRET_NAME)).toHaveCount(0, { timeout: 20_000 });
  } finally {
    await execFileAsync('docker', ['secret', 'rm', SECRET_NAME]).catch(() => undefined);
  }
});
