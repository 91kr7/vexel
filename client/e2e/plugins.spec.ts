import { expect, test, type Locator, type Page } from '@playwright/test';
import { openApp } from './support/fixtures.js';
import { pluginIsInstalled, removePluginQuietly, startPluginFixture, type PluginFixture } from '../../server/test/support/plugin-fixture.js';

// The Plugins screen in a real browser, against the operator's own Docker
// installation (REQ-98, REQ-99, REQ-111).
//
// Nothing here installs a plugin. `docker plugin ls` is a host-wide list no
// label can scope, so the install itself lives in `e2e/exclusive/plugins.spec.ts`;
// what this file drives is everything that leaves the daemon's plugins exactly
// as it found them — the two inventories, and the sharpest half of REQ-99: the
// privileges are read and shown before anything is installed, and refusing the
// grant installs nothing.
//
// The reference the review is aimed at is a plugin built and pushed to a
// throwaway registry started here, so what it asks for is a property of the
// fixture rather than of whatever Docker Hub serves today, and reading its
// privileges needs no internet.

let fixture: PluginFixture;

function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

function panel(page: Page, title: string) {
  return screenContent(page).locator('.ui-surface').filter({ has: page.getByRole('heading', { level: 2, name: title }) }).first();
}

function rows(page: Page, title: string): Locator {
  return panel(page, title).locator('.ui-card-list__item');
}

function installDialog(page: Page) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Install daemon plugin' }) });
}

test.beforeAll(async () => {
  fixture = await startPluginFixture('e2e-plugins', `e2e-${process.pid}-${Date.now()}`);
});

test.afterAll(async () => {
  // Belt and braces: no spec here installs, but a run killed mid-way must still
  // leave the daemon's plugin list as it was found.
  await removePluginQuietly(fixture.installedName);
  await fixture.stop();
});

// The last active screen survives by design (REQ-115), so the screen this suite
// needs is pinned rather than inherited from whichever spec ran before.
test.beforeEach(async ({ page }) => {
  await openApp(page, 'plugins');
  await expect(screenContent(page).getByRole('heading', { level: 2, name: 'CLI plugins' })).toBeVisible({ timeout: 20_000 });
  await expect(screenContent(page).getByRole('heading', { level: 2, name: 'Daemon plugins' })).toBeVisible();
});

// plan-docker_management_app/REQ-98 — installed CLI plugins are listed with name, version and
// availability, as far as the local installation exposes them; plugins-screen.md — the invocation,
// the version and an availability badge; a panel with nothing to show says why.
test('lists the CLI plugins the installation ships, each with its invocation and availability', async ({ page }) => {
  const cliRows = rows(page, 'CLI plugins');
  await expect(async () => expect(await cliRows.count()).toBeGreaterThanOrEqual(0)).toPass();
  const count = await cliRows.count();

  // How many CLI plugins this installation ships is the machine's business. What
  // the contract fixes is the shape of a row, and that an empty panel says why.
  if (count === 0) {
    await expect(panel(page, 'CLI plugins').locator('.ui-card-list__empty')).toBeVisible();
    return;
  }

  for (let index = 0; index < count; index += 1) {
    const row = cliRows.nth(index);
    await expect(row.locator('.ui-card-list__title')).toHaveText(/^docker \S+/);
    await expect(row.locator('.ui-card-list__badges')).toHaveText(/^(enabled|available|unavailable)$/);
    // The row's leading dot says the state on its own.
    await expect(row.locator('.ui-card-list__leading > *').first()).toBeVisible();
  }

  // The CLI panel is read-only: those plugins are files the operator installs themselves.
  await expect(cliRows.first().getByRole('button')).toHaveCount(0);
  await expect(cliRows.first().getByRole('checkbox')).toHaveCount(0);
});

// plan-docker_management_app/REQ-99 — daemon plugins are listed with name, type and enabled/disabled
// state, as far as the daemon exposes them; plugins-screen.md — an empty panel says why when the
// reading came with a reason, and otherwise simply states there is none.
test('lists the daemon plugins with their interface in words and their state, or states there is none', async ({ page }) => {
  const daemonRows = rows(page, 'Daemon plugins');
  const count = await daemonRows.count();

  if (count === 0) {
    await expect(panel(page, 'Daemon plugins').locator('.ui-card-list__empty')).toBeVisible();
    await expect(panel(page, 'Daemon plugins')).toContainText(/No daemon plugins|does not expose/);
    return;
  }

  for (let index = 0; index < count; index += 1) {
    const row = daemonRows.nth(index);
    await expect(row.locator('.ui-card-list__title')).not.toHaveText('');
    await expect(row.locator('.ui-card-list__badges')).toHaveText(/^(enabled|disabled)$/);
    await expect(row.getByRole('checkbox')).toBeVisible();
    await expect(row.getByRole('button', { name: /^(Inspect|Hide)$/ })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Remove' })).toBeVisible();
  }
});

// plugins-screen.md — "'Install plugin' -> a form asking for the reference and an optional alias,
// plus a switch for enabling it once installed (on by default)".
test('the install form asks for a reference before it can be submitted, and cancelling it does nothing', async ({ page }) => {
  await panel(page, 'Daemon plugins').getByRole('button', { name: 'Install plugin' }).click();

  const dialog = installDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Review privileges' })).toBeDisabled();
  await expect(dialog.getByRole('checkbox', { name: 'Enable once installed' })).toBeChecked();

  await dialog.getByRole('textbox', { name: 'Plugin reference' }).fill(fixture.reference);
  await expect(dialog.getByRole('button', { name: 'Review privileges' })).toBeEnabled();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await pluginIsInstalled(fixture.installedName)).toBe(false);
});

// plan-docker_management_app/REQ-99 — the privileges a plugin requests are shown before they are
// granted; plugins-screen.md — "Submitting installs nothing: it reads the privileges the reference
// asks for and opens the confirmation that shows them", and "cancelling installs nothing and gives
// the form back with what was typed in it".
test('submitting the install form shows the privileges and installs nothing; refusing the grant installs nothing', async ({ page }) => {
  const alias = 'vexel-e2e-alias';
  await panel(page, 'Daemon plugins').getByRole('button', { name: 'Install plugin' }).click();
  const dialog = installDialog(page);
  await dialog.getByRole('textbox', { name: 'Plugin reference' }).fill(fixture.reference);
  await dialog.getByRole('textbox', { name: 'Plugin alias' }).fill(alias);

  await dialog.getByRole('button', { name: 'Review privileges' }).click();

  // What comes up is the review, not an install.
  const review = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Confirm: ${fixture.reference}` }) });
  await expect(review).toBeVisible({ timeout: 20_000 });
  for (const privilege of fixture.privileges) {
    await expect(review.getByText(privilege.name, { exact: true })).toBeVisible();
    await expect(review.getByText(privilege.values.join(', '), { exact: true })).toBeVisible();
  }
  await expect(review.getByRole('button', { name: 'Grant and install' })).toBeVisible();
  expect(await pluginIsInstalled(fixture.installedName)).toBe(false);

  // Refusing the grant installs nothing, and hands the form back as it was typed.
  await review.getByRole('button', { name: 'Cancel' }).click();
  await expect(review).toBeHidden();
  await expect(installDialog(page)).toBeVisible();
  await expect(installDialog(page).getByRole('textbox', { name: 'Plugin reference' })).toHaveValue(fixture.reference);
  await expect(installDialog(page).getByRole('textbox', { name: 'Plugin alias' })).toHaveValue(alias);
  expect(await pluginIsInstalled(fixture.installedName)).toBe(false);
  expect(await pluginIsInstalled(`${alias}:latest`)).toBe(false);
});
