import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { SwarmServiceDetail } from '../../src/data/swarm-client';

// The full reading of the opened swarm service with its tasks
// (swarm/specs/use-swarm-service-detail.md, REQ-82). The data client is mocked:
// what is under test is the hook's own decisions — what it reads, when it
// re-reads, and what it refuses to store.
const fetchSwarmServiceDetail = vi.fn();

vi.mock('../../src/data/swarm-client', () => ({
  fetchSwarmServiceDetail: (id: string) => fetchSwarmServiceDetail(id),
}));

// Stands in for the browser's EventSource, the hook's push channel.
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((message: { data: string }) => void) | null = null;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener() {}

  close() {}

  emitDaemonEvent(type: string, action: string) {
    this.onmessage?.({
      data: JSON.stringify({ id: `${type}-${action}-${Math.random()}`, timestamp: '2026-08-09T10:00:00.000Z', type, action }),
    });
  }
}

function daemonStream(): FakeEventSource {
  return FakeEventSource.instances[0]!;
}

const { useSwarmServiceDetail } = await import('../../src/data/use-swarm-service-detail');
const { notifyActiveContextChanged } = await import('../../src/data/active-context');

function detailOf(name: string): SwarmServiceDetail {
  return {
    service: {
      id: `id-of-${name}`,
      name,
      image: 'alpine:3.20',
      mode: 'replicated',
      ports: [],
      version: 1,
    },
    env: ['MODE=production'],
    labels: {},
    tasks: [{ id: `task-of-${name}`, state: 'running', desiredState: 'running' }],
    raw: {},
  };
}

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
  fetchSwarmServiceDetail.mockReset();
  fetchSwarmServiceDetail.mockImplementation((id: string) => Promise.resolve(detailOf(id)));
});

afterEach(cleanup);

describe('useSwarmServiceDetail (swarm/specs/use-swarm-service-detail.md)', () => {
  // "serviceId absent -> nothing is read; detail is undefined, loaded false, error empty"
  it('reads nothing while no service is open', async () => {
    const { result } = renderHook(() => useSwarmServiceDetail(undefined));

    await Promise.resolve();
    expect(fetchSwarmServiceDetail).not.toHaveBeenCalled();
    expect(result.current.detail).toBeUndefined();
    expect(result.current.loaded).toBe(false);
    expect(result.current.error).toBeUndefined();
  });

  // "detail — the service, its environment, its labels, its tasks and the daemon's own payload";
  // "loaded — true once the read for the current serviceId has settled"
  it('reads the opened service with its tasks', async () => {
    const { result } = renderHook(() => useSwarmServiceDetail('svc-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchSwarmServiceDetail).toHaveBeenCalledWith('svc-1');
    expect(result.current.detail?.tasks).toHaveLength(1);
    expect(result.current.error).toBeUndefined();
  });

  // "changing serviceId drops the previous detail immediately: the panel never shows one service's
  // tasks under another service's name"
  it('drops the previous reading the moment another service is opened', async () => {
    let settleSecond: (value: SwarmServiceDetail) => void = () => undefined;
    const { result, rerender } = renderHook(({ id }: { id: string }) => useSwarmServiceDetail(id), { initialProps: { id: 'svc-1' } });
    await waitFor(() => expect(result.current.detail?.service.name).toBe('svc-1'));

    fetchSwarmServiceDetail.mockReturnValue(new Promise<SwarmServiceDetail>((resolve) => (settleSecond = resolve)));
    rerender({ id: 'svc-2' });

    expect(result.current.detail).toBeUndefined();
    await act(async () => {
      settleSecond(detailOf('svc-2'));
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.detail?.service.name).toBe('svc-2'));
  });

  // "An answer that is not the shape it promises is a failed read: a payload without a service, or
  // without a task list and an environment list, is reported through error and never stored"
  it.each([
    ['no service', { env: [], labels: {}, tasks: [], raw: {} }],
    ['no task list', { service: detailOf('svc-1').service, env: [], labels: {}, raw: {} }],
    ['no environment list', { service: detailOf('svc-1').service, labels: {}, tasks: [], raw: {} }],
  ])('treats a payload with %s as a failed read', async (_name, payload) => {
    fetchSwarmServiceDetail.mockResolvedValue(payload as unknown as SwarmServiceDetail);

    const { result } = renderHook(() => useSwarmServiceDetail('svc-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBeTruthy();
    expect(result.current.detail).toBeUndefined();
  });

  // "error? — the message of the last failed read; cleared by the next successful one"
  it('reports a failed read and clears it on the next successful one', async () => {
    fetchSwarmServiceDetail.mockRejectedValueOnce(new Error('This node is not a swarm manager.'));
    const { result } = renderHook(() => useSwarmServiceDetail('svc-1'));

    await waitFor(() => expect(result.current.error).toBe('This node is not a swarm manager.'));
    expect(result.current.loaded).toBe(true);

    fetchSwarmServiceDetail.mockImplementation((id: string) => Promise.resolve(detailOf(id)));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
    expect(result.current.detail?.service.name).toBe('svc-1');
  });

  // "It re-reads on every service daemon event while a service is open, so the task list follows the
  // cluster converging."
  it('re-reads when a service daemon event arrives', async () => {
    const { result } = renderHook(() => useSwarmServiceDetail('svc-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => daemonStream().emitDaemonEvent('service', 'update'));

    await waitFor(() => expect(fetchSwarmServiceDetail).toHaveBeenCalledTimes(2));
  });

  // "It re-reads on the active-context broadcast (REQ-93)."
  it('re-reads when another context becomes active', async () => {
    const { result } = renderHook(() => useSwarmServiceDetail('svc-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => notifyActiveContextChanged());

    await waitFor(() => expect(fetchSwarmServiceDetail).toHaveBeenCalledTimes(2));
  });

  // "A read that settles after the hook unmounts ... updates nothing."
  it('updates nothing once unmounted', async () => {
    let settle: (value: SwarmServiceDetail) => void = () => undefined;
    fetchSwarmServiceDetail.mockReturnValue(new Promise<SwarmServiceDetail>((resolve) => (settle = resolve)));
    const { result, unmount } = renderHook(() => useSwarmServiceDetail('svc-1'));

    unmount();
    await act(async () => {
      settle(detailOf('svc-1'));
      await Promise.resolve();
    });

    expect(result.current.detail).toBeUndefined();
  });
});
