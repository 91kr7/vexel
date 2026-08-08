import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';

// useNetworkInspect re-reads when `id` changes and on every `network`/
// `container` daemon event (use-network-inspect.md): the fetch and the event
// bus are mocked so the hook's own re-read triggers are the only thing under
// test.
const fetchNetworkInspect = vi.fn();
let daemonListener: ((event: DaemonEvent) => void) | undefined;
const subscribeToDaemonEvents = vi.fn((listener: (event: DaemonEvent) => void) => {
  daemonListener = listener;
  return () => {
    daemonListener = undefined;
  };
});

vi.mock('../../src/data/networks-client', () => ({
  fetchNetworkInspect: (...args: unknown[]) => fetchNetworkInspect(...args),
}));
vi.mock('../../src/data/event-stream', () => ({
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => subscribeToDaemonEvents(listener),
}));

const { useNetworkInspect } = await import('../../src/data/use-network-inspect');

function daemonEvent(type: string): DaemonEvent {
  return { id: '1', timestamp: new Date().toISOString(), type, action: 'create' };
}

function inspectPayload(id: string) {
  return { id, name: id, driver: 'bridge', scope: 'local', labels: {}, options: {}, attachedContainers: [], raw: {} };
}

beforeEach(() => {
  fetchNetworkInspect.mockReset();
  subscribeToDaemonEvents.mockClear();
  daemonListener = undefined;
});

describe('useNetworkInspect', () => {
  // use-network-inspect.md — returns an empty, not-loaded result while id is undefined
  it('performs no fetch and stays unloaded while no network is selected', () => {
    const { result } = renderHook(() => useNetworkInspect(undefined));

    expect(result.current.inspect).toBeUndefined();
    expect(result.current.loaded).toBe(false);
    expect(fetchNetworkInspect).not.toHaveBeenCalled();
  });

  // use-network-inspect.md — reads when id changes to a defined value
  it('fetches inspect data for the given id and refetches when the id changes', async () => {
    fetchNetworkInspect.mockImplementation((id: string) => Promise.resolve(inspectPayload(id)));
    const { result, rerender } = renderHook(({ id }) => useNetworkInspect(id), { initialProps: { id: 'net-1' as string | undefined } });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchNetworkInspect).toHaveBeenCalledWith('net-1');

    fetchNetworkInspect.mockClear();
    rerender({ id: 'net-2' });

    await waitFor(() => expect(fetchNetworkInspect).toHaveBeenCalledWith('net-2'));
  });

  // use-network-inspect.md — re-reads on every `network` daemon event
  it('refreshes the current selection when a network daemon event arrives', async () => {
    fetchNetworkInspect.mockResolvedValue(inspectPayload('net-1'));
    const { result } = renderHook(() => useNetworkInspect('net-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchNetworkInspect.mockClear();

    act(() => daemonListener?.(daemonEvent('network')));

    await waitFor(() => expect(fetchNetworkInspect).toHaveBeenCalledWith('net-1'));
  });

  // use-network-inspect.md — also re-reads on a `container` daemon event
  it('refreshes the current selection when a container daemon event arrives', async () => {
    fetchNetworkInspect.mockResolvedValue(inspectPayload('net-1'));
    const { result } = renderHook(() => useNetworkInspect('net-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchNetworkInspect.mockClear();

    act(() => daemonListener?.(daemonEvent('container')));

    await waitFor(() => expect(fetchNetworkInspect).toHaveBeenCalledWith('net-1'));
  });

  // use-network-inspect.md — only `network`/`container`-typed events trigger a re-read
  it('does not refresh for a daemon event of an unrelated type', async () => {
    fetchNetworkInspect.mockResolvedValue(inspectPayload('net-1'));
    const { result } = renderHook(() => useNetworkInspect('net-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchNetworkInspect.mockClear();

    act(() => daemonListener?.(daemonEvent('volume')));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchNetworkInspect).not.toHaveBeenCalled();
  });
});
