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
//
// The rows are the object list — the same table containers and images ship
// (`plan-ui-coherence-optimisation/REQ-36`, and the classic-table plan's REQ-15),
// so the values are read out of the
// column each belongs to rather than off one hand-built line. What a jsdom
// render can say about REQ-37 is the **structural** half of it — every value is
// a column of one line, and the one whose presence depends on the registry's
// state is a column of its own — while the row boxes themselves are measured in
// a browser (`e2e/registries-row-geometry.spec.ts`).
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
  return screen.getByText(host).closest('.ui-data-table__row') as HTMLElement;
}

/**
 * The content a row carries below its cells — the tag chips.
 *
 * Its **sibling**, not its parent: the row card that used to hold both is gone
 * with the presentation that drew it, and the slot is conditional on nothing
 * (`data-table.md`, and the classic-table plan's REQ-6).
 */
function rowContentOf(name: string): HTMLElement {
  return rowOf(name).nextElementSibling as HTMLElement;
}

/** The list a row belongs to — the registries one, or the repositories one. */
function listOf(row: HTMLElement): HTMLElement {
  return row.closest('.ui-data-table') as HTMLElement;
}

/**
 * The cell of a row belonging to the column whose header matches `header`.
 *
 * Read through the header rather than by position, which is what
 * `data-table.md` guarantees: "every column renders in the header and in every
 * row, in the same order". A value asserted this way is asserted to be **in its
 * own column**, which is the whole of REQ-37's structural claim.
 */
function cellOf(host: string, header: RegExp): HTMLElement {
  const row = rowOf(host);
  const headers = Array.from(listOf(row).querySelectorAll('.ui-data-table__header-cell')).map((cell) => (cell.textContent ?? '').trim());
  const index = headers.findIndex((label) => header.test(label));
  expect(index, `no column of this list is headed ${header} — headers are ${JSON.stringify(headers)}`).toBeGreaterThanOrEqual(0);
  return row.querySelectorAll<HTMLElement>('.ui-data-table__cell')[index];
}

/** The text of a cell, whitespace collapsed. */
function textOf(element: HTMLElement): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The lines a cell draws, in order. One entry per line is the point: a cell of
 * this list is a fixed number of lines whatever the registry's state (REQ-37),
 * so a value is asserted as "line 2 of the registry column" rather than as a
 * substring of everything the row happens to say.
 */
function linesOf(cell: HTMLElement): string[] {
  return Array.from(cell.querySelectorAll<HTMLElement>('.ui-table-two-line-cell__title, .ui-table-two-line-cell__subtitle, .ui-table-meta-cell')).map(textOf);
}

/** The action cluster of a row, the one place a row's actions may live (REQ-36). */
function clusterOf(host: string): HTMLElement {
  return rowOf(host).querySelector('.ui-action-button-group') as HTMLElement;
}

/**
 * What the repositories browser draws in place of repositories, whichever of the
 * five it is.
 *
 * The panel is no longer a surface to be found from its heading: its section
 * header and its search toolbar sit **above** the one unpadded card holding its
 * list (`registries-screen.md`, and the classic-table plan's REQ-40). It is
 * therefore the innermost region that carries both the heading and a list.
 */
function browserEmptyState(): HTMLElement {
  const heading = screen.getByRole('heading', { name: /^Repositories/ });
  let panel: HTMLElement | null = heading.parentElement;
  while (panel !== null && panel.querySelector('.ui-data-table') === null) panel = panel.parentElement;
  expect(panel, 'the repositories heading is drawn nowhere near a list').not.toBeNull();
  return panel!.querySelector('.ui-empty-state') as HTMLElement;
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

/** Four registries, one per state the row has to draw: the fixture REQ-37 is about. */
function fourStatedRegistries() {
  return [
    registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat', credentialStore: 'test-helper' }),
    registry({ host: 'team.example.test', official: false, authenticated: true }),
    registry({ host: 'registry.internal:5000', official: false }),
    registry({ host: 'localhost:5000', official: false, secure: false }),
  ];
}

describe('RegistriesScreen — the registries panel (registries/specs/registries-screen.md)', () => {
  // REQ-36 — "Registries are listed with the object-list primitive, hand-built cards deleted";
  // registries-screen.md — "**Both lists are the containers list** … the **same row**, of the
  // reference's own fixed height and vertical alignment, stating no row modifier of its own", each
  // "alone in an **unpadded card it fills edge to edge**".
  //
  // **Contract and state only** (`.../classic-table/REQ-31`): every box is zero in jsdom. The boxes
  // are measured in a browser (`e2e/classic-table-criteria.spec.ts`).
  it('lists the registries on the object list, asking for no presentation, and draws no card list', () => {
    registriesResult.registries = fourStatedRegistries();

    renderScreen();

    // The `--comfortable` class assertion stood here until 2026-08-16 and went **with the class**
    // (`.../classic-table/REQ-22`, `REQ-28`): nothing emits it, so it could no longer fail. Its
    // claim — this list asks for no presentation — is the row-modifier assertion below, which a row
    // can still break, plus the guard that refuses the vocabulary outright
    // (`card-row-presentation-retired.test.ts`, `scripts/check-ui-conformance.mjs`).
    const list = listOf(rowOf('ghcr.io'));
    for (const row of list.querySelectorAll('.ui-data-table__row')) {
      expect(Array.from(row.classList).filter((name) => name !== 'ui-data-table__row' && name !== 'ui-data-table__row--selected')).toEqual([]);
    }
    const card = list.closest('.ui-surface');
    expect(card, 'the list sits in no card at all').not.toBeNull();
    expect(card!.classList.contains('ui-surface--pad-none'), 'the list’s card is padded').toBe(true);
    expect(card!.children).toHaveLength(1);
    expect(card!.firstElementChild, 'the card holds something besides the list').toBe(list);
    expect(card!.querySelector('.ui-section-header'), 'the section header is inside the list’s card').toBeNull();
    expect(card!.parentElement?.closest('.ui-surface') ?? null, 'the list’s card sits inside another surface').toBeNull();
    expect(list.querySelectorAll('.ui-surface'), 'a row is drawn on a surface of its own').toHaveLength(0);
    expect(document.querySelectorAll('.ui-card-list')).toHaveLength(0);
    expect(document.querySelectorAll('.ui-card-list__item')).toHaveLength(0);
  });

  // "a leading dot — green when the session is authenticated, muted when it is not"
  it('gives an authenticated registry a green dot and an unauthenticated one a muted dot', () => {
    registriesResult.registries = fourStatedRegistries();

    renderScreen();

    expect(rowOf('ghcr.io').querySelector('.ui-table-status-dot--tone-success')).not.toBeNull();
    expect(rowOf('registry.internal:5000').querySelector('.ui-table-status-dot--tone-neutral')).not.toBeNull();
  });

  // "the host over the account the credential is in the name of"
  it('states the account of an authenticated registry under its host', () => {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat', credentialStore: 'test-helper' })];

    renderScreen();

    expect(linesOf(cellOf('ghcr.io', /^registry$/i))).toEqual(['ghcr.io', 'octocat']);
  });

  // "the credential store — the helper's name ... — and nothing at all when the registry is not
  // authenticated", as a column of its own (REQ-37: a value whose presence depends on the state
  // cannot share a line with another)
  it('states the credential store in a column of its own, never on the host\'s line', () => {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat', credentialStore: 'test-helper' })];

    renderScreen();

    expect(linesOf(cellOf('ghcr.io', /^credential store$/i))).toEqual(['test-helper']);
    expect(textOf(cellOf('ghcr.io', /^registry$/i))).not.toContain('test-helper');
  });

  // "or 'docker config file' when the credential lives in the configuration file"
  it('names the docker config file as the store when there is no helper', () => {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' })];

    renderScreen();

    expect(linesOf(cellOf('ghcr.io', /^credential store$/i))).toEqual(['docker config file']);
  });

  // "(nothing there when the store reports no name)" — the account is what is missing, and the
  // state the row is in is still stated
  it('states just "authenticated" when the store reports no account name', () => {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false, authenticated: true, credentialStore: 'test-helper' })];

    renderScreen();

    expect(linesOf(cellOf('ghcr.io', /^registry$/i))).toEqual(['ghcr.io', 'authenticated']);
    expect(linesOf(cellOf('ghcr.io', /^credential store$/i))).toEqual(['test-helper']);
  });

  // "not authenticated" — and "nothing at all when the registry is not authenticated" in the
  // credential-store column, which is the column's own placeholder and costs the row no height
  it('states that a registry with no credential is not authenticated, and names no store for it', () => {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false, credentialStore: 'test-helper' })];

    renderScreen();

    expect(linesOf(cellOf('ghcr.io', /^registry$/i))).toEqual(['ghcr.io', 'not authenticated']);
    expect(textOf(cellOf('ghcr.io', /^credential store$/i))).not.toContain('test-helper');
    expect(textOf(cellOf('ghcr.io', /^credential store$/i))).toMatch(/^[-–—]?$/);
  });

  // "followed by 'plain http' for a registry reached over plain http"
  it('adds "plain http" last for a registry reached over plain http', () => {
    registriesResult.registries = [registry({ host: 'localhost:5000', official: false, secure: false })];

    renderScreen();

    expect(linesOf(cellOf('localhost:5000', /^registry$/i))).toEqual(['localhost:5000', 'not authenticated · plain http']);
  });

  // REQ-37 — "an authenticated registry naming an account and a credential store occupies exactly
  // as many lines as one that is merely 'not authenticated'. The row's values are columns of one
  // line each, so no value can add a line to the row that carries it." What a jsdom render can say
  // is the structural half: every row draws the same cells, and every cell of every row draws the
  // same number of lines — the state deciding what a line *says*, never how many there are.
  it('draws the same cells, each holding the same number of lines, whatever a registry\'s state', () => {
    registriesResult.registries = fourStatedRegistries();

    renderScreen();

    const shapes = fourStatedRegistries().map((entry) => {
      const cells = Array.from(rowOf(entry.host).querySelectorAll<HTMLElement>('.ui-data-table__cell'));
      return {
        host: entry.host,
        cells: cells.length,
        // One line per `TwoLineCell` line and one per `MetaCell`, counted per cell.
        lines: cells.map((cell) => cell.querySelectorAll('.ui-table-two-line-cell__title, .ui-table-two-line-cell__subtitle, .ui-table-meta-cell').length),
      };
    });

    expect(new Set(shapes.map((shape) => shape.cells)).size, `rows draw different numbers of cells: ${JSON.stringify(shapes)}`).toBe(1);
    expect(new Set(shapes.map((shape) => shape.lines.join(','))).size, `rows draw different numbers of lines: ${JSON.stringify(shapes)}`).toBe(1);
  });

  // REQ-36 — "each row's 'Log in' / 'Log out' is an action of the cluster, not a trailing one-off
  // button"; registries-screen.md — "the log in weighing more than the log out"
  it('offers "Log out" on an authenticated registry and "Log in" on one that is not, both inside the row\'s action cluster', () => {
    registriesResult.registries = [
      registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' }),
      registry({ host: 'registry.internal:5000', official: false }),
    ];

    renderScreen();

    expect(within(clusterOf('ghcr.io')).getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(within(rowOf('ghcr.io')).queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
    expect(within(clusterOf('registry.internal:5000')).getByRole('button', { name: 'Log in' })).toBeInTheDocument();

    // The cluster is the row's only control: nothing else on a row is clickable but the row itself
    // (registries-screen.md, "No affordance of this screen is a one-off").
    for (const host of ['ghcr.io', 'registry.internal:5000']) {
      const buttons = Array.from(rowOf(host).querySelectorAll('button'));
      const inCluster = Array.from(clusterOf(host).querySelectorAll('button'));
      expect(buttons, `a control of the ${host} row sits outside its action cluster`).toEqual(inCluster);
    }
  });

  // action-button-group.md — the log in weighs more than the log out, which is the only thing the
  // screen says about either
  it('weighs the log in above the log out', () => {
    registriesResult.registries = [
      registry({ host: 'ghcr.io', official: false, authenticated: true, account: 'octocat' }),
      registry({ host: 'registry.internal:5000', official: false }),
    ];

    renderScreen();

    const logIn = within(clusterOf('registry.internal:5000')).getByRole('button', { name: 'Log in' });
    const logOut = within(clusterOf('ghcr.io')).getByRole('button', { name: 'Log out' });
    // `secondary` is the cluster's default weight and carries no modifier of its own, so what is
    // asserted is that the log in is the heavier of the two and the log out takes the default.
    expect(logIn.className).toContain('ui-button--primary');
    expect(logOut.className).not.toContain('ui-button--primary');
    expect(logOut.className).not.toContain('ui-button--destructive');
  });

  // ui-library/specs/action-button-group.md — the cluster "stops click propagation so an action
  // never also triggers the containing row's onRowSelect": logging in is not also a selection.
  it('does not select the row when its log-in action is used', async () => {
    const user = userEvent.setup();
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false }), registry({ host: 'registry.internal:5000', official: false })];
    renderScreen();
    await waitFor(() => expect(lastRepositoriesArgs.host).toBe('ghcr.io'));

    await user.click(within(clusterOf('registry.internal:5000')).getByRole('button', { name: 'Log in' }));

    expect(lastRepositoriesArgs.host).toBe('ghcr.io');
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

  // REQ-36 — the repository/tag browser is listed with the same primitive; registries-screen.md —
  // "the repositories of the selected registry listed the same way, each over a row of tag chips"
  it('lists the repositories on the object list too, asking for no presentation, and draws no card list', () => {
    registriesResult.registries = [registry()];
    repositoriesResult.entries = [entry({ repository: { name: 'library/nginx' } })];

    renderScreen();

    const list = listOf(rowOf('library/nginx'));
    // The `--comfortable` class assertion stood here until 2026-08-16 and went with the class
    // (`.../classic-table/REQ-22`, `REQ-28`): nothing emits it, so it could no longer fail. Unlike
    // the registries list above, this one had no live neighbour carrying the claim, so it is
    // **restated** against what does: a repository row states no modifier the reference row does not.
    for (const row of list.querySelectorAll('.ui-data-table__row')) {
      expect(
        Array.from(row.classList).filter((name) => name !== 'ui-data-table__row' && name !== 'ui-data-table__row--selected'),
        'a repository row states a modifier of its own where the reference row states none',
      ).toEqual([]);
    }
    const card = list.closest('.ui-surface');
    expect(card!.classList.contains('ui-surface--pad-none'), 'the list’s card is padded').toBe(true);
    expect(card!.children).toHaveLength(1);
    expect(card!.firstElementChild, 'the card holds something besides the list').toBe(list);
    expect(list.querySelectorAll('.ui-surface'), 'a repository row is drawn on a surface of its own').toHaveLength(0);
    expect(document.querySelectorAll('.ui-card-list')).toHaveLength(0);
  });

  // "One row per repository found: its name over its description when the registry publishes one,
  // and its pull count when it publishes one, abbreviated ('48k pulls', '1.8B pulls')"
  it('shows a repository with its description and its abbreviated pull count', () => {
    registriesResult.registries = [registry()];
    repositoriesResult.entries = [
      entry({ repository: { name: 'library/nginx', description: 'Official build of Nginx.', pullCount: 1_800_000_000 } }),
      entry({ repository: { name: 'myorg/api', pullCount: 48_000 } }),
    ];

    renderScreen();

    expect(linesOf(cellOf('library/nginx', /^repository$/i))).toEqual(['library/nginx', 'Official build of Nginx.']);
    expect(linesOf(cellOf('library/nginx', /^pulls$/i))).toEqual(['1.8B pulls']);
    expect(linesOf(cellOf('myorg/api', /^pulls$/i))).toEqual(['48k pulls']);
  });

  // "Under each repository, one chip per tag: the tag name, the size it weighs, and an inline
  // 'pull'." — the row content the list carries under every row, drawn by a slot conditional on
  // nothing (data-table.md, and the classic-table plan's REQ-6).
  it('shows one chip per tag with its size and an inline pull, under the row itself', () => {
    registriesResult.registries = [registry({ host: 'registry.internal:5000', official: false })];
    repositoriesResult.entries = [entry({ tags: [tag({ name: 'v1', sizeBytes: 5_242_880 })] })];

    renderScreen();

    const content = rowContentOf('team/api');
    expect(content).not.toBeNull();
    expect(content.classList.contains('ui-data-table__row-content'), 'the row is not followed by its own content').toBe(true);
    expect(content).toHaveTextContent('v1');
    expect(content).toHaveTextContent('5MB');
    expect(within(content).getByRole('button', { name: 'pull' })).toBeInTheDocument();
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

  // REQ-38 — "The delivered empty state is preserved in the primitive's form ... it survives as a
  // title, one line and the resolving action, with the same words."
  it('invites a search on the default index as a title, one line and the action that resolves it', () => {
    registriesResult.registries = [registry({ host: 'docker.io', official: true })];

    renderScreen();

    const state = browserEmptyState();
    expect(state.querySelector('.ui-empty-state__title')).toHaveTextContent('Search Docker Hub');
    expect(state.querySelectorAll('.ui-empty-state__description')).toHaveLength(1);
    expect(state.querySelector('.ui-empty-state__description')).toHaveTextContent('Docker Hub has no catalog to list: type a term to search it.');
    expect(within(state).getAllByRole('button')).toHaveLength(1);
  });

  // registries-screen.md — that state's control "puts the cursor in the search box", which is the
  // whole of what makes it a resolving action rather than a sentence.
  it('puts the cursor in the search box when the invitation\'s action is used', async () => {
    const user = userEvent.setup();
    registriesResult.registries = [registry({ host: 'docker.io', official: true })];
    renderScreen();

    await user.click(within(browserEmptyState()).getAllByRole('button')[0]);

    expect(document.activeElement).toBe(screen.getByLabelText('Search repositories'));
  });

  // registries-screen.md — "In place of the repositories, one of five states — each a title, an
  // explanation where the title does not say everything, and the control that resolves it where one
  // would". The five, in the conditions each belongs to.
  it('draws the state its condition calls for, out of the five the browser has', () => {
    // No registry selected: there is none to select.
    registriesResult = { registries: [], loaded: true, refresh: refreshRegistries, logIn, logOut };
    renderScreen();
    expect(browserEmptyState().querySelector('.ui-empty-state__title')).toHaveTextContent('Select a registry');
    expect(browserEmptyState().querySelector('.ui-empty-state__description')).not.toBeNull();

    // A search in flight.
    cleanup();
    registriesResult = { registries: [registry({ host: 'registry.internal:5000', official: false })], loaded: true, refresh: refreshRegistries, logIn, logOut };
    repositoriesResult = { entries: [], loaded: false, searching: true, refresh: refreshRepositories };
    renderScreen();
    expect(browserEmptyState().querySelector('.ui-empty-state__title')).toHaveTextContent('Searching…');

    // The registry's first catalog read has not settled.
    cleanup();
    repositoriesResult = { entries: [], loaded: false, searching: false, refresh: refreshRepositories };
    renderScreen();
    expect(browserEmptyState().querySelector('.ui-empty-state__title')).toHaveTextContent('Reading repositories…');

    // Nothing matched, with no term typed: the line says the registry published none, and nothing
    // the operator does from here would change that.
    cleanup();
    repositoriesResult = { entries: [], loaded: true, searching: false, refresh: refreshRepositories };
    renderScreen();
    expect(browserEmptyState().querySelector('.ui-empty-state__title')).toHaveTextContent('No repositories match');
    expect(browserEmptyState().querySelector('.ui-empty-state__description')).toHaveTextContent('registry.internal:5000');
    expect(within(browserEmptyState()).queryAllByRole('button')).toHaveLength(0);
  });

  // "with a term typed, the line names it and a control clears it"
  it('names the term nothing matched and offers the control that clears it', async () => {
    const user = userEvent.setup();
    registriesResult.registries = [registry({ host: 'registry.internal:5000', official: false })];
    repositoriesResult = { entries: [], loaded: true, searching: false, refresh: refreshRepositories };
    renderScreen();
    await user.type(screen.getByLabelText('Search repositories'), 'nothing-matches-this');

    await waitFor(() => expect(browserEmptyState().querySelector('.ui-empty-state__description')).toHaveTextContent('nothing-matches-this'));
    const clear = within(browserEmptyState()).getAllByRole('button')[0];
    await user.click(clear);

    expect(screen.getByLabelText('Search repositories')).toHaveValue('');
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

  // registries-screen.md — "the search is the screen's one toolbar", and screen-toolbar.md — a
  // toolbar given no action "draws no action row, and therefore no space where one would have been"
  it('carries one toolbar, holding the search and no action row', () => {
    registriesResult.registries = [registry({ host: 'docker.io' })];

    renderScreen();

    const toolbars = Array.from(document.querySelectorAll<HTMLElement>('.ui-screen-toolbar'));
    expect(toolbars).toHaveLength(1);
    expect(within(toolbars[0]).getByLabelText('Search repositories')).toBeInTheDocument();
    expect(toolbars[0].querySelectorAll('.ui-screen-toolbar__actions')).toHaveLength(0);
  });

  // data-table.md — "the row whose key matches `selectedRowKey` renders in its selected state": the
  // registry being browsed is the one marked in the list.
  it('marks the registry it is browsing as the selected row', async () => {
    registriesResult.registries = [registry({ host: 'ghcr.io', official: false }), registry({ host: 'registry.internal:5000', official: false })];
    renderScreen();
    await waitFor(() => expect(lastRepositoriesArgs.host).toBe('ghcr.io'));

    expect(rowOf('ghcr.io').className).toContain('ui-data-table__row--selected');
    expect(rowOf('registry.internal:5000').className).not.toContain('ui-data-table__row--selected');
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
