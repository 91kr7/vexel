import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';

// The Registries screen browsed in a real browser, against the operator's own
// Docker installation (REQ-85, REQ-86, REQ-87).
//
// Nothing here logs in or out. A credential belongs to the host's credential
// store and to the operator, and this suite runs against their real one: the
// log-in path is therefore driven up to — and never past — the submit button,
// which is exactly where REQ-87's promises are observable (masked, no reveal,
// dropped when the form closes, never displayed back). What a credential
// actually does to the store is proved where it can be undone, in the server's
// own registry suite against a throwaway registry.
//
// For the same reason, the registry these specs browse is the default index:
// it is the one registry the inventory always holds, logged in or not, whatever
// machine this runs on. A throwaway local registry cannot be reached here — it
// would have to be written into the operator's Docker configuration first.

const SECRET_TYPED = 'e2e-typed-secret-value-never-submitted';

function screenContent(page: Page) {
  return page.locator('.ui-frame__content');
}

// Neither panel is a surface: each has its section header — and, on the right,
// its search toolbar — **above** the one unpadded card that holds its list and
// nothing else, which is the composition containers and images ship
// (`registries-screen.md`). So a panel is scoped by the region holding all of
// them, and the innermost of the nested ones is taken: every region matching
// contains the same heading and is therefore an ancestor of the next, so the last
// in document order is the panel's own.
function registriesPanel(page: Page) {
  return screenContent(page)
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Registries & credentials' }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

function repositoriesPanel(page: Page) {
  return screenContent(page)
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: /^Repositories · / }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

// The rows are the object list — the same table containers and images ship: a row
// is a `.ui-data-table__row`, its host is the first line of the REGISTRY column,
// and the credential store is a column of its own rather than part of the line
// under the host.
function registryRow(page: Page, host: string): Locator {
  return registriesPanel(page).locator('.ui-data-table__row', {
    has: page.locator('.ui-table-two-line-cell__title', { hasText: host }),
  });
}

/** The line under the host: what the row says about its authentication state. */
function stateLine(row: Locator): Locator {
  return row.locator('.ui-table-two-line-cell__subtitle').first();
}

/**
 * The text of the cell belonging to the column whose header matches `header`.
 *
 * Read through the header rather than by position, which is what `data-table.md`
 * guarantees: "every column renders in the header and in every row, in the same
 * order".
 */
async function cellText(row: Locator, header: RegExp): Promise<string> {
  return row.evaluate((element, pattern) => {
    const list = element.closest('.ui-data-table')!;
    const headers = Array.from(list.querySelectorAll('.ui-data-table__header-cell')).map((cell) => (cell.textContent ?? '').trim());
    const index = headers.findIndex((label) => new RegExp(pattern.source, pattern.flags).test(label));
    if (index < 0) throw new Error(`no column headed ${pattern.source} — headers are ${JSON.stringify(headers)}`);
    const cell = element.querySelectorAll('.ui-data-table__cell')[index];
    return (cell?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }, { source: header.source, flags: header.flags });
}

function loginDialog(page: Page) {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: /^Log in to / }) });
}

// The last active screen survives by design (REQ-115), so the screen this suite
// needs is pinned rather than inherited from whichever spec ran before.
test.beforeEach(async ({ page }) => {
  await openApp(page, 'registries');
  await expect(screenContent(page).getByRole('heading', { level: 2, name: 'Registries & credentials' })).toBeVisible({ timeout: 20_000 });
});

// plan-docker_management_app/REQ-85 — configured registries are listed with their host, the
// authenticated account, the credential store in use and whether the session is authenticated.
// The default index is always part of the inventory, logged in or not, and comes first
// (registries-service.md), so it is the one row every machine has.
test('lists the default index with its state line and the action its state calls for', async ({ page }) => {
  const row = registryRow(page, 'docker.io');
  await expect(row).toBeVisible({ timeout: 20_000 });

  // The row's leading dot says the state on its own (registries-screen.md).
  await expect(row.locator('.ui-table-status-dot').first()).toBeVisible();

  // Whether this machine is logged in to Docker Hub is the operator's business, not the spec's:
  // what is asserted is that the row says one of the two things the contract allows, offers the
  // action that goes with it, and states the credential store in the column of its own it now has
  // (REQ-36, REQ-37) — nothing at all there when the registry is not authenticated.
  const line = (await stateLine(row).innerText()).trim();
  const store = await cellText(row, /^credential store$/i);
  if (line.startsWith('not authenticated')) {
    await expect(row.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Log out' })).toHaveCount(0);
    expect(store, 'an unauthenticated registry names a credential store').toMatch(/^[-–—]?$/);
  } else {
    await expect(row.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Log in' })).toHaveCount(0);
    expect(store, 'an authenticated registry names no credential store').not.toMatch(/^[-–—]?$/);
  }
  expect(line, 'the state line carries the credential store the column is now for').not.toContain('credential store');
});

// plan-ui-coherence-optimisation/REQ-36 — the row's `Log in` / `Log out` "is an action of the
// cluster, not a trailing one-off button"; registries-screen.md — "nothing else on a row is
// clickable but the row itself".
test('offers the row its action inside the cluster, and no other control of its own', async ({ page }) => {
  const row = registryRow(page, 'docker.io');
  await expect(row).toBeVisible({ timeout: 20_000 });

  const cluster = row.locator('.ui-action-button-group');
  await expect(cluster).toHaveCount(1);
  expect(await cluster.getByRole('button').count(), 'the cluster holds no action').toBeGreaterThan(0);
  expect(await row.locator('button').count(), 'a control of the row sits outside its action cluster').toBe(
    await cluster.locator('button').count(),
  );
  // And the screen draws no card list at all any more.
  await expect(page.locator('.ui-card-list')).toHaveCount(0);
});

// plan-docker_management_app/REQ-87 — credentials are never displayed back in clear text.
// registries-screen.md — "The line never shows a credential, only whether there is one and in
// whose name."
test('never puts a credential on a registry row, only whether there is one', async ({ page }) => {
  const row = registryRow(page, 'docker.io');
  await expect(row).toBeVisible({ timeout: 20_000 });

  const line = (await stateLine(row).innerText()).trim();
  // Each part is one of the three the contract allows on that line; nothing else may appear on it.
  for (const part of line.split('·').map((value) => value.trim())) {
    expect(part).toMatch(/^(not authenticated|authenticated|plain http|[^\s:]+)$/);
  }
  expect(line).not.toMatch(/password|token=|secret|Bearer /i);
  // The other column that could carry one names a store, never a credential.
  expect(await cellText(row, /^credential store$/i)).not.toMatch(/password|token=|secret|Bearer /i);
});

// plan-docker_management_app/REQ-85, REQ-87 — a registry can be logged in to, and the form states
// that the credential goes to the host's Docker credential store and is never kept, shown or
// logged. Nothing is ever submitted here.
test('the log-in form asks for a username and a masked secret, and states where the credential goes', async ({ page }) => {
  const row = registryRow(page, 'docker.io');
  await expect(row).toBeVisible({ timeout: 20_000 });
  const logIn = row.getByRole('button', { name: 'Log in' });
  if ((await logIn.count()) === 0) test.skip(true, 'this machine is already logged in to the default index; the form is reached from a logged-out row');

  await logIn.click();
  const dialog = loginDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/credential store/i);
  await expect(dialog).toContainText(/never kept, shown or logged/i);

  await expect(dialog.getByLabel('Registry username')).toBeVisible();
  const secretField = dialog.getByLabel('Registry password or access token');
  await expect(secretField).toBeVisible();
  await expect(secretField).toHaveAttribute('type', 'password');
});

// registries-screen.md — "The form cannot be submitted with an empty username or an empty secret."
test('the log-in form cannot be submitted without both a username and a secret', async ({ page }) => {
  const row = registryRow(page, 'docker.io');
  await expect(row).toBeVisible({ timeout: 20_000 });
  const logIn = row.getByRole('button', { name: 'Log in' });
  if ((await logIn.count()) === 0) test.skip(true, 'this machine is already logged in to the default index; the form is reached from a logged-out row');

  await logIn.click();
  const dialog = loginDialog(page);
  const submit = dialog.getByRole('button', { name: 'Log in' });
  await expect(submit).toBeDisabled();

  await dialog.getByLabel('Registry username').fill('vexel-e2e-nobody');
  await expect(submit).toBeDisabled();

  await dialog.getByLabel('Registry password or access token').fill(SECRET_TYPED);
  await expect(submit).toBeEnabled();

  // Nothing is submitted: the form is abandoned instead.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});

// plan-docker_management_app/REQ-87 — a credential is never displayed back in clear text.
// registries-screen.md / secret-field.md — masked with no reveal control, and dropped the moment
// the form closes whichever way it did.
test('a typed secret is masked, has no reveal control and is gone when the form is reopened', async ({ page }) => {
  const row = registryRow(page, 'docker.io');
  await expect(row).toBeVisible({ timeout: 20_000 });
  const logIn = row.getByRole('button', { name: 'Log in' });
  if ((await logIn.count()) === 0) test.skip(true, 'this machine is already logged in to the default index; the form is reached from a logged-out row');

  await logIn.click();
  const dialog = loginDialog(page);
  const secretField = dialog.getByLabel('Registry password or access token');
  await secretField.fill(SECRET_TYPED);

  // Masked, with nothing anywhere in the form that could unmask it.
  await expect(secretField).toHaveAttribute('type', 'password');
  await expect(dialog.getByRole('button', { name: /show|reveal/i })).toHaveCount(0);
  // And nowhere on the page in clear text, in any element's text.
  await expect(page.getByText(SECRET_TYPED)).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  await logIn.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Registry password or access token')).toHaveValue('');
  await expect(page.getByText(SECRET_TYPED)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

// plan-docker_management_app/REQ-86 — repositories reachable from a selected registry can be
// browsed and searched; registries-screen.md — the browser's title, the badge stating whether the
// browsing is authenticated, and the default index's invitation to search.
test('browses the selected registry, stating whether the browsing is authenticated', async ({ page }) => {
  await expect(registryRow(page, 'docker.io')).toBeVisible({ timeout: 20_000 });

  const panel = repositoriesPanel(page);
  await expect(panel.getByRole('heading', { level: 2, name: 'Repositories · docker.io' })).toBeVisible();
  // Anonymous unless the operator's store holds a Docker Hub credential; either reading is the
  // contract's, and neither may name anything but an account.
  await expect(panel.getByText(/^(anonymous|authenticated( as .+)?)$/)).toBeVisible();

  // registries-screen.md — "'Search Docker Hub' (with 'Docker Hub has no catalog to list: type a
  // term to search it.') on the default index with no term", and — REQ-38 — the control that
  // resolves it, which the migration keeps as a title, one line and one action.
  await expect(panel.getByText('Search Docker Hub')).toBeVisible();
  await expect(panel.getByText('Docker Hub has no catalog to list: type a term to search it.')).toBeVisible();
  await expect(panel.locator('.ui-empty-state').getByRole('button')).toHaveCount(1);
});

// plan-docker_management_app/REQ-86 — repositories "can be browsed and searched";
// registries-screen.md — the title "extended with /<term> while a term is typed", and the
// invitation giving way to the search's own outcome.
test('searching the default index extends the title with the term and leaves the invitation behind', async ({ page }) => {
  await expect(registryRow(page, 'docker.io')).toBeVisible({ timeout: 20_000 });
  const panel = repositoriesPanel(page);

  await panel.getByLabel('Search repositories').fill('alpine');

  await expect(panel.getByRole('heading', { level: 2, name: 'Repositories · docker.io/alpine' })).toBeVisible();
  // What the search finds depends on a network this spec does not own; that it stops inviting a
  // term and reports an outcome — results, no match, or a failure it names — does not.
  await expect(panel.getByText('Docker Hub has no catalog to list: type a term to search it.')).toHaveCount(0, { timeout: 20_000 });
  await expect(
    panel.locator('.ui-data-table__row').first().or(panel.getByText('No repositories match')).or(panel.getByText('Could not browse the registry')),
  ).toBeVisible({ timeout: 20_000 });
});
