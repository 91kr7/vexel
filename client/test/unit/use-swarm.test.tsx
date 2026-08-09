import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { SwarmDataItem, SwarmListing, SwarmNode, SwarmService, SwarmStack, SwarmState } from '../../src/data/swarm-client';

// The whole swarm reading of the active daemon, kept current as one round
// (swarm/specs/use-swarm.md, REQ-79 to REQ-84). The data client is mocked, so
// what is under test is the hook's own decisions — and so that no token and no
// secret value this file passes in can reach anything but the mock.
const fetchSwarmState = vi.fn();
const fetchSwarmNodes = vi.fn();
const fetchSwarmServices = vi.fn();
const fetchSwarmStacks = vi.fn();
const fetchSwarmData = vi.fn();
const fetchJoinTokens = vi.fn();
const rotateJoinToken = vi.fn();
const initialiseSwarm = vi.fn();
const joinSwarm = vi.fn();
const leaveSwarm = vi.fn();
const updateSwarmNode = vi.fn();
const removeSwarmNode = vi.fn();
const createSwarmService = vi.fn();
const updateSwarmService = vi.fn();
const removeSwarmService = vi.fn();
const removeSwarmStack = vi.fn();
const createSwarmData = vi.fn();
const removeSwarmData = vi.fn();

vi.mock('../../src/data/swarm-client', () => ({
  fetchSwarmState: () => fetchSwarmState(),
  fetchSwarmNodes: () => fetchSwarmNodes(),
  fetchSwarmServices: () => fetchSwarmServices(),
  fetchSwarmStacks: () => fetchSwarmStacks(),
  fetchSwarmData: (kind: string) => fetchSwarmData(kind),
  fetchJoinTokens: () => fetchJoinTokens(),
  rotateJoinToken: (target: string) => rotateJoinToken(target),
  initialiseSwarm: (input: unknown) => initialiseSwarm(input),
  joinSwarm: (input: unknown) => joinSwarm(input),
  leaveSwarm: (force: boolean) => leaveSwarm(force),
  updateSwarmNode: (id: string, input: unknown) => updateSwarmNode(id, input),
  removeSwarmNode: (id: string, force: boolean) => removeSwarmNode(id, force),
  createSwarmService: (input: unknown) => createSwarmService(input),
  updateSwarmService: (id: string, input: unknown) => updateSwarmService(id, input),
  removeSwarmService: (id: string) => removeSwarmService(id),
  removeSwarmStack: (name: string) => removeSwarmStack(name),
  createSwarmData: (kind: string, input: unknown) => createSwarmData(kind, input),
  removeSwarmData: (kind: string, id: string) => removeSwarmData(kind, id),
}));

// Stands in for the browser's EventSource: the daemon event stream is the
// hook's push channel, so the tests drive it by emitting on the instance the
// event-stream module opened.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((message: { data: string }) => void) | null = null;
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener() {}

  close() {
    this.closed = true;
  }

  emitDaemonEvent(type: string, action: string) {
    this.onmessage?.({
      data: JSON.stringify({ id: `${type}-${action}-${Math.random()}`, timestamp: '2026-08-09T10:00:00.000Z', type, action }),
    });
  }
}

function daemonStream(): FakeEventSource {
  return FakeEventSource.instances[0]!;
}

const { useSwarm } = await import('../../src/data/use-swarm');
const { notifyActiveContextChanged } = await import('../../src/data/active-context');

const INACTIVE_REASON = 'This daemon is not part of a swarm. Initialise a swarm or join an existing one.';

function inactiveState(): SwarmState {
  return {
    role: 'inactive',
    localNodeState: 'inactive',
    manager: false,
    raft: { status: 'unknown', detail: 'Raft health is only visible from a swarm manager.' },
    unavailableReason: INACTIVE_REASON,
  };
}

function degraded<T>(): SwarmListing<T> {
  return { items: [], unavailableReason: INACTIVE_REASON };
}

/** Every reading answers as a daemon outside a swarm would: settled, empty, with the reason. */
function resolveAllDegraded(): void {
  fetchSwarmState.mockResolvedValue(inactiveState());
  fetchSwarmNodes.mockResolvedValue(degraded<SwarmNode>());
  fetchSwarmServices.mockResolvedValue(degraded<SwarmService>());
  fetchSwarmStacks.mockResolvedValue(degraded<SwarmStack>());
  fetchSwarmData.mockResolvedValue(degraded<SwarmDataItem>());
}

/** What the hook exposes, minus its functions — everything it *holds*. */
function heldState(result: unknown): string {
  return JSON.stringify(result, (_key, value) => (typeof value === 'function' ? undefined : value));
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
  for (const mock of [
    fetchSwarmState,
    fetchSwarmNodes,
    fetchSwarmServices,
    fetchSwarmStacks,
    fetchSwarmData,
    fetchJoinTokens,
    rotateJoinToken,
    initialiseSwarm,
    joinSwarm,
    leaveSwarm,
    updateSwarmNode,
    removeSwarmNode,
    createSwarmService,
    updateSwarmService,
    removeSwarmService,
    removeSwarmStack,
    createSwarmData,
    removeSwarmData,
  ]) {
    mock.mockReset();
  }
  resolveAllDegraded();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useSwarm (swarm/specs/use-swarm.md)', () => {
  // "The five listings and the state are read as one round"; "loaded — true once the first read has
  // settled"
  it('reads the state and all five listings as one round, then marks itself loaded', async () => {
    const { result } = renderHook(() => useSwarm());

    expect(result.current.loaded).toBe(false);
    expect(result.current.state).toBeUndefined();

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchSwarmState).toHaveBeenCalledTimes(1);
    expect(fetchSwarmNodes).toHaveBeenCalledTimes(1);
    expect(fetchSwarmServices).toHaveBeenCalledTimes(1);
    expect(fetchSwarmStacks).toHaveBeenCalledTimes(1);
    expect(fetchSwarmData).toHaveBeenCalledWith('secret');
    expect(fetchSwarmData).toHaveBeenCalledWith('config');
  });

  // "A daemon outside a swarm is a normal, successful reading — error stays empty and each listing
  // carries its reason."
  it('treats a daemon outside a swarm as a settled reading, not a failure', async () => {
    const { result } = renderHook(() => useSwarm());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBeUndefined();
    expect(result.current.state?.role).toBe('inactive');
    for (const listing of [result.current.nodes, result.current.services, result.current.stacks, result.current.secrets, result.current.configs]) {
      expect(listing.items).toEqual([]);
      expect(listing.unavailableReason).toBe(INACTIVE_REASON);
    }
  });

  // "error? — the message of the last failed read (the daemon being unreachable ...); cleared by the
  // next successful one"; "loaded — ... whether it succeeded or not"
  it('reports an unreachable daemon, stays loaded, and clears the failure on the next read', async () => {
    fetchSwarmState.mockRejectedValueOnce(new Error('Cannot connect to the Docker daemon'));
    const { result } = renderHook(() => useSwarm());

    await waitFor(() => expect(result.current.error).toBe('Cannot connect to the Docker daemon'));
    expect(result.current.loaded).toBe(true);

    resolveAllDegraded();
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
  });

  // "An answer that is not the shape it promises is a failed read: a listing without an items
  // array ... is reported through error and never stored"; "One malformed answer fails the whole
  // round rather than storing a half of it: the panels stay on the last reading they agreed on."
  it('fails the whole round on a listing that is not a listing, keeping the last agreed reading', async () => {
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.nodes.unavailableReason).toBe(INACTIVE_REASON);

    // One malformed answer, everything else fine — and one of the fine ones carries new content.
    fetchSwarmNodes.mockResolvedValue({ error: 'not a listing at all' } as unknown as SwarmListing<SwarmNode>);
    fetchSwarmServices.mockResolvedValue({ items: [{ id: 'svc-1', name: 'blog_api' }] } as unknown as SwarmListing<SwarmService>);
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(Array.isArray(result.current.nodes.items)).toBe(true);
    expect(result.current.nodes.unavailableReason).toBe(INACTIVE_REASON);
    expect(result.current.services.items).toEqual([]);
    expect(result.current.services.unavailableReason).toBe(INACTIVE_REASON);
  });

  // "...or a state without a role and a raft reading"
  it('fails the round on a state that is not a state', async () => {
    fetchSwarmState.mockResolvedValue({ localNodeState: 'active' } as unknown as SwarmState);

    const { result } = renderHook(() => useSwarm());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBeTruthy();
    expect(result.current.state).toBeUndefined();
    for (const listing of [result.current.nodes, result.current.services, result.current.secrets]) {
      expect(listing.items).toEqual([]);
    }
  });

  it('clears the failure and stores the reading again once the answers are well-formed', async () => {
    fetchSwarmNodes.mockResolvedValue({ items: undefined } as unknown as SwarmListing<SwarmNode>);
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.error).toBeTruthy());

    resolveAllDegraded();
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
    expect(result.current.nodes.unavailableReason).toBe(INACTIVE_REASON);
  });

  // "refresh() — re-reads state and all five listings together"
  it('re-reads everything on refresh', async () => {
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.refresh());

    await waitFor(() => expect(fetchSwarmState).toHaveBeenCalledTimes(2));
    expect(fetchSwarmNodes).toHaveBeenCalledTimes(2);
    expect(fetchSwarmData).toHaveBeenCalledTimes(4);
  });

  // "It re-reads on every daemon event of a swarm-related object (node, service, secret, config)"
  it.each(['node', 'service', 'secret', 'config'])('re-reads when a %s daemon event arrives', async (type) => {
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => daemonStream().emitDaemonEvent(type, 'create'));

    await waitFor(() => expect(fetchSwarmState).toHaveBeenCalledTimes(2));
  });

  it('ignores a daemon event about an object this screen does not show', async () => {
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      daemonStream().emitDaemonEvent('container', 'start');
      daemonStream().emitDaemonEvent('image', 'pull');
      daemonStream().emitDaemonEvent('volume', 'create');
    });

    await Promise.resolve();
    expect(fetchSwarmState).toHaveBeenCalledTimes(1);
  });

  // "on the active-context broadcast (another context is another daemon, REQ-93)"
  it('re-reads when another context becomes active', async () => {
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => notifyActiveContextChanged());

    await waitFor(() => expect(fetchSwarmState).toHaveBeenCalledTimes(2));
  });

  // "and on a bounded poll — the poll being the only way to notice a docker swarm init or join run
  // from a terminal, which emits no event"
  it('re-reads on its own, without any event, so a swarm created from a terminal is noticed', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSwarm());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.loaded).toBe(true);
    const readsAfterMount = fetchSwarmState.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchSwarmState.mock.calls.length).toBeGreaterThan(readsAfterMount);
  });

  // "readTokens(): Promise<SwarmTokensReading> — reads the join tokens on demand; the result is
  // handed to the caller and not stored by the hook" (REQ-80)
  it('hands a join token to the caller and keeps it nowhere', async () => {
    const token = 'SWMTKN-1-worker-token-that-must-not-be-held';
    fetchJoinTokens.mockResolvedValue({ tokens: { worker: token, manager: `${token}-manager` } });
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let reading: unknown;
    await act(async () => {
      reading = await result.current.readTokens();
    });

    expect((reading as { tokens?: { worker: string } }).tokens?.worker).toBe(token);
    expect(heldState(result.current)).not.toContain(token);
  });

  // "rotateToken(target): Promise<SwarmTokensReading> — rotates one token and answers with both"
  it('rotates a token, answers with both, and holds neither', async () => {
    rotateJoinToken.mockResolvedValue({ tokens: { worker: 'SWMTKN-1-new-worker', manager: 'SWMTKN-1-manager' } });
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    let reading: { tokens?: { worker: string; manager: string } } | undefined;
    await act(async () => {
      reading = await result.current.rotateToken('worker');
    });

    expect(rotateJoinToken).toHaveBeenCalledWith('worker');
    expect(reading!.tokens).toEqual({ worker: 'SWMTKN-1-new-worker', manager: 'SWMTKN-1-manager' });
    expect(heldState(result.current)).not.toContain('SWMTKN-1-new-worker');
  });

  // "No ... secret value is ever held in this hook's state: ... a created secret's value is a call
  // argument only" (REQ-84)
  it('passes a secret value straight through to the client and keeps it nowhere', async () => {
    const value = 'a-secret-value-that-must-not-survive';
    createSwarmData.mockResolvedValue({ kind: 'secret', id: 's1', name: 'db_password', createdAt: '', version: 1, labels: {} });
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.createData('secret', { name: 'db_password', value });
    });

    expect(createSwarmData).toHaveBeenCalledWith('secret', { name: 'db_password', value });
    expect(heldState(result.current)).not.toContain(value);
  });

  // "each performs the change, then refreshes"
  it('refreshes the whole reading after a mutation', async () => {
    updateSwarmNode.mockResolvedValue({ id: 'n1', availability: 'drain' });
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.updateNode('n1', { availability: 'drain' });
    });

    expect(updateSwarmNode).toHaveBeenCalledWith('n1', { availability: 'drain' });
    await waitFor(() => expect(fetchSwarmState).toHaveBeenCalledTimes(2));
  });

  // "each rejects with the server's message"
  it("rejects a refused mutation with the server's own message", async () => {
    removeSwarmService.mockRejectedValue(new Error('This node is not a swarm manager.'));
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await expect(result.current.removeService('svc-1')).rejects.toThrow('This node is not a swarm manager.');
  });

  // "initialise(input), join(input), leave(force) -> the resulting state, then a refresh"
  it('initialises, joins and leaves through the client, refreshing each time', async () => {
    initialiseSwarm.mockResolvedValue(inactiveState());
    joinSwarm.mockResolvedValue(inactiveState());
    leaveSwarm.mockResolvedValue(inactiveState());
    const { result } = renderHook(() => useSwarm());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    await act(async () => {
      await result.current.initialise({ advertiseAddr: '10.0.0.1' });
      await result.current.join({ remoteAddrs: ['10.0.0.1:2377'], joinToken: 'SWMTKN-1-join' });
      await result.current.leave(true);
    });

    expect(initialiseSwarm).toHaveBeenCalledWith({ advertiseAddr: '10.0.0.1' });
    expect(joinSwarm).toHaveBeenCalledWith({ remoteAddrs: ['10.0.0.1:2377'], joinToken: 'SWMTKN-1-join' });
    expect(leaveSwarm).toHaveBeenCalledWith(true);
    // The token typed to join is not held either.
    expect(heldState(result.current)).not.toContain('SWMTKN-1-join');
  });

  // "A read that settles after the hook unmounts updates nothing."
  it('updates nothing once unmounted', async () => {
    let settle: (value: SwarmState) => void = () => undefined;
    fetchSwarmState.mockReturnValue(new Promise<SwarmState>((resolve) => (settle = resolve)));
    const { result, unmount } = renderHook(() => useSwarm());

    unmount();
    await act(async () => {
      settle(inactiveState());
      await Promise.resolve();
    });

    expect(result.current.state).toBeUndefined();
    expect(result.current.loaded).toBe(false);
  });
});
