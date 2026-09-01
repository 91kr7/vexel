import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';

// useImages re-reads on a bounded poll and on nothing the daemon pushes
// (use-images.md,
// plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1):
// the fetch is mocked, and the event subscription is watched so that reaching
// it at all fails.
const fetchImages = vi.fn();
let daemonListener: ((event: DaemonEvent) => void) | undefined;
const subscribeToDaemonEvents = vi.fn((listener: (event: DaemonEvent) => void) => {
  daemonListener = listener;
  return () => {
    daemonListener = undefined;
  };
});

vi.mock('../../src/data/images-client', () => ({
  fetchImages: (...args: unknown[]) => fetchImages(...args),
}));
vi.mock('../../src/data/event-stream', () => ({
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => subscribeToDaemonEvents(listener),
}));

const { useImages } = await import('../../src/data/use-images');

function daemonEvent(type: string): DaemonEvent {
  return { id: '1', timestamp: new Date().toISOString(), type, action: 'create' };
}

beforeEach(() => {
  fetchImages.mockReset();
  subscribeToDaemonEvents.mockClear();
  daemonListener = undefined;
});

describe('useImages', () => {
  // use-images.md — images starts empty and is replaced once the initial fetch resolves; loaded settles to true
  it('loads the image list on mount and marks itself loaded', async () => {
    fetchImages.mockResolvedValue([{ id: 'img-1', shortId: 'img-1', tags: ['a:1'], platforms: [], sizeBytes: 1, createdAt: '2024-01-01T00:00:00Z' }]);

    const { result } = renderHook(() => useImages());

    expect(result.current.images).toEqual([]);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.images).toHaveLength(1);
  });

  // use-images.md — "a daemon event triggers nothing here"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1, REQ-13)
  it('subscribes to no daemon event, and reads for none delivered', async () => {
    fetchImages.mockResolvedValue([]);
    const { result } = renderHook(() => useImages());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchImages.mockClear();

    expect(subscribeToDaemonEvents).not.toHaveBeenCalled();

    act(() => {
      for (const type of ['image', 'container', 'volume', 'network']) daemonListener?.(daemonEvent(type));
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchImages).not.toHaveBeenCalled();
  });

  // use-images.md — error carries the last fetch failure's message; cleared on the next successful fetch
  it('surfaces a fetch failure and clears it once a subsequent refresh succeeds', async () => {
    fetchImages.mockRejectedValueOnce(new Error('daemon unreachable'));
    const { result } = renderHook(() => useImages());
    await waitFor(() => expect(result.current.error).toBe('daemon unreachable'));

    fetchImages.mockResolvedValueOnce([]);
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeUndefined());
  });
});
