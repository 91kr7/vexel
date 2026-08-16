import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VolumesPanel } from '../../src/volumes-networks/VolumesPanel';
import type { VolumeSummary } from '../../src/data/volumes-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ToastProvider } from '../../src/ui';

function makeVolume(overrides: Partial<VolumeSummary> = {}): VolumeSummary {
  return {
    name: 'pgdata',
    driver: 'local',
    mountpoint: '/var/lib/docker/volumes/pgdata/_data',
    scope: 'local',
    createdAt: '2026-01-01T00:00:00Z',
    labels: {},
    options: {},
    sizeBytes: 512,
    mountedBy: [],
    ...overrides,
  };
}

function inspectPayload(volume: VolumeSummary) {
  return { ...volume, raw: { Name: volume.name, Driver: volume.driver } };
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

function renderPanel(volumes: VolumeSummary[], onRefresh = vi.fn()) {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <VolumesPanel volumes={volumes} loaded onRefresh={onRefresh} />
            <ReportedErrors />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
  return { onRefresh };
}

// The list is the object list — the same table containers and images ship — so a
// row is a `.ui-data-table__row` and the panel it reveals is the library's detail
// panel inside the row's expansion (volumes-panel.md).
function listRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-data-table__row'));
}

function columnHeaders(): string[] {
  return Array.from(document.querySelectorAll('.ui-data-table__header-cell')).map((cell) => cell.textContent ?? '');
}

function detailPanels(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-data-table__expanded .ui-detail-panel'));
}

function propertyValue(panel: HTMLElement, label: string): string | undefined {
  const row = Array.from(panel.querySelectorAll<HTMLElement>('.ui-definition-list__row')).find(
    (candidate) => candidate.querySelector('.ui-definition-list__label')?.textContent === label,
  );
  return row?.querySelector('.ui-definition-list__value')?.textContent ?? undefined;
}

function toolbar(): HTMLElement {
  return document.querySelector<HTMLElement>('.ui-screen-toolbar')!;
}

function buttonNames(): string[] {
  return screen.getAllByRole('button').map((button) => (button.getAttribute('aria-label') ?? button.textContent ?? '').trim());
}

// A name that is a prefix of another's is the same name to anything that finds a control by name
// (empty-state.md), which is what `getByRole(..., { name })` does in Playwright.
function namesShadowingEachOther(names: string[]): string[] {
  return names.flatMap((name, index) =>
    names.filter((other, otherIndex) => otherIndex !== index && other.includes(name)).map((other) => `"${name}" is found by "${other}"`),
  );
}

// The inline inspect surface's useVolumeInspect subscribes to daemon events
// through a module-level EventSource, which jsdom does not provide.
class FakeEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  url: string;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener() {
    // no event delivery is needed for these tests
  }

  close() {
    this.closed = true;
  }
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockImplementation((url: string) =>
    Promise.resolve(
      String(url).includes('/inspect')
        ? { ok: true, status: 200, json: () => Promise.resolve(inspectPayload(makeVolume())) }
        : { ok: true, status: 204, json: () => Promise.resolve({}) },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// volumes-panel.md — one row per volume, in columns: NAME (the name over the mountpoint), DRIVER,
// MOUNTED BY (badges, "nothing" when unattached), SIZE (or "–"), and the row's action cluster
describe('VolumesPanel — list rows (plan-docker_management_app/REQ-70, plan-ui-coherence-optimisation/REQ-31)', () => {
  it('lists every volume on the object list, with the columns the panel declares in order', () => {
    renderPanel([makeVolume()]);

    // volumes-panel.md — "the list is the containers list … the **same row**, of the reference's own
    // fixed height and vertical alignment, stating no row modifier of its own. There is no
    // per-screen choice of presentation to be made here."
    //
    // **Contract and state only** (`.../classic-table/REQ-31`): every box is zero in jsdom, so a
    // geometric assertion would pass on any build, defect included. What is asserted here is what
    // the call site states — no presentation, no row modifier — and the boxes are measured in a
    // browser (`e2e/classic-table-criteria.spec.ts`).
    //
    // The `--comfortable` class assertion stood here until 2026-08-16 and went **with the class**
    // (`.../classic-table/REQ-22`, `REQ-28`): nothing emits it, so it could no longer fail. Its
    // claim — this list asks for no presentation — is the row-modifier assertion below, which a row
    // can still break, plus the guard that refuses the vocabulary outright
    // (`card-row-presentation-retired.test.ts`, `scripts/check-ui-conformance.mjs`).
    expect(document.querySelector('.ui-data-table')).not.toBeNull();
    for (const row of listRows()) {
      expect(Array.from(row.classList).filter((name) => name !== 'ui-data-table__row' && name !== 'ui-data-table__row--selected')).toEqual([]);
    }
    expect(columnHeaders()).toEqual(['NAME', 'DRIVER', 'MOUNTED BY', 'SIZE', 'ACTIONS']);
  });

  // volumes-panel.md — "its list alone in an **unpadded card it fills edge to edge** … The header
  // carries no actions of its own, and it is not on a surface: the panel's only surface is the
  // list's own card." State, not geometry: which surfaces exist and what they hold.
  it('draws the list in one unpadded card holding it alone, with the section header outside it', () => {
    renderPanel([makeVolume()]);

    const table = document.querySelector('.ui-data-table')!;
    const card = table.closest('.ui-surface');
    expect(card, 'the list sits in no card at all').not.toBeNull();
    expect(card!.classList.contains('ui-surface--pad-none'), 'the list’s card is padded').toBe(true);
    expect(card!.children).toHaveLength(1);
    expect(card!.firstElementChild, 'the card holds something besides the list').toBe(table);
    expect(card!.querySelector('.ui-section-header'), 'the section header is inside the list’s card').toBeNull();
    // One surface, not two: a card inside a card is two, and is not the answer.
    expect(card!.parentElement?.closest('.ui-surface') ?? null, 'the list’s card sits inside another surface').toBeNull();
    expect(table.querySelectorAll('.ui-surface'), 'a row is drawn on a surface of its own').toHaveLength(0);
  });

  it('shows the volume name, mountpoint, driver, unattached state and size', () => {
    renderPanel([makeVolume({ name: 'pgdata', mountpoint: '/data/pgdata', driver: 'local', mountedBy: [], sizeBytes: 512 })]);

    const row = listRows()[0]!;
    expect(within(row).getByText('pgdata')).toBeInTheDocument();
    expect(row.textContent).toContain('/data/pgdata');
    expect(row.textContent).toContain('local');
    expect(row.textContent).toContain('nothing');
    expect(row.textContent).toContain('512B');
  });

  it('lists the mounting container names instead of "nothing" when the volume is attached', () => {
    renderPanel([makeVolume({ mountedBy: ['app-1', 'app-2'] })]);

    const row = listRows()[0]!;
    expect(row.textContent).toContain('app-1');
    expect(row.textContent).toContain('app-2');
    expect(row.textContent).not.toContain('nothing');
  });

  it('shows a dash for the size while the daemon has not computed it yet', () => {
    renderPanel([makeVolume({ sizeBytes: undefined })]);

    expect(listRows()[0]!.textContent).toContain('–');
  });

  // volumes-panel.md — once loaded, the empty state states a title, a line of explanation and the
  // action that resolves it
  it('shows an empty state explaining the absence and offering the action that resolves it', () => {
    renderPanel([]);

    expect(listRows()).toHaveLength(0);
    const emptyState = document.querySelector<HTMLElement>('.ui-empty-state')!;
    expect(within(emptyState).getByText('No volumes')).toBeInTheDocument();
    expect(emptyState.querySelector('.ui-empty-state__description')?.textContent ?? '').not.toBe('');
    expect(within(emptyState).getByRole('button', { name: 'Create the first volume' })).toBeInTheDocument();
  });

  // volumes-panel.md — while the list is empty the toolbar's action and the empty state's are drawn
  // at once, as two controls neither of whose names contains the other
  // (plan-ui-coherence-optimisation/REQ-41, plan-docker_management_app/REQ-25)
  it('draws both create controls on an empty list, under names that do not shadow each other', () => {
    renderPanel([]);

    const emptyState = document.querySelector<HTMLElement>('.ui-empty-state')!;
    expect(within(toolbar()).getByRole('button', { name: 'Create volume…' })).toBeInTheDocument();
    expect(within(emptyState).getByRole('button', { name: 'Create the first volume' })).toBeInTheDocument();
    expect(namesShadowingEachOther(buttonNames())).toEqual([]);
  });
});

// volumes-panel.md — the page-level actions sit in the toolbar under the section header rather than
// in the header itself, and the row's own actions sit in the row's cluster
// (plan-ui-coherence-optimisation/REQ-35)
describe('VolumesPanel — where the actions live (plan-ui-coherence-optimisation/REQ-35)', () => {
  it('carries create and prune in the toolbar under the section header', () => {
    renderPanel([makeVolume()]);

    expect(within(toolbar()).getByRole('button', { name: 'Create volume…' })).toBeInTheDocument();
    expect(within(toolbar()).getByRole('button', { name: 'Prune' })).toBeInTheDocument();
  });

  it('leaves the section header carrying no action of its own', () => {
    renderPanel([makeVolume()]);

    const header = document.querySelector<HTMLElement>('.ui-section-header')!;
    expect(header.querySelectorAll('button')).toHaveLength(0);
  });

  it('puts the row-level remove in the row itself, reachable without opening the detail', () => {
    renderPanel([makeVolume({ name: 'pgdata' })]);

    expect(detailPanels()).toHaveLength(0);
    const row = listRows()[0]!;
    expect(within(row).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });
});

// volumes-panel.md — selecting a row reveals its detail panel directly below the row; selecting the
// same row again, or Escape, closes it; at most one volume's detail is revealed at a time
describe('VolumesPanel — the revealed detail (plan-ui-coherence-optimisation/REQ-32, REQ-33)', () => {
  it('reveals the detail panel with the volume\'s properties in the library\'s grid on selection', async () => {
    const user = userEvent.setup();
    const volume = makeVolume({ name: 'pgdata', mountedBy: ['app-1'] });
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/inspect')
          ? { ok: true, status: 200, json: () => Promise.resolve(inspectPayload(volume)) }
          : { ok: true, status: 204, json: () => Promise.resolve({}) },
      ),
    );
    renderPanel([volume]);

    await user.click(listRows()[0]!);

    await waitFor(() => expect(detailPanels()).toHaveLength(1));
    const panel = detailPanels()[0]!;
    await waitFor(() => expect(propertyValue(panel, 'Driver')).toBe('local'));
    expect(propertyValue(panel, 'Scope')).toBe('local');
    expect(propertyValue(panel, 'Mounted by')).toBe('app-1');
    expect(panel.querySelector('.ui-definition-list')).not.toBeNull();
  });

  // plan-ui-coherence-optimisation/REQ-21 (batch 4, certified) — the row truncates the mountpoint and
  // the detail panel is the route to it in full, as selectable text
  it('states the mountpoint in full in the detail panel, as text and not as a control', async () => {
    const user = userEvent.setup();
    const mountpoint = '/var/lib/docker/volumes/a-considerably-long-volume-name-for-this-check/_data';
    const volume = makeVolume({ name: 'pgdata', mountpoint });
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/inspect')
          ? { ok: true, status: 200, json: () => Promise.resolve(inspectPayload(volume)) }
          : { ok: true, status: 204, json: () => Promise.resolve({}) },
      ),
    );
    renderPanel([volume]);

    await user.click(listRows()[0]!);

    const panel = await waitFor(() => {
      const panels = detailPanels();
      expect(panels).toHaveLength(1);
      return panels[0]!;
    });
    await waitFor(() => expect(propertyValue(panel, 'Mountpoint')).toBe(mountpoint));
    const value = Array.from(panel.querySelectorAll<HTMLElement>('.ui-definition-list__value')).find(
      (node) => node.textContent === mountpoint,
    )!;
    expect(value.querySelectorAll('button')).toHaveLength(0);
  });

  it('closes the detail when the same row is selected again', async () => {
    const user = userEvent.setup();
    renderPanel([makeVolume()]);

    await user.click(listRows()[0]!);
    await waitFor(() => expect(detailPanels()).toHaveLength(1));
    await user.click(listRows()[0]!);

    await waitFor(() => expect(detailPanels()).toHaveLength(0));
  });

  // detail-panel.md — the panel opened by the row's own gesture presents no close control and claims
  // Escape instead
  it('closes the detail on Escape, and presents no close control of its own', async () => {
    const user = userEvent.setup();
    renderPanel([makeVolume()]);

    await user.click(listRows()[0]!);
    await waitFor(() => expect(detailPanels()).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Close detail' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(detailPanels()).toHaveLength(0));
  });

  it('reveals one volume\'s detail at a time', async () => {
    const user = userEvent.setup();
    renderPanel([makeVolume({ name: 'vol-a' }), makeVolume({ name: 'vol-b' })]);

    await user.click(listRows()[0]!);
    await waitFor(() => expect(detailPanels()).toHaveLength(1));
    await user.click(listRows()[1]!);

    await waitFor(() => expect(detailPanels()).toHaveLength(1));
    expect(listRows().filter((row) => row.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });
});

// volumes-panel.md — "Remove" (row cluster, destructive) goes through useConfirmation().confirm()
// first; cancelling performs nothing; on success it closes any detail open on that volume and
// re-reads the list
describe('VolumesPanel — remove (plan-docker_management_app/REQ-71, plan-ui-coherence-optimisation/REQ-35)', () => {
  it('asks for confirmation naming the volume before removing it, and performs nothing on cancel', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeVolume({ name: 'pgdata' })]);

    await user.click(within(listRows()[0]!).getByRole('button', { name: 'Remove' }));

    expect(screen.getByRole('heading', { name: 'Confirm: pgdata' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/volumes/pgdata'), expect.objectContaining({ method: 'DELETE' }));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('removes the volume and re-reads the list once confirmed', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeVolume({ name: 'pgdata' })]);

    await user.click(within(listRows()[0]!).getByRole('button', { name: 'Remove' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/volumes/pgdata', expect.objectContaining({ method: 'DELETE' })),
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('closes the detail open on the volume it removed', async () => {
    const user = userEvent.setup();
    renderPanel([makeVolume({ name: 'pgdata' })]);

    await user.click(listRows()[0]!);
    await waitFor(() => expect(detailPanels()).toHaveLength(1));

    await user.click(within(listRows()[0]!).getByRole('button', { name: 'Remove' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(detailPanels()).toHaveLength(0));
  });
});

// volumes-panel.md — "Create volume…" opens a FormDialog for a name, a driver, driver options and
// labels; submitting creates the volume, closes the dialog and re-reads the list
describe('VolumesPanel — create (plan-docker_management_app/REQ-71)', () => {
  it('opens the create dialog with an optional name and a default driver of local', async () => {
    const user = userEvent.setup();
    renderPanel([]);

    await user.click(within(toolbar()).getByRole('button', { name: 'Create volume…' }));

    expect(screen.getByRole('heading', { name: 'Create volume' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Volume name' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Driver' })).toHaveValue('local');
  });

  // volumes-panel.md — once loaded, the empty state offers the action that resolves it
  it('opens the same dialog from the empty state\'s own action', async () => {
    const user = userEvent.setup();
    renderPanel([]);

    const emptyState = document.querySelector<HTMLElement>('.ui-empty-state')!;
    await user.click(within(emptyState).getByRole('button', { name: 'Create the first volume' }));

    expect(screen.getByRole('heading', { name: 'Create volume' })).toBeInTheDocument();
  });

  // volumes-panel.md — the driver-options rows and the label rows carry distinct accessible names
  it('announces the driver-option rows apart from the label rows', async () => {
    const user = userEvent.setup();
    renderPanel([]);

    await user.click(within(toolbar()).getByRole('button', { name: 'Create volume…' }));
    const dialog = within(document.querySelector<HTMLElement>('.ui-modal')!);
    await user.click(dialog.getByRole('button', { name: 'Add option' }));
    await user.click(dialog.getByRole('button', { name: 'Add label' }));

    for (const name of ['Driver options Key 1', 'Driver options Value 1', 'Labels Key 1', 'Labels Value 1']) {
      expect(dialog.getAllByRole('textbox', { name })).toHaveLength(1);
    }
    for (const name of ['Key 1', 'Value 1']) {
      expect(dialog.queryAllByRole('textbox', { name })).toHaveLength(0);
    }
    expect(dialog.getAllByRole('button', { name: 'Remove pair 1 from Driver options' })).toHaveLength(1);
    expect(dialog.getAllByRole('button', { name: 'Remove pair 1 from Labels' })).toHaveLength(1);
  });

  it('creates a volume with the given name, driver options and labels, then closes the dialog and re-reads the list', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([]);

    await user.click(within(toolbar()).getByRole('button', { name: 'Create volume…' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.type(within(dialog).getByRole('textbox', { name: 'Volume name' }), 'pgdata');

    await user.click(within(dialog).getByRole('button', { name: 'Add option' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Driver options Key 1' }), 'type');
    await user.type(within(dialog).getByRole('textbox', { name: 'Driver options Value 1' }), 'tmpfs');

    await user.click(within(dialog).getByRole('button', { name: 'Add label' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Labels Key 1' }), 'team');
    await user.type(within(dialog).getByRole('textbox', { name: 'Labels Value 1' }), 'vexel');

    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/volumes', expect.objectContaining({ method: 'POST' })));
    const [, init] = fetchMock.mock.calls.find(([url]) => url === '/api/volumes')!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.name).toBe('pgdata');
    expect(body.driver).toBe('local');
    expect(body.driverOpts).toEqual({ type: 'tmpfs' });
    expect(body.labels).toEqual({ team: 'vexel' });

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create volume' })).not.toBeInTheDocument());
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('reports the daemon\'s own failure message when creation is refused', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ error: 'volume name already in use' }) });
    renderPanel([]);

    await user.click(within(toolbar()).getByRole('button', { name: 'Create volume…' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.type(within(dialog).getByRole('textbox', { name: 'Volume name' }), 'pgdata');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText(/volume name already in use/)).toBeInTheDocument();
  });
});

// volumes-panel.md — "Prune" is disabled when there is no volume to prune; confirms first, then reports
// the number of volumes removed and the reclaimed space via useToast() on success and re-reads the list
describe('VolumesPanel — prune (plan-docker_management_app/REQ-71)', () => {
  it('disables Prune when there is no volume', () => {
    renderPanel([]);

    expect(within(toolbar()).getByRole('button', { name: 'Prune' })).toBeDisabled();
  });

  it('enables Prune once at least one volume exists', () => {
    renderPanel([makeVolume()]);

    expect(within(toolbar()).getByRole('button', { name: 'Prune' })).toBeEnabled();
  });

  it('confirms before pruning, reports the outcome via a toast and re-reads the list', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/prune')
          ? { ok: true, status: 200, json: () => Promise.resolve({ removedNames: ['orphan-1', 'orphan-2'], reclaimedBytes: 100 }) }
          : { ok: true, status: 200, json: () => Promise.resolve([]) },
      ),
    );
    const { onRefresh } = renderPanel([makeVolume()]);

    await user.click(within(toolbar()).getByRole('button', { name: 'Prune' }));
    expect(screen.getByRole('heading', { name: 'Confirm: unused volumes' })).toBeInTheDocument();
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.click(within(dialog).getByRole('button', { name: 'Prune' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/volumes/prune', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText('2 volumes removed')).toBeInTheDocument();
    expect(screen.getByText('100B reclaimed')).toBeInTheDocument();
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('performs no request when pruning is cancelled', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeVolume()]);

    await user.click(within(toolbar()).getByRole('button', { name: 'Prune' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalledWith('/api/volumes/prune', expect.anything());
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
