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

function listRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-card-list__item'));
}

// The inline inspect surface's useVolumeInspect subscribes to daemon events
// through a module-level EventSource, which jsdom does not provide.
class FakeEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(public url: string) {}

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

// volumes-panel.md — one row per volume: name, mountpoint and a "driver <driver> · mounted by
// <names>" line as monospace subtitle lines, and the size trailing the row
describe('VolumesPanel — list rows (plan-docker_management_app/REQ-70)', () => {
  it('shows the volume name, mountpoint, driver, unattached state and size', () => {
    renderPanel([makeVolume({ name: 'pgdata', mountpoint: '/data/pgdata', driver: 'local', mountedBy: [], sizeBytes: 512 })]);

    const row = listRows()[0]!;
    expect(within(row).getByText('pgdata')).toBeInTheDocument();
    expect(row.textContent).toContain('/data/pgdata');
    expect(row.textContent).toContain('driver local · mounted by nothing');
    expect(row.textContent).toContain('512B');
  });

  it('lists the mounting container names instead of "nothing" when the volume is attached', () => {
    renderPanel([makeVolume({ mountedBy: ['app-1', 'app-2'] })]);

    expect(listRows()[0]!.textContent).toContain('driver local · mounted by app-1, app-2');
  });

  it('shows a dash for the size while the daemon has not computed it yet', () => {
    renderPanel([makeVolume({ sizeBytes: undefined })]);

    expect(listRows()[0]!.textContent).toContain('–');
  });

  it('shows an empty state when there are no volumes', () => {
    renderPanel([]);

    expect(listRows()).toHaveLength(0);
    expect(screen.getByText('No volumes')).toBeInTheDocument();
  });
});

// volumes-panel.md — selecting a row expands its inline inspect surface; selecting it again collapses it;
// only one volume's inspect surface is expanded at a time
describe('VolumesPanel — inline inspect (plan-docker_management_app/REQ-71)', () => {
  it('expands the inspect surface with driver, mountpoint, scope and mounted-by information on selection', async () => {
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

    const expanded = await screen.findByText('Mountpoint');
    const detail = expanded.closest('.ui-card-list')!;
    expect(within(detail).getByText('Driver')).toBeInTheDocument();
    expect(within(detail).getByText('Scope')).toBeInTheDocument();
    const mountedByValues = Array.from(detail.querySelectorAll('.ui-definition-list__value')).map((node) => node.textContent);
    expect(mountedByValues).toContain('app-1');
    expect(within(detail).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('collapses the inspect surface when the same row is selected again', async () => {
    const user = userEvent.setup();
    renderPanel([makeVolume()]);

    await user.click(listRows()[0]!);
    await screen.findByText('Mountpoint');
    await user.click(listRows()[0]!);

    await waitFor(() => expect(screen.queryByText('Mountpoint')).not.toBeInTheDocument());
  });

  it('expands only one volume at a time', async () => {
    const user = userEvent.setup();
    renderPanel([makeVolume({ name: 'vol-a' }), makeVolume({ name: 'vol-b' })]);

    await user.click(listRows()[0]!);
    await screen.findByText('Mountpoint');
    await user.click(listRows()[1]!);

    await waitFor(() => expect(document.querySelectorAll('.ui-card-list__expanded')).toHaveLength(1));
  });
});

// volumes-panel.md — a selected row's "Remove" action goes through useConfirmation().confirm() first;
// cancelling performs nothing; on success it collapses the row and re-reads the list
describe('VolumesPanel — remove (plan-docker_management_app/REQ-71)', () => {
  it('asks for confirmation naming the volume before removing it, and performs nothing on cancel', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeVolume({ name: 'pgdata' })]);

    await user.click(listRows()[0]!);
    await screen.findByText('Mountpoint');
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.getByRole('heading', { name: 'Confirm: pgdata' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/volumes/pgdata'), expect.objectContaining({ method: 'DELETE' }));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('removes the volume and re-reads the list once confirmed', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeVolume({ name: 'pgdata' })]);

    await user.click(listRows()[0]!);
    await screen.findByText('Mountpoint');
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/volumes/pgdata', expect.objectContaining({ method: 'DELETE' })),
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});

// volumes-panel.md — "Create" opens a FormDialog for a name, a driver, driver options and labels;
// submitting creates the volume, closes the dialog and re-reads the list
describe('VolumesPanel — create (plan-docker_management_app/REQ-71)', () => {
  it('opens the create dialog with an optional name and a default driver of local', async () => {
    const user = userEvent.setup();
    renderPanel([]);

    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByRole('heading', { name: 'Create volume' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Volume name' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Driver' })).toHaveValue('local');
  });

  // Driver options and labels are two independent KeyValueEditor instances, each
  // numbering its own rows from 1: scoped by their own FormField to disambiguate.
  function formField(dialog: HTMLElement, label: string): HTMLElement {
    return Array.from(dialog.querySelectorAll<HTMLElement>('.ui-form-field')).find(
      (field) => field.querySelector('.ui-form-field__label')?.textContent === label,
    )!;
  }

  it('creates a volume with the given name, driver options and labels, then closes the dialog and re-reads the list', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([]);

    await user.click(screen.getByRole('button', { name: 'Create' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.type(within(dialog).getByRole('textbox', { name: 'Volume name' }), 'pgdata');

    const driverOptions = formField(dialog, 'Driver options');
    await user.click(within(driverOptions).getByRole('button', { name: 'Add option' }));
    await user.type(within(driverOptions).getByRole('textbox', { name: 'Key 1' }), 'type');
    await user.type(within(driverOptions).getByRole('textbox', { name: 'Value 1' }), 'tmpfs');

    const labels = formField(dialog, 'Labels');
    await user.click(within(labels).getByRole('button', { name: 'Add label' }));
    await user.type(within(labels).getByRole('textbox', { name: 'Key 1' }), 'team');
    await user.type(within(labels).getByRole('textbox', { name: 'Value 1' }), 'vexel');

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

    await user.click(screen.getByRole('button', { name: 'Create' }));
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

    expect(screen.getByRole('button', { name: 'Prune' })).toBeDisabled();
  });

  it('enables Prune once at least one volume exists', () => {
    renderPanel([makeVolume()]);

    expect(screen.getByRole('button', { name: 'Prune' })).toBeEnabled();
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

    await user.click(screen.getByRole('button', { name: 'Prune' }));
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

    await user.click(screen.getByRole('button', { name: 'Prune' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalledWith('/api/volumes/prune', expect.anything());
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
