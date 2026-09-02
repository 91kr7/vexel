import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

// These assertions read the cards the shell keeps for itself. Batch 30
// replaced the placeholder that used to sit under them with the coverage matrix,
// so the screen hosting them is the one labelled "About" (app-shell/specs/shell.md),
// addressed here by the internal id the rename did not touch. The screen is
// pinned rather than inherited from a previous spec (REQ-115).
//
// The daemon event stream is no longer one of them: it is presented in one place
// in the product and that place is the Dashboard
// (plan-ui-coherence-optimisation/REQ-71), so the assertion of REQ-11 and REQ-12
// below reads it there.
const SCREEN_HOSTING_THE_SHELL_CARDS = 'coverage-matrix';

/**
 * One of the shell's own cards, addressed by its title.
 *
 * Every assertion below is scoped to its card: the coverage matrix sharing the
 * screen has a row named "Daemon event stream" of its own, and states the
 * daemon's Docker version in its baseline strip, so the same words appear twice
 * on the page for reasons that have nothing to do with connectivity.
 */
function shellCard(page: Page, title: string): Locator {
  return page.locator('.ui-surface').filter({
    has: page.locator('.ui-card__title, .ui-section-header__title', { hasText: title }),
  });
}

test.beforeEach(async ({ page }) => {
  await openApp(page, SCREEN_HOSTING_THE_SHELL_CARDS);
});

// plan-docker_management_app/REQ-9, plan-docker_management_app/REQ-13
test('shows the daemon reachable and the negotiated Engine API version in the header', async ({ page }) => {
  // The requirement places both readings in the header, and the coverage matrix
  // below states an Engine API version of its own, so the header is the subject.
  const header = page.locator('header');
  await expect(header.getByText('Live · daemon events')).toBeVisible();
  await expect(header.getByText(/Engine API v\d+\.\d+/)).toBeVisible({ timeout: 10_000 });
});

// plan-docker_management_app/REQ-110
test('reports the local docker CLI availability with its version', async ({ page }) => {
  const { stdout } = await execFileAsync('docker', ['--version']);
  const version = stdout.match(/(\d+\.\d+\.\d+)/)?.[1];

  const card = shellCard(page, 'CLI availability');
  await expect(card).toBeVisible();
  if (version) {
    await expect(card.getByText(new RegExp(version))).toBeVisible({ timeout: 10_000 });
  }
});

// plan-docker_management_app/REQ-11, plan-docker_management_app/REQ-12
test('reflects a real daemon change in the live event stream panel without a manual refresh', async ({ page }) => {
  await openApp(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  const card = page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Daemon event stream' }) });
  await expect(card).toBeVisible();

  const networkName = `vexel-e2e-net-${Date.now()}`;
  try {
    await execFileAsync('docker', ['network', 'create', ...ownershipArgs('connectivity'), networkName]);
    await expect(card.getByText(networkName)).toBeVisible({ timeout: 10_000 });
  } finally {
    await execFileAsync('docker', ['network', 'rm', networkName]).catch(() => {});
  }
});
