import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type {
  SwarmDataItem,
  SwarmListing,
  SwarmNode,
  SwarmService,
  SwarmServiceDetail,
  SwarmStack,
} from '../../src/data/swarm-client';
import type { UseSwarmServiceDetailResult } from '../../src/data/use-swarm-service-detail';

// The four panels of the Swarm screen, each fed the listing the screen read
// (swarm/specs/swarm-{nodes,services,secrets,configs-stacks}-panel.md, REQ-81 to
// REQ-84). The panels take their data as props, so nothing but the reading of
// the service being inspected has to be stood in for.
let serviceDetailResult: UseSwarmServiceDetailResult = { loaded: true, refresh: () => undefined };

vi.mock('../../src/data/use-swarm-service-detail', () => ({
  useSwarmServiceDetail: (serviceId?: string) => (serviceId === undefined ? { loaded: false, refresh: () => undefined } : serviceDetailResult),
}));

const { SwarmNodesPanel } = await import('../../src/swarm/SwarmNodesPanel');
const { SwarmServicesPanel } = await import('../../src/swarm/SwarmServicesPanel');
const { SwarmSecretsPanel } = await import('../../src/swarm/SwarmSecretsPanel');
const { SwarmConfigsStacksPanel } = await import('../../src/swarm/SwarmConfigsStacksPanel');
const { ConfirmationProvider } = await import('../../src/shell/services/ConfirmationService');
const { ErrorReportingProvider } = await import('../../src/shell/services/ErrorReportingService');
const { ProgressProvider } = await import('../../src/shell/services/ProgressService');
const { ToastProvider } = await import('../../src/ui');

const REASON = 'This daemon is not part of a swarm. Initialise a swarm or join an existing one to see its nodes, services, stacks, secrets and configs.';

function renderPanel(panel: ReactNode) {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>{panel}</ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
}

/** The confirmation dialog the application-wide service opened, whichever it is. */
function confirmation(): HTMLElement {
  return document.querySelector('.ui-modal') as HTMLElement;
}

/**
 * The label editor of a dialog: the one key/value editor whose add action reads
 * "Add label" (a create form may hold another for the environment).
 */
function labelsEditor(scope: HTMLElement): HTMLElement {
  return within(scope).getByRole('button', { name: 'Add label' }).closest('.ui-key-value-editor') as HTMLElement;
}

/** Adds one label row to the dialog's label editor and fills it in. */
async function addLabelRow(user: ReturnType<typeof userEvent.setup>, scope: HTMLElement, row: number, key: string, value: string) {
  await user.click(within(labelsEditor(scope)).getByRole('button', { name: 'Add label' }));
  if (key !== '') await user.type(within(labelsEditor(scope)).getByLabelText(`Key ${row}`), key);
  if (value !== '') await user.type(within(labelsEditor(scope)).getByLabelText(`Value ${row}`), value);
}

/** A row of a card list, found by the name it leads with. */
function nodeRow(hostname: string): HTMLElement {
  return screen.getByText((content) => content.startsWith(hostname));
}

/** Everything the operator can read on the panel. */
function visibleText(): string {
  return document.body.textContent ?? '';
}

function node(overrides: Partial<SwarmNode> = {}): SwarmNode {
  return {
    id: 'node-1',
    hostname: 'manager-alpha',
    role: 'manager',
    availability: 'active',
    status: 'ready',
    leader: true,
    self: true,
    version: 12,
    labels: {},
    engineVersion: '27.0.3',
    address: '10.0.0.7',
    ...overrides,
  };
}

function service(overrides: Partial<SwarmService> = {}): SwarmService {
  return {
    id: 'svc-1',
    name: 'blog_api',
    image: 'alpine:3.20',
    mode: 'replicated',
    replicasRunning: 2,
    replicasDesired: 3,
    ports: [{ published: 8080, target: 80, protocol: 'tcp' }],
    stack: 'blog',
    version: 5,
    ...overrides,
  };
}

function dataItem(overrides: Partial<SwarmDataItem> = {}): SwarmDataItem {
  return {
    kind: 'secret',
    id: 'sec-1',
    name: 'db_password',
    createdAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
    version: 3,
    labels: {},
    ...overrides,
  };
}

function stack(overrides: Partial<SwarmStack> = {}): SwarmStack {
  return {
    name: 'blog',
    serviceCount: 1,
    services: [{ id: 'svc-1', name: 'blog_api', image: 'alpine:3.20', mode: 'replicated', replicasRunning: 2, replicasDesired: 3 }],
    secretCount: 1,
    configCount: 1,
    networkCount: 2,
    ...overrides,
  };
}

function listing<T>(items: T[], unavailableReason?: string): SwarmListing<T> {
  return unavailableReason === undefined ? { items } : { items, unavailableReason };
}

beforeEach(() => {
  serviceDetailResult = { loaded: true, refresh: () => undefined };
});

afterEach(cleanup);

describe('SwarmNodesPanel (swarm/specs/swarm-nodes-panel.md)', () => {
  const noop = async () => undefined as never;

  // "per node: a dot coloured by its status, the hostname (the node the application is talking to
  // marked 'this node'), and a monospace line with its status ..., its engine version and its
  // address"; "the role badge reads 'leader' on the leader"; "the availability reads 'active',
  // 'pause' or 'drain'"
  it('states each node with its hostname, role, availability and status', () => {
    renderPanel(
      <SwarmNodesPanel nodes={listing([node()])} loaded canManage onUpdate={noop} onRemove={async () => undefined} />,
    );

    expect(screen.getByText('Nodes')).toBeInTheDocument();
    expect(visibleText()).toContain('manager-alpha');
    expect(visibleText()).toContain('this node');
    expect(screen.getByText('leader')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(visibleText()).toContain('ready');
    expect(visibleText()).toContain('27.0.3');
    expect(visibleText()).toContain('10.0.0.7');
  });

  it('reads the role badge as manager or worker when the node is not the leader', () => {
    renderPanel(
      <SwarmNodesPanel
        nodes={listing([node({ id: 'w1', hostname: 'worker-beta', role: 'worker', leader: false, self: false, availability: 'drain' })])}
        loaded
        canManage
        onUpdate={noop}
        onRemove={async () => undefined}
      />,
    );

    expect(screen.getByText('worker')).toBeInTheDocument();
    expect(screen.getByText('drain')).toBeInTheDocument();
    expect(visibleText()).not.toContain('this node');
  });

  // "with nothing to show: the reason the listing carries ... or 'No nodes' on a manager with an
  // empty cluster, or 'Reading nodes…' before the first read settles"
  it('states the reason it has nothing to list rather than showing an empty list', () => {
    renderPanel(<SwarmNodesPanel nodes={listing<SwarmNode>([], REASON)} loaded canManage={false} onUpdate={noop} onRemove={async () => undefined} />);

    expect(screen.getByText(REASON)).toBeInTheDocument();
  });

  it('says there are no nodes on a manager with an empty cluster', () => {
    renderPanel(<SwarmNodesPanel nodes={listing<SwarmNode>([])} loaded canManage onUpdate={noop} onRemove={async () => undefined} />);

    expect(screen.getByText('No nodes')).toBeInTheDocument();
  });

  it('says it is still reading before the first read settles', () => {
    renderPanel(<SwarmNodesPanel nodes={listing<SwarmNode>([])} loaded={false} canManage onUpdate={noop} onRemove={async () => undefined} />);

    expect(screen.getByText('Reading nodes…')).toBeInTheDocument();
  });

  // "selecting a row -> expands it"; "in the expansion, 'Availability' -> same, for active / pause /
  // drain", applied immediately
  it('applies a change of availability from the expanded row', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(node({ availability: 'drain' }));
    renderPanel(<SwarmNodesPanel nodes={listing([node()])} loaded canManage onUpdate={onUpdate} onRemove={async () => undefined} />);

    await user.click(nodeRow('manager-alpha'));
    const availability = screen.getByLabelText(/^Availability/);
    await user.selectOptions(availability, 'drain');

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('node-1', { availability: 'drain' }));
  });

  // "'Remove node' -> asks the confirmation service, naming the node and the consequence; only then
  // is the node removed. Removal is forced ... and the confirmation says so."
  it('confirms a node removal, names the node and the forced removal, and only then removes it', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(undefined);
    renderPanel(<SwarmNodesPanel nodes={listing([node()])} loaded canManage onUpdate={noop} onRemove={onRemove} />);

    await user.click(nodeRow('manager-alpha'));
    await user.click(screen.getByRole('button', { name: 'Remove node' }));

    const dialog = confirmation();
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('manager-alpha');
    expect(dialog.textContent).toMatch(/forc/i);
    expect(onRemove).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /remove|confirm/i }));

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('node-1', true));
  });

  // "every action is absent (or inert) when the daemon is not a manager"
  it('offers no action when the daemon is not a manager', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmNodesPanel nodes={listing([node()])} loaded canManage={false} onUpdate={noop} onRemove={async () => undefined} />);

    await user.click(nodeRow('manager-alpha'));

    expect(screen.queryByRole('button', { name: 'Remove node' })).toBeNull();
    expect(screen.queryByLabelText(/^Availability/)).toBeNull();
  });
});

describe('SwarmServicesPanel (swarm/specs/swarm-services-panel.md)', () => {
  const noop = async () => undefined as never;

  // "per service: the name, the stack it belongs to and its published ports as a monospace line, the
  // image, running/desired and a badge reading 'replicated' or 'global'"
  it('states each service with its image, replicas, ports and mode', () => {
    renderPanel(
      <SwarmServicesPanel services={listing([service()])} loaded canManage onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />,
    );

    expect(screen.getByText('Services & tasks')).toBeInTheDocument();
    expect(visibleText()).toContain('blog_api');
    expect(visibleText()).toContain('alpine:3.20');
    expect(visibleText()).toContain('2/3');
    expect(screen.getByText('replicated')).toBeInTheDocument();
    expect(visibleText()).toContain('8080');
  });

  it('states the reason, the empty cluster or the pending read in place of a listing', () => {
    const { unmount } = render(<></>);
    unmount();

    renderPanel(<SwarmServicesPanel services={listing<SwarmService>([], REASON)} loaded canManage={false} onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);
    expect(screen.getByText(REASON)).toBeInTheDocument();
    cleanup();

    renderPanel(<SwarmServicesPanel services={listing<SwarmService>([])} loaded canManage onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);
    expect(screen.getByText('No services')).toBeInTheDocument();
    cleanup();

    renderPanel(<SwarmServicesPanel services={listing<SwarmService>([])} loaded={false} canManage onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);
    expect(screen.getByText('Reading services…')).toBeInTheDocument();
  });

  // "for the opened service: ... then one row per task with its slot, the node it runs on, its state
  // and its desired state"
  it('shows the tasks of the service that is opened', async () => {
    const user = userEvent.setup();
    const detail: SwarmServiceDetail = {
      service: service(),
      env: ['MODE=production'],
      labels: {},
      tasks: [
        { id: 'task-1', slot: 1, nodeId: 'node-1', nodeHostname: 'manager-alpha', state: 'running', desiredState: 'running' },
        { id: 'task-2', slot: 2, state: 'rejected', desiredState: 'shutdown', error: 'no suitable node' },
      ],
      raw: {},
    };
    serviceDetailResult = { detail, loaded: true, refresh: () => undefined };
    renderPanel(<SwarmServicesPanel services={listing([service()])} loaded canManage onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByText('blog_api'));

    expect(visibleText()).toContain('running');
    expect(visibleText()).toContain('manager-alpha');
    expect(visibleText()).toContain('MODE=production');
    expect(visibleText()).toContain('no suitable node');
  });

  // "'Remove' on the opened service -> asks the confirmation service, naming the service and stating
  // that its tasks stop; only then is it removed."
  it('confirms a service removal, naming the service and what stops', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(undefined);
    serviceDetailResult = { detail: { service: service(), env: [], labels: {}, tasks: [], raw: {} }, loaded: true, refresh: () => undefined };
    renderPanel(<SwarmServicesPanel services={listing([service()])} loaded canManage onCreate={noop} onUpdate={noop} onRemove={onRemove} />);

    await user.click(screen.getByText('blog_api'));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    const dialog = confirmation();
    expect(dialog.textContent).toContain('blog_api');
    expect(dialog.textContent).toMatch(/task/i);

    await user.click(within(dialog).getByRole('button', { name: /remove|confirm/i }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('svc-1'));
  });

  // "The replica field is offered for a replicated service only: a global service ... has no replica
  // count, which the form states instead of accepting a number."
  it('offers a replica count for a replicated service and states its absence for a global one', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmServicesPanel services={listing<SwarmService>([])} loaded canManage onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Create service' }));
    expect(screen.getByLabelText(/replica/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/mode/i), 'global');

    expect(screen.queryByLabelText(/replicas$/i)).toBeNull();
    expect(document.querySelector('.ui-modal')!.textContent).toMatch(/one task (per|on every) node/i);
  });

  // swarm-services-panel.md — "a form asking for the name, image, mode, replica count, environment
  // variables, published ports and labels"; "A row with an empty key is dropped rather than sent."
  it('creates a service with the labels typed, dropping a row with no key', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(service());
    renderPanel(<SwarmServicesPanel services={listing<SwarmService>([])} loaded canManage onCreate={onCreate} onUpdate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Create service' }));
    const dialog = document.querySelector('.ui-modal') as HTMLElement;
    await user.type(within(dialog).getByLabelText(/service name/i), 'blog_api');
    await user.type(within(dialog).getByLabelText(/image/i), 'alpine:3.20');
    await addLabelRow(user, dialog, 1, 'vexel.test.run', '42');
    await addLabelRow(user, dialog, 2, '', 'dropped');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ labels: { 'vexel.test.run': '42' } });
    expect(Object.keys(onCreate.mock.calls[0]![0].labels)).toEqual(['vexel.test.run']);
  });

  // swarm-services-panel.md — "Labels are offered on creation only ... an update preserves the labels
  // the service already carries, so the field would have nothing to add there."
  it('offers the label editor when creating a service and not when updating one', async () => {
    const user = userEvent.setup();
    serviceDetailResult = { detail: { service: service(), env: [], labels: {}, tasks: [], raw: {} }, loaded: true, refresh: () => undefined };
    renderPanel(<SwarmServicesPanel services={listing([service()])} loaded canManage onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Create service' }));
    expect(within(document.querySelector('.ui-modal') as HTMLElement).getByRole('button', { name: 'Add label' })).toBeInTheDocument();
    await user.click(within(document.querySelector('.ui-modal') as HTMLElement).getByRole('button', { name: /cancel/i }));

    await user.click(screen.getByText('blog_api'));
    await user.click(screen.getByRole('button', { name: 'Update' }));

    const updateDialog = document.querySelector('.ui-modal') as HTMLElement;
    expect(within(updateDialog).queryByRole('button', { name: 'Add label' })).toBeNull();
  });

  // "every action is absent when the daemon is not a manager"
  it('offers no action when the daemon is not a manager', () => {
    renderPanel(
      <SwarmServicesPanel services={listing([service()])} loaded canManage={false} onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />,
    );

    expect(screen.queryByRole('button', { name: 'Create service' })).toBeNull();
  });

  // "Creating and updating never take a file: this panel composes a service from arguments"
  // (departure Three, REQ-83)
  it('composes a service from arguments: no file, no path, no compose editor', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmServicesPanel services={listing<SwarmService>([])} loaded canManage onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Create service' }));

    const dialog = document.querySelector('.ui-modal') as HTMLElement;
    expect(dialog.textContent).not.toMatch(/compose|docker-compose|stack file|\.ya?ml/i);
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
  });
});

describe('SwarmSecretsPanel (swarm/specs/swarm-secrets-panel.md)', () => {
  const noop = async () => undefined as never;

  // "per secret: the name and its age (18d ago), plus the stack it belongs to when it has one"
  it('states each secret with its name and its age', () => {
    renderPanel(<SwarmSecretsPanel secrets={listing([dataItem({ stack: 'blog' })])} loaded canManage onCreate={noop} onRemove={async () => undefined} />);

    expect(screen.getByText('Secrets')).toBeInTheDocument();
    expect(visibleText()).toContain('db_password');
    expect(visibleText()).toContain('18d ago');
    expect(visibleText()).toContain('blog');
  });

  // "Nothing in this panel ever shows a secret's value ... there is no reveal affordance, no copy
  // affordance and no request that could return it" (REQ-84)
  it('offers no reveal of a secret, on the listing or on an opened one', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmSecretsPanel secrets={listing([dataItem()])} loaded canManage onCreate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByText('db_password'));

    for (const label of [/show/i, /reveal/i, /value/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  // ...and what can be copied off an opened secret is its metadata, never anything that could be
  // the value (REQ-84).
  it('copies nothing but the metadata of an opened secret', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    renderPanel(<SwarmSecretsPanel secrets={listing([dataItem()])} loaded canManage onCreate={noop} onRemove={async () => undefined} />);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await user.click(screen.getByText('db_password'));
    for (const copy of screen.queryAllByRole('button', { name: /copy/i })) {
      await user.click(copy);
    }

    for (const [copied] of writeText.mock.calls) {
      expect(['sec-1', 'db_password']).toContain(copied);
    }
  });

  // "for the opened secret: its id, the stack, its creation and update times and its labels —
  // metadata, and only metadata, with a line saying the value cannot be read back"
  it('opens a secret on its metadata, saying the value cannot be read back', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmSecretsPanel secrets={listing([dataItem()])} loaded canManage onCreate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByText('db_password'));

    expect(visibleText()).toContain('sec-1');
    expect(visibleText()).toMatch(/never displayed|cannot be read|not read/i);
  });

  // "'New secret' -> a form asking for a name and a value; the value is entered in a masked field
  // with no reveal control and is dropped from the form the moment it closes"
  it('asks for the value in a masked field with no reveal control', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([])} loaded canManage onCreate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'New secret' }));

    const dialog = document.querySelector('.ui-modal') as HTMLElement;
    const value = within(dialog).getByLabelText(/value/i);
    expect(value).toHaveAttribute('type', 'password');
    expect(within(dialog).queryByRole('button', { name: /show|reveal/i })).toBeNull();
  });

  it('drops the value when the form closes, whichever way it closed', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([])} loaded canManage onCreate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'New secret' }));
    await user.type(within(document.querySelector('.ui-modal') as HTMLElement).getByLabelText(/value/i), 'typed-secret-value');
    await user.click(within(document.querySelector('.ui-modal') as HTMLElement).getByRole('button', { name: /cancel/i }));

    expect(visibleText()).not.toContain('typed-secret-value');
    expect(document.body.innerHTML).not.toContain('typed-secret-value');

    await user.click(screen.getByRole('button', { name: 'New secret' }));
    expect(within(document.querySelector('.ui-modal') as HTMLElement).getByLabelText(/value/i)).toHaveValue('');
  });

  // swarm-secrets-panel.md — "a form asking for a name, a value and optional labels"; "Labels are
  // offered at creation ... A row with an empty key is dropped."
  it('creates a secret with the labels typed, so it can be recognised as its creator\'s', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(dataItem());
    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([])} loaded canManage onCreate={onCreate} onRemove={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'New secret' }));
    const dialog = document.querySelector('.ui-modal') as HTMLElement;
    await user.type(within(dialog).getByLabelText(/secret name/i), 'db_password');
    await user.type(within(dialog).getByLabelText(/value/i), 'typed-secret-value');
    await addLabelRow(user, dialog, 1, 'vexel.test.run', '42');
    await addLabelRow(user, dialog, 2, '  ', 'dropped');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ name: 'db_password', labels: { 'vexel.test.run': '42' } });
    expect(Object.keys(onCreate.mock.calls[0]![0].labels)).toEqual(['vexel.test.run']);
  });

  it('clears the label rows when the form closes and again when it reopens', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([])} loaded canManage onCreate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'New secret' }));
    await addLabelRow(user, document.querySelector('.ui-modal') as HTMLElement, 1, 'left-behind', 'value');
    await user.click(within(document.querySelector('.ui-modal') as HTMLElement).getByRole('button', { name: /cancel/i }));

    await user.click(screen.getByRole('button', { name: 'New secret' }));
    const reopened = document.querySelector('.ui-modal') as HTMLElement;
    expect(within(labelsEditor(reopened)).queryByLabelText('Key 1')).toBeNull();
    expect(reopened.textContent).not.toContain('left-behind');
  });

  // "'Remove' -> asks the confirmation service, naming the secret and stating that a service still
  // using it keeps the daemon from removing it"
  it('confirms a secret removal, naming the secret and what would prevent it', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(undefined);
    renderPanel(<SwarmSecretsPanel secrets={listing([dataItem()])} loaded canManage onCreate={noop} onRemove={onRemove} />);

    await user.click(screen.getByText('db_password'));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    const dialog = confirmation();
    expect(dialog.textContent).toContain('db_password');
    expect(dialog.textContent).toMatch(/in use|still using|service/i);

    await user.click(within(dialog).getByRole('button', { name: /remove|confirm/i }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('sec-1'));
  });

  // "creation and removal are absent when the daemon is not a manager"
  it('offers neither creation nor removal when the daemon is not a manager', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmSecretsPanel secrets={listing([dataItem()])} loaded canManage={false} onCreate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByText('db_password'));

    expect(screen.queryByRole('button', { name: 'New secret' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('states the reason, the empty cluster or the pending read in place of a listing', () => {
    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([], REASON)} loaded canManage={false} onCreate={noop} onRemove={async () => undefined} />);
    expect(screen.getByText(REASON)).toBeInTheDocument();
    cleanup();

    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([])} loaded canManage onCreate={noop} onRemove={async () => undefined} />);
    expect(screen.getByText('No secrets')).toBeInTheDocument();
    cleanup();

    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([])} loaded={false} canManage onCreate={noop} onRemove={async () => undefined} />);
    expect(screen.getByText('Reading secrets…')).toBeInTheDocument();
  });
});

describe('SwarmConfigsStacksPanel (swarm/specs/swarm-configs-stacks-panel.md)', () => {
  const noop = async () => undefined as never;
  const removalResult = { removedServices: ['blog_api'], removedSecrets: [], removedConfigs: [], removedNetworks: ['blog_default'] };

  function renderConfigsStacks(overrides: {
    configs?: SwarmListing<SwarmDataItem>;
    stacks?: SwarmListing<SwarmStack>;
    loaded?: boolean;
    canManage?: boolean;
    onRemoveStack?: (name: string) => Promise<typeof removalResult>;
  } = {}) {
    renderPanel(
      <SwarmConfigsStacksPanel
        configs={overrides.configs ?? listing([dataItem({ kind: 'config', id: 'cfg-1', name: 'nginx_conf' })])}
        stacks={overrides.stacks ?? listing([stack()])}
        loaded={overrides.loaded ?? true}
        canManage={overrides.canManage ?? true}
        onCreateConfig={noop}
        onRemoveConfig={async () => undefined}
        onRemoveStack={overrides.onRemoveStack ?? (async () => removalResult)}
      />,
    );
  }

  // "one card titled 'Configs & stacks', holding two labelled groups ...: the configs first, the
  // stacks below them"; "per stack: the name and a line counting its services, secrets, configs and
  // networks"
  it('holds the configs and the stacks, each with what the daemon says of them', () => {
    renderConfigsStacks();

    expect(screen.getByText('Configs & stacks')).toBeInTheDocument();
    expect(visibleText()).toContain('nginx_conf');
    expect(visibleText()).toContain('blog');
    // The counting line names all four kinds of object the stack is made of.
    expect(visibleText()).toMatch(/service/i);
    expect(visibleText()).toMatch(/network/i);
  });

  // "for the opened stack: one row per service with its image, mode and running/desired replicas"
  it('opens a stack on the services that make it up', async () => {
    const user = userEvent.setup();
    renderConfigsStacks();

    await user.click(screen.getByText('blog'));

    expect(visibleText()).toContain('blog_api');
    expect(visibleText()).toContain('alpine:3.20');
    expect(visibleText()).toContain('2/3');
  });

  // "'Remove stack' -> asks the confirmation service, naming the stack and stating that its
  // services, secrets, configs and networks all go; on success it reports what was actually removed"
  it('confirms a stack removal, naming everything that goes, and reports what went', async () => {
    const user = userEvent.setup();
    const onRemoveStack = vi.fn().mockResolvedValue(removalResult);
    renderConfigsStacks({ onRemoveStack });

    await user.click(screen.getByText('blog'));
    await user.click(screen.getByRole('button', { name: 'Remove stack' }));

    const dialog = confirmation();
    expect(dialog.textContent).toContain('blog');
    for (const kind of [/service/i, /secret/i, /config/i, /network/i]) {
      expect(dialog.textContent).toMatch(kind);
    }

    await user.click(within(dialog).getByRole('button', { name: /remove|confirm/i }));

    await waitFor(() => expect(onRemoveStack).toHaveBeenCalledWith('blog'));
    await waitFor(() => expect(visibleText()).toMatch(/blog_api|1 service/i));
  });

  // "There is no deploy affordance, no compose-file path input and no compose editor anywhere in
  // this panel" (departure Three, REQ-83)
  it('offers no way to deploy a stack: no affordance, no path input, no compose editor', async () => {
    const user = userEvent.setup();
    renderConfigsStacks();

    await user.click(screen.getByText('blog'));

    expect(visibleText()).not.toMatch(/deploy|compose|\.ya?ml|stack file/i);
    expect(document.querySelector('input[type="file"]')).toBeNull();
    for (const label of [/deploy/i, /compose/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  // "'New config' -> a form asking for a name and the config's content, entered in a multi-line
  // editor"
  it('asks for a config name and its content in a multi-line editor, and never for a file', async () => {
    const user = userEvent.setup();
    renderConfigsStacks();

    await user.click(screen.getByRole('button', { name: 'New config' }));

    const dialog = document.querySelector('.ui-modal') as HTMLElement;
    expect(within(dialog).getByLabelText(/name/i)).toBeInTheDocument();
    expect(dialog.querySelector('textarea')).not.toBeNull();
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    expect(dialog.textContent).not.toMatch(/compose/i);
  });

  // swarm-configs-stacks-panel.md — "a form asking for a name, the config's content ... and optional
  // labels"; "Labels are offered at creation, as a key/value editor, for the same reason as on a
  // secret."
  it('creates a config with the labels typed', async () => {
    const user = userEvent.setup();
    const onCreateConfig = vi.fn().mockResolvedValue(dataItem({ kind: 'config' }));
    renderPanel(
      <SwarmConfigsStacksPanel
        configs={listing<SwarmDataItem>([])}
        stacks={listing<SwarmStack>([])}
        loaded
        canManage
        onCreateConfig={onCreateConfig}
        onRemoveConfig={async () => undefined}
        onRemoveStack={async () => removalResult}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'New config' }));
    const dialog = document.querySelector('.ui-modal') as HTMLElement;
    await user.type(within(dialog).getByLabelText(/config name/i), 'nginx_conf');
    await user.type(dialog.querySelector('textarea') as HTMLTextAreaElement, 'listen 80 default_server;');
    await addLabelRow(user, dialog, 1, 'vexel.test.run', '42');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onCreateConfig).toHaveBeenCalled());
    expect(onCreateConfig.mock.calls[0]![0]).toMatchObject({ name: 'nginx_conf', labels: { 'vexel.test.run': '42' } });
  });

  // "creation and removal are absent when the daemon is not a manager"
  it('offers neither creation nor removal when the daemon is not a manager', async () => {
    const user = userEvent.setup();
    renderConfigsStacks({ canManage: false });

    await user.click(screen.getByText('blog'));

    expect(screen.queryByRole('button', { name: 'New config' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove stack' })).toBeNull();
  });

  // "with nothing to show in a group: the reason the listing carries, 'No configs' / 'No stacks' on
  // a manager with none"
  it('states the reason, or that there is none, for each group on its own', () => {
    renderConfigsStacks({ configs: listing<SwarmDataItem>([]), stacks: listing<SwarmStack>([]) });

    expect(screen.getByText('No configs')).toBeInTheDocument();
    expect(screen.getByText('No stacks')).toBeInTheDocument();
    cleanup();

    renderConfigsStacks({ configs: listing<SwarmDataItem>([], REASON), stacks: listing<SwarmStack>([], REASON), canManage: false });
    expect(screen.getAllByText(REASON).length).toBeGreaterThan(0);
  });
});
