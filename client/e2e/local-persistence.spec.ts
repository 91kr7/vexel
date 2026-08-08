import { expect, test } from '@playwright/test';
import { openApp } from './support/fixtures.js';

// The first test of this file deliberately persists a screen; every test starts
// from the default one anyway, so neither inherits the other's leftover.
test.beforeEach(async ({ page }) => {
  await openApp(page);
});

// plan-docker_management_app/REQ-115 — the last active screen survives a reload
test('the last active screen survives a page reload', async ({ page }) => {
  await page.getByRole('button', { name: /Containers/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();

  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// plan-docker_management_app/REQ-115, local-persistence/specs/use-preferences.md — a screen chosen
// before the initial preferences read has settled is still the screen the application reopens on.
//
// The race is not left to chance: the initial GET is held open by a route handler and released by
// the test, so the click provably lands while the read is in flight. Its response is the real
// server's (fetched, then replayed on release), so what the application sees is what it would have
// seen without the interception — only later.
test('a screen chosen before the preferences read settles is the one the application reopens on', async ({ page }) => {
  // The starting point is the default screen, persisted: any restore that happens
  // must therefore be a restore of what this test itself chooses.
  await openApp(page, null);

  let releaseRead!: () => void;
  const readHeld = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  // How many initial reads are currently held unanswered. Asserted at click time:
  // without it a green run would prove nothing about the race.
  let readsHeld = 0;
  const persistedScreens: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().includes('/api/persistence/preferences')) {
      const body = request.postData() ?? '';
      if (body.includes('lastScreenId')) persistedScreens.push(body);
    }
  });

  // StrictMode mounts the hook twice in dev, so every initial read is held, not just the first.
  await page.route('**/api/persistence/preferences', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    readsHeld += 1;
    await readHeld;
    readsHeld -= 1;
    await route.fulfill({ response });
  });

  try {
    await page.goto('/');
    await expect.poll(() => readsHeld).toBeGreaterThan(0);

    // The choice is made while the read is still in flight.
    await page.getByRole('button', { name: /Containers/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    expect(readsHeld, 'the preferences read must still be unanswered, or the race is not being exercised').toBeGreaterThan(0);

    releaseRead();

    // The read's response must not roll the operator's choice back...
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    // ...and the deferred update must reach the store, not be dropped. Read back
    // from the server rather than from the wire, so the reload below cannot
    // overtake a write that was merely issued.
    await expect
      .poll(
        async () => ((await (await page.request.get('/api/persistence/preferences')).json()) as { lastScreenId?: string }).lastScreenId,
        { timeout: 5_000 },
      )
      .toBe('containers');
    expect(persistedScreens.some((body) => body.includes('containers'))).toBe(true);
  } finally {
    await page.unroute('**/api/persistence/preferences');
  }

  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// app-shell/specs/shell.md — the shell exposes the analysis-cache size with a Clear action, which
// empties the cache and is disabled once there is nothing left to clear
test('the Local storage card shows the analysis-cache size and clearing it disables the Clear action', async ({ page }) => {
  await expect(page.getByText('Local storage')).toBeVisible();
  await expect(page.getByText('Analysis cache')).toBeVisible();

  // The card's own action: "Clear" is a label the rest of the shell can repeat.
  const localStorageCard = page.locator('.ui-surface', { has: page.locator('.ui-card__title', { hasText: 'Local storage' }) });
  const clearButton = localStorageCard.getByRole('button', { name: 'Clear' });
  await expect(clearButton).toBeVisible();

  // The empty state is established here rather than assumed: any spec that
  // analysed an image earlier in the run leaves entries in this same cache.
  if (await clearButton.isEnabled()) {
    await clearButton.click();
  }

  await expect(clearButton).toBeDisabled();
});
