import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

async function createNamedVolume(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(name), name]);
}

async function removeVolumeQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
}

// A tiny, already-cached image whose entrypoint is overridden to `sleep` so the
// container starts instantly and needs no network pull or app init.
async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), ...extraArgs, '--entrypoint', 'sleep', 'alpine:3.20', '300']);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

// The list is the object list's comfortable variant, so a volume is a row of it
// (`volumes-panel.md`) and its values sit in named columns rather than in one
// concatenated subtitle line.
function volumeRow(page: Page, name: string) {
  return volumesPanel(page).locator('.ui-data-table__row', { hasText: name });
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

// The volumes panel only. Its actions must be scoped to it: the networks panel
// under it on the same screen carries a create and a prune of its own.
function volumesPanel(page: Page) {
  return page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Volumes' }) });
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'volumes-networks');
  await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();
});

// plan-docker_management_app/REQ-70 — volumes are listed with name, driver, mountpoint, size and the
// containers mounting them, with unattached volumes identifiable
test('lists a volume with its driver and mountpoint, identifiable as unattached', async ({ page }) => {
  const name = `vexel-e2e-list-${Date.now()}`;
  try {
    await createNamedVolume(name);

    const row = volumeRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    expect(await cellText(row, 'DRIVER')).toBe('local');
    expect(await cellText(row, 'MOUNTED BY')).toContain('nothing');
    expect(await cellText(row, 'NAME')).toContain('/volumes/');
  } finally {
    await removeVolumeQuietly(name);
  }
});

// plan-docker_management_app/REQ-70 — a volume mounted by a container names that container instead of
// reporting it as unattached
test('shows the mounting container\'s name once a container mounts the volume', async ({ page }) => {
  const volumeName = `vexel-e2e-mounted-${Date.now()}`;
  const containerName = `vexel-e2e-mounted-consumer-${Date.now()}`;
  try {
    await createNamedVolume(volumeName);
    await createSleepingContainer(containerName, ['-v', `${volumeName}:/data`]);

    const row = volumeRow(page, volumeName);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(containerName, { timeout: 15_000 });
    expect(await cellText(row, 'MOUNTED BY')).toContain(containerName);
  } finally {
    await removeContainerQuietly(containerName);
    await removeVolumeQuietly(volumeName);
  }
});

// plan-docker_management_app/REQ-71 — a volume can be created with a name and labels
test('creating a volume through the dialog adds it to the list', async ({ page }) => {
  const name = `vexel-e2e-create-${Date.now()}`;
  try {
    await volumesPanel(page).getByRole('button', { name: 'Create volume…' }).click();
    const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Create volume' }) });
    await dialog.getByRole('textbox', { name: 'Volume name' }).fill(name);
    await dialog.getByRole('button', { name: 'Add label' }).click();
    await dialog.getByRole('textbox', { name: 'Labels Key 1' }).fill('team');
    await dialog.getByRole('textbox', { name: 'Labels Value 1' }).fill('vexel');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(volumeRow(page, name)).toBeVisible({ timeout: 10_000 });
  } finally {
    await removeVolumeQuietly(name);
  }
});

// plan-docker_management_app/REQ-71, REQ-6 — a volume's full inspect data is viewable, and removing it
// asks for confirmation naming it, performs nothing on cancel and applies once confirmed.
// plan-ui-coherence-optimisation/REQ-35 — remove is now a control of the row's own action cluster.
test('inspecting and removing a volume asks for confirmation naming it, and applies on confirm', async ({ page }) => {
  const name = `vexel-e2e-remove-${Date.now()}`;
  try {
    await createNamedVolume(name);
    const row = volumeRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // A real pointer on the row's own first cell: the action cluster sits at the
    // row's trailing edge and is not the gesture that reveals the detail.
    await row.locator('.ui-data-table__cell').first().click();
    // The panel of this list: the networks panel under it on the same screen
    // reveals its own rows in a panel of the same kind.
    const detail = volumesPanel(page).locator('.ui-detail-panel');
    await expect(detail).toBeVisible();
    await expect(detail.getByText('Mountpoint', { exact: true })).toBeVisible();

    await row.getByRole('button', { name: 'Remove', exact: true }).click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
    await expect(confirmHeading).toBeVisible();
    const dialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(volumeRow(page, name)).toBeVisible();

    await row.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(confirmHeading).toBeVisible();
    await dialog.getByRole('button', { name: 'Remove' }).click();

    await expect(volumeRow(page, name)).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await removeVolumeQuietly(name);
  }
});
