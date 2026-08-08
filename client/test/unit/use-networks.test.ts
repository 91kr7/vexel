import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';

// useNetworks re-reads on a bounded poll and on every `network`/`container`
// daemon event (use-networks.md): the fetch and the event bus are mocked so
// the hook's own re-read triggers are the only thing under test.
const fetchNetworks = vi.fn();
let daemonListener: ((event: DaemonEvent) => void) | undefined;
const subscribeToDaemonEvents = vi.fn((listener: (event: DaemonEvent) => void) => {
  daemonListener = listener;
  return () => {
    daemonListener = undefined;
  };
});

vi.mock('../../src/data/networks-client', () => ({
  fetchNetworks: (...args: unknown[]) => fetchNetworks(...args),
}));
vi.mock('../../src/data/event-stream', () => ({
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => subscribeToDaemonEvents(listener),
}));

const { useNetworks } = await import('../../src/data/use-networks');

function daemonEvent(type: string): DaemonEvent {
  return { id: '1', timestamp: new Date().toISOString(), type, action: 'create' };
}

beforeEach(() => {
  fetchNetworks.mockReset();
  subscribeToDaemonEvents.mockClear();
  daemonListener = undefined;
});

describe('useNetworks', () => {
  // use-networks.md — networks starts empty and is replaced once the initial fetch resolves; loaded settles to true
  it('loads the network list on mount and marks itself loaded', async () => {
    fetchNetworks.mockResolvedValue([{ id: 'net-1', name: 'app-net', driver: 'bridge', scope: 'local', labels: {}, options: {}, attachedContainers: [] }]);

    const { result } = renderHook(() => useNetworks());

    expect(result.current.networks).toEqual([]);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.networks).toHaveLength(1);
  });

  // use-networks.md — re-reads on every `network` daemon event
  it('refreshes when a network daemon event arrives', async () => {
    fetchNetworks.mockResolvedValue([]);
    const { result } = renderHook(() => useNetworks());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchNetworks.mockClear();

    act(() => daemonListener?.(daemonEvent('network')));

    await waitFor(() => expect(fetchNetworks).toHaveBeenCalledTimes(1));
  });

  // use-networks.md — also re-reads on a `container` daemon event, since a container's own
  // attachments changing which networks list it
  it('refreshes when a container daemon event arrives', async () => {
    fetchNetworks.mockResolvedValue([]);
    const { result } = renderHook(() => useNetworks());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchNetworks.mockClear();

    act(() => daemonListener?.(daemonEvent('container')));

    await waitFor(() => expect(fetchNetworks).toHaveBeenCalledTimes(1));
  });

  // use-networks.md — only `network`/`container`-typed events matter here
  it('does not refresh for a daemon event of an unrelated type', async () => {
    fetchNetworks.mockResolvedValue([]);
    const { result } = renderHook(() => useNetworks());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchNetworks.mockClear();

    act(() => daemonListener?.(daemonEvent('volume')));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchNetworks).not.toHaveBeenCalled();
  });

  // use-networks.md — error carries the last fetch failure's message; cleared on the next successful fetch
  it('surfaces a fetch failure and clears it once a subsequent refresh succeeds', async () => {
    fetchNetworks.mockRejectedValueOnce(new Error('daemon unreachable'));
    const { result } = renderHook(() => useNetworks());
    await waitFor(() => expect(result.current.error).toBe('daemon unreachable'));

    fetchNetworks.mockResolvedValueOnce([]);
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
  });
});
