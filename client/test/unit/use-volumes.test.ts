import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';

// useVolumes re-reads on a bounded poll and on every `volume`/`container`
// daemon event (use-volumes.md): the fetch and the event bus are mocked so
// the hook's own re-read triggers are the only thing under test.
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

  // use-volumes.md — re-reads on every `volume` daemon event
  it('refreshes when a volume daemon event arrives', async () => {
    fetchVolumes.mockResolvedValue([]);
    const { result } = renderHook(() => useVolumes());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchVolumes.mockClear();

    act(() => daemonListener?.(daemonEvent('volume')));

    await waitFor(() => expect(fetchVolumes).toHaveBeenCalledTimes(1));
  });

  // use-volumes.md — also re-reads on a `container` daemon event, since a container's own mounts
  // changing which volumes it mounts affects the volume list's mountedBy
  it('refreshes when a container daemon event arrives', async () => {
    fetchVolumes.mockResolvedValue([]);
    const { result } = renderHook(() => useVolumes());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchVolumes.mockClear();

    act(() => daemonListener?.(daemonEvent('container')));

    await waitFor(() => expect(fetchVolumes).toHaveBeenCalledTimes(1));
  });

  // use-volumes.md — only `volume`/`container`-typed events matter here
  it('does not refresh for a daemon event of an unrelated type', async () => {
    fetchVolumes.mockResolvedValue([]);
    const { result } = renderHook(() => useVolumes());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchVolumes.mockClear();

    act(() => daemonListener?.(daemonEvent('image')));

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
