import { expect, test, type Page } from './support/test.js';
import { navEntry, openApp } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

// The first test of this file deliberately persists a screen; every test starts
// from the default one anyway, so neither inherits the other's leftover.
test.beforeEach(async ({ page }) => {
  await openApp(page);
});

/**
 * Resolves once the application has persisted `screenId` — that is, once the
 * server has answered the write it makes on a screen change.
 *
 * The write is fired and not awaited by the application, and
 * `local-persistence/specs/use-preferences.md` allows it to be *deferred* while
 * the initial preferences read is still in flight. Reloading without waiting for
 * it therefore asks the application to have persisted a choice it was still
 * entitled to be holding, which is not what REQ-115 promises: "survives a
 * reload" is about the reload, not about racing the write.
 */
function persistedScreen(page: Page, screenId: string): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/api/persistence/preferences') &&
      (response.request().postData() ?? '').includes(screenId),
  );
}

// plan-docker_management_app/REQ-115 — the last active screen survives a reload
test('the last active screen survives a page reload', async ({ page }) => {
  const persisted = persistedScreen(page, 'containers');

  await navEntry(page, 'Containers').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  await persisted;

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

  // Every initial read is held, not just the first: how many the view issues on
  // its way to one answer is not promised anywhere, and holding all of them is
  // what makes "the read is still unanswered" true whatever the number.
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
    await navEntry(page, 'Containers').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    expect(readsHeld, 'the preferences read must still be unanswered, or the race is not being exercised').toBeGreaterThan(0);

    // The flush the release is about to trigger, awaited rather than polled for.
    // Registered here, after the click, so a write issued *before* the read
    // settled — the deferral this test exists to pin — still fails the test.
    const flushed = persistedScreen(page, 'containers');

    releaseRead();

    // The read's response must not roll the operator's choice back...
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
    // ...and the deferred update must reach the store, not be dropped.
    //
    // Awaited, never given a deadline: the write travels on the page's own
    // connections, and the read-back below travels on `page.request`'s. With the
    // daemon event stream holding a connection for ever, six requests in flight
    // are the browser's HTTP/1.1 per-origin limit, so this write waits its turn
    // behind whatever the screen is already loading — seconds, when the daemon
    // has just been made busy by another spec. A budget on the read-back would
    // therefore measure how fast that queue drains, not what was persisted; the
    // requirement promises the write is not dropped, not that it is prompt.
    // Cause established in plan-docker_management_app-single_process_serving.
    await flushed;
    expect(persistedScreens.some((body) => body.includes('containers'))).toBe(true);
    // Now a plain reading of what the server holds, no longer a race with the write.
    const stored = (await (await page.request.get('/api/persistence/preferences')).json()) as { lastScreenId?: string };
    expect(stored.lastScreenId).toBe('containers');
  } finally {
    await page.unroute('**/api/persistence/preferences');
  }

  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

/** The analysis cache's reported total, from the same endpoint the card reads. */
async function analysisCacheTotal(page: Page): Promise<number> {
  const response = await page.request.get('/api/persistence/analysis-cache');
  return ((await response.json()) as { totalSizeBytes: number }).totalSizeBytes;
}

/**
 * Puts an entry of this spec's own into the analysis cache, and answers the
 * total once it is there.
 *
 * Extracting a filesystem is what writes to that cache, and the suite's own
 * single-layer image makes it a matter of milliseconds. Done rather than assumed
 * so that "there is something to clear" is this spec's doing: the cache is
 * shared by the whole run, and a spec that merely clears whatever it happens to
 * find is asserting on somebody else's state.
 */
async function seedAnalysisCache(page: Page): Promise<number> {
  await ensureImage(TINY_IMAGE);
  const { stdout } = await execFileAsync('docker', ['image', 'inspect', TINY_IMAGE, '--format', '{{.Id}}']);
  const response = await page.request.get(`/api/images/${encodeURIComponent(stdout.trim())}/filesystem/stream?force=true`, {
    timeout: 60_000,
  });
  expect(response.ok(), 'expected the filesystem extraction that seeds the cache to be accepted').toBe(true);
  await response.body();
  return await analysisCacheTotal(page);
}

// app-shell/specs/shell.md — the shell exposes the analysis-cache size with a Clear action, which
// empties the cache and is disabled once there is nothing left to clear
test('the Local storage card shows the analysis-cache size and clearing it disables the Clear action', async ({ page }) => {
  // 120s = 60 + 30 + 15 + 15 (REQ-64, REQ-65):
  //   60s — the extraction request that seeds the cache: the ceiling `seedAnalysisCache` declares,
  //         and the largest single step this case runs;
  //   30s — the About screen opens: `openApp`'s own retry;
  //   15s — the first cache reading: the poll for the total falling below what was seeded;
  //   15s — the second: the poll for the action's state agreeing with the size the card reports.
  test.setTimeout(120_000);
  // The card is one of the three the shell keeps for itself; batch 30 replaced
  // the placeholder that used to sit under them with the coverage matrix, so the
  // screen they are shown on is the one labelled "About" (app-shell/specs/shell.md).
  // It is addressed by its internal id, which the rename did not touch.
  // Seeded before the screen is opened, so the card renders a size that this
  // spec put there.
  const seededTotal = await seedAnalysisCache(page);
  expect(seededTotal, 'expected the extraction to leave something in the analysis cache').toBeGreaterThan(0);

  await openApp(page, 'coverage-matrix');

  // Scoped to the card: the coverage matrix under it names screens and
  // capabilities in its own rows, so a page-wide text locator is ambiguous here.
  const localStorageCard = page.locator('.ui-surface', {
    has: page.locator('.ui-card__title, .ui-section-header__title', { hasText: 'Local storage' }),
  });
  await expect(localStorageCard).toBeVisible();
  await expect(localStorageCard.getByText('Analysis cache')).toBeVisible();

  // The card's own action: "Clear" is a label the rest of the shell can repeat.
  const clearButton = localStorageCard.getByRole('button', { name: 'Clear' });
  // There is something to clear, and this spec is why: the action offers itself.
  await expect(clearButton).toBeEnabled();

  await clearButton.click();

  // "Clear empties the cache": what this spec put in is gone, shown as the total
  // falling below what it had seeded. Not "the total is zero" — the cache is
  // shared by the whole run, and an analysis another spec started can still be
  // finishing and legitimately write an entry of its own a moment later. That is
  // precisely how asserting on the daemon-wide total failed here.
  await expect
    .poll(async () => analysisCacheTotal(page), { timeout: 15_000, message: 'expected clearing to drop what this spec had cached' })
    .toBeLessThan(seededTotal);

  // "Disabled once there is nothing left to clear": the state of the action has
  // to agree with the size being reported at that same moment — disabled when
  // the cache is empty, offered again when something has since been written to
  // it. That agreement is the contract; the emptiness is not this spec's to own.
  await expect
    .poll(
      async () => {
        const total = await analysisCacheTotal(page);
        const disabled = await clearButton.isDisabled();
        return total === 0 ? disabled : !disabled;
      },
      { timeout: 15_000, message: "expected the Clear action's state to agree with the size the card reports" },
    )
    .toBe(true);
});
