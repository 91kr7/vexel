import { expect, test, type Locator, type Page } from './support/test.js';
import { navEntry, openApp } from './support/fixtures.js';
import { clickAtItsCentre } from './support/settled.js';

/**
 * **The swarm area has left the product, and nothing dead is left where it was.**
 * REQ ids belong to `plan-docker_management_app-swarm_removal`.
 *
 * This is the requirement observed where the operator observes it: in the
 * browser, on the delivered single process, and against the API that process
 * serves. Four things are asserted and they are the four the requirements state
 * — the navigation offers no swarm entry and nothing in its place (REQ-1,
 * REQ-3), no screen the product has lists or acts upon a swarm object (REQ-2,
 * REQ-4), the application's own swarm addresses answer exactly as an address it
 * does not have (REQ-5), and an operator whose saved state named the removed
 * screen lands on a working default one (REQ-9).
 *
 * **The Coverage screen is the deliberate exception and is asserted positively**
 * rather than skipped: REQ-12 requires the swarm areas to stay declared there,
 * console-only, each with its command and its reason and none of them naming a
 * screen. A sweep that simply excluded that screen would pass on a build that had
 * deleted the entries, which is the opposite of what is wanted.
 *
 * **Nothing here initialises, joins or leaves a swarm**, and nothing needs to:
 * what is under examination is the absence of an area, which is observable on any
 * daemon. The daemon is neither written to nor read for a fixture, so there is
 * nothing to clean up (CLAUDE.md, "Tests").
 */

/** The twelve screens of the navigation, by the id the preference holds and the heading each draws. */
const SCREENS: { id: string; heading: string }[] = [
  { id: 'dashboard', heading: 'Dashboard' },
  { id: 'containers', heading: 'Containers' },
  { id: 'compose', heading: 'Compose' },
  { id: 'images-layers', heading: 'Images & layers' },
  { id: 'volumes-networks', heading: 'Volumes & networks' },
  { id: 'registries', heading: 'Registries' },
  { id: 'builders-cache', heading: 'Builders & cache' },
  { id: 'contexts', heading: 'Contexts' },
  { id: 'plugins', heading: 'Plugins' },
  { id: 'system-prune', heading: 'System & prune' },
  { id: 'raw-console', heading: 'Raw console' },
  { id: 'coverage-matrix', heading: 'About' },
];

/**
 * The sections the withdrawn screen drew, by the exact heading each carried.
 *
 * Matched **exactly** and at heading level 2 on purpose: "Services" and "Stacks"
 * are words the surviving product uses for other things — a compose project's own
 * services, the Dashboard's stacks tile — and REQ-13 promises those are untouched.
 * What must exist nowhere is the swarm inventory that carried these names.
 */
const WITHDRAWN_SECTIONS = ['Nodes', 'Services & tasks', 'Secrets', 'Configs', 'Join tokens'];

/** The cluster-membership actions REQ-2 names, by the words a control offering one would carry. */
const WITHDRAWN_ACTIONS = /initiali[sz]e a swarm|join a swarm|leave the swarm|join token|rotate token/i;

/** The swarm addresses the server exposed until 2026-08-27, one per capability the area had. */
const WITHDRAWN_ADDRESSES = [
  '/api/swarm',
  '/api/swarm/init',
  '/api/swarm/join',
  '/api/swarm/leave',
  '/api/swarm/tokens',
  '/api/swarm/nodes',
  '/api/swarm/services',
  '/api/swarm/stacks',
  '/api/swarm/secrets',
  '/api/swarm/configs',
];

/** The four swarm areas the coverage statement keeps, identified by the command that reaches each. */
const DECLARED_SWARM_AREAS = [
  { area: 'swarm cluster and nodes', command: /docker (swarm|node) / },
  { area: 'swarm services', command: /docker service ls/ },
  { area: 'swarm secrets and configs', command: /docker secret ls/ },
  { area: 'swarm stacks', command: /docker stack ls/ },
  { area: 'swarm stack deployment', command: /docker stack deploy/ },
];

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

function matrix(page: Page): Locator {
  return page.locator('.ui-surface', { has: page.getByRole('heading', { name: 'Docker capability coverage' }) });
}

async function open(page: Page, screen: { id: string; heading: string }): Promise<void> {
  await openApp(page, screen.id);
  await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible({ timeout: 30_000 });
}

// REQ-1, REQ-3 — "the navigation lists only the areas that remain" and "nothing dead is left where
// the area was: no disabled navigation entry, no empty screen, no 'feature removed' notice, no
// control that leads nowhere"; app-shell/specs/navigation-data.md — "Exactly twelve entries …
// nothing took its place: no disabled entry, no separator, no group left short of a member".
test('the navigation offers twelve entries, none of them swarm and none of them dead', async ({ page }) => {
  await open(page, SCREENS[0]!);

  const rail = page.getByRole('navigation');
  const entries = rail.getByRole('button');
  const named = await rail.locator('.ui-nav-item__label').allInnerTexts();

  expect(named.map((label) => label.trim()).sort(), 'the rail does not offer exactly the twelve screens of the navigation').toEqual(
    SCREENS.map((screen) => (screen.id === 'coverage-matrix' ? 'About' : screen.heading)).sort(),
  );
  // Every entry the rail draws is one of those twelve: an unlabelled thirteenth would pass the
  // comparison above and be caught here.
  await expect(entries, 'the rail draws a control that is not one of the twelve entries').toHaveCount(SCREENS.length);
  for (const label of named) {
    expect(label, `the rail offers a "${label}" entry`).not.toMatch(/swarm/i);
  }

  // Nothing took the removed entry's place: no entry is disabled, and none leads nowhere.
  const disabled = await entries.evaluateAll((nodes) =>
    nodes
      .filter((node) => (node as HTMLButtonElement).disabled || node.getAttribute('aria-disabled') === 'true')
      .map((node) => (node.textContent ?? '').trim()),
  );
  expect(disabled, 'the rail carries a disabled entry where the withdrawn one used to be').toEqual([]);

  // …and the rail says nothing about a screen that has gone.
  expect(await rail.innerText(), 'the rail carries a notice about the withdrawn area').not.toMatch(/swarm|removed|no longer/i);
});

// REQ-1, REQ-2, REQ-4, REQ-6 — no path through the interface leads to a swarm view, no
// cluster-membership action is offered anywhere, and no node, service, task, stack, secret or
// config list is reachable on any screen the product has. Asserted over **every** screen, because
// "anywhere" is what the requirements say.
test('no screen of the product names a cluster, lists a swarm object or offers a cluster action', async ({ page }) => {
  test.setTimeout(420_000);

  for (const screen of SCREENS) {
    await open(page, screen);
    const content = screenContent(page);

    for (const heading of WITHDRAWN_SECTIONS) {
      await expect(
        content.getByRole('heading', { level: 2, name: heading, exact: true }),
        `the ${screen.heading} screen draws a "${heading}" section`,
      ).toHaveCount(0);
    }

    const controls = await content.getByRole('button').allInnerTexts();
    for (const control of controls) {
      expect(control, `the ${screen.heading} screen offers a cluster action: "${control.trim()}"`).not.toMatch(WITHDRAWN_ACTIONS);
    }

    // The About screen is the one place swarm is still named, by REQ-12, and it is asserted on its
    // own below. Everywhere else the word is absent from what the operator reads.
    if (screen.id === 'coverage-matrix') continue;
    expect(await content.innerText(), `the ${screen.heading} screen states something about a cluster`).not.toMatch(/swarm/i);
  }
});

// REQ-5 — "the application exposes no endpoint that lists, inspects or acts upon a swarm object or
// the cluster's membership, so the feature is gone rather than hidden": the withdrawn addresses
// answer exactly as an address the application does not have, which is the control below.
test('the withdrawn swarm addresses answer as any address the application does not have', async ({ page }) => {
  await open(page, SCREENS[0]!);

  const control = await page.request.get('/api/no-such-route');
  expect(control.status(), 'the control address does not answer as a not-found, so nothing below is a comparison').toBe(404);
  const controlType = control.headers()['content-type'] ?? '';

  for (const address of WITHDRAWN_ADDRESSES) {
    for (const method of ['GET', 'POST', 'DELETE'] as const) {
      const response = await page.request.fetch(address, { method, failOnStatusCode: false });
      expect(response.status(), `${method} ${address} is still answered`).toBe(control.status());
      expect(response.headers()['content-type'] ?? '', `${method} ${address} answers in another form`).toBe(controlType);
      const body = (await response.json()) as { error?: unknown };
      expect(typeof body.error, `${method} ${address} answers without a described error`).toBe('string');
    }
  }
});

// REQ-9, REQ-3 — "an operator whose persisted state points at the removed screen lands on a valid
// default screen, with no error and no blank view, and the application keeps working normally from
// there"; app-shell/specs/shell.md — the guard leaves `defaultScreenId` active, and
// `PlaceholderScreen` is **not** reached.
test('an operator whose saved screen was the withdrawn one lands on a working Dashboard', async ({ page }) => {
  await openApp(page, 'swarm');

  // The default screen, complete: its own header and its own content, not a placeholder.
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[aria-current="page"]')).toHaveAccessibleName(/Dashboard/);
  await expect(screenContent(page).locator('.ui-metric-tile').first()).toBeVisible({ timeout: 30_000 });
  await expect(screenContent(page).locator('.ui-metric-tile')).toHaveCount(5);

  // No error, no notice, no blank view: nothing tells the operator a screen has gone.
  await expect(page.locator('.ui-error-banner')).toHaveCount(0);
  const content = await screenContent(page).innerText();
  expect(content, 'the landing screen mentions the withdrawn area').not.toMatch(/swarm/i);
  expect(content, 'the landing screen announces a removal').not.toMatch(/no longer available|has been removed|feature removed/i);
  expect(content.trim().length, 'the landing screen is blank').toBeGreaterThan(0);

  // …and the application keeps working from there: another screen is one real click away.
  await clickAtItsCentre(page, navEntry(page, 'Containers'), 'the Containers entry of the rail');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 30_000 });
});

// REQ-12 — "the Coverage screen still declares the swarm areas, reclassified as reachable from the
// console only and carrying the reason … the swarm stack deployment entry … is reworded with them
// so that no entry cites a screen that no longer exists"; coverage-map.md — the four are
// reclassified, not deleted, and the total does not move.
test('the Coverage screen still declares the swarm areas, console-only and naming their command', async ({ page }) => {
  await open(page, SCREENS[11]!);
  await expect(matrix(page).locator('.ui-data-table__row').first()).toBeVisible({ timeout: 30_000 });

  for (const { area, command } of DECLARED_SWARM_AREAS) {
    const row = matrix(page).locator('.ui-data-table__row').filter({ hasText: command });
    await expect(row, `${area} is stated nowhere on the coverage matrix`).toHaveCount(1);
    await expect(row.locator('.ui-badge').first(), `${area} is not declared console-only`).toHaveText('Console only');
    // A gap is never stated without why it is a gap, and the only destination it offers is the
    // console that reaches it — never a screen that no longer exists.
    await expect(row.getByRole('button', { name: /Raw console/ }), `${area} does not lead to the console`).toHaveCount(1);
    await expect(row.getByRole('button'), `${area} offers a second destination beside the console`).toHaveCount(1);
    expect((await row.innerText()).length, `${area} states no reason`).toBeGreaterThan(60);
  }

  // …and no row of the matrix names the screen the product no longer has.
  const rows = matrix(page).locator('.ui-data-table__row');
  for (let index = 0; index < (await rows.count()); index += 1) {
    const text = await rows.nth(index).innerText();
    if (!/swarm/i.test(text)) continue;
    expect(text, 'a swarm row still points at the Swarm screen').not.toMatch(/\bSwarm screen\b/i);
    expect(await rows.nth(index).locator('.ui-badge').first().innerText()).toBe('Console only');
  }
});
