import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RegistrySummary, TagSummary } from '../../src/data/registries-client';
import type { RepositoryEntry, UseRegistryRepositoriesResult } from '../../src/data/use-registry-repositories';
import type { UseRegistriesResult } from '../../src/data/use-registries';

// The Registries screen composes two hooks and the images area's pull stream
// (registries/specs/registries-screen.md). All three are mocked here, so what
// is under test is the screen's own contract: what each row states, what the
// log-in form asks for and refuses, what a log out confirms, what the browser
// shows in place of repositories — and, above all, that no credential is ever
// displayed, kept or echoed (REQ-87).
const logIn = vi.fn();
const logOut = vi.fn();
const refreshRegistries = vi.fn();
const refreshRepositories = vi.fn();

let registriesResult: UseRegistriesResult;
let repositoriesResult: UseRegistryRepositoriesResult;
let lastRepositoriesArgs: { host: string | undefined; query: string } = { host: undefined, query: '' };
let pullStreamUrls: (string | undefined)[] = [];

vi.mock('../../src/data/use-registries', () => ({
  useRegistries: () => registriesResult,
}));

vi.mock('../../src/data/use-registry-repositories', () => ({
  useRegistryRepositories: (host: string | undefined, query: string) => {
    lastRepositoriesArgs = { host, query };
    return repositoriesResult;
  },
}));

vi.mock('../../src/data/images-client', () => ({
  imagePullStreamUrl: (reference: string) => `/api/images/pull/stream?reference=${encodeURIComponent(reference)}`,
}));

vi.mock('../../src/data/use-image-transfer', () => ({
  useImageTransferStream: (url: string | undefined) => {
    pullStreamUrls.push(url);
    return { steps: [], done: false, error: undefined };
  },
}));

const { RegistriesScreen } = await import('../../src/registries/RegistriesScreen');
const { ConfirmationProvider } = await import('../../src/shell/services/ConfirmationService');
const { ErrorReportingProvider, useErrorReporter } = await import('../../src/shell/services/ErrorReportingService');
const { ProgressProvider } = await import('../../src/shell/services/ProgressService');
const { ToastProvider } = await import('../../src/ui');

function registry(overrides: Partial<RegistrySummary> = {}): RegistrySummary {
  return { host: 'docker.io', serverUrl: 'https://index.docker.io/v1/', authenticated: false, secure: true, official: true, ...overrides };
}

function tag(overrides: Partial<TagSummary> = {}): TagSummary {
  return { name: 'v1', sizeBytes: 5_242_880, pullReference: 'registry.internal:5000/team/api:v1', ...overrides };
}

function entry(overrides: Partial<RepositoryEntry> = {}): RepositoryEntry {
  return { repository: { name: 'team/api' }, tags: [], tagsLoading: false, ...overrides };
}

function ReportedErrors() {
  const { errors } = useErrorReporter();
  return (
    <>
      {errors.map((error) => (
        <p key={error.id}>{`${error.title}${error.detail ? `: ${error.detail}` : ''}`}</p>
      ))}
    </>
  );
}

function renderScreen() {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <RegistriesScreen />
            <ReportedErrors />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
}

function rowOf(host: string): HTMLElement {
  return screen.getByText(host).closest('.ui-card-list__item') as HTMLElement;
}

/** The whole card of a row: its header and the content rendered under it (the tag chips). */
function cardOf(name: string): HTMLElement {
  return rowOf(name).parentElement as HTMLElement;
}

/** The dialog currently open, whichever one it is. */
function openDialog(): HTMLElement {
  return document.querySelector('.ui-modal') as HTMLElement;
}

/** The whole rendered screen as text: what the operator can read, anywhere on it. */
function visibleText(): string {
  return document.body.textContent ?? '';
}

beforeEach(() => {
  logIn.mockReset();
  logOut.mockReset();
  refreshRegistries.mockReset();
  refreshRepositories.mockReset();
  pullStreamUrls = [];
  registriesResult = { registries: [], loaded: true, refresh: refreshRegistries, logIn, logOut };
  repositoriesResult = { entries: [], loaded: true, searching: false, refresh: refreshRepositories };
});

afterEach(cleanup);

describe('RegistriesScreen — the registries panel (registries/specs/registries-screen.md)', () => {
  // "One row per configured registry: the host as title ... authenticated -> the account ..., then
  // 'credential store: <helper>'"
  it('states the account and the credential store of an authenticated registry', () => {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat', credentialStore: 'osxkeychain' })];

    renderScreen();

    expect(rowOf('ghcr.io')).toHaveTextContent('octocat · credential store: osxkeychain');
  });

  // "'credential store: docker config file' when the credential lives in the configuration file"
  it('names the docker config file as the store when there is no helper', () => {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' })];

    renderScreen();

    expect(rowOf('ghcr.io')).toHaveTextContent('octocat · credential store: docker config file');
  });

  // "(or just 'authenticated' when the store reports no name)"
  it('states just "authenticated" when the store reports no account name', () => {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false, authenticated: true, credentialStore: 'osxkeychain' })];

    renderScreen();

    expect(rowOf('ghcr.io')).toHaveTextContent('authenticated · credential store: osxkeychain');
  });

  // "not authenticated -> 'not authenticated'"
  it('states that a registry with no credential is not authenticated', () => {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false })];

    renderScreen();

    expect(rowOf('ghcr.io')).toHaveTextContent('not authenticated');
    expect(rowOf('ghcr.io')).not.toHaveTextContent('credential store');
  });

  // "a registry reached over plain http adds 'plain http' as a last part"
  it('adds "plain http" last for a registry reached over plain http', () => {
    registriesResult.registries = [registry({ host: 'localhost:5000', official: false, secure: false })];

    renderScreen();

    expect(rowOf('localhost:5000')).toHaveTextContent('not authenticated · plain http');
  });

  // "A trailing 'Log out' on an authenticated registry, a 'Log in' on one that is not."
  it('offers "Log out" on an authenticated registry and "Log in" on one that is not', () => {
    registriesResult.registries = [
      registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' }),
      registry({ host: 'registry.internal:5000', official: false }),
    ];

    renderScreen();

    expect(within(rowOf('ghcr.io')).getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(within(rowOf('ghcr.io')).queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
    expect(within(rowOf('registry.internal:5000')).getByRole('button', { name: 'Log in' })).toBeInTheDocument();
  });

  // "'Reading registries…' before the first read settles, 'No registries configured' when there are
  // none"
  it('says it is reading before the first read settles, and that there are none once it has', () => {
    registriesResult = { registries: [], loaded: false, refresh: refreshRegistries, logIn, logOut };
    const { unmount } = render(
      <ErrorReportingProvider>
        <ProgressProvider>
          <ConfirmationProvider>
            <ToastProvider>
              <RegistriesScreen />
            </ToastProvider>
          </ConfirmationProvider>
        </ProgressProvider>
      </ErrorReportingProvider>,
    );
    expect(screen.getByText('Reading registries…')).toBeInTheDocument();
    unmount();

    registriesResult = { registries: [], loaded: true, refresh: refreshRegistries, logIn, logOut };
    renderScreen();

    expect(screen.getByText('No registries configured')).toBeInTheDocument();
  });

  // "an error banner with retry when the inventory cannot be read"
  it('shows an error banner with a retry when the inventory cannot be read', async () => {
    const user = userEvent.setup();
    registriesResult = { registries: [], loaded: true, error: 'docker is not available', refresh: refreshRegistries, logIn, logOut };

    renderScreen();
    expect(screen.getByText('docker is not available')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(refreshRegistries).toHaveBeenCalled();
  });

  // "the first registry read selects one on its own, so the browser always has a registry to work
  // against"
  it('selects the first registry on its own, so the browser has one to work against', async () => {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false }), registry({ host: 'registry.internal:5000', official: false })];

    renderScreen();

    await waitFor(() => expect(lastRepositoriesArgs.host).toBe('ghcr.io'));
  });

  // "Selecting a registry row -> the right panel browses that registry"
  it('browses the registry whose row is selected', async () => {
    const user = userEvent.setup();
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false }), registry({ host: 'registry.internal:5000', official: false })];
    renderScreen();
    await waitFor(() => expect(lastRepositoriesArgs.host).toBe('ghcr.io'));

    await user.click(screen.getByText('registry.internal:5000'));

    await waitFor(() => expect(lastRepositoriesArgs.host).toBe('registry.internal:5000'));
  });
});

describe('RegistriesScreen — the repositories browser (registries/specs/registries-screen.md)', () => {
  // "The right panel's title as 'Repositories · <host>', extended with '/<term>' while a term is
  // typed"
  it('titles the browser with the registry, extended with the term being typed', async () => {
    const user = userEvent.setup();
    registriesResult.registries = [registry({ host: 'docker.io' })];
    renderScreen();
    expect(screen.getByRole('heading', { name: 'Repositories · docker.io' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search repositories'), 'myorg');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Repositories · docker.io/myorg' })).toBeInTheDocument());
  });

  // "Next to that title, whether the browsing is authenticated: 'authenticated as <account>', or
  // 'anonymous'."
  it('states next to the title whether the browsing is authenticated or anonymous', () => {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' })];
    renderScreen();
    expect(screen.getByText('authenticated as octocat')).toBeInTheDocument();

    cleanup();
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false })];
    renderScreen();
    expect(screen.getByText('anonymous')).toBeInTheDocument();
  });

  // "One card row per repository found: its name, its description when the registry publishes one,
  // and its pull count when it publishes one, abbreviated ('48k pulls', '1.8B pulls')"
  it('shows a repository with its description and its abbreviated pull count', () => {
    registriesResult.registries = [registry()];
    repositoriesResult.entries = [
      entry({ repository: { name: 'library/nginx', description: 'Official build of Nginx.', pullCount: 1_800_000_000 } }),
      entry({ repository: { name: 'myorg/api', pullCount: 48_000 } }),
    ];

    renderScreen();

    expect(rowOf('library/nginx')).toHaveTextContent('Official build of Nginx.');
    expect(rowOf('library/nginx')).toHaveTextContent('1.8B pulls');
    expect(rowOf('myorg/api')).toHaveTextContent('48k pulls');
  });

  // "Under each repository, one chip per tag: the tag name, the size it weighs, and an inline
  // 'pull'."
  it('shows one chip per tag with its size and an inline pull', () => {
    registriesResult.registries = [registry({ host: 'registry.internal:5000', official: false })];
    repositoriesResult.entries = [entry({ tags: [tag({ name: 'v1', sizeBytes: 5_242_880 })] })];

    renderScreen();

    const card = cardOf('team/api');
    expect(card).toHaveTextContent('v1');
    expect(card).toHaveTextContent('5MB');
    expect(within(card).getByRole('button', { name: 'pull' })).toBeInTheDocument();
  });

  // "'Reading tags…' while they load, the failure's message in their place when the listing failed,
  // and 'No tags reachable' when there are none."
  it('says it is reading the tags, then reports their failure, then says there are none', () => {
    registriesResult.registries = [registry({ host: 'registry.internal:5000', official: false })];
    repositoriesResult.entries = [entry({ tagsLoading: true })];
    renderScreen();
    expect(screen.getByText('Reading tags…')).toBeInTheDocument();

    cleanup();
    repositoriesResult.entries = [entry({ tagsError: 'the manifest could not be read' })];
    renderScreen();
    expect(screen.getByText('the manifest could not be read')).toBeInTheDocument();

    cleanup();
    repositoriesResult.entries = [entry()];
    renderScreen();
    expect(screen.getByText('No tags reachable')).toBeInTheDocument();
  });

  // "'Search Docker Hub' (with 'Docker Hub has no catalog to list: type a term to search it.') on
  // the default index with no term"
  it('invites a search on the default index, which has no catalog to list', () => {
    registriesResult.registries = [registry({ host: 'docker.io', official: true })];

    renderScreen();

    expect(screen.getByText('Search Docker Hub')).toBeInTheDocument();
    expect(screen.getByText('Docker Hub has no catalog to list: type a term to search it.')).toBeInTheDocument();
  });

  // "'Searching…' while a search is in flight, and 'No repositories match' otherwise"
  it('says it is searching while a search is in flight, and that nothing matched once it is not', () => {
    registriesResult.registries = [registry({ host: 'registry.internal:5000', official: false })];
    repositoriesResult = { entries: [], loaded: false, searching: true, refresh: refreshRepositories };
    renderScreen();
    expect(screen.getByText('Searching…')).toBeInTheDocument();

    cleanup();
    repositoriesResult = { entries: [], loaded: true, searching: false, refresh: refreshRepositories };
    renderScreen();
    expect(screen.getByText('No repositories match')).toBeInTheDocument();
  });

  // "An error banner with retry when the registry could not be browsed — including when it refuses
  // an anonymous client, which says so in the message."
  it('shows an error banner with retry when the registry refuses an anonymous client', async () => {
    const user = userEvent.setup();
    registriesResult.registries = [registry({ host: 'registry.internal:5000', official: false })];
    repositoriesResult = {
      entries: [],
      loaded: true,
      searching: false,
      error: 'registry.internal:5000 could not be browsed: it requires credentials this application does not hold.',
      refresh: refreshRepositories,
    };

    renderScreen();
    expect(screen.getByText(/requires credentials this application does not hold/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(refreshRepositories).toHaveBeenCalled();
  });

  // "Typing in the search box -> searches (default index) or filters (any other registry) the
  // repositories."
  it('hands the typed term to the browser', async () => {
    const user = userEvent.setup();
    registriesResult.registries = [registry({ host: 'registry.internal:5000', official: false })];
    renderScreen();

    await user.type(screen.getByLabelText('Search repositories'), 'api');

    await waitFor(() => expect(lastRepositoriesArgs.query).toBe('api'));
  });
});

describe('RegistriesScreen — logging in and out (registries/specs/registries-screen.md)', () => {
  const secret = 'the-operators-access-token';

  function authenticatedScreen() {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' })];
    renderScreen();
  }

  function anonymousScreen() {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false })];
    renderScreen();
  }

  // "'Log in' -> opens a form asking for a username and a masked password/access token, stating
  // that the credential goes to the host's Docker credential store and is never kept, shown or
  // logged."
  it('opens a form asking for a username and a masked secret, stating where the credential goes', async () => {
    const user = userEvent.setup();
    anonymousScreen();

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByRole('heading', { name: 'Log in to ghcr.io' })).toBeInTheDocument();
    expect(screen.getByLabelText('Registry username')).toBeInTheDocument();
    const secretField = screen.getByLabelText('Registry password or access token');
    expect(secretField).toHaveAttribute('type', 'password');
    expect(visibleText()).toMatch(/credential store/i);
    expect(visibleText()).toMatch(/never kept, shown or logged/i);
  });

  // "The form cannot be submitted with an empty username or an empty secret."
  it('cannot be submitted with an empty username or an empty secret', async () => {
    const user = userEvent.setup();
    anonymousScreen();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    const submit = screen.getAllByRole('button', { name: 'Log in' }).at(-1)!;

    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Registry username'), 'octocat');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Registry password or access token'), secret);
    expect(submit).toBeEnabled();

    await user.clear(screen.getByLabelText('Registry username'));
    expect(submit).toBeDisabled();
  });

  // "Submitting logs in, closes the form and the row turns authenticated"
  it('submits the typed credential once and closes the form', async () => {
    const user = userEvent.setup();
    logIn.mockResolvedValue(registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' }));
    anonymousScreen();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await user.type(screen.getByLabelText('Registry username'), 'octocat');
    await user.type(screen.getByLabelText('Registry password or access token'), secret);

    await user.click(screen.getAllByRole('button', { name: 'Log in' }).at(-1)!);

    await waitFor(() => expect(logIn).toHaveBeenCalledWith({ host: 'ghcr.io', username: 'octocat', secret }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Log in to ghcr.io' })).not.toBeInTheDocument());
  });

  // "a refusal is reported and the form stays open"
  it('reports a refusal and keeps the form open, without the secret in the report', async () => {
    const user = userEvent.setup();
    logIn.mockRejectedValue(new Error('login attempt failed with status: 401 Unauthorized'));
    anonymousScreen();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await user.type(screen.getByLabelText('Registry username'), 'octocat');
    await user.type(screen.getByLabelText('Registry password or access token'), secret);

    await user.click(screen.getAllByRole('button', { name: 'Log in' }).at(-1)!);

    await waitFor(() => expect(screen.getByText(/401 Unauthorized/)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Log in to ghcr.io' })).toBeInTheDocument();
    expect(visibleText()).not.toContain(secret);
  });

  // REQ-87 — "the secret ... is dropped the moment the form closes whichever way it did"
  it('drops the typed secret when the form is cancelled', async () => {
    const user = userEvent.setup();
    anonymousScreen();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await user.type(screen.getByLabelText('Registry password or access token'), secret);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByLabelText('Registry password or access token')).toHaveValue('');
  });

  it('drops the typed secret once a log in has succeeded', async () => {
    const user = userEvent.setup();
    logIn.mockResolvedValue(registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' }));
    anonymousScreen();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await user.type(screen.getByLabelText('Registry username'), 'octocat');
    await user.type(screen.getByLabelText('Registry password or access token'), secret);
    await user.click(screen.getAllByRole('button', { name: 'Log in' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Log in to ghcr.io' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByLabelText('Registry password or access token')).toHaveValue('');
  });

  // REQ-87 — "masked with no reveal control while typed, and ... never part of a toast, a banner or
  // a title"
  it('offers no way to reveal the secret and shows it nowhere on the screen', async () => {
    const user = userEvent.setup();
    logIn.mockResolvedValue(registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' }));
    anonymousScreen();
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await user.type(screen.getByLabelText('Registry username'), 'octocat');
    await user.type(screen.getByLabelText('Registry password or access token'), secret);

    // No control anywhere in the form turns the masked field into a readable one.
    const secretField = screen.getByLabelText('Registry password or access token');
    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent ?? '').not.toMatch(/show|reveal|eye/i);
    }
    expect(secretField).toHaveAttribute('type', 'password');
    expect(visibleText()).not.toContain(secret);

    await user.click(screen.getAllByRole('button', { name: 'Log in' }).at(-1)!);

    // Not in the confirmation that follows either.
    await waitFor(() => expect(screen.getByText('Logged in')).toBeInTheDocument());
    expect(visibleText()).not.toContain(secret);
  });

  // "'Log out' -> asks for confirmation, naming the registry and stating that the stored credential
  // goes from the host's credential store; once confirmed, the row turns unauthenticated."
  it('asks for confirmation before logging out, naming the registry and the store', async () => {
    const user = userEvent.setup();
    logOut.mockResolvedValue(registry({ host: 'ghcr.io', official: false }));
    authenticatedScreen();

    await user.click(screen.getByRole('button', { name: 'Log out' }));

    const dialog = openDialog();
    expect(dialog).toHaveTextContent('ghcr.io');
    expect(dialog.textContent ?? '').toMatch(/credential store/i);
    expect(logOut).not.toHaveBeenCalled();
  });

  it('logs out only once the confirmation is given', async () => {
    const user = userEvent.setup();
    logOut.mockResolvedValue(registry({ host: 'ghcr.io', official: false }));
    authenticatedScreen();
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(logOut).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    await user.click(screen.getAllByRole('button', { name: 'Log out' }).at(-1)!);

    await waitFor(() => expect(logOut).toHaveBeenCalledWith('ghcr.io'));
  });
});

describe('RegistriesScreen — pulling a tag (registries/specs/registries-screen.md)', () => {
  // "A tag chip's 'pull' -> opens a dialog naming the exact reference that will be pulled, with a
  // copy affordance"; "The reference a tag is pulled by is the one the server computed for that
  // tag; the screen never assembles it from parts."
  it('names the server\'s own pull reference for the tag, never one it assembled', async () => {
    const user = userEvent.setup();
    registriesResult.registries = [registry({ host: 'registry.internal:5000', official: false })];
    // Deliberately unlike anything the screen could build from the host and the repository.
    repositoriesResult.entries = [entry({ tags: [tag({ name: 'v1', pullReference: 'other.example/elsewhere/app:pinned' })] })];
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'pull' }));

    expect(screen.getByRole('heading', { name: 'Pull tag' })).toBeInTheDocument();
    expect(screen.getByText('other.example/elsewhere/app:pinned')).toBeInTheDocument();
    expect(screen.queryByText('registry.internal:5000/team/api:v1')).not.toBeInTheDocument();
  });

  // "confirming starts the pull and shows per-layer progress" — through the images area's existing
  // pull stream, which this screen never reimplements.
  it('starts the pull on the images area\'s own stream, for that exact reference', async () => {
    const user = userEvent.setup();
    registriesResult.registries = [registry({ host: 'registry.internal:5000', official: false })];
    repositoriesResult.entries = [entry({ tags: [tag({ name: 'v1', pullReference: 'registry.internal:5000/team/api:v1' })] })];
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'pull' }));

    expect(pullStreamUrls.at(-1)).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Pull' }));

    await waitFor(() =>
      expect(pullStreamUrls.at(-1)).toBe(`/api/images/pull/stream?reference=${encodeURIComponent('registry.internal:5000/team/api:v1')}`),
    );
  });
});
