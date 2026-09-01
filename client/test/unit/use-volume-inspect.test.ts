import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';

// useVolumeInspect reads when `name` changes, on demand and on the reload
// signal, and for no daemon event at all (use-volume-inspect.md,
// plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1):
// the fetch is mocked, and the event subscription is watched so that reaching it
// at all fails.
const fetchVolumeInspect = vi.fn();
let daemonListener: ((event: DaemonEvent) => void) | undefined;
const subscribeToDaemonEvents = vi.fn((listener: (event: DaemonEvent) => void) => {
  daemonListener = listener;
  return () => {
    daemonListener = undefined;
  };
});

vi.mock('../../src/data/volumes-client', () => ({
  fetchVolumeInspect: (...args: unknown[]) => fetchVolumeInspect(...args),
}));
// Only the subscription is stood in for: the attribution rule that decides
// which events reach the hook is the real one (event-stream-client.md).
vi.mock('../../src/data/event-stream', async (importActual) => ({
  ...(await importActual<typeof import('../../src/data/event-stream')>()),
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => subscribeToDaemonEvents(listener),
}));

const { useVolumeInspect } = await import('../../src/data/use-volume-inspect');

// A volume is named by its name, which is what the daemon reports as its actor id.
const SHOWN_VOLUME = 'vexel-shown-volume';
const OTHER_VOLUME = 'vexel-other-volume';

function daemonEvent(type: string): DaemonEvent {
  return { id: '1', timestamp: new Date().toISOString(), type, action: 'create' };
}

function inspectPayload(name: string) {
  return { name, driver: 'local', mountpoint: `/data/${name}`, scope: 'local', createdAt: '', labels: {}, options: {}, mountedBy: [], raw: {} };
}

beforeEach(() => {
  fetchVolumeInspect.mockReset();
  subscribeToDaemonEvents.mockClear();
  daemonListener = undefined;
});

describe('useVolumeInspect', () => {
  // use-volume-inspect.md — returns an empty, not-loaded result while name is undefined
  it('performs no fetch and stays unloaded while no volume is selected', () => {
    const { result } = renderHook(() => useVolumeInspect(undefined));

    expect(result.current.inspect).toBeUndefined();
    expect(result.current.loaded).toBe(false);
    expect(fetchVolumeInspect).not.toHaveBeenCalled();
  });

  // use-volume-inspect.md — reads when name changes to a defined value
  it('fetches inspect data for the given name and refetches when the name changes', async () => {
    fetchVolumeInspect.mockImplementation((name: string) => Promise.resolve(inspectPayload(name)));
    const { result, rerender } = renderHook(({ name }) => useVolumeInspect(name), { initialProps: { name: 'vol-1' as string | undefined } });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(fetchVolumeInspect).toHaveBeenCalledWith('vol-1');

    fetchVolumeInspect.mockClear();
    rerender({ name: 'vol-2' });

    await waitFor(() => expect(fetchVolumeInspect).toHaveBeenCalledWith('vol-2'));
  });

  // use-volume-inspect.md — "A daemon event triggers nothing, so a volume changed elsewhere leaves the open
  // detail showing what it last read, and nothing on screen says so"
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal/REQ-1, REQ-2, REQ-13)
  it('subscribes to no daemon event, and reads for none delivered', async () => {
    fetchVolumeInspect.mockResolvedValue(inspectPayload(SHOWN_VOLUME));
    const { result } = renderHook(() => useVolumeInspect(SHOWN_VOLUME));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchVolumeInspect.mockClear();

    expect(subscribeToDaemonEvents).not.toHaveBeenCalled();

    act(() => {
      for (const type of ['container', 'image', 'volume', 'network']) {
        daemonListener?.(daemonEvent(type));
        daemonListener?.({ ...daemonEvent(type), actorId: OTHER_VOLUME });
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchVolumeInspect).not.toHaveBeenCalled();
  });
});
