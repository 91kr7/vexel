import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';

// useImages re-reads on a bounded poll and on every `image` daemon event
// (use-images.md): the fetch and the event bus are mocked so the hook's own
// filtering decision is the only thing under test.
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

  // use-images.md — re-reads whenever an `image`-typed daemon event arrives, so a pull/push/tag/untag/remove/prune is reflected
  it('refreshes when an image daemon event arrives', async () => {
    fetchImages.mockResolvedValue([]);
    const { result } = renderHook(() => useImages());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchImages.mockClear();

    act(() => daemonListener?.(daemonEvent('image')));

    await waitFor(() => expect(fetchImages).toHaveBeenCalledTimes(1));
  });

  // use-images.md — unlike the container list, no action/type is excluded: only `image`-typed events matter here
  it('does not refresh for a daemon event of an unrelated type', async () => {
    fetchImages.mockResolvedValue([]);
    const { result } = renderHook(() => useImages());
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchImages.mockClear();

    act(() => daemonListener?.(daemonEvent('container')));

    // No refresh should have been scheduled for an unrelated object type.
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
