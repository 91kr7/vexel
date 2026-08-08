import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NetworksPanel } from '../../src/volumes-networks/NetworksPanel';
import type { NetworkSummary } from '../../src/data/networks-client';
import { ConfirmationProvider } from '../../src/shell/services/ConfirmationService';
import { ErrorReportingProvider, useErrorReporter } from '../../src/shell/services/ErrorReportingService';
import { ProgressProvider } from '../../src/shell/services/ProgressService';
import { ToastProvider } from '../../src/ui';

function makeNetwork(overrides: Partial<NetworkSummary> = {}): NetworkSummary {
  return {
    id: 'net-app',
    name: 'app-net',
    driver: 'bridge',
    scope: 'local',
    subnet: '172.20.0.0/24',
    gateway: '172.20.0.1',
    labels: {},
    options: {},
    attachedContainers: [],
    ...overrides,
  };
}

function inspectPayload(network: NetworkSummary) {
  return { ...network, raw: { Name: network.name, Driver: network.driver } };
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

function renderPanel(networks: NetworkSummary[], onRefresh = vi.fn()) {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <NetworksPanel networks={networks} loaded onRefresh={onRefresh} />
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

// The row content (attached-container chips) and the inline inspect surface's
// useNetworkInspect/useContainers subscribe to daemon events through a
// module-level EventSource, which jsdom does not provide.
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
let inspectedNetwork: NetworkSummary;

beforeEach(() => {
  inspectedNetwork = makeNetwork();
  fetchMock = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes('/inspect')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(inspectPayload(inspectedNetwork)) });
    }
    if (String(url) === '/api/containers') {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([{ id: 'c1', name: 'app-1', state: 'running' }, { id: 'c2', name: 'app-2', state: 'running' }]) });
    }
    return Promise.resolve({ ok: true, status: 204, json: () => Promise.resolve({}) });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// networks-panel.md — one row per network: name, a subnet/gateway monospace secondary line (or "no
// subnet" when the network has none) and "driver · scope" trailing the row
describe('NetworksPanel — list rows (plan-docker_management_app/REQ-72)', () => {
  it('shows the network name, subnet/gateway line and driver/scope', () => {
    renderPanel([makeNetwork({ name: 'app-net', subnet: '172.20.0.0/24', gateway: '172.20.0.1', driver: 'bridge', scope: 'local' })]);

    const row = listRows()[0]!;
    expect(within(row).getByText('app-net')).toBeInTheDocument();
    expect(row.textContent).toContain('172.20.0.0/24 · gw 172.20.0.1');
    expect(row.textContent).toContain('bridge · local');
  });

  it('shows "no subnet" when the network carries no IPAM configuration', () => {
    renderPanel([makeNetwork({ subnet: undefined, gateway: undefined })]);

    expect(listRows()[0]!.textContent).toContain('no subnet');
  });

  it('shows an empty state when there are no networks', () => {
    renderPanel([]);

    expect(listRows()).toHaveLength(0);
    expect(screen.getByText('No networks')).toBeInTheDocument();
  });
});

// networks-panel.md — below each row, a chip group of the network's attached containers, each chip
// carrying a "detach" action, plus a trailing "+ Attach" affordance; "No attached containers" in place
// of the chips when none are attached
describe('NetworksPanel — attached-container chips (plan-docker_management_app/REQ-72, REQ-74)', () => {
  it('shows a chip with a detach action for each attached container', () => {
    renderPanel([makeNetwork({ attachedContainers: ['app-1', 'app-2'] })]);

    expect(screen.getByText('app-1')).toBeInTheDocument();
    expect(screen.getByText('app-2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'detach' })).toHaveLength(2);
  });

  it('shows "No attached containers" in place of the chips when none are attached', () => {
    renderPanel([makeNetwork({ attachedContainers: [] })]);

    expect(screen.getByText('No attached containers')).toBeInTheDocument();
  });

  // networks-panel.md — a chip's "detach" action detaches that container immediately (no confirmation)
  // and re-reads the list
  it('detaches a container from its chip immediately, with no confirmation, and re-reads the list', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeNetwork({ id: 'net-app', attachedContainers: ['app-1'] })]);

    await user.click(screen.getByRole('button', { name: 'detach' }));

    expect(screen.queryByRole('heading', { name: /^Confirm:/ })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/networks/net-app/detach',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const [, init] = fetchMock.mock.calls.find(([url]) => url === '/api/networks/net-app/detach')!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ containerId: 'app-1' });
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  // networks-panel.md — a row's "+ Attach" affordance opens a FormDialog offering a Combobox of known
  // container names; submitting attaches that container, closes the dialog and re-reads the list
  it('attaches a chosen container from the row\'s "+ Attach" affordance, with no confirmation, and re-reads the list', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeNetwork({ id: 'net-app', name: 'app-net' })]);

    await user.click(screen.getByRole('button', { name: '+ Attach' }));

    expect(screen.getByRole('heading', { name: 'Attach a container to app-net' })).toBeInTheDocument();
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.type(within(dialog).getByRole('combobox', { name: 'Container' }), 'app-1');
    await user.click(within(dialog).getByRole('option', { name: 'app-1' }));
    await user.click(within(dialog).getByRole('button', { name: 'Attach' }));

    expect(screen.queryByRole('heading', { name: /^Confirm:/ })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/networks/net-app/attach',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const [, init] = fetchMock.mock.calls.find(([url]) => url === '/api/networks/net-app/attach')!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ containerId: 'app-1' });
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Attach a container to app-net' })).not.toBeInTheDocument());
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});

// networks-panel.md — selecting a row expands its inline inspect surface; selecting it again collapses
// it; only one network's inspect surface is expanded at a time
describe('NetworksPanel — inline inspect (plan-docker_management_app/REQ-73)', () => {
  it('expands the inspect surface with driver, scope, subnet, gateway and options on selection', async () => {
    const user = userEvent.setup();
    const network = makeNetwork({ name: 'app-net' });
    inspectedNetwork = network;
    renderPanel([network]);

    await user.click(listRows()[0]!);

    const expanded = await screen.findByText('Driver');
    const detail = expanded.closest('.ui-card-list')!;
    expect(within(detail).getByText('Scope')).toBeInTheDocument();
    expect(within(detail).getByText('Subnet')).toBeInTheDocument();
    expect(within(detail).getByText('Gateway')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('collapses the inspect surface when the same row is selected again', async () => {
    const user = userEvent.setup();
    renderPanel([makeNetwork()]);

    await user.click(listRows()[0]!);
    await screen.findByText('Driver');
    await user.click(listRows()[0]!);

    await waitFor(() => expect(screen.queryByText('Driver')).not.toBeInTheDocument());
  });

  it('expands only one network at a time', async () => {
    const user = userEvent.setup();
    renderPanel([makeNetwork({ id: 'net-a', name: 'net-a' }), makeNetwork({ id: 'net-b', name: 'net-b' })]);

    await user.click(listRows()[0]!);
    await screen.findByText('Driver');
    await user.click(listRows()[1]!);

    await waitFor(() => expect(document.querySelectorAll('.ui-card-list__expanded')).toHaveLength(1));
  });
});

// networks-panel.md — a selected row's "Remove" action goes through useConfirmation().confirm() first;
// cancelling performs nothing; on success it collapses the row and re-reads the list
describe('NetworksPanel — remove (plan-docker_management_app/REQ-73)', () => {
  it('asks for confirmation naming the network before removing it, and performs nothing on cancel', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeNetwork({ id: 'net-app', name: 'app-net' })]);

    await user.click(listRows()[0]!);
    await screen.findByText('Driver');
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(screen.getByRole('heading', { name: 'Confirm: app-net' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalledWith('/api/networks/net-app', expect.objectContaining({ method: 'DELETE' }));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('removes the network and re-reads the list once confirmed', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeNetwork({ id: 'net-app', name: 'app-net' })]);

    await user.click(listRows()[0]!);
    await screen.findByText('Driver');
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/networks/net-app', expect.objectContaining({ method: 'DELETE' })),
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });
});

// networks-panel.md — "Create" opens a FormDialog for a name, driver, subnet, gateway, IP range,
// options and labels; submitting creates the network, closes the dialog and re-reads the list
describe('NetworksPanel — create (plan-docker_management_app/REQ-73)', () => {
  it('opens the create dialog with an empty name and a default driver of bridge', async () => {
    const user = userEvent.setup();
    renderPanel([]);

    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByRole('heading', { name: 'Create network' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Network name' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Driver' })).toHaveValue('bridge');
  });

  it('creates a network with the given name, subnet, gateway, IP range and labels, then closes the dialog and re-reads the list', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([]);

    await user.click(screen.getByRole('button', { name: 'Create' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.type(within(dialog).getByRole('textbox', { name: 'Network name' }), 'app-net');
    await user.type(within(dialog).getByRole('textbox', { name: 'Subnet' }), '172.20.0.0/24');
    await user.type(within(dialog).getByRole('textbox', { name: 'Gateway' }), '172.20.0.1');
    await user.type(within(dialog).getByRole('textbox', { name: 'IP range' }), '172.20.0.128/25');

    const labelsField = Array.from(dialog.querySelectorAll<HTMLElement>('.ui-form-field')).find(
      (field) => field.querySelector('.ui-form-field__label')?.textContent === 'Labels',
    )!;
    await user.click(within(labelsField).getByRole('button', { name: 'Add label' }));
    await user.type(within(labelsField).getByRole('textbox', { name: 'Key 1' }), 'team');
    await user.type(within(labelsField).getByRole('textbox', { name: 'Value 1' }), 'vexel');

    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/networks', expect.objectContaining({ method: 'POST' })));
    const [, init] = fetchMock.mock.calls.find(([url]) => url === '/api/networks')!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.name).toBe('app-net');
    expect(body.driver).toBe('bridge');
    expect(body.subnet).toBe('172.20.0.0/24');
    expect(body.gateway).toBe('172.20.0.1');
    expect(body.ipRange).toBe('172.20.0.128/25');
    expect(body.labels).toEqual({ team: 'vexel' });

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Create network' })).not.toBeInTheDocument());
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('reports the daemon\'s own failure message when creation is refused', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ error: 'network name already in use' }) });
    renderPanel([]);

    await user.click(screen.getByRole('button', { name: 'Create' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.type(within(dialog).getByRole('textbox', { name: 'Network name' }), 'app-net');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    expect(await screen.findByText(/network name already in use/)).toBeInTheDocument();
  });
});

// networks-panel.md — "Prune" is disabled when there is no network to prune; confirms first, then
// reports the number of networks removed via useToast() on success and re-reads the list
describe('NetworksPanel — prune (plan-docker_management_app/REQ-73)', () => {
  it('disables Prune when there is no network', () => {
    renderPanel([]);

    expect(screen.getByRole('button', { name: 'Prune' })).toBeDisabled();
  });

  it('enables Prune once at least one network exists', () => {
    renderPanel([makeNetwork()]);

    expect(screen.getByRole('button', { name: 'Prune' })).toBeEnabled();
  });

  it('confirms before pruning, reports the outcome via a toast and re-reads the list', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/prune')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ removedNames: ['orphan-1', 'orphan-2'] }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
    });
    const { onRefresh } = renderPanel([makeNetwork()]);

    await user.click(screen.getByRole('button', { name: 'Prune' }));
    expect(screen.getByRole('heading', { name: 'Confirm: unused networks' })).toBeInTheDocument();
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.click(within(dialog).getByRole('button', { name: 'Prune' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/networks/prune', expect.objectContaining({ method: 'POST' })));
    expect(await screen.findByText('2 networks removed')).toBeInTheDocument();
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('performs no request when pruning is cancelled', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeNetwork()]);

    await user.click(screen.getByRole('button', { name: 'Prune' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalledWith('/api/networks/prune', expect.anything());
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
