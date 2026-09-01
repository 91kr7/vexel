import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';

// useVolumes re-reads on a bounded poll and on nothing the daemon pushes
// (use-volumes.md,
// plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1):
// the fetch is mocked, and the event subscription is watched so that reaching
// it at all fails.
const fetchVolumes = vi.fn();
let daemonListener: ((event: DaemonEvent) => void) | undefined;
const subscribeToDaemonEvents = vi.fn((listener: (event: DaemonEvent) => void) => {
  daemonListener = listener;
  return () => {
    daemonListener = undefined;
  };
});

vi.mock('../../src/data/volumes-client', () => ({
  fetchVolumes: (...args: unknown[]) => fetchVolumes(...args),
}));
vi.mock('../../src/data/event-stream', () => ({
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => subscribeToDaemonEvents(listener),
}));

const { useVolumes } = await import('../../src/data/use-volumes');

function daemonEvent(type: string): DaemonEvent {
  return { id: '1', timestamp: new Date().toISOString(), type, action: 'create' };
}

beforeEach(() => {
  fetchVolumes.mockReset();
  subscribeToDaemonEvents.mockClear();
  daemonListener = undefined;
});

describe('useVolumes', () => {
  // use-volumes.md — volumes starts empty and is replaced once the initial fetch resolves; loaded settles to true
  it('loads the volume list on mount and marks itself loaded', async () => {
    fetchVolumes.mockResolvedValue([{ name: 'vol-1', driver: 'local', mountpoint: '/data/vol-1', scope: 'local', createdAt: '', labels: {}, options: {}, mountedBy: [] }]);

    const { result } = renderHook(() => useVolumes());

    expect(result.current.volumes).toEqual([]);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.volumes).toHaveLength(1);
  });

  // use-volumes.md — "a daemon event triggers nothing here"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1, REQ-13)
  it('subscribes to no daemon event, and reads for none delivered', async () => {
    fetchVolumes.mockResolvedValue([]);
    const { result } = renderHook(() => useVolumes());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchVolumes.mockClear();

    expect(subscribeToDaemonEvents).not.toHaveBeenCalled();

    act(() => {
      for (const type of ['volume', 'container', 'image', 'network']) daemonListener?.(daemonEvent(type));
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchVolumes).not.toHaveBeenCalled();
  });

  // use-volumes.md — error carries the last fetch failure's message; cleared on the next successful fetch
  it('surfaces a fetch failure and clears it once a subsequent refresh succeeds', async () => {
    fetchVolumes.mockRejectedValueOnce(new Error('daemon unreachable'));
    const { result } = renderHook(() => useVolumes());
    await waitFor(() => expect(result.current.error).toBe('daemon unreachable'));

    fetchVolumes.mockResolvedValueOnce([]);
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
  });
});
