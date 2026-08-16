import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

async function createTestNetwork(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync('docker', ['network', 'create', ...ownershipArgs(name), ...extraArgs, name]);
}

async function removeNetworkQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['network', 'rm', '-f', name]).catch(() => undefined);
}

// A tiny, already-cached image whose entrypoint is overridden to `sleep` so the
// container starts instantly and needs no network pull or app init.
async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), ...extraArgs, '--entrypoint', 'sleep', 'alpine:3.20', '300']);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

// The list is the object list's comfortable variant: the row itself
// (`.ui-data-table__row`) and the attached-container chips
// (`.ui-data-table__row-content`) are siblings inside the same row card, not
// nested inside one another — so a locator that must see both is scoped to the
// card (`networks-panel.md`).
function networkRow(page: Page, name: string): Locator {
  return networksPanel(page).locator('.ui-data-table__row', { hasText: name }).first();
}

function networkCard(page: Page, name: string): Locator {
  return networksPanel(page)
    .locator('.ui-data-table__body > .ui-surface', { has: page.locator('.ui-data-table__row', { hasText: name }) })
    .first();
}

/** The value a row carries in the column the list names `header`. */
async function cellText(row: Locator, header: string): Promise<string> {
  return row.evaluate((element, columnHeader) => {
    const table = element.closest('.ui-data-table')!;
    const headers = Array.from(table.querySelectorAll('.ui-data-table__header-cell')).map((cell) => cell.textContent?.trim() ?? '');
    const index = headers.indexOf(columnHeader);
    if (index < 0) throw new Error(`the list carries no ${columnHeader} column — it names [${headers.join(', ')}]`);
    return element.querySelectorAll('.ui-data-table__cell')[index]?.textContent?.trim() ?? '';
  }, header);
}

// Scopes an action to the Networks panel specifically: the Volumes panel above
// it on the same screen carries a create and a prune of its own.
function networksPanel(page: Page) {
  return page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Networks' }) });
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'volumes-networks');
  await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();
});

// plan-docker_management_app/REQ-72 — networks are listed with name, driver, scope, subnet and gateway
test('lists a network with its subnet/gateway and driver/scope', async ({ page }) => {
  const name = `vexel-e2e-list-${Date.now()}`;
  try {
    await createTestNetwork(name, ['--subnet', '10.199.30.0/24', '--gateway', '10.199.30.1']);

    const row = networkRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    expect(await cellText(row, 'NAME')).toContain('10.199.30.0/24 · gw 10.199.30.1');
    expect(await cellText(row, 'DRIVER')).toBe('bridge');
    expect(await cellText(row, 'SCOPE')).toBe('local');
  } finally {
    await removeNetworkQuietly(name);
  }
});

// plan-docker_management_app/REQ-72 — a network's attached containers are shown as chips, by name
test('shows an attached container\'s name as a chip on its network\'s row', async ({ page }) => {
  const networkName = `vexel-e2e-attached-${Date.now()}`;
  const containerName = `vexel-e2e-attached-consumer-${Date.now()}`;
  try {
    await createTestNetwork(networkName);
    await createSleepingContainer(containerName, ['--network', networkName]);

    const card = networkCard(page, networkName);
    await expect(card).toBeVisible({ timeout: 15_000 });
    const chips = card.locator('.ui-data-table__row-content');
    await expect(chips).toContainText(containerName, { timeout: 15_000 });
    await expect(chips.getByRole('button', { name: 'detach' })).toBeVisible();
  } finally {
    await removeContainerQuietly(containerName);
    await removeNetworkQuietly(networkName);
  }
});

// plan-docker_management_app/REQ-73 — a network can be created with a name, driver, subnet and gateway
test('creating a network through the dialog adds it to the list', async ({ page }) => {
  const name = `vexel-e2e-create-${Date.now()}`;
  try {
    await networksPanel(page).getByRole('button', { name: 'Create network…' }).click();
    const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Create network' }) });
    await dialog.getByRole('textbox', { name: 'Network name' }).fill(name);
    await dialog.getByRole('textbox', { name: 'Subnet' }).fill('10.199.31.0/24');
    await dialog.getByRole('textbox', { name: 'Gateway' }).fill('10.199.31.1');
    await dialog.getByRole('button', { name: 'Create' }).click();

    const row = networkRow(page, name);
    await expect(row).toBeVisible({ timeout: 10_000 });
    expect(await cellText(row, 'NAME')).toContain('10.199.31.0/24 · gw 10.199.31.1');
  } finally {
    await removeNetworkQuietly(name);
  }
});

// plan-docker_management_app/REQ-73, REQ-6 — a network's full inspect data is viewable, and removing it
// asks for confirmation naming it, performs nothing on cancel and applies once confirmed.
// plan-ui-coherence-optimisation/REQ-35 — remove is now a control of the row's own action cluster.
test('inspecting and removing a network asks for confirmation naming it, and applies on confirm', async ({ page }) => {
  const name = `vexel-e2e-remove-${Date.now()}`;
  try {
    await createTestNetwork(name);
    const row = networkRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // A real pointer on the row's own first cell: the action cluster sits at the
    // row's trailing edge and is not the gesture that reveals the detail.
    await row.locator('.ui-data-table__cell').first().click();
    // The panel of this list: the volumes panel above it on the same screen
    // reveals its own rows in a panel of the same kind.
    const detail = networksPanel(page).locator('.ui-detail-panel');
    await expect(detail).toBeVisible();
    await expect(detail.getByText('Driver', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Remove', exact: true }).click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(networkRow(page, name)).toBeVisible();

    await row.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(confirmHeading).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Remove' }).click();

    await expect(networkRow(page, name)).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await removeNetworkQuietly(name);
  }
});

// plan-docker_management_app/REQ-74 — a container can be attached to a network from its row, and the
// attachment list updates accordingly, with no confirmation required.
// plan-ui-coherence-optimisation/REQ-27, REQ-35 — attaching is a control of the row's action cluster,
// not the bare text `+ Attach` beside the chips.
test('attaching a container from the row\'s action cluster adds it as a chip, without confirmation', async ({ page }) => {
  const networkName = `vexel-e2e-attach-${Date.now()}`;
  const containerName = `vexel-e2e-attach-target-${Date.now()}`;
  try {
    await createTestNetwork(networkName);
    await createSleepingContainer(containerName);

    const card = networkCard(page, networkName);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).not.toContainText(containerName);
    await expect(card.getByText('+ Attach'), 'the bare-text attach affordance is still on the row (REQ-27)').toHaveCount(0);

    await networkRow(page, networkName).getByRole('button', { name: 'Attach…', exact: true }).click();
    const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Attach a container to ${networkName}` }) });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Container' }).fill(containerName);
    await dialog.getByRole('option', { name: containerName }).click();
    await dialog.getByRole('button', { name: 'Attach' }).click();

    await expect(dialog).toBeHidden();
    await expect(card.locator('.ui-data-table__row-content')).toContainText(containerName, { timeout: 15_000 });
  } finally {
    await removeContainerQuietly(containerName);
    await removeNetworkQuietly(networkName);
  }
});

// plan-docker_management_app/REQ-74 — a container can be detached from a network directly from its chip,
// and the attachment list updates accordingly, with no confirmation required
test("detaching a container from its chip's inline action removes it from the row, without confirmation", async ({ page }) => {
  const networkName = `vexel-e2e-detach-${Date.now()}`;
  const containerName = `vexel-e2e-detach-target-${Date.now()}`;
  try {
    await createTestNetwork(networkName);
    await createSleepingContainer(containerName, ['--network', networkName]);

    const card = networkCard(page, networkName);
    const chips = card.locator('.ui-data-table__row-content');
    await expect(chips).toContainText(containerName, { timeout: 15_000 });

    await chips.getByRole('button', { name: 'detach' }).click();

    await expect(chips).not.toContainText(containerName, { timeout: 10_000 });
    await expect(chips).toContainText('No attached containers');
  } finally {
    await removeContainerQuietly(containerName);
    await removeNetworkQuietly(networkName);
  }
});
