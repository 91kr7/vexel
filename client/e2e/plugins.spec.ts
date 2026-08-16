import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { pluginIsInstalled, removePluginQuietly, startPluginFixture, type PluginFixture } from '../../server/test/support/plugin-fixture.js';

// The Plugins screen in a real browser, against the operator's own Docker
// installation (REQ-98, REQ-99, REQ-111, and
// plan-ui-coherence-optimisation/REQ-46, REQ-47).
//
// Nothing here installs a plugin. `docker plugin ls` is a host-wide list no
// label can scope, so the install itself lives in `e2e/exclusive/plugins.spec.ts`;
// what this file drives is everything that leaves the daemon's plugins exactly
// as it found them — the two inventories, and the sharpest half of REQ-99: the
// privileges are read and shown before anything is installed, and refusing the
// grant installs nothing.
//
// **The two lists are the object list since batch 10** (REQ-46), so a row is a
// `.ui-data-table__row` and a value is read through the column heading it sits
// under. The CLI inventory is measured here as the operator's own installation
// fills it, which is where REQ-47's defect was found: three distinct pill left
// edges down a column of fifteen rows, decided by each row's version string.
// Every row state, both empty results, and the panel's geometry are measured
// against a stubbed reading in `plugins-row-geometry.spec.ts`.
//
// The reference the review is aimed at is a plugin built and pushed to a
// throwaway registry started here, so what it asks for is a property of the
// fixture rather than of whatever Docker Hub serves today, and reading its
// privileges needs no internet.

let fixture: PluginFixture;

function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

/**
 * The region one of the two inventories is read in, named by the section header
 * titling it.
 *
 * Named by **what it holds** rather than by the surface it used to be: each
 * section's header — and, for the daemon list, its toolbar — sits **above** the
 * one unpadded card holding its list (`plugins-screen.md`, and
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`),
 * so a card can no longer be found by the heading it used to hold. A panel is
 * the innermost region carrying both the heading and the list; every region
 * matching contains the same heading and is therefore an ancestor of the next,
 * so the last in document order is the panel's own — and on a screen still drawn
 * the old way that is its card.
 */
function panel(page: Page, title: string) {
  return screenContent(page)
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: title }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

function rows(page: Page, title: string): Locator {
  return panel(page, title).locator('.ui-data-table__row');
}

function installDialog(page: Page) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Install daemon plugin' }) });
}

/**
 * How many rows a list holds **once its reading has arrived**, which is the only
 * moment either count means anything.
 *
 * A list still being read is not a list with nothing to show: the screen states
 * the two differently, and only the second of them explains itself (REQ-48). So
 * the terminal state is waited for — a row, or an empty result carrying its line
 * of explanation — rather than the count being read the instant the heading
 * appears. Read that way the CLI list reported **nought** rows on a machine
 * shipping fifteen CLI plugins, and the assertions that follow it asserted
 * nothing at all.
 */
async function settledRowCount(page: Page, title: string): Promise<number> {
  const list = panel(page, title);
  await expect(async () => {
    const rows = await list.locator('.ui-data-table__row').count();
    const explained = await list.locator('.ui-empty-state__description').count();
    expect(rows > 0 || explained > 0, `the ${title} reading has not arrived yet`).toBe(true);
  }).toPass({ timeout: 30_000 });
  return await list.locator('.ui-data-table__row').count();
}

/** The cells of a list's rows belonging to the column whose header matches `header`. */
async function columnCells(page: Page, title: string, header: RegExp): Promise<{ index: number; texts: string[] }> {
  return await panel(page, title).evaluate(
    (card, pattern) => {
      const table = card.querySelector('.ui-data-table') as HTMLElement;
      const headers = Array.from(table.querySelectorAll('.ui-data-table__header-cell')).map((cell) => (cell.textContent ?? '').trim());
      const index = headers.findIndex((label) => new RegExp(pattern.source, pattern.flags).test(label));
      const texts = Array.from(table.querySelectorAll('.ui-data-table__row')).map((row) =>
        (row.querySelectorAll('.ui-data-table__cell')[index]?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      );
      return { index, texts };
    },
    { source: header.source, flags: header.flags },
  );
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
// the version and an availability badge, each in a column of its own; a list with nothing to show
// states it on the empty-result surface.
test('lists the CLI plugins the installation ships, each with its invocation and availability', async ({ page }) => {
  const cliRows = rows(page, 'CLI plugins');
  const count = await settledRowCount(page, 'CLI plugins');

  // How many CLI plugins this installation ships is the machine's business. What
  // the contract fixes is the shape of a row, and that an empty list says why.
  if (count === 0) {
    await expect(panel(page, 'CLI plugins').locator('.ui-empty-state')).toBeVisible();
    return;
  }

  const names = await columnCells(page, 'CLI plugins', /^PLUGIN$/i);
  const availability = await columnCells(page, 'CLI plugins', /AVAILABILITY/i);
  console.log(`[REQ-46] the installation ships ${count} CLI plugin(s): ${JSON.stringify(names.texts)}`);

  for (const name of names.texts) expect(name).toMatch(/^docker \S+/);
  // The state is readable **in words**, on every row, with no reliance on a colour: the leading
  // state dot went with the migration precisely because this column says it in words as well as in
  // tone (plugins-screen.md, "the leading state dot is gone from both lists").
  for (const state of availability.texts) expect(state).toMatch(/^(enabled|available|unavailable)$/);

  // The CLI list is read-only: those plugins are files the operator installs themselves.
  await expect(cliRows.first().getByRole('button')).toHaveCount(0);
  await expect(cliRows.first().getByRole('checkbox')).toHaveCount(0);
});

// plan-ui-coherence-optimisation/REQ-47 — "The `enabled` pill is column-aligned. Its left edge is
// identical on every row — measured — regardless of the length of that row's version string."
// Measured here on the CLI plugins the operator's own installation ships, which is the inventory the
// defect was reported against; the row states that make the same measurement complete are stubbed in
// `plugins-row-geometry.spec.ts`.
test('the availability pill has one left edge down the operator’s own CLI inventory', async ({ page }) => {
  const count = await settledRowCount(page, 'CLI plugins');
  test.skip(count < 2, 'this installation ships fewer than two CLI plugins, so an alignment cannot be measured on it');

  const measured = await panel(page, 'CLI plugins').evaluate((card) => {
    const table = card.querySelector('.ui-data-table') as HTMLElement;
    const headers = Array.from(table.querySelectorAll('.ui-data-table__header-cell')).map((cell) => (cell.textContent ?? '').trim());
    const availability = headers.findIndex((label) => /AVAILABILITY/i.test(label));
    const version = headers.findIndex((label) => /VERSION/i.test(label));
    return Array.from(table.querySelectorAll('.ui-data-table__row')).map((row) => {
      const cells = Array.from(row.querySelectorAll('.ui-data-table__cell'));
      const badge = cells[availability]?.querySelector('.ui-badge');
      return {
        name: (cells[0]?.textContent ?? '').trim(),
        version: (cells[version]?.textContent ?? '').trim(),
        badgeX: badge ? Math.round(badge.getBoundingClientRect().x * 10) / 10 : Number.NaN,
      };
    });
  });

  const edges = measured.map((row) => row.badgeX);
  const spread = Math.max(...edges) - Math.min(...edges);
  console.log(
    `[REQ-47] ${measured.length} CLI row(s): pill left edges ${JSON.stringify([...new Set(edges)])}, spread ${Math.round(spread * 10) / 10}px; ` +
      `versions ${JSON.stringify(measured.map((row) => row.version))}`,
  );

  expect(edges.filter((edge) => Number.isNaN(edge)), 'a CLI row states no availability pill').toEqual([]);
  expect(
    new Set(edges).size,
    `the availability pill takes ${new Set(edges).size} distinct left edges down this installation's inventory, spread ${
      Math.round(spread * 10) / 10
    }px (REQ-47)`,
  ).toBe(1);
});

// plan-docker_management_app/REQ-99 — daemon plugins are listed with name, type and enabled/disabled
// state, as far as the daemon exposes them; plugins-screen.md — an empty list says why when the
// reading came with a reason, and otherwise states what that inventory holds and how it comes to
// hold something (REQ-48).
test('lists the daemon plugins with their interface in words and their state, or states there is none', async ({ page }) => {
  const daemonRows = rows(page, 'Daemon plugins');
  const count = await settledRowCount(page, 'Daemon plugins');

  if (count === 0) {
    const empty = panel(page, 'Daemon plugins').locator('.ui-empty-state');
    await expect(empty, 'the empty daemon inventory is not stated on the empty-state primitive (REQ-48)').toBeVisible();
    await expect(empty.locator('.ui-empty-state__title')).not.toHaveText('');
    await expect(empty.locator('.ui-empty-state__description'), 'the empty state explains nothing (REQ-48)').toBeVisible();
    console.log(`[REQ-48] the daemon empty state: "${(await empty.innerText()).replace(/\s+/g, ' ')}"`);
    return;
  }

  const names = await columnCells(page, 'Daemon plugins', /^PLUGIN$/i);
  const states = await columnCells(page, 'Daemon plugins', /^STATE$/i);
  for (const name of names.texts) expect(name).not.toBe('');
  for (const state of states.texts) expect(state).toMatch(/^(enabled|disabled)$/);

  for (let index = 0; index < count; index += 1) {
    const row = daemonRows.nth(index);
    await expect(row.getByRole('checkbox')).toBeVisible();
    await expect(row.getByRole('button', { name: /^(Inspect|Hide)$/ })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Remove' })).toBeVisible();
  }
});

// plugins-screen.md — "'Install plugin' -> a form asking for the reference and an optional alias,
// plus a switch for enabling it once installed (on by default)"; the action lives in the daemon
// list's own toolbar since batch 10 (REQ-46).
test('the install form asks for a reference before it can be submitted, and cancelling it does nothing', async ({ page }) => {
  const install = panel(page, 'Daemon plugins').locator('.ui-screen-toolbar').getByRole('button', { name: 'Install plugin' });
  await expect(install, 'the screen’s page-level action is not in the daemon list’s toolbar').toBeVisible();
  await install.click();

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
