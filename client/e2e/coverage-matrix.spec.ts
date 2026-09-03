import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

// The coverage matrix is the product's statement about itself (REQ-105, REQ-106),
// so this spec checks it against the product rather than against the screen: a
// link must land on the screen it names, the capabilities the plan withdrew must
// be declared console-only, and the baseline shown must be the one Docker itself
// reports for the daemon behind the active context. The matrix is now the
// coverage half of the screen the navigation labels "About", which is where the
// last test of the file starts from.
//
// It creates nothing on the daemon — the screen is a read of declared data plus
// one version reading — so there is nothing to clean up.

/**
 * The capabilities that have no screen of their own, from the plan itself:
 * departures One and Three in `batches.md` (2026-08-07) and the coverage map's
 * contract, never from the map's own wording.
 */
const CONSOLE_ONLY_CAPABILITIES = [
  { capability: 'image building', command: /docker build\b/ },
  { capability: 'swarm stack deployment', command: /docker stack deploy/ },
  { capability: 'build-cache export and import', command: /--cache-(to|from)/ },
  { capability: 'TCP+TLS context creation', command: /docker context create/ },
  { capability: 'vulnerability scanning with Docker Scout', command: /docker (scout|sbom)/ },
];

/** The `<major>.<minor>` Engine API and the Docker version of the daemon behind the active context. */
async function daemonVersionsFromDocker(): Promise<{ version: string; apiVersion: string }> {
  const { stdout } = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}|{{.Server.APIVersion}}']);
  const [version, apiVersion] = stdout.trim().split('|');
  return { version: version ?? '', apiVersion: apiVersion ?? '' };
}

/** The verdict the coverage screen must state for a pair of Engine API readings. */
function expectedVerdict(declared: string, daemon: string): RegExp {
  const parse = (value: string) => /^(\d+)\.(\d+)$/.exec(value.trim());
  const left = parse(declared);
  const right = parse(daemon);
  if (!left || !right) return /could not be compared/i;
  const difference = Number(right[1]) !== Number(left[1]) ? Number(right[1]) - Number(left[1]) : Number(right[2]) - Number(left[2]);
  if (difference === 0) return /matches the declared baseline/i;
  return difference > 0 ? /newer than the declared baseline/i : /older than the declared baseline/i;
}

function matrix(page: Page): Locator {
  return page.locator('.ui-surface', { has: page.getByRole('heading', { name: 'Docker capability coverage' }) });
}

function baselineStrip(page: Page): Locator {
  return page.locator('.ui-state-summary-bar');
}

/**
 * One of the shell's own cards, addressed by its title.
 *
 * Scoped to the card titles: the matrix sharing the screen has a row named
 * "Daemon event stream" of its own, so the same words appear twice on the page.
 */
function shellCard(page: Page, title: string): Locator {
  return page.locator('.ui-surface').filter({
    has: page.locator('.ui-card__title, .ui-section-header__title', { hasText: title }),
  });
}

/** The matrix row whose text carries `text` — a capability name or the command that reaches it. */
function rowContaining(page: Page, text: string | RegExp): Locator {
  return matrix(page).locator('.ui-data-table__row').filter({ hasText: text });
}

async function openCoverageMatrix(page: Page): Promise<void> {
  // The last active screen survives by design (REQ-115): pin it rather than inherit it.
  await openApp(page, 'coverage-matrix');
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
  await expect(matrix(page).locator('.ui-data-table__row').first()).toBeVisible({ timeout: 30_000 });
}

// plan-docker_management_app/REQ-105 — the coverage screen lists the Docker capability areas and
// states, for each, whether it has a dedicated screen or is reachable only through the raw console
test('the screen lists the capability areas, each with its coverage state and where it lives', async ({ page }) => {
  await openCoverageMatrix(page);

  const rows = matrix(page).locator('.ui-data-table__row');
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);

  // Every row states one of the three coverage states, and its destination agrees with it.
  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    const badge = await row.locator('.ui-badge').first().textContent();
    expect(['Dedicated screen', 'Console only', 'Not applicable'], `row ${index} states no coverage state`).toContain(badge?.trim());

    if (badge?.trim() === 'Not applicable') {
      await expect(row.getByRole('button')).toHaveCount(0);
      await expect(row).toContainText('no screen, no command');
    } else {
      await expect(row.getByRole('button')).toHaveCount(1);
    }
  }

  // The card header states the totals over those same rows.
  const header = matrix(page).locator('.ui-section-header__description').first();
  await expect(header).toContainText(new RegExp(`\\b${rowCount}\\b`));
});

// plan-docker_management_app/REQ-105 — "with a link to the covering screen when there is one": the
// link must land on a screen that actually exists, through the cross-navigation service
test('every screen a row names exists in the navigation, and following the row lands there', async ({ page }) => {
  await openCoverageMatrix(page);

  const rows = matrix(page).locator('.ui-data-table__row');
  const destinations = new Set<string>();
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    if ((await row.locator('.ui-badge').first().textContent())?.trim() !== 'Dedicated screen') continue;
    destinations.add(((await row.locator('.ui-cross-reference__label').first().textContent()) ?? '').trim());
  }
  expect(destinations.size, 'no capability area claims a screen of its own').toBeGreaterThan(0);

  for (const label of destinations) {
    // The screen named must be one the shell actually offers, not a name invented by the map.
    await expect(
      page.getByRole('navigation').getByRole('button', { name: new RegExp(label) }),
      `the coverage matrix names a "${label}" screen, which the navigation rail does not have`,
    ).toHaveCount(1);

    await openCoverageMatrix(page);
    await rowContaining(page, label).first().locator('.ui-cross-reference--navigable').first().click();

    // The named screen becomes the active one: its own page header, and the rail marks it.
    await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[aria-current="page"]')).toHaveAccessibleName(new RegExp(label));
  }
});

// plan-docker_management_app/REQ-105; batches.md "Departures from the spec", One and Three — the
// capabilities the product withdrew are stated as console-only, with the command that reaches them
test('the withdrawn capabilities and Docker Scout are declared console-only, with their command', async ({ page }) => {
  await openCoverageMatrix(page);

  for (const { capability, command } of CONSOLE_ONLY_CAPABILITIES) {
    const row = rowContaining(page, command);
    await expect(row, `${capability} is not stated anywhere on the coverage matrix`).toHaveCount(1);
    await expect(row.locator('.ui-badge').first(), `${capability} must be declared console-only`).toHaveText('Console only');
    // A gap is never stated without why it is a gap, and it leads to the console that reaches it.
    await expect(row.getByRole('button', { name: /Raw console/ })).toHaveCount(1);
    expect((await row.textContent())?.length ?? 0).toBeGreaterThan(60);
  }
});

// plan-docker_management_app/REQ-105 — nothing the product withdrew may be presented as covered by a
// screen of its own
test('no row claims a dedicated screen for a capability the product withdrew', async ({ page }) => {
  await openCoverageMatrix(page);

  for (const { capability, command } of CONSOLE_ONLY_CAPABILITIES) {
    const claimed = rowContaining(page, command).filter({ has: page.getByText('Dedicated screen', { exact: true }) });
    await expect(claimed, `${capability} is presented as covered by a dedicated screen`).toHaveCount(0);
  }
});

// plan-docker_management_app/REQ-106 — the declared Engine API and CLI baseline is shown next to the
// version of the daemon currently connected, so a mismatch is visible
test('the declared baseline sits beside the daemon Docker itself reports, and the verdict follows', async ({ page }) => {
  const fromDocker = await daemonVersionsFromDocker();
  await openCoverageMatrix(page);

  const values = page.locator('.ui-definition-list__row');
  const declaredApi = values.filter({ hasText: /Declared Engine API/i }).locator('.ui-definition-list__value');
  await expect(declaredApi).toHaveText(/v\d+\.\d+/);
  await expect(values.filter({ hasText: /Declared docker CLI/i }).locator('.ui-definition-list__value')).not.toBeEmpty();

  // The daemon half is the daemon Docker reports for the active context — not a value written here.
  await expect(values.filter({ hasText: /daemon Engine API/i }).locator('.ui-definition-list__value')).toHaveText(
    `v${fromDocker.apiVersion}`,
  );
  await expect(values.filter({ hasText: /daemon version/i }).locator('.ui-definition-list__value')).toHaveText(fromDocker.version);

  // The verdict is the one the two readings imply, whichever way they diverge on this machine.
  const declared = ((await declaredApi.textContent()) ?? '').replace(/^v/, '').trim();
  await expect(baselineStrip(page)).toContainText(expectedVerdict(declared, fromDocker.apiVersion));
  // Both readings are on the strip itself, so the divergence is read off one line.
  await expect(baselineStrip(page)).toContainText(declared);
  await expect(baselineStrip(page)).toContainText(fromDocker.version);
});

// plan-docker_management_app/REQ-106 — the baseline can be read again on demand, and the matrix does
// not depend on it: coverage-matrix-screen.md, "An unreachable daemon empties neither the matrix nor
// the declared half of the baseline"
test('re-reading the baseline leaves the coverage statement standing', async ({ page }) => {
  await openCoverageMatrix(page);
  const rowsBefore = await matrix(page).locator('.ui-data-table__row').count();

  await baselineStrip(page).getByRole('button', { name: /Re-?read/i }).click();

  await expect(baselineStrip(page)).toContainText(/declared Engine API/i);
  await expect(matrix(page).locator('.ui-data-table__row')).toHaveCount(rowsBefore);
});

// plan-docker_management_app-about_license_notice/REQ-1, REQ-2, REQ-3, REQ-4, REQ-5 — the screen a
// previous version persisted under its internal id reopens under its new label, with nothing
// removed from it
test('a screen persisted under its internal id reopens as "About", carrying everything it showed', async ({ page }) => {
  // What an earlier version persisted as the last active screen is the internal id, which the
  // rename did not touch: writing exactly that value and loading the application is that upgrade
  // replayed. The whole file addresses the screen this way, through an `openApp` the rename left
  // untouched — that it still works is itself the evidence for REQ-2.
  await openApp(page, 'coverage-matrix');

  // No migration step and nothing to redo: the screen is already the active one on load, and the
  // rail already marks it.
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
  await expect(page.locator('[aria-current="page"]')).toHaveAccessibleName(/About/);

  // REQ-1 — reached from the permanent navigation as the last entry of "Full coverage".
  const fullCoverage = page.locator('div:has(> .ui-nav-group__label:text-is("Full coverage")) .ui-nav-group__items');
  await expect(fullCoverage.locator('.ui-nav-item__label').last()).toHaveText('About');
  // REQ-5 — nothing offered to the operator still carries the old name.
  await expect(page.getByRole('navigation').getByRole('button', { name: /Coverage matrix/i })).toHaveCount(0);

  // REQ-4 — with the label no longer advertising it, the header's one-line description is what
  // says the functional coverage matrix is on this screen.
  await expect(page.locator('.ui-page-header__description')).toContainText(/coverage matrix/i);

  // REQ-3 — the rename took nothing off the screen: the shell's cards are still there, and so is the
  // matrix under a heading of its own. The daemon event stream is not among them any more:
  // `plan-ui-coherence-optimisation/REQ-71` supersedes that clause of REQ-3 and leaves the stream on
  // the Dashboard alone (app-shell/specs/shell.md).
  for (const title of ['CLI availability', 'Local storage']) {
    await expect(shellCard(page, title), `the "${title}" card is no longer on the screen`).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Docker capability coverage' })).toBeVisible();
  await expect(matrix(page).locator('.ui-data-table__row').first()).toBeVisible({ timeout: 30_000 });
});
