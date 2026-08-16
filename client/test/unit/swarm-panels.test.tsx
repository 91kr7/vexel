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

/** Adds one label row to the dialog's label editor and fills it in. */
async function addLabelRow(user: ReturnType<typeof userEvent.setup>, scope: HTMLElement, row: number, key: string, value: string) {
  await user.click(within(scope).getByRole('button', { name: 'Add label' }));
  if (key !== '') await user.type(within(scope).getByLabelText(`Labels Key ${row}`), key);
  if (value !== '') await user.type(within(scope).getByLabelText(`Labels Value ${row}`), value);
}

/**
 * The **first cell** of the object-list row a node is listed on, which is what a
 * selection is made on. Scoped to the list: the opened node's own panel states
 * the hostname again as a property, so a search over the whole document finds
 * two.
 */
function nodeRow(hostname: string): HTMLElement {
  const cell = [...document.querySelectorAll<HTMLElement>('.ui-data-table__row > .ui-data-table__cell:first-child')].find(
    (candidate) => (candidate.textContent ?? '').trim().startsWith(hostname),
  );
  if (!cell) throw new Error(`no row is listed for ${hostname}`);
  return cell;
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

  // swarm-nodes-panel.md — "one row per node ... with: the hostname (the node the application is
  // talking to marked 'this node'), the role as a badge reading 'leader' on the leader ..., the
  // availability as a badge ..., the status as a dot and the daemon's own word, and the daemon's
  // message about that node".
  it('states each node with its hostname, role, availability and status', () => {
    renderPanel(
      <SwarmNodesPanel nodes={listing([node()])}  onUpdate={noop} onRemove={async () => undefined} />,
    );

    expect(screen.getByText('Nodes')).toBeInTheDocument();
    const row = nodeRow('manager-alpha').closest('.ui-data-table__row') as HTMLElement;
    const rowText = (row.textContent ?? '').replace(/\s+/g, ' ');
    expect(rowText).toContain('manager-alpha');
    expect(rowText).toContain('this node');
    expect(rowText).toContain('leader');
    expect(rowText).toContain('active');
    expect(rowText).toContain('ready');
  });

  // "The engine version and the address are stated **in the panel and not in the row**: six columns
  // and their gaps resolve to 808px of the 854px a 1280×800 card offers ... The full value of
  // anything the row omits or truncates is in the panel."
  it('states the engine version and the address in the opened node’s panel, and not in its row', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmNodesPanel nodes={listing([node()])}  onUpdate={noop} onRemove={async () => undefined} />);

    const rowText = (nodeRow('manager-alpha').closest('.ui-data-table__row')!.textContent ?? '').replace(/\s+/g, ' ');
    expect(rowText, 'the engine version is a column of the row').not.toContain('27.0.3');
    expect(rowText, 'the address is a column of the row').not.toContain('10.0.0.7');

    await user.click(nodeRow('manager-alpha'));

    const panel = document.querySelector('.ui-detail-panel') as HTMLElement;
    expect(panel.textContent).toContain('27.0.3');
    expect(panel.textContent).toContain('10.0.0.7');
    expect(panel.textContent).toContain('node-1');
  });

  it('reads the role badge as manager or worker when the node is not the leader', () => {
    renderPanel(
      <SwarmNodesPanel
        nodes={listing([node({ id: 'w1', hostname: 'worker-beta', role: 'worker', leader: false, self: false, availability: 'drain' })])}
        onUpdate={noop}
        onRemove={async () => undefined}
      />,
    );

    expect(screen.getByText('worker')).toBeInTheDocument();
    expect(screen.getByText('drain')).toBeInTheDocument();
    expect(visibleText()).not.toContain('this node');
  });

  // swarm-nodes-panel.md — "with no node listed: the empty state's title, the reason the listing
  // carries where it carries one, and no action — nothing here adds a node to a cluster."
  it('states the reason the listing carries rather than showing an empty list', () => {
    renderPanel(<SwarmNodesPanel nodes={listing<SwarmNode>([], REASON)}  onUpdate={noop} onRemove={async () => undefined} />);

    expect(screen.getByText(REASON)).toBeInTheDocument();
  });

  it('says there are no nodes on a manager with an empty cluster, and offers no action', () => {
    renderPanel(<SwarmNodesPanel nodes={listing<SwarmNode>([])}  onUpdate={noop} onRemove={async () => undefined} />);

    expect(screen.getByText('No nodes')).toBeInTheDocument();
    const empty = document.querySelector('.ui-empty-state') as HTMLElement;
    expect(empty.querySelectorAll('button, [role="button"], a')).toHaveLength(0);
  });

  // "selecting a row -> reveals that node's detail panel"; "'Availability' (in the panel) -> the
  // same, for active / pause / drain", applied immediately
  it('applies a change of availability from the opened node’s panel', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(node({ availability: 'drain' }));
    renderPanel(<SwarmNodesPanel nodes={listing([node()])}  onUpdate={onUpdate} onRemove={async () => undefined} />);

    await user.click(nodeRow('manager-alpha'));
    const availability = screen.getByLabelText(/^Availability/);
    await user.selectOptions(availability, 'drain');

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('node-1', { availability: 'drain' }));
  });

  // "'Remove' (row) -> asks the confirmation service, naming the node and the consequence; only then
  // is the node removed. Removal is forced ... and the confirmation says so."
  it('confirms a node removal, names the node and the forced removal, and only then removes it', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(undefined);
    renderPanel(<SwarmNodesPanel nodes={listing([node()])}  onUpdate={noop} onRemove={onRemove} />);

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    const dialog = confirmation();
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('manager-alpha');
    expect(dialog.textContent).toMatch(/forc/i);
    expect(onRemove).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /remove|confirm/i }));

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('node-1', true));
  });

  // swarm-nodes-panel.md — "One detail is open at a time — the list's own guarantee, and
  // `DetailPanel`'s across the interface"; in the `opening-gesture` presentation the row that opened
  // the panel closes it and the panel offers no close control of its own.
  it('opens one node at a time, closed again by its own row, with no close control', async () => {
    const user = userEvent.setup();
    renderPanel(
      <SwarmNodesPanel
        nodes={listing([node(), node({ id: 'w1', hostname: 'worker-beta', role: 'worker', leader: false, self: false })])}
        onUpdate={noop}
        onRemove={async () => undefined}
      />,
    );

    await user.click(nodeRow('manager-alpha'));
    expect(document.querySelectorAll('.ui-detail-panel')).toHaveLength(1);
    expect(document.querySelectorAll('.ui-detail-panel [aria-label="Close detail"]')).toHaveLength(0);

    await user.click(nodeRow('worker-beta'));
    expect(document.querySelectorAll('.ui-detail-panel'), 'a second panel was opened beside the first').toHaveLength(1);

    await user.click(nodeRow('worker-beta'));
    expect(document.querySelectorAll('.ui-detail-panel'), 'the open node’s own row left it open').toHaveLength(0);
  });
});

describe('SwarmServicesPanel (swarm/specs/swarm-services-panel.md)', () => {
  const noop = async () => undefined as never;

  // "per service: the name, the stack it belongs to and its published ports as a monospace line, the
  // image, running/desired and a badge reading 'replicated' or 'global'"
  it('states each service with its image, replicas, ports and mode', () => {
    renderPanel(
      <SwarmServicesPanel services={listing([service()])}  onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />,
    );

    expect(screen.getByText('Services & tasks')).toBeInTheDocument();
    expect(visibleText()).toContain('blog_api');
    expect(visibleText()).toContain('alpine:3.20');
    expect(visibleText()).toContain('2/3');
    expect(screen.getByText('replicated')).toBeInTheDocument();
    expect(visibleText()).toContain('8080');
  });

  // swarm-services-panel.md — "with no service listed: the empty state's title, the line saying what
  // puts a service there, and the action that creates one — **withheld where the reading itself
  // states a reason**, which creating a service would not resolve."
  it('states the reason where the reading carries one, and offers to create a service only where it does not', () => {
    renderPanel(<SwarmServicesPanel services={listing<SwarmService>([], REASON)}  onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);
    expect(screen.getByText(REASON)).toBeInTheDocument();
    expect(
      (document.querySelector('.ui-empty-state') as HTMLElement).querySelectorAll('button, [role="button"], a'),
      'an action is offered beside a reason creating a service would not resolve',
    ).toHaveLength(0);
    cleanup();

    renderPanel(<SwarmServicesPanel services={listing<SwarmService>([])}  onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);
    expect(screen.getByText('No services')).toBeInTheDocument();
    expect(
      (document.querySelector('.ui-empty-state') as HTMLElement).querySelectorAll('button, [role="button"], a').length,
      'an empty cluster is stated without the action that resolves it',
    ).toBeGreaterThan(0);
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
    renderPanel(<SwarmServicesPanel services={listing([service()])}  onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);

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
    renderPanel(<SwarmServicesPanel services={listing([service()])}  onCreate={noop} onUpdate={noop} onRemove={onRemove} />);

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
    renderPanel(<SwarmServicesPanel services={listing<SwarmService>([])}  onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);

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
    renderPanel(<SwarmServicesPanel services={listing<SwarmService>([])}  onCreate={onCreate} onUpdate={noop} onRemove={async () => undefined} />);

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

  // swarm-services-panel.md — "The environment editor and the labels editor name their rows apart, so
  // the create dialog holds no two fields with the same accessible name; each keeps its own add action"
  it('announces the environment rows apart from the label rows in the create dialog', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmServicesPanel services={listing<SwarmService>([])}  onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Create service' }));
    const dialog = within(document.querySelector('.ui-modal') as HTMLElement);
    await user.click(dialog.getByRole('button', { name: 'Add variable' }));
    await user.click(dialog.getByRole('button', { name: 'Add label' }));

    for (const name of ['Environment Key 1', 'Environment Value 1', 'Labels Key 1', 'Labels Value 1']) {
      expect(dialog.getAllByRole('textbox', { name })).toHaveLength(1);
    }
    for (const name of ['Key 1', 'Value 1']) {
      expect(dialog.queryAllByRole('textbox', { name })).toHaveLength(0);
    }
    expect(dialog.getAllByRole('button', { name: 'Remove pair 1 from Environment' })).toHaveLength(1);
    expect(dialog.getAllByRole('button', { name: 'Remove pair 1 from Labels' })).toHaveLength(1);
  });

  // swarm-services-panel.md — "Labels are offered on creation only ... an update preserves the labels
  // the service already carries, so the field would have nothing to add there."
  it('offers the label editor when creating a service and not when updating one', async () => {
    const user = userEvent.setup();
    serviceDetailResult = { detail: { service: service(), env: [], labels: {}, tasks: [], raw: {} }, loaded: true, refresh: () => undefined };
    renderPanel(<SwarmServicesPanel services={listing([service()])}  onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'Create service' }));
    expect(within(document.querySelector('.ui-modal') as HTMLElement).getByRole('button', { name: 'Add label' })).toBeInTheDocument();
    await user.click(within(document.querySelector('.ui-modal') as HTMLElement).getByRole('button', { name: /cancel/i }));

    await user.click(screen.getByText('blog_api'));
    await user.click(screen.getByRole('button', { name: 'Update' }));

    const updateDialog = document.querySelector('.ui-modal') as HTMLElement;
    expect(within(updateDialog).queryByRole('button', { name: 'Add label' })).toBeNull();
  });

  // swarm-services-panel.md — "**A task is listed, not described.** The tasks of the opened service
  // are rows of the same object list the screen lists everything else with, rather than label/value
  // pairs in the property grid: a task has a state, a node and a message, which is a row and not a
  // property."
  it('lists the opened service’s tasks as rows of a nested list, not as property bands', async () => {
    const user = userEvent.setup();
    serviceDetailResult = {
      detail: {
        service: service(),
        env: [],
        labels: {},
        tasks: [
          { id: 'task-1', slot: 1, nodeId: 'node-1', nodeHostname: 'manager-alpha', state: 'running', desiredState: 'running' },
          { id: 'task-2', slot: 2, nodeId: 'w1', nodeHostname: 'worker-beta', state: 'running', desiredState: 'running' },
        ],
        raw: {},
      },
      loaded: true,
      refresh: () => undefined,
    };
    renderPanel(<SwarmServicesPanel services={listing([service()])}  onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByText('blog_api'));

    const panel = document.querySelector('.ui-detail-panel') as HTMLElement;
    expect(panel.querySelectorAll('.ui-data-table'), 'the tasks are not carried by a list of their own').toHaveLength(1);
    expect(panel.querySelectorAll('.ui-data-table .ui-data-table__row')).toHaveLength(2);
    // …and no band of the property grid is a task.
    const bandLabels = [...panel.querySelectorAll('.ui-definition-list__label')].map((label) => (label.textContent ?? '').trim());
    expect(bandLabels).not.toContain('Tasks');
  });

  // "Creating and updating never take a file: this panel composes a service from arguments"
  // (departure Three, REQ-83)
  it('composes a service from arguments: no file, no path, no compose editor', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmServicesPanel services={listing<SwarmService>([])}  onCreate={noop} onUpdate={noop} onRemove={async () => undefined} />);

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
    renderPanel(<SwarmSecretsPanel secrets={listing([dataItem({ stack: 'blog' })])}  onCreate={noop} onRemove={async () => undefined} />);

    expect(screen.getByText('Secrets')).toBeInTheDocument();
    expect(visibleText()).toContain('db_password');
    expect(visibleText()).toContain('18d ago');
    expect(visibleText()).toContain('blog');
  });

  // "Nothing in this panel ever shows a secret's value ... there is no reveal affordance and no
  // request that could return it" (REQ-84). The clause about a copy affordance went with the
  // affordance itself on 2026-08-14 (plan-docker_management_app-remove_copy_controls).
  it('offers no reveal of a secret, on the listing or on an opened one', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmSecretsPanel secrets={listing([dataItem()])}  onCreate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByText('db_password'));

    for (const label of [/show/i, /reveal/i, /value/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
  });

  // ...and what an opened secret puts on screen is its metadata, never anything that could be the
  // value (REQ-84). **Restated, not deleted**: this used to be checked by pressing every copy
  // control and reading what each one handed over, which is no longer a route off the panel — so the
  // same claim is now made of the markup itself, which is where the value would have to appear
  // first (plan-docker_management_app-remove_copy_controls/REQ-30).
  it('puts nothing but the metadata of an opened secret on screen, in its text or in any attribute', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmSecretsPanel secrets={listing([dataItem()])}  onCreate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByText('db_password'));

    // Everything the browser holds for the opened secret: its text and every attribute of every node.
    const markup = document.body.innerHTML;
    for (const metadata of ['sec-1', 'db_password']) expect(markup).toContain(metadata);
    // A `value` is what a secret's payload would be called wherever it leaked; none is rendered.
    expect(document.body.querySelectorAll('input, textarea')).toHaveLength(0);
    expect(markup).not.toMatch(/data-(secret|value)=/);
  });

  // "for the opened secret: its id, the stack, its creation and update times and its labels —
  // metadata, and only metadata, with a line saying the value cannot be read back"
  it('opens a secret on its metadata, saying the value cannot be read back', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmSecretsPanel secrets={listing([dataItem()])}  onCreate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByText('db_password'));

    expect(visibleText()).toContain('sec-1');
    expect(visibleText()).toMatch(/never displayed|cannot be read|not read/i);
  });

  // "'New secret' -> a form asking for a name and a value; the value is entered in a masked field
  // with no reveal control and is dropped from the form the moment it closes"
  it('asks for the value in a masked field with no reveal control', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([])}  onCreate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'New secret' }));

    const dialog = document.querySelector('.ui-modal') as HTMLElement;
    const value = within(dialog).getByLabelText(/value/i);
    expect(value).toHaveAttribute('type', 'password');
    expect(within(dialog).queryByRole('button', { name: /show|reveal/i })).toBeNull();
  });

  it('drops the value when the form closes, whichever way it closed', async () => {
    const user = userEvent.setup();
    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([])}  onCreate={noop} onRemove={async () => undefined} />);

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
    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([])}  onCreate={onCreate} onRemove={async () => undefined} />);

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
    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([])}  onCreate={noop} onRemove={async () => undefined} />);

    await user.click(screen.getByRole('button', { name: 'New secret' }));
    await addLabelRow(user, document.querySelector('.ui-modal') as HTMLElement, 1, 'left-behind', 'value');
    await user.click(within(document.querySelector('.ui-modal') as HTMLElement).getByRole('button', { name: /cancel/i }));

    await user.click(screen.getByRole('button', { name: 'New secret' }));
    const reopened = document.querySelector('.ui-modal') as HTMLElement;
    expect(within(reopened).queryByLabelText('Labels Key 1')).toBeNull();
    expect(reopened.textContent).not.toContain('left-behind');
  });

  // "'Remove' -> asks the confirmation service, naming the secret and stating that a service still
  // using it keeps the daemon from removing it"
  it('confirms a secret removal, naming the secret and what would prevent it', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(undefined);
    renderPanel(<SwarmSecretsPanel secrets={listing([dataItem()])}  onCreate={noop} onRemove={onRemove} />);

    await user.click(screen.getByText('db_password'));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    const dialog = confirmation();
    expect(dialog.textContent).toContain('db_password');
    expect(dialog.textContent).toMatch(/in use|still using|service/i);

    await user.click(within(dialog).getByRole('button', { name: /remove|confirm/i }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('sec-1'));
  });

  // swarm-secrets-panel.md — "with no secret listed: the empty state's title, the line saying what a
  // secret is and that it can never be read back, and the action that creates one — withheld where
  // the reading itself states a reason."
  it('states the reason where the reading carries one, and offers to create a secret only where it does not', () => {
    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([], REASON)}  onCreate={noop} onRemove={async () => undefined} />);
    expect(screen.getByText(REASON)).toBeInTheDocument();
    expect(
      (document.querySelector('.ui-empty-state') as HTMLElement).querySelectorAll('button, [role="button"], a'),
    ).toHaveLength(0);
    cleanup();

    renderPanel(<SwarmSecretsPanel secrets={listing<SwarmDataItem>([])}  onCreate={noop} onRemove={async () => undefined} />);
    expect(screen.getByText('No secrets')).toBeInTheDocument();
    expect(
      (document.querySelector('.ui-empty-state') as HTMLElement).querySelectorAll('button, [role="button"], a').length,
    ).toBeGreaterThan(0);
  });
});

describe('SwarmConfigsStacksPanel (swarm/specs/swarm-configs-stacks-panel.md)', () => {
  const noop = async () => undefined as never;
  const removalResult = { removedServices: ['blog_api'], removedSecrets: [], removedConfigs: [], removedNetworks: ['blog_default'] };

  function renderConfigsStacks(overrides: {
    configs?: SwarmListing<SwarmDataItem>;
    stacks?: SwarmListing<SwarmStack>;
    onRemoveStack?: (name: string) => Promise<typeof removalResult>;
  } = {}) {
    renderPanel(
      <SwarmConfigsStacksPanel
        configs={overrides.configs ?? listing([dataItem({ kind: 'config', id: 'cfg-1', name: 'nginx_conf' })])}
        stacks={overrides.stacks ?? listing([stack()])}
        onCreateConfig={noop}
        onRemoveConfig={async () => undefined}
        onRemoveStack={overrides.onRemoveStack ?? (async () => removalResult)}
      />,
    );
  }

  // swarm-configs-stacks-panel.md — "**two cards, one per inventory** — `Configs` then `Stacks`",
  // which is what repairs the alignment REQ-54 measures: the single card that held both had to label
  // its first list inside its own body.
  it('draws one card per inventory, each with what the daemon says of it', () => {
    renderConfigsStacks();

    expect(screen.getByRole('heading', { name: 'Configs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stacks' })).toBeInTheDocument();
    expect(screen.queryByText('Configs & stacks'), 'the single two-inventory card survives').toBeNull();
    expect(visibleText()).toContain('nginx_conf');
    expect(visibleText()).toContain('blog');
    // The counting columns name all four kinds of object the stack is made of.
    expect(visibleText()).toMatch(/service/i);
    expect(visibleText()).toMatch(/network/i);
  });

  // REQ-54 / swarm-configs-stacks-panel.md — "each carries one section header and starts its content
  // 0px under it". No sublabel is supplied anywhere on this screen: the arrangement that would have
  // needed one is gone.
  it('supplies no header sublabel and no inner label of its own', () => {
    renderConfigsStacks();

    expect(document.querySelectorAll('.ui-section-header__sublabel')).toHaveLength(0);
    // The eyebrow header that used to label the first list inside the card body is gone with it.
    expect(document.querySelectorAll('.ui-section-header--eyebrow')).toHaveLength(0);
  });

  // "a stack's services are carried by the row, not by a selection: ... a nested header-less list in
  // the row's own content" — so they are on screen with nothing selected at all — and that list
  // "takes no surface of its own: it is drawn inside the stacks list's card, indented under the row
  // it belongs to" (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-7`,
  // `REQ-20`, `REQ-40`).
  //
  // **Contract and state only** (that plan's REQ-31): the indentation itself, the row heights and
  // the group's closing hairline are every one of them zero in jsdom and are measured in a browser
  // by `e2e/classic-table-criteria-nested-lists.spec.ts`. What is asserted here is which props the
  // call site states and what the tree therefore holds.
  it('carries a stack’s services in the row itself, opened or not, on no surface of their own', () => {
    renderConfigsStacks();

    expect(document.querySelectorAll('.ui-detail-panel'), 'a stack was opened before anything was clicked').toHaveLength(0);
    const nested = document.querySelectorAll<HTMLElement>('.ui-data-table__row-content > .ui-data-table');
    expect(nested, 'a stack row carries no nested list of its services').toHaveLength(1);
    expect(nested[0].className, 'the stack’s services are not stated as a nested list of the same component').toContain(
      'ui-data-table--nested',
    );
    expect(nested[0].querySelectorAll('.ui-data-table__header'), 'the nested service list draws a header of its own').toHaveLength(0);
    expect(visibleText()).toContain('blog_api');
    expect(visibleText()).toContain('alpine:3.20');
    expect(visibleText()).toContain('2/3');

    // Neither list asks for the retired presentation, no row of either level states a modifier of
    // its own, and no surface is drawn inside either table.
    expect(document.querySelectorAll('.ui-data-table--comfortable'), 'a list on this panel still asks for the retired presentation').toHaveLength(0);
    expect(
      [...document.querySelectorAll('.ui-data-table__row')]
        .flatMap((row) => [...row.classList])
        .filter((name) => name !== 'ui-data-table__row' && name !== 'ui-data-table__row--selected'),
      'a row of either level states a modifier the reference row does not',
    ).toEqual([]);
    for (const table of document.querySelectorAll('.ui-data-table')) {
      expect(table.querySelectorAll('.ui-surface'), 'a surface is drawn inside one of these lists').toHaveLength(0);
    }

    // REQ-40 — each inventory's section header is **above** the one card holding its list, and that
    // card holds the table and nothing else.
    for (const title of ['Configs', 'Stacks']) {
      const heading = screen.getByRole('heading', { name: title });
      // The section this heading names: the innermost region holding both it and a list.
      let section: HTMLElement | null = heading.parentElement;
      while (section !== null && section.querySelector('.ui-data-table') === null) section = section.parentElement;
      expect(section, `the ${title} heading names no list at all`).not.toBeNull();
      const card = section!.querySelector('.ui-data-table')!.closest('.ui-surface');
      expect(card, `the ${title} list sits in no surface at all`).not.toBeNull();
      expect(card!.contains(heading), `the ${title} section header is inside its list’s own card`).toBe(false);
      expect(Array.from(card!.children).map((child) => child.className), `the ${title} card holds something besides its table`).toEqual([
        expect.stringContaining('ui-data-table'),
      ]);
    }
  });

  // "'Remove' on a stack -> asks the confirmation service, naming the stack and stating that its
  // services, secrets, configs and networks all go; on success it reports what was actually removed"
  it('confirms a stack removal, naming everything that goes, and reports what went', async () => {
    const user = userEvent.setup();
    const onRemoveStack = vi.fn().mockResolvedValue(removalResult);
    renderConfigsStacks({ stacks: listing([stack()]), configs: listing<SwarmDataItem>([]), onRemoveStack });

    await user.click(screen.getByRole('button', { name: 'Remove' }));

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

  // swarm-configs-stacks-panel.md — "for the stacks, the title, the line saying that a stack
  // deployed from a terminal appears here, and **no** action — nothing in this application deploys
  // one"; for the configs, the action that creates one, withheld where the reading states a reason.
  it('states each empty inventory on its own, the stacks with no action at all', () => {
    renderConfigsStacks({ configs: listing<SwarmDataItem>([]), stacks: listing<SwarmStack>([]) });

    expect(screen.getByText('No configs')).toBeInTheDocument();
    expect(screen.getByText('No stacks')).toBeInTheDocument();
    const [configs, stacks] = [...document.querySelectorAll<HTMLElement>('.ui-empty-state')];
    expect(configs!.querySelectorAll('button, [role="button"], a').length, 'the empty configs inventory offers no action').toBeGreaterThan(0);
    expect(stacks!.querySelectorAll('button, [role="button"], a'), 'the empty stacks inventory offers an action').toHaveLength(0);
    cleanup();

    renderConfigsStacks({ configs: listing<SwarmDataItem>([], REASON), stacks: listing<SwarmStack>([], REASON) });
    expect(screen.getAllByText(REASON).length).toBeGreaterThan(0);
  });
});
