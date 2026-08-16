import { expect, test, type Locator, type Page } from '../support/test.js';
import { openApp } from '../support/fixtures.js';
import { pluginIsInstalled, removePluginQuietly, startPluginFixture, type PluginFixture } from '../../../server/test/support/plugin-fixture.js';

// The one place a plugin is actually installed through the interface
// (REQ-111).
//
// `docker plugin ls` is a single, host-wide list that no label can scope, so
// this spec lives apart and runs after everything else: it installs one plugin
// of its own making, walks it through the state changes the screen offers, and
// removes it — in an `afterAll` that runs on failure too, leaving the list
// exactly as it was found.
//
// The plugin comes from a throwaway registry started here, so nothing is pulled
// from the internet. It is never enabled successfully on purpose: its
// entrypoint is not a plugin binary, which makes it the honest fixture for the
// other half of REQ-111 — the daemon's refusal, reported as the daemon words
// it, with the row left showing what is actually true.

let fixture: PluginFixture;
/**
 * The name the plugin is installed under. Deliberately the reference itself,
 * registry port and all: `daemon-plugins-service.md` states that a private
 * registry listening on a port is named that way on every call, listing
 * included, so the screen has to install, list, inspect, switch and remove a
 * plugin under exactly that name.
 */
let installedAs: string;

function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

/**
 * The daemon inventory, by the section header titling it.
 *
 * Named by **what it holds** rather than by the surface it used to be: its
 * section header and toolbar sit above the one unpadded card holding the list
 * (`plugins-screen.md`, and
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`),
 * so a card can no longer be found by the heading it used to hold. The panel is
 * the innermost region carrying both the heading and the list.
 */
function daemonPanel(page: Page) {
  return screenContent(page)
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Daemon plugins' }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

/**
 * A plugin's row, by the name it states.
 *
 * It used to be reached through the surface the row was drawn on — the retired
 * presentation put every row on a carrier of its own, `.ui-data-table__body >
 * .ui-surface`, which held the row, its content and the panel it expanded into
 * at once. Since
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-18`
 * there is no per-row surface — that is the whole change — and the row and its
 * expansion are **siblings** in the body. So each is named for what it is: the
 * row here, the panel below.
 */
function pluginRow(page: Page, name: string): Locator {
  return daemonPanel(page)
    .locator('.ui-data-table__row')
    .filter({ has: page.locator('.ui-table-two-line-cell__title', { hasText: name }) });
}

/**
 * The inspection a row opened — the list's one open expansion, the component
 * guaranteeing at most one per list (`data-table.md`).
 */
function pluginInspection(page: Page): Locator {
  return daemonPanel(page).locator('.ui-data-table__expanded');
}

/** The cell of the plugin's row stating what the daemon says its state is. */
function pluginState(page: Page, name: string): Locator {
  return pluginRow(page, name).locator('.ui-data-table__cell').filter({ has: page.locator('.ui-table-badge-list-cell') }).first();
}

/**
 * The part of a switch a human actually clicks. The switch's `input` is
 * visually hidden behind its track (toggle.md renders both inside one label),
 * so a click aimed at the input is intercepted by the track — which is the
 * gesture the operator makes anyway.
 */
function toggleTrack(scope: Locator): Locator {
  return scope.locator('.ui-toggle__track');
}

test.beforeAll(async () => {
  fixture = await startPluginFixture('e2e-plugins-install', `e2e-excl-${process.pid}-${Date.now()}`);
  installedAs = fixture.installedName;
});

test.afterAll(async () => {
  await removePluginQuietly(fixture.alias);
  await removePluginQuietly(fixture.installedName);
  await fixture.stop();
});

test.beforeEach(async ({ page }) => {
  await openApp(page, 'plugins');
  await expect(screenContent(page).getByRole('heading', { level: 2, name: 'Daemon plugins' })).toBeVisible({ timeout: 20_000 });
});

// plan-docker_management_app/REQ-99, plan-docker_management_app/REQ-111 — a daemon plugin is
// installed from a reference after reviewing and granting the privileges it requests, then
// inspected, its state changes reflected in the list, and removed as a destructive action.
test('a plugin is installed only after its privileges are granted, then inspected, and removed as destructive', async ({ page }) => {
  test.setTimeout(120_000);

  try {
    // --- Installed only after the grant (REQ-99) ---
    // The screen's page-level action lives in the daemon list's toolbar since batch 10 (REQ-46).
    await daemonPanel(page).locator('.ui-screen-toolbar').getByRole('button', { name: 'Install plugin' }).click();
    const form = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Install daemon plugin' }) });
    await form.getByRole('textbox', { name: 'Plugin reference' }).fill(fixture.reference);
    // Left disabled on purpose: this fixture cannot come up, and enabling is the
    // refusal exercised further down.
    await toggleTrack(form).click();
    await expect(form.getByRole('checkbox', { name: 'Enable once installed' })).not.toBeChecked();
    await form.getByRole('button', { name: 'Review privileges' }).click();

    const review = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Confirm: ${fixture.reference}` }) });
    await expect(review).toBeVisible({ timeout: 30_000 });
    for (const privilege of fixture.privileges) {
      await expect(review.getByText(privilege.name, { exact: true })).toBeVisible();
    }
    expect(await pluginIsInstalled(installedAs)).toBe(false);

    await review.getByRole('button', { name: 'Grant and install' }).click();

    // --- The state change is reflected in the list and on the daemon (REQ-111) ---
    await expect(pluginRow(page, installedAs)).toBeVisible({ timeout: 60_000 });
    await expect(pluginState(page, installedAs)).toHaveText('disabled');
    expect(await pluginIsInstalled(installedAs)).toBe(true);
    await expect(pluginRow(page, installedAs)).toContainText('volume driver');

    // --- Inspected in place ---
    await pluginRow(page, installedAs).getByRole('button', { name: 'Inspect' }).click();
    const inspection = pluginInspection(page);
    await expect(inspection).toBeVisible();
    await expect(inspection).toContainText('CAP_SYS_ADMIN');
    await expect(inspection).toContainText(installedAs);
    await pluginRow(page, installedAs).getByRole('button', { name: 'Hide' }).click();
    await expect(inspection).toBeHidden();

    // --- A state change the daemon refuses is reported, and nothing is forced ---
    await toggleTrack(pluginRow(page, installedAs)).click();
    await expect(screenContent(page).locator('.ui-error-banner').or(page.locator('.ui-toast'))).toBeVisible({ timeout: 30_000 });
    await expect(pluginState(page, installedAs)).toHaveText('disabled');
    expect(await pluginIsInstalled(installedAs)).toBe(true);

    // --- Removed, as a destructive action naming the plugin (REQ-6, REQ-111) ---
    await pluginRow(page, installedAs).getByRole('button', { name: 'Remove' }).click();
    const confirmation = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Confirm: ${installedAs}` }) });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('disabled first');
    await confirmation.getByRole('button', { name: 'Remove' }).click();

    await expect(pluginRow(page, installedAs)).toHaveCount(0, { timeout: 60_000 });
    expect(await pluginIsInstalled(installedAs)).toBe(false);
  } finally {
    await removePluginQuietly(installedAs);
  }
});
