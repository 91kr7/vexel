import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/live-channel';

// useNetworkInspect reads when `id` changes, on demand and on the reload signal,
// and for no daemon event at all (use-network-inspect.md,
// plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1):
// the fetch is mocked, and the event subscription is watched so that reaching it
// at all fails.
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
// Only the subscription is stood in for: the attribution rule that decides
// which events reach the hook is the real one (live-channel/specs/live-channel-client.md).
vi.mock('../../src/data/live-channel', async (importActual) => ({
  ...(await importActual<typeof import('../../src/data/live-channel')>()),
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => subscribeToDaemonEvents(listener),
}));

const { useNetworkInspect } = await import('../../src/data/use-network-inspect');

// Identifiers of the shape the daemon reports for a network.
const SHOWN_NETWORK = '9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0';
const OTHER_NETWORK = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

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

  // use-network-inspect.md — "A daemon event triggers nothing, so a network changed elsewhere leaves the open
  // detail showing what it last read, and nothing on screen says so"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1, REQ-2, REQ-13)
  it('subscribes to no daemon event, and reads for none delivered', async () => {
    fetchNetworkInspect.mockResolvedValue(inspectPayload(SHOWN_NETWORK));
    const { result } = renderHook(() => useNetworkInspect(SHOWN_NETWORK));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchNetworkInspect.mockClear();

    expect(subscribeToDaemonEvents).not.toHaveBeenCalled();

    act(() => {
      for (const type of ['container', 'image', 'volume', 'network']) {
        daemonListener?.(daemonEvent(type));
        daemonListener?.({ ...daemonEvent(type), actorId: OTHER_NETWORK });
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchNetworkInspect).not.toHaveBeenCalled();
  });
});
