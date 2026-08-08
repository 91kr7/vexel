import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';

// useImageLayerStack re-reads when `id` changes and on every `image` daemon event
// (use-image-layer-stack.md): the fetch and the event bus are mocked so the hook's
// own re-read triggers are the only thing under test.
const fetchImageLayerStack = vi.fn();
let daemonListener: ((event: DaemonEvent) => void) | undefined;
const subscribeToDaemonEvents = vi.fn((listener: (event: DaemonEvent) => void) => {
  daemonListener = listener;
  return () => {
    daemonListener = undefined;
  };
});

vi.mock('../../src/data/image-layers-client', () => ({
  fetchImageLayerStack: (...args: unknown[]) => fetchImageLayerStack(...args),
}));
vi.mock('../../src/data/event-stream', () => ({
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => subscribeToDaemonEvents(listener),
}));

const { useImageLayerStack } = await import('../../src/data/use-image-layers');

function daemonEvent(type: string): DaemonEvent {
  return { id: '1', timestamp: new Date().toISOString(), type, action: 'create' };
}

function stackOf(id: string) {
  return { imageId: id, layers: [] };
}

beforeEach(() => {
  fetchImageLayerStack.mockReset();
  subscribeToDaemonEvents.mockClear();
  daemonListener = undefined;
});

describe('useImageLayerStack', () => {
  // use-image-layer-stack.md — performs no fetch while id is undefined (no image selected / explorer closed)
  it('performs no fetch and stays unloaded while no image id is given', () => {
    const { result } = renderHook(() => useImageLayerStack(undefined));

    expect(result.current.stack).toBeUndefined();
    expect(result.current.loaded).toBe(false);
    expect(fetchImageLayerStack).not.toHaveBeenCalled();
  });

  // use-image-layer-stack.md — re-reads when id changes
  it('fetches the layer stack for the given id and refetches when the id changes', async () => {
    fetchImageLayerStack.mockImplementation((id: string) => Promise.resolve(stackOf(id)));
    const { result, rerender } = renderHook(({ id }) => useImageLayerStack(id), { initialProps: { id: 'image-1' as string | undefined } });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchImageLayerStack).toHaveBeenCalledWith('image-1');

    fetchImageLayerStack.mockClear();
    rerender({ id: 'image-2' });

    await waitFor(() => expect(fetchImageLayerStack).toHaveBeenCalledWith('image-2'));
  });

  // use-image-layer-stack.md — re-reads whenever an image-typed daemon event arrives
  it('refreshes the current id when an image daemon event arrives', async () => {
    fetchImageLayerStack.mockResolvedValue(stackOf('image-1'));
    const { result } = renderHook(() => useImageLayerStack('image-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchImageLayerStack.mockClear();

    act(() => daemonListener?.(daemonEvent('image')));

    await waitFor(() => expect(fetchImageLayerStack).toHaveBeenCalledWith('image-1'));
  });

  // use-image-layer-stack.md — only image-typed events trigger a re-read
  it('does not refresh for a daemon event of an unrelated type', async () => {
    fetchImageLayerStack.mockResolvedValue(stackOf('image-1'));
    const { result } = renderHook(() => useImageLayerStack('image-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchImageLayerStack.mockClear();

    act(() => daemonListener?.(daemonEvent('volume')));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchImageLayerStack).not.toHaveBeenCalled();
  });

  // use-image-layer-stack.md — error carries the last fetch failure's message
  it('reports the fetch failure message as error', async () => {
    fetchImageLayerStack.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useImageLayerStack('image-1'));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.error).toBe('boom');
  });
});
