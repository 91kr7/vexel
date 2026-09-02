import { expect, test, type Page } from './support/test.js';
import { navEntry, openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { ensurePullableImage } from '../../server/test/support/base-images.js';
import { containerCard, containerDetail } from './support/container-cards.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

// The tests that need an image to be missing locally share one reference — the
// run's own pullable fixture — and each of them removes it. The tests of a file
// already run one at a time here (`workers: 1`, `fullyParallel: false`); serial
// mode is what skips the rest after a failure, when that reference is in a state
// nobody established, and what makes a retry rebuild it from the first test.
test.describe.configure({ mode: 'serial' });

/**
 * The reference the tests below make the product fetch: published in the run's
 * own registry by the `beforeAll` under this, held nowhere on the daemon. A real
 * pull, over a network that cannot give way — the public registry it used to
 * cross failed often enough to lose this file to `EOF` errors.
 */
let pullableReference = '';

test.beforeAll(async () => {
  pullableReference = await ensurePullableImage();
});

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** Puts the daemon back to not holding it, which is the condition these tests are about. */
async function removePullableImage(): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', pullableReference]).catch(() => undefined);
}

/** The container's card on the containers screen — the surface that carries its name and its values. */
function containerRow(page: Page, name: string) {
  return containerCard(page, name);
}

function imageField(page: Page) {
  return page.getByRole('combobox', { name: 'Image reference' });
}

function searchField(page: Page) {
  return page.getByPlaceholder('Search name, image or state…');
}

/** The create/run form sheet itself, so its actions are never confused with the screen's own. */
function formSheet(page: Page) {
  return page.locator('.ui-form-sheet');
}

/** A key/value row of the sheet, addressed by the name it is announced under. */
function editorField(page: Page, name: string) {
  return page.getByRole('textbox', { name, exact: true });
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// plan-docker_management_app/REQ-27 — a container is created from an image with its configuration and started immediately
test('running a container from the toolbar creates it with its configuration and starts it', async ({ page }) => {
  const name = `vexel-e2e-run-${Date.now()}`;
  try {
    await page.getByRole('button', { name: 'Run container…' }).click();
    await imageField(page).fill('alpine:3.20');
    await page.getByRole('textbox', { name: 'Container name' }).fill(name);
    await page.getByRole('textbox', { name: 'Entrypoint' }).fill('sleep');
    await page.getByRole('textbox', { name: 'Command' }).fill('300');
    await page.getByRole('button', { name: 'Add variable' }).click();
    // No section scoping needed: the row says which editor it belongs to.
    await editorField(page, 'Environment Key 1').fill('VEXEL_E2E');
    await editorField(page, 'Environment Value 1').fill('on');
    await page.getByRole('button', { name: 'Add port mapping' }).click();
    await page.getByRole('textbox', { name: 'Container port 1' }).fill('5432');

    await page.getByRole('button', { name: 'Create and start' }).click();

    // The sheet closes on success and the new container shows up, running.
    await expect(imageField(page)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('.ui-toast-viewport')).toContainText(name, { timeout: 10_000 });

    // detail_modal/REQ-26, REQ-31 — creating selects nothing and opens no detail: the new container
    // is a card among the others, in the list's own order, and the screen is left as it was.
    await expect(containerDetail(page), 'creating a container opened its detail').toHaveCount(0);
    await expect(page.locator('.ui-surface--selected'), 'the created container was made the selected card').toHaveCount(0);
    await expect(searchField(page), 'creating a container changed the search field').toHaveValue('');

    await searchField(page).fill(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('RUNNING');
    await expect(row).toContainText('alpine:3.20');

    const { stdout } = await execFileAsync('docker', ['inspect', name, '--format', '{{.Config.Env}} {{.State.Running}}']);
    expect(stdout).toContain('VEXEL_E2E=on');
    expect(stdout).toContain('true');
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-27 — the same form creates the container without starting it
test('creating from an image without starting it leaves the container stopped in the list', async ({ page }) => {
  const name = `vexel-e2e-create-only-${Date.now()}`;
  try {
    await page.getByRole('button', { name: 'Create from image…' }).click();
    await imageField(page).fill('alpine:3.20');
    await page.getByRole('textbox', { name: 'Container name' }).fill(name);
    await page.getByRole('textbox', { name: 'Entrypoint' }).fill('sleep');
    await page.getByRole('textbox', { name: 'Command' }).fill('300');

    await page.getByRole('button', { name: 'Create only' }).click();

    await expect(imageField(page)).toHaveCount(0, { timeout: 30_000 });
    await searchField(page).fill(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('CREATED');
    // The first of the row's three fixed lifecycle slots, carrying the
    // state-appropriate run/halt action for a container that is not running.
    await expect(row.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-29 — a reference that is not present locally is pulled first, then the container is created
test('creating from a reference missing locally pulls the image first and then creates the container', async ({ page }) => {
  // A real registry pull runs before the creation: well beyond the default budget.
  test.setTimeout(120_000);
  const name = `vexel-e2e-pull-create-${Date.now()}`;
  try {
    await removePullableImage();

    await page.getByRole('button', { name: 'Create from image…' }).click();
    await imageField(page).fill(pullableReference);
    await page.getByRole('textbox', { name: 'Container name' }).fill(name);
    await page.getByRole('button', { name: 'Create only' }).click();

    await expect(imageField(page)).toHaveCount(0, { timeout: 60_000 });
    await searchField(page).fill(name);
    await expect(containerRow(page, name)).toBeVisible({ timeout: 15_000 });

    // The image the container was created from is now held locally: it was pulled.
    const { stdout } = await execFileAsync('docker', ['images', '-q', pullableReference]);
    expect(stdout.trim().length).toBeGreaterThan(0);
  } finally {
    await removeContainerQuietly(name);
    // The pull was the point, not the image: the daemon is left holding no more
    // than it did before, so the next run's "missing locally" is genuine too.
    await removePullableImage();
  }
});

// plan-docker_management_app/REQ-29, REQ-28 — the pull progress is shown, and a daemon refusal after it keeps the entered
// configuration in place with the daemon's own message
test('shows the pull progress and, on a daemon refusal, its own message with every entered value kept', async ({ page }) => {
  // A real registry pull runs before the refusal: well beyond the default budget.
  test.setTimeout(120_000);
  const takenName = `vexel-e2e-taken-${Date.now()}`;
  try {
    await execFileAsync('docker', ['create', '--name', takenName, ...ownershipArgs(takenName), '--entrypoint', 'sleep', 'alpine:3.20', '300']);
    await removePullableImage();

    await page.getByRole('button', { name: 'Run container…' }).click();
    await imageField(page).fill(pullableReference);
    await page.getByRole('textbox', { name: 'Container name' }).fill(takenName);
    await page.getByRole('textbox', { name: 'Command' }).fill('echo hello');
    await page.getByRole('button', { name: 'Create and start' }).click();

    // The image is missing locally, so it is pulled first, per layer.
    await expect(page.getByText('Pulling the image')).toBeVisible({ timeout: 30_000 });

    // The daemon then refuses the name, and says so in its own words.
    const banner = page.locator('.ui-error-banner');
    await expect(banner).toBeVisible({ timeout: 30_000 });
    await expect(banner).toContainText(takenName);
    await expect(banner).toContainText(/already in use/i);

    // Every entered value is still there, ready to be corrected.
    await expect(imageField(page)).toHaveValue(pullableReference);
    await expect(page.getByRole('textbox', { name: 'Container name' })).toHaveValue(takenName);
    await expect(page.getByRole('textbox', { name: 'Command' })).toHaveValue('echo hello');
    await expect(page.getByRole('button', { name: 'Create and start' })).toBeEnabled();
  } finally {
    await removeContainerQuietly(takenName);
    await removePullableImage();
  }
});

// plan-docker_management_app/REQ-28 — what the browser can check is checked before submitting: nothing is sent while it fails
test('refuses to submit an invalid container name, showing the reason on the field', async ({ page }) => {
  await page.getByRole('button', { name: 'Run container…' }).click();
  await imageField(page).fill('alpine:3.20');
  await page.getByRole('textbox', { name: 'Container name' }).fill('-not a valid name');

  await page.getByRole('button', { name: 'Create and start' }).click();

  await expect(page.getByText(/Use letters, digits/)).toBeVisible();
  // The sheet stays open, with the values in place and nothing created.
  await expect(imageField(page)).toHaveValue('alpine:3.20');
  await expect(page.locator('.ui-error-banner')).toHaveCount(0);
});

// plan-docker_management_app/REQ-28 — an image reference is required before anything is submitted
test('refuses to submit without an image reference', async ({ page }) => {
  await page.getByRole('button', { name: 'Run container…' }).click();

  await page.getByRole('button', { name: 'Create and start' }).click();

  await expect(page.getByText(/image reference is required/i)).toBeVisible();
  await expect(imageField(page)).toBeVisible();
});

// containers/specs/container-create-form.md — the sheet's two key/value editors name their rows
// apart, so a screen reader says whether a row is an environment variable or a label
test('announces the environment rows apart from the label rows on the create/run sheet', async ({ page }) => {
  await page.getByRole('button', { name: 'Run container…' }).click();
  await page.getByRole('button', { name: 'Add variable' }).click();
  await page.getByRole('button', { name: 'Add label' }).click();

  // Each announced name resolves to one field of the sheet and one only.
  for (const name of ['Environment Key 1', 'Environment Value 1', 'Labels Key 1', 'Labels Value 1']) {
    await expect(editorField(page, name)).toHaveCount(1);
  }
  // Nothing is left announced as a bare "Key 1" / "Value 1".
  for (const name of ['Key 1', 'Value 1']) {
    await expect(editorField(page, name)).toHaveCount(0);
  }
  // The remove actions of the two editors are told apart the same way, even
  // while both rows are still empty.
  await expect(page.getByRole('button', { name: 'Remove pair 1 from Environment', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Remove pair 1 from Labels', exact: true })).toHaveCount(1);

  // A row filled in through its announced name is the row that was meant.
  await editorField(page, 'Labels Key 1').fill('team');
  await expect(editorField(page, 'Environment Key 1')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Remove team from Labels', exact: true })).toHaveCount(1);

  await formSheet(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(imageField(page)).toHaveCount(0);
});

// plan-docker_management_app/REQ-27 — cancelling the form creates nothing
test('cancelling the form creates no container', async ({ page }) => {
  const name = `vexel-e2e-cancel-${Date.now()}`;
  await page.getByRole('button', { name: 'Run container…' }).click();
  await imageField(page).fill('alpine:3.20');
  await page.getByRole('textbox', { name: 'Container name' }).fill(name);

  await formSheet(page).getByRole('button', { name: 'Cancel' }).click();

  await expect(imageField(page)).toHaveCount(0);
  const { stdout } = await execFileAsync('docker', ['ps', '-a', '--filter', `name=${name}`, '--format', '{{.Names}}']);
  expect(stdout.trim()).toBe('');
});

// plan-docker_management_app/REQ-29 — an image can be run straight from its row on the images screen
test('running an image from its row opens the same form pre-filled with that reference', async ({ page }) => {
  const name = `vexel-e2e-image-run-${Date.now()}`;
  try {
    // Scoped to the rail: the Dashboard's cross-navigation tiles name the same
    // screens, so an unscoped locator matches more than the entry meant here.
    await navEntry(page, 'Images & layers').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
    await page.getByPlaceholder('Search reference or digest…').fill('alpine:3.20');
    const row = page.locator('.ui-data-table__row', { hasText: 'alpine:3.20' }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    // The row carries one control now: the create-and-run form is opened from its `Run…` entry
    // (images/specs/images-screen.md). Opening and choosing are one retried gesture, over a settled
    // list — this test reaches the screen through the navigation rail, whose reflow is what
    // dismissed the menu under `container-create-privileged.spec.ts` — so that a test about the
    // create form fails on the create form.
    await chooseFromRowOverflowMenu(page, row, 'Run…');

    await expect(imageField(page)).toHaveValue('alpine:3.20');

    // The pre-filled reference is what actually gets created.
    await page.getByRole('textbox', { name: 'Container name' }).fill(name);
    await page.getByRole('textbox', { name: 'Entrypoint' }).fill('sleep');
    await page.getByRole('textbox', { name: 'Command' }).fill('300');
    await page.getByRole('button', { name: 'Create and start' }).click();

    await expect(imageField(page)).toHaveCount(0, { timeout: 30_000 });
    const { stdout } = await execFileAsync('docker', ['inspect', name, '--format', '{{.Config.Image}}']);
    expect(stdout.trim()).toBe('alpine:3.20');
  } finally {
    await removeContainerQuietly(name);
  }
});
