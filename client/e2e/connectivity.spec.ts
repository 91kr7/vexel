import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { openApp, ownershipArgs } from './support/fixtures.js';

const execFileAsync = promisify(execFile);

// These assertions read the cards the shell renders around a screen no feature
// batch has built yet — the landing screen has been the real Dashboard since
// batch 25 — so the screen is pinned rather than inherited from a previous spec.
const SCREEN_HOSTING_THE_SHELL_CARDS = 'swarm';

test.beforeEach(async ({ page }) => {
  await openApp(page, SCREEN_HOSTING_THE_SHELL_CARDS);
});

// plan-docker_management_app/REQ-9, plan-docker_management_app/REQ-13
test('shows the daemon reachable and the negotiated Engine API version in the header', async ({ page }) => {
  await expect(page.getByText('Live · daemon events')).toBeVisible();
  await expect(page.getByText(/Engine API v\d+\.\d+/)).toBeVisible({ timeout: 10_000 });
});

// plan-docker_management_app/REQ-110
test('reports the local docker CLI availability with its version', async ({ page }) => {
  const { stdout } = await execFileAsync('docker', ['--version']);
  const version = stdout.match(/(\d+\.\d+\.\d+)/)?.[1];

  await expect(page.getByText('CLI availability')).toBeVisible();
  if (version) {
    await expect(page.getByText(new RegExp(version))).toBeVisible({ timeout: 10_000 });
  }
});

// plan-docker_management_app/REQ-11, plan-docker_management_app/REQ-12
test('reflects a real daemon change in the live event stream panel without a manual refresh', async ({ page }) => {
  await expect(page.getByText('Daemon event stream')).toBeVisible();

  const networkName = `vexel-e2e-net-${Date.now()}`;
  try {
    await execFileAsync('docker', ['network', 'create', ...ownershipArgs('connectivity'), networkName]);
    await expect(page.getByText(networkName)).toBeVisible({ timeout: 10_000 });
  } finally {
    await execFileAsync('docker', ['network', 'rm', networkName]).catch(() => {});
  }
});
