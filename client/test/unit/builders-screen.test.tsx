import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BuildCacheRecord, BuildCacheUsage, BuilderSummary } from '../../src/data/builders-client';
import type { UseBuildCacheResult } from '../../src/data/use-build-cache';
import type { UseBuildCacheUsageResult } from '../../src/data/use-build-cache-usage';
import type { UseBuildersResult } from '../../src/data/use-builders';

/**
 * F8 — the builders and build-cache screen
 * (`plan-ui-coherence-optimisation/REQ-39`, `REQ-40`, `REQ-41`;
 * `builders/specs/builders-screen.md`).
 *
 * The three hooks the screen composes are mocked, so what is under test is the
 * screen's own contract: which column each value is stated in, how many times a
 * builder's name is stated, what is a control and what is a reading, and where
 * the screen's page-level actions live.
 *
 * What a jsdom render can say about a row is **structural** — one cell per
 * column, read through the header naming it, and the same number of lines in a
 * cell whatever the builder's state. The row boxes themselves (equal heights,
 * header and rows on one set of tracks, the pan at the phone breakpoint) are
 * measured in a browser: `e2e/builders-row-geometry.spec.ts`. Neither replaces
 * the other.
 */

const create = vi.fn();
const remove = vi.fn();
const use = vi.fn();
const refreshBuilders = vi.fn();
const prune = vi.fn();
const refreshCache = vi.fn();
const refreshUsage = vi.fn();
const navigateTo = vi.fn();
const consumeRequest = vi.fn();

let buildersResult: UseBuildersResult;
let cacheResult: UseBuildCacheResult;
let usageResult: UseBuildCacheUsageResult;
let usageAskedFor: (string | undefined)[] = [];

vi.mock('../../src/data/use-builders', () => ({
  useBuilders: () => buildersResult,
}));

vi.mock('../../src/data/use-build-cache', () => ({
  useBuildCache: () => cacheResult,
}));

vi.mock('../../src/data/use-build-cache-usage', () => ({
  useBuildCacheUsage: (recordId: string | undefined) => {
    usageAskedFor.push(recordId);
    return usageResult;
  },
}));

vi.mock('../../src/shell/services/CrossNavigationService', async () => {
  const actual = await vi.importActual<typeof import('../../src/shell/services/CrossNavigationService')>(
    '../../src/shell/services/CrossNavigationService',
  );
  return { ...actual, useCrossNavigation: () => ({ request: undefined, navigateTo, consumeRequest }) };
});

const { BuildersScreen } = await import('../../src/builders/BuildersScreen');
const { ConfirmationProvider } = await import('../../src/shell/services/ConfirmationService');
const { ErrorReportingProvider } = await import('../../src/shell/services/ErrorReportingService');
const { ProgressProvider } = await import('../../src/shell/services/ProgressService');
const { ToastProvider } = await import('../../src/ui');

function builder(overrides: Partial<BuilderSummary> = {}): BuilderSummary {
  return {
    name: 'multiarch',
    driver: 'docker-container',
    endpoint: 'desktop-linux',
    platforms: ['linux/amd64', 'linux/arm64'],
    status: 'running',
    active: false,
    cacheBytes: 15_400_000,
    ...overrides,
  };
}

function record(overrides: Partial<BuildCacheRecord> = {}): BuildCacheRecord {
  return { id: 'sha256:0123456789abcdef0123456789abcdef', type: 'regular', sizeBytes: 5_242_880, usageState: 'reclaimable', ...overrides };
}

function renderScreen() {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <BuildersScreen />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
}

/** The card a list is drawn in, named by the section header it carries. */
function card(title: 'buildx builders' | 'Build cache'): HTMLElement {
  return screen.getByRole('heading', { name: title }).closest('.ui-surface') as HTMLElement;
}

function listIn(title: 'buildx builders' | 'Build cache'): HTMLElement {
  return card(title).querySelector('.ui-data-table') as HTMLElement;
}

function rowsIn(title: 'buildx builders' | 'Build cache'): HTMLElement[] {
  return Array.from(listIn(title).querySelectorAll<HTMLElement>('.ui-data-table__row'));
}

function headersIn(title: 'buildx builders' | 'Build cache'): string[] {
  return Array.from(listIn(title).querySelectorAll('.ui-data-table__header-cell')).map((cell) => (cell.textContent ?? '').trim());
}

/**
 * The cell of a row belonging to the column whose header matches `header`.
 *
 * Read through the header rather than by position, which is what
 * `data-table.md` guarantees: "every column renders in the header and in every
 * row, in the same order". A value asserted this way is asserted to be **in its
 * own column**, which is REQ-39's structural claim.
 */
function cellOf(list: 'buildx builders' | 'Build cache', row: HTMLElement, header: RegExp): HTMLElement {
  const headers = headersIn(list);
  const index = headers.findIndex((label) => header.test(label));
  expect(index, `no column of the ${list} list is headed ${header} — headers are ${JSON.stringify(headers)}`).toBeGreaterThanOrEqual(0);
  return row.querySelectorAll<HTMLElement>('.ui-data-table__cell')[index];
}

function rowOf(list: 'buildx builders' | 'Build cache', text: string): HTMLElement {
  const found = rowsIn(list).find((row) => (row.textContent ?? '').includes(text));
  expect(found, `no row of the ${list} list states ${text}`).toBeDefined();
  return found!;
}

function textOf(element: HTMLElement): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The lines a cell draws, in order: a cell of this list is the same number of lines whatever the state. */
function linesOf(cell: HTMLElement): string[] {
  return Array.from(
    cell.querySelectorAll<HTMLElement>(
      '.ui-table-two-line-cell__title, .ui-table-two-line-cell__subtitle, .ui-table-meta-cell, .ui-table-status-dot-cell, .ui-table-identifier-cell',
    ),
  ).map(textOf);
}

/** How many times `value` occurs in `text` — REQ-40 is a claim about a count. */
function occurrences(text: string, value: string): number {
  return text.split(value).length - 1;
}

beforeEach(() => {
  create.mockReset();
  remove.mockReset();
  use.mockReset();
  prune.mockReset();
  refreshBuilders.mockReset();
  refreshCache.mockReset();
  refreshUsage.mockReset();
  navigateTo.mockReset();
  consumeRequest.mockReset();
  usageAskedFor = [];
  create.mockResolvedValue(builder());
  use.mockResolvedValue(builder({ active: true }));
  remove.mockResolvedValue(undefined);
  prune.mockResolvedValue({ reclaimedBytes: 2_097_152 });
  buildersResult = { builders: [], loaded: true, refresh: refreshBuilders, create, remove, use };
  cacheResult = { records: [], loaded: true, refresh: refreshCache, prune };
  usageResult = { usage: undefined, loaded: false, refresh: refreshUsage };
});

afterEach(cleanup);

describe('BuildersScreen — the builder list (REQ-39, REQ-40)', () => {
  // REQ-39 — "Builders and build cache are listed with the object-list primitive, hand-built cards
  // deleted"; builders-screen.md — "the object list's comfortable variant below"
  it('lists the builders on the object list, in its comfortable variant, and draws no card list', () => {
    buildersResult.builders = [builder()];
    renderScreen();

    expect(listIn('buildx builders')).not.toBeNull();
    expect(listIn('buildx builders').className).toMatch(/comfortable/);
    expect(document.querySelectorAll('.ui-card-list'), 'the screen still draws a hand-built card list').toHaveLength(0);
    expect(rowsIn('buildx builders')).toHaveLength(1);
  });

  // builders-screen.md — "lists every builder as a row of seven columns: the active marker, the
  // builder (name over its driver), its endpoint, its platforms, its status, its cache size, and
  // its actions"
  it('states each value of a builder in a column of its own', () => {
    buildersResult.builders = [builder({ name: 'multiarch', driver: 'docker-container', endpoint: 'tcp://build01:1234' })];
    renderScreen();

    const row = rowOf('buildx builders', 'multiarch');
    expect(row.querySelectorAll('.ui-data-table__cell')).toHaveLength(headersIn('buildx builders').length);
    expect(linesOf(cellOf('buildx builders', row, /^BUILDER$/i))).toEqual(['multiarch', 'docker-container']);
    expect(textOf(cellOf('buildx builders', row, /^ENDPOINT$/i))).toBe('tcp://build01:1234');
    expect(textOf(cellOf('buildx builders', row, /^PLATFORMS$/i))).toBe('linux/amd64, linux/arm64');
    expect(textOf(cellOf('buildx builders', row, /^STATUS$/i))).toBe('running');
    expect(textOf(cellOf('buildx builders', row, /^CACHE$/i))).toBe('14.7MB');
  });

  // REQ-40 — "A builder's name appears once per row. The delivered row prints it as its title and
  // again as a third line; one of the two goes, and no other property of the row is lost with it";
  // builders-screen.md — "The endpoint column is empty for a builder whose endpoint is its own
  // name … the cell's tooltip states why it holds nothing"
  it('states a builder’s name once per row, whatever the driver reports as its endpoint', () => {
    buildersResult.builders = [
      // The `docker` driver's case: buildx names such a builder after the context its node answers
      // on, so the endpoint it reports **is** the name.
      builder({ name: 'desktop-linux', driver: 'docker', endpoint: 'desktop-linux', cacheBytes: undefined }),
      builder({ name: 'multiarch', endpoint: 'tcp://build01:1234' }),
    ];
    renderScreen();

    for (const name of ['desktop-linux', 'multiarch']) {
      const row = rowOf('buildx builders', name);
      expect(occurrences(textOf(row), name), `the ${name} row states its own name more than once`).toBe(1);
      expect(textOf(cellOf('buildx builders', row, /^BUILDER$/i))).toContain(name);
    }

    // The value is not merely deleted: the column states why it holds nothing.
    const endpointCell = cellOf('buildx builders', rowOf('buildx builders', 'desktop-linux'), /^ENDPOINT$/i);
    expect(textOf(endpointCell), 'the endpoint column repeats the builder’s name').not.toContain('desktop-linux');
    expect(
      endpointCell.querySelector('[title]')?.getAttribute('title') ?? '',
      'the empty endpoint cell offers no reason for being empty',
    ).toMatch(/desktop-linux/);

    // …and every other endpoint is still shown.
    expect(textOf(cellOf('buildx builders', rowOf('buildx builders', 'multiarch'), /^ENDPOINT$/i))).toBe('tcp://build01:1234');
  });

  // builders-screen.md — "Every cell is one line high whatever the builder's state, so every row is
  // the same height as every other" — the two values that come and go being columns of their own
  it('draws the same number of lines in a column whatever the builder’s state', () => {
    buildersResult.builders = [
      builder({ name: 'complete', endpoint: 'tcp://build01:1234', cacheBytes: 15_400_000, active: true }),
      builder({ name: 'bare', driver: 'docker', endpoint: 'bare', cacheBytes: undefined, active: false, platforms: [] }),
    ];
    renderScreen();

    const headers = headersIn('buildx builders');
    for (const header of headers.filter((label) => label !== '' && !/^ACTIONS$/i.test(label))) {
      const pattern = new RegExp(`^${header}$`, 'i');
      const complete = linesOf(cellOf('buildx builders', rowOf('buildx builders', 'complete'), pattern));
      const bare = linesOf(cellOf('buildx builders', rowOf('buildx builders', 'bare'), pattern));
      expect(bare.length, `the ${header} cell draws ${complete.length} line(s) on one row and ${bare.length} on the other`).toBe(complete.length);
    }
  });

  // builders-screen.md — "A cache size the builder did not report reads `unavailable`, with the
  // reason as its tooltip — never a blank, and never a number belonging to another builder"
  it('states an unreported cache size as unavailable, with the reason as its tooltip', () => {
    buildersResult.builders = [builder({ name: 'bare', cacheBytes: undefined }), builder({ name: 'complete', cacheBytes: 15_400_000 })];
    renderScreen();

    const cell = cellOf('buildx builders', rowOf('buildx builders', 'bare'), /^CACHE$/i);
    expect(textOf(cell)).toBe('unavailable');
    expect(cell.querySelector('[title]')?.getAttribute('title') ?? '', 'the unavailable cache size offers no reason').not.toBe('');
    expect(textOf(cellOf('buildx builders', rowOf('buildx builders', 'complete'), /^CACHE$/i))).toBe('14.7MB');
  });
});

describe('BuildersScreen — a state is never a control (REQ-39, REQ-27)', () => {
  // REQ-39 — "each row's mixed cluster — `running` · `cache 14.6MB` · `in use` · `Remove` — is
  // expressed as a status column plus an action cluster, so a pill, a plain string and a button are
  // no longer one undifferentiated line"; builders-screen.md — "the only clickable things in a row
  // are the cluster's buttons"
  it('puts every control of a row in its action cluster, and nothing else', () => {
    buildersResult.builders = [builder({ name: 'multiarch' }), builder({ name: 'current', active: true })];
    renderScreen();

    for (const name of ['multiarch', 'current']) {
      const row = rowOf('buildx builders', name);
      const cluster = row.querySelector('.ui-action-button-group');
      expect(cluster, `the ${name} row draws no action cluster`).not.toBeNull();
      expect(
        row.querySelectorAll('button, [role="button"], a').length,
        `a control of the ${name} row sits outside its action cluster`,
      ).toBe(cluster!.querySelectorAll('button, [role="button"], a').length);
      // …and the cluster is a cell of the row, not a trailing run of its own.
      expect(cluster!.closest('.ui-data-table__cell'), `the ${name} row's cluster is not a cell`).not.toBeNull();
    }

    // The status reading and the active marker are cells, and no control is in either of them.
    const statusCell = cellOf('buildx builders', rowOf('buildx builders', 'multiarch'), /^STATUS$/i);
    expect(statusCell.querySelectorAll('button, [role="button"]'), 'the status reading is clickable').toHaveLength(0);
    const markerRow = rowOf('buildx builders', 'in use');
    const markerCell = Array.from(markerRow.querySelectorAll<HTMLElement>('.ui-data-table__cell')).find((cell) => textOf(cell) === 'in use');
    expect(markerCell, 'the active marker is not a cell of its own').toBeDefined();
    expect(markerCell!.querySelectorAll('button, [role="button"]'), 'the active marker is clickable').toHaveLength(0);
  });

  // builders-screen.md — the "Use" action "is offered only on the builders that are not already
  // active, the active one being marked 'in use' in its own column"; REQ-27 — it has "a weight and
  // the appearance of a control, never a bare word"
  it('offers Use as an action on every builder but the active one, which carries the marker instead', async () => {
    const user = userEvent.setup();
    buildersResult.builders = [builder({ name: 'multiarch' }), builder({ name: 'current', active: true })];
    renderScreen();

    const idle = within(rowOf('buildx builders', 'multiarch'));
    const active = within(rowOf('buildx builders', 'current'));
    expect(idle.getByRole('button', { name: 'Use' })).toBeInTheDocument();
    expect(active.queryByRole('button', { name: 'Use' }), 'the active builder is offered an action that would do nothing').toBeNull();
    expect(active.getByText('in use', { exact: true })).toBeInTheDocument();
    expect(idle.queryByText('in use', { exact: true }), 'a builder that is not active is marked as if it were').toBeNull();

    // Every row keeps its removal action, active or not.
    expect(idle.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(active.getByRole('button', { name: 'Remove' })).toBeInTheDocument();

    await user.click(idle.getByRole('button', { name: 'Use' }));
    await waitFor(() => expect(use).toHaveBeenCalledWith('multiarch'));
  });

  // builders-screen.md — a builder's "Remove" action "confirms (destructive-confirmation service),
  // then removes it"; cancelling performs nothing
  it('confirms before removing a builder, and removes nothing when the confirmation is refused', async () => {
    const user = userEvent.setup();
    buildersResult.builders = [builder({ name: 'multiarch' })];
    renderScreen();

    await user.click(within(rowOf('buildx builders', 'multiarch')).getByRole('button', { name: 'Remove' }));
    const dialog = await screen.findByRole('heading', { name: /multiarch/ });
    expect(dialog).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await user.click(within(document.querySelector('.ui-modal') as HTMLElement).getByRole('button', { name: 'Cancel' }));
    expect(remove).not.toHaveBeenCalled();

    await user.click(within(rowOf('buildx builders', 'multiarch')).getByRole('button', { name: 'Remove' }));
    await user.click(within(document.querySelector('.ui-modal') as HTMLElement).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('multiarch'));
  });
});

describe('BuildersScreen — the page-level actions live in the toolbar (REQ-41)', () => {
  // REQ-41 — "Page-level actions exist where the screen has them, in the toolbar under the header
  // rather than in a card header, and every operation available on the delivered build still
  // performs the same operation"
  it('draws the create action in the builders toolbar and the prune action in the cache one', () => {
    buildersResult.builders = [builder()];
    cacheResult.records = [record()];
    renderScreen();

    const buildersToolbar = card('buildx builders').querySelector('.ui-screen-toolbar') as HTMLElement;
    const cacheToolbar = card('Build cache').querySelector('.ui-screen-toolbar') as HTMLElement;
    expect(buildersToolbar, 'the builders card draws no screen toolbar').not.toBeNull();
    expect(cacheToolbar, 'the build-cache card draws no screen toolbar').not.toBeNull();

    expect(within(buildersToolbar).getByRole('button', { name: 'Create builder' })).toBeInTheDocument();
    expect(within(cacheToolbar).getByRole('button', { name: 'Prune' })).toBeInTheDocument();

    // …and neither action is left in the card's own header.
    for (const [title, label] of [
      ['buildx builders', 'Create builder'],
      ['Build cache', 'Prune'],
    ] as const) {
      const header = card(title).querySelector('.ui-section-header') as HTMLElement;
      expect(within(header).queryByRole('button', { name: label }), `${label} is still a control of the card header`).toBeNull();
    }
  });

  // builders-screen.md — "Prune … Disabled while there is no record to prune"
  it('offers no prune while the cache holds no record', () => {
    cacheResult.records = [];
    renderScreen();

    expect(within(card('Build cache')).getByRole('button', { name: 'Prune' })).toBeDisabled();
  });

  // builders-screen.md — "'Prune' (build-cache toolbar) → confirms, then prunes every reclaimable
  // record and reports the space reclaimed via a toast"
  it('confirms the prune and reports the space reclaimed', async () => {
    const user = userEvent.setup();
    cacheResult.records = [record()];
    renderScreen();

    await user.click(within(card('Build cache')).getByRole('button', { name: 'Prune' }));
    expect(prune).not.toHaveBeenCalled();
    await user.click(within(document.querySelector('.ui-modal') as HTMLElement).getByRole('button', { name: 'Prune' }));

    await waitFor(() => expect(prune).toHaveBeenCalled());
    // 2 MiB reclaimed, as the toast states it.
    expect(await screen.findByText(/2\.0MB reclaimed/)).toBeInTheDocument();
  });

  // builders-screen.md — "'Create builder' (builders toolbar) → opens a form (name, driver,
  // endpoint, platforms) and creates the builder on submit"
  it('opens the create form from the toolbar and asks for the four values it creates from', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Create builder' }));

    const dialog = document.querySelector('.ui-modal') as HTMLElement;
    expect(dialog, 'the toolbar action opened no form').not.toBeNull();
    for (const field of ['Builder name', 'Driver', 'Endpoint', 'Platforms']) {
      expect(within(dialog).getByLabelText(field), `the create form asks for no ${field}`).toBeInTheDocument();
    }

    await user.type(within(dialog).getByLabelText('Builder name'), 'multiarch');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'multiarch' })));
  });
});

describe('BuildersScreen — the build-cache list (REQ-39)', () => {
  const records = [
    record({ id: 'sha256:aaaa000000000000000011112222', type: 'regular', sizeBytes: 15_728_640, usageState: 'shared', description: 'RUN npm ci' }),
    record({ id: 'sha256:bbbb000000000000000011112222', type: 'source.local', sizeBytes: 1_048_576, usageState: 'in-use' }),
    record({ id: 'sha256:cccc000000000000000011112222', type: 'regular', sizeBytes: 104_857_600, usageState: 'reclaimable', description: 'COPY . .' }),
  ];

  // builders-screen.md — "lists every record as a row of five columns: the record's identifier, its
  // type, the build step it was recorded from, its usage state and its size"
  it('states each value of a record in a column of its own, the build step included', () => {
    cacheResult.records = records;
    renderScreen();

    const row = rowOf('Build cache', 'RUN npm ci');
    expect(textOf(cellOf('Build cache', row, /^TYPE$/i))).toBe('regular');
    expect(textOf(cellOf('Build cache', row, /BUILD STEP/i))).toBe('RUN npm ci');
    expect(textOf(cellOf('Build cache', row, /^USAGE$/i))).toBe('shared');
    expect(textOf(cellOf('Build cache', row, /^SIZE$/i))).toBe('15.0MB');
    // REQ-21 — the list cell cuts the identifier; the panel states it in full.
    expect(textOf(cellOf('Build cache', row, /^RECORD$/i)).length).toBeLessThan('sha256:aaaa000000000000000011112222'.length);
  });

  // builders-screen.md — "A record with no recorded step reads `–` in that column and the row does
  // not change height for it"
  it('reads a dash in the build-step column of a record that has none, in the same number of lines', () => {
    cacheResult.records = records;
    renderScreen();

    const withStep = rowOf('Build cache', 'RUN npm ci');
    const without = rowOf('Build cache', 'source.local');
    expect(textOf(cellOf('Build cache', without, /BUILD STEP/i))).toBe('–');
    for (const header of headersIn('Build cache')) {
      const pattern = new RegExp(`^${header}$`, 'i');
      expect(
        linesOf(cellOf('Build cache', without, pattern)).length,
        `the ${header} cell draws a different number of lines on a record with no recorded step`,
      ).toBe(linesOf(cellOf('Build cache', withStep, pattern)).length);
    }
  });

  // builders-screen.md — "in identifier order as the service delivers it, deliberately not ranked
  // by size"; batch 8 — "deliberately not ranked by size, which is a decision of the service"
  it('lists the records in the order the service delivered them, not by size', () => {
    cacheResult.records = records;
    renderScreen();

    const listed = rowsIn('Build cache').map((row) => textOf(cellOf('Build cache', row, /^RECORD$/i)));
    const delivered = records.map((entry) => entry.id);
    listed.forEach((shown, index) => {
      expect(delivered[index].startsWith(shown.replace(/…$/, '')), `row ${index} states ${shown} where the service delivered ${delivered[index]}`).toBe(
        true,
      );
    });
  });

  // builders-screen.md — "Selecting a row reveals that record in the library's detail panel …
  // its identifier **in full**"; and REQ-69's reverse lookup, "or, in their place, the full
  // sentence stating why none can be named", which the migration may not turn into an empty space
  it('reveals the selected record in the detail panel, with its identifier in full and its related layers', async () => {
    const user = userEvent.setup();
    cacheResult.records = records;
    usageResult = {
      usage: {
        record: records[0],
        references: [{ imageId: 'sha256:image', imageShortId: 'image1234', tags: ['app:1'], layerIndex: 2, instruction: 'RUN npm ci' }],
      } satisfies BuildCacheUsage,
      loaded: true,
      refresh: refreshUsage,
    };
    renderScreen();

    // The row is selected on its own first cell: its centre can land on another cell's content.
    await user.click(rowOf('Build cache', 'RUN npm ci').querySelector('.ui-data-table__cell') as HTMLElement);

    const panel = await waitFor(() => {
      const found = document.querySelector('.ui-detail-panel');
      expect(found, 'selecting a record opened no detail panel').not.toBeNull();
      return found as HTMLElement;
    });
    expect(usageAskedFor.at(-1), 'the panel asked for another record’s relations').toBe(records[0].id);
    expect(textOf(panel)).toContain(records[0].id);
    expect(within(panel).getByText(/Related images & layers/)).toBeInTheDocument();
    expect(textOf(panel)).toContain('app:1');
    expect(textOf(panel)).toContain('layer 03 · RUN npm ci');

    // Following the reference leaves for the layer inside the Images & layers screen (REQ-69).
    await user.click(within(panel).getByRole('button', { name: /app:1/ }));
    expect(navigateTo).toHaveBeenCalledWith({ screenId: 'images-layers', objectId: 'sha256:image', position: 2 });
  });

  // builders-screen.md — "or, in their place, the full sentence stating why none can be named …
  // (REQ-69)". A migration that turns a stated reason into an empty space has lost the point of it.
  it('states the reason no related image can be named, rather than showing an empty space', async () => {
    const user = userEvent.setup();
    cacheResult.records = records;
    usageResult = {
      usage: {
        record: records[1],
        references: [],
        unavailableReason: 'NoRecordedDescription',
        unavailableDetail: 'This record carries no recorded build step, so no layer can be matched to it.',
      } satisfies BuildCacheUsage,
      loaded: true,
      refresh: refreshUsage,
    };
    renderScreen();

    await user.click(rowOf('Build cache', 'source.local').querySelector('.ui-data-table__cell') as HTMLElement);

    const panel = await waitFor(() => {
      const found = document.querySelector('.ui-detail-panel');
      expect(found, 'selecting a record opened no detail panel').not.toBeNull();
      return found as HTMLElement;
    });
    expect(textOf(panel)).toContain('This record carries no recorded build step, so no layer can be matched to it.');
  });
});
