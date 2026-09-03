import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ContextSummary } from '../../src/data/contexts-client';
import type { UseContextsResult } from '../../src/data/use-contexts';
import { ReportingServices } from '../support/reporting-services';

/**
 * F9 — the contexts screen
 * (`plan-ui-coherence-optimisation/REQ-42`, `REQ-43`, `REQ-45`, and REQ-21's
 * contexts half; `contexts/specs/contexts-screen.md`).
 *
 * The inventory hook is mocked, so what is under test is the screen's own
 * contract: which column each value is stated in, what is a control and what is
 * a reading, that the switch performs and announces exactly what it did before,
 * and that the eight daemon properties are no longer stated here at all.
 *
 * What a jsdom render can say about a row is **structural**. The boxes — equal
 * row heights, the endpoint clear of the active marker, the panel's width, the
 * pan at the phone breakpoint, and the appearance that tells the switch from the
 * marker without hovering — are measured in a browser:
 * `e2e/contexts-row-geometry.spec.ts`. Neither replaces the other.
 */

const create = vi.fn();
const remove = vi.fn();
const use = vi.fn();
const refresh = vi.fn();

let contextsResult: UseContextsResult;

vi.mock('../../src/data/use-contexts', () => ({
  useContexts: () => contextsResult,
}));

const { ContextsScreen } = await import('../../src/contexts/ContextsScreen');
const { ConfirmationProvider } = await import('../../src/shell/services/ConfirmationService');
const { ProgressProvider } = await import('../../src/shell/services/ProgressService');

/** The eight properties REQ-45 moves off this screen, by the labels the delivered block used. */
const DAEMON_PROPERTIES = [
  'Docker version',
  'Engine API',
  'BuildKit',
  'Storage driver',
  'Cgroup driver',
  'OS / Arch',
  'Root directory',
  'Containers (running)',
];

function context(overrides: Partial<ContextSummary> = {}): ContextSummary {
  return {
    name: 'remote-prod',
    endpoint: 'ssh://operator@build-host',
    kind: 'ssh',
    tls: false,
    active: false,
    ...overrides,
  };
}

function renderScreen() {
  render(
    <ReportingServices>
      <ProgressProvider>
        <ConfirmationProvider>
          <ContextsScreen />
        </ConfirmationProvider>
      </ProgressProvider>
    </ReportingServices>,
  );
}

/**
 * The region the list is read in, named by the section header titling it.
 *
 * Named by **what it holds** rather than by the surface it used to be: the
 * section header and the toolbar sit **above** the one unpadded card holding the
 * list (`contexts-screen.md`, and
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`),
 * so the heading's own `.ui-surface` ancestor is no longer the panel and on this
 * screen is nothing at all. The panel is therefore the innermost region carrying
 * both the heading and the list — the same region on a screen still drawn the
 * old way, its card.
 */
function panel(): HTMLElement {
  const heading = screen.getByRole('heading', { name: 'Docker contexts' });
  let region: HTMLElement | null = heading.parentElement;
  while (region !== null && region.querySelector('.ui-data-table') === null) region = region.parentElement;
  expect(region, 'the “Docker contexts” heading is drawn nowhere near a list').not.toBeNull();
  return region!;
}

function list(): HTMLElement {
  return panel().querySelector('.ui-data-table') as HTMLElement;
}

function rows(): HTMLElement[] {
  return Array.from(list().querySelectorAll<HTMLElement>('.ui-data-table__row'));
}

function headers(): string[] {
  return Array.from(list().querySelectorAll('.ui-data-table__header-cell')).map((cell) => (cell.textContent ?? '').trim());
}

function rowOf(name: string): HTMLElement {
  const found = rows().find((row) => (row.textContent ?? '').includes(name));
  expect(found, `no row of the list states ${name}`).toBeDefined();
  return found!;
}

/**
 * The cell of a row belonging to the column whose header matches `header`.
 *
 * Read through the header rather than by position, which is what `data-table.md`
 * guarantees: a value asserted this way is asserted to be **in its own column**,
 * which is REQ-42's structural claim.
 */
function cellOf(row: HTMLElement, header: RegExp): HTMLElement {
  const index = headers().findIndex((label) => header.test(label));
  expect(index, `no column is headed ${header} — headers are ${JSON.stringify(headers())}`).toBeGreaterThanOrEqual(0);
  return row.querySelectorAll<HTMLElement>('.ui-data-table__cell')[index];
}

function textOf(element: HTMLElement): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The lines a cell draws, in order: a cell of this list is the same number of lines whatever the state. */
function linesOf(cell: HTMLElement): string[] {
  return Array.from(
    cell.querySelectorAll<HTMLElement>(
      '.ui-table-two-line-cell__title, .ui-table-two-line-cell__subtitle, .ui-table-meta-cell, .ui-table-badge-list-cell, .ui-status-pill',
    ),
  ).map(textOf);
}

beforeEach(() => {
  create.mockReset();
  remove.mockReset();
  use.mockReset();
  refresh.mockReset();
  create.mockResolvedValue(context());
  remove.mockResolvedValue(undefined);
  use.mockImplementation((name: string) => Promise.resolve(context({ name, active: true })));
  contextsResult = { contexts: [], loaded: true, refresh, create, remove, use };
});

afterEach(cleanup);

describe('ContextsScreen — the list (REQ-42)', () => {
  // REQ-42 — "Contexts are listed with the object-list primitive, and the cards-with-inline-trailing-
  // buttons paradigm … is deleted"; contexts-screen.md — "**The list is the containers list** …
  // the **same row**, of the reference's own fixed height and vertical alignment, stating no row
  // modifier of its own", the classic-table plan's REQ-17 and REQ-39.
  //
  // **Contract and state only** (`.../classic-table/REQ-31`): every box is zero in jsdom, so a
  // geometric assertion would pass on any build, the rejected one included. The boxes are measured
  // in a browser (`e2e/classic-table-criteria-plain-lists.spec.ts`).
  it('lists the contexts on the object list, asking for no presentation, and draws no card list', () => {
    contextsResult.contexts = [context({ name: 'desktop-linux', kind: 'local', active: true }), context()];
    renderScreen();

    // The `--comfortable` class assertion stood here until 2026-08-16 and went **with the class**
    // (`.../classic-table/REQ-22`, `REQ-28`): nothing emits it, so it could no longer fail. Its
    // claim — this list asks for no presentation — is the row-modifier assertion below, which a row
    // can still break, plus the guard that refuses the vocabulary outright
    // (`card-row-presentation-retired.test.ts`, `scripts/check-ui-conformance.mjs`).
    expect(list(), 'the screen draws no object list').not.toBeNull();
    for (const row of rows()) {
      expect(
        Array.from(row.classList).filter((name) => name !== 'ui-data-table__row' && name !== 'ui-data-table__row--selected'),
        'a row states a modifier of its own where the reference row states none',
      ).toEqual([]);
    }
    expect(document.querySelectorAll('.ui-card-list'), 'the screen still draws a hand-built card list').toHaveLength(0);
    expect(rows()).toHaveLength(2);
  });

  // contexts-screen.md — "the object list (`DataTable`) of every context alone in an **unpadded card
  // it fills edge to edge** … The header is not on a surface: the screen's only surface is the
  // list's own card" (REQ-40). State, not geometry: which surfaces exist and what each holds.
  it('draws the list in one unpadded card holding it alone, with the section header outside it', () => {
    contextsResult.contexts = [context({ name: 'desktop-linux', kind: 'local', active: true }), context()];
    renderScreen();

    const table = list();
    const card = table.closest('.ui-surface');
    expect(card, 'the list sits in no card at all').not.toBeNull();
    expect(card!.classList.contains('ui-surface--pad-none'), 'the list’s card is padded').toBe(true);
    expect(card!.children).toHaveLength(1);
    expect(card!.firstElementChild, 'the card holds something besides the list').toBe(table);
    expect(card!.querySelector('.ui-section-header'), 'the section header is inside the list’s card').toBeNull();
    expect(card!.querySelector('.ui-screen-toolbar'), 'the screen toolbar is inside the list’s card').toBeNull();
    expect(card!.parentElement?.closest('.ui-surface') ?? null, 'the list’s card sits inside another surface').toBeNull();
    expect(table.querySelectorAll('.ui-surface'), 'a row is drawn on a surface of its own').toHaveLength(0);
  });

  // contexts-screen.md — "One row per context, whatever its endpoint kind, in aligned columns: a
  // marker on the context in use, the context's name over its kind, its endpoint, whether it carries
  // TLS material, its description, and the state Docker reports for it"
  it('states each value of a context in a column of its own, TLS included', () => {
    contextsResult.contexts = [
      context({
        name: 'remote-prod',
        kind: 'tcp',
        endpoint: 'tcp://198.51.100.7:2376',
        tls: true,
        description: 'the production host',
      }),
    ];
    renderScreen();

    const row = rowOf('remote-prod');
    expect(row.querySelectorAll('.ui-data-table__cell')).toHaveLength(headers().length);
    expect(linesOf(cellOf(row, /^CONTEXT$/i))).toEqual(['remote-prod', 'tcp']);
    expect(textOf(cellOf(row, /^ENDPOINT$/i))).toBe('tcp://198.51.100.7:2376');
    expect(textOf(cellOf(row, /^TLS$/i))).toBe('tls');
    expect(textOf(cellOf(row, /^DESCRIPTION$/i))).toBe('the production host');

    // contexts-screen.md — TLS is a column and not a suffix on the value the row truncates first.
    expect(textOf(cellOf(row, /^ENDPOINT$/i)), 'the TLS marker still rides on the endpoint').not.toContain('(tls)');
    // …and the kind is stated under the name rather than beside it in the title.
    expect(textOf(cellOf(row, /^CONTEXT$/i)), 'the row still titles the context `name (kind)`').not.toContain('(tcp)');
  });

  // contexts-screen.md — "Every cell of a row is the same number of lines whatever the context's
  // state. The description and Docker's error are the two values whose presence depends on it, and
  // each is a column, where an absence costs the row no height."
  it('draws the same number of lines in a column whatever the context’s state', () => {
    contextsResult.contexts = [
      context({ name: 'complete', description: 'described, readable and in use', active: true, tls: true }),
      context({ name: 'bare', description: undefined }),
      context({ name: 'unreadable', description: undefined, error: 'Cannot connect to the Docker daemon' }),
    ];
    renderScreen();

    // The premise: the probe really does see the lines of a cell, so an equal count below is a
    // statement about the rows and not about a selector that matches nothing.
    expect(linesOf(cellOf(rowOf('complete'), /^CONTEXT$/i)), 'the line probe finds nothing in a two-line cell').toHaveLength(2);
    expect(linesOf(cellOf(rowOf('complete'), /^STATE$/i)).length, 'the line probe finds nothing in the state cell').toBeGreaterThan(0);

    for (const header of headers().filter((label) => label !== '' && !/^ACTIONS$/i.test(label))) {
      const pattern = new RegExp(`^${header}$`, 'i');
      const complete = linesOf(cellOf(rowOf('complete'), pattern));
      for (const name of ['bare', 'unreadable']) {
        expect(
          linesOf(cellOf(rowOf(name), pattern)).length,
          `the ${header} cell draws ${complete.length} line(s) on the complete row and another number on ${name}`,
        ).toBe(complete.length);
      }
    }
  });

  // contexts-screen.md — "An 'unreadable' marker in the state column for a context Docker itself
  // reports an error for, and nothing there for one it reads; the row stays listed either way, and
  // Docker's own message is in the row's detail."
  it('marks a context Docker cannot read in the state column, and still lists it', () => {
    contextsResult.contexts = [context({ name: 'broken', error: 'Cannot connect to the Docker daemon' }), context({ name: 'fine' })];
    renderScreen();

    expect(textOf(cellOf(rowOf('broken'), /^STATE$/i))).toContain('unreadable');
    expect(textOf(cellOf(rowOf('fine'), /^STATE$/i)), 'a context Docker reads is marked as unreadable').not.toContain('unreadable');
    // The message itself is not in the row: it belongs to the detail.
    expect(textOf(rowOf('broken')), 'Docker’s own message is printed in the row').not.toContain('Cannot connect');
  });

  // contexts-screen.md — "'Create context' action in the screen toolbar under the section header"
  it('offers Create context in the screen toolbar rather than in the section header', async () => {
    const user = userEvent.setup();
    renderScreen();

    const toolbar = panel().querySelector('.ui-screen-toolbar') as HTMLElement;
    expect(toolbar, 'the screen draws no screen toolbar').not.toBeNull();
    expect(within(toolbar).getByRole('button', { name: 'Create context' })).toBeInTheDocument();
    const header = panel().querySelector('.ui-section-header') as HTMLElement;
    expect(within(header).queryByRole('button', { name: 'Create context' }), 'Create context is still a control of the section header').toBeNull();

    await user.click(within(toolbar).getByRole('button', { name: 'Create context' }));
    expect(document.querySelector('.ui-modal'), 'the toolbar action opened no form').not.toBeNull();
  });
});

describe('ContextsScreen — the switch is a control, the marker is not (REQ-43)', () => {
  // REQ-43 — "`use` is a control that looks like one. The bare text that switches context becomes an
  // action of the cluster"; contexts-screen.md — "'Use' is an action of the row's cluster, weighing
  // `primary`", the active marker being "a marker in a column of its own"
  it('draws the switch as a primary action of the cluster and the active marker as no control at all', () => {
    contextsResult.contexts = [context({ name: 'idle' }), context({ name: 'current', active: true })];
    renderScreen();

    const cluster = rowOf('idle').querySelector('.ui-action-button-group') as HTMLElement;
    expect(cluster, 'the row draws no action cluster').not.toBeNull();
    const switchControl = within(cluster).getByRole('button', { name: 'Use' });
    // A weight is all a call site declares; the cluster renders `primary` as the library's primary
    // button, which is the appearance that tells it from a statement (action-button-group.md).
    expect(switchControl.className, 'the switch is not drawn with the primary weight').toContain('ui-button--primary');
    expect(within(cluster).getByRole('button', { name: 'Remove' }).className, 'removal is not drawn as destructive').toContain(
      'ui-button--destructive',
    );

    // Every control of the row is in that cluster, and the marker is not one of them.
    expect(
      rowOf('idle').querySelectorAll('button, [role="button"], a').length,
      'a control of the row sits outside its action cluster',
    ).toBe(cluster.querySelectorAll('button, [role="button"], a').length);

    const markerCell = Array.from(rowOf('current').querySelectorAll<HTMLElement>('.ui-data-table__cell')).find(
      (cell) => textOf(cell) === 'active',
    );
    expect(markerCell, 'the active marker is not a cell of its own').toBeDefined();
    expect(markerCell!.querySelectorAll('button, [role="button"], a'), 'the active marker is clickable').toHaveLength(0);
    expect(markerCell!.querySelector('.ui-button'), 'the active marker is drawn as a button').toBeNull();
  });

  // contexts-screen.md — a row's "Use" is "offered on every row but the one already in use"
  it('offers the switch on every row but the one already in use, which carries the marker instead', () => {
    contextsResult.contexts = [context({ name: 'idle' }), context({ name: 'current', active: true })];
    renderScreen();

    const idle = within(rowOf('idle'));
    const active = within(rowOf('current'));
    expect(idle.getByRole('button', { name: 'Use' })).toBeInTheDocument();
    expect(active.queryByRole('button', { name: 'Use' }), 'the active context is offered a switch to itself').toBeNull();
    expect(active.getByText('active', { exact: true })).toBeInTheDocument();
    expect(idle.queryByText('active', { exact: true }), 'a context that is not active carries the marker').toBeNull();

    // Removal is offered on every row, active or not.
    expect(idle.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(active.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  // REQ-43 — the switch "performs exactly the same switch"; contexts-screen.md — "A toast confirms
  // the switch", and nothing about when the broadcast fires or what it carries is this screen's to
  // change (the announcement itself is the hook's: use-contexts.md)
  it('switches to the context whose row it belongs to, and confirms it with a toast', async () => {
    const user = userEvent.setup();
    contextsResult.contexts = [context({ name: 'idle' }), context({ name: 'current', active: true })];
    renderScreen();

    await user.click(within(rowOf('idle')).getByRole('button', { name: 'Use' }));

    await waitFor(() => expect(use).toHaveBeenCalledWith('idle'));
    expect(use, 'the switch was performed more than once by one click').toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Active context switched')).toBeInTheDocument();
  });

  // action-button-group.md — the cluster "stops click propagation so an action never also triggers
  // the containing row's onRowSelect"
  it('does not also open the row’s detail when the switch is taken', async () => {
    const user = userEvent.setup();
    contextsResult.contexts = [context({ name: 'idle' })];
    renderScreen();

    await user.click(within(rowOf('idle')).getByRole('button', { name: 'Use' }));

    await waitFor(() => expect(use).toHaveBeenCalled());
    expect(document.querySelector('.ui-detail-panel'), 'the switch also opened the row’s detail').toBeNull();
  });

  // contexts-screen.md — a row's "Remove" "asks for confirmation, naming the context and stating
  // that only the local entry goes, not the daemon it points at"
  it('confirms before removing a context, and removes nothing when the confirmation is refused', async () => {
    const user = userEvent.setup();
    contextsResult.contexts = [context({ name: 'remote-prod' })];
    renderScreen();

    await user.click(within(rowOf('remote-prod')).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('heading', { name: /remote-prod/ })).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    await user.click(within(document.querySelector('.ui-modal') as HTMLElement).getByRole('button', { name: 'Cancel' }));
    expect(remove).not.toHaveBeenCalled();

    await user.click(within(rowOf('remote-prod')).getByRole('button', { name: 'Remove' }));
    const dialog = document.querySelector('.ui-modal') as HTMLElement;
    expect(textOf(dialog)).toMatch(/daemon it points at is left untouched|local Docker configuration/i);
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('remote-prod'));
  });
});

describe('ContextsScreen — the row’s detail (REQ-21)', () => {
  // contexts-screen.md — "A selected row's detail: name, kind, the endpoint in full, TLS,
  // description, whether it is in use, and Docker's message where there is one"; REQ-21 — the value
  // the row truncates is obtainable in full on the object's own detail surface
  it('reveals the selected context in a detail panel, with the endpoint in full', async () => {
    const user = userEvent.setup();
    const endpoint = `ssh://operator@build-host-${'x'.repeat(40)}.example.invalid`;
    contextsResult.contexts = [context({ name: 'remote-prod', endpoint, description: 'the production host' })];
    renderScreen();

    // The row is selected on its own first cell: its centre can land on another cell's content.
    await user.click(rowOf('remote-prod').querySelector('.ui-data-table__cell') as HTMLElement);

    const panel = await waitFor(() => {
      const found = document.querySelector('.ui-detail-panel');
      expect(found, 'selecting a context opened no detail panel').not.toBeNull();
      return found as HTMLElement;
    });
    const bands = Array.from(panel.querySelectorAll('.ui-definition-list__label')).map((label) => (label.textContent ?? '').trim());
    for (const label of ['Name', 'Kind', 'Endpoint', 'TLS', 'Description', 'In use']) {
      expect(bands, `the detail panel presents no ${label} band`).toContain(label);
    }

    const endpointBand = Array.from(panel.querySelectorAll('.ui-definition-list__label')).find(
      (label) => (label.textContent ?? '').trim() === 'Endpoint',
    )!.parentElement as HTMLElement;
    expect(textOf(endpointBand), 'the panel states a shortened endpoint').toContain(endpoint);

    // Selecting the same row again closes it (contexts-screen.md).
    await user.click(rowOf('remote-prod').querySelector('.ui-data-table__cell') as HTMLElement);
    await waitFor(() => expect(document.querySelector('.ui-detail-panel')).toBeNull());
  });

  // contexts-screen.md — "Docker's own message is in the row's detail", and only where Docker gave one
  it('states Docker’s own message on the detail of a context it reports an error for, and no band where there is none', async () => {
    const user = userEvent.setup();
    contextsResult.contexts = [
      context({ name: 'broken', error: 'Cannot connect to the Docker daemon at unix:///nowhere.sock' }),
      context({ name: 'fine' }),
    ];
    renderScreen();

    await user.click(rowOf('broken').querySelector('.ui-data-table__cell') as HTMLElement);
    const panel = await waitFor(() => document.querySelector('.ui-detail-panel') as HTMLElement);
    expect(textOf(panel)).toContain('Cannot connect to the Docker daemon at unix:///nowhere.sock');

    await user.click(rowOf('fine').querySelector('.ui-data-table__cell') as HTMLElement);
    await waitFor(() => {
      const bands = Array.from(document.querySelectorAll('.ui-detail-panel .ui-definition-list__label')).map((label) =>
        (label.textContent ?? '').trim(),
      );
      expect(bands, 'a context Docker reads carries a band for a message it never gave').not.toContain('Docker reports');
    });
  });
});

describe('ContextsScreen — the daemon block is gone (REQ-45)', () => {
  // REQ-45 — "The second full eight-property daemon block does not survive on Contexts";
  // contexts-screen.md — "the eight-property daemon block was removed from this screen and is not to
  // be restored", the permitted two-or-three-property summary having been declined
  it('states none of the eight daemon properties, with or without a context selected', async () => {
    const user = userEvent.setup();
    contextsResult.contexts = [context({ name: 'desktop-linux', kind: 'local', active: true }), context({ name: 'remote-prod' })];
    renderScreen();

    const stated = () => DAEMON_PROPERTIES.filter((label) => screen.queryAllByText(label, { exact: true }).length > 0);
    expect(stated(), 'the screen still states daemon properties of the active context').toEqual([]);

    // …and none of them arrives with the row's detail either.
    await user.click(rowOf('remote-prod').querySelector('.ui-data-table__cell') as HTMLElement);
    await waitFor(() => expect(document.querySelector('.ui-detail-panel')).not.toBeNull());
    expect(stated(), 'the row’s detail states daemon properties of the active context').toEqual([]);
  });

  // REQ-45 — the whole block goes, and with it the screen's reason to read the daemon at all: "no
  // import, hook call or type is left orphaned" (batch 9, INT-4)
  it('asks the daemon for nothing: no daemon-info request is made by this screen', () => {
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        asked.push(typeof input === 'string' ? input : input.toString());
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }),
    );
    try {
      contextsResult.contexts = [context({ name: 'desktop-linux', kind: 'local', active: true })];
      renderScreen();

      expect(asked.filter((url) => url.includes('daemon-info')), 'the screen still reads the daemon of the active context').toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
