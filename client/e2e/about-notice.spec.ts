import { expect, test, type Locator, type Page } from '@playwright/test';
import { openApp } from './support/fixtures.js';

// The identity and legal notice, as the operator meets it: the AGPL asks for a
// *display*, so what matters here is not that the strings exist but that they
// are on a screen of the permanent navigation, inside one recognisable block,
// legible without a network, and told apart from one another.
//
// It creates nothing on the daemon — the notice reads from nothing at all — so
// there is nothing to clean up. The screen is pinned with `openApp` rather than
// inherited: the last active screen survives by design
// (plan-docker_management_app/REQ-115).

/** The screen's internal id, which the rename to "About" deliberately left alone. */
const ABOUT_SCREEN_ID = 'coverage-matrix';

const SOURCE_URL = 'https://github.com/91kr7/vexel';

/** The attribution term 1 of LICENSE-ADDITIONAL-TERMS.md specifies to the letter. */
const ATTRIBUTION = 'Vexel — Copyright (C) 2026 Christian Mariani';

/** The one block the notice is: the outermost surface carrying the attribution. */
function notice(page: Page): Locator {
  return page.locator('.ui-surface').filter({ hasText: ATTRIBUTION }).first();
}

/**
 * The application's own write of the screen just chosen. REQ-8 promises the notice
 * comes back after a reload, not that it survives a reload racing the write:
 * `usePreferences` is entitled to defer a choice made while the initial preferences
 * read is still in flight, so reloading without awaiting the PUT destroys the page
 * before the deferred write can flush. Same reasoning as REQ-115's own spec.
 */
function persistedScreen(page: Page, screenId: string): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/api/persistence/preferences') &&
      (response.request().postData() ?? '').includes(screenId),
  );
}

/** One of the shell's own cards, addressed by its title. */
function shellCard(page: Page, title: string): Locator {
  return page.locator('.ui-surface').filter({
    has: page.locator('.ui-card__title, .ui-section-header__title', { hasText: title }),
  });
}

async function openAbout(page: Page): Promise<void> {
  await openApp(page, ABOUT_SCREEN_ID);
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
  await expect(notice(page)).toBeVisible();
}

// plan-docker_management_app-about_license_notice/REQ-6 — one self-contained, visually identifiable
// block; batch file INT-5 — the first card of the screen, above CLI availability, with nothing
// batch 1 left on the screen removed (REQ-3)
test('the notice is one block at the top of the About screen, with everything else still there', async ({ page }) => {
  await openAbout(page);

  const block = notice(page);
  const cli = shellCard(page, 'CLI availability');
  const blockBox = await block.boundingBox();
  const cliBox = await cli.boundingBox();
  expect(blockBox, 'the notice has no box on the screen').not.toBeNull();
  expect(cliBox, 'the CLI availability card is no longer on the screen').not.toBeNull();
  expect(blockBox!.y, 'the notice does not sit above the CLI availability card').toBeLessThan(cliBox!.y);

  // Everything the notice says is inside that one block, not scattered over the screen.
  await expect(block).toContainText(ATTRIBUTION);
  await expect(block).toContainText(/no warranty/i);
  await expect(block).toContainText(/rights in the name/i);

  // plan-docker_management_app-about_license_notice/REQ-3 — the screen keeps what it showed before.
  for (const title of ['CLI availability', 'Daemon event stream', 'Local storage']) {
    await expect(shellCard(page, title), `the "${title}" card is no longer on the screen`).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Docker capability coverage' })).toBeVisible();
});

// plan-docker_management_app-about_license_notice/REQ-9, REQ-10, REQ-11, REQ-12, REQ-13, REQ-16,
// REQ-17 — every clause the display is made of
test('the notice states every clause the licence display is made of', async ({ page }) => {
  await openAbout(page);
  const block = notice(page);

  // REQ-9, REQ-10 — the product and the natural person holding the copyright, with the year.
  await expect(block).toContainText(ATTRIBUTION);
  // REQ-11 — the licence and the section 7 supplement.
  await expect(block).toContainText(/GNU Affero General Public License, version 3/i);
  await expect(block).toContainText(/AGPL-3\.0-only/);
  await expect(block).toContainText(/section 7/i);
  // REQ-12 — no warranty.
  await expect(block).toContainText(/no warranty/i);
  // REQ-13 — the right to convey, under the same licence.
  await expect(block).toContainText(/convey/i);
  // REQ-16 — the duty a network-exposed modified version owes its users.
  await expect(block).toContainText(/over a network/i);
  await expect(block).toContainText(/attribution/i);
  // REQ-17 — the name is reserved, and nothing more is claimed.
  await expect(block).toContainText(/no rights in the name/i);
});

// plan-docker_management_app-about_license_notice/REQ-11, REQ-14, REQ-15 — the three routes and the
// running version beside the source
test('the notice offers the two licence documents and the source, each in one step', async ({ page }) => {
  await openAbout(page);
  const block = notice(page);

  const routes = block.getByRole('link');
  await expect(routes, 'the notice offers routes the licence did not ask for').toHaveCount(3);

  // REQ-11 — one route per document, neither of them the repository root.
  const hrefs = await routes.evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
  expect(hrefs.filter((href) => href.endsWith('/LICENSE')), 'no route reaches the full licence text').toHaveLength(1);
  expect(hrefs.filter((href) => href.endsWith('/LICENSE-ADDITIONAL-TERMS.md')), 'no route reaches the additional terms').toHaveLength(1);

  // REQ-14 — the source is a route and, at the same time, plain readable text.
  const source = block.getByRole('link', { name: SOURCE_URL });
  await expect(source).toHaveAttribute('href', SOURCE_URL);
  await expect(source, 'the source URL is not shown as text').toContainText(SOURCE_URL);
  // Followed in one step, and out of the application: its own browsing context.
  await expect(source).toHaveAttribute('target', '_blank');

  // REQ-15 — the running version, read next to that route.
  // The innermost row carrying the URL is the one the version must share.
  const versionRow = block.locator('.ui-row').filter({ hasText: SOURCE_URL }).last();
  await expect(versionRow).toContainText(/version \d+\.\d+\.\d+/);
});

// plan-docker_management_app-about_license_notice/REQ-7 — reached in one step from the permanent
// navigation, gating nothing; REQ-8 — nothing on the screen hides, empties or edits it
test('the notice is one click away from any screen and blocks no work', async ({ page }) => {
  // Start somewhere else entirely, as an operator at work would be.
  await openApp(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  // Nothing gated the way in: no first-run wall, no acknowledgement, no blocking dialog.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(notice(page), 'the notice interrupts a screen it does not belong to').toHaveCount(0);

  // One step from the permanent navigation.
  const persisted = persistedScreen(page, ABOUT_SCREEN_ID);
  await page.getByRole('navigation').getByRole('button', { name: /About/ }).click();
  await expect(notice(page)).toBeVisible();
  await expect(page.getByRole('dialog'), 'reaching the notice opened a dialog to click through').toHaveCount(0);

  // REQ-8 — the block carries no control at all, so there is nothing to dismiss or edit it with,
  // and it comes back unchanged after a reload.
  await expect(notice(page).getByRole('button')).toHaveCount(0);
  const before = await notice(page).innerText();
  await persisted;
  await page.reload();
  await expect(notice(page)).toBeVisible();
  expect(await notice(page).innerText()).toBe(before);

  // Work is not held up: another screen is still one click away.
  await page.getByRole('navigation').getByRole('button', { name: /Containers/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// plan-docker_management_app-about_license_notice/REQ-19 — complete from what the application holds
// locally: no request of its own, and identical on a host with no outbound connectivity
test('the notice renders complete with every outbound request refused', async ({ page }) => {
  const outbound: string[] = [];
  // Anything leaving the machine is both recorded and refused, so a request the
  // notice needed would show up as missing content rather than as a slow test.
  await page.route(
    (url) => url.protocol.startsWith('http') && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1',
    async (route, request) => {
      outbound.push(request.url());
      await route.abort();
    },
  );

  await openAbout(page);
  const block = notice(page);

  await expect(block).toContainText(ATTRIBUTION);
  await expect(block).toContainText(/GNU Affero General Public License, version 3/i);
  await expect(block).toContainText(/no warranty/i);
  await expect(block).toContainText(/version \d+\.\d+\.\d+/);
  await expect(block.getByRole('link')).toHaveCount(3);

  expect(outbound, `the notice reached outside the machine: ${outbound.join(', ')}`).toEqual([]);
});

// app-shell/specs/about-notice.md — "Every clause above is stated separately, so removing any one of
// them is visible": the two clauses the layout most easily merges must stay distinguishable
test('the network-modification clause and the name reservation read as two separate paragraphs', async ({ page }) => {
  await openAbout(page);
  const block = notice(page);

  const network = block.getByText(/over a network/i);
  const reservation = block.getByText(/rights in the name/i);
  await expect(network).toHaveCount(1);
  await expect(reservation).toHaveCount(1);

  // Neither clause is part of the other's text...
  await expect(network, 'the two clauses are rendered as one run of prose').not.toContainText(/rights in the name/i);
  await expect(reservation, 'the two clauses are rendered as one run of prose').not.toContainText(/over a network/i);

  // ...and they occupy two separate bands of the block, one under the other.
  const networkBox = await network.boundingBox();
  const reservationBox = await reservation.boundingBox();
  expect(networkBox).not.toBeNull();
  expect(reservationBox).not.toBeNull();
  expect(networkBox!.y + networkBox!.height, 'the two clauses overlap on screen').toBeLessThanOrEqual(reservationBox!.y);
});
