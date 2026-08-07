import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';

// useImageInspect re-reads when `id` changes and on every `image` daemon event
// (use-image-inspect.md): the fetch and the event bus are mocked so the hook's
// own re-read triggers are the only thing under test.
const fetchImageInspect = vi.fn();
let daemonListener: ((event: DaemonEvent) => void) | undefined;
const subscribeToDaemonEvents = vi.fn((listener: (event: DaemonEvent) => void) => {
  daemonListener = listener;
  return () => {
    daemonListener = undefined;
  };
});

vi.mock('../../src/data/images-client', () => ({
  fetchImageInspect: (...args: unknown[]) => fetchImageInspect(...args),
}));
vi.mock('../../src/data/event-stream', () => ({
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => subscribeToDaemonEvents(listener),
}));

const { useImageInspect } = await import('../../src/data/use-image-inspect');

function daemonEvent(type: string): DaemonEvent {
  return { id: '1', timestamp: new Date().toISOString(), type, action: 'create' };
}

beforeEach(() => {
  fetchImageInspect.mockReset();
  subscribeToDaemonEvents.mockClear();
  daemonListener = undefined;
});

describe('useImageInspect', () => {
  // use-image-inspect.md — performs no fetch and returns an empty, unloaded result while id is undefined
  it('performs no fetch and stays unloaded while no image is selected', () => {
    const { result } = renderHook(() => useImageInspect(undefined));

    expect(result.current.inspect).toBeUndefined();
    expect(result.current.loaded).toBe(false);
    expect(fetchImageInspect).not.toHaveBeenCalled();
  });

  // use-image-inspect.md — re-reads when id changes
  it('fetches inspect data for the given id and refetches when the id changes', async () => {
    fetchImageInspect.mockImplementation((id: string) => Promise.resolve({ id, tags: [], platforms: [], sizeBytes: 0, createdAt: '', entrypoint: [], command: [], env: [], labels: {}, exposedPorts: [], history: [], raw: {} }));
    const { result, rerender } = renderHook(({ id }) => useImageInspect(id), { initialProps: { id: 'image-1' } });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchImageInspect).toHaveBeenCalledWith('image-1');

    fetchImageInspect.mockClear();
    rerender({ id: 'image-2' });

    await waitFor(() => expect(fetchImageInspect).toHaveBeenCalledWith('image-2'));
  });

  // use-image-inspect.md — re-reads whenever an `image`-typed daemon event arrives
  it('refreshes the current id when an image daemon event arrives', async () => {
    fetchImageInspect.mockResolvedValue({ id: 'image-1', tags: [], platforms: [], sizeBytes: 0, createdAt: '', entrypoint: [], command: [], env: [], labels: {}, exposedPorts: [], history: [], raw: {} });
    const { result } = renderHook(() => useImageInspect('image-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchImageInspect.mockClear();

    act(() => daemonListener?.(daemonEvent('image')));

    await waitFor(() => expect(fetchImageInspect).toHaveBeenCalledWith('image-1'));
  });

  // use-image-inspect.md — only `image`-typed events trigger a re-read
  it('does not refresh for a daemon event of an unrelated type', async () => {
    fetchImageInspect.mockResolvedValue({ id: 'image-1', tags: [], platforms: [], sizeBytes: 0, createdAt: '', entrypoint: [], command: [], env: [], labels: {}, exposedPorts: [], history: [], raw: {} });
    const { result } = renderHook(() => useImageInspect('image-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchImageInspect.mockClear();

    act(() => daemonListener?.(daemonEvent('volume')));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchImageInspect).not.toHaveBeenCalled();
  });
});
