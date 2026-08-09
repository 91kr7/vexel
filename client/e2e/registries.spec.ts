import { expect, test, type Locator, type Page } from '@playwright/test';
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

function registriesPanel(page: Page) {
  return screenContent(page).locator('.ui-surface', {
    has: page.getByRole('heading', { level: 2, name: 'Registries & credentials' }),
  });
}

function repositoriesPanel(page: Page) {
  return screenContent(page).locator('.ui-surface').filter({ has: page.getByRole('heading', { level: 2, name: /^Repositories · / }) });
}

function registryRow(page: Page, host: string): Locator {
  return registriesPanel(page).locator('.ui-card-list > .ui-surface', {
    has: page.locator('.ui-card-list__title', { hasText: host }),
  });
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

  // The row's leading dot says the state on its own (card-list.md, status variant).
  await expect(row.locator('.ui-card-list__leading > *').first()).toBeVisible();

  // Whether this machine is logged in to Docker Hub is the operator's business, not the spec's:
  // what is asserted is that the row says one of the two things the contract allows, and offers the
  // action that goes with it.
  const line = (await row.locator('.ui-card-list__subtitle').first().innerText()).trim();
  if (line.startsWith('not authenticated')) {
    await expect(row.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Log out' })).toHaveCount(0);
    expect(line).not.toContain('credential store');
  } else {
    await expect(row.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Log in' })).toHaveCount(0);
    expect(line).toContain('credential store:');
  }
});

// plan-docker_management_app/REQ-87 — credentials are never displayed back in clear text.
// registries-screen.md — "The line never shows a credential, only whether there is one and in
// whose name."
test('never puts a credential on a registry row, only whether there is one', async ({ page }) => {
  const row = registryRow(page, 'docker.io');
  await expect(row).toBeVisible({ timeout: 20_000 });

  const line = (await row.locator('.ui-card-list__subtitle').first().innerText()).trim();
  // Each part is one of the four the contract allows; nothing else may appear on that line.
  for (const part of line.split('·').map((value) => value.trim())) {
    expect(part).toMatch(/^(not authenticated|authenticated|plain http|credential store: .+|[^\s:]+)$/);
  }
  expect(line).not.toMatch(/password|token=|secret|Bearer /i);
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
  // term to search it.') on the default index with no term"
  await expect(panel.getByText('Search Docker Hub')).toBeVisible();
  await expect(panel.getByText('Docker Hub has no catalog to list: type a term to search it.')).toBeVisible();
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
    panel.locator('.ui-card-list__title').first().or(panel.getByText('No repositories match')).or(panel.getByText('Could not browse the registry')),
  ).toBeVisible({ timeout: 20_000 });
});
