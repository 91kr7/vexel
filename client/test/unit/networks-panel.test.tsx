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

// The list is the object list's comfortable variant: a row is a
// `.ui-data-table__row`, the attached-container chips are the row content that
// always accompanies it, and the panel it reveals is the library's detail panel
// (networks-panel.md).
function listRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-data-table__row'));
}

function rowContents(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ui-data-table__row-content'));
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

// The row content (attached-container chips) and the inline inspect surface's
// useNetworkInspect/useContainers subscribe to daemon events through a
// module-level EventSource, which jsdom does not provide.
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

// networks-panel.md — one row per network, in columns: NAME (the name over a "<subnet> · gw
// <gateway>" second line, "no subnet" when the network has none), DRIVER, SCOPE, and the row's
// action cluster
describe('NetworksPanel — list rows (plan-docker_management_app/REQ-72, plan-ui-coherence-optimisation/REQ-31)', () => {
  it('lists every network on the object list, with the columns the panel declares in order', () => {
    renderPanel([makeNetwork()]);

    expect(document.querySelector('.ui-data-table--comfortable')).not.toBeNull();
    expect(columnHeaders()).toEqual(['NAME', 'DRIVER', 'SCOPE', 'ACTIONS']);
  });

  it('shows the network name, subnet/gateway line and driver/scope', () => {
    renderPanel([makeNetwork({ name: 'app-net', subnet: '172.20.0.0/24', gateway: '172.20.0.1', driver: 'bridge', scope: 'local' })]);

    const row = listRows()[0]!;
    expect(within(row).getByText('app-net')).toBeInTheDocument();
    expect(row.textContent).toContain('172.20.0.0/24 · gw 172.20.0.1');
    expect(row.textContent).toContain('bridge');
    expect(row.textContent).toContain('local');
  });

  it('shows "no subnet" when the network carries no IPAM configuration', () => {
    renderPanel([makeNetwork({ subnet: undefined, gateway: undefined })]);

    expect(listRows()[0]!.textContent).toContain('no subnet');
  });

  // networks-panel.md — once loaded, the empty state states a title, a line of explanation and the
  // action that resolves it
  it('shows an empty state explaining the absence and offering the action that resolves it', () => {
    renderPanel([]);

    expect(listRows()).toHaveLength(0);
    const emptyState = document.querySelector<HTMLElement>('.ui-empty-state')!;
    expect(within(emptyState).getByText('No networks')).toBeInTheDocument();
    expect(emptyState.querySelector('.ui-empty-state__description')?.textContent ?? '').not.toBe('');
    expect(within(emptyState).getByRole('button', { name: 'Create the first network' })).toBeInTheDocument();
  });

  // networks-panel.md — while the list is empty the toolbar's action and the empty state's are drawn
  // at once, as two controls neither of whose names contains the other
  // (plan-ui-coherence-optimisation/REQ-41, plan-docker_management_app/REQ-25)
  it('draws both create controls on an empty list, under names that do not shadow each other', () => {
    renderPanel([]);

    const emptyState = document.querySelector<HTMLElement>('.ui-empty-state')!;
    expect(within(toolbar()).getByRole('button', { name: 'Create network…' })).toBeInTheDocument();
    expect(within(emptyState).getByRole('button', { name: 'Create the first network' })).toBeInTheDocument();
    expect(namesShadowingEachOther(buttonNames())).toEqual([]);
  });
});

// networks-panel.md — below every row, inside the same card, the chip group of that network's
// attached containers, each chip carrying its own "detach" action; "No attached containers" in place
// of the chips when none are attached
describe('NetworksPanel — attached-container chips (plan-docker_management_app/REQ-72, REQ-74)', () => {
  it('shows a chip with a detach action for each attached container, below its own row', () => {
    renderPanel([makeNetwork({ attachedContainers: ['app-1', 'app-2'] })]);

    const content = rowContents()[0]!;
    expect(within(content).getByText('app-1')).toBeInTheDocument();
    expect(within(content).getByText('app-2')).toBeInTheDocument();
    expect(within(content).getAllByRole('button', { name: 'detach' })).toHaveLength(2);
  });

  it('shows "No attached containers" in place of the chips when none are attached', () => {
    renderPanel([makeNetwork({ attachedContainers: [] })]);

    expect(within(rowContents()[0]!).getByText('No attached containers')).toBeInTheDocument();
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
});

// networks-panel.md — the page-level actions sit in the toolbar under the section header, and
// attaching a container is an action of the row's cluster rather than bare text beside the chips
// (plan-ui-coherence-optimisation/REQ-27, REQ-35)
describe('NetworksPanel — where the actions live (plan-ui-coherence-optimisation/REQ-35)', () => {
  it('carries create and prune in the toolbar under the section header', () => {
    renderPanel([makeNetwork()]);

    expect(within(toolbar()).getByRole('button', { name: 'Create network…' })).toBeInTheDocument();
    expect(within(toolbar()).getByRole('button', { name: 'Prune' })).toBeInTheDocument();
  });

  it('leaves the section header carrying no action of its own', () => {
    renderPanel([makeNetwork()]);

    const header = document.querySelector<HTMLElement>('.ui-section-header')!;
    expect(header.querySelectorAll('button')).toHaveLength(0);
  });

  it('offers attach and remove as controls of the row itself', () => {
    renderPanel([makeNetwork()]);

    const row = listRows()[0]!;
    expect(within(row).getByRole('button', { name: 'Attach…' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  // plan-ui-coherence-optimisation/REQ-27 — bare text is never a control: the "+ Attach" text beside
  // the chips is gone, and no chip group on this panel renders an add affordance of its own
  it('offers no bare-text attach affordance beside the chips', () => {
    renderPanel([makeNetwork({ attachedContainers: ['app-1'] })]);

    expect(screen.queryByText('+ Attach')).not.toBeInTheDocument();
    for (const content of rowContents()) {
      expect(within(content).queryByRole('button', { name: /attach/i })).not.toBeInTheDocument();
    }
  });

  // networks-panel.md — "Attach…" opens a FormDialog offering a Combobox of known container names;
  // submitting attaches that container to that row's network, with no confirmation
  it('attaches a chosen container from the row\'s cluster, with no confirmation, and re-reads the list', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeNetwork({ id: 'net-app', name: 'app-net' })]);

    await user.click(within(listRows()[0]!).getByRole('button', { name: 'Attach…' }));

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

// networks-panel.md — selecting a row reveals its detail panel directly below the row and its chips;
// selecting the same row again, or Escape, closes it; at most one network's detail is revealed
describe('NetworksPanel — the revealed detail (plan-ui-coherence-optimisation/REQ-32, REQ-33)', () => {
  it('reveals the detail panel with the network\'s properties in the library\'s grid on selection', async () => {
    const user = userEvent.setup();
    const network = makeNetwork({ name: 'app-net', options: { 'com.docker.network.bridge.name': 'br-app' } });
    inspectedNetwork = network;
    renderPanel([network]);

    await user.click(listRows()[0]!);

    await waitFor(() => expect(detailPanels()).toHaveLength(1));
    const panel = detailPanels()[0]!;
    await waitFor(() => expect(propertyValue(panel, 'Driver')).toBe('bridge'));
    expect(propertyValue(panel, 'Scope')).toBe('local');
    expect(propertyValue(panel, 'Subnet')).toBe('172.20.0.0/24');
    expect(propertyValue(panel, 'Gateway')).toBe('172.20.0.1');
    expect(propertyValue(panel, 'Options')).toBe('com.docker.network.bridge.name=br-app');
    expect(panel.querySelector('.ui-definition-list')).not.toBeNull();
  });

  it('closes the detail when the same row is selected again', async () => {
    const user = userEvent.setup();
    renderPanel([makeNetwork()]);

    await user.click(listRows()[0]!);
    await waitFor(() => expect(detailPanels()).toHaveLength(1));
    await user.click(listRows()[0]!);

    await waitFor(() => expect(detailPanels()).toHaveLength(0));
  });

  // detail-panel.md — the panel opened by the row's own gesture presents no close control and claims
  // Escape instead
  it('closes the detail on Escape, and presents no close control of its own', async () => {
    const user = userEvent.setup();
    renderPanel([makeNetwork()]);

    await user.click(listRows()[0]!);
    await waitFor(() => expect(detailPanels()).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Close detail' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => expect(detailPanels()).toHaveLength(0));
  });

  it('reveals one network\'s detail at a time', async () => {
    const user = userEvent.setup();
    renderPanel([makeNetwork({ id: 'net-a', name: 'net-a' }), makeNetwork({ id: 'net-b', name: 'net-b' })]);

    await user.click(listRows()[0]!);
    await waitFor(() => expect(detailPanels()).toHaveLength(1));
    await user.click(listRows()[1]!);

    await waitFor(() => expect(detailPanels()).toHaveLength(1));
    expect(listRows().filter((row) => row.getAttribute('aria-selected') === 'true')).toHaveLength(1);
  });
});

// networks-panel.md — "Remove" (row cluster, destructive) goes through useConfirmation().confirm()
// first; cancelling performs nothing; on success it closes any detail open on that network and
// re-reads the list
describe('NetworksPanel — remove (plan-docker_management_app/REQ-73, plan-ui-coherence-optimisation/REQ-35)', () => {
  it('asks for confirmation naming the network before removing it, and performs nothing on cancel', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeNetwork({ id: 'net-app', name: 'app-net' })]);

    await user.click(within(listRows()[0]!).getByRole('button', { name: 'Remove' }));

    expect(screen.getByRole('heading', { name: 'Confirm: app-net' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalledWith('/api/networks/net-app', expect.objectContaining({ method: 'DELETE' }));
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('removes the network and re-reads the list once confirmed', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([makeNetwork({ id: 'net-app', name: 'app-net' })]);

    await user.click(within(listRows()[0]!).getByRole('button', { name: 'Remove' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/networks/net-app', expect.objectContaining({ method: 'DELETE' })),
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it('closes the detail open on the network it removed', async () => {
    const user = userEvent.setup();
    renderPanel([makeNetwork({ id: 'net-app', name: 'app-net' })]);

    await user.click(listRows()[0]!);
    await waitFor(() => expect(detailPanels()).toHaveLength(1));

    await user.click(within(listRows()[0]!).getByRole('button', { name: 'Remove' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(detailPanels()).toHaveLength(0));
  });
});

// networks-panel.md — "Create network…" opens a FormDialog for a name, driver, subnet, gateway, IP
// range, options and labels; submitting creates the network, closes the dialog and re-reads the list
describe('NetworksPanel — create (plan-docker_management_app/REQ-73)', () => {
  it('opens the create dialog with an empty name and a default driver of bridge', async () => {
    const user = userEvent.setup();
    renderPanel([]);

    await user.click(within(toolbar()).getByRole('button', { name: 'Create network…' }));

    expect(screen.getByRole('heading', { name: 'Create network' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Network name' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Driver' })).toHaveValue('bridge');
  });

  // networks-panel.md — once loaded, the empty state offers the action that resolves it
  it('opens the same dialog from the empty state\'s own action', async () => {
    const user = userEvent.setup();
    renderPanel([]);

    const emptyState = document.querySelector<HTMLElement>('.ui-empty-state')!;
    await user.click(within(emptyState).getByRole('button', { name: 'Create the first network' }));

    expect(screen.getByRole('heading', { name: 'Create network' })).toBeInTheDocument();
  });

  // networks-panel.md — the option rows and the label rows carry distinct accessible names
  it('announces the option rows apart from the label rows', async () => {
    const user = userEvent.setup();
    renderPanel([]);

    await user.click(within(toolbar()).getByRole('button', { name: 'Create network…' }));
    const dialog = within(document.querySelector<HTMLElement>('.ui-modal')!);
    await user.click(dialog.getByRole('button', { name: 'Add option' }));
    await user.click(dialog.getByRole('button', { name: 'Add label' }));

    for (const name of ['Options Key 1', 'Options Value 1', 'Labels Key 1', 'Labels Value 1']) {
      expect(dialog.getAllByRole('textbox', { name })).toHaveLength(1);
    }
    for (const name of ['Key 1', 'Value 1']) {
      expect(dialog.queryAllByRole('textbox', { name })).toHaveLength(0);
    }
    expect(dialog.getAllByRole('button', { name: 'Remove pair 1 from Options' })).toHaveLength(1);
    expect(dialog.getAllByRole('button', { name: 'Remove pair 1 from Labels' })).toHaveLength(1);
  });

  it('creates a network with the given name, subnet, gateway, IP range and labels, then closes the dialog and re-reads the list', async () => {
    const user = userEvent.setup();
    const { onRefresh } = renderPanel([]);

    await user.click(within(toolbar()).getByRole('button', { name: 'Create network…' }));
    const dialog = document.querySelector<HTMLElement>('.ui-modal')!;
    await user.type(within(dialog).getByRole('textbox', { name: 'Network name' }), 'app-net');
    await user.type(within(dialog).getByRole('textbox', { name: 'Subnet' }), '172.20.0.0/24');
    await user.type(within(dialog).getByRole('textbox', { name: 'Gateway' }), '172.20.0.1');
    await user.type(within(dialog).getByRole('textbox', { name: 'IP range' }), '172.20.0.128/25');

    await user.click(within(dialog).getByRole('button', { name: 'Add label' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Labels Key 1' }), 'team');
    await user.type(within(dialog).getByRole('textbox', { name: 'Labels Value 1' }), 'vexel');

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

    await user.click(within(toolbar()).getByRole('button', { name: 'Create network…' }));
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

    expect(within(toolbar()).getByRole('button', { name: 'Prune' })).toBeDisabled();
  });

  it('enables Prune once at least one network exists', () => {
    renderPanel([makeNetwork()]);

    expect(within(toolbar()).getByRole('button', { name: 'Prune' })).toBeEnabled();
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

    await user.click(within(toolbar()).getByRole('button', { name: 'Prune' }));
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

    await user.click(within(toolbar()).getByRole('button', { name: 'Prune' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(fetchMock).not.toHaveBeenCalledWith('/api/networks/prune', expect.anything());
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
