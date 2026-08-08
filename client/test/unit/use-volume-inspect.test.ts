import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import type { DaemonEvent } from '../../src/data/event-stream';

// useVolumeInspect re-reads when `name` changes and on every `volume`/
// `container` daemon event (use-volume-inspect.md): the fetch and the event
// bus are mocked so the hook's own re-read triggers are the only thing under
// test.
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
vi.mock('../../src/data/event-stream', () => ({
  subscribeToDaemonEvents: (listener: (event: DaemonEvent) => void) => subscribeToDaemonEvents(listener),
}));

const { useVolumeInspect } = await import('../../src/data/use-volume-inspect');

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

  // use-volume-inspect.md — re-reads on every `volume` daemon event
  it('refreshes the current selection when a volume daemon event arrives', async () => {
    fetchVolumeInspect.mockResolvedValue(inspectPayload('vol-1'));
    const { result } = renderHook(() => useVolumeInspect('vol-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchVolumeInspect.mockClear();

    act(() => daemonListener?.(daemonEvent('volume')));

    await waitFor(() => expect(fetchVolumeInspect).toHaveBeenCalledWith('vol-1'));
  });

  // use-volume-inspect.md — also re-reads on a `container` daemon event
  it('refreshes the current selection when a container daemon event arrives', async () => {
    fetchVolumeInspect.mockResolvedValue(inspectPayload('vol-1'));
    const { result } = renderHook(() => useVolumeInspect('vol-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchVolumeInspect.mockClear();

    act(() => daemonListener?.(daemonEvent('container')));

    await waitFor(() => expect(fetchVolumeInspect).toHaveBeenCalledWith('vol-1'));
  });

  // use-volume-inspect.md — only `volume`/`container`-typed events trigger a re-read
  it('does not refresh for a daemon event of an unrelated type', async () => {
    fetchVolumeInspect.mockResolvedValue(inspectPayload('vol-1'));
    const { result } = renderHook(() => useVolumeInspect('vol-1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    fetchVolumeInspect.mockClear();

    act(() => daemonListener?.(daemonEvent('image')));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchVolumeInspect).not.toHaveBeenCalled();
  });
});
