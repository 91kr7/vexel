import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/live-channel';

// useNetworks re-reads on a bounded poll and on nothing the daemon pushes
// (use-networks.md,
// plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1):
// the fetch is mocked, and the event subscription is watched so that reaching
// it at all fails.
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
vi.mock('../../src/data/live-channel', () => ({
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

  // use-networks.md — "a daemon event triggers nothing here"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1, REQ-13)
  it('subscribes to no daemon event, and reads for none delivered', async () => {
    fetchNetworks.mockResolvedValue([]);
    const { result } = renderHook(() => useNetworks());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchNetworks.mockClear();

    expect(subscribeToDaemonEvents).not.toHaveBeenCalled();

    act(() => {
      for (const type of ['network', 'container', 'image', 'volume']) daemonListener?.(daemonEvent(type));
    });
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
