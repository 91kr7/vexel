import { expect, test, type Page } from './support/test.js';
import { anonymousVolumes, openApp, ownershipArgs, removeAnonymousVolumesSince } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { boxOf, boxesOf, boxThisFrame, clickAtItsCentre, movePointerTo } from './support/settled.js';
import {
  chooseCardAction,
  closeContainerDetail,
  containerCard,
  containerCards,
  containerDetail,
  containerDetailCloseControl,
  detailControl,
  detailIdentity,
  dismissContainerDetailByScrim,
  openContainerDetail,
  openRawPayload,
  overflowTrigger,
  rawPayloadSection,
} from './support/container-cards.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

// A tiny, already-cached image whose entrypoint is overridden to `sleep` so the
// container starts instantly and needs no network pull or app init.
async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), ...extraArgs, '--entrypoint', 'sleep', 'alpine:3.20', '300']);
}

/** The daemon's own short id for a container — the twelve characters the list carries (REQ-8). */
async function shortIdOf(name: string): Promise<string> {
  return (await execFileAsync('docker', ['inspect', '-f', '{{.Id}}', name])).stdout.trim().slice(0, 12);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

function menuEntry(page: Page, label: string) {
  return page.getByRole('menuitem', { name: label, exact: true });
}

async function openOverflow(page: Page, name: string) {
  await overflowTrigger(page, name).click();
  await expect(page.getByRole('menu', { name: `More actions for ${name}`, exact: true })).toBeVisible();
}

/**
 * The dialog's box, **once its content has arrived**. The height is the dialog's own since
 * `…-tabs_composition_refactor/REQ-1`, so this no longer guards against a growing card; it still
 * guards against measuring a dialog whose Config tab is drawing "Loading" — the inspect data arrives
 * after the dialog does, and a width or an x read then belongs to another layout.
 */
async function settledDialogBox(page: Page) {
  const detail = containerDetail(page);
  await expect(detail.getByRole('button', { name: 'Edit configuration' })).toBeVisible({ timeout: 20_000 });
  return await boxOf(detail, 'the container detail dialog');
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115).
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// plan-docker_management_app/REQ-19 — the containers screen lists a container with name, state, image and published ports
test('lists a running container with its name, state, image and published ports without a manual refresh', async ({ page }) => {
  const name = `vexel-e2e-list-${Date.now()}`;
  try {
    await createSleepingContainer(name, ['-p', '0:5432']);

    const card = containerCard(page, name);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('alpine:3.20');
    // The state is the card's uppercase pill now, where the row printed it in the daemon's own
    // lower case (plan-docker_management_app-containers_card_view/REQ-3).
    await expect(card).toContainText('RUNNING');
    await expect(card).toContainText('→5432');
  } finally {
    await removeContainerQuietly(name);
  }
});

/** What the list endpoint says about one container, as far as this file reads it. */
interface SampledSummary {
  name: string;
  state: string;
  cpuPercent?: number;
  memoryUsageBytes?: number;
  memoryLimitBytes?: number;
  onlineCpus?: number;
  networkRxBytes?: number;
  networkTxBytes?: number;
}

async function summaryOf(page: Page, name: string): Promise<SampledSummary | undefined> {
  const list = (await (await page.request.get('/api/containers')).json()) as SampledSummary[];
  return list.find((one) => one.name === name);
}

// plan-docker_management_app-containers_card_view/REQ-13 — the six sampled fields come from one
// sample and are absent together, read at the REST API and then on the card.
test('the list carries the online CPU count and the network totals, and the card states them', async ({ page }) => {
  const name = `vexel-e2e-sampled-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => (await summaryOf(page, name))?.cpuPercent !== undefined, { timeout: 20_000 })
      .toBe(true);
    const sampled = (await summaryOf(page, name)) as SampledSummary;

    // The capacity the percentage is measured against, and the totals since the container started.
    expect(Number.isInteger(sampled.onlineCpus), `onlineCpus is ${sampled.onlineCpus}`).toBe(true);
    expect(sampled.onlineCpus as number).toBeGreaterThan(0);
    expect(sampled.networkRxBytes as number).toBeGreaterThanOrEqual(0);
    expect(sampled.networkTxBytes as number).toBeGreaterThanOrEqual(0);
    // One sample: the six arrive together.
    for (const value of [sampled.memoryUsageBytes, sampled.memoryLimitBytes]) expect(value).not.toBeUndefined();

    // …and the card states that capacity rather than a figure of its own.
    await expect(containerCard(page, name)).toContainText(
      `of ${sampled.onlineCpus} core${sampled.onlineCpus === 1 ? '' : 's'}`,
      { timeout: 15_000 },
    );

    // Absent together: a container the sampler no longer reads carries none of the six.
    await execFileAsync('docker', ['stop', '-t', '0', name]);
    await expect
      .poll(async () => (await summaryOf(page, name))?.state, { timeout: 20_000 })
      .toBe('exited');
    await expect
      .poll(
        async () => {
          const stopped = (await summaryOf(page, name)) as SampledSummary;
          return [
            stopped.cpuPercent,
            stopped.memoryUsageBytes,
            stopped.memoryLimitBytes,
            stopped.onlineCpus,
            stopped.networkRxBytes,
            stopped.networkTxBytes,
          ].every((value) => value === undefined);
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    // Which the card states as such, rather than as a measurement (REQ-16).
    await expect(containerCard(page, name)).toContainText('no sample', { timeout: 15_000 });
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-20 — a non-destructive lifecycle action applies to the daemon and the card reflects the resulting state
test('stopping a running container updates its card to the stopped state and its available actions', async ({ page }) => {
  const name = `vexel-e2e-stop-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const card = containerCard(page, name);
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Exact match: the overflow control is labelled with the container's own
    // name, which contains the action word in these fixtures.
    await card.getByRole('button', { name: 'Stop', exact: true }).click();

    await expect(card).toContainText('EXITED', { timeout: 10_000 });
    // The first slot now carries the state-appropriate run/halt action: the same
    // position, a different action (REQ-2, REQ-3).
    await expect(card.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app-container_row_actions/REQ-1, REQ-2, REQ-3, REQ-4, REQ-5 — four controls,
// the inapplicable ones present and disabled with their reason, the overflow always last
test('every card ends with the same four controls, the inapplicable ones disabled and saying why', async ({ page }) => {
  const name = `vexel-e2e-slots-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const card = containerCard(page, name);
    await expect(card).toBeVisible({ timeout: 15_000 });

    const controls = card.locator('.ui-action-button-group button');
    await expect(controls).toHaveCount(4);
    await expect(controls.nth(0)).toHaveText('Stop');
    await expect(controls.nth(1)).toHaveText('Pause');
    await expect(controls.nth(2)).toHaveText('Restart');
    await expect(controls.nth(3)).toHaveAttribute('aria-haspopup', 'menu');
    // container-card.md — the detail opener beside the id is inert by the human's decision of
    // 2026-08-25, and is named here rather than counted away.
    await expect(card.getByRole('button')).toHaveCount(5);
    const inert = card.getByRole('button', { name: `Open ${name} details`, exact: true });
    await expect(inert).toBeEnabled();
    await expect(card.locator('.ui-action-button-group').getByRole('button', { name: `Open ${name} details` })).toHaveCount(0);

    await card.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(card).toContainText('EXITED', { timeout: 10_000 });

    await expect(controls).toHaveCount(4);
    await expect(controls.nth(0)).toHaveText('Start');
    await expect(controls.nth(1)).toHaveText('Pause');
    await expect(controls.nth(1)).toBeDisabled();
    await expect(controls.nth(2)).toHaveText('Restart');
    await expect(controls.nth(2)).toBeDisabled();
    await expect(controls.nth(3)).toHaveAttribute('aria-haspopup', 'menu');
    // Why it is unavailable is discoverable, not left to be read as "broken".
    await expect(card.locator('.ui-button-with-description').first()).toHaveAttribute('title', /\S/);
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app-container_row_actions/REQ-6, REQ-7, REQ-8 — the menu lists exactly four entries, in order,
// with Kill and Remove set apart in the destructive tone and carrying their technical hints
test('the card menu lists exactly Rename…, Export filesystem…, Kill and Remove, in that order', async ({ page }) => {
  const name = `vexel-e2e-menu-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

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
test('the card menu closes on Escape, on an outside click and on choosing an entry, with focus back on its control', async ({ page }) => {
  const name = `vexel-e2e-dismiss-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
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

    await chooseCardAction(page, name, 'Rename…');
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: `New name for ${name}` })).toBeVisible();
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app/REQ-24, plan-docker_management_app-container_row_actions/REQ-13 — dismissing the menu by
// clicking outside it does not swallow that click. The card body is no longer a gesture
// (detail_modal/REQ-6), so what the outside click has to still reach is the card's detail control:
// one click, the menu gone and the detail open.
test('an outside click that lands on the detail control closes the menu and still opens the detail', async ({ page }) => {
  const name = `vexel-e2e-outside-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const card = containerCard(page, name);
    await expect(card).toBeVisible({ timeout: 15_000 });

    await openOverflow(page, name);
    await detailControl(page, name).click();

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(containerDetail(page)).toBeVisible();
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app-container_row_actions/REQ-12 — the menu is fully operable from the keyboard
test('the card menu is reachable, walked and activated from the keyboard alone', async ({ page }) => {
  const name = `vexel-e2e-keyboard-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    const card = containerCard(page, name);
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Retried as a whole: a re-render between the focus and the key drops the focus on the floor.
    await expect(async () => {
      await card.getByRole('button', { name: 'Restart', exact: true }).press('Tab');
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
// unambiguously attached to the card it belongs to
test('opening a second card menu closes the first', async ({ page }) => {
  const stem = `vexel-e2e-onemenu-${Date.now()}`;
  // The order is the server's, by name (plan-docker_management_app-list_ordering/REQ-8), not the creation order.
  const above = `${stem}-a`;
  const below = `${stem}-b`;
  try {
    await createSleepingContainer(above);
    await createSleepingContainer(below);
    // Narrowed to the two fixtures, so they are the top cards of the list and the geometry the rest
    // of this test depends on is the spec's own rather than whatever the operator's daemon holds.
    await page.getByPlaceholder('Search name, image or state…').fill(stem);
    await expect(containerCard(page, above)).toBeVisible({ timeout: 15_000 });
    await expect(containerCard(page, below)).toBeVisible({ timeout: 15_000 });

    // Opened on the card the list puts first, and that is load-bearing: a click aimed at a trigger
    // under an open menu lands on the menu instead — on `Kill` or `Remove`, at that.
    await openOverflow(page, below);
    await overflowTrigger(page, above).click();

    await expect(page.getByRole('menu')).toHaveCount(1);
    await expect(page.getByRole('menu')).toHaveAccessibleName(`More actions for ${above}`);
    await expect(overflowTrigger(page, below)).toHaveAttribute('aria-expanded', 'false');
  } finally {
    await removeContainerQuietly(above);
    await removeContainerQuietly(below);
  }
});

// plan-docker_management_app-container_row_actions/REQ-15 — an open menu is displayed in full wherever its control sits,
// including on the last cards of a list long enough to scroll, and is never clipped by the list or any scroll container
test('a menu opened on the last visible card of a scrolling list is shown in full', async ({ page }) => {
  const stem = `vexel-e2e-clip-${Date.now()}`;
  const names = [`${stem}-1`, `${stem}-2`, `${stem}-3`, `${stem}-4`];
  try {
    for (const name of names) await createSleepingContainer(name);
    // A short viewport, so the list has to scroll and the last card sits against
    // the bottom edge — the case the popup has to flip above its trigger for.
    await page.setViewportSize({ width: 1280, height: 520 });
    await page.getByPlaceholder('Search name, image or state…').fill(stem);
    const last = containerCard(page, names[names.length - 1]);
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

// plan-docker_management_app-container_row_actions/REQ-1 — a click on the card's action cluster never also selects the card
test('clicking the overflow control does not open the card detail panel', async ({ page }) => {
  const name = `vexel-e2e-nodetail-${Date.now()}`;
  try {
    await createSleepingContainer(name);
    await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

    await openOverflow(page, name);

    await expect(containerDetail(page)).toHaveCount(0);
  } finally {
    await removeContainerQuietly(name);
  }
});

// plan-docker_management_app-container_row_actions/REQ-16, REQ-24 — the list keeps updating while a
// menu is open, and the menu stays bound to the container it was opened for
test('the list keeps updating while a menu is open and the menu stays bound to its own container', async ({ page }) => {
  const stem = `vexel-e2e-live-${Date.now()}`;
  const owner = `${stem}-owner`;
  const other = `${stem}-other`;
  try {
    await createSleepingContainer(owner);
    await createSleepingContainer(other);
    await page.getByPlaceholder('Search name, image or state…').fill(stem);
    await expect(containerCard(page, owner)).toBeVisible({ timeout: 15_000 });
    await expect(containerCard(page, other)).toBeVisible({ timeout: 15_000 });

    await openOverflow(page, owner);

    // Stopped from outside the application, exactly as the daemon's own events reach it.
    await execFileAsync('docker', ['stop', '-t', '0', other]);
    await expect(containerCard(page, other)).toContainText('EXITED', { timeout: 15_000 });

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
    const card = containerCard(page, name);
    await expect(card).toBeVisible({ timeout: 15_000 });

    // The menu is a step before the confirmation, not instead of it (REQ-22).
    await chooseCardAction(page, name, 'Kill');
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
    await expect(confirmHeading).toBeVisible();
    const confirmDialog = page.locator('.ui-modal').filter({ has: confirmHeading });
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(card).toContainText('RUNNING');

    await chooseCardAction(page, name, 'Kill');
    await expect(confirmHeading).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'kill', exact: true }).click();

    await expect(card).toContainText('EXITED', { timeout: 10_000 });
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
    const card = containerCard(page, name);
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Rename is started from the card's overflow menu; the inline editor it
    // opens is the one the pencil opened (REQ-18).
    await chooseCardAction(page, name, 'Rename…');
    // The name is replaced by the input while renaming, so the card stops matching the
    // card locator's text filter; query the field by its accessible name at the page level.
    const field = page.getByRole('textbox', { name: `New name for ${name}` });
    await expect(field).toHaveValue(name);
    await field.fill(newName);
    await field.press('Enter');

    await expect(containerCard(page, newName)).toBeVisible({ timeout: 10_000 });
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
    const card = containerCard(page, name);
    await expect(card).toBeVisible({ timeout: 15_000 });

    await page.getByPlaceholder('Search name, image or state…').fill(name);

    await expect(containerCard(page, name)).toBeVisible();
    const otherCards = containerCards(page).filter({ hasNotText: name });
    await expect(otherCards).toHaveCount(0);
  } finally {
    await removeContainerQuietly(name);
  }
});

// The detail is a dialog now, with exactly two ways out — its own labelled close control and a
// click on the dimmed area beside it — and `Escape` is not one of them
// (`plan-docker_management_app-containers_card_view-detail_modal/REQ-10`, `REQ-11`, `REQ-13`,
// `REQ-17`). Every delivered check of this describe is restated against those two routes rather
// than dropped: the `Escape` ones say what now holds, the card-re-selection one is the close
// control, and the geometry the move is judged on is asserted beside the content.
// Serial, the list re-reading under it.
test.describe('Container detail dialog dismissal (REQ-3, REQ-10, REQ-11, REQ-13, REQ-16, REQ-17)', () => {
  test.describe.configure({ mode: 'serial' });

  // detail_modal/REQ-10, REQ-16, REQ-17 — one labelled control, which dismisses the dialog and
  // hands the point of interaction back to the control that opened it. Restates the delivered
  // "the panel carries no close control, its card is the selected one, re-selecting closes it".
  test('the dialog names its container, carries one close control, and hands the focus back on dismissal', async ({ page }) => {
    const name = `vexel-e2e-close-dialog-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const card = containerCard(page, name);
      await expect(card).toBeVisible({ timeout: 15_000 });

      await openContainerDetail(page, name);
      const detail = containerDetail(page);
      await expect(detail).toBeVisible();

      // The identity is on the dialog itself, not by proximity to a card (REQ-16), and it is the
      // composition that replaced the `Container — <name>` string: dot, bare name, state pill and
      // short id (tabs_composition_refactor/REQ-6, REQ-8).
      await expect
        .poll(async () => await detailIdentity(page), { timeout: 20_000 })
        .toMatchObject({ dot: 'success', name, state: 'RUNNING', health: null });
      const identity = await detailIdentity(page);
      expect(identity.shortId, 'the header does not carry the daemon’s own short id').toBe(await shortIdOf(name));
      expect(identity.text, 'the withdrawn prefix is still drawn').not.toMatch(/Container\s+—/);
      await expect(containerDetailCloseControl(page)).toHaveCount(1);
      // No card marks itself as the one whose detail is open (REQ-8).
      await expect(page.locator('.ui-surface--selected')).toHaveCount(0);

      await closeContainerDetail(page);

      await expect(detailControl(page, name)).toBeFocused();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // detail_modal/REQ-13, REQ-17 — the dimmed area is the other way out, and it returns the point of
  // interaction the same way.
  test('a click on the dimmed area dismisses the dialog and hands the focus back too', async ({ page }) => {
    const name = `vexel-e2e-scrim-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

      await openContainerDetail(page, name);
      await expect(containerDetail(page)).toBeVisible();

      await dismissContainerDetailByScrim(page);

      await expect(detailControl(page, name)).toBeFocused();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // detail_modal/REQ-1, REQ-2, REQ-3, REQ-29 — the detail is drawn over the screen and not inside
  // the list: no card moves, the list does not scroll, and the dialog's own box is measured rather
  // than its content counted. Restates the delivered "the panel spans the grid" placement check,
  // whose subject has gone.
  test('the dialog stands over the list, which does not move while it opens and closes', async ({ page }) => {
    const stem = `vexel-e2e-dialog-geometry-${Date.now()}`;
    const names = ['a', 'b', 'c', 'd'].map((suffix) => `${stem}-${suffix}`);
    try {
      for (const name of names) await createSleepingContainer(name);
      await page.getByPlaceholder('Search name, image or state…').fill(stem);
      await expect(containerCards(page)).toHaveCount(names.length, { timeout: 20_000 });

      const before = await listGeometry(page);

      await openContainerDetail(page, names[0]);
      const detail = containerDetail(page);
      await expect(detail).toBeVisible();

      const dialogBox = await settledDialogBox(page);
      const viewport = page.viewportSize()!;
      expect(dialogBox.width, 'the dialog has no width of its own').toBeGreaterThan(0);
      expect(dialogBox.x, 'the dialog starts left of the viewport').toBeGreaterThanOrEqual(-0.5);
      expect(dialogBox.x + dialogBox.width, 'the dialog runs off the right of the viewport').toBeLessThanOrEqual(viewport.width + 0.5);
      expect(dialogBox.height, 'the dialog is taller than the viewport').toBeLessThanOrEqual(viewport.height + 0.5);

      // Not a grid item: no expansion, and nothing of the detail inside the list's own grid.
      await expect(page.locator('.ui-grid__span-full')).toHaveCount(0);
      await expect(page.locator('.ui-frame__content .ui-detail-panel')).toHaveCount(0);
      expect(await detail.evaluate((element) => element.closest('.ui-grid--cards') !== null)).toBe(false);

      const during = await listGeometry(page);
      expect(during, 'a card moved, changed height or the list scrolled while the dialog opened').toEqual(before);

      await closeContainerDetail(page);

      expect(await listGeometry(page), 'the list did not go back exactly where it was').toEqual(before);
    } finally {
      for (const name of names) await removeContainerQuietly(name);
    }
  });

  // detail_modal/REQ-11 — `Escape` leaves the dialog standing, and nothing on the screen it covers
  // is dismissed behind it. **This is the one thing the operator could do before and cannot now**:
  // the delivered check had the key close the inline panel, and it is restated rather than dropped.
  test('Escape leaves the dialog standing, from the screen and from inside the dialog itself', async ({ page }) => {
    const name = `vexel-e2e-escape-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
      const detail = containerDetail(page);

      await openContainerDetail(page, name);
      await expect(detail).toBeVisible();
      // Measured across the keystroke alone, which is the question this test asks; that a tab change
      // moves no edge either is REQ-1's own check, further down this file.
      const onConfig = await settledDialogBox(page);

      await page.keyboard.press('Escape');

      await expect(detail).toBeVisible();
      expect(await boxOf(detail, 'the container detail dialog'), 'the key moved the dialog instead of leaving it alone').toEqual(
        onConfig,
      );

      // Again, this time with the focus on a control the operator reached inside the dialog.
      await detail.getByRole('tab', { name: 'Inspect' }).click();
      await expect(detail.getByRole('tab', { name: 'Inspect' })).toBeFocused();
      const onInspect = await boxOf(detail, 'the container detail dialog');

      await page.keyboard.press('Escape');

      await expect(detail).toBeVisible();
      await expect(detail.getByRole('tab', { name: 'Inspect' })).toHaveAttribute('aria-selected', 'true');
      expect(await boxOf(detail, 'the container detail dialog'), 'the key moved the dialog instead of leaving it alone').toEqual(
        onInspect,
      );

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // detail_modal/REQ-11 — an open card menu still takes the key and closes alone; the next one
  // reaches the dialog, which does nothing with it. Restates the delivered innermost-first check
  // (plan-docker_management_app-container_detail_close/REQ-7) on the half of it that survives.
  test('with the card menu open over the dialog, Escape closes only the menu and the next one closes nothing', async ({ page }) => {
    const name = `vexel-e2e-escape-menu-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
      const detail = containerDetail(page);

      // The menu is opened first: with the dialog standing over the screen, the card's own control
      // is behind the scrim and out of a pointer's reach.
      await openOverflow(page, name);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);

      await openContainerDetail(page, name);
      await expect(detail).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(detail, 'Escape closed the dialog').toBeVisible();
      await expect(page.getByRole('menu')).toHaveCount(0);

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // detail_modal/REQ-11, REQ-14 — with a confirmation open over the dialog, `Escape` leaves both
  // exactly as they were: the confirmation claims the key innermost and does nothing with it, and
  // nothing behind it is dismissed either.
  test('with the Remove confirmation open, Escape leaves both the confirmation and the dialog as they were', async ({ page }) => {
    const name = `vexel-e2e-escape-dialog-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
      const detail = containerDetail(page);

      // The card's menu is reachable while nothing covers it; the detail is opened after it.
      await chooseCardAction(page, name, 'Remove');
      const confirmHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
      await expect(confirmHeading).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(confirmHeading).toBeVisible();

      // The confirmation is closed the way it is meant to be, leaving the container in place.
      await page.locator('.ui-modal').filter({ has: confirmHeading }).getByRole('button', { name: 'Cancel' }).click();
      await expect(confirmHeading).toHaveCount(0);

      await openContainerDetail(page, name);
      await expect(detail).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(detail).toBeVisible();

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // detail_modal/REQ-32 — a search that narrows the cards behind the dialog is not a dismissal: the
  // dialog is bound to its container by id, read from the whole list. Restates the delivered check
  // that had the card and its panel go off screen together.
  test('a search that excludes the open container narrows the list and leaves the dialog standing', async ({ page }) => {
    const name = `vexel-e2e-filter-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
      const detail = containerDetail(page);
      const search = page.getByPlaceholder('Search name, image or state…');

      await openContainerDetail(page, name);
      await expect(detail).toBeVisible();

      // The dialog covers the toolbar, so the field is reached by its own handle rather than by a
      // pointer: what is under test is the filter, not how it is typed into.
      await search.fill(`${name}-excluded-by-this-search`);

      await expect(containerCard(page, name)).toHaveCount(0);
      await expect(detail, 'a filter behind the dialog dismissed it').toBeVisible();
      await expect.poll(async () => await detailIdentity(page), { timeout: 20_000 }).toMatchObject({ name, state: 'RUNNING' });

      await search.fill('');

      await expect(containerCard(page, name)).toBeVisible();
      await expect(detail).toBeVisible();
      await expect.poll(async () => await detailIdentity(page), { timeout: 20_000 }).toMatchObject({ name, state: 'RUNNING' });

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app-container_detail_close/REQ-10 — with no detail open, Escape changes
  // nothing about what is filtered or displayed on the screen, and no card is marked.
  test('with no detail open, Escape changes nothing on the screen', async ({ page }) => {
    const name = `vexel-e2e-escape-idle-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const card = containerCard(page, name);
      await expect(card).toBeVisible({ timeout: 15_000 });
      const search = page.getByPlaceholder('Search name, image or state…');
      await search.fill(name);
      await page.getByRole('button', { name: 'Running' }).click();
      await expect(card).toBeVisible();

      await page.keyboard.press('Escape');

      await expect(search).toHaveValue(name);
      await expect(page.getByRole('button', { name: 'Running' })).toHaveAttribute('aria-pressed', 'true');
      await expect(card).toBeVisible();
      await expect(containerDetail(page)).toHaveCount(0);
      await expect(page.locator('.ui-surface--selected')).toHaveCount(0);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // ui-library/specs/frame.md, detail_modal/REQ-11 — the delivered check had the drawer take the
  // first Escape and the inline panel the second. The second half is unreachable now and is
  // **restated rather than dropped**: with the dialog standing, the drawer's own trigger is behind
  // the scrim — measured, not assumed — so nothing opens over the dialog at all, and the key leaves
  // it standing. The half that survives is checked on its own: the drawer still takes the key.
  test('at phone width the drawer still takes Escape, and nothing opens over the standing dialog', async ({ page }) => {
    const name = `vexel-e2e-escape-drawer-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
      const detail = containerDetail(page);

      // Below the phone breakpoint, which is the only place the drawer exists at
      // all: above it the rail is docked and claims nothing.
      await page.setViewportSize({ width: 390, height: 844 });

      // The half that survives: with no dialog open, the drawer opens and the key closes it.
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.locator('.ui-frame__rail--open')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.ui-frame__rail--open')).toHaveCount(0);

      await openContainerDetail(page, name);
      await expect(detail).toBeVisible();

      // The trigger is where it was and is covered by the dialog's scrim: a pointer aimed at its own
      // centre reaches the scrim, so the drawer is not a surface that can stand over this dialog.
      const covering = await page.getByRole('button', { name: 'Open navigation' }).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return { reachesItself: hit !== null && element.contains(hit), hit: hit?.className ?? null };
      });
      expect(covering.reachesItself, `the drawer trigger is reachable over the open dialog; a pointer reaches "${covering.hit}"`).toBe(
        false,
      );
      expect(covering.hit, 'the surface covering the drawer trigger is not the dialog’s own scrim').toContain('ui-modal-overlay');

      const before = await settledDialogBox(page);
      await page.keyboard.press('Escape');

      await expect(detail).toBeVisible();
      await expect(page.locator('.ui-frame__rail--open')).toHaveCount(0);
      expect(await boxOf(detail, 'the container detail dialog'), 'the key moved the dialog instead of leaving it alone').toEqual(
        before,
      );

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });
});

/**
 * Where every card of the list stands, and how far the list is scrolled — the reading a claim of
 * "nothing moved" has to be made of (CLAUDE.md, "What a check drives, and what it measures").
 */
async function listGeometry(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const round = (value: number) => Math.round(value * 10) / 10;
    const scroller = document.querySelector('.ui-frame__content .ui-scroll-area');
    const cards = Array.from(document.querySelectorAll('.ui-frame__content .ui-grid--cards > .ui-surface')).map((card) => {
      const rect = card.getBoundingClientRect();
      return `${(card.querySelector('.ui-section-header__title')?.textContent ?? '').trim()}@${round(rect.x)},${round(rect.y)} ${round(rect.width)}x${round(rect.height)}`;
    });
    return JSON.stringify({ scrollTop: round(scroller?.scrollTop ?? 0), windowScrollY: round(window.scrollY), cards });
  });
}

// Serial: these tests hold the detail open across several steps, and the list re-reads under them.
test.describe('Container detail dialog (REQ-24, REQ-25, REQ-26)', () => {
  test.describe.configure({ mode: 'serial' });

  // plan-docker_management_app/REQ-24 — the detail view carries the container's inspect data
  // organised in tabs; it is reached from the card's own control now (detail_modal/REQ-5).
  test('the card’s control opens its detail with Config and Inspect tabs', async ({ page }) => {
    const name = `vexel-e2e-detail-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const card = containerCard(page, name);
      await expect(card).toBeVisible({ timeout: 15_000 });

      await openContainerDetail(page, name);

      const detail = containerDetail(page);
      await expect(detail).toBeVisible();
      await expect(detail.getByRole('tab', { name: 'Config' })).toBeVisible();
      await expect(detail.getByRole('tab', { name: 'Inspect' })).toBeVisible();
      await expect(detail.getByRole('button', { name: 'Edit configuration' })).toBeVisible();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-26, narrowed to viewable and selectable as-is
  // (plan-docker_management_app-remove_copy_controls/REQ-23, REQ-30), and re-asserted **through the
  // now-collapsed section** (`…-tabs_composition_refactor/REQ-37`, REQ-43): closed on arrival loses
  // neither guarantee `plan-ui-coherence-optimisation/REQ-65` names — it is the same text, in full
  // and still selectable by hand, one press later.
  test('the Inspect tab shows the raw payload as selectable text, once its section is opened', async ({ page }) => {
    const name = `vexel-e2e-inspect-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const card = containerCard(page, name);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await openContainerDetail(page, name);

      const detail = containerDetail(page);
      await detail.getByRole('tab', { name: 'Inspect' }).click();

      // Closed when the tab opens: nothing of the payload is on screen before its header is pressed.
      const payload = rawPayloadSection(page);
      await expect(payload).toBeVisible({ timeout: 20_000 });
      await expect(payload.locator('.ui-collapsible-section__header')).toHaveAttribute('aria-expanded', 'false');
      await expect(detail.locator('.ui-code-viewer')).toHaveCount(0);

      await openRawPayload(page);

      await expect(detail.getByText(/"Image":\s*"alpine:3.20"/)).toBeVisible();

      // Selectable by hand is the fallback the removal leaves, so it is asserted rather than assumed.
      const block = detail.locator('.ui-code-viewer__code').last();
      await expect(block).toHaveCSS('user-select', /^(auto|text)$/);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-25 — restart policy and/or resource limits alone are applied in place, no warning
  test('editing only the restart policy saves in place without asking for confirmation', async ({ page }) => {
    const name = `vexel-e2e-config-inplace-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      const card = containerCard(page, name);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await openContainerDetail(page, name);

      const detail = containerDetail(page);
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
      const card = containerCard(page, name);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await openContainerDetail(page, name);

      const detail = containerDetail(page);
      await detail.getByRole('button', { name: 'Edit configuration' }).click();
      await detail.getByRole('textbox', { name: 'Value 1' }).fill('baz');
      await detail.getByRole('button', { name: 'Save changes' }).click();

      const dialogHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
      await expect(dialogHeading).toBeVisible();
      const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
      await dialog.getByRole('button', { name: 'Cancel' }).click();

      await expect(dialogHeading).toHaveCount(0);
      await expect(containerCard(page, name)).toBeVisible();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-25 — confirming a Docker-required recreate replaces the container, preserving its name,
  // and the outcome is reported
  test('confirming a recreate replaces the container while preserving its name and reports the outcome', async ({ page }) => {
    const name = `vexel-e2e-config-recreate-${Date.now()}`;
    // The recreate keeps the replaced container's volumes, so the orphan is this test's to remove.
    const volumesBefore = await anonymousVolumes();
    try {
      await createSleepingContainer(name, ['-e', 'FOO=bar']);
      const card = containerCard(page, name);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await openContainerDetail(page, name);

      const detail = containerDetail(page);
      await detail.getByRole('button', { name: 'Edit configuration' }).click();
      await detail.getByRole('textbox', { name: 'Value 1' }).fill('baz');
      await detail.getByRole('button', { name: 'Save changes' }).click();

      const dialogHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
      await expect(dialogHeading).toBeVisible();
      const dialog = page.locator('.ui-modal').filter({ has: dialogHeading });
      await dialog.getByRole('button', { name: 'Recreate container' }).click();

      await expect(page.locator('.ui-toast-viewport')).toContainText('Container recreated', { timeout: 15_000 });
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
    } finally {
      await removeContainerQuietly(name);
      await removeAnonymousVolumesSince(volumesBefore);
    }
  });
});

/**
 * The four things that can happen to a container while its detail stands over the screen, driven
 * against the real daemon (`plan-docker_management_app-containers_card_view-detail_modal/REQ-32`,
 * `REQ-33`, `REQ-34`, `REQ-35`, `REQ-36`). Serial: each holds the dialog open while the list
 * re-reads under it.
 */
test.describe('Container detail dialog, bound to its container (REQ-32, REQ-33, REQ-34, REQ-35, REQ-36)', () => {
  test.describe.configure({ mode: 'serial' });

  /** The statement the dialog draws where its tabs were, when the container has ceased to exist. */
  function detailEndState(page: Page) {
    return containerDetail(page).locator('.ui-empty-state__title', { hasText: 'This container no longer exists' });
  }

  /**
   * What a **centred, content-sized** surface keeps when its content merely changes, and loses the
   * moment anything drags it: the same reading `support/surface-stability.ts` takes across a click,
   * taken here across a daemon event.
   */
  function centreOf(box: { x: number; y: number; width: number; height: number }) {
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  }

  /** The list region — where the point of interaction lands when the card that opened the dialog has gone. */
  function listRegion(page: Page) {
    return page.locator('.ui-frame__content .ui-grid--cards');
  }

  /** Opens the detail and settles it, then moves to one tab and settles the box the event is measured against. */
  async function openDetailOn(page: Page, name: string, tab: string) {
    await openContainerDetail(page, name);
    await settledDialogBox(page);
    const detail = containerDetail(page);
    await detail.getByRole('tab', { name: tab }).click();
    await expect(detail.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    return await boxOf(detail, 'the container detail dialog');
  }

  // detail_modal/REQ-33, REQ-34, REQ-36 — removed by someone else on the same daemon: the dialog
  // states it in place, keeps its chrome, and its close control leaves the operator on the list.
  test('a container removed from outside the application is stated on the dialog, which stays where it is', async ({ page }) => {
    const name = `vexel-e2e-detail-removed-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
      const detail = containerDetail(page);
      const before = await openDetailOn(page, name, 'Logs');
      const removedShortId = await shortIdOf(name);

      // Removed by another client of the same daemon, exactly as the requirement puts it.
      await execFileAsync('docker', ['rm', '-fv', name]);

      await expect(detailEndState(page), 'the dialog closed silently or sat on data that had stopped').toBeVisible({
        timeout: 20_000,
      });
      await expect(containerCard(page, name)).toHaveCount(0);
      // In place of the tabs: nothing of the detail is left running behind the statement.
      await expect(detail.getByRole('tab')).toHaveCount(0);
      // The chrome is kept, so the dialog still names what it belonged to and still has its way
      // out — and the header is frozen at the last identity the list carried rather than emptying
      // out from under the operator (containers-screen.md, tabs_composition_refactor/REQ-9).
      const frozen = await detailIdentity(page);
      expect(frozen).toMatchObject({ name, shortId: removedShortId });
      expect(frozen.state, 'the frozen header states no state at all').not.toBeNull();
      expect(frozen.dot, 'the frozen header carries no status dot').not.toBeNull();
      await expect(containerDetailCloseControl(page)).toHaveCount(1);
      await expect(detail.locator('.ui-empty-state__description')).not.toBeEmpty();

      const after = await boxOf(detail, 'the container detail dialog');
      expect(
        centreOf(after),
        `the dialog was dragged when its container was removed: from (${JSON.stringify(before)}) to (${JSON.stringify(after)})`,
      ).toEqual(centreOf(before));
      const viewport = page.viewportSize()!;
      expect(after.y, 'the dialog was carried above the top of the viewport').toBeGreaterThanOrEqual(-0.5);
      expect(after.y + after.height, 'the dialog was carried below the viewport').toBeLessThanOrEqual(viewport.height + 0.5);

      await closeContainerDetail(page);

      // The card that opened it left with the container, so the list region takes the focus (REQ-36).
      await expect(listRegion(page), 'the point of interaction was left on a control that no longer exists').toBeFocused();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // detail_modal/REQ-34 — the other way out works there too: nothing strands the operator in the
  // stated end state.
  test('the stated end state is dismissed by a click on the dimmed area as well', async ({ page }) => {
    const name = `vexel-e2e-detail-removed-scrim-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
      await openDetailOn(page, name, 'Logs');

      await execFileAsync('docker', ['rm', '-fv', name]);
      await expect(detailEndState(page)).toBeVisible({ timeout: 20_000 });

      await dismissContainerDetailByScrim(page);

      await expect(listRegion(page)).toBeFocused();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // detail_modal/REQ-32 — a container dropping out of the *filtered* list has not gone anywhere:
  // same container, same tab, no statement of a disappearance.
  test('a container stopped out of the running filter leaves its dialog open on the same tab', async ({ page }) => {
    const name = `vexel-e2e-detail-filtered-out-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
      await page.getByPlaceholder('Search name, image or state…').fill(name);
      await page.getByRole('button', { name: 'Running' }).click();
      await expect(containerCard(page, name)).toBeVisible();

      const detail = containerDetail(page);
      const before = await openDetailOn(page, name, 'Stats');

      // Stopped from outside the application: it drops out of the filtered list behind the dialog.
      await execFileAsync('docker', ['stop', '-t', '0', name]);

      await expect(containerCard(page, name), 'the container never left the filtered list').toHaveCount(0, { timeout: 20_000 });
      await expect(detail, 'a filter behind the dialog dismissed it').toBeVisible();
      await expect(detailEndState(page), 'a filtered-out container was stated as no longer existing').toHaveCount(0);
      // The header reads the same list the filter did, so the state it states is the new one
      // (tabs_composition_refactor/REQ-9) and the container is still the one it was opened for.
      await expect.poll(async () => await detailIdentity(page), { timeout: 20_000 }).toMatchObject({
        dot: 'neutral',
        name,
        state: 'EXITED',
      });
      await expect(detail.getByRole('tab', { name: 'Stats' })).toHaveAttribute('aria-selected', 'true');

      const after = await boxOf(detail, 'the container detail dialog');
      expect(centreOf(after), 'the dialog was dragged when its container left the filtered list').toEqual(centreOf(before));

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // detail_modal/REQ-32 — a list re-read that moves and redraws the cards is not a dismissal
  // either: the bond is to the container, not to the row it happens to occupy.
  test('a list re-read that moves the cards behind the dialog leaves it untouched', async ({ page }) => {
    const stem = `vexel-e2e-detail-reread-${Date.now()}`;
    const opened = `${stem}-b`;
    const arriving = `${stem}-a`;
    try {
      await createSleepingContainer(opened);
      await page.getByPlaceholder('Search name, image or state…').fill(stem);
      await expect(containerCards(page)).toHaveCount(1, { timeout: 20_000 });

      const detail = containerDetail(page);
      const before = await openDetailOn(page, opened, 'Inspect');
      const cardBefore = await boxOf(containerCard(page, opened), `the card of ${opened}`);

      // A daemon event the list re-reads on, landing a card ahead of the open one.
      await createSleepingContainer(arriving);

      await expect(containerCards(page)).toHaveCount(2, { timeout: 20_000 });
      const cardAfter = await boxOf(containerCard(page, opened), `the card of ${opened}`);
      expect(
        { x: Math.round(cardAfter.x), y: Math.round(cardAfter.y) },
        'the re-read did not move the open container’s card, so this proves nothing',
      ).not.toEqual({ x: Math.round(cardBefore.x), y: Math.round(cardBefore.y) });

      await expect(detail, 'a list re-read behind the dialog dismissed it').toBeVisible();
      await expect(detailEndState(page)).toHaveCount(0);
      await expect.poll(async () => await detailIdentity(page), { timeout: 20_000 }).toMatchObject({ name: opened, state: 'RUNNING' });
      await expect(detail.getByRole('tab', { name: 'Inspect' })).toHaveAttribute('aria-selected', 'true');

      const after = await boxOf(detail, 'the container detail dialog');
      expect(after, 'the dialog moved or was resized by a re-read of the list behind it').toEqual(before);

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(opened);
      await removeContainerQuietly(arriving);
    }
  });

  // detail_modal/REQ-35 — a configuration change that recreates the container is not a
  // disappearance: the dialog follows it onto the new container, and states nothing in between.
  test('a recreate through the Config tab keeps the dialog open and follows it onto the new container', async ({ page }) => {
    const name = `vexel-e2e-detail-recreate-${Date.now()}`;
    // The recreate keeps the replaced container's volumes, so the orphan is this test's to remove.
    const volumesBefore = await anonymousVolumes();
    try {
      await createSleepingContainer(name, ['-e', 'FOO=bar']);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
      const idBefore = (await execFileAsync('docker', ['inspect', '-f', '{{.Id}}', name])).stdout.trim();

      await openContainerDetail(page, name);
      const detail = containerDetail(page);
      await settledDialogBox(page);
      await detail.getByRole('button', { name: 'Edit configuration' }).click();
      await detail.getByRole('textbox', { name: 'Value 1' }).fill('baz');
      await detail.getByRole('button', { name: 'Save changes' }).click();

      const confirmHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
      await expect(confirmHeading).toBeVisible();
      await page.locator('.ui-modal').filter({ has: confirmHeading }).getByRole('button', { name: 'Recreate container' }).click();

      // Sampled all the way through the window between the recreate and the refreshed list: the
      // end state must never be drawn in it, not even for a frame this poll happens to catch.
      const statedGone: string[] = [];
      await expect
        .poll(
          async () => {
            if ((await detailEndState(page).count()) > 0) statedGone.push(new Date().toISOString());
            return (await page.locator('.ui-toast-viewport').textContent()) ?? '';
          },
          { timeout: 20_000 },
        )
        .toContain('Container recreated');
      expect(statedGone, 'the dialog stated a disappearance while the recreate was landing').toEqual([]);

      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
      await expect(detail, 'the recreate closed the dialog').toBeVisible();
      await expect(detailEndState(page), 'the recreate was read as a disappearance').toHaveCount(0);
      await expect.poll(async () => await detailIdentity(page), { timeout: 20_000 }).toMatchObject({ name, state: 'RUNNING' });

      // …and it is the *new* container it is showing: the daemon's own id for it, in the payload —
      // and in the header, which is re-pointed onto the replacement (tabs_composition_refactor/REQ-9).
      const idAfter = (await execFileAsync('docker', ['inspect', '-f', '{{.Id}}', name])).stdout.trim();
      expect(idAfter, 'the daemon did not recreate the container, so this proves nothing').not.toBe(idBefore);
      await expect
        .poll(async () => (await detailIdentity(page)).shortId, { timeout: 20_000 })
        .toBe(idAfter.slice(0, 12));
      await detail.getByRole('tab', { name: 'Inspect' }).click();
      // The payload's section is closed when the tab opens (`…-tabs_composition_refactor/REQ-37`),
      // so it is opened before it is read.
      await openRawPayload(page);
      await expect
        .poll(async () => (await detail.locator('.ui-code-viewer__code').last().textContent()) ?? '', { timeout: 20_000 })
        .toContain(idAfter);

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
      await removeAnonymousVolumesSince(volumesBefore);
    }
  });
});

/**
 * **One height for the whole detail, and the tab's content scrolling inside it** —
 * `plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor`, REQ-1,
 * REQ-3, REQ-4, driven under REQ-44: a real pointer at each visible control's own coordinates, and
 * the dialog's **viewport box** as the measurement, with content assertions beside it.
 *
 * The tabs are read off the bar rather than listed here: REQ-43 refuses a check that names a tab by
 * position, and the plan reorders them two batches on.
 */
test.describe('Container detail dialog, the tab row (REQ-11, REQ-12)', () => {
  test.describe.configure({ mode: 'serial' });

  /**
   * Every tab the bar holds, **as the browser paints it**: where it sits, whether it is the one
   * showing, and the treatment the eye reads. REQ-12 is about drawn appearance, so the comparison is
   * made on computed style rather than on the elements merely existing and being enabled.
   */
  async function tabsAsDrawn(page: Page) {
    return await containerDetail(page)
      .locator('[role="tab"]')
      .evaluateAll((tabs) =>
        tabs.map((tab) => {
          const style = getComputedStyle(tab);
          const box = tab.getBoundingClientRect();
          return {
            label: (tab.textContent ?? '').trim(),
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            active: tab.getAttribute('aria-selected') === 'true',
            unavailable: (tab as HTMLButtonElement).disabled || tab.hasAttribute('aria-disabled'),
            treatment: [
              `color=${style.color}`,
              `background=${style.backgroundColor}`,
              `opacity=${style.opacity}`,
              `filter=${style.filter}`,
              `weight=${style.fontWeight}`,
              `size=${style.fontSize}`,
              `style=${style.fontStyle}`,
              `decoration=${style.textDecorationLine}`,
              `border=${style.borderTopColor} ${style.borderTopStyle}`,
              `cursor=${style.cursor}`,
              `pointerEvents=${style.pointerEvents}`,
              `visibility=${style.visibility}`,
            ].join(' | '),
          };
        }),
      );
  }

  /** The order the row is read in — line by line, left to right — rather than the order of the markup. */
  function readingOrder(tabs: { label: string; x: number; y: number }[]): string[] {
    return [...tabs].sort((a, b) => (Math.round(a.y) === Math.round(b.y) ? a.x - b.x : a.y - b.y)).map((tab) => tab.label);
  }

  /**
   * The detail of a running container, opened with a real pointer on the card's own control, with
   * the pointer then parked away from the bar: a tab under the pointer would be read hovered, and a
   * treatment read hovered is not the treatment the row is drawn with.
   */
  async function openRunningDetail(page: Page, name: string) {
    await createSleepingContainer(name);
    await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
    await openContainerDetail(page, name);
    await settledDialogBox(page);
    const detail = containerDetail(page);
    // Polled, not assumed: a container just started still reads CREATED for a moment, and the two
    // session tabs are offered only once the daemon calls it running.
    await expect(detail.getByRole('tab', { name: 'Attach', exact: true })).toBeVisible({ timeout: 20_000 });
    await page.mouse.move(2, 2);
    return detail;
  }

  // REQ-11, `…-inspect_full_payload/REQ-1` — Config is the first tab of the bar **and** the tab
  // active when the detail opens; Inspect is immediately after it and the rest follow as Logs,
  // Stats, Processes and, for a running container, Exec, Attach.
  test('the detail opens on the tab it draws first, and that tab is Config', async ({ page }) => {
    const name = `vexel-e2e-tab-order-${Date.now()}`;
    try {
      const detail = await openRunningDetail(page, name);

      const tabs = await tabsAsDrawn(page);
      expect(tabs.map((tab) => tab.label), `the bar drew ${JSON.stringify(tabs.map((tab) => tab.label))}`).toEqual([
        'Config',
        'Inspect',
        'Logs',
        'Stats',
        'Processes',
        'Exec',
        'Attach',
      ]);
      // Leftmost as painted, not merely first in the markup: read by coordinate, line by line, so a
      // row reordered by CSS alone would still be caught.
      expect(readingOrder(tabs), 'the order the row is painted in is not the order it is written in').toEqual(tabs.map((tab) => tab.label));
      console.log(`[REQ-11] the bar draws ${tabs.map((tab) => tab.label).join(' · ')}, showing ${tabs.find((tab) => tab.active)?.label}`);

      // The tab drawn first and the tab opened on are the same one — asserted off the row, so the
      // two cannot pass by agreeing on a name while being different positions.
      expect(tabs.filter((tab) => tab.active).map((tab) => tab.label)).toEqual(['Config']);
      expect(tabs[0]!.active, 'the detail opened on a tab other than the one it draws first').toBe(true);
      // …and what is shown under the bar is Config's own content, not an empty region above it.
      await expect(detail.getByRole('button', { name: 'Edit configuration' })).toBeVisible();

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // REQ-12 — every tab presented carries the same treatment, with only the active one distinguished:
  // on a running container Exec and Attach are drawn exactly like the other five. The mock's muted
  // drawing of that pair is a drafting device, and this is the check that keeps it out of the build.
  test('draws the seven tabs alike, distinguishing only the one showing', async ({ page }) => {
    const name = `vexel-e2e-tab-treatment-${Date.now()}`;
    try {
      const detail = await openRunningDetail(page, name);

      const tabs = await tabsAsDrawn(page);
      expect(tabs).toHaveLength(7);
      const others = tabs.filter((tab) => !tab.active);
      expect(others.map((tab) => tab.label)).toEqual(['Inspect', 'Logs', 'Stats', 'Processes', 'Exec', 'Attach']);
      const painted = others.map((tab) => `${tab.label} → ${tab.treatment}`);
      console.log(`[REQ-12] the six tabs not showing are painted ${others[0]!.treatment}`);
      expect(new Set(others.map((tab) => tab.treatment)).size, `the tabs not showing are not painted alike:\n${painted.join('\n')}`).toBe(1);
      expect(tabs.filter((tab) => tab.unavailable).map((tab) => tab.label), 'a tab is offered and refused at once').toEqual([]);
      expect(tabs.every((tab) => tab.width > 0 && tab.height > 0), 'a tab is clipped to nothing').toBe(true);
      // The other half of the same sentence: the active one *is* distinguished.
      expect(tabs.find((tab) => tab.active)!.treatment).not.toBe(others[0]!.treatment);

      // And the distinction belongs to whichever tab is showing, not to a pair held apart: Exec takes
      // a real pointer at its own coordinates, becomes the shown one, and the six left — Config now
      // among them — are painted alike again.
      await clickAtItsCentre(page, detail.getByRole('tab', { name: 'Exec', exact: true }), 'the Exec tab');
      await expect(detail.getByRole('tab', { name: 'Exec', exact: true })).toHaveAttribute('aria-selected', 'true');
      await page.mouse.move(2, 2);

      const afterExec = await tabsAsDrawn(page);
      const restingAfterExec = afterExec.filter((tab) => !tab.active);
      expect(afterExec.filter((tab) => tab.active).map((tab) => tab.label)).toEqual(['Exec']);
      expect(restingAfterExec.map((tab) => tab.label)).toEqual(['Config', 'Inspect', 'Logs', 'Stats', 'Processes', 'Attach']);
      expect(
        new Set(restingAfterExec.map((tab) => tab.treatment)).size,
        `with Exec showing, the tabs at rest are not painted alike:\n${restingAfterExec.map((tab) => `${tab.label} → ${tab.treatment}`).join('\n')}`,
      ).toBe(1);
      expect(restingAfterExec[0]!.treatment, 'the treatment a tab rests in changed with which tab is showing').toBe(others[0]!.treatment);

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });
});

test.describe('Container detail dialog, one stable height (REQ-1, REQ-3, REQ-4)', () => {
  test.describe.configure({ mode: 'serial' });

  /** The card — the glass box of the dialog, which is what "the dialog's frame" names. */
  function detailCard(page: Page) {
    return page.locator('.ui-modal__positioner');
  }

  /** The tab row: a band of the arrangement, and the chrome that must stay put (REQ-3). */
  function tabRow(page: Page) {
    return containerDetail(page).locator('.ui-tabs');
  }

  /** The region the active tab is drawn in: the one that absorbs the height the bands leave. */
  function tabRegion(page: Page) {
    return containerDetail(page).locator('.ui-band-stack__fill');
  }

  /** The names the bar actually offers, in the order it draws them. */
  async function tabsOffered(page: Page): Promise<string[]> {
    const names = await containerDetail(page).getByRole('tab').allTextContents();
    return names.map((name) => name.trim()).filter((name) => name.length > 0);
  }

  /** Every scrolling box inside the dialog, with where each one is scrolled to. */
  async function scrollersInsideTheDialog(page: Page) {
    return await page.evaluate(() => {
      const dialog = document.querySelector('.ui-modal--size-large');
      if (dialog === null) return [];
      const scrollers: { what: string; scrollTop: number; scrollHeight: number; clientHeight: number }[] = [];
      for (const element of [dialog, ...dialog.querySelectorAll('*')]) {
        const overflowY = getComputedStyle(element).overflowY;
        if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
        if (element.scrollHeight <= element.clientHeight + 1) continue;
        scrollers.push({
          what: `${element.tagName.toLowerCase()}.${String((element as HTMLElement).className).split(' ')[0]}`,
          scrollTop: element.scrollTop,
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        });
      }
      return scrollers;
    });
  }

  /** What the page behind the dialog scrolls, if anything. */
  async function pageScrollExtent(page: Page) {
    return await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      return { scrollHeight: root.scrollHeight, clientHeight: root.clientHeight };
    });
  }

  // REQ-1, REQ-44 — every tab in turn, chosen with a real pointer at the tab's own coordinates: the
  // dialog's frame is the same box after each change as it was before the first one, read both the
  // instant the tab changes and once the tab's content has arrived.
  test('the dialog keeps one viewport box across a change to every tab it offers', async ({ page }) => {
    const name = `vexel-e2e-detail-height-tabs-${Date.now()}`;
    try {
      // Running, so the two session tabs are offered as well: "any pair of tabs" is every tab the
      // bar actually draws, not the five a stopped container has.
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

      await openContainerDetail(page, name);
      const card = detailCard(page);
      // Polled, not assumed: a container just started still reads CREATED for a moment, and the two
      // session tabs are offered only once the daemon calls it running. Waited for **before** the
      // reference box is taken, so the box and the walk belong to the same bar — without it the set
      // below is whatever the daemon had got round to reporting, which is a race of the test's own.
      await expect(containerDetail(page).getByRole('tab', { name: 'Attach', exact: true })).toBeVisible({ timeout: 20_000 });
      await settledDialogBox(page);
      const reference = await boxOf(card, 'the container detail dialog');

      const tabs = await tabsOffered(page);
      // The set, never the order: what this check needs is that the walk below covers every tab the
      // bar offers, and the order itself is the subject of REQ-11's own check above. The two session
      // tabs are named because a running container offers them (containers/specs/container-detail-panel.md).
      expect(new Set(tabs), `the bar offered ${JSON.stringify(tabs)}`).toEqual(
        new Set(['Config', 'Logs', 'Stats', 'Processes', 'Inspect', 'Exec', 'Attach']),
      );
      console.log(`[REQ-1] the dialog holds one ${reference.width.toFixed(1)}×${reference.height.toFixed(1)} box across ${tabs.length} tabs`);
      const seen: string[] = [];
      for (const tab of tabs) {
        const control = containerDetail(page).getByRole('tab', { name: tab, exact: true });
        await clickAtItsCentre(page, control, `the ${tab} tab`);
        await expect(control, `the ${tab} tab did not become the active one`).toHaveAttribute('aria-selected', 'true');

        // Two readings, and the pair is the point. The first is single-frame, taken the instant the
        // tab changes, where a frame of a taller or shorter card would show; the second is settled,
        // where the arriving content of the new tab would show.
        const onArrival = await boxThisFrame(card, 'the container detail dialog');
        expect(onArrival, `the dialog's box changed the instant the ${tab} tab was chosen`).toEqual(reference);
        const settled = await boxOf(card, 'the container detail dialog');
        expect(settled, `the dialog's box changed as the ${tab} tab's content arrived`).toEqual(reference);
        seen.push(tab);
      }

      // Content beside the geometry (REQ-44): the walk moved through the tabs rather than pressing
      // the same one seven times.
      expect(seen, 'the walk did not reach every tab the bar offers').toEqual(tabs);

      // …and back again, over the two ends of the row — Attach and, since REQ-11 moved it there,
      // Config: a return to a tab already visited is still the same box.
      for (const tab of [tabs[tabs.length - 1]!, tabs[0]!]) {
        const control = containerDetail(page).getByRole('tab', { name: tab, exact: true });
        await clickAtItsCentre(page, control, `the ${tab} tab`);
        await expect(control).toHaveAttribute('aria-selected', 'true');
        expect(await boxOf(card, 'the container detail dialog'), `the dialog's box changed on returning to ${tab}`).toEqual(reference);
      }

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // REQ-3, REQ-44 — a tab taller than the region it is given scrolls **inside** the dialog: the tab
  // row stays put, every tab stays reachable, nothing is drawn outside the card, and the page behind
  // it has nothing to scroll. Driven with a real wheel over the region, not by assigning scrollTop.
  test.describe('with a window too short for the tab it shows', () => {
    test.use({ viewport: { width: 1280, height: 600 } });

    test('the tab content scrolls inside the dialog, and the page behind it does not scroll at all', async ({ page }) => {
      const name = `vexel-e2e-detail-height-scroll-${Date.now()}`;
      try {
        await createSleepingContainer(name);
        await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

        await openContainerDetail(page, name);
        const detail = containerDetail(page);
        const card = detailCard(page);
        await settledDialogBox(page);
        const beforeTheChange = await boxOf(card, 'the container detail dialog');
        const rowBefore = await boxOf(tabRow(page), 'the tab row');

        // Inspect is the tab that holds the whole raw payload, so it is the one certain to be taller
        // than a 600px window leaves it. The payload's own section is closed when the tab opens
        // (`…-tabs_composition_refactor/REQ-37`), so it is opened here — with a real pointer at its
        // header — and the premise is what it always was rather than a weaker one.
        const inspect = detail.getByRole('tab', { name: 'Inspect', exact: true });
        await clickAtItsCentre(page, inspect, 'the Inspect tab');
        await expect(inspect).toHaveAttribute('aria-selected', 'true');
        await clickAtItsCentre(page, rawPayloadSection(page).locator('.ui-collapsible-section__header'), 'the Raw payload header');
        await expect(detail.locator('.ui-code-viewer__code').last()).toBeVisible({ timeout: 20_000 });

        const scrollersBefore = await scrollersInsideTheDialog(page);
        expect(
          scrollersBefore.length,
          `nothing inside the dialog can scroll, so this tab is not taller than the region and proves nothing: ${JSON.stringify(
            scrollersBefore,
          )}`,
        ).toBeGreaterThan(0);

        // Nothing is drawn outside the card: the region holding the tab sits within the card's own
        // box, top and bottom.
        const cardBox = await boxOf(card, 'the container detail dialog');
        const regionBox = await boxOf(tabRegion(page), "the active tab's region");
        expect(regionBox.y, "the tab's region starts above the card").toBeGreaterThanOrEqual(cardBox.y - 1);
        expect(
          regionBox.y + regionBox.height,
          `the tab's region ends ${(regionBox.y + regionBox.height - cardBox.y - cardBox.height).toFixed(1)}px below the card`,
        ).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);

        // …and the card itself is not what scrolls: a body overflowing the card would put a second
        // scrollbar around content that already has one (`ui-library/specs/modal.md`), which is the
        // shape "rendered outside the card" takes here.
        const cardScroll = await containerDetail(page).evaluate((element) => ({
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
        }));
        expect(
          cardScroll.scrollHeight,
          `the dialog card scrolls its own body: ${cardScroll.scrollHeight}px of content in a ${cardScroll.clientHeight}px card`,
        ).toBeLessThanOrEqual(cardScroll.clientHeight + 1);

        const wheeled = await movePointerTo(page, tabRegion(page), "the active tab's region");
        await page.mouse.wheel(0, 400);
        await expect
          .poll(async () => (await scrollersInsideTheDialog(page)).some((scroller) => scroller.scrollTop > 0), {
            timeout: 5000,
            message: `a wheel over the tab's region at (${wheeled.x.toFixed(0)}, ${wheeled.y.toFixed(0)}) scrolled nothing inside the dialog`,
          })
          .toBe(true);

        // The page behind it has nothing to scroll, before or after the wheel.
        const behind = await pageScrollExtent(page);
        expect(
          behind.scrollHeight,
          `the page behind the dialog scrolls: ${behind.scrollHeight}px of content in a ${behind.clientHeight}px page`,
        ).toBeLessThanOrEqual(behind.clientHeight + 1);

        // The chrome stayed where it was, through the tab change and through the scroll…
        expect(await boxOf(card, 'the container detail dialog'), 'the dialog moved or resized').toEqual(beforeTheChange);
        expect(await boxOf(tabRow(page), 'the tab row'), 'the tab row moved with the content it sits above').toEqual(rowBefore);

        // …and every tab is still reachable: on screen, and inside the window.
        const viewport = page.viewportSize()!;
        for (const tab of await tabsOffered(page)) {
          const control = detail.getByRole('tab', { name: tab, exact: true });
          const box = await boxOf(control, `the ${tab} tab`);
          expect(box.y, `the ${tab} tab is above the top of the window`).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height, `the ${tab} tab is below the bottom of the window`).toBeLessThanOrEqual(viewport.height + 1);
        }

        await closeContainerDetail(page);
      } finally {
        await removeContainerQuietly(name);
      }
    });
  });

  // REQ-3 — the two tabs that are a surface of their own take the height of the region they are
  // placed in, rather than a maximum of their own, and scroll inside themselves
  // (`containers/specs/container-detail-panel.md`). Measured at a window tall enough that a stated
  // maximum would leave a visible band of surface under the view.
  test.describe('with a window taller than either view used to ask for', () => {
    test.use({ viewport: { width: 1440, height: 1000 } });

    test('the log stream and the terminal reach the bottom of the region their tab is given', async ({ page }) => {
      const name = `vexel-e2e-detail-height-fill-${Date.now()}`;
      try {
        await createSleepingContainer(name);
        await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

        await openContainerDetail(page, name);
        const detail = containerDetail(page);
        await settledDialogBox(page);
        const reference = await boxOf(detailCard(page), 'the container detail dialog');

        const logs = detail.getByRole('tab', { name: 'Logs', exact: true });
        await clickAtItsCentre(page, logs, 'the Logs tab');
        await expect(detail.locator('.ui-log-stream')).toBeVisible({ timeout: 20_000 });
        const onLogs = await boxesOf(page, { region: tabRegion(page), view: detail.locator('.ui-log-stream') }, 'the Logs tab');
        console.log(
          `[REQ-3] the log stream ends at ${(onLogs.view!.y + onLogs.view!.height).toFixed(1)}px in a region ending at ${(
            onLogs.region!.y + onLogs.region!.height
          ).toFixed(1)}px`,
        );
        expect(
          Math.abs(onLogs.view!.y + onLogs.view!.height - onLogs.region!.y - onLogs.region!.height),
          'the log stream stops short of the region it is placed in, leaving a band of surface under it',
        ).toBeLessThanOrEqual(2);

        const exec = detail.getByRole('tab', { name: 'Exec', exact: true });
        await clickAtItsCentre(page, exec, 'the Exec tab');
        // The fixture image ships `/bin/sh` and no bash, as small images do; on the control's
        // own default the session dies at once and the surface measured below is a dead one.
        // A native `select` is driven by `selectOption` and not by a pointer: a real click on
        // one opens the platform's own dropdown, which the page cannot see.
        await detail.getByRole('combobox', { name: 'Shell' }).selectOption('/bin/sh');
        await clickAtItsCentre(page, detail.getByRole('button', { name: 'Launch session' }), 'the Launch session control');
        await expect(detail.getByText('Connected')).toBeVisible({ timeout: 20_000 });
        const onExec = await boxesOf(page, { region: tabRegion(page), view: detail.locator('.ui-session-surface') }, 'the Exec tab');
        console.log(
          `[REQ-3] the session surface ends at ${(onExec.view!.y + onExec.view!.height).toFixed(1)}px in a region ending at ${(
            onExec.region!.y + onExec.region!.height
          ).toFixed(1)}px`,
        );
        expect(
          Math.abs(onExec.view!.y + onExec.view!.height - onExec.region!.y - onExec.region!.height),
          'the session surface stops short of the region it is placed in, leaving a band of surface under the terminal',
        ).toBeLessThanOrEqual(2);

        // Neither view took its height out of the dialog's: the frame is the box it opened at.
        expect(await boxOf(detailCard(page), 'the container detail dialog'), 'the dialog was resized by the views filling it').toEqual(
          reference,
        );

        // Dismissed by the dialog's own control, which is what ends the session (REQ-42).
        await closeContainerDetail(page);
      } finally {
        await removeContainerQuietly(name);
      }
    });
  });

  // REQ-4 — the height is bounded by the viewport on **every** viewport: the whole card inside the
  // window, keeping the margin the overlay itself states, at four window sizes including a short one
  // and a phone.
  test('the whole dialog fits inside the window, with its margin, at every viewport', async ({ page }) => {
    const name = `vexel-e2e-detail-height-bounds-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

      await openContainerDetail(page, name);
      const card = detailCard(page);
      await settledDialogBox(page);

      for (const viewport of [
        { width: 1280, height: 800 },
        { width: 1280, height: 600 },
        { width: 1024, height: 500 },
        { width: 375, height: 812 },
      ]) {
        await page.setViewportSize(viewport);
        const box = await boxOf(card, 'the container detail dialog');
        // The delivered margin, read from the overlay that states it rather than written out here.
        const margin = await page.locator('.ui-modal-overlay').evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingTop));
        const label = `${viewport.width}×${viewport.height}`;
        expect(margin, `${label} — the overlay states no margin to check the dialog against`).toBeGreaterThan(0);
        expect(box.y, `${label} — the dialog's top edge is at ${box.y.toFixed(1)}px, inside the ${margin}px margin`).toBeGreaterThanOrEqual(
          margin - 1,
        );
        expect(
          box.y + box.height,
          `${label} — the dialog's bottom edge is at ${(box.y + box.height).toFixed(1)}px of a ${viewport.height}px window`,
        ).toBeLessThanOrEqual(viewport.height - margin + 1);
      }

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });
});
