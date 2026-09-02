import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/live-channel';

// useImageInspect reads when `id` changes, on demand and on the reload signal,
// and for no daemon event at all (use-image-inspect.md,
// plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1):
// the fetch is mocked, and the event subscription is watched so that reaching it
// at all fails.
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
// Only the subscription is stood in for: the attribution rule that decides
// which events reach the hook is the real one (live-channel/specs/live-channel-client.md).
vi.mock('../../src/data/live-channel', async (importActual) => ({
  ...(await importActual<typeof import('../../src/data/live-channel')>()),
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => subscribeToDaemonEvents(listener),
}));

const { useImageInspect } = await import('../../src/data/use-image-inspect');

// Identifiers of the shape the daemon reports, so the attribution rule is exercised on what it
// actually receives rather than on two short labels.
const SHOWN_IMAGE = 'sha256:9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0';
const OTHER_IMAGE = 'sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

function imagePayload(id: string) {
  return { id, tags: [], platforms: [], sizeBytes: 0, createdAt: '', entrypoint: [], command: [], env: [], labels: {}, exposedPorts: [], history: [], raw: {} };
}

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

  // use-image-inspect.md — "A daemon event triggers nothing, so a image changed elsewhere leaves the open
  // detail showing what it last read, and nothing on screen says so"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1, REQ-2, REQ-13)
  it('subscribes to no daemon event, and reads for none delivered', async () => {
    fetchImageInspect.mockResolvedValue(imagePayload(SHOWN_IMAGE));
    const { result } = renderHook(() => useImageInspect(SHOWN_IMAGE));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchImageInspect.mockClear();

    expect(subscribeToDaemonEvents).not.toHaveBeenCalled();

    act(() => {
      for (const type of ['container', 'image', 'volume', 'network']) {
        daemonListener?.(daemonEvent(type));
        daemonListener?.({ ...daemonEvent(type), actorId: OTHER_IMAGE });
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchImageInspect).not.toHaveBeenCalled();
  });
});
