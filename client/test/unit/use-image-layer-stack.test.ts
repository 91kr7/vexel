import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';

// useImageLayerStack re-reads when `id` changes, on demand, and for no daemon
// event at all (use-image-layer-stack.md,
// plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1):
// the fetch is mocked, and the event subscription is watched so that reaching it
// at all fails.
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

  // use-image-layer-stack.md — "a daemon event triggers nothing here"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1, REQ-13)
  it('subscribes to no daemon event, and reads for none delivered', async () => {
    fetchImageLayerStack.mockResolvedValue(stackOf('image-1'));
    const { result } = renderHook(() => useImageLayerStack('image-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchImageLayerStack.mockClear();

    expect(subscribeToDaemonEvents).not.toHaveBeenCalled();

    act(() => {
      for (const type of ['image', 'container', 'volume', 'network']) daemonListener?.(daemonEvent(type));
    });
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
