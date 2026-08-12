import { expect, test, type Page } from './support/test.js';
import { anonymousVolumes, openApp, ownershipArgs, removeAnonymousVolumesSince } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

// A tiny, already-cached image whose entrypoint is overridden to `sleep` so the
// container starts instantly and needs no network pull or app init.
async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), ...extraArgs, '--entrypoint', 'sleep', 'alpine:3.20', '300']);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

function containerRow(page: Page, name: string) {
  return page.locator('.ui-data-table__row', { hasText: name });
}

/** The row's overflow control: the fourth and last of its action area, on every row in every state. */
function overflowTrigger(page: Page, name: string) {
  return containerRow(page, name).getByRole('button', { name: `More actions for ${name}`, exact: true });
}

function menuEntry(page: Page, label: string) {
  return page.getByRole('menuitem', { name: label, exact: true });
}

async function openOverflow(page: Page, name: string) {
  await overflowTrigger(page, name).click();
  await expect(page.getByRole('menu', { name: `More actions for ${name}`, exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// plan-docker_management_app/REQ-19 — the containers screen lists a container with name, state, image and published ports
test('lists a running container with its name, state, image and published ports without a manual refresh', async ({ page }) => {
  const name = `vexel-e2e-list-${Date.now()}`;
  try {
    await createSleepingContainer(name, ['-p', '0:5432']);

    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('alpine:3.20');
    await expect(row).toContainText('running');
    await expect(row).toContainText('→5432');
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-20 — a non-destructive lifecycle action applies to the daemon and the row reflects the resulting state
test('stopping a running container updates its row to the stopped state and its available actions', async ({ page }) => {
  const name = `vexel-e2e-stop-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Exact match: the overflow control is labelled with the container's own
    // name, which contains the action word in these fixtures.
    await row.getByRole('button', { name: 'Stop', exact: true }).click();

    await expect(row).toContainText('exited', { timeout: 10_000 });
    // The first slot now carries the state-appropriate run/halt action: the same
    // position, a different action (REQ-2, REQ-3).
    await expect(row.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app-container_row_actions/REQ-1, REQ-2, REQ-3, REQ-4, REQ-5 — the action area is exactly four
// controls, the three lifecycle slots fixed in number, order and position, the inapplicable ones present and disabled
// with the reason they are unavailable, and the overflow control always last
test('every row ends with the same four controls, the inapplicable ones disabled and saying why', async ({ page }) => {
  const name = `vexel-e2e-slots-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    const controls = row.locator('.ui-action-button-group button');
    await expect(controls).toHaveCount(4);
    await expect(controls.nth(0)).toHaveText('Stop');
    await expect(controls.nth(1)).toHaveText('Pause');
    await expect(controls.nth(2)).toHaveText('Restart');
    await expect(controls.nth(3)).toHaveAttribute('aria-haspopup', 'menu');
    // The row's only action-bearing area: no pencil on the name cell, nothing else.
    await expect(row.getByRole('button')).toHaveCount(4);

    await row.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(row).toContainText('exited', { timeout: 10_000 });

    await expect(controls).toHaveCount(4);
    await expect(controls.nth(0)).toHaveText('Start');
    await expect(controls.nth(1)).toHaveText('Pause');
    await expect(controls.nth(1)).toBeDisabled();
    await expect(controls.nth(2)).toHaveText('Restart');
    await expect(controls.nth(2)).toBeDisabled();
    await expect(controls.nth(3)).toHaveAttribute('aria-haspopup', 'menu');
    // Why it is unavailable is discoverable, not left to be read as "broken".
    await expect(row.locator('.ui-button-with-description').first()).toHaveAttribute('title', /\S/);
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app-container_row_actions/REQ-6, REQ-7, REQ-8 — the menu lists exactly four entries, in order,
// with Kill and Remove set apart in the destructive tone and carrying their technical hints
test('the row menu lists exactly Rename…, Export filesystem…, Kill and Remove, in that order', async ({ page }) => {
  const name = `vexel-e2e-menu-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    await expect(containerRow(page, name)).toBeVisible({ timeout: 15_000 });

    await openOverflow(page, name);

    const entries = page.getByRole('menuitem');
    await expect(entries).toHaveCount(4);
    await expect(entries.nth(0)).toHaveText('Rename…');
    await expect(entries.nth(1)).toHaveText('Export filesystem…');
    await expect(entries.nth(2)).toContainText('Kill');
    await expect(entries.nth(2)).toContainText('SIGKILL');
    await expect(entries.nth(3)).toContainText('Remove');
    await expect(entries.nth(3)).toContainText('rm');
    // The screenshot's `Duplicate config` is not a capability of this product.
    await expect(page.getByRole('menuitem', { name: /duplicate/i })).toHaveCount(0);
    // Set apart as a group from the two above them, and in the destructive tone.
    await expect(page.getByRole('menu').locator('[role="separator"]')).toHaveCount(1);
    await expect(entries.nth(2)).toHaveClass(/destructive/);
    await expect(entries.nth(3)).toHaveClass(/destructive/);
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app-container_row_actions/REQ-13 — the menu closes on any dismissal, and focus returns to the
// control that opened it
test('the row menu closes on Escape, on an outside click and on choosing an entry, with focus back on its control', async ({ page }) => {
  const name = `vexel-e2e-dismiss-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    await expect(containerRow(page, name)).toBeVisible({ timeout: 15_000 });
    const trigger = overflowTrigger(page, name);
    const menu = page.getByRole('menu', { name: `More actions for ${name}`, exact: true });

    await openOverflow(page, name);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await openOverflow(page, name);
    await page.getByRole('heading', { level: 1, name: 'Containers' }).click();
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await openOverflow(page, name);
    await menuEntry(page, 'Rename…').click();
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: `New name for ${name}` })).toBeVisible();
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-24, plan-docker_management_app-container_row_actions/REQ-13 — dismissing the menu by
// clicking outside it does not swallow that click: selecting a row still opens its detail panel
test('an outside click that lands on a row closes the menu and still selects that row', async ({ page }) => {
  const name = `vexel-e2e-outside-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    await openOverflow(page, name);
    await row.getByText(name, { exact: true }).click();

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator('.ui-data-table__expanded')).toBeVisible();
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app-container_row_actions/REQ-12 — the menu is fully operable without a pointer: the trigger is
// reachable and activatable from the keyboard, opening moves focus into the menu, the arrows move between entries, an
// entry can be activated and Escape closes it
test('the row menu is reachable, walked and activated from the keyboard alone', async ({ page }) => {
  const name = `vexel-e2e-keyboard-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Tab from the control before it: the overflow control is one stop in tab order, not a trap.
    // Retried as a whole, because the list keeps re-reading from daemon events while the fixture
    // settles and a re-render between the focus and the key drops the focus on the floor.
    await expect(async () => {
      await row.getByRole('button', { name: 'Restart', exact: true }).press('Tab');
      await expect(overflowTrigger(page, name)).toBeFocused({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    await page.keyboard.press('Enter');
    await expect(menuEntry(page, 'Rename…')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menuEntry(page, 'Export filesystem…')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(menuEntry(page, 'Rename…')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(overflowTrigger(page, name)).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: `New name for ${name}` })).toBeVisible();
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app-container_row_actions/REQ-14 — at most one menu is open at a time, and an open one is
// unambiguously attached to the row it belongs to
test('opening a second row menu closes the first', async ({ page }) => {
  const first = `vexel-e2e-onemenu-a-${Date.now()}`;
  const second = `vexel-e2e-onemenu-b-${Date.now()}`;
  try {
    await createSleepingContainer(first);
    await createSleepingContainer(second);
    await expect(containerRow(page, first)).toBeVisible({ timeout: 15_000 });
    await expect(containerRow(page, second)).toBeVisible({ timeout: 15_000 });

    await openOverflow(page, first);
    await overflowTrigger(page, second).click();

    await expect(page.getByRole('menu')).toHaveCount(1);
    await expect(page.getByRole('menu')).toHaveAccessibleName(`More actions for ${second}`);
    await expect(overflowTrigger(page, first)).toHaveAttribute('aria-expanded', 'false');
  } finally {
    await removeContainerQuietly(first);
    await removeContainerQuietly(second);
  }
});

// plan-docker_management_app-container_row_actions/REQ-15 — an open menu is displayed in full wherever its control sits,
// including on the last rows of a list long enough to scroll, and is never clipped by the table or any scroll container
test('a menu opened on the last visible row of a scrolling list is shown in full', async ({ page }) => {
  const stem = `vexel-e2e-clip-${Date.now()}`;
  const names = [`${stem}-1`, `${stem}-2`, `${stem}-3`, `${stem}-4`];
  try {
    for (const name of names) await createSleepingContainer(name);
    // A short viewport, so the table has to scroll and the last row sits against
    // the bottom edge — the case the popup has to flip above its trigger for.
    await page.setViewportSize({ width: 1280, height: 520 });
    await page.getByPlaceholder('Search name, image or state…').fill(stem);
    const last = containerRow(page, names[names.length - 1]);
    await expect(last).toBeVisible({ timeout: 15_000 });
    await last.scrollIntoViewIfNeeded();

    await openOverflow(page, names[names.length - 1]);

    // Every entry of it, not merely the popup's first pixels.
    for (const label of ['Rename…', 'Export filesystem…', 'Kill', 'Remove']) {
      await expect(menuEntry(page, label)).toBeInViewport({ ratio: 1 });
    }
  } finally {
    for (const name of names) await removeContainerQuietly(name);
  }
});

// plan-docker_management_app-container_row_actions/REQ-1 — a click on the row's action area never also selects the row
test('clicking the overflow control does not open the row detail panel', async ({ page }) => {
  const name = `vexel-e2e-nodetail-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    await expect(containerRow(page, name)).toBeVisible({ timeout: 15_000 });

    await openOverflow(page, name);

    await expect(page.locator('.ui-data-table__expanded')).toHaveCount(0);
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app-container_row_actions/REQ-16, REQ-24 — the list keeps updating from daemon events while a
// menu is open, and the open menu stays bound to the container it was opened for: an entry chosen never applies to
// another one
test('the list keeps updating while a menu is open and the menu stays bound to its own container', async ({ page }) => {
  const stem = `vexel-e2e-live-${Date.now()}`;
  const owner = `${stem}-owner`;
  const other = `${stem}-other`;
  try {
    await createSleepingContainer(owner);
    await createSleepingContainer(other);
    await page.getByPlaceholder('Search name, image or state…').fill(stem);
    await expect(containerRow(page, owner)).toBeVisible({ timeout: 15_000 });
    await expect(containerRow(page, other)).toBeVisible({ timeout: 15_000 });

    await openOverflow(page, owner);

    // Stopped from outside the application, exactly as the daemon's own events reach it.
    await execFileAsync('docker', ['stop', '-t', '0', other]);
    await expect(containerRow(page, other)).toContainText('exited', { timeout: 15_000 });

    // The menu is still the one opened for its own container, and acts on it.
    await expect(page.getByRole('menu')).toHaveAccessibleName(`More actions for ${owner}`);
    await menuEntry(page, 'Rename…').click();
    await expect(page.getByRole('textbox', { name: `New name for ${owner}` })).toBeVisible();
  } finally {
    await removeContainerQuietly(owner);
    await removeContainerQuietly(other);
  }
});

// plan-docker_management_app/REQ-20, REQ-6 — a destructive lifecycle action asks for confirmation naming the container and performs nothing on cancel
test('killing a container asks for confirmation naming it, does nothing on cancel and applies on confirm', async ({ page }) => {
  const name = `vexel-e2e-kill-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Kill is reached from the row's overflow menu now; the confirmation in
    // front of it is unchanged — the menu is a step before it, not instead of
    // it (REQ-22).
    await openOverflow(page, name);
    await menuEntry(page, 'Kill').click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(row).toContainText('running');

    await openOverflow(page, name);
    await menuEntry(page, 'Kill').click();
    await expect(confirmHeading).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'kill', exact: true }).click();

    await expect(row).toContainText('exited', { timeout: 10_000 });
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-21 — a container can be renamed and the change is reflected in the list
test('renaming a container replaces the name cell and the new name is reflected in the list', async ({ page }) => {
  const name = `vexel-e2e-rename-${Date.now()}`;
  const newName = `${name}-renamed`;
  try {
    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Rename is started from the row's overflow menu now; the inline editor it
    // opens is the one the pencil opened (REQ-18).
    await openOverflow(page, name);
    await menuEntry(page, 'Rename…').click();
    // The name cell is replaced by the input while renaming, so it stops matching the
    // row locator's text filter; query the field by its accessible name at the page level.
    const field = page.getByRole('textbox', { name: `New name for ${name}` });
    await expect(field).toHaveValue(name);
    await field.fill(newName);
    await field.press('Enter');

    await expect(containerRow(page, newName)).toBeVisible({ timeout: 10_000 });
  } finally {
    await removeContainerQuietly(newName);
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-23 — the container list can be text-searched by name
test('searching narrows the list to containers whose name matches the search text', async ({ page }) => {
  const name = `vexel-e2e-search-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const row = containerRow(page, name);
    await expect(row).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder('Search name, image or state…').fill(name);

    await expect(containerRow(page, name)).toBeVisible();
    const otherRows = page.locator('.ui-data-table__row').filter({ hasNotText: name });
    await expect(otherRows).toHaveCount(0);
  } finally {
    await removeContainerQuietly(name);
  }
});

function openDetail(page: Page, name: string) {
  return containerRow(page, name).getByText(name, { exact: true }).click();
}

/** The name on the row the expanded panel is rendered directly below — which container the panel is pointing at. */
async function panelOwner(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector('.ui-data-table__expanded')?.previousElementSibling?.textContent ?? '');
}

// The container detail panel has no close control any more: the row that opened it closes it, and
// `Escape` closes it from the keyboard — arbitrated against the other consumers of that key on this
// screen. Nothing here covered the panel's dismissal before this change: it was opened and never
// closed (plan-docker_management_app-container_detail_close/REQ-19).
//
// Serial for the same reason as the group below: these tests keep a panel open across several
// steps, and virtualisation reserves no space for an expanded row.
test.describe('Container detail panel dismissal (REQ-1, REQ-3, REQ-4, REQ-5, REQ-7, REQ-9, REQ-12, REQ-16)', () => {
  test.describe.configure({ mode: 'serial' });

  // plan-docker_management_app-container_detail_close/REQ-1, REQ-2, REQ-3, REQ-12 — the panel offers no close control,
  // its row is visibly the selected one, and selecting that row again closes it
  test('the open panel carries no close control, its row is the selected one, and re-selecting that row closes it', async ({ page }) => {
    const name = `vexel-e2e-close-row-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const row = containerRow(page, name);
      await expect(row).toBeVisible({ timeout: 15_000 });

      await openDetail(page, name);
      const detail = page.locator('.ui-data-table__expanded');
      await expect(detail).toBeVisible();

      // Gone from the rendered interface — not hidden, not disabled, not moved.
      await expect(page.getByRole('button', { name: 'Close detail' })).toHaveCount(0);
      await expect(detail.locator('.ui-detail-panel__close')).toHaveCount(0);
      // The bond to the row is visible without acting (REQ-12).
      await expect(row).toHaveClass(/ui-data-table__row--selected/);
      expect(await panelOwner(page)).toContain(name);

      await openDetail(page, name);

      await expect(detail).toHaveCount(0);
      await expect(row).not.toHaveClass(/ui-data-table__row--selected/);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app-container_detail_close/REQ-4 — selecting a different row leaves the panel open and
  // re-points it at the newly selected container
  test('selecting another row keeps the panel open on that other container', async ({ page }) => {
    const stem = `vexel-e2e-repoint-${Date.now()}`;
    const first = `${stem}-a`;
    const second = `${stem}-b`;
    try {
      await createSleepingContainer(first);
      await createSleepingContainer(second);
      await page.getByPlaceholder('Search name, image or state…').fill(stem);
      await expect(containerRow(page, first)).toBeVisible({ timeout: 15_000 });
      await expect(containerRow(page, second)).toBeVisible({ timeout: 15_000 });

      await openDetail(page, first);
      await expect(page.locator('.ui-data-table__expanded')).toBeVisible();

      await openDetail(page, second);

      await expect(page.locator('.ui-data-table__expanded')).toHaveCount(1);
      await expect.poll(async () => panelOwner(page), { timeout: 10_000 }).toContain(second);
      await expect(containerRow(page, second)).toHaveClass(/ui-data-table__row--selected/);
      await expect(containerRow(page, first)).not.toHaveClass(/ui-data-table__row--selected/);
    } finally {
      await removeContainerQuietly(first);
      await removeContainerQuietly(second);
    }
  });

  // plan-docker_management_app-container_detail_close/REQ-5, REQ-6 — Escape closes the panel, including from a control
  // inside the panel's own contents
  test('Escape closes the panel, from the screen and from inside the panel itself', async ({ page }) => {
    const name = `vexel-e2e-escape-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerRow(page, name)).toBeVisible({ timeout: 15_000 });
      const detail = page.locator('.ui-data-table__expanded');

      await openDetail(page, name);
      await expect(detail).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(detail).toHaveCount(0);

      // Again, this time with the focus on a control the operator reached inside the panel.
      await openDetail(page, name);
      await expect(detail).toBeVisible();
      await detail.getByRole('tab', { name: 'Inspect' }).click();
      await expect(detail.getByRole('tab', { name: 'Inspect' })).toBeFocused();

      await page.keyboard.press('Escape');

      await expect(detail).toHaveCount(0);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app-container_detail_close/REQ-7 — Escape is arbitrated innermost-first: an open row menu
  // takes the key and closes alone, the panel takes the next one
  test('with the row menu open, Escape closes only the menu and the next one closes the panel', async ({ page }) => {
    const name = `vexel-e2e-escape-menu-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerRow(page, name)).toBeVisible({ timeout: 15_000 });
      const detail = page.locator('.ui-data-table__expanded');

      await openDetail(page, name);
      await expect(detail).toBeVisible();
      await openOverflow(page, name);

      await page.keyboard.press('Escape');

      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(detail).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(detail).toHaveCount(0);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app-container_detail_close/REQ-9 — while a confirmation is open over the screen, Escape
  // dismisses the panel behind it; what the dialog does with the key is its own existing behaviour, which is nothing
  test('with the Remove confirmation open, Escape leaves both the confirmation and the panel as they were', async ({ page }) => {
    const name = `vexel-e2e-escape-dialog-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerRow(page, name)).toBeVisible({ timeout: 15_000 });
      const detail = page.locator('.ui-data-table__expanded');

      await openDetail(page, name);
      await expect(detail).toBeVisible();
      await openOverflow(page, name);
      await menuEntry(page, 'Remove').click();
      const confirmHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
      await expect(confirmHeading).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(confirmHeading).toBeVisible();
      await expect(detail).toBeVisible();

      // The confirmation is closed the way it is meant to be, leaving the container in place.
      await page.locator('.ui-modal').filter({ has: confirmHeading }).getByRole('button', { name: 'Cancel' }).click();
      await expect(confirmHeading).toHaveCount(0);
      await expect(detail).toBeVisible();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app-container_detail_close/REQ-16 — a search that excludes the selected container takes its
  // row and its panel off screen together, and clearing it brings both back as they were
  test('a search that excludes the selected container hides its row and its panel, and clearing it restores both', async ({ page }) => {
    const name = `vexel-e2e-escape-filter-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerRow(page, name)).toBeVisible({ timeout: 15_000 });
      const detail = page.locator('.ui-data-table__expanded');
      const search = page.getByPlaceholder('Search name, image or state…');

      await openDetail(page, name);
      await expect(detail).toBeVisible();

      await search.fill(`${name}-excluded-by-this-search`);

      await expect(containerRow(page, name)).toHaveCount(0);
      await expect(detail).toHaveCount(0);

      await search.fill('');

      await expect(containerRow(page, name)).toBeVisible();
      await expect(detail).toBeVisible();
      expect(await panelOwner(page)).toContain(name);
      await expect(containerRow(page, name)).toHaveClass(/ui-data-table__row--selected/);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app-container_detail_close/REQ-10 — with no panel open, Escape changes nothing about what is
  // selected, filtered or displayed on the screen
  test('with no panel open, Escape changes nothing on the screen', async ({ page }) => {
    const name = `vexel-e2e-escape-idle-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const row = containerRow(page, name);
      await expect(row).toBeVisible({ timeout: 15_000 });
      const search = page.getByPlaceholder('Search name, image or state…');
      await search.fill(name);
      await page.getByRole('button', { name: 'Running' }).click();
      await expect(row).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(search).toHaveValue(name);
      await expect(page.getByRole('button', { name: 'Running' })).toHaveAttribute('aria-pressed', 'true');
      await expect(row).toBeVisible();
      await expect(page.locator('.ui-data-table__expanded')).toHaveCount(0);
      await expect(page.locator('.ui-data-table__row--selected')).toHaveCount(0);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // ui-library/specs/frame.md — the phone navigation drawer is a claimant like any other: one Escape closes the drawer
  // and leaves the panel open, the next one closes the panel (REQ-7)
  test('with the phone navigation drawer open over the panel, Escape closes only the drawer', async ({ page }) => {
    const name = `vexel-e2e-escape-drawer-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerRow(page, name)).toBeVisible({ timeout: 15_000 });
      const detail = page.locator('.ui-data-table__expanded');

      await openDetail(page, name);
      await expect(detail).toBeVisible();

      // Below the phone breakpoint, which is the only place the drawer exists at
      // all: above it the rail is docked and claims nothing.
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(detail).toBeVisible();

      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.locator('.ui-frame__rail--open')).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(page.locator('.ui-frame__rail--open')).toHaveCount(0);
      await expect(detail).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(detail).toHaveCount(0);
    } finally {
      await removeContainerQuietly(name);
    }
  });
});

// These tests keep a container's detail panel open across several UI steps
// (tab switch, edit, save). DataTable virtualisation does not reserve extra
// space for an expanded row (ui-library/specs/data-table.md), so another
// worker's containers appearing mid-interaction can push the row out of the
// mounted window and reset the panel; serial mode keeps that window stable.
test.describe('Container detail panel (REQ-24, REQ-25, REQ-26)', () => {
  test.describe.configure({ mode: 'serial' });

  // plan-docker_management_app/REQ-24 — selecting a container opens a detail view with its inspect data organised in tabs
  test('selecting a container row opens its detail panel with Config and Inspect tabs', async ({ page }) => {
    const name = `vexel-e2e-detail-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const row = containerRow(page, name);
      await expect(row).toBeVisible({ timeout: 15_000 });

      await openDetail(page, name);

      const detail = page.locator('.ui-data-table__expanded');
      await expect(detail).toBeVisible();
      await expect(detail.getByRole('tab', { name: 'Config' })).toBeVisible();
      await expect(detail.getByRole('tab', { name: 'Inspect' })).toBeVisible();
      await expect(detail.getByRole('button', { name: 'Edit configuration' })).toBeVisible();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-26 — the raw inspect payload is viewable and copyable as-is
  test('the Inspect tab shows the raw payload and its copy affordance confirms the copy', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const name = `vexel-e2e-inspect-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const row = containerRow(page, name);
      await expect(row).toBeVisible({ timeout: 15_000 });
      await openDetail(page, name);

      const detail = page.locator('.ui-data-table__expanded');
      await detail.getByRole('tab', { name: 'Inspect' }).click();
      await expect(detail.getByText(/"Image":\s*"alpine:3.20"/)).toBeVisible();

      // The raw payload's own copy affordance: the Id and Image fields above it
      // carry a "Copy" each.
      await detail.locator('.ui-code-viewer').getByRole('button', { name: 'Copy' }).click();
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('"alpine:3.20"');
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-25 — restart policy and/or resource limits alone are applied in place, no warning
  test('editing only the restart policy saves in place without asking for confirmation', async ({ page }) => {
    const name = `vexel-e2e-config-inplace-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const row = containerRow(page, name);
      await expect(row).toBeVisible({ timeout: 15_000 });
      await openDetail(page, name);

      const detail = page.locator('.ui-data-table__expanded');
      await detail.getByRole('button', { name: 'Edit configuration' }).click();
      await detail.getByRole('combobox', { name: 'Restart policy' }).selectOption('always');
      await detail.getByRole('button', { name: 'Save changes' }).click();

      await expect(page.getByRole('heading', { name: /^Confirm:/ })).toHaveCount(0);
      await expect(page.locator('.ui-toast-viewport')).toContainText('Configuration updated', { timeout: 10_000 });
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-25 — an environment, port, mount or health-check change asks for confirmation before a
  // recreate; declining leaves the container and its configuration unchanged
  test('editing an environment variable asks for confirmation before recreating, and cancelling leaves it unchanged', async ({ page }) => {
    const name = `vexel-e2e-config-decline-${Date.now()}`;
    try {
      await createSleepingContainer(name, ['-e', 'FOO=bar']);
      const row = containerRow(page, name);
      await expect(row).toBeVisible({ timeout: 15_000 });
      await openDetail(page, name);

      const detail = page.locator('.ui-data-table__expanded');
      await detail.getByRole('button', { name: 'Edit configuration' }).click();
      await detail.getByRole('textbox', { name: 'Value 1' }).fill('baz');
      await detail.getByRole('button', { name: 'Save changes' }).click();

      const dialogHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
      await expect(dialogHeading).toBeVisible();
      const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
      await dialog.getByRole('button', { name: 'Cancel' }).click();

      await expect(dialogHeading).toHaveCount(0);
      await expect(containerRow(page, name)).toBeVisible();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-25 — confirming a Docker-required recreate replaces the container, preserving its name,
  // and the outcome is reported
  test('confirming a recreate replaces the container while preserving its name and reports the outcome', async ({ page }) => {
    const name = `vexel-e2e-config-recreate-${Date.now()}`;
    // The recreate keeps the replaced container's volumes on purpose, so the
    // anonymous volume of the image's own `VOLUME` declaration outlives it and
    // is this test's to remove.
    const volumesBefore = await anonymousVolumes();
    try {
      await createSleepingContainer(name, ['-e', 'FOO=bar']);
      const row = containerRow(page, name);
      await expect(row).toBeVisible({ timeout: 15_000 });
      await openDetail(page, name);

      const detail = page.locator('.ui-data-table__expanded');
      await detail.getByRole('button', { name: 'Edit configuration' }).click();
      await detail.getByRole('textbox', { name: 'Value 1' }).fill('baz');
      await detail.getByRole('button', { name: 'Save changes' }).click();

      const dialogHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
      await expect(dialogHeading).toBeVisible();
      const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
      await dialog.getByRole('button', { name: 'Recreate container' }).click();

      await expect(page.locator('.ui-toast-viewport')).toContainText('Container recreated', { timeout: 15_000 });
      await expect(containerRow(page, name)).toBeVisible({ timeout: 15_000 });
    } finally {
      await removeContainerQuietly(name);
      await removeAnonymousVolumesSince(volumesBefore);
    }
  });
});
