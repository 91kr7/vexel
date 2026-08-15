import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SwarmListing, SwarmState, SwarmTokensReading } from '../../src/data/swarm-client';
import type { UseSwarmResult } from '../../src/data/use-swarm';

// The Swarm screen: the cluster's state with initialise / join / leave and its
// join tokens, above the inventories (swarm/specs/swarm-screen.md, REQ-79 to
// REQ-84). The hook is mocked, so the screen's own contract is what is under
// test — including the three states this machine cannot be in at once, outside a
// swarm, a manager and a worker.
//
// `plan-ui-coherence-optimisation/REQ-52`, `REQ-53` — the condition of the
// swarm is stated in exactly **one** place at any moment: the state bar where
// there is a state to qualify, the empty state where there is not, never both,
// and no panel states it at all. The two actions that resolve it are **inside**
// that statement. The assertions that used to require the opposite — a bar above
// four panels each repeating the reason — are replaced here rather than deleted:
// the behaviour they covered is the one the batch removes (batch 12, INT-7).
const readTokens = vi.fn();
const rotateToken = vi.fn();
const initialise = vi.fn();
const join = vi.fn();
const leave = vi.fn();
const refresh = vi.fn();

let swarm: UseSwarmResult;

vi.mock('../../src/data/use-swarm', () => ({
  useSwarm: () => swarm,
}));

vi.mock('../../src/data/use-swarm-service-detail', () => ({
  useSwarmServiceDetail: () => ({ loaded: false, refresh: () => undefined }),
}));

const { SwarmScreen } = await import('../../src/swarm/SwarmScreen');
const { ConfirmationProvider } = await import('../../src/shell/services/ConfirmationService');
const { ErrorReportingProvider } = await import('../../src/shell/services/ErrorReportingService');
const { ProgressProvider } = await import('../../src/shell/services/ProgressService');
const { ToastProvider } = await import('../../src/ui');

const INACTIVE_REASON = 'This daemon is not part of a swarm. Initialise a swarm or join an existing one to see its nodes, services, stacks, secrets and configs.';
const WORKER_REASON = 'This daemon is a swarm worker: only a manager can read the cluster.';
const WORKER_TOKEN = 'SWMTKN-1-worker-token-value-must-stay-hidden';
const MANAGER_TOKEN = 'SWMTKN-1-manager-token-value-must-stay-hidden';

function emptyListing<T>(unavailableReason?: string): SwarmListing<T> {
  return unavailableReason === undefined ? { items: [] } : { items: [], unavailableReason };
}

function inactiveState(): SwarmState {
  return {
    role: 'inactive',
    localNodeState: 'inactive',
    manager: false,
    raft: { status: 'unknown', detail: 'Raft health is only visible from a swarm manager.' },
    unavailableReason: INACTIVE_REASON,
  };
}

function managerState(overrides: Partial<SwarmState> = {}): SwarmState {
  return {
    role: 'manager',
    localNodeState: 'active',
    manager: true,
    clusterId: 'cluster-9pk2x',
    nodeId: 'node-1',
    nodeCount: 3,
    managerCount: 1,
    raft: { status: 'healthy', detail: '1 manager, quorum held' },
    ...overrides,
  };
}

function workerState(): SwarmState {
  return {
    role: 'worker',
    localNodeState: 'active',
    manager: false,
    raft: { status: 'unknown', detail: 'Raft health is only visible from a swarm manager.' },
    unavailableReason: WORKER_REASON,
  };
}

function swarmResult(state: SwarmState | undefined, reason?: string): UseSwarmResult {
  return {
    state,
    nodes: emptyListing(reason),
    services: emptyListing(reason),
    stacks: emptyListing(reason),
    secrets: emptyListing(reason),
    configs: emptyListing(reason),
    loaded: true,
    refresh,
    initialise,
    join,
    leave,
    readTokens,
    rotateToken,
    updateNode: vi.fn(),
    removeNode: vi.fn(),
    createService: vi.fn(),
    updateService: vi.fn(),
    removeService: vi.fn(),
    removeStack: vi.fn(),
    createData: vi.fn(),
    removeData: vi.fn(),
  } as unknown as UseSwarmResult;
}

function renderScreen() {
  render(
    <ErrorReportingProvider>
      <ProgressProvider>
        <ConfirmationProvider>
          <ToastProvider>
            <SwarmScreen />
          </ToastProvider>
        </ConfirmationProvider>
      </ProgressProvider>
    </ErrorReportingProvider>,
  );
}

/** The dialog currently open, whichever one it is. */
function openDialog(): HTMLElement {
  return document.querySelector('.ui-modal') as HTMLElement;
}

/** Everything the operator can read on the screen. */
function visibleText(): string {
  return document.body.textContent ?? '';
}

beforeEach(() => {
  for (const mock of [readTokens, rotateToken, initialise, join, leave, refresh]) mock.mockReset();
  readTokens.mockResolvedValue({ tokens: { worker: WORKER_TOKEN, manager: MANAGER_TOKEN } } as SwarmTokensReading);
  swarm = swarmResult(inactiveState(), INACTIVE_REASON);
});

afterEach(cleanup);

/**
 * Every element on screen stating, in its own words, that there is no cluster to
 * read — the count swarm-screen.md pins at **12 on the delivered build and 1
 * after** for a daemon outside a swarm.
 */
function statementsOfTheCondition(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('*')].filter(
    (element) =>
      element.children.length === 0 &&
      /not part of a swarm|not a manager|only a manager|no cluster to read/i.test((element.textContent ?? '').trim()),
  );
}

describe('SwarmScreen — the one statement of the condition (REQ-52, REQ-53)', () => {
  // swarm-screen.md — "where there is no cluster to read, **exactly one statement of why, on one
  // surface** — the empty state, with the two actions that resolve it *inside* it"; and "The state
  // bar is not drawn outside a swarm. It exists to qualify a state with facts; a daemon that is not
  // in a swarm has none to qualify."
  it('states the condition once, on the empty state, and draws no state bar to repeat it', () => {
    renderScreen();

    expect(document.querySelectorAll('.ui-empty-state')).toHaveLength(1);
    expect(document.querySelectorAll('.ui-state-summary-bar')).toHaveLength(0);
    expect(screen.getByText('This daemon is not part of a swarm')).toBeInTheDocument();
    expect(statementsOfTheCondition()).toHaveLength(1);
  });

  // REQ-53 — "`Initialise a swarm` and `Join an existing one` belong to the empty state that
  // explains the condition, not to a banner above four empty states that repeat it."
  it('carries both resolving actions inside the statement itself', () => {
    renderScreen();

    const statement = document.querySelector('.ui-empty-state') as HTMLElement;
    const initialiseAction = screen.getByRole('button', { name: 'Initialise a swarm' });
    const joinAction = screen.getByRole('button', { name: 'Join an existing one' });

    expect(statement.contains(initialiseAction), 'Initialise a swarm sits outside the statement of the condition').toBe(true);
    expect(statement.contains(joinAction), 'Join an existing one sits outside the statement of the condition').toBe(true);
  });

  // REQ-52 — "**No panel states it at all** — the panels are rendered only where there is a cluster
  // to read". Outside a swarm the screen holds the statement and nothing else.
  it('draws no inventory panel at all where there is no cluster to read', () => {
    renderScreen();

    for (const title of ['Nodes', 'Services & tasks', 'Secrets', 'Configs', 'Stacks']) {
      expect(screen.queryByRole('heading', { name: title }), `the ${title} panel is drawn outside a swarm`).toBeNull();
    }
    expect(document.querySelectorAll('.ui-data-table')).toHaveLength(0);
  });

  // swarm-screen.md — "before the first reading settles: 'Reading the swarm state…', alone."
  it('states the pending read alone, before the first reading settles', () => {
    swarm = { ...swarmResult(undefined), loaded: false } as UseSwarmResult;

    renderScreen();

    expect(screen.getByText('Reading the swarm state…')).toBeInTheDocument();
    expect(document.querySelectorAll('.ui-empty-state')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Initialise a swarm' })).toBeNull();
  });

  // swarm-screen.md — "on a manager, the five inventories in this order, each in a card of its own",
  // and the condition stated nowhere, the bar having a state to qualify instead.
  it('draws the five inventories on a manager, and states no condition beside them', () => {
    swarm = swarmResult(managerState());

    renderScreen();

    for (const title of ['Nodes', 'Services & tasks', 'Secrets', 'Configs', 'Stacks']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(statementsOfTheCondition()).toEqual([]);
  });
});

describe('SwarmScreen — the state bar (swarm/specs/swarm-screen.md)', () => {
  // "the token action is offered on a manager only"; "in a swarm: 'Leave swarm'"
  it('offers neither the join tokens nor leaving when the daemon is in no swarm', () => {
    renderScreen();

    expect(screen.queryByRole('button', { name: 'Join tokens' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Leave swarm' })).toBeNull();
  });

  // "on a manager: the role, the cluster id, the node count and the raft health"
  it('states the role, the cluster id, the node count and the raft health on a manager', () => {
    swarm = swarmResult(managerState());

    renderScreen();

    expect(screen.getByText('Swarm active')).toBeInTheDocument();
    // The cluster id identifies the cluster: the bar may shorten it, as the
    // application shortens every long identifier, but what it shows is that id.
    const shownClusterId = (visibleText().match(/cluster id (\S+)/) ?? [])[1] ?? '';
    expect(shownClusterId.length).toBeGreaterThanOrEqual(8);
    expect(managerState().clusterId!.startsWith(shownClusterId)).toBe(true);
    expect(visibleText()).toContain('manager');
    expect(visibleText()).toMatch(/3 nodes|nodes 3|3 node/i);
    expect(visibleText()).toMatch(/healthy/i);
    expect(screen.getByRole('button', { name: 'Join tokens' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave swarm' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Initialise a swarm' })).toBeNull();
  });

  // swarm-screen.md — "in a swarm but not on a manager ...: 'No cluster to read from here' with the
  // daemon's **own** reason where it gave one, and **no** action — nothing on this screen promotes a
  // node." Stated once, beside the bar that qualifies the state the daemon *is* in.
  it('states a worker’s condition once, in the daemon’s own words, and offers no action to resolve it', () => {
    swarm = swarmResult(workerState(), WORKER_REASON);

    renderScreen();

    expect(screen.getByText('No cluster to read from here')).toBeInTheDocument();
    expect(screen.getByText(WORKER_REASON)).toBeInTheDocument();
    expect(document.querySelectorAll('.ui-empty-state')).toHaveLength(1);
    // One surface, so the daemon's own sentence is part of the one statement rather than a second
    // one: nothing outside the empty state says the same thing again.
    const statement = document.querySelector('.ui-empty-state') as HTMLElement;
    expect(
      statementsOfTheCondition().filter((element) => !statement.contains(element)),
      'a worker’s condition is stated somewhere besides the one surface',
    ).toEqual([]);
    // Nothing on this screen promotes a node, so the statement carries no action at all.
    expect(statement.querySelectorAll('button, [role="button"], a')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Join tokens' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Leave swarm' })).toBeInTheDocument();
  });

  // "the tone is green for a healthy swarm and amber for a degraded raft or a pending / locked /
  // errored state". The neutral case the delivered build drew outside a swarm is gone with the bar
  // itself, which is no longer drawn where there is no state to qualify.
  it('colours the state dot green when healthy and amber when degraded', () => {
    const toneOf = () => (document.querySelector('.ui-table-status-dot') as HTMLElement).className;

    swarm = swarmResult(managerState());
    renderScreen();
    expect(toneOf()).toMatch(/tone-success/);
    cleanup();

    swarm = swarmResult(managerState({ raft: { status: 'degraded', detail: 'no leader among 3 managers' } }));
    renderScreen();
    expect(toneOf()).toMatch(/tone-warning/);
  });

  // "a failed read of the cluster (an unreachable daemon) as an error banner with a retry, above the
  // panels"
  it('reports a failed read as an error banner with a retry', async () => {
    const user = userEvent.setup();
    swarm = { ...swarmResult(undefined), error: 'Cannot connect to the Docker daemon' } as UseSwarmResult;

    renderScreen();

    expect(visibleText()).toContain('Cannot connect to the Docker daemon');
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refresh).toHaveBeenCalled();
  });

});

describe('SwarmScreen — initialise and join (swarm/specs/swarm-screen.md)', () => {
  // "'Initialise swarm' -> a form with an optional advertise address"
  it('initialises a swarm from a form asking only for an optional advertise address', async () => {
    const user = userEvent.setup();
    initialise.mockResolvedValue(managerState());
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Initialise a swarm' }));
    const dialog = openDialog();
    await user.type(within(dialog).getByLabelText(/advertise/i), '10.0.0.9');
    await user.click(within(dialog).getByRole('button', { name: /initialise/i }));

    await waitFor(() => expect(initialise).toHaveBeenCalledWith(expect.objectContaining({ advertiseAddr: '10.0.0.9' })));
  });

  // "'Join swarm' -> a form with the manager addresses, the join token (entered masked, never
  // displayed back) and an optional advertise address" (REQ-80)
  it('asks for the join token in a masked field with no reveal control', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Join an existing one' }));

    const dialog = openDialog();
    const token = within(dialog).getByLabelText(/token/i);
    expect(token).toHaveAttribute('type', 'password');
    expect(within(dialog).queryByRole('button', { name: /show|reveal/i })).toBeNull();
    expect(within(dialog).getByLabelText(/manager address/i)).toBeInTheDocument();
  });

  // "The token typed to join a swarm ... is dropped when the form closes."
  it('drops the typed join token when the form closes', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Join an existing one' }));
    await user.type(within(openDialog()).getByLabelText(/token/i), 'SWMTKN-1-typed-by-hand');
    await user.click(within(openDialog()).getByRole('button', { name: /cancel/i }));

    expect(document.body.innerHTML).not.toContain('SWMTKN-1-typed-by-hand');

    await user.click(screen.getByRole('button', { name: 'Join an existing one' }));
    expect(within(openDialog()).getByLabelText(/token/i)).toHaveValue('');
  });
});

describe('SwarmScreen — the join tokens (swarm/specs/swarm-screen.md, REQ-80)', () => {
  beforeEach(() => {
    swarm = swarmResult(managerState());
  });

  // "'Join tokens' -> a dialog showing the worker and manager tokens, each hidden until asked for
  // ... the tokens are read when the dialog opens"
  it('reads the tokens when the dialog opens and shows neither until it is asked to', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Join tokens' }));

    await waitFor(() => expect(readTokens).toHaveBeenCalledTimes(1));
    expect(document.body.innerHTML).not.toContain(WORKER_TOKEN);
    expect(document.body.innerHTML).not.toContain(MANAGER_TOKEN);
  });

  it('shows a token only after an explicit reveal', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Join tokens' }));
    await waitFor(() => expect(readTokens).toHaveBeenCalled());
    const [firstReveal] = await within(openDialog()).findAllByRole('button', { name: 'Show' });
    await user.click(firstReveal!);

    await waitFor(() => expect(document.body.textContent).toContain(WORKER_TOKEN));
    // Revealing one token does not reveal the other.
    expect(document.body.textContent).not.toContain(MANAGER_TOKEN);
  });

  // "the tokens are ... dropped when it closes"
  it('holds no token once the dialog is closed, and starts hidden again when reopened', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Join tokens' }));
    await waitFor(() => expect(readTokens).toHaveBeenCalled());
    const [firstReveal] = await within(openDialog()).findAllByRole('button', { name: 'Show' });
    await user.click(firstReveal!);
    await waitFor(() => expect(document.body.textContent).toContain(WORKER_TOKEN));

    await user.click(within(openDialog()).getAllByRole('button', { name: /close|cancel|done/i })[0]!);

    expect(document.body.innerHTML).not.toContain(WORKER_TOKEN);

    await user.click(screen.getByRole('button', { name: 'Join tokens' }));
    await waitFor(() => expect(readTokens).toHaveBeenCalledTimes(2));
    expect(document.body.innerHTML).not.toContain(WORKER_TOKEN);
  });

  // "each rotatable on the spot"; the rotation names its consequence and says the previous token no
  // longer joins
  it('rotates a token on the spot and says the previous one no longer joins', async () => {
    const user = userEvent.setup();
    rotateToken.mockResolvedValue({ tokens: { worker: 'SWMTKN-1-rotated-worker', manager: MANAGER_TOKEN } } as SwarmTokensReading);
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Join tokens' }));
    await waitFor(() => expect(readTokens).toHaveBeenCalled());
    const [rotate] = await within(openDialog()).findAllByRole('button', { name: /rotate/i });
    await user.click(rotate!);

    await waitFor(() => expect(rotateToken).toHaveBeenCalledWith('worker'));
    await waitFor(() => expect(visibleText()).toMatch(/no longer|previous token/i));
  });
});

describe('SwarmScreen — leaving, and what the screen must not offer', () => {
  // "'Leave swarm' -> asks the confirmation service, naming the consequence (the node stops being
  // part of the cluster; a last manager needs the forced leave, which the confirmation states)"
  it('confirms leaving the swarm, naming the consequence and the forced leave', async () => {
    const user = userEvent.setup();
    swarm = swarmResult(managerState());
    leave.mockResolvedValue(inactiveState());
    renderScreen();

    await user.click(screen.getByRole('button', { name: 'Leave swarm' }));

    const dialog = openDialog();
    expect(dialog.textContent).toMatch(/cluster/i);
    expect(dialog.textContent).toMatch(/forc/i);
    expect(leave).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /leave|confirm/i }));
    await waitFor(() => expect(leave).toHaveBeenCalled());
  });

  // "The screen offers no deploy affordance, no compose-file path input and no compose editor"
  // (departure Three, REQ-83)
  it('offers nothing that would deploy a stack', () => {
    swarm = swarmResult(managerState());

    renderScreen();

    // Nothing on the screen offers to deploy: no action, no file to pick, no
    // path to type, no editor to paste a compose file into. (The panel may
    // *say* a stack deployed from a terminal appears here — that states the
    // departure, it does not offer it.)
    for (const label of [/deploy/i, /compose/i, /upload/i]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
    expect(visibleText()).not.toMatch(/compose|\.ya?ml|stack file/i);
    expect(visibleText()).not.toMatch(/deploy (a )?stack|deploy from/i);
  });
});
